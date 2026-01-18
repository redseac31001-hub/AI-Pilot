export function generateMcpConfig(): string {
  return JSON.stringify({ servers: [] }, null, 2);
}
