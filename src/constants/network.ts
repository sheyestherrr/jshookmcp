/**
 * Network monitoring: HAR export, replay, ICMP probe, TLS fingerprinting, bot detection, DNS.
 * Prefixes: NETWORK_*, ICMP_*, PROTO_*, BOT_*, FETCH_*
 */

import { int, float } from './helpers.js';

/* ================================================================== */
/*  Network replay                                                     */
/* ================================================================== */

export const NETWORK_REPLAY_TIMEOUT_MS = int('NETWORK_REPLAY_TIMEOUT_MS', 30_000);
export const NETWORK_REPLAY_MAX_BODY_BYTES = int('NETWORK_REPLAY_MAX_BODY_BYTES', 512_000);
export const NETWORK_REPLAY_MAX_REDIRECTS = int('NETWORK_REPLAY_MAX_REDIRECTS', 5);
export const NETWORK_HAR_BODY_CONCURRENCY = int('NETWORK_HAR_BODY_CONCURRENCY', 4);

/* ================================================================== */
/*  ICMP probe                                                         */
/* ================================================================== */

/** Default timeout for a single ICMP ping probe. */
export const ICMP_PROBE_TIMEOUT_MS = int('ICMP_PROBE_TIMEOUT_MS', 5_000);

/** Default max hops for traceroute. */
export const ICMP_TRACEROUTE_MAX_HOPS = int('ICMP_TRACEROUTE_MAX_HOPS', 30);

/** Default ICMP packet payload size in bytes. */
export const ICMP_DEFAULT_PACKET_SIZE = int('ICMP_DEFAULT_PACKET_SIZE', 32);

/* ================================================================== */
/*  Protocol fingerprint detection                                     */
/* ================================================================== */

export const PROTO_TLS_MIN_RECORD_LEN = int('PROTO_TLS_MIN_RECORD_LEN', 4);
export const PROTO_TLS_CONFIDENCE = float('PROTO_TLS_CONFIDENCE', 0.95);
export const PROTO_WS_CONFIDENCE = float('PROTO_WS_CONFIDENCE', 0.85);
export const PROTO_HTTP_CONFIDENCE = float('PROTO_HTTP_CONFIDENCE', 0.95);
export const PROTO_SSH_CONFIDENCE = float('PROTO_SSH_CONFIDENCE', 0.95);

/* ================================================================== */
/*  Network bot detection                                              */
/* ================================================================== */

export const BOT_DETECT_LIMIT_DEFAULT = int('BOT_DETECT_LIMIT_DEFAULT', 50);
export const BOT_DETECT_LIMIT_MIN = int('BOT_DETECT_LIMIT_MIN', 1);
export const BOT_DETECT_LIMIT_MAX = int('BOT_DETECT_LIMIT_MAX', 500);

/* ================================================================== */
/*  HTTP Fetch                                                         */
/* ================================================================== */

export const FETCH_ABORT_TIMEOUT_MS = int('FETCH_ABORT_TIMEOUT_MS', 10_000);
