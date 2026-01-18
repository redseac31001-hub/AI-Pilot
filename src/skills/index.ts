import fs from 'fs';
import path from 'path';
import { SkillProvider } from '../core/interfaces';

export type SkillFile = {
  relativePath: string;
  content: string;
};

function resolveDefaultSkillSource(rootPath: string): string | null {
  const demoSkills = path.join(rootPath, 'demo', 'custom-skills');
  if (fs.existsSync(demoSkills)) {
    return demoSkills;
  }

  const fixtureSkills = path.join(rootPath, 'src', 'skills', 'fixtures');
  if (fs.existsSync(fixtureSkills)) {
    return fixtureSkills;
  }

  return null;
}

function listSkillDirectories(baseDir: string): string[] {
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) =>
      fs.existsSync(path.join(baseDir, name, 'SKILL.md'))
    );
}

function collectSkillFiles(
  baseDir: string,
  relativeDir: string,
  files: SkillFile[]
): void {
  const fullDir = path.join(baseDir, relativeDir);
  const entries = fs.readdirSync(fullDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    const entryRelative = path.join(relativeDir, entry.name);
    const entryFullPath = path.join(baseDir, entryRelative);

    if (entry.isDirectory()) {
      collectSkillFiles(baseDir, entryRelative, files);
    } else {
      const content = fs.readFileSync(entryFullPath, 'utf8');
      files.push({
        relativePath: entryRelative.split(path.sep).join('/'),
        content,
      });
    }
  }
}

function copyDir(sourceDir: string, destDir: string): void {
  fs.mkdirSync(destDir, { recursive: true });
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyDir(sourcePath, destPath);
    } else {
      fs.copyFileSync(sourcePath, destPath);
    }
  }
}

export class LocalSkillProvider implements SkillProvider {
  private readonly sourceDir: string | null;

  constructor(rootPath: string, sourceDir?: string) {
    this.sourceDir = sourceDir ?? resolveDefaultSkillSource(rootPath);
  }

  async listSkills(): Promise<string[]> {
    if (!this.sourceDir) {
      return [];
    }

    return listSkillDirectories(this.sourceDir);
  }

  async copySkill(skillId: string, destDir: string): Promise<void> {
    if (!this.sourceDir) {
      throw new Error('No skill source directory configured.');
    }
    const sourcePath = path.join(this.sourceDir, skillId);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Skill not found: ${skillId}`);
    }
    copyDir(sourcePath, path.join(destDir, skillId));
  }

  readSkillFiles(skillId: string): SkillFile[] {
    if (!this.sourceDir) {
      return [];
    }
    const sourcePath = path.join(this.sourceDir, skillId);
    if (!fs.existsSync(sourcePath)) {
      return [];
    }
    const files: SkillFile[] = [];
    collectSkillFiles(this.sourceDir, skillId, files);
    return files;
  }
}
