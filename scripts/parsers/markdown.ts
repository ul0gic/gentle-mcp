import { readFileSync } from 'node:fs';
import type { DocChunk, DocSource, DocType, ParserResult } from '../../src/types/index.js';

interface Section {
  title: string;
  level: number;
  content: string;
  type: DocType;
}

function detectDocType(title: string, content: string): DocType {
  const lowerTitle = title.toLowerCase();
  const lowerContent = content.toLowerCase();

  if (lowerTitle.includes('endpoint') || /^(get|post|put|delete|patch)\s+\//.test(lowerContent)) {
    return 'api-endpoint';
  }

  if (lowerTitle.includes('example') || lowerTitle.includes('usage')) {
    return 'example';
  }

  if (lowerTitle.includes('class') || /^class\s+\w+/.test(content)) {
    return 'class';
  }

  if (lowerTitle.includes('function') || lowerTitle.includes('method')) {
    return 'function';
  }

  return 'guide';
}

function saveSection(
  sections: Section[],
  currentSection: Partial<Section> | null,
  contentLines: string[]
): void {
  if (currentSection?.title === undefined || contentLines.length === 0) {
    return;
  }

  const sectionContent = contentLines.join('\n').trim();
  if (sectionContent.length <= 50) {
    return;
  }

  sections.push({
    title: currentSection.title,
    level: currentSection.level ?? 1,
    content: sectionContent,
    type: detectDocType(currentSection.title, sectionContent),
  });
}

function parseMarkdownSections(content: string): Section[] {
  const sections: Section[] = [];
  const lines = content.split('\n');

  let currentSection: Partial<Section> | null = null;
  let contentLines: string[] = [];

  for (const line of lines) {
    const headerMatch = /^(#{1,4})\s+(.+)$/.exec(line);

    if (headerMatch !== null) {
      saveSection(sections, currentSection, contentLines);

      currentSection = {
        title: headerMatch[2]?.trim() ?? '',
        level: headerMatch[1]?.length ?? 1,
      };
      contentLines = [];
    } else {
      contentLines.push(line);
    }
  }

  saveSection(sections, currentSection, contentLines);

  return sections;
}

function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '')
    .slice(0, 64);
}

export function parseMarkdownDocs(
  inputPath: string,
  source: DocSource,
  version?: string
): ParserResult {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from trusted source
  const content = readFileSync(inputPath, 'utf8');
  const sections = parseMarkdownSections(content);

  const chunks: DocChunk[] = sections.map((section, index) => {
    const safeName = sanitizeName(section.title);
    const chunkContent = [
      `# ${section.title}`,
      '',
      section.content,
    ].join('\n');

    return {
      id: `${source}:${section.type}:${safeName}-${String(index)}`,
      source,
      version,
      type: section.type,
      name: section.title,
      content: chunkContent,
    };
  });

  return {
    source,
    version,
    chunks,
  };
}
