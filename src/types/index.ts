/**
 * Type definitions for the GENTLE MCP server.
 *
 * All types are derived from Zod schemas in ../schemas.ts to ensure
 * runtime validation matches compile-time types.
 */

export {
  // Schemas for runtime validation
  DocSourceSchema,
  DocTypeSchema,
  DocChunkSchema,
  DocChunkArraySchema,
  SearchInputSchema,
  SearchResultSchema,
  ParserResultSchema,
  LanceDBRecordSchema,
  LanceDBQueryResultSchema,
  SourceStatsSchema,
  EmbeddingVectorSchema,
  EmbeddingRecordSchema,

  // Types derived from schemas
  type DocSource,
  type DocType,
  type DocChunk,
  type SearchInput,
  type SearchResult,
  type ParserResult,
  type LanceDBRecord,
  type LanceDBQueryResult,
  type SourceStats,
  type EmbeddingRecord,

  // Validation helpers
  parseChunksJson,
  parseLanceDBResults,
  parseSearchInput,
  safeParseChunksJson,
} from '../schemas.js';

// Constants for use in code (avoids magic strings)
export const DOC_SOURCES = [
  'unreal-python',
  'unreal-console',
  'pyqt-reference',
  'pyqt-tutorials',
] as const;

export const DOC_TYPES = [
  'class',
  'method',
  'property',
  'enum',
  'function',
  'console-variable',
  'console-command',
  'api-endpoint',
  'guide',
  'concept',
  'example',
] as const;

// Legacy interface for backward compatibility with parsers
// TODO: Migrate parsers to use schema-derived types
export interface SourceConfig {
  name: typeof DOC_SOURCES[number];
  version?: string | undefined;
  enabled: boolean;
  path: string;
}
