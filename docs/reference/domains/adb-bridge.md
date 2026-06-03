# ADB 桥接

域名：`adb-bridge`

Android Debug Bridge 集成域，用于设备管理、应用分析和远程调试。

## Profile

- full

## 典型场景

- Android 设备管理
- APK 分析
- 远程调试

## 常见组合

- adb-bridge + process
- adb-bridge + network

## 工具清单（12）

| 工具 | 说明 |
| --- | --- |
| `adb_device_list` | 列出当前通过 ADB 连接的 Android 设备和模拟器。 |
| `adb_apk_pull` | 将设备上的已安装 APK 拉取到本地文件系统。 |
| `adb_shell` | 在指定 Android 设备上执行一条 ADB shell 命令。 |
| `adb_apk_analyze` | 分析已安装的 APK——包名、版本、权限、Activity、Service、Receiver。 |
| `adb_package_summary` | 返回结构化的 Android 包元数据：启动器、uid、版本号、权限、组件以及 native 库目录。 |
| `adb_logcat_query` | 在进程内抓取并过滤 Android logcat 输出，无需 shell grep 管道。 |
| `adb_app_cold_start_trace` | 高层 Android 冷启动追踪：强制停止、清空 logcat、用 -W 启动 Activity、等待、收集按 PID 过滤的日志，并解析启动/Looper 耗时。 |
| `adb_file_pull` | 用普通 ADB 权限从 Android 设备拉取文件。 |
| `adb_file_push` | 用普通 ADB 权限向 Android 设备推送本地文件。 |
| `adb_pull_native_libs` | 从 Android 设备中拉取指定应用打包或安装后的原生共享库（.so）。 |
| `adb_webview_list` | 通过 ADB 端口转发列出可调试的 WebView 目标（需 android:debuggable=\\"true\\"）。 |
| `adb_webview_attach` | 通过 ADB 端口转发附加到 WebView，返回 CDP 用的 WebSocket 调试器 URL。 |
