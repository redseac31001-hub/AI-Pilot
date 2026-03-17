const { spawn } = require('child_process');
const { once } = require('events');
const { mkdirSync, rmSync, writeFileSync } = require('fs');
const { join, resolve } = require('path');

const WebSocket = require('ws');
const kill = require('tree-kill');

const monitorDir = resolve(__dirname, '..');
const chromeCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

async function main() {
  const portOffset = Math.floor(Math.random() * 500);
  const monitorPort = 5820 + portOffset;
  const debugPort = 10820 + portOffset;
  const monitorUrl = `http://127.0.0.1:${monitorPort}/`;
  const chromePath = await findChrome();
  const cleanupTasks = [];
  const results = [];

  const workspaceRoot = createWorkspaceFixture();
  cleanupTasks.push(() => rmSync(workspaceRoot, { recursive: true, force: true }));

  try {
    const server = startMonitorServer(monitorPort, workspaceRoot);
    cleanupTasks.push(() => stopChild(server));
    await waitForServerReady(server, monitorUrl);

    const browser = startChrome(chromePath, debugPort, monitorUrl);
    cleanupTasks.push(() => stopChild(browser));
    await waitForChromeReady(debugPort);

    const pageWsUrl = await waitForPageTarget(debugPort, monitorUrl);
    const cdp = new CdpSession(pageWsUrl);
    cleanupTasks.push(() => cdp.close());
    await cdp.ready();

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await waitFor(async () => (await cdp.evaluate('document.readyState')) === 'complete', 15000, 250);
    await waitFor(async () => (await cdp.evaluate('typeof state')) === 'object', 15000, 250);

    results.push(await runCase('Case 1', async () => {
      const health = await waitFor(async () => {
        const payload = await fetchJson(`${monitorUrl}api/health`);
        return payload.activeRuns >= 1 ? payload : null;
      }, 90000, 500);

      return `Monitor auto-started configured agents; activeRuns=${health.activeRuns}.`;
    }));

    results.push(await runCase('Case 2', async () => {
      const agents = await waitFor(async () => {
        const payload = await fetchJson(`${monitorUrl}api/agents`);
        const names = (payload.agents || []).map((agent) => agent.agentId);
        return names.includes('config-codex1') && names.includes('config-codex2') ? payload.agents : null;
      }, 90000, 500);

      return `Configured agents loaded: ${agents.map((agent) => agent.agentId).join(', ')}.`;
    }));

    results.push(await runCase('Case 3', async () => {
      const cardInfo = await waitFor(async () => {
        const payload = await cdp.evaluate(`(() => ({
          names: state.agents.map((agent) => agent.agentId),
          totalCards: document.querySelectorAll('.card').length
        }))()`);
        return payload.names.includes('config-codex1') && payload.names.includes('config-codex2') ? payload : null;
      }, 90000, 500);

      return `Page rendered default agent cards automatically; totalCards=${cardInfo.totalCards}.`;
    }));

    results.push(await runCase('Case 4', async () => {
      const eventInfo = await waitFor(async () => {
        const payload = await cdp.evaluate(`(() => ({
          eventAgents: [...new Set(state.events.map((event) => event.agentId))],
          eventTypes: [...new Set(state.events.map((event) => event.type))]
        }))()`);
        return payload.eventAgents.includes('config-codex1') && payload.eventAgents.includes('config-codex2')
          ? payload
          : null;
      }, 120000, 500);

      return `Auto-started agents emitted events: agents=${eventInfo.eventAgents.join(', ')}, types=${eventInfo.eventTypes.join(', ')}.`;
    }));

    process.stdout.write(renderSummary(results));
  } catch (error) {
    process.stderr.write(`Phase 2 config acceptance failed: ${error.stack || error.message}\n`);
    process.exitCode = 1;
  } finally {
    for (const cleanup of cleanupTasks.reverse()) {
      try {
        await cleanup();
      } catch {}
    }
  }
}

