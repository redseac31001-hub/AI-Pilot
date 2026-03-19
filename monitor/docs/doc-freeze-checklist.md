# Document Freeze Checklist

> Status: draft
> Date: 2026-03-19
> Purpose: align reviewers before generating the next execution plan

## 1. Review Order

请按下面顺序完成阅读和确认：

1. [CURRENT_STATUS.md](E:/mygit/AI-Pilot/CURRENT_STATUS.md)
2. [team-handoff](E:/mygit/AI-Pilot/monitor/docs/team-handoff.md)
3. [requirements](E:/mygit/AI-Pilot/monitor/docs/powershell-terminal-platform-requirements.md)
4. [detailed design](E:/mygit/AI-Pilot/monitor/docs/powershell-terminal-platform-detailed-design.md)
5. [prototype](E:/mygit/AI-Pilot/monitor/docs/powershell-terminal-platform-prototype.md)
6. [forum thread 009](E:/mygit/AI-Pilot/ai-forum/threads/009-powershell-terminal-platform-realignment.md)

## 2. Freeze Decisions

下面这些点需要逐项确认；只有全部确认，才进入新的计划和任务阶段。

### Product Direction

- [ ] 确认目标产品是 “PowerShell 交互监听平台”
- [ ] 确认现有 `monitor/` 只作为 legacy baseline 和可复用底座

### Prototype Boundary

- [ ] 确认第一轮原型以 “平台托管 PowerShell 会话” 为主
- [ ] 确认第一轮不做 “强附着任意已打开 PowerShell 窗口”
- [ ] 确认原始终端流必须保留，摘要只作为叠加层

### Architecture

- [ ] 确认主对象从 `agent/run` 切换到 `session/terminal`
- [ ] 确认后端主线从 `runner` 演进为 `PTY session bridge`
- [ ] 确认现有 HTTP / WS / ring buffer / feed / summary / board 可以继续复用

### Process

- [ ] 确认在这轮冻结完成前，不继续沿旧 `TASKS.md` 扩写功能
- [ ] 确认冻结完成后，再新建执行计划和任务清单

## 3. Open Questions To Resolve Explicitly

如果以下问题没有明确结论，默认视为未冻结：

1. 是否接受新的配置语义切换到 `session/terminal`
2. 是否需要在原型阶段就引入 `node-pty`
3. 是否要为后续 “bridged session” 预留单独协议入口
4. 是否要把 `xterm.js` 放进第一轮原型，还是延后到第二阶段

## 4. Approval Template

团队成员可以直接按下面格式回复：

```markdown
## Review Result

- [x] 同意当前需求边界
- [x] 同意当前详细设计主线
- [x] 同意当前原型边界
- [ ] 不同意 / 待补充项:
  - xxx

### Next
- 可以进入新的计划与任务清单
```

## 5. After Approval

冻结完成后，下一步顺序固定为：

1. 生成新的 execution plan
2. 生成新的 task list
3. 从 PTY / PowerShell session prototype 开始执行

## 6. One-Line Rule

> 文档未冻结前，不继续写新功能；文档冻结后，再重新规划和执行。
