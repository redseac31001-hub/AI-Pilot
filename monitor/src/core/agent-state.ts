import type { AgentHealthStatus, AgentStage } from './agent-event';

export type AgentRunStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'completed'
  | 'failed';

export type AgentRunState = {
  agentId: string;
  adapterId: string;
  runId: string;
  status: AgentRunStatus;
  stage: AgentStage;
  pid?: number;
  startedAt: number;
  endedAt?: number;
  lastEventAt?: number;
  lastMessage?: string;
  lastSummary?: string;
  error?: string;
  exitCode?: number | null;
  healthStatus?: AgentHealthStatus;
  restartCount?: number;
  nextRestartAt?: number;
};
