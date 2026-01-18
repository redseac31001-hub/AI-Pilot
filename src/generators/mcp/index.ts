import fs from 'fs';
import path from 'path';

export type McpServerConfig = {
  command: string;
  args: string[];
};

export type McpConfig = {
  mcpServers: Record<string, McpServerConfig>;
};

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

export function generateMcpConfig(rootPath: string): McpConfig {
  const servers: Record<string, McpServerConfig> = {
    filesystem: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
    },
    git: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-git'],
    },
  };

  const demoServerPath = path.join(rootPath, 'demo', 'scripts', 'simple-server.js');
  if (fs.existsSync(demoServerPath)) {
    servers['demo-files'] = {
      command: 'node',
      args: [toPosixPath(path.relative(rootPath, demoServerPath))],
    };
  }

  return { mcpServers: servers };
}
