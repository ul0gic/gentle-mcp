import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, pipeline, type FeatureExtractionPipeline } from '@xenova/transformers';
import { connect } from '@lancedb/lancedb';
import { cpus } from 'node:os';
import type { DocChunk } from '../src/types/index.js';

// Configure ONNX runtime for better CPU utilization
env.backends.onnx.wasm.numThreads = cpus().length;

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const DATA_DIR = join(ROOT_DIR, 'data');
const CHUNKS_PATH = join(DATA_DIR, 'chunks.json');
const LANCEDB_PATH = join(DATA_DIR, 'lancedb');

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
const BATCH_SIZE = 128; // Larger batches for better throughput
const TABLE_NAME = 'docs';

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

function formatTime(ms: number): string {
  if (ms < 1000) {
    return `${String(ms)}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

async function embedBatch(
  embedder: FeatureExtractionPipeline,
  texts: string[]
): Promise<number[][]> {
  const output = await embedder(texts, { pooling: 'mean', normalize: true });
  return output.tolist() as number[][];
}

interface EmbeddingRecord {
  id: string;
  source: string;
  type: string;
  name: string;
  parentName: string;
  content: string;
  version: string;
  vector: number[];
  [key: string]: unknown;
}

if (!existsSync(CHUNKS_PATH)) {
  process.stderr.write('chunks.json not found. Run: npm run parse\n');
  process.exit(1);
}

log('Loading embedding model...');
log(`   Model: ${MODEL_NAME}`);
const modelStart = Date.now();
const embedder = await pipeline('feature-extraction', MODEL_NAME);
log(`   Loaded in ${formatTime(Date.now() - modelStart)}\n`);

const chunks: DocChunk[] = JSON.parse(readFileSync(CHUNKS_PATH, 'utf8')) as DocChunk[];
log(`Embedding ${String(chunks.length)} chunks...`);
log(`   Batch size: ${String(BATCH_SIZE)}\n`);

const startTime = Date.now();
const records: EmbeddingRecord[] = [];

for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
  const batch = chunks.slice(i, i + BATCH_SIZE);
  const texts = batch.map((chunk) => chunk.content);
  const embeddings = await embedBatch(embedder, texts);

  for (const [j, chunk] of batch.entries()) {
    // eslint-disable-next-line security/detect-object-injection -- safe array index from entries()
    const embedding = embeddings[j];

    if (embedding !== undefined) {
      records.push({
        id: chunk.id,
        source: chunk.source,
        type: chunk.type,
        name: chunk.name,
        parentName: chunk.parentName ?? '',
        content: chunk.content,
        version: chunk.version ?? '',
        vector: embedding,
      });
    }
  }

  const processed = Math.min(i + BATCH_SIZE, chunks.length);
  // Only update progress every 10 batches to reduce overhead
  if (i % (BATCH_SIZE * 10) === 0 || processed === chunks.length) {
    const percent = Math.round((processed / chunks.length) * 100);
    const elapsed = Date.now() - startTime;
    const rate = Math.round(processed / (elapsed / 1000));
    process.stdout.write(`\r   Progress: ${String(percent)}% (${String(processed)}/${String(chunks.length)}) - ${String(rate)} chunks/sec`);
  }
}

const embedTime = Date.now() - startTime;
log(`\n\n   Embedded in ${formatTime(embedTime)}`);

log('\nSaving to LanceDB...');
const db = await connect(LANCEDB_PATH);

const tableNames = await db.tableNames();
if (tableNames.includes(TABLE_NAME)) {
  // Append to existing table
  const table = await db.openTable(TABLE_NAME);
  await table.add(records);
  log(`   Appended ${String(records.length)} records to existing table`);
} else {
  // Create new table
  await db.createTable(TABLE_NAME, records);
  log(`   Created table with ${String(records.length)} records`);
}

const sourceStats: Record<string, number> = {};
for (const record of records) {
  const current = sourceStats[record.source] ?? 0;
  sourceStats[record.source] = current + 1;
}

log('\nFinal stats:');
for (const [source, count] of Object.entries(sourceStats)) {
  log(`   ${source}: ${String(count)} chunks`);
}

log('\nDone!');
