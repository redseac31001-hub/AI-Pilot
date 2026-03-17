import type { AgentEvent } from '../core/agent-event';

type SummaryAggregatorOptions = {
  flushChars?: number;
  flushIntervalMs?: number;
  previewChars?: number;
};

type SummarySlot = {
  agentId: string;
  buffer: string;
  lastSummaryAt: number;
  timer: NodeJS.Timeout | null;
};

const DEFAULT_OPTIONS: Required<SummaryAggregatorOptions> = {
  flushChars: 500,
  flushIntervalMs: 5000,
  previewChars: 200,
};

export class MessageSummaryAggregator {
  private readonly slots = new Map<string, SummarySlot>();
  private readonly options: Required<SummaryAggregatorOptions>;

  constructor(
    private readonly emit: (event: AgentEvent) => void,
    options: SummaryAggregatorOptions = {}
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  handle(event: AgentEvent): AgentEvent[] {
    switch (event.type) {
      case 'message.delta':
        return this.handleMessageDelta(event);
      case 'run.error':
      case 'run.finished': {
        const summaryEvent = this.flush(event.runId, event.ts);
        this.dispose(event.runId);
        return summaryEvent ? [summaryEvent] : [];
      }
      default:
        return [];
    }
  }

  close(): void {
    for (const runId of this.slots.keys()) {
      this.dispose(runId);
    }
  }

  private handleMessageDelta(event: Extract<AgentEvent, { type: 'message.delta' }>): AgentEvent[] {
    const slot = this.getSlot(event.runId, event.agentId);
    slot.agentId = event.agentId;
    slot.buffer = slot.buffer.length > 0 ? `${slot.buffer}\n${event.text}` : event.text;

    if (normalizedLength(slot.buffer) >= this.options.flushChars) {
      const summaryEvent = this.flush(event.runId, event.ts);
      return summaryEvent ? [summaryEvent] : [];
    }

    this.schedule(event.runId);
    return [];
  }

  private getSlot(runId: string, agentId: string): SummarySlot {
    const existing = this.slots.get(runId);
    if (existing) {
      return existing;
    }

    const created: SummarySlot = {
      agentId,
      buffer: '',
      lastSummaryAt: 0,
      timer: null,
    };
    this.slots.set(runId, created);
    return created;
  }

  private schedule(runId: string): void {
    const slot = this.slots.get(runId);
    if (!slot || slot.timer) {
      return;
    }

    const elapsedMs = slot.lastSummaryAt > 0 ? Date.now() - slot.lastSummaryAt : 0;
    const delayMs =
      slot.lastSummaryAt > 0
        ? Math.max(0, this.options.flushIntervalMs - elapsedMs)
        : this.options.flushIntervalMs;

    slot.timer = setTimeout(() => {
      const summaryEvent = this.flush(runId, Date.now());
      if (summaryEvent) {
        this.emit(summaryEvent);
      }
    }, delayMs);
    slot.timer.unref?.();
  }

  private flush(runId: string, ts: number): Extract<AgentEvent, { type: 'summary.updated' }> | null {
    const slot = this.slots.get(runId);
    if (!slot) {
      return null;
    }

    if (slot.timer) {
      clearTimeout(slot.timer);
      slot.timer = null;
    }

    const text = summarize(slot.buffer, this.options.previewChars);
    if (!text) {
      return null;
    }

    slot.buffer = '';
    slot.lastSummaryAt = ts;

    return {
      type: 'summary.updated',
      agentId: slot.agentId,
      runId,
      text,
      ts,
    };
  }

  private dispose(runId: string): void {
    const slot = this.slots.get(runId);
    if (!slot) {
      return;
    }

    if (slot.timer) {
      clearTimeout(slot.timer);
    }

    this.slots.delete(runId);
  }
}

function summarize(input: string, previewChars: number): string {
  const normalized = input.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  if (normalized.length <= previewChars) {
    return normalized;
  }

  return `...${normalized.slice(-previewChars)}`;
}

function normalizedLength(input: string): number {
  return input.replace(/\s+/g, ' ').trim().length;
}