function createWorkspaceFixture() {
  const workspaceRoot = join(monitorDir, '.tmp', `phase2-config-workspace-${Date.now()}`);
  const configDir = join(workspaceRoot, '.ai-pilot');
  mkdirSync(configDir, { recursive: true });

  const config = {
    agents: [
      {
        id: 'config-codex1',
        adapter: 'codex',
        cwd: '.',
        prompt: 'Reply with the single word OK.',
      },
      {
        id: 'config-codex2',
        adapter: 'codex',
        cwd: '.',
        prompt: 'Reply with the single word OK.',
      },
    ],
  };

  writeFileSync(join(configDir, 'monitor.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return workspaceRoot;
}

function startMonitorServer(port, workspaceRoot) {
  return spawn('node', ['start.js'], {
    cwd: monitorDir,
    env: {
      ...process.env,
      MONITOR_PORT: String(port),
      MONITOR_WORKSPACE_ROOT: workspaceRoot,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
}

function startChrome(chromePath, debugPort, monitorUrl) {
  const userDataDir = join(monitorDir, '.tmp', `phase2-config-profile-${Date.now()}`);
  mkdirSync(userDataDir, { recursive: true });

  return spawn(
    chromePath,
    [
      `--remote-debugging-port=${debugPort}`,
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${userDataDir}`,
      monitorUrl,
    ],
    {
      cwd: monitorDir,
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    }
  );
}

async function waitForServerReady(server, monitorUrl) {
  let stdout = '';
  let stderr = '';

  server.stdout.on('data', (chunk) => {
    stdout += chunk.toString('utf8');
  });
  server.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf8');
  });

  await waitFor(async () => {
    if (stdout.includes('AI-Pilot monitor listening on')) {
      return true;
    }
    try {
      const res = await fetch(`${monitorUrl}api/health`);
      return res.ok;
    } catch {
      return false;
    }
  }, 30000, 250);

  if (stderr.trim()) {
    process.stdout.write(`[monitor stderr]\n${stderr}\n`);
  }
}

async function waitForChromeReady(debugPort) {
  await waitFor(async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      return res.ok;
    } catch {
      return false;
    }
  }, 30000, 250);
}

async function waitForPageTarget(debugPort, monitorUrl) {
  return waitFor(async () => {
    const res = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    if (!res.ok) {
      return null;
    }
    const targets = await res.json();
    const page = targets.find((target) => target.type === 'page' && target.url.startsWith(monitorUrl));
    return page ? page.webSocketDebuggerUrl : null;
  }, 30000, 250);
}

async function findChrome() {
  for (const candidate of chromeCandidates) {
    try {
      await fetch('data:text/plain,noop');
      require('fs').accessSync(candidate);
      return candidate;
    } catch {}
  }

  throw new Error('Chrome or Edge not found for headless acceptance');
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) {
    return;
  }

  await new Promise((resolve) => {
    kill(child.pid, 'SIGKILL', () => resolve());
  });
  await Promise.race([once(child, 'exit'), wait(2000)]);
}

async function fetchJson(url) {
  const res = await fetch(url);
  const payload = await res.json();
  if (!res.ok) {
    throw new Error(payload.error || 'Request failed');
  }
  return payload;
}

async function runCase(name, callback) {
  try {
    const notes = await callback();
    return { name, result: 'pass', notes };
  } catch (error) {
    return {
      name,
      result: 'fail',
      notes: error instanceof Error ? error.message : String(error),
    };
  }
}

function renderSummary(results) {
  const overall = results.every((result) => result.result === 'pass') ? 'pass' : 'fail';
  const lines = [
    '## Phase 2 Config Acceptance Result',
    '',
    `- Date: ${new Date().toISOString()}`,
    '- Tester: GPT-5 Codex (headless browser)',
    '- Command: `npm run verify:phase2-config`',
    '',
  ];

  for (const result of results) {
    lines.push(`### ${result.name}`);
    lines.push(`- Result: ${result.result}`);
    lines.push(`- Notes: ${result.notes}`);
    lines.push('');
  }

  lines.push('### Overall');
  lines.push(`- Overall result: ${overall}`);
  lines.push('- Follow-up: Claude page validation and frontend migration assessment remain pending.');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(check, timeoutMs, intervalMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await check();
    if (value) {
      return value;
    }
    await wait(intervalMs);
  }

  throw new Error(`Timed out after ${timeoutMs}ms`);
}

class CdpSession {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.pending = new Map();
    this.nextId = 1;
    this.openPromise = new Promise((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
    });

    this.ws.on('message', (data) => {
      const payload = JSON.parse(data.toString('utf8'));
      if (payload.id && this.pending.has(payload.id)) {
        const pending = this.pending.get(payload.id);
        this.pending.delete(payload.id);
        if (payload.error) {
          pending.reject(new Error(payload.error.message || 'CDP error'));
          return;
        }
        pending.resolve(payload.result || {});
      }
    });
  }

  async ready() {
    await this.openPromise;
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }), (error) => {
        if (error) {
          this.pending.delete(id);
          reject(error);
        }
      });
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });

    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || `Failed to evaluate: ${expression}`);
    }

    return result.result ? result.result.value : undefined;
  }

  close() {
    if (this.ws.readyState === WebSocket.CLOSED) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.ws.once('close', resolve);
      this.ws.close();
    });
  }
}

void main();
