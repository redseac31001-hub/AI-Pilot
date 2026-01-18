import { SkillProvider } from '../core/interfaces';

export class LocalSkillProvider implements SkillProvider {
  async listSkills(): Promise<string[]> {
    return [];
  }

  async copySkill(_skillId: string, _destDir: string): Promise<void> {
    return;
  }
}
