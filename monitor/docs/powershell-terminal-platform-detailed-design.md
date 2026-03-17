# PowerShell Terminal Platform Detailed Design

> Status: draft
> Date: 2026-03-17
> Depends on: `monitor/docs/powershell-terminal-platform-requirements.md`

## 1. Design Target

目标是把当前 `monitor/` 从“托管式 agent runtime monitor”演进为“PowerShell 交互监听平台”。

新的中心对象从 `run` 变为 `terminal session`:

- 一个 session 对应一个本地 PowerShell / pwsh 进程和它的 PTY
- `codex` / `claude` 只是运行在 session 里的工具
- 语义事件来自 session 输出识别，而不是只来自平台直接启动的 CLI

## 2. High-Level Architecture

```text
Browser UI
  |- Session Board
  |- Terminal Pane
  |- Chat Feed / Summary Feed
  |- Inspector
        |
        v
HTTP + WebSocket Gateway
        |
        v
Terminal Session Manager
  |- PTY Bridge (ConPTY / node-pty)
  |- Session State Store
  |- Transcript Buffer
  |- Semantic Recognizers
  |- Summary Aggregator
        |
        v
Local PowerShell Sessions
  |- powershell.exe / pwsh.exe
  |- codex
  |- claude
  |- other local CLI tools
```

## 3. Design Decisions

### 3.1 Session-first model

- 主键从 `runId` 扩展为 `sessionId`
- 一个 session 生命周期内可以有多次命令执行
- 语义事件需要标识“属于哪个 session”和“是否属于某次工具运行”

### 3.2 原始流和语义流双轨并行

平台不再只保留结构化事件，而是同时维护:

1. `terminal.raw` 流
2. `session.semantic` 流
3. `summary.updated` 流

### 3.3 平台托管优先

首版采用平台创建的 PTY 会话:

- 最稳定
- 最容易做输入输出双向桥接
- 最容易标识归属关系和权限边界

### 3.4 外部会话接入采用桥接，不做强附着

后续如需接现有 PowerShell，设计上优先考虑桥接协议:

- 由现有 shell 显式执行接入脚本
- 脚本通过本地 socket / named pipe / WebSocket 把流量注册到平台

不规划“平台从外部直接接管已打开窗口”的通用能力。

## 4. Proposed Module Layout

```text
monitor/
  docs/
    powershell-terminal-platform-requirements.md
    powershell-terminal-platform-detailed-design.md
    powershell-terminal-platform-prototype.md
  frontend/
    app.js
    api/
    state/
    ws/
    components/
    terminal/
      terminal-pane.js
      terminal-transport.js
  public/
    index.html
    index.css
  src/
    index.ts
    core/
      session-event.ts
      session-state.ts
      transcript-buffer.ts
    sessions/
      terminal-session-manager.ts
      terminal-session.ts
      pty-bridge.ts
      shell-profile.ts
    recognizers/
      base.ts
      codex.ts
      claude.ts
    summary/
      summary-aggregator.ts
    server/
      http-server.ts
      ws-server.ts
    config/
      terminal-monitor-config.ts
```

## 5. Reuse Strategy from the current implementation

### 5.1 Reuse directly

- `src/server/http-server.ts`: 保留 HTTP 路由组织方式
- `src/server/ws-server.ts`: 保留 WS 广播和 snapshot 思路
- `src/core/ring-buffer.ts`: 继续用于事件补发
- `src/summary/message-summary-aggregator.ts`: 改造成 session 维度
- `frontend/components/*`: 复用卡片和 feed 展示基础
- `frontend/state/store.js`: 保留集中状态管理模式

### 5.2 Replace or refactor

- `AgentRunner` -> `TerminalSessionManager`
- `ProcessSupervisor` -> `SessionSupervisor`
- `AgentEvent` -> `SessionEvent`
- `AgentRunState` -> `TerminalSessionState`
- `adapters/` -> `recognizers/`

