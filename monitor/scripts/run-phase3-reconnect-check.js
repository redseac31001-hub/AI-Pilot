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
  const monitorPort = 6120 + portOffset;
  const debugPort = 11020 + portOffset;
  const monitorUrl = `http://127.0.0.1:${monitorPort}/`;
  const chromePath = await findChrome();
  const cleanupTasks = [];
  const results = [];
  let replayRunId = null;
  let baselineTs = 0;

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
      await waitFor(async () => {
        const label = await cdp.evaluate("document.getElementById('socket-pill').textContent");
        return label === 'WS live' ? label : null;
      }, 30000, 250);

      const baselineRun = await startRunThroughUi(cdp, {
        adapterId: 'codex',
        prompt: 'Reply with the single word OK.',
      });

      baselineTs = await waitFor(async () => {
        const snapshot = await cdp.evaluate(`(() => ({
          lastEventTs: state.lastEventTs || 0,
          hasEvent: state.events.some((event) => event.runId === ${json(baselineRun.runId)})
        }))()`);
        return snapshot.hasEvent && snapshot.lastEventTs > 0 ? snapshot.lastEventTs : null;
      }, 90000, 500);

      return `Baseline event stream established at ts=${baselineTs}.`;
    }));

    results.push(await runCase('Case 2', async () => {
      await cdp.evaluate(`(() => {
        if (!state.ws) {
          throw new Error('state.ws is not available');
        }
        state.ws.close();
        return true;
      })()`);

      const label = await waitFor(async () => {
        const text = await cdp.evaluate("document.getElementById('socket-pill').textContent");
        return text === 'WS reconnecting' ? text : null;
      }, 10000, 250);

      return `Socket entered reconnect flow with label=${label}.`;
    }));

    results.push(await runCase('Case 3', async () => {
      if (!baselineTs) {
        throw new Error('Missing baseline timestamp from Case 1');
      }

      const payload = await postJson(`${monitorUrl}api/runs`, {
        adapterId: 'codex',
        agentId: 'codex-replay-check',
        prompt: 'Reply with the single word OK.',
      });
      replayRunId = payload.run.runId;

      const replayEvents = await waitFor(async () => {
        const eventsPayload = await fetchJson(`${monitorUrl}api/events?since=${baselineTs}`);
        const matching = (eventsPayload.events || []).filter((event) => event.runId === replayRunId);
        return matching.length > 0 ? matching : null;
      }, 90000, 500);

      return `Server produced ${replayEvents.length} replayable event(s) for disconnected run ${replayRunId}.`;
    }));

    results.push(await runCase('Case 4', async () => {
      if (!replayRunId) {
        throw new Error('Replay run was not created in Case 3');
      }

      await waitFor(async () => {
        const label = await cdp.evaluate("document.getElementById('socket-pill').textContent");
        return label === 'WS live' ? label : null;
      }, 90000, 250);

      const replayState = await waitFor(async () => {
        const payload = await cdp.evaluate(`(() => {
          const eventTypes = state.events
            .filter((event) => event.runId === ${json(replayRunId)})
            .map((event) => event.type);
          const agent = state.agents.find((item) => item.runId === ${json(replayRunId)});
          return {
            eventTypes,
            hasAgent: Boolean(agent),
            lastEventTs: state.lastEventTs || 0
          };
        })()`);
        return payload.eventTypes.length > 0 && payload.hasAgent ? payload : null;
      }, 90000, 500);

      if (replayState.lastEventTs <= baselineTs) {
        throw new Error(`Replay did not advance lastEventTs: ${JSON.stringify(replayState)}`);
      }

      return `Reconnected page replayed events=${replayState.eventTypes.join(', ')} for run ${replayRunId}.`;
    }));

    process.stdout.write(renderSummary(results));
  } catch (error) {
    process.stderr.write(`Phase 3 reconnect acceptance failed: ${error.stack || error.message}\n`);
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
  const userDataDir = join(monitorDir, '.tmp', `phase3-reconnect-profile-${Date.now()}`);
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

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await res.json();
  if (!res.ok) {
    throw new Error(payload.error || 'Request failed');
  }

  return payload;
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
  const lines = [
    '## Phase 3 Reconnect Acceptance Result',
    '',
    `- Date: ${new Date().toISOString()}`,
    '- Tester: GPT-5 Codex (headless browser)',
    '- Command: `npm run verify:phase3-reconnect`',
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
  lines.push('- Follow-up: health checks, restart/backoff, and process supervision remain pending in Phase 3.');
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
