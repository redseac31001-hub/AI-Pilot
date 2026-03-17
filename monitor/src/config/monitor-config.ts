import { existsSync, readFileSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';

export const MONITOR_CONFIG_PATH = '.ai-pilot/monitor.json';

export type MonitorSupervisorConfig = {
  autoRestart?: boolean;
  maxRestartAttempts?: number;
  restartBackoffMs?: number;
  healthCheckIntervalMs?: number;
  unresponsiveThresholdMs?: number;
};

export type MonitorConfigAgent = {
  id: string;
  adapter: string;
  prompt: string;
  cwd?: string;
  enabled?: boolean;
  autoStart?: boolean;
  metadata?: Record<string, string>;
  supervisor?: MonitorSupervisorConfig;
};

export type MonitorConfig = {
  configPath: string;
  workspaceRoot: string;
  agents: MonitorConfigAgent[];
};

export function resolveWorkspaceRoot(startDir: string): string {
  let current = resolve(startDir);

  while (true) {
    if (existsSync(join(current, MONITOR_CONFIG_PATH))) {
      return current;
    }

    if (existsSync(join(current, '.git'))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      break;
    }

    current = parent;
  }

  if (basename(startDir).toLowerCase() === 'monitor') {
    return resolve(startDir, '..');
  }

  return resolve(startDir);
}

export function loadMonitorConfig(workspaceRoot: string): MonitorConfig | null {
  const configPath = join(workspaceRoot, MONITOR_CONFIG_PATH);
  if (!existsSync(configPath)) {
    return null;
  }

  const raw = JSON.parse(readFileSync(configPath, 'utf8')) as unknown;
  return normalizeMonitorConfig(raw, configPath, workspaceRoot);
}

export function resolveAgentCwd(workspaceRoot: string, cwd?: string): string {
  if (!cwd || cwd.trim().length === 0) {
    return workspaceRoot;
  }

  return resolve(workspaceRoot, cwd);
}

function normalizeMonitorConfig(raw: unknown, configPath: string, workspaceRoot: string): MonitorConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Invalid monitor config at ${configPath}: expected object`);
  }

  const config = raw as { agents?: unknown };
  if (!Array.isArray(config.agents)) {
    throw new Error(`Invalid monitor config at ${configPath}: agents must be an array`);
  }

  const agents = config.agents.map((agent, index) => normalizeAgent(agent, index, configPath));
  return {
    configPath,
    workspaceRoot,
    agents,
  };
}

function normalizeAgent(raw: unknown, index: number, configPath: string): MonitorConfigAgent {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Invalid agent at index ${index} in ${configPath}: expected object`);
  }

  const agent = raw as {
    id?: unknown;
    adapter?: unknown;
    prompt?: unknown;
    cwd?: unknown;
    enabled?: unknown;
    autoStart?: unknown;
    metadata?: unknown;
    supervisor?: unknown;
  };

  if (typeof agent.id !== 'string' || agent.id.trim().length === 0) {
    throw new Error(`Invalid agent at index ${index} in ${configPath}: id is required`);
  }

  if (typeof agent.adapter !== 'string' || agent.adapter.trim().length === 0) {
    throw new Error(`Invalid agent "${agent.id}" in ${configPath}: adapter is required`);
  }

  if (typeof agent.prompt !== 'string' || agent.prompt.trim().length === 0) {
    throw new Error(`Invalid agent "${agent.id}" in ${configPath}: prompt is required`);
  }

  if (agent.cwd !== undefined && typeof agent.cwd !== 'string') {
    throw new Error(`Invalid agent "${agent.id}" in ${configPath}: cwd must be a string`);
  }

  if (agent.enabled !== undefined && typeof agent.enabled !== 'boolean') {
    throw new Error(`Invalid agent "${agent.id}" in ${configPath}: enabled must be a boolean`);
  }

  if (agent.autoStart !== undefined && typeof agent.autoStart !== 'boolean') {
    throw new Error(`Invalid agent "${agent.id}" in ${configPath}: autoStart must be a boolean`);
  }

  return {
    id: agent.id,
    adapter: agent.adapter,
    prompt: agent.prompt,
    cwd: agent.cwd,
    enabled: agent.enabled,
    autoStart: agent.autoStart,
    metadata: normalizeMetadata(agent.metadata, agent.id, configPath),
    supervisor: normalizeSupervisor(agent.supervisor, agent.id, configPath),
  };
}

function normalizeMetadata(
  raw: unknown,
  agentId: string,
  configPath: string
): Record<string, string> | undefined {
  if (raw === undefined) {
    return undefined;
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`Invalid agent "${agentId}" in ${configPath}: metadata must be an object`);
  }

  const metadata = raw as Record<string, unknown>;
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value !== 'string') {
      throw new Error(`Invalid agent "${agentId}" in ${configPath}: metadata values must be strings`);
    }
    normalized[key] = value;
  }

  return normalized;
}

function normalizeSupervisor(
  raw: unknown,
  agentId: string,
  configPath: string
): MonitorSupervisorConfig | undefined {
  if (raw === undefined) {
    return undefined;
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`Invalid agent "${agentId}" in ${configPath}: supervisor must be an object`);
  }

  const supervisor = raw as Record<string, unknown>;
  const normalized: MonitorSupervisorConfig = {};

  if (supervisor.autoRestart !== undefined) {
    if (typeof supervisor.autoRestart !== 'boolean') {
      throw new Error(`Invalid agent "${agentId}" in ${configPath}: supervisor.autoRestart must be a boolean`);
    }
    normalized.autoRestart = supervisor.autoRestart;
  }

  if (supervisor.maxRestartAttempts !== undefined) {
    if (!Number.isFinite(supervisor.maxRestartAttempts) || Number(supervisor.maxRestartAttempts) < 0) {
      throw new Error(
        `Invalid agent "${agentId}" in ${configPath}: supervisor.maxRestartAttempts must be a non-negative number`
      );
    }
    normalized.maxRestartAttempts = Math.floor(Number(supervisor.maxRestartAttempts));
  }

  if (supervisor.restartBackoffMs !== undefined) {
    if (!Number.isFinite(supervisor.restartBackoffMs) || Number(supervisor.restartBackoffMs) < 1) {
      throw new Error(
        `Invalid agent "${agentId}" in ${configPath}: supervisor.restartBackoffMs must be a positive number`
      );
    }
    normalized.restartBackoffMs = Math.floor(Number(supervisor.restartBackoffMs));
  }

  if (supervisor.healthCheckIntervalMs !== undefined) {
    if (!Number.isFinite(supervisor.healthCheckIntervalMs) || Number(supervisor.healthCheckIntervalMs) < 1) {
      throw new Error(
        `Invalid agent "${agentId}" in ${configPath}: supervisor.healthCheckIntervalMs must be a positive number`
      );
    }
    normalized.healthCheckIntervalMs = Math.floor(Number(supervisor.healthCheckIntervalMs));
  }

  if (supervisor.unresponsiveThresholdMs !== undefined) {
    if (!Number.isFinite(supervisor.unresponsiveThresholdMs) || Number(supervisor.unresponsiveThresholdMs) < 1) {
      throw new Error(
        `Invalid agent "${agentId}" in ${configPath}: supervisor.unresponsiveThresholdMs must be a positive number`
      );
    }
    normalized.unresponsiveThresholdMs = Math.floor(Number(supervisor.unresponsiveThresholdMs));
  }

  return normalized;
}
