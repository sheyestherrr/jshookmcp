/**
 * canvas_scene_dump tool handler.
 *
 * Delegates to engine-specific adapter after fingerprinting.
 */
import type { PageController } from '@server/domains/canvas/dependencies';
import type { CanvasSceneDump, DumpOpts } from '@server/domains/canvas/types';
import { createStub } from '@server/domains/shared/capabilities';
import { fingerprintCanvas, resolveAdapter, buildEnv } from './shared';

export async function handleSceneDump(
  pageController: PageController,
  args: Record<string, unknown>,
): Promise<CanvasSceneDump> {
  const canvasId = args['canvasId'] as string | undefined;
  const maxDepth = (args['maxDepth'] as number | undefined) ?? 20;
  const onlyInteractive = (args['onlyInteractive'] as boolean | undefined) ?? false;
  const onlyVisible = (args['onlyVisible'] as boolean | undefined) ?? false;

  const opts: DumpOpts = { canvasId, maxDepth, onlyInteractive, onlyVisible };

  const detection = await fingerprintCanvas(pageController, canvasId);
  if (!detection) {
    return partialSceneDump(pageController, canvasId);
  }

  const adapter = resolveAdapter(detection);
  if (!adapter) {
    return partialSceneDump(pageController, canvasId);
  }

  return adapter.dumpScene(buildEnv(pageController), opts);
}

async function partialSceneDump(
  pageController: PageController,
  canvasId?: string,
): Promise<CanvasSceneDump> {
  const canvases = await pageController.evaluate<
    Array<{
      id: string;
      width: number;
      height: number;
      dpr: number;
      contextType: string;
    }>
  >(`
    (function() {
      return Array.from(document.querySelectorAll('canvas')).map(function(c, i) {
        var ctx2d = c.getContext('2d');
        var ctxWebgl = c.getContext('webgl') || c.getContext('webgl2');
        return {
          id: c.id || String(i),
          width: c.width,
          height: c.height,
          dpr: window.devicePixelRatio || 1,
          contextType: ctx2d ? '2d' : (ctxWebgl ? 'webgl' : 'unknown')
        };
      });
    })()
  `);

  const filtered = canvasId
    ? canvases.filter((c) => c.id === canvasId || canvases.indexOf(c).toString() === canvasId)
    : canvases;

  const canvasData = (filtered[0] ?? {
    id: canvasId ?? '',
    width: 0,
    height: 0,
    dpr: 1,
    contextType: 'unknown',
  }) as CanvasSceneDump['canvas'];

  const stubData = createStub({
    tool: 'canvas_scene_dump',
    stubType: 'partial',
    reason: 'No canvas engine detected — only DOM canvas metadata returned',
    fix: 'Ensure a supported canvas engine is loaded (Pixi, Phaser, Laya, Cocos)',
    data: {
      engine: 'unknown',
      version: undefined,
      canvas: canvasData,
      sceneTree: null,
      totalNodes: 0,
      completeness: 'partial' as const, // Keep for backward compatibility
      partialReason: 'No canvas engine detected — only DOM canvas metadata returned',
    },
  });

  // Return the data portion as CanvasSceneDump (strip stub metadata for type compatibility)
  return {
    engine: stubData.engine as string,
    version: stubData.version as string | undefined,
    canvas: stubData.canvas as CanvasSceneDump['canvas'],
    sceneTree: stubData.sceneTree as CanvasSceneDump['sceneTree'],
    totalNodes: stubData.totalNodes as number,
    completeness: stubData.completeness as CanvasSceneDump['completeness'],
    partialReason: stubData.partialReason as string | undefined,
    // Attach stub metadata
    stubType: stubData.stubType as string,
    reason: stubData.reason as string,
    fix: stubData.fix as string | undefined,
  } as CanvasSceneDump & { stubType: string; reason: string; fix?: string };
}
