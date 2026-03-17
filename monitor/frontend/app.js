import { fetchAgents, fetchEvents, fetchHealth, startRuns, stopRun } from './api/client.js';
import { renderAgentBoard } from './components/agent-board.js';
import { renderBoardStats } from './components/board-stats.js';
import { renderChatFeed } from './components/chat-feed.js';
import { renderHeroStats } from './components/hero-stats.js';
import { bindRunControls } from './components/run-controls.js';
import { clearEvents, getLastEventTs, pushEvents, replaceSnapshot, setHealth, state, syncAgents } from './state/store.js';
import { connectMonitorSocket } from './ws/socket.js';

const els = {
  healthStatus: document.getElementById('health-status'),
  activeRuns: document.getElementById('active-runs'),
  eventCount: document.getElementById('event-count'),
  socketPill: document.getElementById('socket-pill'),
  agentCards: document.getElementById('agent-cards'),
  feedList: document.getElementById('feed-list'),
  adapterSelect: document.getElementById('adapter-select'),
  agentIdInput: document.getElementById('agent-id-input'),
  runCountInput: document.getElementById('run-count-input'),
  promptInput: document.getElementById('prompt-input'),
  cwdInput: document.getElementById('cwd-input'),
  startRun: document.getElementById('start-run'),
  clearFeed: document.getElementById('clear-feed'),
  boardStats: document.getElementById('board-stats'),
};

window.state = state;
window.els = els;

function renderAll(health) {
  setHealth(health);
  renderHeroStats(els, state);
  renderBoardStats(els, state);
  renderAgentBoard(els, state, handleStopRun);
  renderChatFeed(els, state);
}

async function refreshHealth() {
  const health = await fetchHealth();
  renderAll(health);
  return health;
}

async function refreshAgents() {
  const payload = await fetchAgents();
  syncAgents(payload.agents || []);
  renderAll();
}

async function handleStopRun(runId) {
  await stopRun(runId);
  await refreshAgents();
  await refreshHealth();
}

function updateSocketStatus(label) {
  els.socketPill.textContent = label;
}

function handleSnapshot(payload) {
  replaceSnapshot(payload);
  renderAll();
}

function handleEvent(event) {
  pushEvents([event]);
  renderAll();
}

async function replayMissedEvents() {
  const lastEventTs = getLastEventTs();
  const [agentsPayload, eventsPayload] = await Promise.all([fetchAgents(), fetchEvents(lastEventTs)]);
  syncAgents(agentsPayload.agents || []);
  pushEvents(eventsPayload.events || []);
  renderAll();
}

bindRunControls(els, {
  async onStart(payloads) {
    await startRuns(payloads);
    await refreshAgents();
    await refreshHealth();
  },
  onClearFeed() {
    clearEvents();
    renderAll();
  },
  onError(error) {
    alert(error.message);
  },
});

async function boot() {
  const health = await refreshHealth();
  await refreshAgents();
  renderAll(health);
  connectMonitorSocket({
    state,
    shouldReplay: () => getLastEventTs() > 0,
    onSnapshot: handleSnapshot,
    onEvent: handleEvent,
    onReplay: replayMissedEvents,
    onReplayError: (error) => {
      console.error('Failed to replay missed monitor events', error);
    },
    onStatus: updateSocketStatus,
  });
  window.setInterval(() => {
    refreshHealth().catch(() => {});
    refreshAgents().catch(() => {});
  }, 3000);
}

boot().catch((error) => {
  console.error(error);
  els.healthStatus.textContent = 'error';
});
