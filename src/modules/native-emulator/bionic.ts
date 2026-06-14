/**
 * bionic — JS-implemented Android libc (bionic) stubs for the emulator.
 *
 * When an emulated `.so` calls an external libc symbol (malloc/memcpy/strlen/…),
 * the symbol's PLT/GOT target is registered as a host stub via
 * `CpuEngine.registerHostFunction`. The engine then runs the JS implementation
 * with the AAPCS argument registers (x0..x7) and writes the return value to x0,
 * instead of fetching guest instructions there — bridging guest code to a libc
 * we never actually load.
 *
 * Stubs are installed by address so callers can place them anywhere they route
 * imports to. Only the entries present in `addrs` are registered.
 */
import type { CpuEngine, HostContext } from './CpuEngine';
import { getReverseEngineeringConfig } from '@utils/reverseEngineeringConfig';
import {
  formatGuestCString,
  readGuestCString as readCString,
  readGuestCStringBytes,
  utf8ByteLength,
  writeGuestCString,
} from './c-strings';

/** Minimal memory-mapping surface bionic needs for heap-backed libc stubs. */
export interface BionicMemoryMapper {
  mapMemory(addr: number, size: number): void;
  lookupSymbol?(name: string): number | undefined;
  bindImportStub?(name: string, fn: (ctx: HostContext) => bigint | number | void): number;
}

/** Guest addresses to bind each bionic stub to (omit any you don't need). */
export interface BionicStubAddresses {
  strlen?: number;
  memcpy?: number;
  memset?: number;
  malloc?: number;
  free?: number;
}

/**
 * Injectable behaviour for the stdio/logging stubs. The virtual file system lets
 * a caller model "what files exist on the device" — exactly the question
 * anti-tamper code (RootBeer's exists()/fopen, Frida-server path probes) asks. An
 * empty/absent `files` map means a clean device: every fopen returns NULL.
 */
export interface BionicOptions {
  /**
   * Virtual file system for fopen/fread: absolute path → file contents. A path
   * present here "exists" (fopen returns a non-NULL FILE*); any other path fails
   * (fopen returns NULL), modelling a device where the artifact is absent.
   */
  files?: Map<string, Uint8Array>;
  /**
   * Sink for __android_log_print: receives (priority, tag, message). Default:
   * discard. Lets a caller observe what a detection routine logs.
   */
  onLog?: (priority: number, tag: string, message: string) => void;
  /** Sink for stdout-style stdio calls (`puts`, `printf`, stdout `fprintf`). */
  onStdout?: (text: string) => void;
  /** Sink for stderr-style stdio calls (`fprintf(stderr, ...)`). */
  onStderr?: (text: string) => void;
}

/** Bump-allocator heap base — distinct from typical code/data vaddrs. */
const HEAP_BASE = 0x100000;
/** Allocation granularity (bytes); keeps returned pointers naturally aligned. */
const HEAP_ALIGN = 16;
/** Default emulated page size returned by libc/sysconf imports. */
const PAGE_SIZE = getReverseEngineeringConfig().nativeEmulator.guestPageSizeBytes;
/** Linux/Android-ish sysconf names used by common bionic callers. */
const SC_PAGE_SIZE_NAMES = new Set([30, 47]);
const SC_NPROCESSORS_ONLN_NAMES = new Set([84]);

/**
 * A bionic libc implementation keyed by symbol name, for relocation-driven
 * auto-wiring: when CpuEngine.loadElf resolves an import (R_AARCH64_JUMP_SLOT /
 * GLOB_DAT) whose name is in here, it points the GOT slot at a stub running the
 * matching HostFunction. Stateful entries (malloc/free) capture a shared heap.
 */
export type BionicLibrary = Map<string, (ctx: HostContext) => bigint | number | void>;

/**
 * Build the default bionic libc as a name→HostFunction map. A single bump heap
 * is shared across malloc/calloc/realloc; free is a no-op (the bump allocator
 * never reclaims). The map is the source of truth both for auto-wiring and for
 * the address-keyed installBionicStubs below.
 */
