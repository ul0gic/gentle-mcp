import { existsSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseUnrealPython } from './parsers/unreal-python.js';
import { parseUnrealConsole } from './parsers/unreal-console.js';
import { parseMarkdownDocs } from './parsers/markdown.js';
import type { DocChunk, DocSource } from '../src/types/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const SOURCES_DIR = join(ROOT_DIR, 'sources');
const DATA_DIR = join(ROOT_DIR, 'data');
const CHUNKS_PATH = join(DATA_DIR, 'chunks.json');

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

interface ParseTask {
  source: DocSource;
  path: string;
  parser: 'unreal-python' | 'unreal-console' | 'markdown';
  version?: string;
}

function discoverSources(): ParseTask[] {
  const tasks: ParseTask[] = [];

  // Skip unreal-python if already embedded (60k chunks takes too long)
  // Uncomment to re-parse:
  // const unrealPythonPath = join(SOURCES_DIR, 'unreal-python', 'unreal.py');
  // if (existsSync(unrealPythonPath)) {
  //   tasks.push({
  //     source: 'unreal-python',
  //     path: unrealPythonPath,
  //     parser: 'unreal-python',
  //     version: '5.6',
  //   });
  // }

  // Skip unreal-console if already embedded
  // Uncomment to re-parse:
  // const unrealConsolePath = join(SOURCES_DIR, 'unreal-console', 'console-commands.md');
  // if (existsSync(unrealConsolePath)) {
  //   tasks.push({
  //     source: 'unreal-console',
  //     path: unrealConsolePath,
  //     parser: 'unreal-console',
  //     version: '5.5',
  //   });
  // }

  const markdownSources: { source: DocSource; dir: string }[] = [
    { source: 'pyqt-reference', dir: 'pyqt-reference' },
    { source: 'pyqt-tutorials', dir: 'pyqt-tutorials' },
  ];

  for (const { source, dir } of markdownSources) {
    const sourceDir = join(SOURCES_DIR, dir);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path constructed from known constants
    if (existsSync(sourceDir)) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- path constructed from known constants
      const files = readdirSync(sourceDir).filter((f) => f.endsWith('.md') || f.endsWith('.txt'));
      for (const file of files) {
        tasks.push({
          source,
          path: join(sourceDir, file),
          parser: 'markdown',
        });
      }
    }
  }

  return tasks;
}

function parseSource(task: ParseTask): DocChunk[] {
  switch (task.parser) {
    case 'unreal-python':
      return parseUnrealPython(task.path, task.version).chunks;
    case 'unreal-console':
      return parseUnrealConsole(task.path, task.version).chunks;
    case 'markdown':
      return parseMarkdownDocs(task.path, task.source, task.version).chunks;
  }
}

log('Discovering documentation sources...\n');

const tasks = discoverSources();

if (tasks.length === 0) {
  log('No sources found. Run: npm run fetch');
  process.exit(1);
}

log(`Found ${String(tasks.length)} source files:\n`);

const allChunks: DocChunk[] = [];
const stats: Record<string, number> = {};

for (const task of tasks) {
  log(`  Parsing ${task.source}: ${task.path.split('/').pop() ?? 'unknown'}...`);

  try {
    const chunks = parseSource(task);
    allChunks.push(...chunks);

    const current = stats[task.source] ?? 0;
    stats[task.source] = current + chunks.length;

    log(`    -> ${String(chunks.length)} chunks`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log(`    Error: ${message}`);
  }
}

log('\nSummary:\n');
for (const [source, count] of Object.entries(stats)) {
  log(`  ${source}: ${String(count)} chunks`);
}
log(`\n  Total: ${String(allChunks.length)} chunks`);

writeFileSync(CHUNKS_PATH, JSON.stringify(allChunks, null, 2));
log(`\nSaved to ${CHUNKS_PATH}`);
