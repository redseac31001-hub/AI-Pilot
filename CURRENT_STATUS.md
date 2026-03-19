# Current Status

> Updated: 2026-03-17
> Audience: team members, reviewers, AI collaborators

## Read This First

如果你刚进入这个仓库，请先读下面这些文件，不要直接从代码开始：

1. [monitor/docs/team-handoff.md](E:/mygit/AI-Pilot/monitor/docs/team-handoff.md)
2. [monitor/docs/powershell-terminal-platform-requirements.md](E:/mygit/AI-Pilot/monitor/docs/powershell-terminal-platform-requirements.md)
3. [monitor/docs/powershell-terminal-platform-detailed-design.md](E:/mygit/AI-Pilot/monitor/docs/powershell-terminal-platform-detailed-design.md)
4. [monitor/docs/powershell-terminal-platform-prototype.md](E:/mygit/AI-Pilot/monitor/docs/powershell-terminal-platform-prototype.md)
5. [ai-forum/threads/009-powershell-terminal-platform-realignment.md](E:/mygit/AI-Pilot/ai-forum/threads/009-powershell-terminal-platform-realignment.md)
6. [monitor/docs/doc-freeze-checklist.md](E:/mygit/AI-Pilot/monitor/docs/doc-freeze-checklist.md)

## Current Product Position

当前仓库里同时存在两层内容：

1. 已实现的 `monitor/` baseline
   - 这是一个可运行的 legacy managed-monitor
   - 它能托管 agent、展示卡片、事件流和摘要
2. 新冻结的 PowerShell terminal platform 文档
   - 这是下一轮真正的 source of truth
   - 后续计划和任务必须基于这组文档重写

## What Is Frozen

当前已经收敛的结论：

1. 正确目标是 PowerShell 交互监听平台，不是单纯的 agent monitor。
2. 第一轮原型只做“平台托管的 PowerShell 会话”。
3. “附着任意已打开 PowerShell 窗口”不进入第一轮主计划。
4. 现有 `monitor/` 代码只作为可复用底座，不直接代表最终产品定义。

## What To Do Next

如果你是团队成员：

1. 先读上面的 5 份文档
2. 再完成 [doc-freeze-checklist](E:/mygit/AI-Pilot/monitor/docs/doc-freeze-checklist.md)
3. 再看 [monitor/README.md](E:/mygit/AI-Pilot/monitor/README.md) 和 [monitor/TASKS.md](E:/mygit/AI-Pilot/monitor/TASKS.md)
4. 最后再进入 `monitor/src` 和 `monitor/frontend`

如果你是执行者：

1. 不要继续沿旧 `TASKS.md` 扩展功能
2. 先确认 requirements / design / prototype
3. 确认后再重新生成新的计划和任务清单

## One-Line Summary

> 先看新文档，再看旧实现；下一轮要做的是 PowerShell session platform，而不是继续扩写 legacy managed-monitor。
