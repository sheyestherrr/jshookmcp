/**
 * Cross-domain coordination: orchestrator, webhook, macro, shared state board.
 * Prefixes: ORCHESTRATOR_*, WEBHOOK_*, MACRO_*, COORDINATION_*
 */

import { int } from './helpers.js';

/* ================================================================== */
/*  Cross-domain orchestration                                         */
/* ================================================================== */

/** Default per-command processing timeout inside the webhook command queue. */
export const WEBHOOK_PROCESS_TIMEOUT_MS = int('WEBHOOK_PROCESS_TIMEOUT_MS', 10_000);

/** Default per-step timeout for the cross-domain orchestrator. */
export const ORCHESTRATOR_STEP_TIMEOUT_MS = int('ORCHESTRATOR_STEP_TIMEOUT_MS', 10_000);

/** Default overall macro timeout (MacroRunner). */
export const MACRO_DEFAULT_TIMEOUT_MS = int('MACRO_DEFAULT_TIMEOUT_MS', 120_000);

/** Default per-invocation timeout for built-in macro definitions. */
export const MACRO_BUILTIN_TIMEOUT_MS = int('MACRO_BUILTIN_TIMEOUT_MS', 60_000);

/* ================================================================== */
/*  Coordination domain                                                */
/* ================================================================== */

/** Timeout for page.goto when restoring a page snapshot. */
export const COORDINATION_GOTO_TIMEOUT_MS = int('COORDINATION_GOTO_TIMEOUT_MS', 30_000);
