/**
 * Shared CDP session helper for v8-inspector sub-handlers.
 *
 * Both `deopt-trace.ts` and `turbofan-inspect.ts` open a CDP session
 * from a page getter; this helper deduplicates the ~20-line pattern.
 */

export interface CDPSessionLike {
  send<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
  detach(): Promise<void>;
}

export async function createCDPSession(
  getPage?: () => Promise<unknown>,
): Promise<CDPSessionLike | null> {
  if (!getPage) return null;
  try {
    const page = await getPage();
    if (
      page &&
      typeof page === 'object' &&
      'createCDPSession' in page &&
      typeof (page as Record<string, unknown>).createCDPSession === 'function'
    ) {
      const factory = (page as Record<string, unknown>).createCDPSession as () => Promise<unknown>;
      return (await factory()) as CDPSessionLike;
    }
    return null;
  } catch {
    return null;
  }
}
