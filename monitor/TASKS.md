# Monitor Task List

> Version: v0.3.0
> Executor: GPT-5 Codex
> Reviewer: Claude-Opus-4.6

> Note (2026-03-17): this file is now a legacy delivery log for the managed-agent monitor direction.
> It is not the next source of truth for execution.
> The corrected requirement/design baseline is documented in:
> - `monitor/docs/powershell-terminal-platform-requirements.md`
> - `monitor/docs/powershell-terminal-platform-detailed-design.md`
> - `monitor/docs/powershell-terminal-platform-prototype.md`
> A new execution task list should be created only after those docs are approved.

## Phase 0 - Interface Verification

- [x] 创建 `monitor/docs/event-samples/` 采样目录结构
- [x] 编写 `codex` 最小采样脚本
- [x] 编写 `claude` 最小采样脚本
- [x] 运行两类 CLI，并保存原始输出样本
- [x] 为每类 CLI 补充字段说明文档
- [x] 建立 `raw event -> AgentStage` 映射表
- [x] 记录未知字段处理策略
- [x] 确认 Claude 通讯链路（当前样本覆盖初始化与失败终态事件）
- [ ] 可选：在外部环境就绪后补采 Claude 成功执行样本

### Deliverables

- `monitor/docs/event-samples/codex/*`
- `monitor/docs/event-samples/claude/*`
- 阶段映射文档

### Acceptance

- 至少有一份 `codex` 样本和一份 `claude` 样本
- 能明确列出当前已观察到事件的映射依据
- 不要求在 Phase 0 内解决 Claude CLI 登录状态

## Phase 1 - Minimum Viable Monitor

### Phase 1A - Foundation

- [x] 初始化 `monitor/` 子模块基础结构
- [x] 创建 monitor 独立 `package.json`
- [x] 创建 monitor 独立 `tsconfig.json`
- [x] 定义 `AgentAdapter`、`AgentEvent`、`AgentStage`

### Phase 1B - Backend Core

- [x] 实现 `codex` adapter 的最小解析逻辑
- [x] 实现 `claude` adapter 的最小解析逻辑
- [x] 实现内存环形缓冲区
- [x] 实现单 agent `AgentRunner`
- [x] 集成 `tree-kill` 到 stop 路径
- [x] 实现 `GET /api/health`
- [x] 实现 `POST /api/runs`
- [x] 实现 `GET /api/events`
- [x] 实现 `WS /ws`
- [x] 实现 `POST /api/runs/:runId/stop`

### Phase 1C - Frontend and E2E

- [x] 实现 `public/index.html` 单页 spike
- [x] 在页面展示单卡片和最小 chat feed
- [x] 完成 `codex` 单 agent 端到端手工验证（参见 `monitor/docs/phase1c-manual-acceptance.md`）

### Deliverables

- 单 agent 可运行 monitor
- 页面可实时看到结构化事件
- 可停止运行中的任务

### Acceptance

- 启动一个 `codex` agent 后，页面有卡片和时间线
- 刷新页面后，最近事件能通过 `GET /api/events` 重新拉取
- Windows 下可正确结束 agent 进程

说明：
- `Phase 1C` 的页面验收只以 `codex` 路径为阻塞标准
- `Claude` 的 CLI 通讯链路已在 `Phase 0` 验证，但页面联调后置到 `codex` 多开稳定之后再执行

## Phase 2 - Multi-Agent and Chat Summary

- [x] 支持多个 agent 并行运行
- [x] 增加 agent 列表与卡片布局
- [x] 实现 `message.delta` 滑动窗口缓冲
- [x] 实现最小文本摘要策略
- [x] 引入 `.ai-pilot/monitor.json` 配置读取
- [x] 支持从配置文件加载默认 agents
- [x] 在 `codex` 多开稳定后恢复 `Claude` 页面联调与验收
- [x] 评估前端是否迁移为独立子应用

### Deliverables

- 多 agent 监控页
- 文本摘要进入 chat feed
- monitor 配置文件

### Acceptance

- 至少两个 agent 可同时运行
- chat feed 中既有结构化事件也有文本摘要
- 配置变更后无需改代码即可新增 agent 定义

当前进展：
- `codex` 双 run 并发与多卡片布局已通过 headless 浏览器验收
- `summary.updated` 已通过 headless 浏览器验收并进入 `Chat Feed`
- `.ai-pilot/monitor.json` 已可在服务启动时自动加载默认 agents
- `Claude` 页面联调已通过 headless 浏览器验收，当前失败原因来自外部认证状态，不阻塞 monitor 通讯闭环
- 前端迁移评估已完成，结论为应迁移为独立前端子应用；详见 `monitor/docs/frontend-migration-assessment.md`

## Phase 3 - Stability

- [x] 实现健康检查
- [x] 实现自动重启与指数退避
- [x] 实现 agent 崩溃隔离
- [x] 实现前端 WebSocket 自动重连
- [x] 实现基于 `ts` 的事件补发
- [x] 引入 `ProcessSupervisor` 统一调度健康检查与恢复逻辑
- [x] 增加异常与恢复日志

### Deliverables

- 稳定性增强版 monitor
- 故障恢复与补发链路

### Acceptance

- 单个 agent 崩溃不影响其他 agent
- 断开 WebSocket 后前端可自动恢复
- 连续失败达到阈值后停止重启并显示错误

当前进展：
- 前端 WebSocket 自动重连已通过 headless 浏览器验收
- 基于 `ts` 的事件补发已通过 headless 浏览器验收
- `ProcessSupervisor` 已通过本地 harness 验收
- 健康检查、自动重启/退避、崩溃隔离与恢复日志已落地
- 结果记录见 `monitor/docs/phase3-reconnect-acceptance-result.md`
- 结果记录见 `monitor/docs/phase3-supervisor-acceptance-result.md`

## Phase 4 - Extended Capabilities

- [ ] 评估并接入持久化存储
- [ ] 增加历史回放
- [ ] 增加 `xterm.js` 终端嵌入能力
- [ ] 增加成本统计事件
- [ ] 增加多仓 / `git worktree` 隔离
- [ ] 评估轻量 LLM 摘要

## Cross-Cutting Tasks

- [ ] 为 adapter 解析补充测试夹具
- [ ] 为 runner 生命周期补充单元测试
- [ ] 为环形缓冲区补充边界测试
- [ ] 记录依赖边界与升级策略
- [x] 执行 monitor 前端模块化迁移（保留 `public/index.html` 壳页面，迁出 `frontend/` 模块）
- [ ] 在 `ai-forum` 持续同步阶段进展

## Open Questions

- [ ] monitor 子模块最终是单独发布还是随主仓构建
- [x] Phase 1 直接引入 `ws`
- [x] Phase 2 前端是否从 spike 迁移为独立应用（结论：是）
