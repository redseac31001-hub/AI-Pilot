export function renderHeroStats(els, state) {
  els.healthStatus.textContent = state.health?.ok ? 'online' : 'offline';
  els.activeRuns.textContent = String(state.health?.activeRuns ?? 0);
  els.eventCount.textContent = String(state.events.length);
}
