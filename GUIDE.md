# AI-Pilot Guide

本指南描述 PoC 预期流程与脚手架使用方式。
This guide describes the intended PoC workflow and how to use the scaffold.

## 快速开始 / Quick Start

```bash
npm install --registry=https://registry.npmjs.org
npm run build
```

## CLI（规划）/ CLI (Planned)

```bash
ai-pilot init [--write --yes] [--ide <id>]
```

预期行为 / Planned behavior:

- 默认 dry-run，只有提供 `--write --yes` 才写入 / Default is dry-run unless `--write --yes` is provided
- `--ide` 指定适配器（如 `vscode`, `claude-code`）/ `--ide` targets a specific adapter (e.g. `vscode`, `claude-code`)

## 输出结构（规划）/ Output (Planned)

生成结果位于 `.ai-pilot/` / Generated bundle lives in `.ai-pilot/`:

```
.ai-pilot/
  config.json
  rules/
  skills/
  agent/
  mcp/
```

## 风险控制（规划）/ Risk Control (Planned)

- 所有写入先生成 WritePlan / All writes go through a WritePlan first
- 非 TTY 默认 dry-run / Non-TTY defaults to dry-run

## 测试数据 / Fixtures

使用 `tests/fixtures/` 进行本地校验 / Use `tests/fixtures/` for local validation:

- `vue2-project/`
- `vue3-project/`
- `expected-outputs/`
