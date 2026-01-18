export type Framework = 'vue2' | 'vue3' | 'unknown';
export type Language = 'ts' | 'js' | 'unknown';
export type BuildTool = 'vite' | 'vue-cli' | 'unknown';
export type Store = 'pinia' | 'vuex' | 'none';

export type RiskLevel = 'low' | 'high';
export type WriteActionType = 'create' | 'update' | 'skip';

export interface Evidence {
  type: 'file_existence' | 'content_match' | 'dependency';
  filePath: string;
  description: string;
  weight: number;
}

export interface DetectionResult {
  techStack: {
    framework: Framework;
    language: Language;
    buildTool: BuildTool;
    store: Store;
  };
  confidence: number;
  evidence: Evidence[];
}

export interface ConfigBundle {
  meta: {
    version: string;
    generatedAt: string;
    generator: string;
  };
  detection: DetectionResult;
  rules: string[];
  skills: string[];
  agent: {
    configPath: string;
  };
  mcp: {
    configPath: string;
  };
}

export interface WritePlan {
  adapterId: string;
  actions: WriteAction[];
}

export interface WriteAction {
  type: WriteActionType;
  targetPath: string;
  content: string;
  risk: RiskLevel;
  reason: string;
}

export interface WriteResult {
  adapterId: string;
  actions: WriteActionResult[];
}

export interface WriteActionResult {
  type: WriteActionType;
  targetPath: string;
  status: 'applied' | 'skipped' | 'failed';
  backupPath?: string;
  error?: string;
}
