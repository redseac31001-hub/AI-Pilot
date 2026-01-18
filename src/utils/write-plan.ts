import fs from 'fs';
import path from 'path';
import { WriteAction, WriteActionResult } from '../core/types';
import { ensureDir } from './fs';

export function applyWriteActions(
  rootPath: string,
  actions: WriteAction[]
): WriteActionResult[] {
  return actions.map((action) => {
    if (action.type === 'skip') {
      return {
        type: action.type,
        targetPath: action.targetPath,
        status: 'skipped',
      };
    }

    const absolutePath = path.resolve(rootPath, action.targetPath);

    try {
      ensureDir(path.dirname(absolutePath));

      let backupPath: string | undefined;
      if (action.type === 'update' && fs.existsSync(absolutePath)) {
        backupPath = `${absolutePath}.bak`;
        fs.copyFileSync(absolutePath, backupPath);
      }

      fs.writeFileSync(absolutePath, action.content, 'utf8');

      return {
        type: action.type,
        targetPath: action.targetPath,
        status: 'applied',
        backupPath,
      };
    } catch (error) {
      return {
        type: action.type,
        targetPath: action.targetPath,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}
