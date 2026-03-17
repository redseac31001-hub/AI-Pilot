const { mkdirSync, writeFileSync } = require('fs');
const { spawnSync } = require('child_process');
const { join } = require('path');

const outDir = process.argv[2] || join(__dirname, '..', 'docs', 'event-samples', 'codex');
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const samplePath = join(outDir, `sample-${ts}.jsonl`);
const metaPath = join(outDir, `sample-${ts}.meta.json`);
const cliPath = process.env.CODEX_CLI_PATH || 'D:\\nodejs\\node_global\\codex.ps1';

function buildInvocation(args) {
  if (process.platform === 'win32') {
    return {
      command: 'powershell.exe',
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', cliPath, ...args],
    };
  }

  return { command: 'codex', args };
}

mkdirSync(outDir, { recursive: true });

const args = [
  'exec',
  '--json',
  '--color',
  'never',
  '--skip-git-repo-check',
  '--sandbox',
  'read-only',
  '--ephemeral',
  'Reply with the single word OK.'
];
const versionInvocation = buildInvocation(['--version']);
const runInvocation = buildInvocation(args);

const version = spawnSync(versionInvocation.command, versionInvocation.args, { encoding: 'utf8' });
const run = spawnSync(runInvocation.command, runInvocation.args, {
  encoding: 'utf8',
  cwd: process.cwd(),
  timeout: 120000
});

writeFileSync(samplePath, run.stdout || '', 'utf8');
writeFileSync(
  metaPath,
  JSON.stringify(
    {
      command: 'codex',
      args: runInvocation.args,
      cwd: process.cwd(),
      capturedAt: new Date().toISOString(),
      version: (version.stdout || version.stderr || '').trim(),
      exitCode: run.status,
      signal: run.signal,
      stderr: run.stderr || ''
    },
    null,
    2
  ),
  'utf8'
);

if (run.error) {
  console.error(run.error.message);
  process.exit(1);
}

process.stdout.write(`${samplePath}\n`);
