# Monitor Team Handoff

> Status: active
> Date: 2026-03-17
> Purpose: quickest entry point for reviewers and collaborators

## 1. What exists right now

仓库里当前同时存在两层内容:

1. 一个已经实现出来的 `monitor/` baseline
   - 目标: 托管式 multi-agent runtime monitor
   - 能力: HTTP / WS / card board / chat feed / summary / supervisor
2. 一组新冻结的纠偏文档
   - 目标: PowerShell 交互监听平台
   - 作用: 作为下一轮真正执行计划的 source of truth

不要把这两层混为一谈。

## 2. Read this first

建议阅读顺序:

1. [requirements](E:/mygit/AI-Pilot/monitor/docs/powershell-terminal-platform-requirements.md)
2. [detailed design](E:/mygit/AI-Pilot/monitor/docs/powershell-terminal-platform-detailed-design.md)
3. [prototype](E:/mygit/AI-Pilot/monitor/docs/powershell-terminal-platform-prototype.md)
4. [forum realignment thread](E:/mygit/AI-Pilot/ai-forum/threads/009-powershell-terminal-platform-realignment.md)
5. [legacy README note](E:/mygit/AI-Pilot/monitor/README.md)
6. [legacy TASKS note](E:/mygit/AI-Pilot/monitor/TASKS.md)

如果只给 10 分钟，先读前 4 项。

## 3. Current conclusion

当前已经冻结的结论只有这些:

1. 正确目标不是单纯的 agent monitor，而是 PowerShell 交互监听平台。
2. 第一轮原型以“平台托管 PowerShell 会话”为主。
3. “附着任意已打开 PowerShell 窗口”不进入第一轮主计划。
4. 现有 `monitor/` 代码不是废弃物，但只能视为底座和可复用资产。

## 4. What can be reused

从现有 `monitor/` 里可优先复用:

- `src/server/*`
- `src/core/ring-buffer.ts`
- `src/summary/*`
- `frontend/state/*`
- `frontend/components/*`

需要重构或替换的中心模块:

- `AgentRunner`
- `ProcessSupervisor`
- `AgentEvent`
- `AgentRunState`
- `adapters/*`

## 5. What is intentionally not done yet

以下内容刻意没有继续推进:

- 新的执行计划
- 新的任务清单
- `node-pty` 选型 spike
- `xterm.js` 终端面板接入

原因不是忽略，而是当前先冻结需求和设计，避免继续沿旧方向累积实现。

## 6. How to inspect the legacy baseline

如果团队成员想先看现有实现，可用:

```powershell
cd E:\mygit\AI-Pilot\monitor
npm install
npm run build
npm run start
```

然后打开:

```text
http://127.0.0.1:4317/
```

注意:

- 这是 legacy managed-monitor baseline
- 它不是新的最终产品定义

## 7. Next step after document approval

文档确认后，下一步应严格按下面顺序走:

1. 基于三份新文档重写执行计划
2. 生成新的任务清单
3. 先做 PTY / PowerShell session prototype
4. 再决定是否进入桥接现有 shell 的 spike

## 8. One-line summary

对团队成员最重要的一句话是:

> 代码已经有一个可运行的 monitor baseline，但下一轮真正要做的是 PowerShell session platform，所以先看新文档，再看旧实现。
