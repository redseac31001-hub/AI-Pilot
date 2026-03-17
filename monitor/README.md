# Monitor v0.3.0 Design

> Status: draft
> Owner: GPT-5 Codex
> Reviewer: Claude-Opus-4.6

> Note (2026-03-17): this README describes the legacy managed-agent monitor baseline.
> The corrected product direction is now defined by:
> - `monitor/docs/powershell-terminal-platform-requirements.md`
> - `monitor/docs/powershell-terminal-platform-detailed-design.md`
> - `monitor/docs/powershell-terminal-platform-prototype.md`
> - `monitor/docs/team-handoff.md`
> Replanning and a new task list should happen only after those docs are reviewed and frozen.

## Purpose

`monitor/` 是 `AI-Pilot v0.3.0` 的独立子模块，用于托管多个 agent 进程，实时采集执行事件，并在页面中展示状态卡片与聊天室信息流。

该模块不监控操作系统层面的真实终端窗口，而是统一启动和管理 `codex`、`claude` 等 CLI 进程，并将结构化输出转换为统一事件模型。

## Scope

### In Scope

- 托管多个 agent 进程
- 接入 `codex` 与 `claude` 的结构化输出
- 实时状态卡片
- 最小 chat feed
- 文本增量摘要
- 健康检查、自动重启、进程树清理

### Out of Scope

- 直接监听现有终端窗口
- 首版持久化数据库
- 首版 `xterm.js` 终端嵌入
- 首版 LLM 二次摘要

## Key Decisions

1. 版本归属：monitor 纳入 `v0.3.0` 独立版本。
2. 模块边界：monitor 作为独立子模块，后续拥有独立运行时依赖与构建入口。
3. 事件来源：优先使用 CLI 结构化输出，不抓 TUI 文本。
4. 进度表达：只展示阶段状态，不展示虚假百分比。
5. 存储策略：Phase 1-3 使用内存缓冲区；持久化延后到 Phase 4。
6. 前端策略：Phase 1 使用单 HTML spike；Phase 2 开始评估是否迁移为独立子应用。

## Proposed Layout

```text
monitor/
  README.md
  TASKS.md
  docs/
    event-samples/
      README.md
      codex/
      claude/
  public/
    index.html                # shell page after modularization
    index.css
  frontend/
    app.js
    api/
    state/
    ws/
    components/
  src/
    index.ts                  # monitor entry
    core/
      agent-event.ts
      agent-state.ts
      ring-buffer.ts
    adapters/
      base.ts
      codex.ts
      claude.ts
    runners/
      agent-runner.ts
    server/
      http-server.ts
      ws-server.ts
    summary/
      chat-feed.ts
      delta-aggregator.ts
    config/
      schema.ts
```

`process-supervisor.ts` 不进入 Phase 1 目录骨架。该文件在 Phase 3 引入，用于健康检查、自动重启与恢复策略。

## Runtime Boundary

根目录当前保持 CLI PoC 的最小依赖策略。`monitor/` 作为独立子模块后，允许引入少量运行时依赖，但依赖范围应只覆盖 monitor 自身：

- `ws`: WebSocket 服务
- `tree-kill`: Windows 进程树清理
- 可选：轻量 HTTP 框架，若原生 `http` 成本过高

不应在首版引入：

- `better-sqlite3`
- 大型前端构建链
- 复杂状态管理库

## Architecture

### 1. Agent Adapter Layer

每类 CLI 一个 adapter，负责能力探测、进程启动参数和事件解析。接口风格对齐现有 [`src/core/interfaces.ts`](../src/core/interfaces.ts) 中的 `IDEAdapter` 设计。

```ts
export interface AgentAdapter {
  id: string;
  detect(): Promise<boolean>;
  buildCommand(task: AgentTask): AgentCommand;
  parseEvent(line: string, task: AgentTask): AgentEvent | null;
}
```

### 2. Runner Layer

`AgentRunner` 负责：

- 启动子进程
- 收集 stdout/stderr
- 调用 adapter 解析事件
- 发出运行态事件
- 维护 agent 生命周期

