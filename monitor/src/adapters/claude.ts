import type { AgentEvent } from '../core/agent-event';
import type { AgentTask } from '../core/agent-task';

import type { AgentAdapter } from './base';
import { buildTaskCommand, detectCliPath, safeParseJson } from './shared';

const DEFAULT_CLAUDE_PATH = 'D:\\nodejs\\node_global\\claude.ps1';

type ClaudeRawEvent =
  | { type: 'system'; subtype?: string }
  | {
      type: 'assistant';
      error?: string;
      message?: {
        content?: Array<{ type?: string; text?: string }>;
      };
    }
  | { type: 'result'; is_error?: boolean; result?: string }
  | { type: string; [key: string]: unknown };

export class ClaudeAdapter implements AgentAdapter {
  readonly id = 'claude';

  async detect(): Promise<boolean> {
    if (process.platform === 'win32') {
      return detectCliPath('CLAUDE_CLI_PATH', DEFAULT_CLAUDE_PATH);
    }

    return true;
  }

  buildCommand(task: AgentTask) {
    return buildTaskCommand(
      task,
      'CLAUDE_CLI_PATH',
      DEFAULT_CLAUDE_PATH,
      'claude',
      [
        '-p',
        '--verbose',
        '--output-format',
        'stream-json',
        '--include-partial-messages',
        '--no-session-persistence',
        task.prompt,
      ]
    );
  }

  parseEvent(raw: string, task: AgentTask): AgentEvent | null {
    const parsed = safeParseJson(raw) as ClaudeRawEvent | null;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
      return null;
    }

    const ts = Date.now();
    switch (parsed.type) {
      case 'system':
        if (parsed.subtype === 'init') {
          return { type: 'run.started', agentId: task.agentId, runId: task.runId, ts };
        }

        return null;
      case 'assistant':
        if (typeof parsed.error === 'string' && parsed.error.length > 0) {
          return {
            type: 'run.error',
            agentId: task.agentId,
            runId: task.runId,
            error: parsed.error,
            recoverable: false,
            ts,
          };
        }

        if (parsed.message && typeof parsed.message === 'object') {
          const message = parsed.message as {
            content?: Array<{ type?: string; text?: string }>;
          };
          const parts = Array.isArray(message.content) ? message.content : [];
          const text = parts
            .filter((part: { type?: string; text?: string }) => part.type === 'text' && typeof part.text === 'string')
            .map((part: { type?: string; text?: string }) => part.text ?? '')
            .join('');
          if (text.length > 0) {
            return {
              type: 'message.delta',
              agentId: task.agentId,
              runId: task.runId,
              text,
              ts,
            };
          }
        }

        return null;
      case 'result':
        return {
          type: 'run.finished',
          agentId: task.agentId,
          runId: task.runId,
          result: parsed.is_error ? 'failed' : 'success',
          ts,
        };
      default:
        return null;
    }
  }
}
