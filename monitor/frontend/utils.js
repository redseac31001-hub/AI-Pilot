export function formatTime(ts) {
  if (!ts) {
    return '-';
  }

  const date = new Date(ts);
  return date.toLocaleTimeString('zh-CN', { hour12: false });
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function normalizeRunCount(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return Math.min(parsed, 6);
}

export function describeEvent(event) {
  if (event.type === 'message.delta') return event.text;
  if (event.type === 'summary.updated') return `摘要：${event.text}`;
  if (event.type === 'run.notice') return event.text;
  if (event.type === 'run.error') return event.error;
  if (event.type === 'run.stage') return `进入阶段：${event.stage}`;
  if (event.type === 'agent.health') return `健康状态：${event.status}`;
  if (event.type === 'run.finished') return `运行结束：${event.result}`;
  if (event.type === 'tool.finished') return `工具执行结束，exitCode=${event.exitCode}`;
  return '结构化事件已接收';
}
