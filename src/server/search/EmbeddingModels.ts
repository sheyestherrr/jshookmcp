import { DEFAULT_SEARCH_VECTOR_MODEL_ID } from '../../constants/search-model.ts';

const STATIC_MODEL_DIMENSIONS = new Map<string, number>([
  [DEFAULT_SEARCH_VECTOR_MODEL_ID.toLowerCase(), 256],
]);

export function isStaticEmbeddingModel(modelId: string): boolean {
  return STATIC_MODEL_DIMENSIONS.has(modelId.trim().toLowerCase());
}

export function getEmbeddingDimensionHint(modelId: string): number {
  const normalized = modelId.trim().toLowerCase();
  const staticDimension = STATIC_MODEL_DIMENSIONS.get(normalized);
  if (staticDimension !== undefined) return staticDimension;
  if (normalized.endsWith('/bge-micro-v2')) return 384;
  return 0;
}
