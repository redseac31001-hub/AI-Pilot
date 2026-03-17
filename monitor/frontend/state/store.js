const MAX_EVENTS = 120;

export const state = {
  agents: [],
  events: [],
  health: null,
  lastEventTs: 0,
  ws: null,
  reconnectTimer: null,
};

export function setHealth(health) {
  if (health) {
    state.health = health;
  }
}

export function clearEvents() {
  state.events = [];
}

export function getLastEventTs() {
  return state.lastEventTs;
}

export function replaceSnapshot(snapshot) {
  state.events = [];
  const nextEvents = Array.isArray(snapshot.events) ? snapshot.events.slice(-MAX_EVENTS) : [];
  for (const event of nextEvents) {
    pushUniqueEvent(event);
  }
  state.agents = Array.isArray(snapshot.agents) ? snapshot.agents : [];
  sortAgents();
}

export function syncAgents(agents) {
  const byRunId = new Map(agents.map((agent) => [agent.runId, agent]));
  for (const agent of state.agents) {
    if (byRunId.has(agent.runId)) {
      Object.assign(agent, byRunId.get(agent.runId));
      byRunId.delete(agent.runId);
    }
  }

  for (const agent of byRunId.values()) {
    state.agents.unshift(agent);
  }

  sortAgents();
}

export function pushEvents(events) {
  for (const event of events) {
    if (!pushUniqueEvent(event)) {
      continue;
    }
    applyEventToAgents(event);
  }

  state.events.sort((left, right) => left.ts - right.ts);
  if (state.events.length > MAX_EVENTS) {
    state.events = state.events.slice(-MAX_EVENTS);
  }

  sortAgents();
}

export function isActiveStatus(status) {
  return ['starting', 'running', 'stopping'].includes(status);
}

function sortAgents() {
  state.agents.sort((left, right) => {
    const leftActive = isActiveStatus(left.status) ? 1 : 0;
    const rightActive = isActiveStatus(right.status) ? 1 : 0;
    if (leftActive !== rightActive) {
      return rightActive - leftActive;
    }

    return (right.lastEventAt || right.startedAt || 0) - (left.lastEventAt || left.startedAt || 0);
  });
}

function inferAdapterId(agentId) {
  if (typeof agentId !== 'string') {
    return 'unknown';
  }

  if (agentId.startsWith('codex')) {
    return 'codex';
  }

  if (agentId.startsWith('claude')) {
    return 'claude';
  }

  return agentId.split('-')[0] || agentId;
}

function applyEventToAgents(event) {
  let agent = state.agents.find((item) => item.runId === event.runId);
  if (!agent) {
    agent = {
      agentId: event.agentId,
      adapterId: inferAdapterId(event.agentId),
      runId: event.runId,
      status: 'running',
      stage: 'queued',
      startedAt: event.ts,
      lastEventAt: event.ts,
    };
    state.agents.unshift(agent);
  }

  agent.lastEventAt = event.ts;

  switch (event.type) {
    case 'run.started':
      agent.status = 'running';
      agent.stage = 'planning';
      break;
    case 'run.stage':
      agent.stage = event.stage;
      if (event.stage === 'waiting') {
        agent.status = 'running';
      }
      break;
    case 'run.notice':
      agent.lastMessage = event.text;
      break;
    case 'message.delta':
      agent.lastMessage = event.text;
      break;
    case 'summary.updated':
      agent.lastSummary = event.text;
      agent.lastMessage = event.text;
      break;
    case 'run.error':
      agent.status = 'failed';
      agent.stage = 'error';
      agent.error = event.error;
      break;
    case 'run.finished':
      agent.status = event.result === 'success' ? 'completed' : agent.status === 'stopping' ? 'stopped' : 'failed';
      agent.stage = event.result === 'success' ? 'done' : 'error';
      agent.endedAt = event.ts;
      break;
    case 'agent.health':
      agent.pid = event.pid;
      agent.healthStatus = event.status;
      break;
    case 'tool.finished':
      agent.lastMessage = `Tool finished with exit code ${event.exitCode}`;
      break;
    default:
      break;
  }
}

function pushUniqueEvent(event) {
  if (state.events.some((item) => isSameEvent(item, event))) {
    return false;
  }

  state.events.push(event);
  state.lastEventTs = Math.max(state.lastEventTs, event.ts || 0);
  return true;
}

function isSameEvent(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
