import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import { existsSync, readFileSync } from 'fs';
import { extname, join, relative, resolve } from 'path';

import { URL } from 'url';

import { ClaudeAdapter } from '../adapters/claude';
import { CodexAdapter } from '../adapters/codex';
import { loadMonitorConfig, resolveWorkspaceRoot } from '../config/monitor-config';

import { MonitorService } from './monitor-service';
import { MonitorWsServer } from './ws-server';

type StartRunBody = {
  adapterId?: string;
  agentId?: string;
  cwd?: string;
  prompt?: string;
  metadata?: Record<string, string>;
  supervisor?: {
    autoRestart?: boolean;
    maxRestartAttempts?: number;
    restartBackoffMs?: number;
    healthCheckIntervalMs?: number;
    unresponsiveThresholdMs?: number;
  };
};

type BatchStartRunsBody = {
  runs?: StartRunBody[];
};

type MonitorServerOptions = {
  workspaceRoot?: string;
  autoStartConfig?: boolean;
};

export class MonitorHttpServer {
  private readonly monitorService = new MonitorService([new CodexAdapter(), new ClaudeAdapter()]);
  private readonly server: Server;
  private readonly wsServer: MonitorWsServer;
  private readonly publicRoot = resolvePublicRoot();
  private readonly frontendRoot = resolveFrontendRoot();
  private readonly workspaceRoot: string;
  private readonly autoStartConfig: boolean;

  constructor(options: MonitorServerOptions = {}) {
    this.workspaceRoot = resolveWorkspaceRoot(options.workspaceRoot ?? process.cwd());
    this.autoStartConfig = options.autoStartConfig ?? true;
    this.server = createServer((req, res) => {
      void this.handleRequest(req, res);
    });
    this.wsServer = new MonitorWsServer(this.server, this.monitorService);
  }

  listen(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(port, () => resolve());
      this.server.on('error', reject);
    });
  }

  async close(): Promise<void> {
    await this.wsServer.close();
    await this.monitorService.close();
    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  async bootstrap(): Promise<void> {
    if (!this.autoStartConfig) {
      return;
    }

    const config = loadMonitorConfig(this.workspaceRoot);
    if (!config) {
      return;
    }

    await this.monitorService.startConfiguredRuns(config);
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!req.url || !req.method) {
      sendJson(res, 400, { error: 'Invalid request' });
      return;
    }

    const url = new URL(req.url, 'http://127.0.0.1');

    if (req.method === 'GET' && url.pathname === '/api/health') {
      sendJson(res, 200, this.monitorService.getHealth());
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/agents') {
      sendJson(res, 200, { agents: this.monitorService.listAgents() });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/events') {
      const sinceParam = url.searchParams.get('since');
      const since = sinceParam ? Number(sinceParam) : undefined;
      sendJson(res, 200, { events: this.monitorService.listEvents(since) });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/runs') {
      try {
        const body = (await readJsonBody(req)) as StartRunBody;
        if (!body.adapterId || !body.prompt) {
          sendJson(res, 400, { error: 'adapterId and prompt are required' });
          return;
        }

        const state = await this.monitorService.startRun({
          adapterId: body.adapterId,
          agentId: body.agentId,
          cwd: body.cwd,
          prompt: body.prompt,
          metadata: body.metadata,
          supervisor: normalizeSupervisorBody(body.supervisor),
        });
        sendJson(res, 201, { run: state });
      } catch (error) {
        sendJson(res, 500, { error: error instanceof Error ? error.message : 'Failed to start run' });
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/runs/batch') {
      try {
        const body = (await readJsonBody(req)) as BatchStartRunsBody;
        if (!Array.isArray(body.runs) || body.runs.length === 0) {
          sendJson(res, 400, { error: 'runs is required' });
          return;
        }

        const invalidRun = body.runs.find((run) => !run.adapterId || !run.prompt);
        if (invalidRun) {
          sendJson(res, 400, { error: 'each run requires adapterId and prompt' });
          return;
        }

        const states = await this.monitorService.startRuns(
          body.runs.map((run) => ({
            adapterId: run.adapterId as string,
            agentId: run.agentId,
            cwd: run.cwd,
            prompt: run.prompt as string,
            metadata: run.metadata,
            supervisor: normalizeSupervisorBody(run.supervisor),
          }))
        );
        sendJson(res, 201, { runs: states });
      } catch (error) {
        sendJson(res, 500, { error: error instanceof Error ? error.message : 'Failed to start runs' });
      }
      return;
    }

    if (req.method === 'POST' && /^\/api\/runs\/[^/]+\/stop$/.test(url.pathname)) {
      const runId = url.pathname.split('/')[3];
      try {
        const state = await this.monitorService.stopRun(runId);
        sendJson(res, 200, { run: state });
      } catch (error) {
        sendJson(res, 404, { error: error instanceof Error ? error.message : 'Run not found' });
      }
      return;
    }

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      sendFile(res, join(this.publicRoot, 'index.html'));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/index.css') {
      sendFile(res, join(this.publicRoot, 'index.css'));
      return;
    }

    if (req.method === 'GET' && url.pathname.startsWith('/frontend/')) {
      const filePath = resolveStaticPath(this.frontendRoot, url.pathname.slice('/frontend/'.length));
      if (!filePath) {
        sendJson(res, 404, { error: 'Not found' });
        return;
      }

      sendFile(res, filePath);
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  }
}

