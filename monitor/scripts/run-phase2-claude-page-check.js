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
  const monitorPort = 5920 + portOffset;
  const debugPort = 10920 + portOffset;
  const monitorUrl = `http://127.0.0.1:${monitorPort}/`;
  const chromePath = await findChrome();
  const cleanupTasks = [];
  const results = [];
  let createdRunId = null;

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
      const ready = await cdp.evaluate(`(() => ({
        hasAdapter: Boolean(document.getElementById('adapter-select')),
        hasClaudeOption: [...document.querySelectorAll('#adapter-select option')].some((item) => item.value === 'claude'),
        hasFeed: Boolean(document.getElementById('feed-list'))
      }))()`);

      if (!ready.hasAdapter || !ready.hasClaudeOption || !ready.hasFeed) {
        throw new Error(`Unexpected Claude page state: ${JSON.stringify(ready)}`);
      }

      return 'Claude adapter controls and chat feed rendered.';
    }));

    results.push(await runCase('Case 2', async () => {
      await cdp.evaluate(`(() => {
        els.adapterSelect.value = 'claude';
        els.agentIdInput.value = 'claude-page-check';
        els.runCountInput.value = '1';
        els.promptInput.value = 'Reply with the single word OK.';
        els.cwdInput.value = '';
        els.startRun.click();
        return true;
      })()`);

      createdRunId = await waitFor(async () => {
        const runIds = await cdp.evaluate(`(() =>
          state.agents
            .filter((agent) => agent.agentId === 'claude-page-check')
            .map((agent) => agent.runId)
        )()`);
        return Array.isArray(runIds) && runIds.length > 0 ? runIds[0] : null;
      }, 90000, 250);

      return `Claude test run created: ${createdRunId}.`;
    }));

    results.push(await runCase('Case 3', async () => {
      if (!createdRunId) {
        throw new Error('Claude test run was not created');
      }

      const observed = await waitFor(async () => {
        const payload = await cdp.evaluate(`(() => {
          const events = state.events.filter((event) => event.runId === ${json(createdRunId)});
          const started = events.some((event) => event.type === 'run.started');
          const error = events.find((event) => event.type === 'run.error');
          const finished = events.find((event) => event.type === 'run.finished');
          if (!started || !error || !finished) {
            return null;
          }
          return {
            started,
            error: error.error || '',
            result: finished.result || ''
          };
        })()`);
        return payload && payload.error && payload.result ? payload : null;
      }, 120000, 500);

      return `Observed Claude page event chain: started=true, error=${json(observed.error)}, result=${observed.result}.`;
    }));

    results.push(await runCase('Case 4', async () => {
      const card = await waitFor(async () => {
        const payload = await cdp.evaluate(`(() => {
          const agent = state.agents.find((item) => item.runId === ${json(createdRunId)});
          if (!agent) {
            return null;
          }
          const feedText = document.getElementById('feed-list')?.innerText || '';
          return {
            status: agent.status,
            stage: agent.stage,
            adapterId: agent.adapterId,
            hasErrorInFeed: feedText.includes(agent.error || '') || feedText.includes('authentication_failed')
          };
        })()`);
        return payload && payload.status === 'failed' && payload.adapterId === 'claude' ? payload : null;
      }, 120000, 500);

      if (!card.hasErrorInFeed) {
        throw new Error(`Claude error was not reflected in the chat feed: ${JSON.stringify(card)}`);
      }

      return `Claude card reached status=${card.status}, stage=${card.stage}, adapter=${card.adapterId}.`;
    }));

    process.stdout.write(renderSummary(results));
  } catch (error) {
    process.stderr.write(`Phase 2 Claude page acceptance failed: ${error.stack || error.message}\n`);
    process.exitCode = 1;
  } finally {
    if (createdRunId) {
      try {
        await fetch(`${monitorUrl}api/runs/${createdRunId}/stop`, { method: 'POST' });
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
  const userDataDir = join(monitorDir, '.tmp', `phase2-claude-profile-${Date.now()}`);
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
    '## Phase 2 Claude Page Acceptance Result',
    '',
    `- Date: ${new Date().toISOString()}`,
    '- Tester: GPT-5 Codex (headless browser)',
    '- Command: `npm run verify:phase2-claude`',
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
  lines.push('- Follow-up: frontend migration assessment remains pending.');
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

function json(value) {
  return JSON.stringify(value);
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
