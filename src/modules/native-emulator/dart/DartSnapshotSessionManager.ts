/**
 * DartSnapshotSessionManager — concurrency-safe lifecycle for Dart AOT
 * snapshot sessions.
 *
 * Mirrors {@link SessionManager} from the parent native-emulator module.
 * Every dynamic dart-inspector tool (`dart_load_snapshot`,
 * `dart_list_functions`, `dart_call_graph`, `dart_call_function`,
 * `dart_inspect_object_pool`, `dart_trace_execution`) otherwise constructs a
 * fresh `DartAotLoader` and re-parses `libapp.so` (10–40 MB, hundreds of
 * clusters) on each call. A multi-step reversing session re-runs that parse
 * on every tool invocation; this manager parses once and hands the cached
 * {@link LoadedSnapshot} to subsequent calls.
 *
 * Differences from the native-emulator SessionManager:
 *  - A Dart snapshot is pure parsed data (no mapped `.so` bytes, guest stack,
 *    or JNI object table), so destroying a session only drops the reference —
 *    there is no `dispose()` per entry (GC reclaims the snapshot).
 *  - `DartAotExecutor` instances are *not* cached here: an executor owns
 *    mutable CPU registers and must not be shared across concurrent tool
 *    calls. Callers get the cached snapshot and build a fresh executor per
 *    call via `DartAotExecutor.loadFromSnapshot`.
 *
 * Sessions still expire: an AI that forgets to destroy a session would
 * otherwise pin tens of MB of parsed clusters per orphan. An idle sweep
 * (modelled on AutoPruner's unref'd interval) reaps sessions untouched for
 * longer than the TTL.
 */
import { randomUUID } from 'node:crypto';

import { DART_SESSION_IDLE_TTL_MS, DART_SESSION_SWEEP_MS, DART_MAX_SESSIONS } from '@src/constants';
import { DartAotLoader, type LoadedSnapshot } from './DartAotLoader';

/** A live Dart snapshot session: its id, the source path, the parsed snapshot, and timestamps. */
export interface DartSnapshotSession {
  readonly id: string;
  /** Absolute path the snapshot was parsed from (APK or libapp.so). */
  readonly path: string;
  readonly snapshot: LoadedSnapshot;
  readonly createdAt: number;
  lastUsedAt: number;
}

/** Session metadata exposed to callers (never leaks the snapshot instance). */
export interface DartSessionInfo {
  id: string;
  path: string;
  createdAt: number;
  lastUsedAt: number;
}

export interface DartSnapshotSessionManagerOptions {
  /** Idle threshold before an untouched session is swept (ms). */
  idleTtlMs?: number;
  /** Sweep interval (ms). */
  sweepIntervalMs?: number;
  /** Max concurrent sessions; createSession throws once exceeded. */
  maxSessions?: number;
}

export class DartSnapshotSessionManager {
  private readonly sessions = new Map<string, DartSnapshotSession>();
  private readonly idleTtlMs: number;
  private readonly sweepIntervalMs: number;
  private readonly maxSessions: number;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: DartSnapshotSessionManagerOptions = {}) {
    this.idleTtlMs = options.idleTtlMs ?? DART_SESSION_IDLE_TTL_MS;
    this.sweepIntervalMs = options.sweepIntervalMs ?? DART_SESSION_SWEEP_MS;
    this.maxSessions = options.maxSessions ?? DART_MAX_SESSIONS;
    this.startSweep();
  }

  /**
   * Parse `libapp.so` (or an APK) and cache the resulting snapshot under a
   * fresh session id. Throws once `maxSessions` is reached so a runaway
   * caller cannot exhaust memory. An optional `loader` injection point is
   * exposed for tests (so a mock loader can stand in for the real parse).
   */
  async createSession(path: string, loader?: DartAotLoader): Promise<DartSnapshotSession> {
    if (this.sessions.size >= this.maxSessions) {
      throw new Error(
        `Dart snapshot session limit reached (${this.maxSessions}); destroy an existing session first`,
      );
    }
    const usedLoader = loader ?? new DartAotLoader();
    const snapshot = await usedLoader.loadSnapshot(path);
    const now = Date.now();
    const session: DartSnapshotSession = {
      id: randomUUID(),
      path,
      snapshot,
      createdAt: now,
      lastUsedAt: now,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  /** Look up a session, refreshing its lastUsedAt; undefined when unknown. */
  getSession(id: string): DartSnapshotSession | undefined {
    const session = this.sessions.get(id);
    if (session) session.lastUsedAt = Date.now();
    return session;
  }

  /** Look up a session, refreshing its lastUsedAt; throws when unknown. */
  requireSession(id: string): DartSnapshotSession {
    const session = this.getSession(id);
    if (!session) {
      throw new Error(`Unknown dart snapshot session: ${id}`);
    }
    return session;
  }

  /** Destroy a session; returns whether it existed. */
  destroySession(id: string): boolean {
    return this.sessions.delete(id);
  }

  /** List session metadata without exposing the underlying snapshots. */
  listSessions(): DartSessionInfo[] {
    const infos: DartSessionInfo[] = [];
    for (const s of this.sessions.values()) {
      infos.push({ id: s.id, path: s.path, createdAt: s.createdAt, lastUsedAt: s.lastUsedAt });
    }
    return infos;
  }

  /** Current live session count. */
  count(): number {
    return this.sessions.size;
  }

  /** Stop the sweep timer and drop every session. Idempotent. */
  dispose(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    this.sessions.clear();
  }

  private startSweep(): void {
    this.sweepTimer = setInterval(() => this.sweep(), this.sweepIntervalMs);
    // Don't keep the event loop (and thus the process) alive for the sweep.
    if (this.sweepTimer.unref) this.sweepTimer.unref();
  }

  /** Reap sessions whose last use is older than the idle TTL. */
  private sweep(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastUsedAt >= this.idleTtlMs) {
        this.sessions.delete(id);
      }
    }
  }
}