export function createBionicLibrary(
  engine: BionicMemoryMapper,
  options: BionicOptions = {},
): BionicLibrary {
  const lib: BionicLibrary = new Map();
  let bump = HEAP_BASE;
  // Track allocation sizes so realloc can copy the old contents forward.
  const sizes = new Map<number, number>();

  const alloc = (size: number): number => {
    const rounded = Math.max(HEAP_ALIGN, (size + HEAP_ALIGN - 1) & ~(HEAP_ALIGN - 1));
    const ptr = bump;
    engine.mapMemory(ptr, rounded);
    bump += rounded;
    sizes.set(ptr, size);
    return ptr;
  };

  // Open FILE* streams: handle (guest ptr) → { bytes, pos }. The handle is a
  // small allocation so it's a unique, dereferenceable non-NULL pointer.
  const streams = new Map<number, { bytes: Uint8Array; pos: number }>();
  const files = options.files;
  const dlHandles = new Map<string, number>();
  let lastDlError = '';

  const writeDlError = (ctx: HostContext): bigint => {
    if (lastDlError.length === 0) return 0n;
    const ptr = alloc(utf8ByteLength(lastDlError) + 1);
    writeGuestCString(ctx, ptr, lastDlError);
    const out = BigInt(ptr);
    lastDlError = '';
    return out;
  };

  lib.set('strlen', (ctx) => {
    return BigInt(readGuestCStringBytes(ctx, Number(ctx.x(0))).length);
  });
  lib.set('memcpy', (ctx) => {
    const dst = Number(ctx.x(0));
    ctx.write(dst, ctx.read(Number(ctx.x(1)), Number(ctx.x(2))));
    return ctx.x(0);
  });
  lib.set('memmove', (ctx) => {
    // Copy via an intermediate buffer so overlapping ranges stay correct.
    const dst = Number(ctx.x(0));
    const copy = Uint8Array.from(ctx.read(Number(ctx.x(1)), Number(ctx.x(2))));
    ctx.write(dst, copy);
    return ctx.x(0);
  });
  lib.set('memset', (ctx) => {
    const buf = Number(ctx.x(0));
    const value = Number(ctx.x(1) & 0xffn);
    const n = Number(ctx.x(2));
    ctx.write(buf, new Uint8Array(n).fill(value));
    return ctx.x(0);
  });
  lib.set('memcmp', (ctx) => {
    const a = ctx.read(Number(ctx.x(0)), Number(ctx.x(2)));
    const b = ctx.read(Number(ctx.x(1)), Number(ctx.x(2)));
    for (let i = 0; i < a.length; i++) {
      const d = (a[i] ?? 0) - (b[i] ?? 0);
      if (d !== 0) return BigInt(d < 0 ? -1 : 1);
    }
    return 0n;
  });
  lib.set('strcmp', (ctx) => {
    const a = readGuestCStringBytes(ctx, Number(ctx.x(0)));
    const b = readGuestCStringBytes(ctx, Number(ctx.x(1)));
    return BigInt(compareCStringBytes(a, b, Math.max(a.length, b.length) + 1));
  });
  lib.set('strncmp', (ctx) => {
    const n = Number(ctx.x(2));
    if (n <= 0) return 0n;
    const a = readGuestCStringBytes(ctx, Number(ctx.x(0)), n);
    const b = readGuestCStringBytes(ctx, Number(ctx.x(1)), n);
    return BigInt(compareCStringBytes(a, b, n));
  });
  lib.set('strcpy', (ctx) => {
    const dst = Number(ctx.x(0));
    const body = readGuestCStringBytes(ctx, Number(ctx.x(1)));
    const out = new Uint8Array(body.length + 1);
    out.set(body);
    ctx.write(dst, out);
    return ctx.x(0);
  });
  lib.set('strncpy', (ctx) => {
    // Copy up to n bytes; if src ends early, NUL-pad the remainder (C semantics).
    const dst = Number(ctx.x(0));
    const src = Number(ctx.x(1));
    const n = Number(ctx.x(2));
    if (n > 0) {
      const body = readGuestCStringBytes(ctx, src, n);
      const out = new Uint8Array(n);
      out.set(body.subarray(0, n));
      ctx.write(dst, out);
    }
    return ctx.x(0);
  });
  lib.set('strchr', (ctx) => {
    // Return a pointer to the first occurrence of the byte, or NULL. The
    // terminating NUL is matchable, mirroring the C contract.
    const start = Number(ctx.x(0));
    const needle = Number(ctx.x(1) & 0xffn);
    const body = readGuestCStringBytes(ctx, start);
    if (needle === 0) return BigInt(start + body.length);
    const index = body.indexOf(needle);
    return index >= 0 ? BigInt(start + index) : 0n;
  });
  lib.set('strrchr', (ctx) => {
    // char *strrchr(const char *s, int c) — return pointer to LAST occurrence
    const start = Number(ctx.x(0));
    const needle = Number(ctx.x(1) & 0xffn);
    const body = readGuestCStringBytes(ctx, start);
    if (needle === 0) return BigInt(start + body.length);
    const index = body.lastIndexOf(needle);
    return index >= 0 ? BigInt(start + index) : 0n;
  });
  lib.set('strdup', (ctx) => {
    // Allocate len+1 and copy the string including its NUL terminator.
    const body = readGuestCStringBytes(ctx, Number(ctx.x(0)));
    const ptr = alloc(body.length + 1);
    const out = new Uint8Array(body.length + 1);
    out.set(body);
    ctx.write(ptr, out);
    return BigInt(ptr);
  });
  lib.set('malloc', (ctx) => BigInt(alloc(Number(ctx.x(0)))));
  lib.set('calloc', (ctx) => {
    const n = Number(ctx.x(0)) * Number(ctx.x(1));
    const ptr = alloc(n);
    ctx.write(ptr, new Uint8Array(n)); // calloc zeroes
    return BigInt(ptr);
  });
  lib.set('realloc', (ctx) => {
    const old = Number(ctx.x(0));
    const size = Number(ctx.x(1));
    if (old === 0) return BigInt(alloc(size));
    const ptr = alloc(size);
    const oldSize = sizes.get(old) ?? 0;
    if (oldSize > 0) ctx.write(ptr, ctx.read(old, Math.min(oldSize, size)));
    return BigInt(ptr);
  });
  lib.set('free', () => undefined);
  lib.set('__stack_chk_fail', () => {
    throw new Error('bionic: __stack_chk_fail (stack canary corrupted in emulated code)');
  });
  lib.set('abort', () => {
    throw new Error('bionic: abort() called by emulated code');
  });

  // ── stdio + logging: model "what files exist" for anti-tamper detection ──

  /**
   * FILE* fopen(const char* path, const char* mode). Returns a non-NULL handle
   * when `path` is in the virtual file system, else NULL — the exact signal
   * RootBeer's exists() and similar probes test. Write modes always fail (the
   * emulated FS is read-only).
   */
  lib.set('fopen', (ctx) => {
    const path = readCString(ctx, Number(ctx.x(0)));
    const contents = files?.get(path);
    if (!contents) return 0n; // NULL: file does not exist on this device
    const handle = alloc(1); // unique, dereferenceable FILE* token
    streams.set(handle, { bytes: contents, pos: 0 });
    return BigInt(handle);
  });
  /** int fclose(FILE*). Releases the stream; returns 0 (success). */
  lib.set('fclose', (ctx) => {
    streams.delete(Number(ctx.x(0)));
    return 0n;
  });
  /** size_t fread(void* ptr, size_t size, size_t nmemb, FILE*). Returns nmemb read. */
  lib.set('fread', (ctx) => {
    const dst = Number(ctx.x(0));
    const size = Number(ctx.x(1));
    const nmemb = Number(ctx.x(2));
    const stream = streams.get(Number(ctx.x(3)));
    if (!stream || size === 0) return 0n;
    const want = size * nmemb;
    const slice = stream.bytes.subarray(stream.pos, stream.pos + want);
    if (slice.length > 0) ctx.write(dst, slice);
    stream.pos += slice.length;
    return BigInt(Math.floor(slice.length / size));
  });
  /** char* fgets(char* buf, int n, FILE*). Reads one line (incl. \n), NUL-terminated. */
  lib.set('fgets', (ctx) => {
    const buf = Number(ctx.x(0));
    const n = Number(ctx.x(1));
    const stream = streams.get(Number(ctx.x(2)));
    if (!stream || n <= 0 || stream.pos >= stream.bytes.length) return 0n; // NULL at EOF
    const out: number[] = [];
    while (out.length < n - 1 && stream.pos < stream.bytes.length) {
      const b = stream.bytes[stream.pos++] ?? 0;
      out.push(b);
      if (b === 0x0a) break; // newline ends the line
    }
    out.push(0);
    ctx.write(buf, Uint8Array.from(out));
    return BigInt(buf);
  });
  /** int feof(FILE*). Non-zero once the read cursor reached end-of-file. */
  lib.set('feof', (ctx) => {
    const stream = streams.get(Number(ctx.x(0)));
    return stream && stream.pos >= stream.bytes.length ? 1n : 0n;
  });
  /**
   * int __android_log_print(int prio, const char* tag, const char* fmt, ...).
   * The variadic format isn't expanded; the raw fmt string is forwarded with its
   * tag/priority so a caller can observe detection logging. Returns 1.
   */
  lib.set('__android_log_print', (ctx) => {
    const priority = Number(ctx.x(0));
    const tag = readCString(ctx, Number(ctx.x(1)));
    const message = formatGuestCString(ctx, Number(ctx.x(2)), 3);
    options.onLog?.(priority, tag, message);
    return 1n;
  });
  // C++ runtime registration hooks the loader emits; no-ops that return success.
  lib.set('__cxa_atexit', () => 0n);
  lib.set('__cxa_finalize', () => undefined);

  // ── Android libc/runtime imports used by packers and linkers ─────────────
  lib.set('getpagesize', () => BigInt(PAGE_SIZE));
  lib.set('sysconf', (ctx) => {
    const name = Number(ctx.x(0));
    if (SC_PAGE_SIZE_NAMES.has(name)) return BigInt(PAGE_SIZE);
    if (SC_NPROCESSORS_ONLN_NAMES.has(name)) return 1n;
    return BigInt(-1);
  });
  lib.set('mprotect', () => 0n);
  lib.set('munmap', () => 0n);
  lib.set('prctl', () => 0n);
  lib.set('getpid', () => 10000n);
  lib.set('getuid', () => 10000n);
  lib.set('sleep', () => 0n);
  lib.set('usleep', () => 0n);

  // ── Time functions ────────────────────────────────────────────────────────
  lib.set('time', (ctx) => {
    // time_t time(time_t *tloc) — return seconds since epoch, optionally store
    const tloc = Number(ctx.x(0));
    const now = Math.floor(Date.now() / 1000);
    if (tloc !== 0) {
      const bytes = new Uint8Array(8);
      let v = BigInt(now);
      for (let i = 0; i < 8; i++) {
        bytes[i] = Number(v & 0xffn);
        v >>= 8n;
      }
      ctx.write(tloc, bytes);
    }
    return BigInt(now);
  });
  lib.set('gettimeofday', (ctx) => {
    // int gettimeofday(struct timeval *tv, struct timezone *tz)
    const tv = Number(ctx.x(0));
    if (tv !== 0) {
      const now = Date.now();
      const sec = Math.floor(now / 1000);
      const usec = (now % 1000) * 1000;
      const bytes = new Uint8Array(16);
      let v = BigInt(sec);
      for (let i = 0; i < 8; i++) {
        bytes[i] = Number(v & 0xffn);
        v >>= 8n;
      }
      v = BigInt(usec);
      for (let i = 8; i < 16; i++) {
        bytes[i] = Number(v & 0xffn);
        v >>= 8n;
      }
      ctx.write(tv, bytes);
    }
    return 0n;
  });

  // ── Environment ───────────────────────────────────────────────────────────
  lib.set('getenv', () => {
    // char *getenv(const char *name) — return NULL (no environment variables)
    return 0n;
  });

  // ── Memory search ─────────────────────────────────────────────────────────
  lib.set('memchr', (ctx) => {
    // void *memchr(const void *s, int c, size_t n)
    const s = Number(ctx.x(0));
    const c = Number(ctx.x(1)) & 0xff;
    const n = Number(ctx.x(2));
    const bytes = ctx.read(s, n);
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] === c) return BigInt(s + i);
    }
    return 0n; // not found
  });

  // ── Dynamic linking ───────────────────────────────────────────────────────
  lib.set('dlopen', (ctx) => {
    const namePtr = Number(ctx.x(0));
    const name = namePtr === 0 ? '<self>' : readCString(ctx, namePtr);
    const key = name.length > 0 ? name : '<self>';
    let handle = dlHandles.get(key);
    if (handle === undefined) {
      handle = alloc(1);
      dlHandles.set(key, handle);
    }
    lastDlError = '';
    return BigInt(handle);
  });
  lib.set('dlsym', (ctx) => {
    const symbol = readCString(ctx, Number(ctx.x(1)));
    if (!symbol) {
      lastDlError = 'dlsym: empty symbol';
      return 0n;
    }
    const exported = engine.lookupSymbol?.(symbol);
    if (exported !== undefined) {
      lastDlError = '';
      return BigInt(exported);
    }
    const fn = lib.get(symbol);
    const stub = fn ? engine.bindImportStub?.(symbol, fn) : undefined;
    if (stub !== undefined) {
      lastDlError = '';
      return BigInt(stub);
    }
    lastDlError = `dlsym: symbol not found: ${symbol}`;
    return 0n;
  });
  lib.set('dlerror', (ctx) => writeDlError(ctx));

  // ── Generic stdio ───────────────────────────────────────────────────────

  lib.set('puts', (ctx) => {
    const text = `${readCString(ctx, Number(ctx.x(0)))}\n`;
    options.onStdout?.(text);
    return BigInt(utf8ByteLength(text));
  });
  lib.set('printf', (ctx) => {
    const text = formatGuestCString(ctx, Number(ctx.x(0)), 1);
    options.onStdout?.(text);
    return BigInt(utf8ByteLength(text));
  });
  lib.set('fprintf', (ctx) => {
    const text = formatGuestCString(ctx, Number(ctx.x(1)), 2);
    if (Number(ctx.x(0)) === 2) {
      options.onStderr?.(text);
    } else {
      options.onStdout?.(text);
    }
    return BigInt(utf8ByteLength(text));
  });
  lib.set('sprintf', (ctx) => {
    const text = formatGuestCString(ctx, Number(ctx.x(1)), 2);
    return BigInt(writeGuestCString(ctx, Number(ctx.x(0)), text));
  });
  lib.set('snprintf', (ctx) => {
    const text = formatGuestCString(ctx, Number(ctx.x(2)), 3);
    return BigInt(writeGuestCString(ctx, Number(ctx.x(0)), text, Number(ctx.x(1))));
  });
  lib.set('putchar', (ctx) => {
    // int putchar(int c) — return the char
    return ctx.x(0) & 0xffn;
  });
  lib.set('getchar', () => {
    // int getchar(void) — return EOF (-1) to signal no input
    return BigInt(-1);
  });

  // ── Math functions (IEEE 754 via Math.*) ────────────────────────────────────
  // SQLite uses these for date/time calculations. Return values as double (via
  // BigInt reinterpret_cast of the IEEE-754 bits would be correct, but for now
  // we return the integer part — enough for SQLite's time arithmetic).
  lib.set('exp', (ctx) => BigInt(Math.floor(Math.exp(Number(ctx.x(0))))));
  lib.set('pow', (ctx) => BigInt(Math.floor(Math.pow(Number(ctx.x(0)), Number(ctx.x(1))))));
  lib.set('fmod', (ctx) => BigInt(Math.floor(Number(ctx.x(0)) % Number(ctx.x(1)))));
  lib.set('sqrt', (ctx) => BigInt(Math.floor(Math.sqrt(Number(ctx.x(0))))));
  lib.set('log', (ctx) => BigInt(Math.floor(Math.log(Number(ctx.x(0))))));
  lib.set('log10', (ctx) => BigInt(Math.floor(Math.log10(Number(ctx.x(0))))));
  lib.set('log2', (ctx) => BigInt(Math.floor(Math.log2(Number(ctx.x(0))))));
  lib.set('sin', (ctx) => BigInt(Math.floor(Math.sin(Number(ctx.x(0))))));
  lib.set('cos', (ctx) => BigInt(Math.floor(Math.cos(Number(ctx.x(0))))));
  lib.set('tan', (ctx) => BigInt(Math.floor(Math.tan(Number(ctx.x(0))))));
  lib.set('asin', (ctx) => BigInt(Math.floor(Math.asin(Number(ctx.x(0))))));
  lib.set('acos', (ctx) => BigInt(Math.floor(Math.acos(Number(ctx.x(0))))));
  lib.set('atan', (ctx) => BigInt(Math.floor(Math.atan(Number(ctx.x(0))))));
  lib.set('atan2', (ctx) => BigInt(Math.floor(Math.atan2(Number(ctx.x(0)), Number(ctx.x(1))))));
  lib.set('sinh', (ctx) => BigInt(Math.floor(Math.sinh(Number(ctx.x(0))))));
  lib.set('cosh', (ctx) => BigInt(Math.floor(Math.cosh(Number(ctx.x(0))))));
  lib.set('tanh', (ctx) => BigInt(Math.floor(Math.tanh(Number(ctx.x(0))))));
  lib.set('asinh', (ctx) => BigInt(Math.floor(Math.asinh(Number(ctx.x(0))))));
  lib.set('acosh', (ctx) => BigInt(Math.floor(Math.acosh(Number(ctx.x(0))))));
  lib.set('atanh', (ctx) => BigInt(Math.floor(Math.atanh(Number(ctx.x(0))))));
  lib.set('trunc', (ctx) => BigInt(Math.trunc(Number(ctx.x(0)))));

  // ── pthread stubs (single-threaded degradation) ────────────────────────────
  // SQLite uses mutexes for thread safety. In single-threaded emulation, all
  // mutex operations succeed immediately (no contention possible).
  lib.set('pthread_mutexattr_init', () => 0n);
  lib.set('pthread_mutexattr_settype', () => 0n);
  lib.set('pthread_mutexattr_destroy', () => 0n);
  lib.set('pthread_mutex_init', () => 0n);
  lib.set('pthread_mutex_destroy', () => 0n);
  lib.set('pthread_mutex_lock', () => 0n);
  lib.set('pthread_mutex_trylock', () => 0n); // always succeeds (no other thread)
  lib.set('pthread_mutex_unlock', () => 0n);
  lib.set('pthread_create', () => BigInt(-1)); // fail: no threads in emulator
  lib.set('pthread_join', () => BigInt(-1));

  // ── String functions ──────────────────────────────────────────────────────
  lib.set('strcspn', (ctx) => {
    // size_t strcspn(const char *s, const char *reject)
    const sBytes = readGuestCStringBytes(ctx, Number(ctx.x(0)));
    const rejectBytes = readGuestCStringBytes(ctx, Number(ctx.x(1)));
    const rejectSet = new Set(rejectBytes);
    for (let i = 0; i < sBytes.length; i++) {
      if (rejectSet.has(sBytes[i]!)) return BigInt(i);
    }
    return BigInt(sBytes.length);
  });
  lib.set('strspn', (ctx) => {
    // size_t strspn(const char *s, const char *accept)
    const sBytes = readGuestCStringBytes(ctx, Number(ctx.x(0)));
    const acceptBytes = readGuestCStringBytes(ctx, Number(ctx.x(1)));
    const acceptSet = new Set(acceptBytes);
    for (let i = 0; i < sBytes.length; i++) {
      if (!acceptSet.has(sBytes[i]!)) return BigInt(i);
    }
    return BigInt(sBytes.length);
  });

  // ── File I/O stubs (minimal/fail-fast) ───────────────────────────────────
  // SQLite needs these but we don't provide a full VFS here. Most operations
  // fail with -1 (EPERM), which SQLite tolerates (falls back to in-memory mode).
  // NOTE: These wrap syscalls so they can be resolved via GOT/PLT (dynamic linking).
  lib.set('open', () => BigInt(-1)); // fail: no backing filesystem
  lib.set('close', () => 0n); // succeed (no-op)
  lib.set('read', () => 0n); // return 0 bytes read
  lib.set('write', (ctx) => BigInt(Number(ctx.x(2)))); // pretend all bytes written
  lib.set('fstat', (ctx) => {
    // int fstat(int fd, struct stat *statbuf) — zero the buffer, return success
    const statbuf = Number(ctx.x(1));
    if (statbuf !== 0) ctx.write(statbuf, new Uint8Array(128)); // sizeof(struct stat64)
    return 0n;
  });
  lib.set('mmap', (ctx) => {
    // void *mmap(void *addr, size_t length, ...) — allocate anonymous memory
    const length = Number(ctx.x(1));
    const rounded = Math.max(16, Math.ceil(length / 16) * 16);
    const ptr = alloc(rounded);
    return BigInt(ptr);
  });
  lib.set('access', () => BigInt(-1)); // fail: file not found
  lib.set('stat', () => BigInt(-1));
  lib.set('lstat', () => BigInt(-1));
  lib.set('fcntl', () => BigInt(-1));
  lib.set('pread', () => BigInt(-1));
  lib.set('pwrite', () => BigInt(-1));
  lib.set('ftruncate', () => BigInt(-1));
  lib.set('fsync', () => 0n); // succeed (no-op: nothing to flush)
  lib.set('fchmod', () => BigInt(-1));
  lib.set('fchown', () => BigInt(-1));
  lib.set('unlink', () => BigInt(-1));
  lib.set('mkdir', () => BigInt(-1));
  lib.set('rmdir', () => BigInt(-1));
  lib.set('readlink', () => BigInt(-1));
  lib.set('utimes', () => BigInt(-1));
  lib.set('getcwd', (ctx) => {
    // char *getcwd(char *buf, size_t size) — return "/" as fake cwd
    const buf = Number(ctx.x(0));
    const size = Number(ctx.x(1));
    if (buf !== 0 && size > 0) {
      writeGuestCString(ctx, buf, '/', size);
      return BigInt(buf);
    }
    return 0n; // fail if buf is NULL
  });

  // ── Time/error/misc ──────────────────────────────────────────────────────
  lib.set('nanosleep', () => 0n); // succeed immediately (no actual sleep)
  lib.set('localtime', () => {
    // struct tm *localtime(const time_t *timep) — return NULL (not implemented)
    return 0n;
  });

  // Allocate errno cell once, return same address every time
  let errnoCell: number | undefined;
  lib.set('__errno', () => {
    // int *__errno_location(void) — return a persistent errno slot
    if (errnoCell === undefined) {
      errnoCell = alloc(4);
    }
    return BigInt(errnoCell);
  });

  lib.set('dlclose', () => 0n); // succeed (no-op: handles never freed)
  lib.set('geteuid', () => 10000n); // same as getuid
  lib.set('mremap', () => BigInt(-1)); // fail: not implemented

  return lib;
}

