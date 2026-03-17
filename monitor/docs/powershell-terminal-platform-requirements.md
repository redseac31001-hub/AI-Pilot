# PowerShell Terminal Platform Requirements

> Status: draft
> Date: 2026-03-17
> Scope: requirement baseline before replanning

## 1. Background

当前 `monitor/` 已实现的是“托管式 agent runtime monitor”:

- 由平台启动 `codex` / `claude` 等 CLI 进程
- 平台接收结构化事件
- 页面展示状态卡片、事件流和摘要

这条链路本身可用，但它没有覆盖用户真正强调的目标:

- 平台需要与本地 PowerShell 通讯
- 平台需要支持交互式输入和输出监听
- 平台需要把终端会话而不是单纯 agent run 作为一等对象

本次文档的目标，是把需求从“多 agent 监控面板”纠偏为“PowerShell 交互监听平台”。

## 2. Problem Statement

### 2.1 当前偏差

此前方案把“多个终端”收敛成了“多个由 monitor 启动的 agent 进程”，导致下面三件事没有被当成核心约束:

1. 页面与本地 PowerShell 的双向交互
2. 终端原始输出的实时监听
3. 已有 shell 工作流与新平台之间的衔接方式

### 2.2 本次纠偏后的产品定义

新的目标产品不是“单纯的 agent dashboard”，而是:

> 一个面向本地 PowerShell 会话的 Web 平台，能够创建、管理、交互、监听多个终端会话，并在终端原始流之上叠加对 `codex`、`claude` 等工具的语义识别、进度归纳和聊天室汇总。

## 3. Goals

### 3.1 Must Have

1. 平台必须能够创建并托管本地 PowerShell 会话。
2. 平台必须支持浏览器向 PowerShell 会话发送输入。
3. 平台必须实时展示 PowerShell 原始输出。
4. 平台必须能同时管理多个会话，并在页面中区分显示。
5. 平台必须在原始输出之上识别 `codex` / `claude` 等工具的阶段性事件。
6. 平台必须在页面中提供一个统一的聊天/摘要区域，用于汇总多会话进展。
7. 平台必须支持停止会话、断线重连、基本健康状态显示。

### 3.2 Should Have

1. 支持对会话进行命名、加标签、绑定工作目录。
2. 支持记录最近一段终端转录和语义事件，供页面刷新后恢复。
3. 支持按会话维度导出最近事件和摘要。
4. 支持从配置文件预置默认会话模板。

### 3.3 Deferred

1. 直接附着到任意已经打开的 Windows Terminal / PowerShell 窗口。
2. 复杂的权限审批流。
3. 成本统计、持久化数据库、长周期历史回放。
4. 完整的多仓 `git worktree` 自动隔离。

## 4. Core Principles

1. 会话优先，不再把 run 当作唯一主对象。
2. 原始终端流和语义事件并存，不能只保留摘要。
3. 不展示虚假的百分比进度，只展示阶段和最近活动。
4. Windows 是主运行环境，所有关键路径以 Windows PowerShell / ConPTY 可行为前提。
5. 先支持“平台自己创建的会话”，再讨论“附着到既有窗口”。

## 5. Scope Definition

### 5.1 In Scope for the corrected product direction

- 托管 PowerShell 进程
- 浏览器终端交互
- 会话列表、状态卡片、会话详情、聊天室摘要
- 终端原始输出流
- `codex` / `claude` 的语义识别
- 多会话并发
- WebSocket 实时同步
- 基础断线重连与健康检查

### 5.2 Out of Scope for the first settled design

- 无侵入附着到任意现有窗口
- 远程主机终端
- SSH 网关
- IDE 插件联动
- LLM 二次高成本总结

## 6. User Scenarios

### Scenario A: 从页面新建一个 PowerShell 会话

1. 用户打开监控台页面。
2. 用户选择工作目录、shell 配置和显示名称。
3. 平台创建一个 PowerShell 会话并在页面打开终端面板。
4. 用户可以直接在页面里输入命令。
5. 页面同步显示原始输出、阶段事件和摘要。

### Scenario B: 在托管会话中运行 Codex

1. 用户在某个会话中输入 `codex ...`。
2. 平台继续展示完整终端输出。
3. 平台同时识别 `codex` 相关语义事件。
4. Agent Board 显示该会话当前处于 `planning`、`editing`、`testing` 等阶段。
5. Chat Feed 展示阶段总结，而不是只有 stdout 洪流。

### Scenario C: 同时观察多个会话

1. 用户同时创建 `codex-1`、`codex-2`、`claude-1` 三个会话。
2. 页面左侧看到会话卡片列表。
3. 中间看到当前选中会话的实时终端。
4. 右侧看到跨会话摘要和最近事件。

