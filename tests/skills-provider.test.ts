import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalSkillProvider } from '../src/skills';

const tmpDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-pilot-skill-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

function createSkill(root: string, skillId: string): void {
  const skillDir = path.join(root, 'demo', 'custom-skills', skillId);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Skill\n', 'utf8');
  fs.writeFileSync(path.join(skillDir, 'guide.md'), 'Guide', 'utf8');
}

describe('LocalSkillProvider', () => {
  it('lists skills from demo directory', async () => {
    const root = makeTempDir();
    createSkill(root, 'demo-skill');
    const provider = new LocalSkillProvider(root);

    const skills = await provider.listSkills();

    expect(skills).toContain('demo-skill');
  });

  it('copies a skill directory', async () => {
    const root = makeTempDir();
    createSkill(root, 'demo-skill');
    const provider = new LocalSkillProvider(root);

    const destDir = path.join(root, 'out');
    await provider.copySkill('demo-skill', destDir);

    expect(
      fs.existsSync(path.join(destDir, 'demo-skill', 'SKILL.md'))
    ).toBe(true);
  });
});
