/**
 * Browser automation: page operations, browser pool, DOM inspection, collector, frame handling.
 * Prefixes: BROWSER_*, PAGE_*, DOM_*, SCRIPTS_*
 */

import { int } from './helpers.js';

/* ================================================================== */
/*  Browser pool                                                       */
/* ================================================================== */

/** Browser pool idle timeout before auto-disconnect. Default: 5 minutes. */
export const BROWSER_POOL_IDLE_TIMEOUT_MS = int('BROWSER_POOL_IDLE_TIMEOUT_MS', 300_000);

/** Max tabs per pooled browser instance. */
export const BROWSER_POOL_MAX_TABS = int('BROWSER_POOL_MAX_TABS', 10);

/* ================================================================== */
/*  Page operations                                                    */
/* ================================================================== */

/** Timeout for waiting on an iframe selector during frame resolution. */
export const PAGE_FRAME_SELECTOR_TIMEOUT_MS = int('PAGE_FRAME_SELECTOR_TIMEOUT_MS', 10_000);

/** Timeout for waitForNetworkIdle in PageController. */
export const PAGE_NETWORK_IDLE_TIMEOUT_MS = int('PAGE_NETWORK_IDLE_TIMEOUT_MS', 30_000);

/* ================================================================== */
/*  DOM inspection                                                     */
/* ================================================================== */

/** Default limit for querySelectorAll results in DOMInspector. */
export const DOM_QUERY_DEFAULT_LIMIT = int('DOM_QUERY_DEFAULT_LIMIT', 50);

/** Timeout for waitForElement (waitForSelector) in DOMInspector. */
export const DOM_WAIT_ELEMENT_TIMEOUT_MS = int('DOM_WAIT_ELEMENT_TIMEOUT_MS', 30_000);

/* ================================================================== */
/*  Browser scripts                                                    */
/* ================================================================== */

/** Max scripts tracked by the script collector. */
export const SCRIPTS_MAX_CAP = int('SCRIPTS_MAX_CAP', 500);
