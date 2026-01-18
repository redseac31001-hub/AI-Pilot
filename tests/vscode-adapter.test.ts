import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { VSCodeAdapter } from '../src/adapters/vscode';
import { ConfigBundle, DetectionResult } from '../src/core/types';
import { rulesFileName } from '../src/generators/rules';

const fixturesRoot = path.resolve(process.cwd(), 'tests', 'fixtures');
const tmpDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-pilot-vscode-'));
  tmpDirs.push(dir);
  return dir;
}

function makeBundle(detection: DetectionResult): ConfigBundle {
  return {
    meta: {
      version: '0.0.1',
      generatedAt: '2026-01-18T00:00:00+08:00',
      generator: 'ai-pilot-poc',
    },
    detection,
    rules: [`.ai-pilot/rules/${rulesFileName(detection.techStack.framework)}`],
    skills: [],
    agent: {
      configPath: '.ai-pilot/agent/config.json',
    },
    mcp: {
      configPath: '.ai-pilot/mcp/servers.json',
    },
  };
}

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

describe('VSCodeAdapter', () => {
  it('builds settings.json WritePlan', async () => {
    const root = makeTempDir();
    const adapter = new VSCodeAdapter();
    const detection: DetectionResult = {
      techStack: {
        framework: 'vue3',
        language: 'ts',
        buildTool: 'vite',
        store: 'pinia',
      },
      confidence: 1,
      evidence: [],
    };
    const bundle = makeBundle(detection);
    const plan = await adapter.plan(root, bundle);
    const expectedSettings = fs.readFileSync(
      path.join(fixturesRoot, 'expected-outputs', 'vscode-settings.json'),
      'utf8'
    );

    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0].targetPath).toBe('.vscode/settings.json');
    expect(plan.actions[0].content.trim()).toBe(expectedSettings.trim());
  });

  it('skips when settings are semantically identical', async () => {
    const root = makeTempDir();
    const adapter = new VSCodeAdapter();
    const detection: DetectionResult = {
      techStack: {
        framework: 'vue3',
        language: 'ts',
        buildTool: 'vite',
        store: 'pinia',
      },
      confidence: 1,
      evidence: [],
    };
    const bundle = makeBundle(detection);

    const settingsPath = path.join(root, '.vscode', 'settings.json');
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      `{\n  \"ai-pilot.detectedStack\": {\n    \"framework\": \"vue3\",\n    \"language\": \"ts\",\n    \"store\": \"pinia\",\n    \"buildTool\": \"vite\"\n  },\n  \"ai-pilot.lastUpdate\": \"2026-01-18T00:00:00+08:00\",\n  \"ai-pilot.rules\": \"Vue 3\"\n}\n`,
      'utf8'
    );

    const plan = await adapter.plan(root, bundle);
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0].type).toBe('skip');
  });
});
