import path from 'path';
import { createDetectors } from '../detectors';
import { getAdapters } from '../adapters/registry';
import { ConfigBundle, DetectionResult, GeneratedRule, WritePlan, WriteResult } from '../core/types';
import {
  collectImportedRules,
  generateRules,
  mergeRules,
  rulesLabel,
} from '../generators/rules';
import { isTTY } from './ui';
import { readJson } from '../utils/fs';
import { deepEqual } from '../utils/json';
import { LocalSkillProvider } from '../skills';

type OutputFormat = 'text' | 'json';

type InitOptions = {
  dryRun: boolean;
  write: boolean;
  yes: boolean;
  format: OutputFormat;
  ide?: string;
  ruleSources: string[];
  skillSourceDir?: string;
};

function parseArgs(args: string[]): InitOptions {
  let dryRun = false;
  let write = false;
  let yes = false;
  let format: OutputFormat = 'text';
  let ide: string | undefined;
  const ruleSources: string[] = [];
  let skillSourceDir: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    switch (arg) {
      case '--dry-run':
        dryRun = true;
        break;
      case '--write':
        write = true;
        break;
      case '--yes':
        yes = true;
        break;
      case '--format': {
        const value = args[i + 1];
        if (!value || (value !== 'json' && value !== 'text')) {
          throw new Error('Invalid --format value. Use "json" or "text".');
        }
        format = value;
        i += 1;
        break;
      }
      case '--ide': {
        const value = args[i + 1];
        if (!value) {
          throw new Error('Missing value for --ide.');
        }
        ide = value;
        i += 1;
        break;
      }
      case '--import-rules': {
        const value = args[i + 1];
        if (!value) {
          throw new Error('Missing value for --import-rules.');
        }
        ruleSources.push(value);
        i += 1;
        break;
      }
      case '--import-skills': {
        const value = args[i + 1];
        if (!value) {
          throw new Error('Missing value for --import-skills.');
        }
        skillSourceDir = value;
        i += 1;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!write) {
    dryRun = true;
  }

  return { dryRun, write, yes, format, ide, ruleSources, skillSourceDir };
}

function stripGeneratedAt(bundle: ConfigBundle): ConfigBundle {
  const { ruleSources, skillSourceDir, ...rest } = bundle;
  return {
    ...rest,
    meta: {
      ...bundle.meta,
      generatedAt: '',
    },
  };
}

function shouldReuseGeneratedAt(
  existing: ConfigBundle | null,
  candidate: ConfigBundle
): string | null {
  if (!existing?.meta?.generatedAt) {
    return null;
  }

  if (deepEqual(stripGeneratedAt(existing), stripGeneratedAt(candidate))) {
    return existing.meta.generatedAt;
  }

  return null;
}

function createConfigBundle(
  detection: DetectionResult,
  existing: ConfigBundle | null,
  rules: GeneratedRule[],
  skills: string[],
  ruleSources: string[],
  skillSourceDir?: string
): ConfigBundle {
  const rulesPaths = rules.map((rule) => rule.path);
  const candidate: ConfigBundle = {
    meta: {
      version: '0.0.1',
      generatedAt: new Date().toISOString(),
      generator: 'ai-pilot-poc',
    },
    detection,
    rules: rulesPaths,
    ...(ruleSources.length > 0 ? { ruleSources } : {}),
    skills,
    ...(skillSourceDir ? { skillSourceDir } : {}),
    agent: {
      configPath: '.ai-pilot/agent/config.json',
    },
    mcp: {
      configPath: '.ai-pilot/mcp/servers.json',
    },
  };

  const reuseGeneratedAt = shouldReuseGeneratedAt(existing, candidate);
  if (reuseGeneratedAt) {
    return {
      ...candidate,
      meta: {
        ...candidate.meta,
        generatedAt: reuseGeneratedAt,
      },
    };
  }

  return candidate;
}

function summarizePlan(plan: WritePlan): string {
  const counts = {
    create: 0,
    update: 0,
    skip: 0,
  };

  for (const action of plan.actions) {
    counts[action.type] += 1;
  }

  return `${plan.adapterId}: create ${counts.create}, update ${counts.update}, skip ${counts.skip}`;
}

function summarizeResult(result: WriteResult): string {
  const counts = {
    applied: 0,
    skipped: 0,
    failed: 0,
  };

  for (const action of result.actions) {
    counts[action.status] += 1;
  }

  return `${result.adapterId}: applied ${counts.applied}, skipped ${counts.skipped}, failed ${counts.failed}`;
}

export async function runInit(args: string[]): Promise<void> {
  const options = parseArgs(args);
  const rootPath = process.cwd();
  const detectors = createDetectors();

  if (detectors.length === 0) {
    throw new Error('No detectors available.');
  }

  const detection = await detectors[0].detect(rootPath);
  const generatedRules = generateRules(detection);
  const importedRules = collectImportedRules(rootPath, options.ruleSources);
  const mergedRules = mergeRules(generatedRules, importedRules);
  const skillProvider = new LocalSkillProvider(
    rootPath,
    options.skillSourceDir
      ? path.resolve(rootPath, options.skillSourceDir)
      : undefined
  );
  const skillIds = await skillProvider.listSkills();
  const skillPaths = skillIds.map((skillId) => `.ai-pilot/skills/${skillId}`);
  const existingBundle = readJson<ConfigBundle>(
    path.join(rootPath, '.ai-pilot', 'config.json')
  );
  const bundle = createConfigBundle(
    detection,
    existingBundle,
    mergedRules,
    skillPaths,
    options.ruleSources,
    options.skillSourceDir
  );

  const adapters = getAdapters().filter(
    (adapter) => !options.ide || adapter.id === options.ide
  );

  if (options.ide && adapters.length === 0) {
    throw new Error(`Unknown adapter: ${options.ide}`);
  }

  const planned = [] as Array<{
    plan: WritePlan;
    adapterId: string;
    execute: () => Promise<WriteResult>;
  }>;

  for (const adapter of adapters) {
    if (await adapter.detect(rootPath)) {
      const plan = await adapter.plan(rootPath, bundle);
      planned.push({
        plan,
        adapterId: adapter.id,
        execute: () => adapter.execute(rootPath, plan),
      });
    }
  }

  const canWrite = options.write && (options.yes || isTTY());
  const dryRun = options.dryRun || !canWrite;
  const plans = planned.map((item) => item.plan);

  if (options.format === 'json') {
    if (dryRun) {
      const output: Record<string, unknown> = { detection, bundle, plans };
      if (options.write && !canWrite) {
        output.warning = 'Non-TTY: pass --yes with --write to apply changes.';
      }
      console.log(JSON.stringify(output, null, 2));
      return;
    }

    const results = [] as WriteResult[];
    for (const item of planned) {
      results.push(await item.execute());
    }

    console.log(JSON.stringify({ detection, bundle, plans, results }, null, 2));
    return;
  }

  const stack = detection.techStack;
  console.log(
    `Detected: ${rulesLabel(stack.framework)} / ${stack.language} / ${stack.buildTool} / ${stack.store} (confidence ${detection.confidence.toFixed(2)})`
  );
  console.log(`Evidence: ${detection.evidence.length}`);
  for (const plan of plans) {
    console.log(`Plan: ${summarizePlan(plan)}`);
  }

  if (dryRun) {
    if (options.write && !canWrite) {
      console.log('Non-TTY: pass --yes with --write to apply changes.');
    }
    console.log('Dry-run: no changes written.');
    return;
  }

  const results = [] as WriteResult[];
  for (const item of planned) {
    results.push(await item.execute());
  }

  for (const result of results) {
    console.log(`Result: ${summarizeResult(result)}`);
  }
}
