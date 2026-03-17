declare module 'ws' {
  import { EventEmitter } from 'events';
  import type { Server } from 'http';

  export class WebSocket extends EventEmitter {
    static readonly OPEN: number;
    readonly OPEN: number;
    readyState: number;
    send(data: string): void;
  }

  export class WebSocketServer extends EventEmitter {
    clients: Set<WebSocket>;
    constructor(options: { server: Server; path?: string });
    close(callback: (error?: Error | null) => void): void;
  }
}
