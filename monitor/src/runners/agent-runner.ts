import { EventEmitter } from 'events';
import { spawn, type ChildProcessByStdio } from 'child_process';
import type { Readable } from 'stream';

import type { AgentAdapter } from '../adapters/base';
import type { AgentEvent, AgentStage } from '../core/agent-event';
import type { AgentRunState } from '../core/agent-state';
import type { AgentTask } from '../core/agent-task';

import { killProcessTree } from './kill-process-tree';

type RunnerEvents = {
  event: [AgentEvent];
  state: [AgentRunState];
};

export class AgentRunner extends EventEmitter {
  private child: ChildProcessByStdio<null, Readable, Readable> | null = null;
  private state: AgentRunState;
  private stdoutBuffer = '';
  private stderrBuffer = '';
  private finished = false;
  private stopRequested = false;

  constructor(
    private readonly adapter: AgentAdapter,
    private readonly task: AgentTask
  ) {
    super();
    this.state = {
      agentId: task.agentId,
      adapterId: adapter.id,
      runId: task.runId,
      status: 'idle',
      stage: 'queued',
      startedAt: 0,
    };
  }

  override on<T extends keyof RunnerEvents>(eventName: T, listener: (...args: RunnerEvents[T]) => void): this {
    return super.on(eventName, listener);
  }

  getState(): AgentRunState {
    return { ...this.state };
  }

  async start(): Promise<AgentRunState> {
    if (this.child) {
      throw new Error(`Run ${this.task.runId} is already active`);
    }

    const command = this.adapter.buildCommand(this.task);
    this.state = {
      ...this.state,
      status: 'starting',
      stage: 'queued',
      startedAt: Date.now(),
      lastEventAt: Date.now(),
    };
    this.emit('state', this.getState());

    this.child = spawn(command.command, command.args, {
      cwd: command.cwd,
      env: { ...process.env, ...command.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this.child.stdout.setEncoding('utf8');
    this.child.stderr.setEncoding('utf8');

    this.state = {
      ...this.state,
      status: 'running',
      pid: this.child.pid ?? undefined,
    };
    this.emit('state', this.getState());

    this.child.stdout.on('data', (chunk: string) => {
      this.stdoutBuffer += chunk;
      this.flushStdoutLines();
    });

    this.child.stderr.on('data', (chunk: string) => {
      this.stderrBuffer += chunk;
    });

    this.child.on('error', (error) => {
      const ts = Date.now();
      this.emitEvent({
        type: 'run.error',
        agentId: this.task.agentId,
        runId: this.task.runId,
        error: error.message,
        recoverable: false,
        ts,
      });
    });

    this.child.on('exit', (code) => {
      this.flushStdoutLines(true);
      const ts = Date.now();
      if (!this.finished) {
        if ((code ?? 0) !== 0 || this.stderrBuffer.trim().length > 0) {
          this.emitEvent({
            type: 'run.error',
            agentId: this.task.agentId,
            runId: this.task.runId,
            error: this.stderrBuffer.trim() || `Process exited with code ${code ?? -1}`,
            recoverable: false,
            ts,
          });
        }

        this.emitEvent({
          type: 'run.finished',
          agentId: this.task.agentId,
          runId: this.task.runId,
          result: this.stopRequested ? 'failed' : code === 0 ? 'success' : 'failed',
          ts,
        });
      }

      this.state = {
        ...this.state,
        status: this.stopRequested ? 'stopped' : code === 0 ? 'completed' : 'failed',
        endedAt: ts,
        exitCode: code,
      };
      this.emit('state', this.getState());
      this.child = null;
    });

    return this.getState();
  }

  async stop(): Promise<void> {
    if (!this.child?.pid) {
      return;
    }

    this.stopRequested = true;
    this.state = {
      ...this.state,
      status: 'stopping',
      lastEventAt: Date.now(),
    };
    this.emit('state', this.getState());
    await killProcessTree(this.child.pid);
  }

  private flushStdoutLines(flushRemainder = false): void {
    const normalized = this.stdoutBuffer.replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');
    this.stdoutBuffer = flushRemainder ? '' : lines.pop() ?? '';

    for (const line of lines) {
      this.handleStdoutLine(line);
    }

    if (flushRemainder && this.stdoutBuffer.trim().length > 0) {
      this.handleStdoutLine(this.stdoutBuffer);
      this.stdoutBuffer = '';
    }
  }

  private handleStdoutLine(line: string): void {
    const event = this.adapter.parseEvent(line, this.task);
    if (!event) {
      return;
    }

    this.emitEvent(event);
  }

  private emitEvent(event: AgentEvent): void {
    this.finished = this.finished || event.type === 'run.finished';
    this.state = applyEventToState(this.state, event);
    this.emit('event', event);
    this.emit('state', this.getState());
  }
}

function applyEventToState(state: AgentRunState, event: AgentEvent): AgentRunState {
  const next: AgentRunState = {
    ...state,
    lastEventAt: event.ts,
  };

  switch (event.type) {
    case 'run.started':
      return {
        ...next,
        status: 'running',
        stage: 'planning',
      };
    case 'run.stage':
      return {
        ...next,
        status: event.stage === 'error' ? 'failed' : event.stage === 'waiting' ? 'running' : next.status,
        stage: event.stage,
      };
    case 'run.notice':
      return {
        ...next,
        lastMessage: event.text,
      };
    case 'message.delta':
      return {
        ...next,
        lastMessage: event.text,
      };
    case 'run.error':
      return {
        ...next,
        status: 'failed',
        stage: 'error',
        error: event.error,
      };
    case 'run.finished':
      return {
        ...next,
        status: event.result === 'success' ? 'completed' : next.status === 'stopping' ? 'stopped' : 'failed',
        stage: event.result === 'success' ? 'done' : 'error',
        endedAt: event.ts,
      };
    case 'agent.health':
      return {
        ...next,
        pid: event.pid,
        healthStatus: event.status,
      };
    default:
      return next;
  }
}
