import { escapeHtml, formatTime } from '../utils.js';
import { isActiveStatus } from '../state/store.js';

export function renderAgentBoard(els, state, onStop) {
  if (!state.agents.length) {
    els.agentCards.innerHTML = '<div class="empty">还没有运行中的 agent。点击上方“启动任务”创建一条 run。</div>';
    return;
  }

  els.agentCards.innerHTML = state.agents
    .map((agent) => {
      const statusClass = `status-${escapeHtml(agent.status || 'idle')}`;
      const stopDisabled = isActiveStatus(agent.status) ? '' : 'disabled';
      const message = agent.error || agent.lastSummary || agent.lastMessage || '等待更多结构化事件…';

      return `
        <div class="card ${statusClass}">
          <div class="card-top">
            <div class="agent-name">
              <span class="dot"></span>
              <span>${escapeHtml(agent.agentId)}</span>
            </div>
            <span class="badge">${escapeHtml(agent.status || 'idle')}</span>
          </div>
          <div class="meta">
            <div class="meta-item">
              <label>Adapter</label>
              <span>${escapeHtml(agent.adapterId || '-')}</span>
            </div>
            <div class="meta-item">
              <label>阶段</label>
              <span>${escapeHtml(agent.stage || 'queued')}</span>
            </div>
            <div class="meta-item">
              <label>Run ID</label>
              <span>${escapeHtml(agent.runId || '-')}</span>
            </div>
            <div class="meta-item">
              <label>PID</label>
              <span>${escapeHtml(agent.pid || '-')}</span>
            </div>
          </div>
          <div class="meta">
            <div class="meta-item">
              <label>开始时间</label>
              <span>${escapeHtml(formatTime(agent.startedAt))}</span>
            </div>
            <div class="meta-item">
              <label>最近事件</label>
              <span>${escapeHtml(formatTime(agent.lastEventAt))}</span>
            </div>
            <div class="meta-item">
              <label>结束时间</label>
              <span>${escapeHtml(formatTime(agent.endedAt))}</span>
            </div>
            <div class="meta-item">
              <label>健康</label>
              <span>${escapeHtml(agent.healthStatus || '-')}</span>
            </div>
            <div class="meta-item">
              <label>重启次数</label>
              <span>${escapeHtml(agent.restartCount ?? 0)}</span>
            </div>
          </div>
          <div class="message">${escapeHtml(message)}</div>
          <div class="card-actions">
            <button class="secondary" data-stop-run="${escapeHtml(agent.runId)}" ${stopDisabled}>停止</button>
          </div>
        </div>
      `;
    })
    .join('');

  els.agentCards.querySelectorAll('[data-stop-run]').forEach((button) => {
    button.addEventListener('click', async () => {
      const runId = button.getAttribute('data-stop-run');
      if (!runId) {
        return;
      }

      button.disabled = true;
      try {
        await onStop(runId);
      } catch (error) {
        alert(error.message);
        button.disabled = false;
      }
    });
  });
}
