/**
 * Zod schemas for runtime validation of all data contracts.
 * These schemas enforce type safety at runtime boundaries where
 * TypeScript's compile-time checks cannot help (JSON parsing,
 * database queries, external data sources).
 */

import { z } from 'zod';

// =============================================================================
// Core Enums
// =============================================================================

export const DocSourceSchema = z.enum([
  'unreal-python',
  'unreal-console',
  'pyqt-reference',
  'pyqt-tutorials',
]);

export const DocTypeSchema = z.enum([
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
]);

// =============================================================================
// Document Chunks
// =============================================================================

export const DocChunkSchema = z.object({
  id: z.string().min(1),
  source: DocSourceSchema,
  version: z.string().optional(),
  type: DocTypeSchema,
  name: z.string().min(1),
  parentName: z.string().optional(),
  content: z.string().min(1),
  signature: z.string().optional(),
  url: z.url().optional(),
  embedding: z.array(z.number()).length(384).optional(),
});

export const DocChunkArraySchema = z.array(DocChunkSchema);

// =============================================================================
// Search
// =============================================================================

export const SearchInputSchema = z.object({
  query: z.string().min(1).max(1000),
  limit: z.number().int().min(1).max(20).default(5),
});

export const SearchResultSchema = z.object({
  chunk: DocChunkSchema.omit({ embedding: true }),
  score: z.number().min(0).max(1),
});

export const SearchResultArraySchema = z.array(SearchResultSchema);

// =============================================================================
// Parser Results
// =============================================================================

export const ParserResultSchema = z.object({
  source: DocSourceSchema,
  version: z.string().optional(),
  chunks: DocChunkArraySchema,
});

// =============================================================================
// LanceDB Records
// =============================================================================

export const LanceDBRecordSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  type: z.string().min(1),
  name: z.string().min(1),
  parentName: z.string(),
  content: z.string().min(1),
  version: z.string(),
  vector: z.array(z.number()).length(384),
});

export const LanceDBQueryResultSchema = LanceDBRecordSchema.extend({
  _distance: z.number(),
});

export const LanceDBQueryResultArraySchema = z.array(LanceDBQueryResultSchema);

// =============================================================================
// Source Stats
// =============================================================================

export const SourceStatsSchema = z.object({
  source: z.string().min(1),
  count: z.number().int().nonnegative(),
});

export const SourceStatsArraySchema = z.array(SourceStatsSchema);

// =============================================================================
// Embedding
// =============================================================================

export const EmbeddingVectorSchema = z.array(z.number()).length(384);

export const EmbeddingRecordSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  type: z.string().min(1),
  name: z.string().min(1),
  parentName: z.string(),
  content: z.string().min(1),
  version: z.string(),
  vector: EmbeddingVectorSchema,
});

// =============================================================================
// Type Exports (derived from schemas)
// =============================================================================

export type DocSource = z.infer<typeof DocSourceSchema>;
export type DocType = z.infer<typeof DocTypeSchema>;
export type DocChunk = z.infer<typeof DocChunkSchema>;
export type SearchInput = z.infer<typeof SearchInputSchema>;
export type SearchResult = z.infer<typeof SearchResultSchema>;
export type ParserResult = z.infer<typeof ParserResultSchema>;
export type LanceDBRecord = z.infer<typeof LanceDBRecordSchema>;
export type LanceDBQueryResult = z.infer<typeof LanceDBQueryResultSchema>;
export type SourceStats = z.infer<typeof SourceStatsSchema>;
export type EmbeddingRecord = z.infer<typeof EmbeddingRecordSchema>;

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Parse and validate chunks from JSON file.
 * Throws ZodError if validation fails.
 */
export function parseChunksJson(data: unknown): DocChunk[] {
  return DocChunkArraySchema.parse(data);
}

/**
 * Parse and validate LanceDB query results.
 * Throws ZodError if validation fails.
 */
export function parseLanceDBResults(data: unknown): LanceDBQueryResult[] {
  return LanceDBQueryResultArraySchema.parse(data);
}

/**
 * Parse and validate search input.
 * Throws ZodError if validation fails.
 */
export function parseSearchInput(data: unknown): SearchInput {
  return SearchInputSchema.parse(data);
}

/**
 * Safe parse that returns result object instead of throwing.
 */
export function safeParseChunksJson(data: unknown): { success: true; data: DocChunk[] } | { success: false; error: z.ZodError } {
  return DocChunkArraySchema.safeParse(data);
}
