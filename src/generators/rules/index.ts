import { RuleGenerator } from '../../core/interfaces';
import { DetectionResult, Framework, GeneratedRule } from '../../core/types';
import { VUE2_RULES_TEMPLATE } from './vue2-template';
import { VUE3_RULES_TEMPLATE } from './vue3-template';
import { RULES_MARKER } from './marker';

const RULES_DIR = '.ai-pilot/rules';
const LAYER_ORDER = ['layer1_base', 'layer2_business', 'layer3_action'] as const;

function isGeneratedRulePath(rulePath: string): boolean {
  return rulePath.startsWith(`${RULES_DIR}/generated-`);
}

function ruleLayerIndex(rulePath: string): number {
  for (const [index, layer] of LAYER_ORDER.entries()) {
    if (rulePath.includes(`/${layer}/`) || rulePath.includes(`\\${layer}\\`)) {
      return index;
    }
  }
  return LAYER_ORDER.length;
}

export function rulesFileName(framework: Framework): string {
  if (framework === 'vue2') {
    return 'generated-vue2.md';
  }
  if (framework === 'vue3') {
    return 'generated-vue3.md';
  }
  return 'generated-unknown.md';
}

export function rulesLabel(framework: Framework): string {
  if (framework === 'vue2') {
    return 'Vue 2';
  }
  if (framework === 'vue3') {
    return 'Vue 3';
  }
  return 'Unknown';
}

export { RULES_MARKER };
export { collectImportedRules } from './import';

export function buildRulePath(fileName: string): string {
  return `${RULES_DIR}/${fileName}`;
}

export function generateRules(context: DetectionResult): GeneratedRule[] {
  return new SimpleRuleGenerator().generate(context);
}

export function mergeRules(
  generatedRules: GeneratedRule[],
  importedRules: GeneratedRule[]
): GeneratedRule[] {
  const combined = [...generatedRules, ...importedRules];
  return combined.sort((a, b) => {
    const aGenerated = isGeneratedRulePath(a.path);
    const bGenerated = isGeneratedRulePath(b.path);
    if (aGenerated !== bGenerated) {
      return aGenerated ? -1 : 1;
    }

    const aLayer = ruleLayerIndex(a.path);
    const bLayer = ruleLayerIndex(b.path);
    if (aLayer !== bLayer) {
      return aLayer - bLayer;
    }

    return a.path.localeCompare(b.path);
  });
}

export class SimpleRuleGenerator implements RuleGenerator {
  id = 'simple';

  generate(context: DetectionResult): GeneratedRule[] {
    const framework = context.techStack.framework;
    const fileName = rulesFileName(framework);
    let content = `${RULES_MARKER}\n\n# AI-Pilot Generated Rules\n\nNo rules available for the detected framework.\n`;

    if (framework === 'vue2') {
      content = VUE2_RULES_TEMPLATE;
    }

    if (framework === 'vue3') {
      content = VUE3_RULES_TEMPLATE;
    }

    return [
      {
        path: buildRulePath(fileName),
        content,
      },
    ];
  }
}
