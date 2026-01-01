import { readFileSync } from 'node:fs';
import type { DocChunk, ParserResult, DocType } from '../../src/types/index.js';

const ENUM_TYPE = 'enum' as const;
const CLASS_TYPE = 'class' as const;
const SOURCE_NAME = 'unreal-python' as const;

interface ClassInfo {
  name: string;
  parent: string | null;
  docstring: string;
  cppSource: string;
  isEnum: boolean;
  lineNumber: number;
  endLine: number;
}

interface MethodInfo {
  name: string;
  className: string;
  signature: string;
  docstring: string;
  isClassMethod: boolean;
  isStatic: boolean;
}

interface PropertyInfo {
  name: string;
  className: string;
  type: string;
  docstring: string;
  readonly: boolean;
}

interface EnumValue {
  name: string;
  description: string;
}

function getLine(lines: string[], index: number): string | undefined {
  if (index < 0 || index >= lines.length) {
    return undefined;
  }
  // eslint-disable-next-line security/detect-object-injection -- safe bounded array access
  return lines[index];
}

function extractDocstring(lines: string[], startIndex: number): { docstring: string; endIndex: number } {
  const line = getLine(lines, startIndex);
  if (line === undefined) {
    return { docstring: '', endIndex: startIndex };
  }

  const trimmed = line.trim();
  if (!trimmed.startsWith('r"""') && !trimmed.startsWith('"""')) {
    return { docstring: '', endIndex: startIndex };
  }

  const isRaw = trimmed.startsWith('r"""');
  const startMarker = isRaw ? 'r"""' : '"""';

  // Single line docstring
  if (trimmed.endsWith('"""') && trimmed.length > startMarker.length + 3) {
    return { docstring: trimmed.slice(startMarker.length, -3).trim(), endIndex: startIndex };
  }

  const docLines: string[] = [trimmed.slice(startMarker.length)];
  let endIndex = startIndex;

  for (let i = startIndex + 1; i < lines.length; i++) {
    const currentLine = getLine(lines, i);
    if (currentLine === undefined) {
      break;
    }

    endIndex = i;

    const closeIndex = currentLine.indexOf('"""');
    if (closeIndex !== -1) {
      docLines.push(currentLine.slice(0, closeIndex));
      break;
    }
    docLines.push(currentLine);
  }

  return { docstring: docLines.join('\n').trim(), endIndex };
}

function extractCppSource(docstring: string): string {
  const parts: string[] = [];

  const pluginMatch = /\*\*Plugin\*\*:\s*(\S+)/.exec(docstring);
  const moduleMatch = /\*\*Module\*\*:\s*(\S+)/.exec(docstring);
  const fileMatch = /\*\*File\*\*:\s*(\S+)/.exec(docstring);

  if (pluginMatch?.[1] !== undefined) {
    parts.push(`Plugin: ${pluginMatch[1]}`);
  }
  if (moduleMatch?.[1] !== undefined) {
    parts.push(`Module: ${moduleMatch[1]}`);
  }
  if (fileMatch?.[1] !== undefined) {
    parts.push(`File: ${fileMatch[1]}`);
  }

  return parts.join(', ');
}

function extractEnumValues(lines: string[], startLine: number, endLine: number): EnumValue[] {
  const values: EnumValue[] = [];

  for (let i = startLine; i < endLine && i < lines.length; i++) {
    const line = getLine(lines, i);
    if (line === undefined) {
      continue;
    }

    // Match: NAME: ClassName = ... #: 0: description OR #: description
    // eslint-disable-next-line security/detect-unsafe-regex -- pattern is bounded by line and anchors
    const match = /^\s+([A-Z_][A-Z0-9_]*)\s*:\s*\w+\s*=\s*\.\.\.\s*#:\s*(?:\d+:\s*)?(.+)$/.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      values.push({ name: match[1], description: match[2].trim() });
    }
  }

  return values;
}

function findClassEnd(lines: string[], startLine: number): number {
  for (let i = startLine + 1; i < lines.length; i++) {
    const line = getLine(lines, i);
    if (line === undefined) {
      continue;
    }

    // New class definition at column 0 means previous class ended
    if (/^class\s+\w+/.test(line)) {
      return i;
    }
  }
  return lines.length;
}

