export async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Request failed');
  }

  return payload;
}

export function fetchHealth() {
  return fetchJson('/api/health');
}

export function fetchAgents() {
  return fetchJson('/api/agents');
}

export function fetchEvents(since) {
  const query = typeof since === 'number' ? `?since=${encodeURIComponent(since)}` : '';
  return fetchJson(`/api/events${query}`);
}

export function startRuns(payloads) {
  if (payloads.length === 1) {
    return fetchJson('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloads[0]),
    });
  }

  return fetchJson('/api/runs/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ runs: payloads }),
  });
}

export function stopRun(runId) {
  return fetchJson(`/api/runs/${runId}/stop`, { method: 'POST' });
}
