type TreeKillFn = (pid: number, signal: string, callback: (error: Error | null) => void) => void;

const treeKill = require('tree-kill') as TreeKillFn;

export function killProcessTree(pid: number, signal = 'SIGTERM'): Promise<void> {
  return new Promise((resolve, reject) => {
    treeKill(pid, signal, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
