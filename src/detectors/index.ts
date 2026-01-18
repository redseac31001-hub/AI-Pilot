import { StackDetector } from '../core/interfaces';
import { L1Detector } from './l1-detector';

export function createDetectors(): StackDetector[] {
  return [new L1Detector()];
}
