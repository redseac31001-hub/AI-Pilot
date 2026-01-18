import path from 'path';
import { describe, it, expect } from 'vitest';
import { L1Detector } from '../src/detectors/l1-detector';

const fixturesRoot = path.resolve(process.cwd(), 'tests', 'fixtures');

describe('L1Detector', () => {
  it('detects Vue 2 fixtures', async () => {
    const detector = new L1Detector();
    const result = await detector.detect(path.join(fixturesRoot, 'vue2-project'));

    expect(result.techStack.framework).toBe('vue2');
    expect(result.techStack.language).toBe('js');
    expect(result.techStack.buildTool).toBe('vue-cli');
    expect(result.techStack.store).toBe('vuex');
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    expect(result.evidence.length).toBeGreaterThanOrEqual(2);
  });

  it('detects Vue 3 fixtures', async () => {
    const detector = new L1Detector();
    const result = await detector.detect(path.join(fixturesRoot, 'vue3-project'));

    expect(result.techStack.framework).toBe('vue3');
    expect(result.techStack.language).toBe('ts');
    expect(result.techStack.buildTool).toBe('vite');
    expect(result.techStack.store).toBe('pinia');
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    expect(result.evidence.length).toBeGreaterThanOrEqual(2);
  });
});