function parseClasses(lines: string[]): ClassInfo[] {
  const classes: ClassInfo[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = getLine(lines, i);
    if (line === undefined) {
      continue;
    }

    // eslint-disable-next-line security/detect-unsafe-regex -- pattern is bounded by line start anchor
    const classMatch = /^class\s+(\w+)(?:\(([^)]*)\))?:/.exec(line);
    if (classMatch === null) {
      continue;
    }

    const className = classMatch[1];
    const parentClass = classMatch[2]?.split(',')[0]?.trim() ?? null;
    if (className === undefined) {
      continue;
    }

    const isEnum = parentClass === 'EnumBase';
    const endLine = findClassEnd(lines, i);

    let docstring = '';
    const nextLine = getLine(lines, i + 1);
    if (nextLine !== undefined && (nextLine.trim().startsWith('r"""') || nextLine.trim().startsWith('"""'))) {
      const result = extractDocstring(lines, i + 1);
      docstring = result.docstring;
    }

    classes.push({
      name: className,
      parent: parentClass,
      docstring,
      cppSource: extractCppSource(docstring),
      isEnum,
      lineNumber: i,
      endLine,
    });
  }

  return classes;
}

function processMethodLine(
  line: string,
  classInfo: ClassInfo,
  lines: string[],
  lineIndex: number,
  isClassMethod: boolean,
  isStatic: boolean
): MethodInfo | null {
  // Match method definition (indented with 4 spaces, not private)
  // eslint-disable-next-line security/detect-unsafe-regex -- pattern is bounded by line start anchor
  const methodMatch = /^[ ]{4}def\s+([a-z_][a-z0-9_]*)\s*\(([^)]*)\)\s*(?:->\s*([^:]+))?:/.exec(line);
  if (methodMatch === null) {
    return null;
  }

  const methodName = methodMatch[1];
  const params = methodMatch[2] ?? '';
  const returnType = methodMatch[3]?.trim() ?? 'None';
  if (methodName === undefined) {
    return null;
  }

  // Skip private/dunder methods except important ones
  if (methodName.startsWith('_') && !['__init__', '__enter__', '__exit__'].includes(methodName)) {
    return null;
  }

  let docstring = '';
  const docLine = getLine(lines, lineIndex + 1);
  if (docLine !== undefined && (docLine.trim().startsWith('r"""') || docLine.trim().startsWith('"""'))) {
    const result = extractDocstring(lines, lineIndex + 1);
    docstring = result.docstring;
  }

  const signature = `${methodName}(${params}) -> ${returnType}`;

  return {
    name: methodName,
    className: classInfo.name,
    signature,
    docstring,
    isClassMethod,
    isStatic,
  };
}

function parseMethods(lines: string[], classInfo: ClassInfo): MethodInfo[] {
  const methods: MethodInfo[] = [];
  let isClassMethod = false;
  let isStatic = false;

  for (let i = classInfo.lineNumber; i < classInfo.endLine && i < lines.length; i++) {
    const line = getLine(lines, i);
    if (line === undefined) {
      continue;
    }

    if (line.trim() === '@classmethod') {
      isClassMethod = true;
      continue;
    }
    if (line.trim() === '@staticmethod') {
      isStatic = true;
      continue;
    }

    const method = processMethodLine(line, classInfo, lines, i, isClassMethod, isStatic);
    if (method !== null) {
      methods.push(method);
    }

    isClassMethod = false;
    isStatic = false;
  }

  return methods;
}

function checkHasSetter(lines: string[], startIndex: number, endIndex: number, propName: string): boolean {
  for (let j = startIndex; j < endIndex; j++) {
    const checkLine = getLine(lines, j);
    if (checkLine?.includes(`@${propName}.setter`) === true) {
      return true;
    }
  }
  return false;
}

function parseProperties(lines: string[], classInfo: ClassInfo): PropertyInfo[] {
  const properties: PropertyInfo[] = [];

  for (let i = classInfo.lineNumber; i < classInfo.endLine && i < lines.length; i++) {
    const line = getLine(lines, i);
    if (line === undefined) {
      continue;
    }

    if (line.trim() !== '@property') {
      continue;
    }

    const propLine = getLine(lines, i + 1);
    if (propLine === undefined) {
      continue;
    }

    const propMatch = /^[ ]{4}def\s+([a-z_][a-z0-9_]*)\s*\(self\)\s*->\s*([^:]+):/.exec(propLine);
    if (propMatch === null) {
      continue;
    }

    const propName = propMatch[1];
    const propType = propMatch[2]?.trim() ?? 'Any';
    if (propName === undefined) {
      continue;
    }

    let docstring = '';
    const docLine = getLine(lines, i + 2);
    if (docLine !== undefined && (docLine.trim().startsWith('r"""') || docLine.trim().startsWith('"""'))) {
      const result = extractDocstring(lines, i + 2);
      docstring = result.docstring;
    }

    // Check if there's a setter (means it's not readonly)
    const readonly = !checkHasSetter(lines, i + 1, Math.min(i + 20, classInfo.endLine), propName);

    properties.push({
      name: propName,
      className: classInfo.name,
      type: propType,
      docstring,
      readonly,
    });
  }

  return properties;
}