`ProcessSupervisor` 负责：

- 健康检查
- 自动重启
- Windows 进程树清理

### 3. Event Model

统一事件模型是前后端契约中心。

```ts
export type AgentEvent =
  | { type: 'run.started'; agentId: string; runId: string; ts: number }
  | { type: 'run.stage'; agentId: string; runId: string; stage: AgentStage; ts: number }
  | { type: 'run.notice'; agentId: string; runId: string; level: 'info' | 'warn'; text: string; ts: number }
  | { type: 'tool.started'; agentId: string; runId: string; command: string; ts: number }
  | { type: 'tool.finished'; agentId: string; runId: string; exitCode: number; ts: number }
  | { type: 'message.delta'; agentId: string; runId: string; text: string; ts: number }
  | { type: 'summary.updated'; agentId: string; runId: string; text: string; ts: number }
  | { type: 'run.error'; agentId: string; runId: string; error: string; recoverable: boolean; ts: number }
  | { type: 'agent.health'; agentId: string; runId: string; status: 'alive' | 'unresponsive' | 'crashed'; pid: number; ts: number }
  | { type: 'run.finished'; agentId: string; runId: string; result: 'success' | 'failed'; ts: number };

// Phase 4 reserve:
// | { type: 'cost.updated'; agentId: string; runId: string; inputTokens: number; outputTokens: number; ts: number }

export type AgentStage =
  | 'queued'
  | 'planning'
  | 'executing'
  | 'editing'
  | 'testing'
  | 'summarizing'
  | 'waiting'
  | 'done'
  | 'error';
```

解析策略必须宽松：未知字段忽略，避免 CLI 小版本变化导致 monitor 崩溃。

### 4. Buffering

Phase 1-3 使用内存环形缓冲区：

- 默认保留最近 `1000` 条事件
- 支持按时间戳拉取增量事件
- 进程退出时可选 dump 到 JSONL

### 5. Server Surface

首版服务接口保持小而稳：

- `GET /api/health`
- `GET /api/agents`
- `POST /api/runs`
- `POST /api/runs/batch`
- `POST /api/runs/:runId/stop`
- `GET /api/events?since=<ts>`
- `WS /ws`

说明：
- `POST /api/runs` 负责创建一次运行并启动 agent
- `POST /api/runs/batch` 负责一次性创建多条运行，供多 agent 并发启动使用
- `GET /api/events` 用于断线重连后的增量补发
- `WS /ws` 用于实时事件推送

### 6. UI Shape

Phase 1 前端为单 HTML spike，拆成两个主区域：

- `Agent Board`
  - agent 名称
  - 当前状态
  - 当前阶段
  - PID / 运行时长
  - 最近活动
- `Chat Feed`
  - `run.started`
  - `run.stage`
  - `tool.finished`
  - `run.finished`

迁移为独立子应用的触发条件：

1. `index.html` 超过 `500` 行
2. 需要 `3` 个以上可复用组件
3. 需要前端路由或状态管理

当前状态：

- `public/index.html` 已收缩为 `83` 行壳页面
- `frontend/` 模块目录已落地，当前负责状态、HTTP、WS、卡片、Feed 和运行控制
- `Phase 2` 的模块化迁移已执行完成
- 评估文档见 `monitor/docs/frontend-migration-assessment.md`
- 执行结果见 `monitor/docs/frontend-modularization-result.md`

### 7. Summary Strategy

Phase 1:

- 只透传结构化事件到 chat feed

Phase 2:

- 已支持批量启动多个 `codex` run 与多卡片板块布局
- 对 `message.delta` 启用滑动窗口摘要
- 已完成 `Claude` 页面联调验收；当前失败原因 `authentication_failed` 属于外部认证状态，不阻塞 monitor 通讯闭环
- 触发条件：
  - 累积超过 `500` 字符
  - 或距上次摘要超过 `5` 秒
- 当前已落地最小摘要策略：产出 `summary.updated` 并进入 `Chat Feed`

Phase 4:

- 才考虑轻量 LLM 二次摘要

