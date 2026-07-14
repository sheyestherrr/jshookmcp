/**
 * Syscall hook / monitoring configuration.
 * Prefixes: SYSCALL_TRACE_*
 */

import { int } from './helpers.js';

/** Timeout (ms) for strace/dtrace/ETW subprocess spawn readiness. */
export const SYSCALL_TRACE_SPAWN_TIMEOUT_MS = int('JSHOOK_SYSCALL_TRACE_SPAWN_TIMEOUT_MS', 3_000);
