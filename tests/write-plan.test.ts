import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyWriteActions } from '../src/utils/write-plan';
import { WriteAction } from '../src/core/types';

const tmpDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-pilot-write-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

describe('applyWriteActions', () => {
  it('creates backups on update', () => {
    const root = makeTempDir();
    const targetPath = 'rules.md';
    const absolutePath = path.join(root, targetPath);
    fs.writeFileSync(absolutePath, 'old', 'utf8');

    const actions: WriteAction[] = [
      {
        type: 'update',
        targetPath,
        content: 'new',
        risk: 'high',
        reason: 'update',
      },
    ];

    const results = applyWriteActions(root, actions);
    expect(results[0].status).toBe('applied');
    expect(fs.readFileSync(absolutePath, 'utf8')).toBe('new');
    expect(fs.readFileSync(`${absolutePath}.bak`, 'utf8')).toBe('old');
  });

  it('skips when action type is skip', () => {
    const root = makeTempDir();
    const targetPath = 'rules.md';
    const absolutePath = path.join(root, targetPath);
    fs.writeFileSync(absolutePath, 'same', 'utf8');

    const actions: WriteAction[] = [
      {
        type: 'skip',
        targetPath,
        content: 'same',
        risk: 'low',
        reason: 'skip',
      },
    ];

    const results = applyWriteActions(root, actions);
    expect(results[0].status).toBe('skipped');
    expect(fs.readFileSync(absolutePath, 'utf8')).toBe('same');
  });
});
