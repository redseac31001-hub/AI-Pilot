import { RiskLevel } from '../core/types';

export function assessRisk(_targetPath: string, exists: boolean): RiskLevel {
  return exists ? 'high' : 'low';
}
