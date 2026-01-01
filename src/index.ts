#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { VectorStore } from './db/vector-store.js';
import type { DocSource } from './types/index.js';
import {
  searchBySource,
  searchAllSources,
  listSources,
} from './tools/search.js';

const SERVER_NAME = 'gentle';
const SERVER_VERSION = '0.1.0';
const SERVER_DESCRIPTION = 'GENTLE - Game Engine Navigation Tool for Learning & Exploration';

interface ToolDefinition {
  name: string;
  source?: DocSource;
  description: string;
}

const TOOLS: ToolDefinition[] = [
  {
    name: 'search_unreal_python',
    source: 'unreal-python',
    description: 'Search Unreal Engine Python API documentation. Find classes, methods, properties, and enums for scripting Unreal Editor with Python. Use for: spawning actors, manipulating assets, editor automation, blueprint interaction, property access.',
  },
  {
    name: 'search_unreal_console',
    source: 'unreal-console',
    description: 'Search Unreal Engine console commands and variables. Find commands for debugging, profiling, rendering settings, and engine configuration. Use for: FPS display, stat commands, r. variables, t. variables, debugging.',
  },
  {
    name: 'search_pyqt_reference',
    source: 'pyqt-reference',
    description: 'Search PyQt6 official reference documentation. Find signals/slots, Qt properties, Qt Designer usage, QML integration, and common gotchas. Use for: understanding PyQt6 concepts and API patterns.',
  },
  {
    name: 'search_pyqt_tutorials',
    source: 'pyqt-tutorials',
    description: 'Search PyQt6 practical tutorials. Find code examples for widgets (QPushButton, QLineEdit, QCheckBox), layouts, dialogs, menus, toolbars, and custom painting. Use for: building GUI applications step-by-step.',
  },
  {
    name: 'search_all',
    description: 'Search across ALL documentation sources (Unreal Python, Unreal Console, PyQt6). Use when query spans multiple domains or you are unsure which source is relevant.',
  },
  {
    name: 'list_sources',
    description: 'List all available documentation sources and how many entries each contains.',
  },
];

const SearchSchema = {
  query: z.string().min(1).describe('Natural language search query'),
  limit: z.number().min(1).max(20).default(5).describe('Max results (1-20)'),
};

const vectorStore = new VectorStore();

try {
  await vectorStore.initialize();
} catch {
  process.stderr.write('Failed to initialize vector store. Run: npm run setup\n');
  process.exit(1);
}

process.stderr.write(`${SERVER_DESCRIPTION} v${SERVER_VERSION}\n`);

const server = new McpServer({
  name: SERVER_NAME,
  version: SERVER_VERSION,
});

// Register search tools for each source
for (const tool of TOOLS) {
  if (tool.source !== undefined) {
    const source = tool.source;
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: SearchSchema },
      async ({ query, limit }) => {
        const result = await searchBySource(vectorStore, source, { query, limit });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }
    );
  }
}

// Register search_all tool
const searchAllDef = TOOLS.find((t) => t.name === 'search_all');
if (searchAllDef !== undefined) {
  server.registerTool(
    'search_all',
    { description: searchAllDef.description, inputSchema: SearchSchema },
    async ({ query, limit }) => {
      const result = await searchAllSources(vectorStore, { query, limit });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );
}

// Register list_sources tool
const listSourcesDef = TOOLS.find((t) => t.name === 'list_sources');
if (listSourcesDef !== undefined) {
  server.registerTool(
    'list_sources',
    { description: listSourcesDef.description },
    async () => {
      const sources = await listSources(vectorStore);
      return { content: [{ type: 'text', text: JSON.stringify({ sources }, null, 2) }] };
    }
  );
}

const transport = new StdioServerTransport();
await server.connect(transport);
