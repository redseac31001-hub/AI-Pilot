const { spawn } = require('child_process');
const { once } = require('events');
const { mkdirSync, rmSync } = require('fs');
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
  const monitorPort = 4319 + portOffset;
  const debugPort = 9333 + portOffset;
  const monitorUrl = `http://127.0.0.1:${monitorPort}/`;
  const chromePath = await findChrome();
  const cleanupTasks = [];
  const results = [];

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
        hasHeader: Boolean(document.querySelector('.hero')),
        hasBoard: document.body.innerText.includes('Agent Board'),
        hasFeed: document.body.innerText.includes('Chat Feed'),
        hasStartButton: Boolean(document.getElementById('start-run')),
        noCardsYet: document.querySelectorAll('.card').length === 0
      }))()`);
      if (
        checks.title !== 'AI-Pilot Monitor' ||
        !checks.hasHeader ||
        !checks.hasBoard ||
        !checks.hasFeed ||
        !checks.hasStartButton ||
        !checks.noCardsYet
      ) {
        throw new Error(`Unexpected landing state: ${JSON.stringify(checks)}`);
      }
      return 'Page rendered with expected sections and empty board state.';
    }));

    let codexRunId = null;
    let stopRunId = null;

    results.push(await runCase('Case 2', async () => {
      const codexRun = await startRunThroughUi(cdp, {
        adapterId: 'codex',
        prompt: 'Reply with the single word OK.',
      });
      codexRunId = codexRun.runId;

      const agentId = await waitFor(async () => {
        const agent = await cdp.evaluate(`(() => {
          const agent = state.agents.find((item) => item.runId === ${json(codexRunId)});
          return agent ? { agentId: agent.agentId, status: agent.status, stage: agent.stage } : null;
        })()`);
        return agent && agent.agentId ? agent : null;
      }, 90000, 500);

      return `Codex card appeared: agentId=${agentId.agentId}, status=${agentId.status}, stage=${agentId.stage}.`;
    }));

    results.push(await runCase('Case 3', async () => {
      if (!codexRunId) {
        throw new Error('Codex run was not created in Case 2');
      }

      const eventTypes = await waitFor(async () => {
        const types = await cdp.evaluate(`(() => state.events
          .filter((event) => event.runId === ${json(codexRunId)})
          .map((event) => event.type))()`);
        return Array.isArray(types) && types.length > 0 ? types : null;
      }, 120000, 500);

      return `Structured events observed for codex: ${eventTypes.join(', ')}.`;
    }));

    const stopPrompt =
      'Use the shell to run powershell -NoLogo -NoProfile -Command "Start-Sleep -Seconds 5" and then reply with OK.';

    results.push(await runCase('Case 4', async () => {
      const stopRun = await startRunThroughUi(cdp, {
        adapterId: 'codex',
        prompt: stopPrompt,
      });
      stopRunId = stopRun.runId;

      await waitFor(async () => {
        const agent = await cdp.evaluate(`(() => {
          const agent = state.agents.find((item) => item.runId === ${json(stopRunId)});
          return agent ? { status: agent.status, runId: agent.runId } : null;
        })()`);
        return agent && ['running', 'starting'].includes(agent.status) ? agent : null;
      }, 90000, 500);

      await cdp.evaluate(`(() => {
        const button = document.querySelector('[data-stop-run=${json(stopRunId)}]');
        if (!button) {
          throw new Error('Stop button not found');
        }
        button.click();
        return true;
      })()`);

      const finalState = await waitFor(async () => {
        const agent = await cdp.evaluate(`(() => {
          const agent = state.agents.find((item) => item.runId === ${json(stopRunId)});
          return agent ? { status: agent.status, stage: agent.stage } : null;
        })()`);
        return agent && ['stopped', 'failed', 'completed'].includes(agent.status) ? agent : null;
      }, 90000, 500);

      const eventTypes = await cdp.evaluate(`(() => state.events
        .filter((event) => event.runId === ${json(stopRunId)})
        .map((event) => event.type))()`);

      if (!Array.isArray(eventTypes) || !eventTypes.includes('run.finished')) {
        throw new Error(`Stop run did not emit run.finished: ${JSON.stringify(eventTypes)}`);
      }

      return `Stop flow ended with status=${finalState.status}, stage=${finalState.stage}, events=${eventTypes.join(', ')}.`;
    }));

    process.stdout.write(renderSummary(results));
  } catch (error) {
    process.stderr.write(`Phase 1C browser acceptance failed: ${error.stack || error.message}\n`);
    process.exitCode = 1;
  } finally {
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
  const userDataDir = join(monitorDir, '.tmp', `phase1c-browser-profile-${Date.now()}`);
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

async function startRunThroughUi(cdp, { adapterId, prompt, cwd = '' }) {
  const before = await cdp.evaluate('state.agents.map((agent) => agent.runId)');
  await cdp.evaluate(`(() => {
    els.adapterSelect.value = ${json(adapterId)};
    els.promptInput.value = ${json(prompt)};
    els.cwdInput.value = ${json(cwd)};
    els.startRun.click();
    return true;
  })()`);

  const runId = await waitFor(async () => {
    const runIds = await cdp.evaluate('state.agents.map((agent) => agent.runId)');
    return runIds.find((candidate) => !new Set(before).has(candidate)) || null;
  }, 90000, 250);

  return { runId };
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
  const lines = ['## Phase 1C Manual Acceptance Result', '', `- Date: ${new Date().toISOString()}`, '- Tester: GPT-5 Codex (headless browser)', '- Build command: `npm run build`', '- Start command: `npm run start`', ''];

  for (const result of results) {
    lines.push(`### ${result.name}`);
    lines.push(`- Result: ${result.result}`);
    lines.push(`- Notes: ${result.notes}`);
    lines.push('');
  }

  lines.push('### Overall');
  lines.push(`- Overall result: ${overall}`);
  lines.push('- Follow-up: Claude page validation is deferred until codex multi-agent runs are stable.');
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
    const payload = { id, method, params };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload), (error) => {
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
