import type { AgentEvent } from '../core/agent-event';
import type { AgentCommand, AgentTask } from '../core/agent-task';

export interface AgentAdapter {
  id: string;
  detect(): Promise<boolean>;
  buildCommand(task: AgentTask): AgentCommand;
  parseEvent(raw: string, task: AgentTask): AgentEvent | null;
}
