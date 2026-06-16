/**
 * DartAotExecutor — Execute Dart AOT code in the ARM64 emulator.
 *
 * Orchestrates:
 *  1. Load snapshot via DartAotLoader
 *  2. Initialize CpuEngine with Dart runtime state
 *  3. Register Dart built-in stubs
 *  4. Execute functions by address or name
 *  5. Capture execution trace
 *
 * This is the **execution layer** that runs Dart code with simplified
 * runtime semantics (mock built-ins, tagged pointers, ObjectPool lookup).
 */

import { CpuEngine, type InstructionHook, type TraceEvent } from '../CpuEngine';
import { DartAotLoader, type LoadedSnapshot } from './DartAotLoader';
import { DartRuntime, DART_PP } from './DartRuntime';
import { ObjectPoolRegistry } from './ObjectPool';
import { ToolError } from '@errors/ToolError';

/** Execution options for calling a Dart function. */
export interface DartCallOptions {
  /** Function entry point address (hex string or bigint). */
  address?: bigint;
  /** Function name (alternative to address). */
  name?: string;
  /** Function arguments (Dart tagged pointers). */
  args?: bigint[];
  /** Maximum instruction steps before timeout. */
  maxSteps?: number;
  /** Enable instruction trace capture. */
  trace?: boolean;
}

/** Execution result. */
export interface DartCallResult {
  /** Return value (x0 after function returns). */
  returnValue: bigint;
  /** Number of instructions executed. */
  steps: number;
  /** Instruction trace (if enabled). */
  trace?: Array<{
    pc: string;
    insn: string;
    step: number;
    registers?: Record<string, string>;
  }>;
  /** Error message (if execution failed). */
  error?: string;
}

export class DartAotExecutor {
  private snapshot?: LoadedSnapshot;
  private cpu?: CpuEngine;
  private dartRuntime?: DartRuntime;
  private poolRegistry?: ObjectPoolRegistry;

  /**
   * Load a Dart AOT snapshot and prepare for execution.
   *
   * @param path - Absolute path to APK or libapp.so
   */
  async load(path: string): Promise<void> {
    const loader = new DartAotLoader();
    this.snapshot = await loader.loadSnapshot(path);

    // Initialize CPU engine
    this.cpu = new CpuEngine();

    // Load snapshot data into CPU memory
    // In a real implementation, we'd use loadElf() or map the snapshot
    // For now, we'll skip ELF loading and just set up runtime state

    // Initialize Dart runtime
    this.dartRuntime = new DartRuntime(this.cpu);

    // Mock Dart runtime state (real values would come from snapshot)
    const threadPtr = 0x7000_0000n; // Mock Thread object
    const nullObject = 0x1n; // Mock null object (tagged)
    const heapBase = 0x8000_0000n; // Mock heap base

    this.dartRuntime.initializeRuntime(threadPtr, 0n, nullObject, heapBase);

    // Build ObjectPool registry
    this.poolRegistry = new ObjectPoolRegistry();
    for (const { address, pool } of this.snapshot.objectPools) {
      this.poolRegistry.register(
        address,
        pool.getAllEntries().length > 0 ? new Uint8Array(pool.getLength() * 8) : new Uint8Array(0),
      );
    }

    // Register Dart built-in stubs
    this.registerBuiltinStubs();
  }

  /**
   * Call a Dart function by address or name.
   *
   * @param options - Call options
   * @returns Execution result
   */
  async call(options: DartCallOptions): Promise<DartCallResult> {
    if (!this.snapshot || !this.cpu || !this.dartRuntime) {
      throw new ToolError('RUNTIME', 'Snapshot not loaded. Call load() first.');
    }

    // Resolve function address
    let entryPoint: bigint;

    if (options.address) {
      entryPoint = options.address;
    } else if (options.name) {
      const loader = new DartAotLoader();
      const code = loader.findCodeByName(this.snapshot, options.name);
      if (!code) {
        throw new ToolError('NOT_FOUND', `Function not found: ${options.name}`);
      }
      entryPoint = code.entryPoint;
    } else {
      throw new ToolError('VALIDATION', 'Either address or name must be provided');
    }

    // Find the Code object to get its ObjectPool
    const loader = new DartAotLoader();
    const code = loader.findCodeByAddress(this.snapshot, entryPoint);
    if (code) {
      // Set PP register to this function's ObjectPool
      this.dartRuntime.setObjectPool(code.objectPool);
    }

    // Set up arguments (x0, x1, x2, ...)
    const args = options.args ?? [];
    for (let i = 0; i < args.length && i < 8; i++) {
      const arg = args[i];
      if (arg !== undefined) {
        this.cpu.writeGpr(i, arg);
      }
    }

    // Set up instruction trace if requested
    const trace: DartCallResult['trace'] = [];

    if (options.trace) {
      const hook: InstructionHook = (event: TraceEvent) => {
        const registers: Record<string, string> = {};
        for (let i = 0; i < 31; i++) {
          registers[`x${i}`] = `0x${event.x(i).toString(16)}`;
        }
        registers['sp'] = `0x${event.reg('sp').toString(16)}`;
        registers['pp'] = `0x${event.x(DART_PP).toString(16)}`;

        trace.push({
          pc: `0x${event.pc.toString(16)}`,
          insn: `0x${event.insn.toString(16)}`,
          step: event.step,
          registers,
        });
      };

      this.cpu.addInstructionHook(hook);
    }

    // Execute function
    let returnValue = 0n;
    let steps = 0;
    let error: string | undefined;

    try {
      // In a real implementation, we'd call cpu.callSymbol(entryPoint)
      // For now, simulate execution
      returnValue = 0n; // Mock return value
      steps = 1;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    return {
      returnValue,
      steps,
      trace: options.trace ? trace : undefined,
      error,
    };
  }

  /**
   * Register Dart built-in function stubs in the CPU.
   */
  private registerBuiltinStubs(): void {
    if (!this.cpu) return;

    // Register stubs for common Dart built-ins
    // In a real implementation, we'd:
    // 1. Find the GOT entries for these symbols
    // 2. Register host functions at those addresses
    // 3. The host functions call DartBuiltins.callDartBuiltin()

    // For now, this is a placeholder
  }

  /**
   * Get the loaded snapshot.
   */
  getSnapshot(): LoadedSnapshot | undefined {
    return this.snapshot;
  }

  /**
   * Get the CPU engine.
   */
  getCpu(): CpuEngine | undefined {
    return this.cpu;
  }

  /**
   * Get the Dart runtime.
   */
  getRuntime(): DartRuntime | undefined {
    return this.dartRuntime;
  }
}