export async function startMonitorHttpServer(
  port = 4317,
  options: MonitorServerOptions = {}
): Promise<MonitorHttpServer> {
  const server = new MonitorHttpServer(options);
  await server.listen(port);
  await server.bootstrap();
  return server;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return {};
  }

  return JSON.parse(raw);
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function sendFile(res: ServerResponse, filePath: string): void {
  try {
    const contents = readFileSync(filePath);
    res.statusCode = 200;
    res.setHeader('Content-Type', getContentType(filePath));
    res.end(contents);
  } catch {
    sendJson(res, 404, { error: 'Not found' });
  }
}

function getContentType(filePath: string): string {
  const extension = extname(filePath).toLowerCase();
  switch (extension) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

function resolvePublicRoot(): string {
  const candidates = [
    join(process.cwd(), 'monitor', 'public'),
    join(process.cwd(), 'public'),
    join(__dirname, '..', 'public'),
  ];

  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'index.html'))) {
      return candidate;
    }
  }

  return candidates[0];
}

function resolveFrontendRoot(): string {
  const candidates = [
    join(process.cwd(), 'monitor', 'frontend'),
    join(process.cwd(), 'frontend'),
    join(__dirname, '..', 'frontend'),
  ];

  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'app.js'))) {
      return candidate;
    }
  }

  return candidates[0];
}

function resolveStaticPath(root: string, requestPath: string): string | null {
  const filePath = resolve(root, requestPath);
  const rel = relative(root, filePath);
  if (rel.startsWith('..') || rel.includes(`..\\`) || rel.includes('../')) {
    return null;
  }

  return filePath;
}

function normalizeSupervisorBody(body: StartRunBody['supervisor']) {
  if (!body) {
    return undefined;
  }

  const normalized: NonNullable<StartRunBody['supervisor']> = {};
  if (typeof body.autoRestart === 'boolean') {
    normalized.autoRestart = body.autoRestart;
  }
  if (Number.isFinite(body.maxRestartAttempts)) {
    normalized.maxRestartAttempts = Math.floor(Number(body.maxRestartAttempts));
  }
  if (Number.isFinite(body.restartBackoffMs)) {
    normalized.restartBackoffMs = Math.floor(Number(body.restartBackoffMs));
  }
  if (Number.isFinite(body.healthCheckIntervalMs)) {
    normalized.healthCheckIntervalMs = Math.floor(Number(body.healthCheckIntervalMs));
  }
  if (Number.isFinite(body.unresponsiveThresholdMs)) {
    normalized.unresponsiveThresholdMs = Math.floor(Number(body.unresponsiveThresholdMs));
  }

  return normalized;
}
