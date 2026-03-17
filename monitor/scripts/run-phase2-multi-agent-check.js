const { spawn } = require('child_process');
const { once } = require('events');
const { mkdirSync } = require('fs');
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
  const monitorPort = 4820 + portOffset;
  const debugPort = 9830 + portOffset;
  const monitorUrl = `http://127.0.0.1:${monitorPort}/`;
  const chromePath = await findChrome();
  const cleanupTasks = [];
  const results = [];
  const createdRunIds = [];

  try {
    const server = startMonitorServer(monitorPort);
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
      const checks = await cdp.evaluate(`(() => ({
        title: document.title,
        hasAgentIdInput: Boolean(document.getElementById('agent-id-input')),
        hasRunCountInput: Boolean(document.getElementById('run-count-input')),
        hasBoardStats: Boolean(document.getElementById('board-stats')),
        cardsEmpty: document.querySelectorAll('.card').length === 0
      }))()`);

      if (
        checks.title !== 'AI-Pilot Monitor' ||
        !checks.hasAgentIdInput ||
        !checks.hasRunCountInput ||
        !checks.hasBoardStats ||
        !checks.cardsEmpty
      ) {
        throw new Error(`Unexpected multi-agent landing state: ${JSON.stringify(checks)}`);
      }

      return 'Multi-agent controls and empty board rendered.';
    }));

    results.push(await runCase('Case 2', async () => {
      await cdp.evaluate(`(() => {
        els.adapterSelect.value = 'codex';
        els.agentIdInput.value = 'codex';
        els.runCountInput.value = '2';
        els.promptInput.value = 'Read monitor/TASKS.md and reply with the exact text Phase 2.';
        els.cwdInput.value = '';
        els.startRun.click();
        return true;
      })()`);

      const runIds = await waitFor(async () => {
        const snapshot = await cdp.evaluate(`(() => ({
          runIds: state.agents.map((agent) => agent.runId),
          activeRuns: Number(document.getElementById('active-runs').textContent || '0')
        }))()`);

        const uniqueRunIds = Array.isArray(snapshot.runIds) ? [...new Set(snapshot.runIds)] : [];
        if (uniqueRunIds.length >= 2 && snapshot.activeRuns >= 2) {
          return uniqueRunIds.slice(0, 2);
        }

        return null;
      }, 90000, 250);

      createdRunIds.push(...runIds);
      return `Two codex runs entered active state concurrently: ${runIds.join(', ')}.`;
    }));

    results.push(await runCase('Case 3', async () => {
      const board = await waitFor(async () => {
        const snapshot = await cdp.evaluate(`(() => ({
          agentIds: state.agents.map((agent) => agent.agentId),
          totalCards: document.querySelectorAll('.card').length,
          boardText: document.getElementById('board-stats').innerText
        }))()`);

        const hasCodex1 = Array.isArray(snapshot.agentIds) && snapshot.agentIds.includes('codex1');
        const hasCodex2 = Array.isArray(snapshot.agentIds) && snapshot.agentIds.includes('codex2');
        return hasCodex1 && hasCodex2 && snapshot.totalCards >= 2 ? snapshot : null;
      }, 90000, 250);

      return `Board rendered multiple cards with named agents: ${board.agentIds.join(', ')}.`;
    }));

    results.push(await runCase('Case 4', async () => {
      const eventSummary = await waitFor(async () => {
        const snapshot = await cdp.evaluate(`(() => ({
          eventAgents: [...new Set(state.events.map((event) => event.agentId))],
          eventTypes: [...new Set(state.events.map((event) => event.type))]
        }))()`);

        const hasCodex1 = Array.isArray(snapshot.eventAgents) && snapshot.eventAgents.includes('codex1');
        const hasCodex2 = Array.isArray(snapshot.eventAgents) && snapshot.eventAgents.includes('codex2');
        return hasCodex1 && hasCodex2 ? snapshot : null;
      }, 120000, 500);

      return `Chat feed received structured events for both agents: agents=${eventSummary.eventAgents.join(', ')}, types=${eventSummary.eventTypes.join(', ')}.`;
    }));

    process.stdout.write(renderSummary(results));
  } catch (error) {
    process.stderr.write(`Phase 2 multi-agent acceptance failed: ${error.stack || error.message}\n`);
    process.exitCode = 1;
  } finally {
    for (const runId of createdRunIds) {
      try {
        await fetch(`${monitorUrl}api/runs/${runId}/stop`, { method: 'POST' });
      } catch {}
    }

    for (const cleanup of cleanupTasks.reverse()) {
      try {
        await cleanup();
      } catch {}
    }
  }
}

function startMonitorServer(port) {
  return spawn('node', ['start.js'], {
    cwd: monitorDir,
    env: { ...process.env, MONITOR_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
}

function startChrome(chromePath, debugPort, monitorUrl) {
  const userDataDir = join(monitorDir, '.tmp', `phase2-browser-profile-${Date.now()}`);
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
    '## Phase 2 Multi-Agent Acceptance Result',
    '',
    `- Date: ${new Date().toISOString()}`,
    '- Tester: GPT-5 Codex (headless browser)',
    '- Command: `npm run verify:phase2-multi`',
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
  lines.push('- Follow-up: Text summaries and monitor config remain pending in later Phase 2 slices.');
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
