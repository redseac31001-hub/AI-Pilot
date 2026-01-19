import fs from 'fs';
import path from 'path';
import { runInit } from './cli/init';

const HELP_TEXT = `AI-Pilot PoC CLI

Usage:
  ai-pilot init [--dry-run] [--write --yes] [--ide <id>] [--format json|text] [--import-rules <dir>] [--import-skills <dir>]
  ai-pilot --version
  ai-pilot --help

Init options:
  --dry-run          Only print plan/output; do not write files.
  --write            Apply changes (requires --yes in non-TTY).
  --yes              Auto-approve writes in non-TTY.
  --format           Output format: json | text (default: text).
  --ide              Target adapter id (e.g. vscode, bundle).
  --import-rules     Import markdown rules from a directory.
  --import-skills    Import skills from a directory.

Examples:
  # Dry-run (default)
  ai-pilot init --format json

  # Write outputs (non-interactive)
  ai-pilot init --write --yes

  # Import extra rules/skills
  ai-pilot init --write --yes --import-rules ./demo/rules --import-skills ./demo/custom-skills
`;

function readVersion(): string {
  try {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    const raw = fs.readFileSync(pkgPath, 'utf8');
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  if (argv.includes('--version') || argv.includes('-v')) {
    console.log(readVersion());
    return;
  }

  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    console.log(HELP_TEXT);
    return;
  }

  const [command, ...rest] = argv;

  if (command === 'init') {
    await runInit(rest);
    return;
  }

  console.error(`Unknown command: ${command}`);
  process.exitCode = 1;
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
