import fs from 'fs';
import path from 'path';
import { runInit } from './cli/init';

const HELP_TEXT = `AI-Pilot PoC CLI

Usage:
  ai-pilot init [--dry-run] [--write --yes] [--ide <id>] [--format json|text]
  ai-pilot --version
  ai-pilot --help
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
