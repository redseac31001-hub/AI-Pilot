import type { Server } from 'http';

import { WebSocketServer } from 'ws';

import type { AgentEvent } from '../core/agent-event';
import type { AgentRunState } from '../core/agent-state';

import type { MonitorService } from './monitor-service';

type WsSnapshotMessage = {
  type: 'snapshot';
  agents: AgentRunState[];
  events: AgentEvent[];
};

type WsEventMessage = {
  type: 'event';
  event: AgentEvent;
};

export class MonitorWsServer {
  private readonly wss: WebSocketServer;
  private readonly unsubscribe: () => void;

  constructor(server: Server, private readonly monitorService: MonitorService) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.wss.on('connection', (socket) => {
      const snapshot: WsSnapshotMessage = {
        type: 'snapshot',
        ...this.monitorService.getSnapshot(),
      };
      socket.send(JSON.stringify(snapshot));
    });

    this.unsubscribe = this.monitorService.subscribe((event) => {
      const payload: WsEventMessage = { type: 'event', event };
      const message = JSON.stringify(payload);
      for (const client of this.wss.clients) {
        if (client.readyState === client.OPEN) {
          client.send(message);
        }
      }
    });
  }

  close(): Promise<void> {
    this.unsubscribe();
    return new Promise((resolve, reject) => {
      this.wss.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}
