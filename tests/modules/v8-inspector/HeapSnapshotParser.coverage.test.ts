/**
 * Coverage tests for HeapSnapshotParser — exercises feedChunk, the parsed-state
 * guard, node/edge queries, dominator/retained-size computation, top retainers,
 * and diff, using minimal/empty snapshot JSON (the heavy V8 format is exercised
 * end-to-end elsewhere).
 */

import { describe, expect, it } from 'vitest';
import { HeapSnapshotParser } from '@modules/v8-inspector/HeapSnapshotParser';

const EMPTY = JSON.stringify({
  snapshot: { meta: { node_fields: [], node_types: [], edge_fields: [], edge_types: [] } },
  nodes: [],
  edges: [],
  strings: [],
});

describe('HeapSnapshotParser — construction + empty parse', () => {
  it('parses an empty snapshot via the constructor', () => {
    const p = new HeapSnapshotParser(EMPTY);
    expect(p.nodeCount).toBe(0);
    expect(p.getAllNodes()).toEqual([]);
    expect(p.parseEdges()).toEqual([]);
  });

  it('parses an empty snapshot via feedChunk', () => {
    const p = new HeapSnapshotParser();
    p.feedChunk([EMPTY]);
    expect(p.nodeCount).toBe(0);
  });

  it('feedChunk after parsing already started throws', () => {
    const p = new HeapSnapshotParser();
    p.feedChunk([EMPTY]);
    expect(() => p.feedChunk([EMPTY])).toThrow(/already parsed/);
  });

  it('feedChunk skips empty/non-string chunks', () => {
    const p = new HeapSnapshotParser();
    p.feedChunk(['', EMPTY]);
    expect(p.nodeCount).toBe(0);
  });
});

describe('HeapSnapshotParser — queries on empty data', () => {
  const p = new HeapSnapshotParser(EMPTY);

  it('getNodesByClassName / getObjectsByType return [] on empty', () => {
    expect(p.getNodesByClassName('Object')).toEqual([]);
    expect(p.getObjectsByType('object')).toEqual([]);
  });

  it('buildDominatorTree returns an empty Map on empty data', () => {
    expect(p.buildDominatorTree().size).toBe(0);
  });

  it('getAllRetainedSizes returns [] on empty', () => {
    expect(p.getAllRetainedSizes()).toEqual([]);
  });

  it('getTopRetainers returns [] on empty', () => {
    expect(p.getTopRetainers(5)).toEqual([]);
  });
});

describe('HeapSnapshotParser — diff', () => {
  it('diffing two empty snapshots yields an empty-ish delta', () => {
    const a = new HeapSnapshotParser(EMPTY);
    const b = new HeapSnapshotParser(EMPTY);
    const d = a.diff(b);
    expect(d).toBeDefined();
  });
});

describe('HeapSnapshotParser — malformed input', () => {
  it('handles invalid JSON gracefully (empty result, no throw from public API)', () => {
    const p = new HeapSnapshotParser('not-json');
    expect(p.nodeCount).toBe(0);
    expect(p.getAllNodes()).toEqual([]);
  });
});
