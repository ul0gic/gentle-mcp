import type { DocSource, ParserResult } from '../../src/types/index.js';

export interface Parser {
  source: DocSource;
  parse(inputPath: string, version?: string): Promise<ParserResult>;
}

export { parseUnrealPython } from './unreal-python.js';
export { parseUnrealConsole } from './unreal-console.js';
export { parseMarkdownDocs } from './markdown.js';
