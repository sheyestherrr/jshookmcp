# WebGPU

Domain: `webgpu`

WebGPU reverse analysis domain supporting GPU adapter info, shader compile/disassembly, timing side-channel analysis, and memory layout inspection.

## Profiles

- workflow
- full

## Typical scenarios

- GPU hardware fingerprinting
- WGSL shader analysis
- GPU side-channel attack detection
- GPU command queue capture

## Common combinations

- webgpu + browser
- webgpu + instrumentation

## Full tool list (6)

| Tool | Description |
| --- | --- |
| `webgpu_adapter_info` | Get WebGPU adapter information (vendor, architecture, device). Used for fingerprinting GPU capabilities and detecting hardware-level vulnerabilities. |
| `webgpu_shader_compile` | Compile WGSL shader and extract metadata (entry points, bindings, attributes). Validates shader code and detects potential security issues. |
| `webgpu_shader_disassemble` | Parse WGSL or SPIR-V shader into AST and generate human-readable disassembly. Used for reverse engineering shader logic. SPIR-V input (hex/base64) is reflected into entry points, bindings, structs, and locations without compilation. |
| `webgpu_timing_analysis` | GPU timing analysis for side-channel detection. Measures GPU command execution time variance to detect cache-based side-channel attacks (Graz University 2025 research). |
| `webgpu_memory_layout` | Analyze GPU memory allocations and buffer usage. Identifies memory layout patterns that may be vulnerable to side-channel attacks. |
| `webgpu_capture_commands` | Capture GPU command queue submissions (render passes, compute dispatches). Used for analyzing GPU workload and detecting malicious shader behavior. |
