import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { BundleAdapter } from '../src/adapters/bundle';
import { ConfigBundle, DetectionResult } from '../src/core/types';
import { rulesFileName } from '../src/generators/rules';

const fixturesRoot = path.resolve(process.cwd(), 'tests', 'fixtures');
const tmpDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-pilot-bundle-'));
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

function createDemoSkill(root: string, skillId: string): void {
  const skillDir = path.join(root, 'demo', 'custom-skills', skillId);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Demo skill\n', 'utf8');
}

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

describe('BundleAdapter', () => {
  it('builds rules and config WritePlan', async () => {
    const root = makeTempDir();
    const adapter = new BundleAdapter();
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
    const rulesPath = `.ai-pilot/rules/${rulesFileName('vue3')}`;
    const rulesAction = plan.actions.find(
      (action) => action.targetPath === rulesPath
    );
    const configAction = plan.actions.find(
      (action) => action.targetPath === '.ai-pilot/config.json'
    );
    const expectedRules = fs.readFileSync(
      path.join(fixturesRoot, 'expected-outputs', 'vue3-rules.md'),
      'utf8'
    );

    expect(rulesAction).toBeTruthy();
    expect(rulesAction?.content.trim()).toBe(expectedRules.trim());
    expect(configAction).toBeTruthy();

    const parsedConfig = JSON.parse(configAction?.content || '{}') as ConfigBundle;
    expect(parsedConfig.rules[0]).toBe(rulesPath);
    expect(parsedConfig.detection.techStack.framework).toBe('vue3');
  });

  it('skips user-managed rules files', async () => {
    const root = makeTempDir();
    const adapter = new BundleAdapter();
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
    const rulesPath = `.ai-pilot/rules/${rulesFileName('vue3')}`;
    const absoluteRulesPath = path.join(root, rulesPath);
    fs.mkdirSync(path.dirname(absoluteRulesPath), { recursive: true });
    fs.writeFileSync(absoluteRulesPath, '# Custom rules\n', 'utf8');

    const plan = await adapter.plan(root, bundle);
    const rulesAction = plan.actions.find(
      (action) => action.targetPath === rulesPath
    );

    expect(rulesAction?.type).toBe('skip');
    expect(rulesAction?.risk).toBe('high');
  });

  it('includes demo skills in the plan', async () => {
    const root = makeTempDir();
    createDemoSkill(root, 'demo-skill');
    const adapter = new BundleAdapter();
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
    const skillAction = plan.actions.find(
      (action) =>
        action.targetPath === '.ai-pilot/skills/demo-skill/SKILL.md'
    );
    const configAction = plan.actions.find(
      (action) => action.targetPath === '.ai-pilot/config.json'
    );

    expect(skillAction).toBeTruthy();

    const parsedConfig = JSON.parse(configAction?.content || '{}') as ConfigBundle;
    expect(parsedConfig.skills).toContain('.ai-pilot/skills/demo-skill');
  });
});
