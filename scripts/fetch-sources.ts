import { execSync } from 'node:child_process';
import { existsSync, cpSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const SOURCES_DIR = join(ROOT_DIR, 'sources');
const PROJECT_DIR = join(ROOT_DIR, '.project');

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

function copyIfExists(src: string, dest: string, name: string): boolean {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- paths are constructed from known constants
  if (existsSync(src)) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- paths are constructed from known constants
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest);
    log(`  Done: ${name}`);
    return true;
  }
  log(`  Skipped: ${name} (not found)`);
  return false;
}

function fetchUnrealPython(): void {
  log('\nFetching Unreal Python stubs...');

  const targetPath = join(SOURCES_DIR, 'unreal-python', 'unreal.py');
  if (existsSync(targetPath)) {
    log('  Already exists, skipping.');
    return;
  }

  const tempDir = join(ROOT_DIR, '.temp-stubs');

  try {
    execSync(`pip install unreal-stub --target "${tempDir}" --quiet`, { stdio: 'pipe' });
    const stubPath = join(tempDir, 'unreal', 'unreal.py');

    if (existsSync(stubPath)) {
      mkdirSync(dirname(targetPath), { recursive: true });
      cpSync(stubPath, targetPath);
      log('  Done: unreal.py downloaded');
    }

    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    log('  Failed to fetch unreal-stub');
  }
}

function copyLocalDocs(): void {
  log('\nCopying local documentation...');

  copyIfExists(
    join(PROJECT_DIR, 'message.txt'),
    join(SOURCES_DIR, 'unreal-console', 'console-commands.md'),
    'Unreal Console Commands'
  );

  copyIfExists(
    join(PROJECT_DIR, 'OllamaAPI&CommandPromptList.txt'),
    join(SOURCES_DIR, 'ollama', 'api.md'),
    'Ollama API'
  );

  copyIfExists(
    join(PROJECT_DIR, 'OllamaDocumentation.txt'),
    join(SOURCES_DIR, 'ollama', 'docs.md'),
    'Ollama Documentation'
  );

  copyIfExists(
    join(PROJECT_DIR, 'llamaindexDocumentation.txt'),
    join(SOURCES_DIR, 'llamaindex', 'docs.md'),
    'LlamaIndex Documentation'
  );

  copyIfExists(
    join(PROJECT_DIR, 'LLama Index Ollama and Parsing Documentation.txt'),
    join(SOURCES_DIR, 'llamaindex', 'ollama-parsing.md'),
    'LlamaIndex Ollama & Parsing'
  );

  copyIfExists(
    join(PROJECT_DIR, 'PyQt6 documentation.txt'),
    join(SOURCES_DIR, 'pyqt', 'docs.md'),
    'PyQt6 Documentation'
  );

  copyIfExists(
    join(PROJECT_DIR, 'Model Context Protocol Documentation.txt'),
    join(SOURCES_DIR, 'mcp', 'docs.md'),
    'MCP Documentation'
  );
}

log('Fetching documentation sources...');

fetchUnrealPython();
copyLocalDocs();

log('\nDone fetching sources!');
