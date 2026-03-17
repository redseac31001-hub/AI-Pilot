import { EventEmitter } from 'events';

import type { AgentAdapter } from '../adapters/base';
import type { AgentEvent, AgentHealthStatus } from '../core/agent-event';
import type { AgentRunState } from '../core/agent-state';
import type { AgentTask } from '../core/agent-task';

import { AgentRunner } from './agent-runner';

type SupervisorEvents = {
  event: [AgentEvent];
  state: [AgentRunState];
};

export type ProcessSupervisorOptions = {
  autoRestart?: boolean;
  maxRestartAttempts?: number;
  restartBackoffMs?: number;
  healthCheckIntervalMs?: number;
  unresponsiveThresholdMs?: number;
};

const DEFAULT_OPTIONS: Required<ProcessSupervisorOptions> = {
  autoRestart: false,
  maxRestartAttempts: 0,
  restartBackoffMs: 1000,
  healthCheckIntervalMs: 2000,
  unresponsiveThresholdMs: 15000,
};

export class ProcessSupervisor extends EventEmitter {
  private readonly options: Required<ProcessSupervisorOptions>;
  private runner: AgentRunner | null = null;
  private runnerToken = 0;
  private restartTimer: NodeJS.Timeout | null = null;
  private healthTimer: NodeJS.Timeout | null = null;
  private stopRequested = false;
  private healthStatus: AgentHealthStatus | undefined;
  private restartCount = 0;
  private state: AgentRunState;