function createClassChunk(classInfo: ClassInfo, lines: string[]): DocChunk {
  const contentParts = [`# ${classInfo.name}`];

  if (classInfo.parent !== null) {
    contentParts.push(`Inherits from: ${classInfo.parent}`);
  }

  if (classInfo.cppSource !== '') {
    contentParts.push(`C++ Source: ${classInfo.cppSource}`);
  }

  contentParts.push('');

  // Clean up docstring - remove the C++ source section as we extracted it
  const cleanDoc = classInfo.docstring
    .replaceAll(/\*\*C\+\+ Source:\*\*[\s\S]*?(?=\n\n|\*\*|$)/g, '')
    .trim();

  if (cleanDoc !== '') {
    contentParts.push(cleanDoc);
  }

  // For enums, include values
  if (classInfo.isEnum) {
    const enumValues = extractEnumValues(lines, classInfo.lineNumber, classInfo.endLine);
    if (enumValues.length > 0) {
      contentParts.push('');
      contentParts.push('Values:');
      for (const val of enumValues) {
        contentParts.push(`  ${val.name}: ${val.description}`);
      }
    }
  }

  const chunkType: DocType = classInfo.isEnum ? ENUM_TYPE : CLASS_TYPE;

  return {
    id: `${SOURCE_NAME}:${classInfo.isEnum ? ENUM_TYPE : CLASS_TYPE}:${classInfo.name}`,
    source: SOURCE_NAME,
    type: chunkType,
    name: classInfo.name,
    content: contentParts.join('\n'),
  };
}

function createMethodChunk(method: MethodInfo): DocChunk {
  const contentParts = [
    `# ${method.className}.${method.name}`,
    '',
    `Signature: ${method.signature}`,
  ];

  if (method.isClassMethod) {
    contentParts.push('Type: classmethod');
  } else if (method.isStatic) {
    contentParts.push('Type: staticmethod');
  }

  if (method.docstring !== '') {
    contentParts.push('');
    contentParts.push(method.docstring);
  }

  return {
    id: `${SOURCE_NAME}:method:${method.className}.${method.name}`,
    source: SOURCE_NAME,
    type: 'method',
    name: method.name,
    parentName: method.className,
    signature: method.signature,
    content: contentParts.join('\n'),
  };
}

function createPropertyChunk(prop: PropertyInfo): DocChunk {
  const rwStatus = prop.readonly ? '[Read-Only]' : '[Read-Write]';

  const contentParts = [
    `# ${prop.className}.${prop.name}`,
    '',
    `Type: ${prop.type} ${rwStatus}`,
  ];

  if (prop.docstring !== '') {
    contentParts.push('');
    contentParts.push(prop.docstring);
  }

  return {
    id: `${SOURCE_NAME}:property:${prop.className}.${prop.name}`,
    source: SOURCE_NAME,
    type: 'property',
    name: prop.name,
    parentName: prop.className,
    content: contentParts.join('\n'),
  };
}

export function parseUnrealPython(inputPath: string, version?: string): ParserResult {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from trusted source
  const content = readFileSync(inputPath, 'utf8');
  // Normalize Windows line endings (\r\n -> \n) before splitting
  const lines = content.replaceAll('\r\n', '\n').split('\n');

  const classes = parseClasses(lines);
  const chunks: DocChunk[] = [];

  let methodCount = 0;
  let propertyCount = 0;
  let enumCount = 0;
  let classCount = 0;

  for (const classInfo of classes) {
    // Skip internal/private classes
    if (classInfo.name.startsWith('_')) {
      continue;
    }

    // Create class/enum chunk
    const classChunk = createClassChunk(classInfo, lines);
    classChunk.version = version;
    chunks.push(classChunk);

    if (classInfo.isEnum) {
      enumCount++;
    } else {
      classCount++;

      // Parse and create method chunks
      const methods = parseMethods(lines, classInfo);
      for (const method of methods) {
        const methodChunk = createMethodChunk(method);
        methodChunk.version = version;
        chunks.push(methodChunk);
        methodCount++;
      }

      // Parse and create property chunks
      const properties = parseProperties(lines, classInfo);
      for (const prop of properties) {
        const propChunk = createPropertyChunk(prop);
        propChunk.version = version;
        chunks.push(propChunk);
        propertyCount++;
      }
    }
  }

  const stats = `    Parsed: ${String(classCount)} classes, ${String(enumCount)} enums, ${String(methodCount)} methods, ${String(propertyCount)} properties\n`;
  process.stdout.write(stats);

  return {
    source: SOURCE_NAME,
    version,
    chunks,
  };
}
