export type AgentConfig = {
  rules: string[];
  skills: string[];
  mcp: {
    servers: string[];
  };
};

type AgentConfigOptions = {
  rules?: string[];
  skills?: string[];
  mcpServers?: string[];
};

export function generateAgentConfig(options: AgentConfigOptions = {}): AgentConfig {
  return {
    rules: options.rules ?? [],
    skills: options.skills ?? [],
    mcp: {
      servers: options.mcpServers ?? [],
    },
  };
}
