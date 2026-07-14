/**
 * NtModuleEnumerator — runtime kernel-module enumeration via
 * `NtQuerySystemInformation(SystemModuleInformation)`.
 *
 * Complements SyscallResolver (which does static on-disk ntdll parsing) by
 * listing the modules actually loaded in kernel address space at runtime.
 *
 * Win32-only: ntdll.dll is lazy-loaded via koffi. The host for this project is
 * macOS, so runtime verification requires a Windows host. The accompanying stub
 * test (tests/native/syscall/NtModuleEnumerator.test.ts) validates the
 * RTL_PROCESS_MODULES parsing logic only, with koffi mocked.
 *
 * Note: SystemModuleInformation (class 11) is generally accessible to
 * administrator-level processes; some other information classes additionally
 * require SeDebugPrivilege.
 */
import koffi from 'koffi';

// ── Constants ────────────────────────────────────────────────────────────────

/** SYSTEM_INFORMATION_CLASS::SystemModuleInformation → RTL_PROCESS_MODULES. */
const SYSTEM_MODULE_INFORMATION = 11;

/** NTSTATUS codes (unsigned; the FFI returns int32, use `>>> 0` to compare). */
const STATUS_SUCCESS = 0x00000000;
const STATUS_INFO_LENGTH_MISMATCH = 0xc0000004;

/**
 * RTL_PROCESS_MODULE_INFORMATION layout on Win x64 (288 bytes total):
 *
 *   offset  size  field
 *   ------  ----  -------------------------------
 *      0      2   USHORT Section
 *      2      2   USHORT MappedBase  (deprecated)
 *      4      4   (implicit alignment padding)
 *      8      8   PVOID  ImageBase
 *     16      4   ULONG  ImageSize
 *     20      4   ULONG  Flags
 *     24      2   USHORT LoadOrderIndex
 *     26      2   USHORT InitOrderIndex
 *     28      2   USHORT LoadCount
 *     30      2   USHORT OffsetToFileName
 *     32    256   UCHAR  FullPathName[256]
 *
 * RTL_PROCESS_MODULES layout:
 *   offset  size  field
 *   ------  ----  -------------------------------
 *      0      4   ULONG ModulesCount
 *      4   var   RTL_PROCESS_MODULE_INFORMATION Modules[]
 *
 * ImageBase is read with Buffer#readBigUInt64LE at record offset 8. The short
 * module name is derived from FullPathName[OffsetToFileName].
 */
const MODULE_RECORD_SIZE = 288;
const FULL_PATH_OFFSET = 32;
const FULL_PATH_SIZE = 256;

// ── Types ────────────────────────────────────────────────────────────────────

export interface KernelModule {
  imageBase: bigint;
  imageSize: number;
  fullPath: string;
  shortName: string;
}

// ── FFI lazy loaders (mirror DirectNtApi conventions) ────────────────────────

let _ntdll: ReturnType<typeof koffi.load> | null = null;
function ntdll(): ReturnType<typeof koffi.load> {
  if (!_ntdll) _ntdll = koffi.load('ntdll.dll');
  return _ntdll;
}

