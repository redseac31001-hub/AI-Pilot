import { existsSync } from 'fs';

import type { AgentCommand, AgentTask } from '../core/agent-task';

export function buildWindowsPsInvocation(scriptPath: string, args: string[], cwd: string): AgentCommand {
  return {
    command: 'powershell.exe',
    args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...args],
    cwd,
  };
}

export function buildDirectInvocation(command: string, args: string[], cwd: string): AgentCommand {
  return {
    command,
    args,
    cwd,
  };
}

export function detectCliPath(envName: string, fallbackPath: string): boolean {
  const cliPath = process.env[envName] ?? fallbackPath;
  return existsSync(cliPath);
}

export function buildTaskCommand(
  task: AgentTask,
  envName: string,
  fallbackWindowsPath: string,
  directCommand: string,
  args: string[]
): AgentCommand {
  if (process.platform === 'win32') {
    const cliPath = process.env[envName] ?? fallbackWindowsPath;
    return buildWindowsPsInvocation(cliPath, args, task.cwd);
  }

  return buildDirectInvocation(directCommand, args, task.cwd);
}

export function safeParseJson(raw: string): unknown | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}
