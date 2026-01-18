import { IDEAdapter } from '../core/interfaces';
import { BundleAdapter } from './bundle';
import { ClaudeCodeAdapter } from './claude';
import { VSCodeAdapter } from './vscode';

export function getAdapters(): IDEAdapter[] {
  return [new BundleAdapter(), new VSCodeAdapter(), new ClaudeCodeAdapter()];
}
