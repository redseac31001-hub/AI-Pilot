import { StackDetector } from '../core/interfaces';
import { DetectionResult } from '../core/types';

export class L1Detector implements StackDetector {
  name = 'l1';

  async detect(_rootPath: string): Promise<DetectionResult> {
    return {
      techStack: {
        framework: 'unknown',
        language: 'unknown',
        buildTool: 'unknown',
        store: 'none',
      },
      confidence: 0,
      evidence: [],
    };
  }
}
