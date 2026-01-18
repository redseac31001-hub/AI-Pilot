import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { buildRulePath, SimpleRuleGenerator } from '../src/generators/rules';
import { DetectionResult } from '../src/core/types';

const fixturesRoot = path.resolve(process.cwd(), 'tests', 'fixtures');
const expectedVue2 = fs.readFileSync(
  path.join(fixturesRoot, 'expected-outputs', 'vue2-rules.md'),
  'utf8'
);
const expectedVue3 = fs.readFileSync(
  path.join(fixturesRoot, 'expected-outputs', 'vue3-rules.md'),
  'utf8'
);

function makeDetection(framework: 'vue2' | 'vue3'): DetectionResult {
  return {
    techStack: {
      framework,
      language: framework === 'vue2' ? 'js' : 'ts',
      buildTool: framework === 'vue2' ? 'vue-cli' : 'vite',
      store: framework === 'vue2' ? 'vuex' : 'pinia',
    },
    confidence: 1,
    evidence: [],
  };
}

describe('SimpleRuleGenerator', () => {
  it('renders Vue 2 rules', () => {
    const generator = new SimpleRuleGenerator();
    const output = generator.generate(makeDetection('vue2'));

    expect(output).toHaveLength(1);
    expect(output[0].path).toBe(buildRulePath('generated-vue2.md'));
    expect(output[0].content.trim()).toBe(expectedVue2.trim());
  });

  it('renders Vue 3 rules', () => {
    const generator = new SimpleRuleGenerator();
    const output = generator.generate(makeDetection('vue3'));

    expect(output).toHaveLength(1);
    expect(output[0].path).toBe(buildRulePath('generated-vue3.md'));
    expect(output[0].content.trim()).toBe(expectedVue3.trim());
  });
});
