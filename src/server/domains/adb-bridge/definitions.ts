import { tool } from '@server/registry/tool-builder';
import { ADB_WEBVIEW_HOST_PORT_DEFAULT } from '@src/constants';

export const adbBridgeTools = [
  tool('adb_device_list', (t) =>
    t.desc('List all connected Android devices and emulators.').query(),
  ),

  tool('adb_shell', (t) =>
    t
      .desc('Execute an ADB shell command on a specific device.')
      .string('serial', 'Android device serial or emulator id')
      .string('command', 'Shell command to run (e.g. "getprop ro.build.version.release")')
      .boolean(
        'allowNonZero',
        'Return stdout/stderr/exitCode instead of raising an MCP runtime error on non-zero exit.',
        { default: true },
      )
      .number('timeoutMs', 'Optional command timeout in milliseconds.')
      .number('maxBufferBytes', 'Optional stdout/stderr max buffer in bytes.')
      .required('serial', 'command'),
  ),

  tool('adb_apk_pull', (t) =>
    t
      .desc('Pull an APK from a device to the local filesystem.')
      .string('serial', 'Android device serial or emulator id')
      .string('packageName', 'Android package name (e.g. com.example.app)')
      .string('outputPath', 'Local directory to save the APK (default: current directory)')
      .string('outputFile', 'Optional explicit local file path for a single base APK pull')
      .boolean('includeSplits', 'Pull all split APKs returned by pm path, not just base.apk', {
        default: false,
      })
      .boolean('validateZip', 'Verify pulled APK files are regular ZIP/APK files', {
        default: true,
      })
      .required('serial', 'packageName'),
  ),

  tool('adb_apk_analyze', (t) =>
    t
      .desc('Analyze an installed APK: package, permissions, activities, and security info.')
      .string('serial', 'Required. Android device serial or emulator id.')
      .string('packageName', 'Required. Android package name, for example com.example.app.')
      .requiredOpenWorld('serial', 'packageName'),
  ),

  tool('adb_package_summary', (t) =>
    t
      .desc(
        'Return structured Android package metadata: launcher, uid, versions, permissions, components, and native library dirs.',
      )
      .string('serial', 'Required. Android device serial or emulator id.')
      .string('packageName', 'Required. Android package name, for example com.example.app.')
      .requiredOpenWorld('serial', 'packageName')
      .query(),
  ),

  tool('adb_logcat_query', (t) =>
    t
      .desc('Capture and filter Android logcat output in-process without shell grep pipelines.')
      .string('serial', 'Required. Android device serial or emulator id.')
      .string(
        'packageName',
        'Optional package name. If present, PID is resolved and used as a filter.',
      )
      .string('pid', 'Optional process id filter.')
      .string('pattern', 'Optional JavaScript regex applied to each logcat line.')
      .number('tail', 'Number of latest logcat records to request from Android.', { default: 500 })
      .number('maxLines', 'Maximum matching lines returned.', { default: 100 })
      .boolean('clearBefore', 'Clear logcat before capture.', { default: false })
      .requiredOpenWorld('serial')
      .query(),
  ),

  tool('adb_app_cold_start_trace', (t) =>
    t
      .desc(
        'High-level Android startup trace: force-stop, clear logcat, start activity with -W, wait, collect PID-filtered logs, and parse launch/Looper timing.',
      )
      .string('serial', 'Required. Android device serial or emulator id.')
      .string('packageName', 'Required. Android package name, for example com.example.app.')
      .string('activity', 'Optional component activity. Defaults to resolved launcher activity.')
      .number('waitMs', 'Milliseconds to wait after am start before reading logcat.', {
        default: 5000,
      })
      .number('logcatTail', 'Number of logcat records to inspect after launch.', { default: 800 })
      .array(
        'extraPatterns',
        { type: 'string' },
        'Optional additional case-insensitive regex filters for logcat lines.',
      )
      .requiredOpenWorld('serial', 'packageName'),
  ),

  tool('adb_file_pull', (t) =>
    t
      .desc('Pull a file from an Android device using normal ADB permissions.')
      .string('serial', 'Required. Android device serial or emulator id.')
      .string('remotePath', 'Required. Path on the Android device.')
      .string('localPath', 'Required. Destination path on the local filesystem.')
      .requiredOpenWorld('serial', 'remotePath', 'localPath'),
  ),

  tool('adb_file_push', (t) =>
    t
      .desc('Push a local file to an Android device using normal ADB permissions.')
      .string('serial', 'Required. Android device serial or emulator id.')
      .string('localPath', 'Required. Local file path.')
      .string('remotePath', 'Required. Destination path on the Android device.')
      .requiredOpenWorld('serial', 'localPath', 'remotePath'),
  ),

  tool('adb_pull_native_libs', (t) =>
    t
      .desc('Pull native shared libraries (.so) for an installed app from a device.')
      .string('serial', 'Required. Android device serial or emulator id.')
      .string('packageName', 'Required. Android package name, for example com.example.app.')
      .string(
        'outputPath',
        'Optional. Local directory to save extracted libraries into (default: current directory).',
      )
      .boolean(
        'includeSystemLibs',
        'Optional. Include system/nativeLibraryDir entries outside the app package path.',
        { default: false },
      )
      .requiredOpenWorld('serial', 'packageName'),
  ),

  tool('adb_webview_list', (t) =>
    t
      .desc('List debuggable WebView targets connected via ADB.')
      .string('serial', 'Required. Android device serial or emulator id.')
      .number('hostPort', 'Optional. Local port to use for forwarding.', {
        default: ADB_WEBVIEW_HOST_PORT_DEFAULT,
      })
      .requiredOpenWorld('serial'),
  ),

  tool('adb_webview_attach', (t) =>
    t
      .desc('Attach to a WebView via ADB; returns WebSocket debugger URL for CDP.')
      .string('serial', 'Required. Android device serial or emulator id.')
      .string('targetId', 'Required. WebView target id returned by adb_webview_list.')
      .number('hostPort', 'Optional. Local port to use for forwarding.', {
        default: ADB_WEBVIEW_HOST_PORT_DEFAULT,
      })
      .requiredOpenWorld('serial', 'targetId'),
  ),
];
