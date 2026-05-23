import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ServerRuntimeState,
  restorePendingDomainActivations,
} from '@server/runtime/ServerRuntimeState';

const state = vi.hoisted(() => ({
  ensureDomainLoaded: vi.fn(async () => null),
  getAllKnownDomains: vi.fn(() => new Set(['browser', 'network'])),
  getToolsByDomains: vi.fn((domains: string[]) => {
    if (domains.includes('browser')) {
      return [
        {
          name: 'page_navigate',
          description: 'Navigate',
          inputSchema: { type: 'object', properties: {} },
        },
      ];
    }
    return [];
  }),
  createToolHandlerMap: vi.fn((_: unknown, names?: Set<string>) =>
    Object.fromEntries(
      [...(names ?? new Set<string>())].map((name) => [name, vi.fn(async () => ({ name }))]),
    ),
  ),
  startDomainTtl: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@server/registry/index', () => ({
  ensureDomainLoaded: state.ensureDomainLoaded,
  getAllKnownDomains: state.getAllKnownDomains,
}));

vi.mock('@server/ToolCatalog', () => ({
  getToolsByDomains: state.getToolsByDomains,
}));

vi.mock('@server/ToolHandlerMap', () => ({
  createToolHandlerMap: state.createToolHandlerMap,
}));

vi.mock('@server/MCPServer.activation.ttl', () => ({
  startDomainTtl: state.startDomainTtl,
}));

vi.mock('@utils/logger', () => ({
  logger: state.logger,
}));

function createCtx(runtimeState: ServerRuntimeState) {
  return {
    selectedTools: [],
    activatedToolNames: new Set<string>(),
    extensionToolsByName: new Map<string, unknown>(),
    enabledDomains: new Set<string>(),
    activatedRegisteredTools: new Map<string, unknown>(),
    domainTtlEntries: new Map<string, unknown>(),
    metaToolsByName: new Map<string, unknown>(),
    router: {
      addHandlers: vi.fn(),
    },
    handlerDeps: {},
    registerSingleTool: vi.fn((toolDef: { name: string }) => ({
      remove: vi.fn(),
      name: toolDef.name,
    })),
    server: {
      sendToolListChanged: vi.fn(async () => undefined),
    },
    getDomainInstance: vi.fn((key: string) =>
      key === 'serverRuntimeState' ? runtimeState : undefined,
    ),
    mcpLog: { info: vi.fn(), debug: vi.fn(), warning: vi.fn(), error: vi.fn() },
  } as any;
}

describe('ServerRuntimeState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('restores pending domain activations into a fresh context', async () => {
    const runtimeState = new ServerRuntimeState();
    runtimeState.restoreSnapshot({
      schemaVersion: 1,
      savedAt: '2026-05-23T00:00:00.000Z',
      activatedDomains: ['browser'],
      domainTtls: {
        browser: {
          ttlMinutes: 30,
          toolNames: ['page_navigate'],
        },
      },
      browserAttach: {
        endpoint: null,
        selectedIndex: null,
        selectedUrl: null,
        selectedTitle: null,
        selectedTargetId: null,
        browserPid: null,
        rendererPid: null,
        attachedAt: null,
      },
      toolCoverage: {},
    });

    const ctx = createCtx(runtimeState);
    await restorePendingDomainActivations(ctx);

    expect(ctx.enabledDomains.has('browser')).toBe(true);
    expect(ctx.registerSingleTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'page_navigate' }),
    );
    expect(state.startDomainTtl).toHaveBeenCalledWith(ctx, 'browser', 30, ['page_navigate']);
    expect(ctx.server.sendToolListChanged).toHaveBeenCalledOnce();
  });
});
