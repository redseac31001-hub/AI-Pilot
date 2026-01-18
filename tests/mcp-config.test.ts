import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { generateMcpConfig } from '../src/generators/mcp';

const tmpDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-pilot-mcp-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

describe('generateMcpConfig', () => {
  it('includes default MCP servers', () => {
    const root = makeTempDir();
    const config = generateMcpConfig(root);

    expect(config.mcpServers.filesystem).toBeTruthy();
    expect(config.mcpServers.git).toBeTruthy();
  });

  it('includes demo server when present', () => {
    const root = makeTempDir();
    const demoServerPath = path.join(root, 'demo', 'scripts', 'simple-server.js');
    fs.mkdirSync(path.dirname(demoServerPath), { recursive: true });
    fs.writeFileSync(demoServerPath, 'console.log(\"demo\");', 'utf8');

    const config = generateMcpConfig(root);

    expect(config.mcpServers['demo-files']).toBeTruthy();
  });
});
