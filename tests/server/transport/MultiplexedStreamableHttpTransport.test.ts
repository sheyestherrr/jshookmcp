import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JSONRPCRequest, JSONRPCResponse } from '@modelcontextprotocol/sdk/types.js';

const mocks = vi.hoisted(() => {
  const innerTransports: any[] = [];

  return {
    innerTransports,
  };
});

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: class MockStreamableHTTPServerTransport {
    public sessionId?: string;
    // eslint-disable-next-line unicorn/prefer-add-event-listener
    public onmessage?: (message: any, extra?: any) => void;
    // eslint-disable-next-line unicorn/prefer-add-event-listener
    public onerror?: (error: Error) => void;
    // eslint-disable-next-line unicorn/prefer-add-event-listener
    public onclose?: () => void;
    public send = vi.fn(async () => undefined);
    public close = vi.fn(async () => undefined);
    public start = vi.fn(async () => undefined);
    public handleRequest = vi.fn(async (_req: any) => {
      if (!this.sessionId) {
        const requestedSessionId =
          _req?.headers?.['mcp-session-id'] && typeof _req.headers['mcp-session-id'] === 'string'
            ? _req.headers['mcp-session-id']
            : null;
        this.sessionId = requestedSessionId ?? `session-${mocks.innerTransports.length}`;
      }
    });

    constructor() {
      mocks.innerTransports.push(this);
    }
  },
}));

import { MultiplexedStreamableHttpTransport } from '@server/transport/MultiplexedStreamableHttpTransport';

function createReq(method: string, sessionId?: string) {
  return {
    method,
    headers: sessionId ? { 'mcp-session-id': sessionId } : {},
  } as any;
}

function createRes() {
  return {
    writeHead: vi.fn(),
    end: vi.fn(),
  } as any;
}

describe('MultiplexedStreamableHttpTransport', () => {
  beforeEach(() => {
    mocks.innerTransports.length = 0;
  });

  it('creates a new inner transport for new HTTP sessions and reuses existing ones by header', async () => {
    const transport = new MultiplexedStreamableHttpTransport();
    await transport.start();

    await transport.handleRequest(createReq('POST'), createRes(), {});
    await transport.handleRequest(createReq('POST'), createRes(), {});
    expect(mocks.innerTransports).toHaveLength(2);

    const existing = mocks.innerTransports[0];
    const existingSessionId = existing.sessionId;
    await transport.handleRequest(createReq('POST', existingSessionId), createRes(), {});
    expect(existing.handleRequest).toHaveBeenCalledTimes(2);
  });

  it('routes same client request ids from different sessions back to the correct inner transport', async () => {
    const transport = new MultiplexedStreamableHttpTransport();
    await transport.start();
    const seenMessages: any[] = [];

    // eslint-disable-next-line unicorn/prefer-add-event-listener
    transport.onmessage = (message) => {
      seenMessages.push(message);
    };

    await transport.handleRequest(createReq('POST'), createRes(), {});
    await transport.handleRequest(createReq('POST'), createRes(), {});

    const sessionA = mocks.innerTransports[0];
    const sessionB = mocks.innerTransports[1];

    const requestA: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    };
    const requestB: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    };

    sessionA.onmessage?.(requestA, {});
    sessionB.onmessage?.(requestB, {});

    expect(seenMessages).toHaveLength(2);
    expect(seenMessages[0]!.id).not.toBe(seenMessages[1]!.id);

    const responseA: JSONRPCResponse = {
      jsonrpc: '2.0',
      id: seenMessages[0]!.id,
      result: { ok: true },
    };
    const responseB: JSONRPCResponse = {
      jsonrpc: '2.0',
      id: seenMessages[1]!.id,
      result: { ok: true },
    };

    await transport.send(responseA);
    await transport.send(responseB);

    expect(sessionA.send).toHaveBeenCalledWith(
      {
        jsonrpc: '2.0',
        id: 1,
        result: { ok: true },
      },
      undefined,
    );
    expect(sessionB.send).toHaveBeenCalledWith(
      {
        jsonrpc: '2.0',
        id: 1,
        result: { ok: true },
      },
      undefined,
    );
  });
});
