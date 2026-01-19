#!/usr/bin/env node
const cli = require('../dist/index.js');

if (cli && typeof cli.main === 'function') {
  cli.main(process.argv.slice(2)).catch((err) => {
    // Mirror CLI error handling without swallowing exit codes.
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
} else {
  console.error('ai-pilot CLI entrypoint is missing.');
  process.exitCode = 1;
}
