import { pipeline, type FeatureExtractionPipeline } from '@xenova/transformers';

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';

let embedderInstance: FeatureExtractionPipeline | null = null;
let initPromise: Promise<FeatureExtractionPipeline> | null = null;

export async function getEmbedder(): Promise<FeatureExtractionPipeline> {
  if (embedderInstance !== null) {
    return embedderInstance;
  }

  if (initPromise !== null) {
    return initPromise;
  }

  initPromise = pipeline('feature-extraction', MODEL_NAME);
  embedderInstance = await initPromise;
  return embedderInstance;
}

export async function embedText(text: string): Promise<number[]> {
  const embedder = await getEmbedder();
  const output = await embedder(text, { pooling: 'mean', normalize: true });
  const vectors = output.tolist() as number[][];
  const firstVector = vectors[0];
  if (firstVector === undefined) {
    throw new Error('Failed to generate embedding');
  }
  return firstVector;
}
