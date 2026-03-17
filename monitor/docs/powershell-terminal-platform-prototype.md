# PowerShell Terminal Platform Prototype

> Status: draft
> Date: 2026-03-17
> Purpose: freeze the prototype boundary before a new execution plan

## 1. Prototype Goal

原型不是为了把全部终端平台一次做完，而是验证下面三个核心假设:

1. 页面可以稳定控制本地 PowerShell 会话
2. 页面可以实时看到终端原始输出并持续交互
3. 页面可以在原始流之上叠加 `codex` / `claude` 的阶段识别和摘要

如果这三个假设不能同时成立，后续再做复杂计划没有意义。

## 2. Prototype Boundary

### 2.1 Included in the prototype

1. 平台创建新的 PowerShell / pwsh 会话
2. 页面显示多会话卡片
3. 页面展示单个当前会话的原始终端流
4. 页面支持输入、回车、停止、resize
5. 平台识别 `codex` / `claude` 的基础语义事件
6. 页面展示跨会话 Chat Feed / Summary Feed
7. 页面断线后重连并补发最近事件

### 2.2 Explicitly excluded from the prototype

1. 无侵入附着到任意现有 PowerShell 窗口
2. 远程机器会话
3. 审批工作流
4. 数据库持久化
5. 成本统计
6. 复杂 `git worktree` 自动隔离

## 3. Prototype Modes

### Mode A: Managed session prototype

这是主原型，也是必须完成的模式。

定义:

- 平台自己创建 PowerShell 会话
- 浏览器通过平台与该会话通信
- 平台拥有完整的生命周期控制

### Mode B: Bridged session spike

这是后续可选探索，不应阻塞主原型。

定义:

- 用户在现有 shell 中手动执行接入脚本
- 当前 shell 主动向平台注册
- 平台把它视为 `bridged` session

注意:

- 这不是对任意现有窗口的强附着
- 只是“显式接入”

## 4. Prototype Information Architecture

```text
Top Bar
  |- service health
  |- session count
  |- reconnect status

Left: Session Board
  |- session name
  |- shell type
  |- health
  |- active tool / stage
  |- last summary

Center: Terminal Pane
  |- raw terminal output
  |- input box or xterm surface
  |- cwd / shell info

Right: Chat Feed
  |- session summaries
  |- tool stage changes
  |- warnings / errors
```

## 5. Low-Fidelity Wireframe

```text
+----------------------------------------------------------------------------------+
| AI-Pilot Terminal Monitor                                      online | 3 active |
+-------------------------+--------------------------------------+-----------------+
| Sessions                | Terminal                             | Chat Feed       |
|                         |                                      |                 |
| [codex-1] running       | PS E:\\mygit\\AI-Pilot> codex ...    | codex-1: 正在规划 |
| [codex-2] waiting       | ... raw output ...                   | codex-2: 等待输入 |
| [claude-1] error        | ... raw output ...                   | claude-1: 认证失败|
|                         |                                      |                 |
| + New Session           | [input............................................]    |
+-------------------------+--------------------------------------+-----------------+
```

## 6. Primary User Flows

### Flow 1: Create and use a PowerShell session

1. 用户点击 `New Session`
2. 输入名称、工作目录、shell 类型
3. 页面创建 session card
4. 中间终端区域切到新会话
5. 用户在输入区发送命令
6. 页面实时显示输出

### Flow 2: Run Codex inside a managed session

1. 用户在会话中输入 `codex`
2. 平台继续显示原始终端输出
3. Recognizer 产出 `tool.detected` 和 `tool.stage`
4. Chat Feed 生成阶段摘要
5. 会话卡片显示最近总结

### Flow 3: Recover from page refresh

1. 页面刷新
2. 重新请求 snapshot
3. 重新拉取最近 transcript 和 events
4. 当前聚焦会话恢复显示

## 7. Prototype Technical Strategy

### 7.1 Backend

- 以现有 `monitor/src/server/*` 为基础改造
- 引入 PTY bridge
- 新建 session manager
- 保留 ring buffer 和 WS snapshot / replay 思路

### 7.2 Frontend

- 继续复用现有 modularized frontend
- 增加 Terminal Pane 模块
- 首轮允许先用纯文本滚动容器
- 若原型阶段验证成功，再切 `xterm.js`

### 7.3 Semantic layer

- 先做轻量规则识别
- 不把高成本 LLM 摘要放进原型主路径

## 8. Prototype Acceptance

原型通过的最低标准:

1. 能同时创建至少 3 个本地 PowerShell 会话
2. 页面可对任一会话发送输入
3. 页面能看到持续输出，不是假状态
4. 页面能区分不同会话的最近状态和摘要
5. 运行 `codex` 时，页面能看到基础阶段变化
6. WS 断开后页面能恢复最近状态

## 9. Prototype Risks and Fallbacks

### Risk A: `node-pty` 安装或 Windows 兼容性不稳定

Fallback:

- 先用最小桥接脚本验证 shell 输入输出链路
- 暂缓 `xterm.js`

### Risk B: 原始终端流里 ANSI / 控制字符过多

Fallback:

- 原型阶段先做文本清洗和安全裁剪
- 暂不追求完全等同本地终端体验

### Risk C: `codex` / `claude` 识别不稳定

Fallback:

- 把原始流作为真实来源
- 语义识别失败时只降级摘要，不影响交互

## 10. What the prototype is not trying to prove

原型不负责证明:

1. 能强附着任意现有 PowerShell 窗口
2. 能长期存档所有会话
3. 能解决所有多仓冲突
4. 能兼容所有 shell 配置和 profile

## 11. Freeze Decision for the next planning round

重新制定计划和任务前，原型文档冻结以下决策:

1. 原型首先证明“托管 PowerShell 会话”。
2. 桥接现有 shell 只能作为后续 spike，不进入第一轮主任务。
3. UI 必须同时包含 Session Board、Terminal Pane、Chat Feed 三块。
4. 原始终端流必须保留，摘要只能作为叠加层。
