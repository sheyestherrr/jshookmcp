/**
 * GraphQL replay handler.
 *
 * Replays a GraphQL operation with optional variables via in-browser fetch
 * by default so the current page session is preserved. Callers can opt into
 * Node-side Fetch with `useBrowser=false`.
 *
 * Supports:
 * - Single operation (default): `{ query, variables, operationName }`.
 * - Batch replay: `batch: [{ query, variables?, operationName? }, ...]` → the
 *   body becomes a JSON array and the server response is an array.
 * - Apollo persisted-query (APQ): `persistedQuery: { sha256Hash, version? }`
 *   adds `extensions.persistedQuery` to each operation body so traffic using
 *   APQ / Relay_preload is faithfully replayed.
 */

import type { CodeCollector } from '@server/domains/shared/modules/collector';
import {
  toResponse,
  toError,
  normalizeHeaders,
  validateBrowserEndpoint,
  validateExternalEndpoint,
  serializeForPreview,
} from '@server/domains/graphql/handlers/shared';
import { GRAPHQL_MAX_SCHEMA_CHARS } from '@server/domains/graphql/handlers.impl.core.runtime.shared';
import type { BrowserFetchResult } from '@server/domains/graphql/handlers.impl.core.runtime.shared';
import { argString, argObject, argBool, argArray } from '@server/domains/shared/parse-args';
import { evaluateWithTimeout } from '@modules/collector/PageController';

interface PersistedQuery {
  sha256Hash: string;
  version: number;
}

interface BatchOperation {
  query: string;
  variables: Record<string, unknown>;
  operationName: string | null;
}

interface ReplayMeta {
  mode: 'single' | 'batch';
  operationName: string | null;
  batchSize: number;
}

function normalizePersistedQuery(raw: Record<string, unknown> | undefined): PersistedQuery | null {
  if (!raw) return null;
  const hash = raw.sha256Hash;
  if (typeof hash !== 'string' || hash.trim().length === 0) return null;
  const versionRaw = raw.version;
  const version =
    typeof versionRaw === 'number' && Number.isFinite(versionRaw) ? Math.trunc(versionRaw) : 1;
  return { sha256Hash: hash, version: version < 1 ? 1 : version };
}

function normalizeBatch(
  raw: unknown[] | undefined,
): BatchOperation[] | { error: string } | undefined {
  if (!raw || raw.length === 0) return undefined;
  const ops: BatchOperation[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { error: 'batch items must be objects' };
    }
    const rec = item as Record<string, unknown>;
    const q = rec.query;
    if (typeof q !== 'string' || q.trim().length === 0) {
      return { error: 'Each batch item requires a non-empty query string' };
    }
    const variablesRaw = rec.variables;
    const variables =
      variablesRaw && typeof variablesRaw === 'object' && !Array.isArray(variablesRaw)
        ? (variablesRaw as Record<string, unknown>)
        : {};
    const opNameRaw = rec.operationName;
    const operationName =
      typeof opNameRaw === 'string' && opNameRaw.trim().length > 0 ? opNameRaw.trim() : null;
    ops.push({ query: q, variables, operationName });
  }
  return ops;
}

/** Build the JSON request body string for single or batch mode, with optional APQ. */
function buildReplayBody(
  query: string | null,
  variables: Record<string, unknown>,
  operationName: string | null,
  batch: BatchOperation[] | undefined,
  persistedQuery: PersistedQuery | null,
): string {
  const apqExtension = persistedQuery
    ? {
        extensions: {
          persistedQuery: {
            sha256Hash: persistedQuery.sha256Hash,
            version: persistedQuery.version,
          },
        },
      }
    : {};

  if (batch && batch.length > 0) {
    return JSON.stringify(
      batch.map((op) => ({
        query: op.query,
        variables: op.variables,
        operationName: op.operationName,
        ...apqExtension,
      })),
    );
  }

  return JSON.stringify({
    query,
    variables,
    operationName,
    ...apqExtension,
  });
}