### Scenario D: 页面刷新或 WS 断开

1. 页面断线后自动重连。
2. 平台补发最近事件和转录片段。
3. 用户不丢失最近进度和摘要。

## 7. Functional Requirements

### FR-1 Session Lifecycle

- 平台必须支持创建、列出、聚焦、停止、销毁 PowerShell 会话。
- 每个会话必须有稳定的 `sessionId`。
- 每个会话必须记录 `cwd`、创建时间、最近活动时间、当前状态。

### FR-2 Bidirectional Terminal I/O

- 平台必须支持写入用户输入到会话。
- 平台必须支持显示会话输出。
- 平台必须支持终端尺寸变更。
- 平台必须支持中断和正常结束。

### FR-3 Real-Time Session Monitoring

- 平台必须把原始终端输出以流式方式推送到页面。
- 平台必须向页面推送结构化的状态事件。
- 平台必须允许用户查看会话当前是否在线、卡住、退出或崩溃。

### FR-4 Semantic Recognition Layer

- 平台必须在原始终端流之上运行识别器。
- 第一批识别器至少覆盖 `codex` 和 `claude`。
- 识别器输出必须是统一事件模型，不能让前端直接依赖不同 CLI 的原始格式。

### FR-5 Summary and Chat Feed

- 平台必须基于原始输出和语义事件生成轻量摘要。
- 摘要必须按会话区分来源。
- 摘要必须可以和原始事件一起展示。

### FR-6 Multi-Session UI

- 平台必须提供多会话卡片视图。
- 平台必须提供单会话详情终端视图。
- 平台必须提供跨会话聊天/摘要区域。

### FR-7 Recovery

- 平台必须支持 WebSocket 自动重连。
- 平台必须支持重连后的事件补发。
- 平台必须在会话异常退出时更新状态并记录错误。

### FR-8 Configuration

- 平台应支持配置默认会话模板。
- 平台应支持定义默认工作目录、环境变量白名单、会话标签。
- 配置文件路径在纠偏后建议改为 `.ai-pilot/terminal-monitor.json`，避免与旧的 agent monitor 语义混淆。

## 8. Non-Functional Requirements

### NFR-1 Windows Compatibility

- 首版必须以 Windows PowerShell / pwsh 为主测试环境。
- 关键设计不能依赖 Unix-only PTY 行为。

### NFR-2 Observability

- 必须能追踪会话创建、输入、输出、状态变化和错误。
- 页面和服务端都必须能区分“连接断开”和“会话已退出”。

### NFR-3 Safety

- 平台不能隐式接管用户现有的任意窗口。
- 平台必须清楚标记哪些会话是平台托管的。
- 平台必须限制默认暴露的环境变量和工作目录来源。

### NFR-4 Evolvability

- 设计必须允许后续加入 `node-pty + xterm.js` 终端嵌入、外部桥接模式、数据库持久化。
- 设计必须尽量复用现有 `monitor` 的事件流、HTTP、WS 和前端展示基础。

## 9. Requirement Clarifications

### 9.1 “本地 PowerShell 通讯” 的确定解释

本轮文档把“可通讯、可交互、可监听”定义为:

- 浏览器与平台托管的本地 PowerShell 会话之间双向通信
- 平台持续监听这些会话的输入输出
- 平台对会话输出进行原始展示和语义加工

### 9.2 对“现有 PowerShell 窗口”的处理口径

当前不把“无侵入附着到任意已经打开的 PowerShell 窗口”设为首版必须项，原因是:

1. Windows 下缺少稳定、低成本、低风险的通用附着方案
2. 该能力会显著放大权限、会话归属和编码兼容问题
3. 它不应该阻塞平台核心能力落地

如后续确有需要，优先考虑“桥接接入”而不是“OS 级强行附着”:

- 桥接接入: 用户在现有 PowerShell 中显式执行一个接入脚本，让当前 shell 主动注册到平台
- 非目标方案: 平台从外部直接劫持任意现有窗口

### 9.3 Claude 认证状态

平台只需要保证与 `claude` 会话的通讯链路和事件识别成立，不负责保证用户本机是否已登录。

## 10. Acceptance Baseline for the documentation phase

在重新制定执行计划之前，以下结论应视为已冻结:

1. 新目标是“PowerShell 交互监听平台”，不是单纯的 agent runner monitor。
2. 首个原型以“平台托管 PowerShell 会话”为边界。
3. “附着到任意已打开窗口”暂不进入第一轮执行计划。
4. 现有 `monitor/` 代码只作为底座和可复用资产，不再直接代表最终产品定义。
