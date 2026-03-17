export function connectMonitorSocket(options) {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${location.host}/ws`);
  const shouldReplay = options.shouldReplay();

  options.state.ws = ws;
  if (options.state.reconnectTimer) {
    window.clearTimeout(options.state.reconnectTimer);
    options.state.reconnectTimer = null;
  }

  options.onStatus('WS connecting');

  ws.addEventListener('open', async () => {
    if (options.state.ws !== ws) {
      return;
    }

    if (shouldReplay) {
      options.onStatus('WS syncing');
      try {
        await options.onReplay();
      } catch (error) {
        options.onReplayError?.(error);
      }
    }

    options.onStatus('WS live');
  });

  ws.addEventListener('message', (message) => {
    if (options.state.ws !== ws) {
      return;
    }

    const payload = JSON.parse(message.data);
    if (payload.type === 'snapshot') {
      if (!shouldReplay) {
        options.onSnapshot(payload);
      }
      return;
    }

    if (payload.type === 'event') {
      options.onEvent(payload.event);
    }
  });

  ws.addEventListener('close', () => {
    if (options.state.ws !== ws) {
      return;
    }

    options.state.ws = null;
    options.onStatus('WS reconnecting');
    options.state.reconnectTimer = window.setTimeout(() => connectMonitorSocket(options), 1500);
  });

  ws.addEventListener('error', () => {
    if (options.state.ws !== ws) {
      return;
    }

    options.onStatus('WS error');
  });

  return ws;
}
