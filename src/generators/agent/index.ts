export type AgentConfig = {
  rules: string[];
  skills: string[];
  mcp: {
    servers: string[];
  };
  behavior: AgentBehavior;
};

export type AgentBehaviorMode = 'assist' | 'review' | 'auto';
export type AgentBehaviorPriority = 'low' | 'normal' | 'high';

export type AgentBehavior = {
  mode: AgentBehaviorMode;
  priority: AgentBehaviorPriority;
  triggers: string[];
};

type AgentConfigOptions = {
  rules?: string[];
  skills?: string[];
  mcpServers?: string[];
  behavior?: Partial<AgentBehavior>;
};

const DEFAULT_BEHAVIOR: AgentBehavior = {
  mode: 'assist',
  priority: 'normal',
  triggers: ['on_request'],
};

export function generateAgentConfig(options: AgentConfigOptions = {}): AgentConfig {
  const behavior: AgentBehavior = {
    ...DEFAULT_BEHAVIOR,
    ...options.behavior,
  };
  return {
    rules: options.rules ?? [],
    skills: options.skills ?? [],
    mcp: {
      servers: options.mcpServers ?? [],
    },
    behavior,
  };
}