/** Extract a structured `errors[]` from a standard GraphQL single-op response. */
function extractGraphqlErrors(responseJson: unknown): {
  graphqlErrors: unknown[] | null;
  hasGraphqlErrors: boolean;
} {
  if (responseJson && typeof responseJson === 'object' && !Array.isArray(responseJson)) {
    const errors = (responseJson as Record<string, unknown>).errors;
    if (Array.isArray(errors)) {
      return { graphqlErrors: errors, hasGraphqlErrors: errors.length > 0 };
    }
  }
  return { graphqlErrors: null, hasGraphqlErrors: false };
}

export class ReplayHandlers {
  constructor(private collector: CodeCollector) {}

  async handleGraphqlReplay(args: Record<string, unknown>) {
    try {
      const endpoint = argString(args, 'endpoint')?.trim();

      if (!endpoint) {
        return toError('Missing required argument: endpoint');
      }

      const queryRaw = argString(args, 'query');
      const query = typeof queryRaw === 'string' ? queryRaw.trim() : '';
      const variables = argObject(args, 'variables') ?? {};
      const operationNameRaw = argString(args, 'operationName');
      const operationName =
        operationNameRaw && operationNameRaw.trim().length > 0 ? operationNameRaw.trim() : null;
      const headers = normalizeHeaders(args.headers);
      const useBrowser = argBool(args, 'useBrowser', true);

      const persistedQuery = normalizePersistedQuery(argObject(args, 'persistedQuery'));
      const batchResult = normalizeBatch(argArray(args, 'batch'));
      if (batchResult && !Array.isArray(batchResult)) {
        return toError((batchResult as { error: string }).error);
      }
      const batch = batchResult as BatchOperation[] | undefined;

      // query is required for single mode; batch mode supplies its own queries.
      if (!batch && query.length === 0) {
        return toError('Missing required argument: query (or provide a non-empty batch)');
      }

      const body = buildReplayBody(
        batch ? null : query,
        variables,
        operationName,
        batch,
        persistedQuery,
      );

      const meta: ReplayMeta = {
        mode: batch ? 'batch' : 'single',
        operationName: batch ? null : operationName,
        batchSize: batch?.length ?? 0,
      };

      if (useBrowser) {
        const page = await this.collector.getActivePage();
        const currentPageUrl = typeof page.url === 'function' ? page.url() : null;
        const endpointValidationError = await validateBrowserEndpoint(endpoint, currentPageUrl);
        if (endpointValidationError) {
          return toError(endpointValidationError);
        }

        return await this.replayViaBrowser(page, endpoint, body, headers, meta);
      }

      const endpointValidationError = await validateExternalEndpoint(endpoint);
      if (endpointValidationError) {
        return toError(endpointValidationError);
      }

      return await this.replayViaNode(endpoint, body, headers, meta);
    } catch (error) {
      return toError(error);
    }
  }