let _NtQuerySystemInformation: ReturnType<ReturnType<typeof koffi.load>['func']> | null = null;
function getNtQSI() {
  if (!_NtQuerySystemInformation) {
    // NTSTATUS NtQuerySystemInformation(
    //   SYSTEM_INFORMATION_CLASS infoClass,
    //   PVOID                    buf,
    //   ULONG                    len,
    //   PULONG                   returnLen);
    _NtQuerySystemInformation = ntdll().func(
      'int32 NtQuerySystemInformation(uint32, void *, uint32, uint32 *)',
    );
  }
  return _NtQuerySystemInformation;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const NTSTATUS_MESSAGES: Record<number, string> = {
  0x00000000: 'STATUS_SUCCESS',
  0xc0000004: 'STATUS_INFO_LENGTH_MISMATCH',
  0xc0000023: 'STATUS_BUFFER_TOO_SMALL',
  0xc0000005: 'STATUS_ACCESS_VIOLATION',
  0xc0000022: 'STATUS_ACCESS_DENIED',
  0xc000000d: 'STATUS_INVALID_PARAMETER',
  0xc0000017: 'STATUS_NO_MEMORY',
  0xc0000142: 'STATUS_DLL_INIT_FAILED',
};

function formatNtStatus(status: number): string {
  const u = status >>> 0;
  const hex = `0x${u.toString(16).padStart(8, '0')}`;
  return `${hex} (${NTSTATUS_MESSAGES[u] ?? 'UNKNOWN'})`;
}

function parseModules(buf: Buffer): KernelModule[] {
  const count = buf.readUInt32LE(0);
  const modules: KernelModule[] = [];
  for (let i = 0; i < count; i++) {
    const base = 4 + i * MODULE_RECORD_SIZE;
    if (base + MODULE_RECORD_SIZE > buf.length) break;

    const imageBase = buf.readBigUInt64LE(base + 8);
    const imageSize = buf.readUInt32LE(base + 16);
    const offsetToFileName = buf.readUInt16LE(base + 30);

    const pathStart = base + FULL_PATH_OFFSET;
    const pathBuf = buf.subarray(pathStart, pathStart + FULL_PATH_SIZE);
    const pathNul = pathBuf.indexOf(0);
    const fullPath = (pathNul >= 0 ? pathBuf.subarray(0, pathNul) : pathBuf).toString('ascii');

    let shortName = '';
    if (offsetToFileName > 0 && offsetToFileName < FULL_PATH_SIZE) {
      const nameBuf = pathBuf.subarray(offsetToFileName);
      const nameNul = nameBuf.indexOf(0);
      shortName = (nameNul >= 0 ? nameBuf.subarray(0, nameNul) : nameBuf).toString('ascii');
    }

    modules.push({ imageBase, imageSize, fullPath, shortName });
  }
  return modules;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Enumerate loaded kernel modules via NtQuerySystemInformation.
 * First probes with a small buffer (STATUS_INFO_LENGTH_MISMATCH → required
 * length), then allocates the exact length and queries again. Throws on
 * non-Windows hosts or unexpected NTSTATUS values.
 */
export function enumerateKernelModules(): KernelModule[] {
  if (process.platform !== 'win32') {
    throw new Error('NtQuerySystemInformation module enumeration is Windows-only');
  }

  const fn = getNtQSI();

  // First call: probe with a small buffer to learn the required length.
  const probe = Buffer.alloc(16);
  const returnLen = Buffer.alloc(4);
  let status = fn(
    SYSTEM_MODULE_INFORMATION,
    koffi.address(probe),
    probe.length,
    koffi.address(returnLen),
  ) as number;

  if (status >>> 0 !== STATUS_INFO_LENGTH_MISMATCH && status >>> 0 !== STATUS_SUCCESS) {
    throw new Error(`NtQuerySystemInformation probe failed: ${formatNtStatus(status)}`);
  }

  const required = returnLen.readUInt32LE(0);
  if (required === 0) {
    return [];
  }

  // Second call: allocate the required length and fetch the data.
  const data = Buffer.alloc(required);
  returnLen.writeUInt32LE(0, 0);
  status = fn(
    SYSTEM_MODULE_INFORMATION,
    koffi.address(data),
    data.length,
    koffi.address(returnLen),
  ) as number;

  if (status >>> 0 !== STATUS_SUCCESS) {
    throw new Error(`NtQuerySystemInformation query failed: ${formatNtStatus(status)}`);
  }

  return parseModules(data);
}

/**
 * Find the first kernel module whose short name contains `name` (case-insensitive
 * substring match). Returns null if no module matches.
 * Example: findKernelModule('ntoskrnl') → the ntoskrnl.exe module record.
 */
export function findKernelModule(name: string): KernelModule | null {
  const needle = name.toLowerCase();
  const modules = enumerateKernelModules();
  return modules.find((m) => m.shortName.toLowerCase().includes(needle)) ?? null;
}