### 5.3 Keep as legacy reference only

- 直接基于 `codex exec --json` 创建 run 的路径
- `.ai-pilot/monitor.json` 的 agent schema

## 6. Core Runtime Model

### 6.1 TerminalSessionState

```ts
type TerminalSessionState = {
  sessionId: string;
  name: string;
  shell: 'powershell' | 'pwsh';
  cwd: string;
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'failed';
  healthStatus: 'alive' | 'idle' | 'unresponsive' | 'crashed';
  pid?: number;
  cols: number;
  rows: number;
  createdAt: number;
  lastEventAt: number;
  lastRawPreview?: string;
  lastSummary?: string;
  activeTool?: {
    tool: 'codex' | 'claude' | 'unknown';
    stage?: 'planning' | 'executing' | 'editing' | 'testing' | 'waiting' | 'done' | 'error';
    startedAt: number;
  };
};
```

### 6.2 SessionEvent

```ts
type SessionEvent =
  | { type: 'session.started'; sessionId: string; ts: number }
  | { type: 'session.input'; sessionId: string; text: string; ts: number }
  | { type: 'terminal.raw'; sessionId: string; chunk: string; stream: 'stdout' | 'stderr'; ts: number }
  | { type: 'session.stage'; sessionId: string; stage: 'idle' | 'active' | 'waiting' | 'done' | 'error'; ts: number }
  | { type: 'tool.detected'; sessionId: string; tool: 'codex' | 'claude' | 'unknown'; ts: number }
  | { type: 'tool.stage'; sessionId: string; tool: 'codex' | 'claude'; stage: 'planning' | 'executing' | 'editing' | 'testing' | 'waiting' | 'done' | 'error'; ts: number }
  | { type: 'summary.updated'; sessionId: string; text: string; ts: number }
  | { type: 'session.notice'; sessionId: string; level: 'info' | 'warn'; text: string; ts: number }
  | { type: 'session.error'; sessionId: string; error: string; recoverable: boolean; ts: number }
  | { type: 'session.stopped'; sessionId: string; reason: 'user' | 'process-exit' | 'crash'; ts: number };
```

### 6.3 Transcript buffer

每个 session 维护两类缓存:

1. 原始终端 chunk 环形缓冲
2. 结构化事件环形缓冲

默认建议:

- 原始 chunk: 最近 2 MB 或最近 2,000 条
- 结构化事件: 最近 2,000 条

## 7. PTY Bridge Design

### 7.1 Runtime choice

Windows 主路径建议使用 `node-pty`:

- 底层可走 ConPTY
- 能提供标准 PTY 读写与 resize
- 后续接入 `xterm.js` 也更顺滑

### 7.2 PTY Bridge responsibilities

- 启动 PowerShell / pwsh
- 维护 PTY 输入输出
- 处理终端 resize
- 把退出事件上报给 Session Manager
- 规范换行、编码和退格控制字符处理策略

### 7.3 Shell startup profile

首版建议限制为:

- `powershell.exe -NoLogo`
- 或 `pwsh -NoLogo`

不在首版自动加载复杂 profile 注入逻辑，以避免污染现有开发环境。

## 8. Recognizer Layer

识别器不拥有进程，只消费终端输出。

### 8.1 Base interface

```ts
interface SessionRecognizer {
  id: string;
  match(sessionState: TerminalSessionState, chunk: string): boolean;
  consume(sessionState: TerminalSessionState, chunk: string): SessionEvent[];
}
```

### 8.2 Codex recognizer

输入来源:

- 终端原始输出
- 可选的显式命令输入记录

输出:

- `tool.detected`
- `tool.stage`
- `summary.updated`

### 8.3 Claude recognizer

原则同上。平台只负责识别通讯和会话状态，不把 CLI 登录状态视为平台 blocker。

## 9. Summary Aggregation

摘要生成分两层:

1. 低成本规则摘要
2. 可选 LLM 摘要

