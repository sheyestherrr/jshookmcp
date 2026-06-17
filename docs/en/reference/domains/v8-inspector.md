# V8 Inspector

Domain: `v8-inspector`

V8 inspector domain providing heap snapshot analysis, CPU profiling, and memory inspection.

## Profiles

- workflow
- full

## Typical scenarios

- Heap snapshot analysis
- CPU profiling
- Memory leak detection

## Common combinations

- v8-inspector + browser
- v8-inspector + debugger

## Full tool list (9)

| Tool | Description |
| --- | --- |
| `v8_heap_snapshot_capture` | Capture a V8 heap snapshot for offline analysis. |
| `v8_heap_snapshot_analyze` | Analyze a heap snapshot: class histogram (object count/sizes by constructor), statistics (total objects, detached DOM nodes), optional dominator tree, and leak detection. |
| `v8_heap_diff` | Compare two heap snapshots to find allocation changes. |
| `v8_object_inspect` | Inspect a live JS object by objectId with property enumeration. |
| `v8_heap_stats` | Report V8 heap statistics: used, total, external. |
| `v8_bytecode_extract` | Extract V8 bytecode for a script by scriptId, with source fallback. |
| `v8_version_detect` | Detect V8 engine version, flags, and runtime capabilities. |
| `v8_jit_inspect` | Report JIT compilation status and optimization tier for a script. |
| `v8_heap_find_leaks` | Find suspected memory leaks in a heap snapshot. Returns leak candidates sorted by confidence, including detached DOM nodes, large arrays, closure leaks, and unexpectedly large retained objects. |
