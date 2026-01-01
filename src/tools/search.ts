import type { DocSource, SearchResult } from '../types/index.js';
import type { VectorStore } from '../db/vector-store.js';
import { embedText } from '../embedder.js';

export interface SearchInput {
  query: string;
  limit: number;
}

export interface SearchToolResult {
  results: {
    type: string;
    name: string;
    parentName?: string | undefined;
    content: string;
    score: number;
  }[];
  totalResults: number;
}

export interface SearchAllResult extends SearchToolResult {
  results: {
    source: DocSource;
    type: string;
    name: string;
    parentName?: string | undefined;
    content: string;
    score: number;
  }[];
}

function mapResultToOutput(result: SearchResult): SearchToolResult['results'][number] {
  return {
    type: result.chunk.type,
    name: result.chunk.name,
    parentName: result.chunk.parentName,
    content: result.chunk.content,
    score: Math.round(result.score * 100) / 100,
  };
}

function mapResultToOutputWithSource(result: SearchResult): SearchAllResult['results'][number] {
  return {
    source: result.chunk.source,
    type: result.chunk.type,
    name: result.chunk.name,
    parentName: result.chunk.parentName,
    content: result.chunk.content,
    score: Math.round(result.score * 100) / 100,
  };
}

export async function searchBySource(
  vectorStore: VectorStore,
  source: DocSource,
  input: SearchInput
): Promise<SearchToolResult> {
  const queryVector = await embedText(input.query);
  const results = await vectorStore.search(queryVector, input.limit, [source]);

  return {
    results: results.map(mapResultToOutput),
    totalResults: results.length,
  };
}

export async function searchAllSources(
  vectorStore: VectorStore,
  input: SearchInput
): Promise<SearchAllResult> {
  const queryVector = await embedText(input.query);
  const results = await vectorStore.search(queryVector, input.limit);

  return {
    results: results.map(mapResultToOutputWithSource),
    totalResults: results.length,
  };
}

export async function listSources(
  vectorStore: VectorStore
): Promise<{ source: string; count: number }[]> {
  return vectorStore.getStats();
}
