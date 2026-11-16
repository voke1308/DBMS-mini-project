/**
 * Text -> vector, for the pgvector side of the project.
 *
 *   model      : sentence-transformers/all-MiniLM-L6-v2, run locally in
 *                Node through Transformers.js (ONNX port Xenova/all-MiniLM-L6-v2)
 *   output     : 384 floats, mean-pooled over tokens, L2-normalised
 *   storage    : recipe_embeddings.embedding  vector(384)
 *   metric     : cosine distance, pgvector's `<=>` operator
 *
 * No API key or paid service. The first call downloads the model
 * (about 90 MB) into node_modules/@huggingface/transformers/.cache;
 * after that it works offline.
 *
 * This is plain ESM (.mjs) so the Next.js route handlers and the
 * npm scripts in scripts/ share the same code.
 */
import { pipeline, env } from '@huggingface/transformers';

export const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
export const EMBEDDING_MODEL_NAME = 'all-MiniLM-L6-v2'; // value stored in model_name
export const EMBEDDING_DIMS = 384;

// Optional: point at a folder that already holds the model files
// (<folder>/Xenova/all-MiniLM-L6-v2/...) to run without internet.
if (process.env.EMBEDDING_LOCAL_MODEL_PATH) {
  env.localModelPath = process.env.EMBEDDING_LOCAL_MODEL_PATH;
  env.allowRemoteModels = false;
}

// Load the model once per process. Cached on globalThis so Next.js hot
// reloads do not load it again; a failed load is cleared so it can retry.
function extractor() {
  if (!globalThis.__nutripantryExtractor) {
    globalThis.__nutripantryExtractor = pipeline('feature-extraction', EMBEDDING_MODEL, {
      dtype: 'fp32',
    }).catch((err) => {
      globalThis.__nutripantryExtractor = null;
      throw err;
    });
  }
  return globalThis.__nutripantryExtractor;
}

/** Embed several texts in one batch. Returns an array of 384-float arrays. */
export async function embedMany(texts) {
  if (texts.length === 0) return [];
  const model = await extractor();
  const output = await model(texts, { pooling: 'mean', normalize: true });
  const vectors = output.tolist();
  for (const v of vectors) {
    if (v.length !== EMBEDDING_DIMS) {
      throw new Error(`Expected ${EMBEDDING_DIMS} dimensions, got ${v.length}`);
    }
  }
  return vectors;
}

/** Embed one text. */
export async function embed(text) {
  const [vector] = await embedMany([text]);
  return vector;
}

/** Format a JS array as a pgvector literal, e.g. '[0.1,0.2,...]'. */
export function toVectorLiteral(values) {
  return `[${values.join(',')}]`;
}
