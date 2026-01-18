export function generateAgentConfig(): string {
  return JSON.stringify({ rules: [], skills: [], mcp: [] }, null, 2);
}