当前文档冻结的首版只包含规则摘要:

- 阶段切换时生成摘要
- 原始输出累计超过阈值时生成摘要
- 会话结束时生成最终总结

## 10. Server API

### 10.1 HTTP

- `GET /api/health`
- `GET /api/sessions`
- `POST /api/sessions`
- `POST /api/sessions/:sessionId/input`
- `POST /api/sessions/:sessionId/resize`
- `POST /api/sessions/:sessionId/interrupt`
- `POST /api/sessions/:sessionId/stop`
- `GET /api/sessions/:sessionId/transcript?since=<cursor>`
- `GET /api/events?since=<ts>`

### 10.2 WebSocket outbound messages

- `snapshot`
- `session.event`
- `session.state`
- `session.transcript`

### 10.3 WebSocket inbound messages

首版可以先不支持浏览器直接通过 WS 写入，仍以 HTTP 为主:

- 简化权限和序列控制
- 降低首轮调试成本

后续如有性能压力再补 `session.input` WS 入站协议。

## 11. Frontend Design

### 11.1 Layout

```text
+----------------------+---------------------------+----------------------+
| Session Board        | Terminal Pane             | Chat Feed            |
| - session cards      | - raw terminal stream     | - summaries          |
| - status             | - input box / xterm pane  | - semantic events    |
| - stage              | - current cwd / shell     | - cross-session feed |
+----------------------+---------------------------+----------------------+
```

### 11.2 Page behavior

- 左侧会话卡片支持切换当前焦点 session
- 中间展示当前 session 的原始终端
- 右侧展示跨 session 的语义事件和摘要
- 页头展示服务健康、在线 session 数、最近错误

### 11.3 Progressive delivery

UI 递进建议:

1. 先做可滚动原始文本面板
2. 再替换为 `xterm.js`
3. 再增加多面板或分屏能力

## 12. Config Design

新的配置文件建议:

- `.ai-pilot/terminal-monitor.json`

建议结构:

```json
{
  "workspaceRoot": "E:/mygit/AI-Pilot",
  "defaultShell": "powershell",
  "sessions": [
    {
      "id": "codex-1",
      "name": "Codex Session 1",
      "cwd": ".",
      "autoStart": false,
      "tags": ["codex"]
    }
  ]
}
```

## 13. Failure Model

### 13.1 Session failure

- shell 进程退出
- PTY 初始化失败
- 写入失败
- 输出流卡死

### 13.2 UI failure

- WS 断开
- snapshot 过旧
- transcript 光标错位

### 13.3 Recognition failure

- 输出格式变化
- ANSI 控制符导致解析错误
- 工具输出和用户输入交错

处理原则:

- 原始流优先保真
- 识别失败不能影响终端显示
- 语义层失败时退化到仅原始终端模式

## 14. Security and Boundary

1. 只托管本机显式创建的 session。
2. 默认不读取任意外部窗口内容。
3. 不在首版默认继承全部环境变量。
4. 不自动执行高权限 PowerShell。
5. 所有 session 都必须标记来源:
   - `managed`
   - `bridged`（未来）

## 15. Open Risks

1. `node-pty` 在 Windows 上的安装和兼容性需要单独验证。
2. `xterm.js` 引入后前端复杂度会明显上升。
3. `codex` / `claude` 的语义识别如果只依赖 raw text，鲁棒性会低于直接结构化输出。
4. 如要兼容“桥接接入现有 shell”，还需要额外定义本地桥接协议。

## 16. Design Exit Criteria

在重新写执行计划前，以下设计结论应视为固定:

1. 新实现的第一主线是 `PTY session bridge`，不是 `agent runner`。
2. 会话、原始终端、语义事件、摘要是四个并行视图，不允许再丢掉原始流。
3. 第一轮原型必须先证明“平台托管 PowerShell 会话 + 页面交互”。
4. `attach existing terminal window` 只保留为后续桥接议题，不进入第一轮开发主路径。
