# AI-Pilot

AI-Pilot 是一个跨 IDE 的 AI 配置初始化工具。本仓库包含 PoC 阶段的 CLI 骨架与 fixtures。
AI-Pilot is a cross-IDE AI configuration bootstrapper. This repo holds the PoC CLI scaffold and fixtures.

## 状态 / Status

Phase 2（功能扩展）已完成，当前处于 Phase 3（质量保障与上线准备）。
Phase 2 (feature expansion) is completed; we are in Phase 3 (quality + release hardening).

## 环境要求 / Requirements

- Node.js >= 18（中文）/ Node.js >= 18 (English)

## 安装 / Install

```bash
npm install --registry=https://registry.npmjs.org
```

## 常用命令 / Common Commands

```bash
npm run build
npm test
```

## CLI 用法 / CLI Usage

```bash
# Dry-run (default)
node bin/ai-pilot.js init --format json

# Write outputs (non-interactive)
node bin/ai-pilot.js init --write --yes

# Import rules/skills from a directory
node bin/ai-pilot.js init --write --yes --import-rules ./demo/rules --import-skills ./demo/custom-skills
```

### 输出结构 / Output Layout

生成结果位于 `.ai-pilot/`（bundle）与 IDE 配置目录（如 `.vscode/`）：

```
.ai-pilot/
  config.json
  rules/
  skills/
  agent/
  mcp/
```

### Agent 配置 / Agent Config

`.ai-pilot/agent/config.json` 包含：
- `behavior.mode`: `assist | review | auto`（默认 `assist`）
- `behavior.priority`: `low | normal | high`（默认 `normal`）
- `behavior.triggers`: string[]（默认 `["on_request"]`）

### 导入规则的告警 / Import Warnings

当 `--import-rules` 指向不存在路径、非目录或未找到 `.md` 文件时，会输出 warning，但不会中断执行。

## E2E（fixtures）/ E2E (fixtures)

将手动 E2E 流程固化为脚本：对 `vue2-project` / `vue3-project` 各运行两次 `--write --yes`，并输出第二次运行的 create/update/skip 与 applied/skipped/failed 统计。

```bash
npm run e2e:fixtures
```

可选参数：
- `--only vue2-project|vue3-project`
- `--keep`（失败时保留临时目录用于排查）

## 常见问题（FAQ）/ FAQ

1) 如何导入 rules 和 skills？

```bash
node bin/ai-pilot.js init --write --yes --import-rules ./demo/rules --import-skills ./demo/custom-skills
```

2) 如何“重置配置”？

- 删除项目根目录下的 `.ai-pilot/`（会重新生成）
- 如需清理 VS Code 设置：仅移除 `.vscode/settings.json` 中的 `ai-pilot.*` 相关字段（避免误删其他设置）

3) `--write` 没有生效/提示 Non-TTY 怎么办？

- 在非交互环境（CI/脚本）需要同时传 `--write --yes`

## 反馈渠道 / Feedback

- 请在仓库 issue（或内部群）提交：运行命令、`--format json` 输出片段、以及项目类型（vue2/vue3/mixed）。

## 仓库结构 / Repository Layout

- `src/` - CLI、核心类型、适配器、检测器、生成器 / CLI, core types, adapters, detectors, generators
- `tests/fixtures/` - Vue 2 与 Vue 3 mock 项目 / Vue 2 and Vue 3 mock projects
- `ai-forum/` - 讨论与执行日志 / Project discussion and execution logs
