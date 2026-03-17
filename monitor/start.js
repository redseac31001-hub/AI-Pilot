const { startMonitorHttpServer } = require('./dist/index.js');

const port = Number(process.env.MONITOR_PORT || 4317);
const workspaceRoot = process.env.MONITOR_WORKSPACE_ROOT;

startMonitorHttpServer(port, {
  workspaceRoot,
  autoStartConfig: true,
})
  .then(() => {
    process.stdout.write(`AI-Pilot monitor listening on http://127.0.0.1:${port}\n`);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
