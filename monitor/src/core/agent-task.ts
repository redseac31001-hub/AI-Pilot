export type AgentCommand = {
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
};

export type AgentTask = {
  agentId: string;
  runId: string;
  cwd: string;
  prompt: string;
  metadata?: Record<string, string>;
};
