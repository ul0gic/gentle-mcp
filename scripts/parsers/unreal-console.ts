import { readFileSync } from 'node:fs';
import type { DocChunk, ParserResult } from '../../src/types/index.js';

const CONSOLE_VARIABLE = 'console-variable' as const;
const CONSOLE_COMMAND = 'console-command' as const;

type ConsoleType = typeof CONSOLE_VARIABLE | typeof CONSOLE_COMMAND;

interface ConsoleEntry {
  name: string;
  type: ConsoleType;
  description: string;
}

function saveEntry(
  entries: ConsoleEntry[],
  currentEntry: Partial<ConsoleEntry> | null,
  descriptionLines: string[]
): void {
  if (currentEntry?.name === undefined) {
    return;
  }

  entries.push({
    name: currentEntry.name,
    type: currentEntry.type ?? CONSOLE_VARIABLE,
    description: descriptionLines.join('\n').trim(),
  });
}

function parseConsoleMarkdown(content: string): ConsoleEntry[] {
  const entries: ConsoleEntry[] = [];
  const lines = content.split('\n');

  let currentEntry: Partial<ConsoleEntry> | null = null;
  let descriptionLines: string[] = [];

  for (const line of lines) {
    const headerMatch = /^###\s+`([^`]+)`\s+—\s+(Console Variable|Console Command)/.exec(line);

    if (headerMatch !== null) {
      saveEntry(entries, currentEntry, descriptionLines);

      const name = headerMatch[1];
      if (name !== undefined) {
        currentEntry = {
          name,
          type: headerMatch[2] === 'Console Command' ? CONSOLE_COMMAND : CONSOLE_VARIABLE,
        };
      }
      descriptionLines = [];
    } else if (currentEntry !== null && line.trim() !== '' && !line.startsWith('#')) {
      descriptionLines.push(line.trim());
    }
  }

  saveEntry(entries, currentEntry, descriptionLines);

  return entries;
}

export function parseUnrealConsole(inputPath: string, version?: string): ParserResult {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from trusted source
  const content = readFileSync(inputPath, 'utf8');
  const entries = parseConsoleMarkdown(content);

  const chunks: DocChunk[] = entries.map((entry) => {
    const typeLabel = entry.type === CONSOLE_COMMAND ? 'Console Command' : 'Console Variable';
    const chunkContent = [
      `# ${entry.name}`,
      `Type: ${typeLabel}`,
      '',
      entry.description,
    ].join('\n');

    return {
      id: `unreal-console:${entry.type}:${entry.name}`,
      source: 'unreal-console',
      version,
      type: entry.type,
      name: entry.name,
      content: chunkContent,
    };
  });

  return {
    source: 'unreal-console',
    version,
    chunks,
  };
}
