import { normalizeRunCount } from '../utils.js';

function buildRunPayloads(els) {
  const adapterId = els.adapterSelect.value;
  const prompt = els.promptInput.value.trim();
  const cwd = els.cwdInput.value.trim() || undefined;
  const agentBase = els.agentIdInput.value.trim();
  const runCount = normalizeRunCount(els.runCountInput.value);

  if (!prompt) {
    throw new Error('prompt is required');
  }

  if (runCount === 1) {
    return [
      {
        adapterId,
        prompt,
        cwd,
        agentId: agentBase || undefined,
      },
    ];
  }

  const base = agentBase || adapterId;
  return Array.from({ length: runCount }, (_, index) => ({
    adapterId,
    prompt,
    cwd,
    agentId: `${base}${index + 1}`,
  }));
}

export function bindRunControls(els, handlers) {
  els.startRun.addEventListener('click', async () => {
    els.startRun.disabled = true;
    try {
      const payloads = buildRunPayloads(els);
      await handlers.onStart(payloads);
    } catch (error) {
      handlers.onError(error);
    } finally {
      els.startRun.disabled = false;
    }
  });

  els.clearFeed.addEventListener('click', () => {
    handlers.onClearFeed();
  });
}
