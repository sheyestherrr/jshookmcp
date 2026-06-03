# ADB Bridge

Domain: `adb-bridge`

Android Debug Bridge integration domain for device management, application analysis, and remote debugging.

## Profiles

- full

## Typical scenarios

- Android device management
- APK analysis
- Remote debugging

## Common combinations

- adb-bridge + process
- adb-bridge + network

## Full tool list (12)

| Tool | Description |
| --- | --- |
| `adb_device_list` | List all connected Android devices and emulators. |
| `adb_apk_pull` | Pull an APK from a device to the local filesystem. |
| `adb_shell` | Execute an ADB shell command on a specific device. |
| `adb_apk_analyze` | Analyze an installed APK: package, permissions, activities, and security info. |
| `adb_package_summary` | Return structured Android package metadata: launcher, uid, versions, permissions, components, and native library dirs. |
| `adb_logcat_query` | Capture and filter Android logcat output in-process without shell grep pipelines. |
| `adb_app_cold_start_trace` | High-level Android startup trace: force-stop, clear logcat, start activity with -W, wait, collect PID-filtered logs, and parse launch/Looper timing. |
| `adb_file_pull` | Pull a file from an Android device using normal ADB permissions. |
| `adb_file_push` | Push a local file to an Android device using normal ADB permissions. |
| `adb_pull_native_libs` | Pull native shared libraries (.so) for an installed app from a device. |
| `adb_webview_list` | List debuggable WebView targets connected via ADB. |
| `adb_webview_attach` | Attach to a WebView via ADB; returns WebSocket debugger URL for CDP. |
