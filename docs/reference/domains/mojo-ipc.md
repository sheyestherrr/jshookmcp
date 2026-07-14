# Mojo IPC

域名：`mojo-ipc`

Mojo IPC 监控域，用于 Chromium 内部进程间通信分析。

## Profile

- full

## 典型场景

- Mojo 消息监控
- IPC 模式分析
- Chromium 内部协议逆向

## 常见组合

- mojo-ipc + browser
- mojo-ipc + network

## 工具清单（8）

| 工具 | 说明 |
| --- | --- |
| `mojo_ipc_capabilities` | 报告 Mojo IPC 监控可用性。 |
| `mojo_monitor` | 启动或停止当前 Chromium 内核目标的 Mojo IPC 监控。 |
| `mojo_decode_message` | 将 Mojo IPC 十六进制负载解码为结构化字段映射。 |
| `mojo_encode_message` | 将结构化 Mojo IPC 消息编码为十六进制负载 |
| `mojo_list_interfaces` | 列出已发现的 Mojo IPC 接口及其待处理消息计数。 |
| `mojo_messages_get` | 从活跃监控会话中获取已捕获的 Mojo IPC 消息。 |
| `mojo_messages_summarize` | 将已捕获的 Mojo IPC 缓冲区（非破坏性读取）聚合为按接口/方法/方向的分布统计、Top-N 列表与捕获时间窗。不清空缓冲区。 |
| `mojo_verify_live` | 待补充中文：Generate a Frida verification script that probes a target Chromium process for known Mojo C-API exports (MojoWriteMessage, MojoWriteMessageNew) across modules. Uses a curated symbol database covering Chromium M96+ across Win32, Linux, and macOS. Returns a ready-to-run Frida script and probe metadata. Honest boundary (B-class): symbol DB is manually curated; symbols may vary by build config. Verified flag is always false — confirm against the live binary. |
