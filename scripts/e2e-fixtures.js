const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function parseArgs(argv) {
  const options = {
    keep: false,
    only: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--keep') {
      options.keep = true;
      continue;
    }
    if (arg === '--only') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('Missing value for --only (vue2-project|vue3-project).');
      }
      options.only = value;
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function copyFixture(srcDir, destDir) {
  fs.cpSync(srcDir, destDir, {
    recursive: true,
    filter: (src) => {
      const base = path.basename(src);
      if (base === '.ai-pilot' || base === '.vscode' || base === 'node_modules') {
        return false;
      }
      return true;
    },
  });
}

function runInit(distEntry, cwd, extraArgs) {
  const result = spawnSync(
    process.execPath,
    [distEntry, 'init', '--write', '--yes', '--format', 'json', ...extraArgs],
    { cwd, encoding: 'utf8' }
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    const stdout = (result.stdout || '').trim();
    throw new Error(
      `ai-pilot init failed (exit ${result.status})\nstdout:\n${stdout}\nstderr:\n${stderr}`
    );
  }

  const raw = (result.stdout || '').trim();
  const parsed = JSON.parse(raw);
  return { parsed, stderr: (result.stderr || '').trim() };
}

function countPlanActions(plans) {
  const countsByAdapter = {};
  for (const plan of plans || []) {
    const counts = { create: 0, update: 0, skip: 0 };
    for (const action of plan.actions || []) {
      if (counts[action.type] !== undefined) {
        counts[action.type] += 1;
      }
    }
    countsByAdapter[plan.adapterId] = counts;
  }
  return countsByAdapter;
}

function countResultStatuses(results) {
  const countsByAdapter = {};
  for (const result of results || []) {
    const counts = { applied: 0, skipped: 0, failed: 0 };
    for (const action of result.actions || []) {
      if (counts[action.status] !== undefined) {
        counts[action.status] += 1;
      }
    }
    countsByAdapter[result.adapterId] = counts;
  }
  return countsByAdapter;
}

function formatCounts(obj) {
  return Object.entries(obj)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([adapterId, counts]) => `${adapterId}: ${JSON.stringify(counts)}`)
    .join('\n');
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, '..');
  const distEntry = path.join(repoRoot, 'dist', 'index.js');

  if (!fs.existsSync(distEntry)) {
    throw new Error(`dist entry not found: ${distEntry} (run: npm run build)`);
  }

  const rulesDir = path.join(repoRoot, 'demo', 'rules');
  const skillsDir = path.join(repoRoot, 'demo', 'custom-skills');
  const importArgs = [];

  if (fs.existsSync(rulesDir)) {
    importArgs.push('--import-rules', rulesDir);
  }
  if (fs.existsSync(skillsDir)) {
    importArgs.push('--import-skills', skillsDir);
  }

  const fixturesRoot = path.join(repoRoot, 'tests', 'fixtures');
  const fixtureNames = ['vue2-project', 'vue3-project'].filter(
    (name) => !options.only || name === options.only
  );

  if (fixtureNames.length === 0) {
    throw new Error('No fixtures selected. Use --only vue2-project|vue3-project.');
  }

  let hadFailure = false;

  for (const fixtureName of fixtureNames) {
    const sourceDir = path.join(fixturesRoot, fixtureName);
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-pilot-e2e-'));
    const workDir = path.join(tempRoot, fixtureName);
    copyFixture(sourceDir, workDir);

    console.log(`\n=== ${fixtureName} ===`);
    console.log(`workdir: ${workDir}`);

    const run1 = runInit(distEntry, workDir, importArgs);
    const run2 = runInit(distEntry, workDir, importArgs);

    const run1PlanCounts = countPlanActions(run1.parsed.plans);
    const run2PlanCounts = countPlanActions(run2.parsed.plans);
    const run1ResultCounts = countResultStatuses(run1.parsed.results);
    const run2ResultCounts = countResultStatuses(run2.parsed.results);

    console.log('\nRun #1 plan (action types):');
    console.log(formatCounts(run1PlanCounts));
    console.log('\nRun #2 plan (action types):');
    console.log(formatCounts(run2PlanCounts));

    console.log('\nRun #1 result (action statuses):');
    console.log(formatCounts(run1ResultCounts));
    console.log('\nRun #2 result (action statuses):');
    console.log(formatCounts(run2ResultCounts));

    const hasNonIdempotent = Object.values(run2ResultCounts).some(
      (counts) => counts.applied > 0 || counts.failed > 0
    );

    if (hasNonIdempotent) {
      hadFailure = true;
      console.error('\n[FAIL] Second run is not idempotent (applied/failed > 0).');
    } else {
      console.log('\n[OK] Second run is idempotent (all skipped).');
    }

    if (!options.keep && !hadFailure) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } else {
      console.log(`Temp kept: ${tempRoot}`);
    }
  }

  if (hadFailure) {
    process.exitCode = 1;
  }
}

main();

