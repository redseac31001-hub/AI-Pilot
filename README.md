# AI-Pilot

AI-Pilot 是一个跨 IDE 的 AI 配置初始化工具。本仓库包含 PoC 阶段的 CLI 骨架与 fixtures。
AI-Pilot is a cross-IDE AI configuration bootstrapper. This repo holds the PoC CLI scaffold and fixtures.

## 状态 / Status

仅完成 Phase 0 骨架，核心逻辑尚未实现。
Phase 0 scaffold only. Core logic is not implemented yet.

## 环境要求 / Requirements

- Node.js >= 18（中文）/ Node.js >= 18 (English)

## 安装 / Install

```bash
npm install --registry=https://registry.npmjs.org
```

## 构建 / Build

```bash
npm run build
```

## 仓库结构 / Repository Layout

- `src/` - CLI、核心类型、适配器、检测器、生成器 / CLI, core types, adapters, detectors, generators
- `tests/fixtures/` - Vue 2 与 Vue 3 mock 项目 / Vue 2 and Vue 3 mock projects
- `ai-forum/` - 讨论与执行日志 / Project discussion and execution logs

## 说明 / Notes

- `ai-pilot init` 仅有骨架，未实现 / `ai-pilot init` is scaffolded but not implemented yet
- PoC 仅面向 VS Code 与 Claude Code / PoC scope targets VS Code and Claude Code only
