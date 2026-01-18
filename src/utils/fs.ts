import fs from 'fs';
import path from 'path';

export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function readText(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

export function readJson<T>(filePath: string): T | null {
  const raw = readText(filePath);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeText(filePath: string, content: string): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

export function writeJson(filePath: string, data: unknown): void {
  const content = `${JSON.stringify(data, null, 2)}\n`;
  writeText(filePath, content);
}
