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

## 工具清单（23）

| 工具 | 说明 |
| --- | --- |
| `adb_device_list` | 列出当前通过 ADB 连接的 Android 设备和模拟器。 |
| `adb_apk_pull` | 将设备上的已安装 APK 拉取到本地文件系统。 |
| `adb_shell` | 在指定 Android 设备上执行一条 ADB shell 命令。 |
| `adb_install` | 通过 adb 安装单个 APK 或拆分 APK 组到设备，返回解析后的安装结果 |
| `adb_uninstall` | 从设备卸载指定包名的应用，可选保留应用数据 |
| `adb_input_tap` | 通过 adb shell input 发送触摸点击事件到设备屏幕 |
| `adb_input_swipe` | 通过 adb shell input 发送触摸滑动事件到设备屏幕 |
| `adb_input_keyevent` | 通过 adb shell input 发送 Android 按键名或数字键码 |
| `adb_input_text` | 通过 adb shell input text 发送文本到设备，自动处理空格编码 |
| `adb_proc_maps` | 读取并解析设备的 /proc/PID/maps，支持通过包名自动解析 PID |
| `adb_root_check` | 检测设备 root 状态：su 二进制文件、Magisk、test-keys 签名、SELinux 状态、shell UID |
| `adb_screenshot` | 通过 adb exec-out screencap -p 截取设备 PNG 截图 |
| `adb_screenrecord` | 通过 adb shell screenrecord 录制短 MP4 屏幕视频并拉取到本地。 |
| `adb_port_forward` | 管理 ADB forward/reverse 端口映射，用于设备与主机之间的调试桥接流程。 |
| `adb_apk_analyze` | 分析已安装的 APK——包名、版本、权限、Activity、Service、Receiver。 |
| `adb_package_summary` | 返回结构化的 Android 包元数据：启动器、uid、版本号、权限、组件以及 native 库目录。 |
| `adb_logcat_query` | 在进程内抓取并过滤 Android logcat 输出，无需 shell grep 管道。 |
| `adb_app_cold_start_trace` | 高层 Android 冷启动追踪：强制停止、清空 logcat、用 -W 启动 Activity、等待、收集按 PID 过滤的日志，并解析启动/Looper 耗时。 |
| `adb_file_pull` | 用普通 ADB 权限从 Android 设备拉取文件。 |
| `adb_file_push` | 用普通 ADB 权限向 Android 设备推送本地文件。 |
| `adb_pull_native_libs` | 从 Android 设备中拉取指定应用打包或安装后的原生共享库（.so）。 |
| `adb_webview_list` | 通过 ADB 端口转发列出可调试的 WebView 目标（需 android:debuggable=\\"true\\"）。 |
| `adb_webview_attach` | 通过 ADB 端口转发附加到 WebView，返回 CDP 用的 WebSocket 调试器 URL。 |
