import { describe, it, expect } from 'vitest';
import { generateAgentConfig } from '../src/generators/agent';

describe('generateAgentConfig', () => {
  it('provides default behavior', () => {
    const config = generateAgentConfig();

    expect(config.behavior).toEqual({
      mode: 'assist',
      priority: 'normal',
      triggers: ['on_request'],
    });
  });

  it('allows partial behavior overrides', () => {
    const config = generateAgentConfig({
      behavior: {
        mode: 'review',
        triggers: ['on_review', 'on_request'],
      },
    });

    expect(config.behavior).toEqual({
      mode: 'review',
      priority: 'normal',
      triggers: ['on_review', 'on_request'],
    });
  });
});
