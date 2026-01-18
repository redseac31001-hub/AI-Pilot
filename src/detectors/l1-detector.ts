import fs from 'fs';
import path from 'path';
import { StackDetector } from '../core/interfaces';
import {
  BuildTool,
  DetectionResult,
  Evidence,
  Framework,
  Language,
  Store,
} from '../core/types';
import { readJson, readText } from '../utils/fs';
import { DEFAULT_ENTRY_FILES } from './utils';

const VUE2_ENTRY_PATTERN = /new\s+Vue\s*\(/;
const VUE3_ENTRY_PATTERN = /createApp\s*\(/;

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function toRelative(rootPath: string, filePath: string): string {
  return path.relative(rootPath, filePath).split(path.sep).join('/');
}

function parseMajor(version: string): number | null {
  const match = version.match(/(\d+)/);
  if (!match) {
    return null;
  }
  const major = Number(match[1]);
  return Number.isNaN(major) ? null : major;
}

function collectDependencies(pkg: PackageJson | null): Record<string, string> {
  if (!pkg) {
    return {};
  }
  return {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
  };
}

function findEntryFile(rootPath: string): string | null {
  for (const entry of DEFAULT_ENTRY_FILES) {
    const fullPath = path.join(rootPath, entry);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }
  return null;
}

export class L1Detector implements StackDetector {
  name = 'l1';

  async detect(rootPath: string): Promise<DetectionResult> {
    const pkgPath = path.join(rootPath, 'package.json');
    const pkg = readJson<PackageJson>(pkgPath);
    const deps = collectDependencies(pkg);
    const evidence: Evidence[] = [];

    const addEvidence = (
      type: Evidence['type'],
      filePath: string,
      description: string,
      weight: number
    ) => {
      evidence.push({ type, filePath, description, weight });
    };

    let framework: Framework = 'unknown';
    const vueVersion = deps.vue;

    if (vueVersion) {
      const major = parseMajor(vueVersion);
      if (major === 2) {
        framework = 'vue2';
      } else if (major === 3) {
        framework = 'vue3';
      }

      if (framework !== 'unknown') {
        addEvidence(
          'dependency',
          'package.json',
          `Found vue version ${vueVersion}`,
          0.4
        );
      }
    }

    const entryPath = findEntryFile(rootPath);
    if (entryPath) {
      addEvidence(
        'file_existence',
        toRelative(rootPath, entryPath),
        `Found entry file ${path.basename(entryPath)}`,
        0.05
      );

      const entryContent = readText(entryPath) || '';
      if (VUE3_ENTRY_PATTERN.test(entryContent)) {
        addEvidence(
          'content_match',
          toRelative(rootPath, entryPath),
          'Found createApp() in entry file',
          0.4
        );
        if (framework === 'unknown') {
          framework = 'vue3';
        }
      }
      if (VUE2_ENTRY_PATTERN.test(entryContent)) {
        addEvidence(
          'content_match',
          toRelative(rootPath, entryPath),
          'Found new Vue() in entry file',
          0.4
        );
        if (framework === 'unknown') {
          framework = 'vue2';
        }
      }
    }

    let language: Language = 'unknown';
    if (entryPath?.endsWith('.ts')) {
      language = 'ts';
      addEvidence(
        'file_existence',
        toRelative(rootPath, entryPath),
        'Entry file is TypeScript',
        0.1
      );
    } else if (entryPath?.endsWith('.js')) {
      language = 'js';
      addEvidence(
        'file_existence',
        toRelative(rootPath, entryPath),
        'Entry file is JavaScript',
        0.1
      );
    } else if (deps.typescript) {
      language = 'ts';
      addEvidence(
        'dependency',
        'package.json',
        'Found typescript dependency',
        0.1
      );
    }

    let buildTool: BuildTool = 'unknown';
    if (deps.vite) {
      buildTool = 'vite';
      addEvidence('dependency', 'package.json', 'Found vite dependency', 0.1);
    } else if (deps['@vue/cli-service']) {
      buildTool = 'vue-cli';
      addEvidence(
        'dependency',
        'package.json',
        'Found @vue/cli-service dependency',
        0.1
      );
    }

    let store: Store = 'none';
    if (deps.pinia) {
      store = 'pinia';
      addEvidence('dependency', 'package.json', 'Found pinia dependency', 0.1);
    } else if (deps.vuex) {
      store = 'vuex';
      addEvidence('dependency', 'package.json', 'Found vuex dependency', 0.1);
    }

    const confidence =
      evidence.length === 0
        ? 0
        : Math.min(
            1,
            evidence.reduce((sum, item) => sum + item.weight, 0)
          );

    return {
      techStack: {
        framework,
        language,
        buildTool,
        store,
      },
      confidence,
      evidence,
    };
  }
}
