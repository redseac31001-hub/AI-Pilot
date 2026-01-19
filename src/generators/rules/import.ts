import fs from 'fs';
import path from 'path';
import { GeneratedRule } from '../../core/types';
import { RULES_MARKER } from './marker';

const LAYER_DIRS = ['layer1_base', 'layer2_business', 'layer3_action'] as const;

type RuleSourceFile = {
  relativePath: string;
  absolutePath: string;
};

type CollectImportedRulesOptions = {
  onWarning?: (message: string) => void;
};

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

function ensureRulesMarker(content: string): string {
  if (content.startsWith(RULES_MARKER)) {
    return content;
  }
  return `${RULES_MARKER}\n\n${content}`;
}

function shouldSkipEntry(name: string): boolean {
  return name.startsWith('.') || name.startsWith('_');
}

function collectRuleFiles(
  baseDir: string,
  relativeDir: string,
  files: RuleSourceFile[]
): void {
  const fullDir = path.join(baseDir, relativeDir);
  const entries = fs.readdirSync(fullDir, { withFileTypes: true });

  for (const entry of entries) {
    if (shouldSkipEntry(entry.name)) {
      continue;
    }
    const entryRelative = path.join(relativeDir, entry.name);
    const entryFullPath = path.join(baseDir, entryRelative);

    if (entry.isDirectory()) {
      collectRuleFiles(baseDir, entryRelative, files);
      continue;
    }

    if (!entry.name.toLowerCase().endsWith('.md')) {
      continue;
    }

    files.push({
      relativePath: entryRelative,
      absolutePath: entryFullPath,
    });
  }
}

function resolveSourcePath(rootPath: string, source: string): string {
  return path.isAbsolute(source) ? source : path.resolve(rootPath, source);
}

function buildSourceIds(sources: string[]): Map<string, string> {
  const ids = new Map<string, string>();
  const counts = new Map<string, number>();

  for (const source of sources) {
    const base = path
      .basename(source)
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .toLowerCase();
    const seen = counts.get(base) ?? 0;
    counts.set(base, seen + 1);
    const suffix = seen === 0 ? '' : `-${seen + 1}`;
    ids.set(source, `${base || 'rules'}${suffix}`);
  }

  return ids;
}

function collectSourceFiles(sourceRoot: string): RuleSourceFile[] {
  const files: RuleSourceFile[] = [];
  const layerDirs = LAYER_DIRS.filter((layer) =>
    fs.existsSync(path.join(sourceRoot, layer))
  );

  if (layerDirs.length > 0) {
    for (const layer of layerDirs) {
      collectRuleFiles(sourceRoot, layer, files);
    }
    return files;
  }

  collectRuleFiles(sourceRoot, '', files);
  return files;
}

export function collectImportedRules(
  rootPath: string,
  sources: string[] = [],
  options: CollectImportedRulesOptions = {}
): GeneratedRule[] {
  if (sources.length === 0) {
    return [];
  }

  const warn = options.onWarning;
  const resolvedSources = Array.from(
    new Set(sources.map((source) => resolveSourcePath(rootPath, source)))
  );
  const sourceIds = buildSourceIds(resolvedSources);
  const imported: GeneratedRule[] = [];

  for (const source of resolvedSources) {
    if (!fs.existsSync(source)) {
      warn?.(`Warning: --import-rules source not found, skipping: ${source}`);
      continue;
    }
    const stat = fs.statSync(source);
    if (!stat.isDirectory()) {
      warn?.(`Warning: --import-rules source is not a directory, skipping: ${source}`);
      continue;
    }

    const sourceId = sourceIds.get(source) ?? 'rules';
    const files = collectSourceFiles(source);

    if (files.length === 0) {
      warn?.(`Warning: no markdown rules found under --import-rules source: ${source}`);
      continue;
    }

    for (const file of files) {
      const relative = toPosixPath(file.relativePath);
      const targetPath = `.ai-pilot/rules/imported/${sourceId}/${relative}`;
      const rawContent = fs.readFileSync(file.absolutePath, 'utf8');
      imported.push({
        path: targetPath,
        content: ensureRulesMarker(rawContent),
      });
    }
  }

  return imported;
}