  private async replayViaNode(
    endpoint: string,
    body: string,
    headers: Record<string, string>,
    meta: ReplayMeta,
  ) {
    const requestHeaders: Record<string, string> = {
      'content-type': 'application/json',
      ...headers,
    };

    let response: Response;
    let responseText: string;
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 10_000);
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: requestHeaders,
          body,
          signal: ac.signal,
        });
        responseText = await response.text();
      } finally {
        clearTimeout(t);
      }
    } catch (error) {
      return toResponse({
        success: false,
        endpoint,
        status: 0,
        statusText: 'FETCH_ERROR',
        mode: meta.mode,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    let responseJson: unknown = null;
    try {
      responseJson = JSON.parse(responseText);
    } catch {
      responseJson = null;
    }

    // Release raw text after parsing
    responseText = '';

    return toResponse(
      buildReplayPayloadFromJson(
        responseJson,
        endpoint,
        response.ok,
        response.status,
        response.statusText,
        responseHeaders,
        meta,
      ),
    );
  }

  private async replayViaBrowser(
    page: Awaited<ReturnType<CodeCollector['getActivePage']>>,
    endpoint: string,
    body: string,
    headers: Record<string, string>,
    meta: ReplayMeta,
  ) {
    const browserResult = (await evaluateWithTimeout(
      page,
      async (input: {
        endpoint: string;
        body: string;
        headers: Record<string, string>;
      }): Promise<BrowserFetchResult> => {
        const requestHeaders: Record<string, string> = {
          'content-type': 'application/json',
          ...input.headers,
        };

        try {
          const ac = new AbortController();
          const t = setTimeout(() => ac.abort(), 10000);
          let responseText: string;
          let response: Response;
          try {
            response = await fetch(input.endpoint, {
              method: 'POST',
              headers: requestHeaders,
              body: input.body,
              signal: ac.signal,
            });
            responseText = await response.text();
          } finally {
            clearTimeout(t);
          }

          let responseJson: unknown = null;
          try {
            responseJson = JSON.parse(responseText);
          } catch {
            responseJson = null;
          }

          const rawText = responseJson === null ? responseText : '';
          responseText = '';

          const responseHeaders: Record<string, string> = {};
          response.headers.forEach((value, key) => {
            responseHeaders[key] = value;
          });

          return {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            responseText: rawText,
            responseJson,
            responseHeaders,
          };
        } catch (error) {
          return {
            ok: false,
            status: 0,
            statusText: 'FETCH_ERROR',
            responseText: '',
            responseJson: null,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
      { endpoint, body, headers },
    )) as BrowserFetchResult;

    const payload: Record<string, unknown> = {
      success: browserResult.ok,
      endpoint,
      status: browserResult.status,
      statusText: browserResult.statusText,
      mode: meta.mode,
      responseHeaders: browserResult.responseHeaders ?? {},
    };

    if (meta.mode === 'single') {
      payload.operationName = meta.operationName;
    } else {
      payload.batchSize = meta.batchSize;
    }

    if (browserResult.responseJson !== null) {
      const responsePreview = serializeForPreview(
        browserResult.responseJson,
        GRAPHQL_MAX_SCHEMA_CHARS,
      );

      payload.responseLength = responsePreview.totalLength;
      payload.responsePreview = responsePreview.preview;
      payload.responseTruncated = responsePreview.truncated;

      if (!responsePreview.truncated) {
        payload.response = browserResult.responseJson;
      }

      // Structured GraphQL errors (single-mode responses only; batch responses
      // are arrays the caller inspects per-item).
      if (meta.mode === 'single') {
        const { graphqlErrors, hasGraphqlErrors } = extractGraphqlErrors(
          browserResult.responseJson,
        );
        if (graphqlErrors !== null) {
          payload.graphqlErrors = graphqlErrors;
          payload.hasGraphqlErrors = hasGraphqlErrors;
        }
      }
    } else if (browserResult.responseText) {
      const text = browserResult.responseText;
      payload.responseFormat = 'text';
      payload.responseLength = text.length;
      payload.responsePreview =
        text.length > GRAPHQL_MAX_SCHEMA_CHARS ? text.slice(0, GRAPHQL_MAX_SCHEMA_CHARS) : text;
      payload.responseTruncated = text.length > GRAPHQL_MAX_SCHEMA_CHARS;
    }

    if (browserResult.error) {
      payload.error = browserResult.error;
    }

    return toResponse(payload);
  }
}

function buildReplayPayloadFromJson(
  responseJson: unknown,
  endpoint: string,
  ok: boolean,
  status: number,
  statusText: string,
  responseHeaders: Record<string, string>,
  meta: ReplayMeta,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    success: ok,
    endpoint,
    status,
    statusText,
    mode: meta.mode,
    responseHeaders,
  };

  if (meta.mode === 'single') {
    payload.operationName = meta.operationName;
  } else {
    payload.batchSize = meta.batchSize;
  }

  if (responseJson !== null) {
    const responsePreview = serializeForPreview(responseJson, GRAPHQL_MAX_SCHEMA_CHARS);

    payload.responseLength = responsePreview.totalLength;
    payload.responsePreview = responsePreview.preview;
    payload.responseTruncated = responsePreview.truncated;

    if (!responsePreview.truncated) {
      payload.response = responseJson;
    }

    if (meta.mode === 'single') {
      const { graphqlErrors, hasGraphqlErrors } = extractGraphqlErrors(responseJson);
      if (graphqlErrors !== null) {
        payload.graphqlErrors = graphqlErrors;
        payload.hasGraphqlErrors = hasGraphqlErrors;
      }
    }
  }

  return payload;
}
