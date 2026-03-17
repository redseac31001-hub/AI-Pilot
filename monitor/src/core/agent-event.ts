export type AgentStage =
  | 'queued'
  | 'planning'
  | 'executing'
  | 'editing'
  | 'testing'
  | 'summarizing'
  | 'waiting'
  | 'done'
  | 'error';

export type AgentHealthStatus = 'alive' | 'unresponsive' | 'crashed';

export type AgentEvent =
  | { type: 'run.started'; agentId: string; runId: string; ts: number }
  | { type: 'run.stage'; agentId: string; runId: string; stage: AgentStage; ts: number }
  | { type: 'run.notice'; agentId: string; runId: string; level: 'info' | 'warn'; text: string; ts: number }
  | { type: 'tool.started'; agentId: string; runId: string; command: string; ts: number }
  | { type: 'tool.finished'; agentId: string; runId: string; exitCode: number; ts: number }
  | { type: 'message.delta'; agentId: string; runId: string; text: string; ts: number }
  | { type: 'summary.updated'; agentId: string; runId: string; text: string; ts: number }
  | { type: 'run.error'; agentId: string; runId: string; error: string; recoverable: boolean; ts: number }
  | { type: 'agent.health'; agentId: string; runId: string; status: AgentHealthStatus; pid: number; ts: number }
  | { type: 'run.finished'; agentId: string; runId: string; result: 'success' | 'failed'; ts: number };

// Phase 4 reserve:
// | { type: 'cost.updated'; agentId: string; runId: string; inputTokens: number; outputTokens: number; ts: number }
