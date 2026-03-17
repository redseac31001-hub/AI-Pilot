import { randomUUID } from 'crypto';

import type { AgentAdapter } from '../adapters/base';
import type { AgentEvent } from '../core/agent-event';
import type { AgentRunState } from '../core/agent-state';
import { RingBuffer } from '../core/ring-buffer';
import type { AgentTask } from '../core/agent-task';
import type { MonitorConfig } from '../config/monitor-config';
import { resolveAgentCwd } from '../config/monitor-config';
import { ProcessSupervisor, type ProcessSupervisorOptions } from '../runners/process-supervisor';
import { MessageSummaryAggregator } from '../summary/message-summary-aggregator';

type StartRunInput = {
  adapterId: string;
  agentId?: string;
  cwd?: string;
  prompt: string;
  metadata?: Record<string, string>;
  supervisor?: ProcessSupervisorOptions;
};

export class MonitorService {
  private readonly adapters = new Map<string, AgentAdapter>();
  private readonly supervisors = new Map<string, ProcessSupervisor>();
  private readonly states = new Map<string, AgentRunState>();
  private readonly events = new RingBuffer<AgentEvent>(1000);
  private readonly subscribers = new Set<(event: AgentEvent) => void>();
  private readonly startedAt = Date.now();
  private readonly summaryAggregator = new MessageSummaryAggregator((event) => {
    this.handleEvent(event);
  });

  constructor(adapters: AgentAdapter[]) {
    for (const adapter of adapters) {
      this.adapters.set(adapter.id, adapter);
    }
  }

  getHealth() {
    return {
      ok: true,
      uptimeMs: Date.now() - this.startedAt,
      activeRuns: [...this.states.values()].filter((state) =>
        ['starting', 'running', 'stopping'].includes(state.status)
      ).length,
    };
  }

  listAgents(): AgentRunState[] {
    return [...this.states.values()].sort((a, b) => b.startedAt - a.startedAt);
  }

  listEvents(since?: number): AgentEvent[] {
    return this.events.since(since);
  }

  async close(): Promise<void> {
    this.summaryAggregator.close();
    await Promise.all([...this.supervisors.values()].map((supervisor) => supervisor.close()));
    this.supervisors.clear();
  }

  subscribe(listener: (event: AgentEvent) => void): () => void {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  async startRun(input: StartRunInput): Promise<AgentRunState> {
    const adapter = this.adapters.get(input.adapterId);
    if (!adapter) {
      throw new Error(`Unknown adapter: ${input.adapterId}`);
    }

    const runId = randomUUID();
    const agentId = input.agentId ?? `${input.adapterId}-${runId.slice(0, 8)}`;
    const task: AgentTask = {
      agentId,
      runId,
      cwd: input.cwd ?? process.cwd(),
      prompt: input.prompt,
      metadata: input.metadata,
    };

    const supervisor = new ProcessSupervisor(adapter, task, input.supervisor);
    supervisor.on('event', (event) => {
      const syntheticEvents = this.summaryAggregator.handle(event);
      this.handleEvent(event);
      for (const syntheticEvent of syntheticEvents) {
        this.handleEvent(syntheticEvent);
      }
    });
    supervisor.on('state', (state) => {
      const current = this.states.get(state.runId);
      this.states.set(state.runId, {
        ...state,
        lastSummary: state.lastSummary ?? current?.lastSummary,
      });
      if (['completed', 'failed', 'stopped'].includes(state.status)) {
        this.supervisors.delete(state.runId);
      }
    });

    this.supervisors.set(runId, supervisor);
    const state = await supervisor.start();
    this.states.set(runId, state);
    return state;
  }

  async startRuns(inputs: StartRunInput[]): Promise<AgentRunState[]> {
    return Promise.all(inputs.map((input) => this.startRun(input)));
  }

  async startConfiguredRuns(config: MonitorConfig): Promise<AgentRunState[]> {
    const inputs = config.agents
      .filter((agent) => agent.enabled !== false && agent.autoStart !== false)
      .map((agent) => ({
        adapterId: agent.adapter,
        agentId: agent.id,
        cwd: resolveAgentCwd(config.workspaceRoot, agent.cwd),
        prompt: agent.prompt,
        metadata: agent.metadata,
        supervisor: agent.supervisor,
      }));

    if (inputs.length === 0) {
      return [];
    }

    return this.startRuns(inputs);
  }

  async stopRun(runId: string): Promise<AgentRunState> {
    const supervisor = this.supervisors.get(runId);
    if (!supervisor) {
      throw new Error(`Run not found: ${runId}`);
    }

    await supervisor.stop();
    return supervisor.getState();
  }

  getSnapshot() {
    return {
      agents: this.listAgents(),
      events: this.listEvents(),
    };
  }

  private handleEvent(event: AgentEvent): void {
    this.events.push(event);
    this.applyEventToState(event);
    this.broadcast(event);
  }

  private broadcast(event: AgentEvent): void {
    for (const subscriber of this.subscribers) {
      subscriber(event);
    }
  }

  private applyEventToState(event: AgentEvent): void {
    if (!('runId' in event)) {
      return;
    }

    const current = this.states.get(event.runId);
    if (!current) {
      return;
    }

    switch (event.type) {
      case 'summary.updated':
        this.states.set(event.runId, {
          ...current,
          lastSummary: event.text,
          lastMessage: event.text,
          lastEventAt: event.ts,
        });
        break;
      case 'run.notice':
        this.states.set(event.runId, {
          ...current,
          lastMessage: event.text,
          lastEventAt: event.ts,
        });
        break;
      case 'run.stage':
        if (event.stage === 'waiting') {
          this.states.set(event.runId, {
            ...current,
            status: 'running',
            stage: 'waiting',
            lastEventAt: event.ts,
          });
        }
        break;
      case 'agent.health':
        this.states.set(event.runId, {
          ...current,
          pid: event.pid,
          healthStatus: event.status,
          lastEventAt: event.ts,
        });
        break;
      default:
        break;
    }
  }
}