## Config Direction

Phase 2 引入 `.ai-pilot/monitor.json`，用于描述可启动的 agents 和默认工作目录。

当前已支持：

- 服务启动时读取工作区根目录 `.ai-pilot/monitor.json`
- 对 `enabled !== false` 且 `autoStart !== false` 的 agents 自动启动
- `cwd` 相对工作区根目录解析；留空时默认使用工作区根目录
- 可通过环境变量 `MONITOR_WORKSPACE_ROOT` 显式指定工作区根目录

当前结构：

```json
{
  "agents": [
    {
      "id": "codex1",
      "adapter": "codex",
      "cwd": ".",
      "prompt": "Reply with the single word OK."
    },
    {
      "id": "claude1",
      "adapter": "claude",
      "cwd": ".",
      "prompt": "Reply with the single word OK.",
      "enabled": false,
      "supervisor": {
        "autoRestart": true,
        "maxRestartAttempts": 2,
        "restartBackoffMs": 500,
        "healthCheckIntervalMs": 1000,
        "unresponsiveThresholdMs": 8000
      }
    }
  ]
}
```

示例文件：

- `monitor/docs/monitor-config.example.json`

## Phase Plan

### Phase 0

- 采样真实 CLI 事件
- 固化样本与字段说明
- 输出阶段映射表

### Phase 1

- 单 agent 最小监控闭环
- 单卡片 + 最小 chat feed
- Windows 进程树清理纳入 stop 路径

说明：
- `Phase 1` 的页面验收以 `codex` 路径为准
- `Claude` 页面联调不作为 `Phase 1` blocker；其 CLI 通讯链路已在 `Phase 0` 验证
- `Claude` 页面操作与联调后置到 `codex` 多 agent 稳定之后执行

### Phase 2

- 多 agent
- 文本摘要
- 配置文件

### Phase 3

- 自动重启
- 断线重连
- Windows 进程树清理

当前状态：

- 已完成前端 WebSocket 自动重连
- 已完成基于 `ts` 的事件补发
- 已完成 `ProcessSupervisor`
- 已完成健康检查、自动重启/退避、崩溃隔离与恢复日志
- 验收结果见 `monitor/docs/phase3-reconnect-acceptance-result.md`
- 验收结果见 `monitor/docs/phase3-supervisor-acceptance-result.md`

### Phase 4

- 持久化
- 历史回放
- 终端嵌入
- 多仓隔离

## Testing Strategy

1. Adapter 解析测试：基于 Phase 0 保存的事件样本做 fixtures 测试。
2. Runner 生命周期测试：模拟进程启动、退出、异常。
3. Buffer 测试：验证事件上限、增量获取和 JSONL dump。
4. UI 手工验收：Phase 1 至少验证单 `codex` agent、页面事件流和停止任务；`Claude` 页面联调延后到 `codex` 多开稳定后。
5. Windows 手工验收：验证 `POST /api/runs/:runId/stop` 能正确结束进程树。

补充：

- `Claude` 页面联调已通过 headless 浏览器验收，结果记录在 `monitor/docs/phase2-claude-acceptance-result.md`
- 前端迁移评估已完成，结果记录在 `monitor/docs/frontend-migration-assessment.md`
- 前端模块化迁移已完成，结果记录在 `monitor/docs/frontend-modularization-result.md`
- `Phase 3` 首批稳定性链路已通过 headless 浏览器验收，结果记录在 `monitor/docs/phase3-reconnect-acceptance-result.md`
- `Phase 3` supervisor 稳定性链路已通过本地 harness 验收，结果记录在 `monitor/docs/phase3-supervisor-acceptance-result.md`

## Exit Criteria

Phase 1 完成的标准：

- 能启动一个 `codex` agent
- 能在页面看到状态卡片
- 能在 chat feed 看到结构化事件
- 页面刷新后可通过增量接口恢复最近事件
- Windows 下能正确结束进程树

补充：
- `Claude` 在 `Phase 1` 只要求保留 adapter 和 CLI 通讯能力，不要求完成页面联调闭环
