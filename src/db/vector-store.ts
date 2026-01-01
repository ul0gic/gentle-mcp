import { connect, type Connection, type Table } from '@lancedb/lancedb';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import {
  type DocSource,
  type SearchResult,
  type LanceDBQueryResult,
  LanceDBQueryResultSchema,
  DocSourceSchema,
  DocTypeSchema,
} from '../types/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Find data directory - works for both dev (src/db/) and prod (dist/src/db/)
function findDataDir(): string {
  // Try production path first (dist/src/db -> root)
  const prodPath = join(__dirname, '..', '..', '..', 'data');
  if (existsSync(prodPath)) {
    return prodPath;
  }
  // Try dev path (src/db -> root)
  const devPath = join(__dirname, '..', '..', 'data');
  if (existsSync(devPath)) {
    return devPath;
  }
  // Fallback to prod path (will error if doesn't exist)
  return prodPath;
}

const DATA_DIR = findDataDir();
const LANCEDB_PATH = join(DATA_DIR, 'lancedb');
const TABLE_NAME = 'docs';

/**
 * Validates a single LanceDB query result row.
 * Returns validated result or null if validation fails.
 */
function validateQueryResult(row: unknown): LanceDBQueryResult | null {
  const result = LanceDBQueryResultSchema.safeParse(row);
  if (!result.success) {
    return null;
  }
  return result.data;
}

/**
 * Validates source string is a valid DocSource.
 */
function validateSource(source: string): DocSource {
  return DocSourceSchema.parse(source);
}

/**
 * Validates type string is a valid DocType.
 */
function validateDocType(type: string): SearchResult['chunk']['type'] {
  return DocTypeSchema.parse(type);
}

export class VectorStore {
  private db: Connection | null = null;
  private table: Table | null = null;

  async initialize(): Promise<void> {
    this.db = await connect(LANCEDB_PATH);
    this.table = await this.db.openTable(TABLE_NAME);
  }

  async search(
    queryVector: number[],
    limit = 10,
    sourceFilter?: DocSource[]
  ): Promise<SearchResult[]> {
    if (this.table === null) {
      throw new Error('VectorStore not initialized');
    }

    let query = this.table.vectorSearch(queryVector).limit(limit);

    if (sourceFilter !== undefined && sourceFilter.length > 0) {
      const sourceList = sourceFilter.map((s) => `'${s}'`).join(', ');
      query = query.where(`source IN (${sourceList})`);
    }

    const rawResults = await query.toArray();
    const results: SearchResult[] = [];

    for (const row of rawResults) {
      const validated = validateQueryResult(row);
      if (validated === null) {
        // Skip invalid rows - log in production if needed
        continue;
      }

      try {
        results.push({
          chunk: {
            id: validated.id,
            source: validateSource(validated.source),
            type: validateDocType(validated.type),
            name: validated.name,
            parentName: validated.parentName !== '' ? validated.parentName : undefined,
            content: validated.content,
            version: validated.version !== '' ? validated.version : undefined,
          },
          score: 1 - validated._distance,
        });
      } catch {
        // Skip rows with invalid source/type enums
        continue;
      }
    }

    return results;
  }

  async getStats(): Promise<{ source: string; count: number }[]> {
    if (this.table === null) {
      throw new Error('VectorStore not initialized');
    }

    const allRows = await this.table.query().toArray();
    const stats: Record<string, number> = {};

    for (const row of allRows) {
      if (typeof row !== 'object' || row === null) {
        continue;
      }

      const record = row as Record<string, unknown>;
      const source = record['source'];

      if (typeof source !== 'string') {
        continue;
      }

      // eslint-disable-next-line security/detect-object-injection -- source is validated from DB
      const current = stats[source] ?? 0;
      // eslint-disable-next-line security/detect-object-injection -- source is validated from DB
      stats[source] = current + 1;
    }

    return Object.entries(stats).map(([source, count]) => ({ source, count }));
  }
}
