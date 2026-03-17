import { describeEvent, escapeHtml, formatTime } from '../utils.js';

export function renderChatFeed(els, state) {
  if (!state.events.length) {
    els.feedList.innerHTML = '<div class="empty">等待事件流接入。</div>';
    return;
  }

  els.feedList.innerHTML = state.events
    .slice()
    .reverse()
    .map((event) => {
      return `
        <div class="feed-item">
          <div class="feed-meta">
            <span class="feed-type">${escapeHtml(event.type)}</span>
            <span>${escapeHtml(event.agentId || '-')} · ${escapeHtml(formatTime(event.ts))}</span>
          </div>
          <div>${escapeHtml(describeEvent(event))}</div>
        </div>
      `;
    })
    .join('');
}
