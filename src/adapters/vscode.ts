import path from 'path';
import { BaseAdapter } from './base';
import { ConfigBundle, WritePlan, WriteResult, WriteAction } from '../core/types';
import { readText } from '../utils/fs';
import { assessRisk } from '../utils/risk';
import { deepEqual } from '../utils/json';
import { applyWriteActions } from '../utils/write-plan';
import { rulesLabel } from '../generators/rules';

const SETTINGS_PATH = '.vscode/settings.json';

function buildSettingsAction(
  content: string,
  existingRaw: string | null,
  parseError: boolean
): WriteAction {
  const existing = existingRaw;

  if (existing !== null && existing === content) {
    return {
      type: 'skip',
      targetPath: SETTINGS_PATH,
      content,
      risk: 'low',
      reason: 'No changes detected',
    };
  }

  const exists = existing !== null;
  const risk = parseError ? 'high' : assessRisk(SETTINGS_PATH, exists);
  const reason = parseError
    ? 'Existing settings.json is invalid JSON'
    : exists
      ? 'File exists and content differs'
      : 'File does not exist';

  return {
    type: exists ? 'update' : 'create',
    targetPath: SETTINGS_PATH,
    content,
    risk,
    reason,
  };
}

export class VSCodeAdapter extends BaseAdapter {
  id = 'vscode';

  async detect(_rootPath: string): Promise<boolean> {
    return true;
  }

  async plan(rootPath: string, bundle: ConfigBundle): Promise<WritePlan> {
    const absolutePath = path.resolve(rootPath, SETTINGS_PATH);
    const raw = readText(absolutePath);
    let parseError = false;
    let existingSettings: Record<string, unknown> = {};

    if (raw) {
      try {
        existingSettings = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        parseError = true;
      }
    }

    const nextSettings = {
      ...existingSettings,
      'ai-pilot.rules': rulesLabel(bundle.detection.techStack.framework),
      'ai-pilot.lastUpdate': bundle.meta.generatedAt,
      'ai-pilot.detectedStack': bundle.detection.techStack,
    };

    const content = `${JSON.stringify(nextSettings, null, 2)}\n`;
    if (!parseError && deepEqual(existingSettings, nextSettings)) {
      const action: WriteAction = {
        type: 'skip',
        targetPath: SETTINGS_PATH,
        content,
        risk: 'low',
        reason: 'No semantic changes detected',
      };
      return { adapterId: this.id, actions: [action] };
    }

    const action = buildSettingsAction(content, raw, parseError);

    return { adapterId: this.id, actions: [action] };
  }

  async execute(rootPath: string, plan: WritePlan): Promise<WriteResult> {
    return {
      adapterId: plan.adapterId,
      actions: applyWriteActions(rootPath, plan.actions),
    };
  }
}
