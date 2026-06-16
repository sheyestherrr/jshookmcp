/**
 * Streaming protocols: WebSocket, SSE.
 * Prefixes: WS_*, SSE_*
 */

import { int } from './helpers.js';

/* ================================================================== */
/*  WebSocket                                                          */
/* ================================================================== */

export const WS_PAYLOAD_PREVIEW_LIMIT = int('WS_PAYLOAD_PREVIEW_LIMIT', 200);
export const WS_PAYLOAD_SAMPLE_LIMIT = int('WS_PAYLOAD_SAMPLE_LIMIT', 2_000);
