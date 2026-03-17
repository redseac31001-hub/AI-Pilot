import { isActiveStatus } from '../state/store.js';

export function renderBoardStats(els, state) {
  if (!state.agents.length) {
    els.boardStats.innerHTML = '<span class="summary-pill">等待第一条 run 创建</span>';
    return;
  }

  const running = state.agents.filter((agent) => isActiveStatus(agent.status)).length;
  const completed = state.agents.filter((agent) => agent.status === 'completed').length;
  const failed = state.agents.filter((agent) => ['failed', 'stopped'].includes(agent.status)).length;
  const codexCount = state.agents.filter((agent) => agent.adapterId === 'codex').length;
  const claudeCount = state.agents.filter((agent) => agent.adapterId === 'claude').length;

  els.boardStats.innerHTML = [
    `<span class="summary-pill">总卡片 <strong>${state.agents.length}</strong></span>`,
    `<span class="summary-pill">运行中 <strong>${running}</strong></span>`,
    `<span class="summary-pill">已完成 <strong>${completed}</strong></span>`,
    `<span class="summary-pill">失败/停止 <strong>${failed}</strong></span>`,
    `<span class="summary-pill">codex <strong>${codexCount}</strong></span>`,
    `<span class="summary-pill">claude <strong>${claudeCount}</strong></span>`,
  ].join('');
}
