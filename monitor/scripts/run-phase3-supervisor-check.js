const { MonitorService } = require('../dist/index.js');

class FakeSupervisorAdapter {
  constructor() {
    this.id = 'fake-supervisor';
  }

  async detect() {
    return true;
  }

  buildCommand(task) {
    const behavior = task.metadata?.behavior || 'flaky';
    const attempt = task.metadata?.monitorRestartAttempt || '0';
    const script = [
      'const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));',
      'async function main() {',
      "  const behavior = process.env.MONITOR_BEHAVIOR || 'flaky';",
      "  const attempt = Number(process.env.MONITOR_RESTART_ATTEMPT || '0');",
      "  console.log('START');",
      "  if (behavior === 'stable') {",
      "    console.log('MSG stable-path');",
      '    await sleep(60);',
      '    process.exit(0);',
      '  }',
      '  if (attempt === 0) {',
      '    await sleep(40);',
      '    process.exit(1);',
      '  }',
      '  await sleep(160);',
      "  console.log('MSG recovered-after-unresponsive');",
      '  await sleep(60);',
      '  process.exit(0);',
      '}',
      "main().catch((error) => { console.error(error.message); process.exit(1); });",
    ].join(' ');

    return {
      command: process.execPath,
      args: ['-e', script],
      cwd: task.cwd,
      env: {
        ...process.env,
        MONITOR_BEHAVIOR: behavior,
        MONITOR_RESTART_ATTEMPT: attempt,
      },
    };
  }

  parseEvent(raw, task) {
    const ts = Date.now();
    if (raw === 'START') {
      return {
        type: 'run.started',
        agentId: task.agentId,
        runId: task.runId,
        ts,
      };
    }

    if (raw.startsWith('MSG ')) {
      return {
        type: 'message.delta',
        agentId: task.agentId,
        runId: task.runId,
        text: raw.slice(4),
        ts,
      };
    }

    return null;
  }
}

async function main() {
  const monitorService = new MonitorService([new FakeSupervisorAdapter()]);
  const events = [];
  const unsubscribe = monitorService.subscribe((event) => {
    events.push(event);
  });

  try {
    const stable = await monitorService.startRun({
      adapterId: 'fake-supervisor',
      agentId: 'stable-agent',
      cwd: process.cwd(),
      prompt: 'stable',
      metadata: { behavior: 'stable' },
    });

    const flaky = await monitorService.startRun({
      adapterId: 'fake-supervisor',
      agentId: 'flaky-agent',
      cwd: process.cwd(),
      prompt: 'flaky',
      metadata: { behavior: 'flaky' },
      supervisor: {
        autoRestart: true,
        maxRestartAttempts: 2,
        restartBackoffMs: 80,
        healthCheckIntervalMs: 40,
        unresponsiveThresholdMs: 100,
      },
    });

    const stableFinal = await waitForState(monitorService, stable.runId, (state) => state.status === 'completed');
    const flakyFinal = await waitForState(monitorService, flaky.runId, (state) => state.status === 'completed');

    const stableEvents = events.filter((event) => event.runId === stable.runId);
    const flakyEvents = events.filter((event) => event.runId === flaky.runId);
    const flakyHealthEvents = flakyEvents.filter((event) => event.type === 'agent.health');
    const flakyNoticeEvents = flakyEvents.filter((event) => event.type === 'run.notice');

    const checks = [
      {
        name: 'Case 1 - crash isolation',
        ok:
          stableFinal.status === 'completed' &&
          stableEvents.some((event) => event.type === 'run.finished' && event.result === 'success') &&
          !stableEvents.some((event) => event.type === 'run.notice'),
        notes: `Stable run completed with status=${stableFinal.status}.`,
      },
      {
        name: 'Case 2 - restart/backoff',
        ok:
          flakyFinal.status === 'completed' &&
          (flakyFinal.restartCount || 0) >= 1 &&
          flakyNoticeEvents.some((event) => event.level === 'warn') &&
          flakyNoticeEvents.some((event) => event.level === 'info'),
        notes: `Flaky run completed with restartCount=${flakyFinal.restartCount || 0}.`,
      },
      {
        name: 'Case 3 - health status transitions',
        ok:
          flakyHealthEvents.some((event) => event.status === 'crashed') &&
          flakyHealthEvents.some((event) => event.status === 'unresponsive') &&
          flakyHealthEvents.some((event) => event.status === 'alive'),
        notes: `Observed health statuses: ${[...new Set(flakyHealthEvents.map((event) => event.status))].join(', ')}.`,
      },
      {
        name: 'Case 4 - recovery logs',
        ok:
          flakyEvents.some((event) => event.type === 'run.stage' && event.stage === 'waiting') &&
          flakyEvents.some(
            (event) => event.type === 'message.delta' && event.text.includes('recovered-after-unresponsive')
          ),
        notes: `Observed flaky event types: ${[...new Set(flakyEvents.map((event) => event.type))].join(', ')}.`,
      },
    ];

    process.stdout.write(renderSummary(checks));
    if (checks.some((check) => !check.ok)) {
      process.exitCode = 1;
    }
  } finally {
    unsubscribe();
    await monitorService.close();
  }
}

async function waitForState(monitorService, runId, predicate) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15000) {
    const state = monitorService.listAgents().find((item) => item.runId === runId);
    if (state && predicate(state)) {
      return state;
    }
    await wait(40);
  }

  throw new Error(`Timed out waiting for state on run ${runId}`);
}

function renderSummary(results) {
  const overall = results.every((result) => result.ok) ? 'pass' : 'fail';
  const lines = [
    '## Phase 3 Supervisor Acceptance Result',
    '',
    `- Date: ${new Date().toISOString()}`,
    '- Tester: GPT-5 Codex (local supervisor harness)',
    '- Command: `node scripts/run-phase3-supervisor-check.js`',
    '',
  ];

  for (const result of results) {
    lines.push(`### ${result.name}`);
    lines.push(`- Result: ${result.ok ? 'pass' : 'fail'}`);
    lines.push(`- Notes: ${result.notes}`);
    lines.push('');
  }

  lines.push('### Overall');
  lines.push(`- Overall result: ${overall}`);
  lines.push('- Follow-up: integrate supervisor settings into user-facing workflows and expand fixture coverage.');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

void main().catch((error) => {
  process.stderr.write(`Phase 3 supervisor acceptance failed: ${error.stack || error.message}\n`);
  process.exitCode = 1;
});
