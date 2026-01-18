import { BaseAdapter } from './base';
import { ConfigBundle, WritePlan, WriteResult } from '../core/types';

export class BundleAdapter extends BaseAdapter {
  id = 'bundle';

  async detect(_rootPath: string): Promise<boolean> {
    return true;
  }

  async plan(_rootPath: string, _bundle: ConfigBundle): Promise<WritePlan> {
    return { adapterId: this.id, actions: [] };
  }

  async execute(_rootPath: string, plan: WritePlan): Promise<WriteResult> {
    return {
      adapterId: plan.adapterId,
      actions: plan.actions.map((action) => ({
        type: action.type,
        targetPath: action.targetPath,
        status: 'skipped',
      })),
    };
  }
}
