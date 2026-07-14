/**
 * NtModuleEnumerator unit tests.
 *
 * koffi is mocked so no real syscalls are issued. A hand-crafted Buffer that
 * mimics RTL_PROCESS_MODULES is fed through the mocked NtQuerySystemInformation
 * to validate parsing logic only (host is macOS; runtime requires Windows).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ffiCall = vi.fn();
const funcFactory = vi.fn(() => ffiCall);
const mockLib = { func: funcFactory };

vi.mock('koffi', () => ({
  default: {
    load: vi.fn(() => mockLib),
    // identity so the mocked FFI receives the actual Buffer references.
    address: vi.fn((buf: unknown) => buf),
  },
}));

import { enumerateKernelModules, findKernelModule } from '@native/syscall/NtModuleEnumerator';

const ORIGINAL_PLATFORM = process.platform;

function setPlatform(value: string): void {
  Object.defineProperty(process, 'platform', { value, configurable: true });
}

// Layout constants mirrored from NtModuleEnumerator (kept local for crafting).
const MODULE_RECORD_SIZE = 288;
const FULL_PATH_OFFSET = 32;

/**
 * Build a hand-crafted RTL_PROCESS_MODULES buffer containing exactly one module:
 * ntoskrnl.exe at ImageBase 0xfffff80012340000.
 */
function buildSingleModuleBuffer(): Buffer {
  const buf = Buffer.alloc(4 + MODULE_RECORD_SIZE);

  // ULONG ModulesCount = 1
  buf.writeUInt32LE(1, 0);

  const rec = 4; // first record starts right after ModulesCount

  // PVOID ImageBase @ offset 8
  buf.writeBigUInt64LE(0xfffff80012340000n, rec + 8);

  // ULONG ImageSize @ offset 16
  buf.writeUInt32LE(0x800000, rec + 16);

  // FullPathName @ offset 32
  const fullPath = '\\SystemRoot\\system32\\ntoskrnl.exe';
  buf.write(fullPath, rec + FULL_PATH_OFFSET, 'ascii');

  // OffsetToFileName: offset of 'ntoskrnl.exe' within FullPathName
  const slashIdx = fullPath.lastIndexOf('\\');
  buf.writeUInt16LE(slashIdx + 1, rec + 30);

  return buf;
}

/**
 * Mock NtQuerySystemInformation: small buffers behave as a probe
 * (STATUS_INFO_LENGTH_MISMATCH + required length); a large enough buffer
 * receives the crafted data (STATUS_SUCCESS).
 */
function installSuccessMock(crafted: Buffer): void {
  ffiCall.mockImplementation((_infoClass: number, bufArg: Buffer, _len: number, retLen: Buffer) => {
    if (bufArg.length < crafted.length) {
      retLen.writeUInt32LE(crafted.length, 0);
      return 0xc0000004 | 0; // STATUS_INFO_LENGTH_MISMATCH
    }
    crafted.copy(bufArg, 0, 0, crafted.length);
    retLen.writeUInt32LE(crafted.length, 0);
    return 0; // STATUS_SUCCESS
  });
}

afterEach(() => {
  setPlatform(ORIGINAL_PLATFORM);
  ffiCall.mockReset();
});

describe('enumerateKernelModules — platform guard', () => {
  it('throws on non-win32 platform', () => {
    // Arrange
    setPlatform('darwin');

    // Act + Assert
    expect(() => enumerateKernelModules()).toThrow(/Windows-only/);
  });
});

describe('enumerateKernelModules — parsing', () => {
  beforeEach(() => {
    setPlatform('win32');
  });

  it('parses a single RTL_PROCESS_MODULE (imageBase + shortName)', () => {
    // Arrange
    const crafted = buildSingleModuleBuffer();
    installSuccessMock(crafted);

    // Act
    const modules = enumerateKernelModules();

    // Assert
    expect(modules).toHaveLength(1);
    const mod = modules[0]!;
    expect(mod.imageBase).toBe(0xfffff80012340000n);
    expect(mod.imageSize).toBe(0x800000);
    expect(mod.fullPath).toBe('\\SystemRoot\\system32\\ntoskrnl.exe');
    expect(mod.shortName).toBe('ntoskrnl.exe');
  });

  it('throws when NtQuerySystemInformation returns an error NTSTATUS', () => {
    // Arrange — probe returns an unexpected failure.
    ffiCall.mockReturnValue(0xc0000005 | 0); // STATUS_ACCESS_VIOLATION

    // Act + Assert
    expect(() => enumerateKernelModules()).toThrow(/NtQuerySystemInformation .* failed/);
  });
});

describe('findKernelModule', () => {
  beforeEach(() => {
    setPlatform('win32');
    installSuccessMock(buildSingleModuleBuffer());
  });

  it("returns the module matching 'ntoskrnl' (case-insensitive substring)", () => {
    // Act
    const found = findKernelModule('ntoskrnl');

    // Assert
    expect(found).not.toBeNull();
    expect(found?.shortName).toBe('ntoskrnl.exe');
    expect(found?.imageBase).toBe(0xfffff80012340000n);
  });

  it("returns null when no module matches 'nope'", () => {
    // Act + Assert
    expect(findKernelModule('nope')).toBeNull();
  });
});