const BIONIC_SYMBOL_PROBE: BionicMemoryMapper = { mapMemory: () => undefined };
const SUPPORTED_BIONIC_SYMBOLS = new Set(createBionicLibrary(BIONIC_SYMBOL_PROBE).keys());

/** Stable symbol catalog used by diagnostics without constructing a CpuEngine. */
export function supportedBionicSymbols(): ReadonlySet<string> {
  return SUPPORTED_BIONIC_SYMBOLS;
}

/** True when the built-in bionic library can auto-wire this import. */
export function hasBionicSymbol(symbol: string): boolean {
  return SUPPORTED_BIONIC_SYMBOLS.has(symbol);
}

export function installBionicStubs(engine: CpuEngine, addrs: BionicStubAddresses): void {
  if (addrs.strlen !== undefined) {
    engine.registerHostFunction(addrs.strlen, (ctx: HostContext) => {
      return BigInt(readGuestCStringBytes(ctx, Number(ctx.x(0))).length);
    });
  }

  if (addrs.memcpy !== undefined) {
    engine.registerHostFunction(addrs.memcpy, (ctx: HostContext) => {
      const dst = Number(ctx.x(0));
      const src = Number(ctx.x(1));
      const n = Number(ctx.x(2));
      ctx.write(dst, ctx.read(src, n));
      return ctx.x(0); // memcpy returns dest
    });
  }

  if (addrs.memset !== undefined) {
    engine.registerHostFunction(addrs.memset, (ctx: HostContext) => {
      const buf = Number(ctx.x(0));
      const value = Number(ctx.x(1) & 0xffn);
      const n = Number(ctx.x(2));
      ctx.write(buf, new Uint8Array(n).fill(value));
      return ctx.x(0); // memset returns dest
    });
  }

  if (addrs.malloc !== undefined) {
    let bump = HEAP_BASE;
    engine.registerHostFunction(addrs.malloc, (ctx: HostContext) => {
      const size = Number(ctx.x(0));
      const rounded = Math.max(HEAP_ALIGN, (size + HEAP_ALIGN - 1) & ~(HEAP_ALIGN - 1));
      const ptr = bump;
      engine.mapMemory(ptr, rounded); // lazily back each allocation
      bump += rounded;
      return BigInt(ptr);
    });
  }

  if (addrs.free !== undefined) {
    // The bump allocator never reclaims, so free is a no-op.
    engine.registerHostFunction(addrs.free, () => undefined);
  }
}

function compareCStringBytes(left: Uint8Array, right: Uint8Array, maxBytes: number): number {
  for (let i = 0; i < maxBytes; i++) {
    const a = i < left.length ? left[i]! : 0;
    const b = i < right.length ? right[i]! : 0;
    if (a !== b) return a < b ? -1 : 1;
    if (a === 0) return 0;
  }
  return 0;
}