  constructor(
    private readonly adapter: AgentAdapter,
    private readonly baseTask: AgentTask,
    options: ProcessSupervisorOptions = {}
  ) {
    super();
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
      maxRestartAttempts: normalizeNonNegativeInteger(options.maxRestartAttempts, DEFAULT_OPTIONS.maxRestartAttempts),
      restartBackoffMs: normalizePositiveInteger(options.restartBackoffMs, DEFAULT_OPTIONS.restartBackoffMs),
      healthCheckIntervalMs: normalizePositiveInteger(
        options.healthCheckIntervalMs,
        DEFAULT_OPTIONS.healthCheckIntervalMs
      ),
      unresponsiveThresholdMs: normalizePositiveInteger(
        options.unresponsiveThresholdMs,
        DEFAULT_OPTIONS.unresponsiveThresholdMs
      ),
    };
    this.state = {
      agentId: baseTask.agentId,
      adapterId: adapter.id,
      runId: baseTask.runId,
      status: 'idle',
      stage: 'queued',
      startedAt: 0,
      restartCount: 0,
    };
  }

  override on<T extends keyof SupervisorEvents>(eventName: T, listener: (...args: SupervisorEvents[T]) => void): this {
    return super.on(eventName, listener);
  }

  getState(): AgentRunState {
    return { ...this.state };
  }

  async start(): Promise<AgentRunState> {
    this.stopRequested = false;
    this.ensureHealthTimer();
    await this.startRunner();
    return this.getState();
  }

  async stop(): Promise<void> {
    this.stopRequested = true;
    this.clearRestartTimer();

    if (this.runner) {
      await this.runner.stop();
      return;
    }

    const ts = Date.now();
    this.emitNotice('info', 'Stop requested; pending restart canceled.');
    this.emitEvent({
      type: 'run.finished',
      agentId: this.baseTask.agentId,
      runId: this.baseTask.runId,
      result: 'failed',
      ts,
    });
    this.setState({
      ...this.state,
      status: 'stopped',
      stage: 'error',
      endedAt: ts,
      nextRestartAt: undefined,
    });
    this.clearHealthTimer();
  }

  async close(): Promise<void> {
    this.stopRequested = true;
    this.clearRestartTimer();
    this.clearHealthTimer();
    if (this.runner) {
      await this.runner.stop();
    }
  }

  private async startRunner(): Promise<void> {
    const runner = new AgentRunner(this.adapter, this.createAttemptTask());
    const token = ++this.runnerToken;
    this.runner = runner;

    runner.on('event', (event) => {
      if (token !== this.runnerToken) {
        return;
      }

      this.handleRunnerEvent(event);
    });

    runner.on('state', (state) => {
      if (token !== this.runnerToken) {
        return;
      }

      this.handleRunnerState(state);
    });

    try {
      await runner.start();
      if (this.restartCount > 0) {
        this.emitNotice(
          'info',
          `Restart attempt ${this.restartCount}/${this.options.maxRestartAttempts} started successfully.`
        );
      }
    } catch (error) {
      this.runner = null;
      await this.handleStartFailure(error);
    }
  }

  private handleRunnerEvent(event: AgentEvent): void {
    if (event.type === 'run.error') {
      this.emitEvent({
        ...event,
        recoverable: this.shouldRestartAfterFailure(),
      });
      return;
    }

    if (event.type === 'run.finished' && event.result === 'failed' && this.shouldRestartAfterFailure()) {
      return;
    }

    this.emitEvent(event);
  }

  private handleRunnerState(runnerState: AgentRunState): void {
    if (runnerState.status === 'failed' && this.shouldRestartAfterFailure()) {
      this.runner = null;
      this.updateHealthStatus('crashed', runnerState.pid);
      this.scheduleRestart(runnerState);
      return;
    }

    const terminal = ['completed', 'failed', 'stopped'].includes(runnerState.status);
    this.setState({
      ...runnerState,
      restartCount: this.restartCount,
      nextRestartAt: undefined,
      healthStatus: terminal ? this.healthStatus : this.healthStatus ?? 'alive',
    });

    if (runnerState.status === 'starting' || runnerState.status === 'running') {
      this.updateHealthStatus('alive', runnerState.pid);
    }

    if (terminal) {
      this.runner = null;
      this.clearHealthTimer();
    }
  }

  private async handleStartFailure(error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    const ts = Date.now();

    this.emitEvent({
      type: 'run.error',
      agentId: this.baseTask.agentId,
      runId: this.baseTask.runId,
      error: message,
      recoverable: this.shouldRestartAfterFailure(),
      ts,
    });

    if (this.shouldRestartAfterFailure()) {
      this.scheduleRestart({
        ...this.state,
        status: 'failed',
        stage: 'error',
        error: message,
        endedAt: ts,
      });
      return;
    }

    this.updateHealthStatus('crashed', this.state.pid);
    this.emitEvent({
      type: 'run.finished',
      agentId: this.baseTask.agentId,
      runId: this.baseTask.runId,
      result: 'failed',
      ts,
    });
    this.setState({
      ...this.state,
      status: 'failed',
      stage: 'error',
      error: message,
      endedAt: ts,
      restartCount: this.restartCount,
      nextRestartAt: undefined,
      healthStatus: this.healthStatus ?? 'crashed',
    });
    this.clearHealthTimer();
  }

  private scheduleRestart(runnerState: AgentRunState): void {
    const delayMs = this.getRestartDelayMs();
    const nextRestartAt = Date.now() + delayMs;
    const nextAttempt = this.restartCount + 1;

    this.setState({
      ...runnerState,
      status: 'running',
      stage: 'waiting',
      restartCount: this.restartCount,
      nextRestartAt,
      healthStatus: this.healthStatus ?? 'crashed',
    });
    this.emitEvent({
      type: 'run.stage',
      agentId: this.baseTask.agentId,
      runId: this.baseTask.runId,
      stage: 'waiting',
      ts: Date.now(),
    });
    this.emitNotice(
      'warn',
      `Process failed; restarting in ${delayMs}ms (attempt ${nextAttempt}/${this.options.maxRestartAttempts}).`
    );

    this.clearRestartTimer();
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (this.stopRequested) {
        return;
      }

      this.restartCount += 1;
      void this.startRunner();
    }, delayMs);
  }

  private ensureHealthTimer(): void {
    if (this.healthTimer) {
      return;
    }

    this.healthTimer = setInterval(() => {
      this.runHealthCheck();
    }, this.options.healthCheckIntervalMs);
  }

  private clearHealthTimer(): void {
    if (!this.healthTimer) {
      return;
    }

    clearInterval(this.healthTimer);
    this.healthTimer = null;
  }

  private clearRestartTimer(): void {
    if (!this.restartTimer) {
      return;
    }

    clearTimeout(this.restartTimer);
    this.restartTimer = null;
  }

  private runHealthCheck(): void {
    if (!this.runner || !['starting', 'running'].includes(this.state.status)) {
      return;
    }

    const pid = this.state.pid;
    if (!pid) {
      return;
    }

    if (!processExists(pid)) {
      this.updateHealthStatus('crashed', pid);
      return;
    }

    const referenceTs = this.state.lastEventAt ?? this.state.startedAt ?? Date.now();
    const ageMs = Date.now() - referenceTs;
    if (ageMs > this.options.unresponsiveThresholdMs) {
      this.updateHealthStatus('unresponsive', pid);
      return;
    }

    this.updateHealthStatus('alive', pid);
  }

  private updateHealthStatus(status: AgentHealthStatus, pid?: number): void {
    if (this.healthStatus === status) {
      return;
    }

    this.healthStatus = status;
    this.setState({
      ...this.state,
      healthStatus: status,
      pid: pid ?? this.state.pid,
    });

    if (typeof (pid ?? this.state.pid) === 'number') {
      this.emitEvent({
        type: 'agent.health',
        agentId: this.baseTask.agentId,
        runId: this.baseTask.runId,
        status,
        pid: (pid ?? this.state.pid) || 0,
        ts: Date.now(),
      });
    }
  }

  private emitNotice(level: 'info' | 'warn', text: string): void {
    this.emitEvent({
      type: 'run.notice',
      agentId: this.baseTask.agentId,
      runId: this.baseTask.runId,
      level,
      text,
      ts: Date.now(),
    });
  }

  private emitEvent(event: AgentEvent): void {
    this.emit('event', event);
  }

  private setState(nextState: AgentRunState): void {
    this.state = {
      ...nextState,
      restartCount: nextState.restartCount ?? this.restartCount,
      healthStatus: nextState.healthStatus ?? this.healthStatus,
    };
    this.emit('state', this.getState());
  }

  private shouldRestartAfterFailure(): boolean {
    return (
      this.options.autoRestart &&
      !this.stopRequested &&
      this.restartCount < this.options.maxRestartAttempts
    );
  }

  private getRestartDelayMs(): number {
    return this.options.restartBackoffMs * Math.max(1, 2 ** this.restartCount);
  }

  private createAttemptTask(): AgentTask {
    return {
      ...this.baseTask,
      metadata: {
        ...this.baseTask.metadata,
        monitorRestartAttempt: String(this.restartCount),
      },
    };
  }
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || !value || value < 1) {
    return fallback;
  }

  return Math.floor(value);
}

function normalizeNonNegativeInteger(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || value === undefined || value < 0) {
    return fallback;
  }

  return Math.floor(value);
}
