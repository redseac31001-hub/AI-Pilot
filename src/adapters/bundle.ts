import path from 'path';
import { BaseAdapter } from './base';
import { ConfigBundle, WritePlan, WriteResult, WriteAction } from '../core/types';
import { generateRules, RULES_MARKER } from '../generators/rules';
import { assessRisk } from '../utils/risk';
import { readText } from '../utils/fs';
import { deepEqual } from '../utils/json';
import { applyWriteActions } from '../utils/write-plan';
import { generateAgentConfig } from '../generators/agent';
import { generateMcpConfig } from '../generators/mcp';
import { LocalSkillProvider } from '../skills';

const CONFIG_PATH = '.ai-pilot/config.json';
const RULES_MARKER_HEADER = `${RULES_MARKER}\n\n`;

function stripRulesMarker(content: string): string {
  if (content.startsWith(RULES_MARKER_HEADER)) {
    return content.slice(RULES_MARKER_HEADER.length);
  }
  return content;
}

function buildTextWriteAction(
  targetPath: string,
  content: string,
  existing: string | null
): WriteAction {
  if (existing !== null && existing === content) {
    return {
      type: 'skip',
      targetPath,
      content,
      risk: 'low',
      reason: 'No changes detected',
    };
  }

  const exists = existing !== null;
  return {
    type: exists ? 'update' : 'create',
    targetPath,
    content,
    risk: assessRisk(targetPath, exists),
    reason: exists ? 'File exists and content differs' : 'File does not exist',
  };
}

function buildJsonWriteAction(
  rootPath: string,
  targetPath: string,
  data: unknown
): WriteAction {
  const absolutePath = path.resolve(rootPath, targetPath);
  const existingRaw = readText(absolutePath);
  let parseError = false;
  let existingJson: unknown = null;

  if (existingRaw !== null) {
    try {
      existingJson = JSON.parse(existingRaw) as unknown;
    } catch {
      parseError = true;
    }
  }

  const content = `${JSON.stringify(data, null, 2)}\n`;

  if (!parseError && existingJson !== null && deepEqual(existingJson, data)) {
    return {
      type: 'skip',
      targetPath,
      content,
      risk: 'low',
      reason: 'No semantic changes detected',
    };
  }

  const exists = existingRaw !== null;
  const risk = parseError ? 'high' : assessRisk(targetPath, exists);
  const reason = parseError
    ? 'Existing JSON is invalid'
    : exists
      ? 'File exists and content differs'
      : 'File does not exist';

  return {
    type: exists ? 'update' : 'create',
    targetPath,
    content,
    risk,
    reason,
  };
}

function buildRulesWriteAction(
  targetPath: string,
  content: string,
  existing: string | null
): WriteAction {
  if (existing !== null && !existing.includes(RULES_MARKER)) {
    const legacyContent = stripRulesMarker(content).trim();
    if (existing.trim() !== legacyContent) {
      return {
        type: 'skip',
        targetPath,
        content,
        risk: 'high',
        reason: 'User-managed rules file detected',
      };
    }
  }

  return buildTextWriteAction(targetPath, content, existing);
}

export class BundleAdapter extends BaseAdapter {
  id = 'bundle';

  async detect(_rootPath: string): Promise<boolean> {
    return true;
  }

  async plan(rootPath: string, bundle: ConfigBundle): Promise<WritePlan> {
    const ruleOutputs = generateRules(bundle.detection);
    const rulePaths = ruleOutputs.map((rule) => rule.path);
    const skillProvider = new LocalSkillProvider(rootPath);
    const skillIds = await skillProvider.listSkills();
    const skillPaths = skillIds.map((skillId) => `.ai-pilot/skills/${skillId}`);
    const skillFiles = skillIds.flatMap((skillId) =>
      skillProvider.readSkillFiles(skillId)
    );

    const bundleForWrite = { ...bundle, rules: rulePaths, skills: skillPaths };
    const mcpConfig = generateMcpConfig(rootPath);
    const agentConfig = generateAgentConfig({
      rules: rulePaths,
      skills: skillPaths,
      mcpServers: Object.keys(mcpConfig.mcpServers),
    });

    const actions: WriteAction[] = [
      ...ruleOutputs.map((rule) => {
        const rulesAbsolutePath = path.resolve(rootPath, rule.path);
        const existingRules = readText(rulesAbsolutePath);
        return buildRulesWriteAction(rule.path, rule.content, existingRules);
      }),
      ...skillFiles.map((file) => {
        const targetPath = `.ai-pilot/skills/${file.relativePath}`;
        const existing = readText(path.resolve(rootPath, targetPath));
        return buildTextWriteAction(targetPath, file.content, existing);
      }),
      buildJsonWriteAction(rootPath, CONFIG_PATH, bundleForWrite),
      buildJsonWriteAction(rootPath, bundle.agent.configPath, agentConfig),
      buildJsonWriteAction(rootPath, bundle.mcp.configPath, mcpConfig),
    ];

    return { adapterId: this.id, actions };
  }

  async execute(rootPath: string, plan: WritePlan): Promise<WriteResult> {
    return {
      adapterId: plan.adapterId,
      actions: applyWriteActions(rootPath, plan.actions),
    };
  }
}
