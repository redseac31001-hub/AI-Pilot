import {
  ConfigBundle,
  DetectionResult,
  GeneratedRule,
  WritePlan,
  WriteResult,
} from './types';

export interface StackDetector {
  name: string;
  detect(rootPath: string): Promise<DetectionResult>;
}

export interface RuleGenerator {
  id: string;
  generate(context: DetectionResult): GeneratedRule[];
}

export interface SkillProvider {
  listSkills(): Promise<string[]>;
  copySkill(skillId: string, destDir: string): Promise<void>;
}

export interface IDEAdapter {
  id: string;
  detect(rootPath: string): Promise<boolean>;
  plan(rootPath: string, bundle: ConfigBundle): Promise<WritePlan>;
  execute(rootPath: string, plan: WritePlan): Promise<WriteResult>;
}
