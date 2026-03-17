import type { AgentEvent } from '../core/agent-event';
import type { AgentTask } from '../core/agent-task';

import type { AgentAdapter } from './base';
import { buildTaskCommand, detectCliPath, safeParseJson } from './shared';

const DEFAULT_CODEX_PATH = 'D:\\nodejs\\node_global\\codex.ps1';

type CodexRawEvent =
  | { type: 'thread.started'; thread_id?: string }
  | { type: 'turn.started' }
  | {
      type: 'item.completed';
      item?: { type?: string; text?: string; call_id?: string; command?: string; exit_code?: number };
    }
  | { type: 'turn.completed'; usage?: Record<string, number> }
  | { type: string; [key: string]: unknown };

export class CodexAdapter implements AgentAdapter {
  readonly id = 'codex';

  async detect(): Promise<boolean> {
    if (process.platform === 'win32') {
      return detectCliPath('CODEX_CLI_PATH', DEFAULT_CODEX_PATH);
    }

    return true;
  }

  buildCommand(task: AgentTask) {
    return buildTaskCommand(
      task,
      'CODEX_CLI_PATH',
      DEFAULT_CODEX_PATH,
      'codex',
      [
        'exec',
        '--json',
        '--color',
        'never',
        '--skip-git-repo-check',
        '--sandbox',
        'read-only',
        '--ephemeral',
        task.prompt,
      ]
    );
  }

  parseEvent(raw: string, task: AgentTask): AgentEvent | null {
    const parsed = safeParseJson(raw) as CodexRawEvent | null;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
      return null;
    }

    const ts = Date.now();
    switch (parsed.type) {
      case 'thread.started':
        return { type: 'run.started', agentId: task.agentId, runId: task.runId, ts };
      case 'turn.started':
        return {
          type: 'run.stage',
          agentId: task.agentId,
          runId: task.runId,
          stage: 'planning',
          ts,
        };
      case 'item.completed': {
        const item = parsed.item;
        if (!item || typeof item !== 'object') {
          return null;
        }

        const rawItem = item as {
          type?: string;
          text?: string;
          call_id?: string;
          command?: string;
          exit_code?: number;
        };
        if (typeof rawItem.type !== 'string') {
          return null;
        }

        if (
          rawItem.type === 'agent_message' &&
          typeof rawItem.text === 'string' &&
          rawItem.text.length > 0
        ) {
          return {
            type: 'message.delta',
            agentId: task.agentId,
            runId: task.runId,
            text: rawItem.text,
            ts,
          };
        }

        if (rawItem.type.includes('tool') && typeof rawItem.command === 'string') {
          return {
            type: 'tool.finished',
            agentId: task.agentId,
            runId: task.runId,
            exitCode: typeof rawItem.exit_code === 'number' ? rawItem.exit_code : 0,
            ts,
          };
        }

        return null;
      }
      case 'turn.completed':
        return {
          type: 'run.finished',
          agentId: task.agentId,
          runId: task.runId,
          result: 'success',
          ts,
        };
      default:
        return null;
    }
  }
}
