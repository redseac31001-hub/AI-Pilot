import { IDEAdapter } from '../core/interfaces';
import { ConfigBundle, WritePlan, WriteResult } from '../core/types';

export abstract class BaseAdapter implements IDEAdapter {
  abstract id: string;
  abstract detect(rootPath: string): Promise<boolean>;
  abstract plan(rootPath: string, bundle: ConfigBundle): Promise<WritePlan>;
  abstract execute(rootPath: string, plan: WritePlan): Promise<WriteResult>;
}
