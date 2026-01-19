# AI-Pilot Guide

本指南描述 PoC 预期流程与脚手架使用方式。
This guide describes the intended PoC workflow and how to use the scaffold.

## 快速开始 / Quick Start

```bash
npm install --registry=https://registry.npmjs.org
npm run build
npm test
```

## CLI / CLI

```bash
node bin/ai-pilot.js init [--dry-run] [--write --yes] [--ide <id>] [--format json|text] [--import-rules <dir>] [--import-skills <dir>]
```

行为说明 / Behavior:

- 默认 dry-run，只有提供 `--write --yes` 才写入 / Default is dry-run unless `--write --yes` is provided
- `--ide` 指定适配器（如 `vscode`, `claude-code`）/ `--ide` targets a specific adapter (e.g. `vscode`, `claude-code`)
- `--import-rules` / `--import-skills` 导入外部 rules/skills（不存在路径会 warning 并跳过） / Import extra rules/skills (missing paths warn and are skipped)
- `--format json` 输出 JSON（便于脚本化/验收） / JSON output for automation/verification

## 输出结构 / Output

生成结果位于 `.ai-pilot/` / Generated bundle lives in `.ai-pilot/`:

```
.ai-pilot/
  config.json
  rules/
  skills/
  agent/
  mcp/
```

## 风险控制 / Risk Control

- 所有写入先生成 WritePlan / All writes go through a WritePlan first
- 非 TTY 默认 dry-run / Non-TTY defaults to dry-run

## E2E（fixtures）/ E2E (fixtures)

```bash
npm run e2e:fixtures
```

## 测试数据 / Fixtures

使用 `tests/fixtures/` 进行本地校验 / Use `tests/fixtures/` for local validation:

- `vue2-project/`
- `vue3-project/`
- `expected-outputs/`
