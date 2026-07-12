/**
 * Behavioural tests for the `dart_call_graph` tool.
 *
 * The graph builder runs against an in-memory mocked DartAotLoader snapshot
 * (no file IO) so every branch of the pool-entry → Code-entry matching can be
 * exercised deterministically: direct match, tag-stripped (−1) fallback,
 * self-edge exclusion, zero-value skip, maxEdges cap, poolsScanned/poolsMissing
 * accounting, entryPoints name filter, and the no-path validation error.
 */
import { describe, expect, it, vi } from 'vitest';

const snapshotHolder = vi.hoisted(() => ({
  current: { codeObjects: [], objectPools: [] } as unknown,
}));

vi.mock('@modules/native-emulator/dart/DartAotLoader', () => ({
  DartAotLoader: class MockDartAotLoader {
    async loadSnapshot(_path: string) {
      return snapshotHolder.current as never;
    }
  },
}));

import manifest from '@server/domains/dart-inspector/manifest';
import type { MCPServerContext } from '@server/MCPServer.context';
import { R } from '@server/domains/shared/ResponseBuilder';

type GraphPayload = {
  success: boolean;
  error?: string;
  nodes: Array<{ entry: string; name?: string; size: number; hasName: boolean }>;
  edges: Array<{ from: string; to: string; fromName?: string; toName?: string }>;
  nodeCount: number;
  edgeCount: number;
  entryPoints: Array<{ entry: string; name?: string }>;
  poolsScanned: number;
  poolsMissing: number;
  truncated: boolean;
  honestBoundary: string;
};

interface MockCode {
  name: string | undefined;
  entryPoint: bigint;
  objectPool: bigint;
  size: number;
  instructions: unknown[];
}
interface MockPool {
  address: bigint;
  pool: { getAllEntries: () => Array<{ value: bigint; type: string; offset: number }> };
}

function makeCode(name: string | undefined, entryPoint: bigint, objectPool: bigint): MockCode {
  return { name, entryPoint, objectPool, size: 16, instructions: [] };
}
function makePool(address: bigint, values: bigint[]): MockPool {
  return {
    address,
    pool: {
      getAllEntries: () => values.map((value) => ({ value, type: 'immediate', offset: 0 })),
    },
  };
}
function setSnapshot(codes: MockCode[], pools: MockPool[]): void {
  snapshotHolder.current = {
    version: '1.0',
    numClusters: 0,
    dataStartOffset: 0,
    clusters: [],
    codeObjects: codes,
    objectPools: pools,
  };
}

async function callGraph(args: Record<string, unknown>): Promise<GraphPayload> {
  const handler = await manifest.ensure({} as MCPServerContext);
  const res = await handler.handleDartCallGraph(args);
  return R.parse<GraphPayload>(res);
}

describe('dart_call_graph', () => {
  it('builds a caller→callee edge from a pool entry matching another Code entry point', async () => {
    setSnapshot(
      [makeCode('main', 0x1000n, 0x5000n), makeCode('helper', 0x2000n, 0x6000n)],
      [makePool(0x5000n, [0x2000n])],
    );
    const p = await callGraph({ libappPath: '/fake/libapp.so' });
    expect(p.success).toBe(true);
    expect(p.nodeCount).toBe(2);
    expect(p.edgeCount).toBe(1);
    expect(p.edges[0]).toMatchObject({
      from: '0x1000',
      to: '0x2000',
      fromName: 'main',
      toName: 'helper',
    });
  });

  it('matches the tag-stripped (value−1) entry when the raw value is not a known entry', async () => {
    setSnapshot(
      [makeCode('a', 0x1000n, 0x5000n), makeCode('b', 0x2000n, 0x6000n)],
      [makePool(0x5000n, [0x2001n])],
    );
    const p = await callGraph({ libappPath: '/x' });
    expect(p.edgeCount).toBe(1);
    expect(p.edges[0]?.to).toBe('0x2000');
  });

  it('excludes self-edges (a Code whose pool points at its own entry)', async () => {
    setSnapshot([makeCode('a', 0x1000n, 0x5000n)], [makePool(0x5000n, [0x1000n])]);
    const p = await callGraph({ libappPath: '/x' });
    expect(p.edgeCount).toBe(0);
  });

  it('skips zero-value pool entries', async () => {
    setSnapshot(
      [makeCode('a', 0x1000n, 0x5000n), makeCode('b', 0x2000n, 0x6000n)],
      [makePool(0x5000n, [0n, 0x2000n])],
    );
    const p = await callGraph({ libappPath: '/x' });
    expect(p.edgeCount).toBe(1);
    expect(p.edges[0]?.to).toBe('0x2000');
  });

  it('truncates at maxEdges and sets truncated=true', async () => {
    setSnapshot(
      [
        makeCode('a', 0x1000n, 0x5000n),
        makeCode('b', 0x2000n, 0x6000n),
        makeCode('c', 0x3000n, 0x7000n),
      ],
      [makePool(0x5000n, [0x2000n, 0x3000n])],
    );
    const p = await callGraph({ libappPath: '/x', maxEdges: 1 });
    expect(p.truncated).toBe(true);
    expect(p.edgeCount).toBe(1);
  });

  it('accounts poolsScanned vs poolsMissing', async () => {
    setSnapshot(
      [makeCode('a', 0x1000n, 0x5000n), makeCode('b', 0x2000n, 0x9999n)],
      [makePool(0x5000n, [0x2000n])],
    );
    const p = await callGraph({ libappPath: '/x' });
    expect(p.poolsScanned).toBe(1);
    expect(p.poolsMissing).toBe(1);
  });

  it('filters entryPoints by main|entry name and emits an honestBoundary string', async () => {
    setSnapshot([makeCode('main', 0x1000n, 0x5000n), makeCode('helper', 0x2000n, 0x6000n)], []);
    const p = await callGraph({ libappPath: '/x' });
    expect(p.entryPoints.map((e) => e.name)).toEqual(['main']);
    expect(typeof p.honestBoundary).toBe('string');
    expect(p.honestBoundary.length).toBeGreaterThan(0);
  });

  it('surfaces a validation error when neither apkPath nor libappPath is given', async () => {
    const p = await callGraph({});
    expect(p.success).toBe(false);
    expect(p.error).toBeDefined();
  });
});
