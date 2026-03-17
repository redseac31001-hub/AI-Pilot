# Phase 1C Manual Acceptance

> Scope: 浏览器手工验收
> Status: ready

## Goal

验证 Phase 1C 的最小用户闭环：

1. 页面可打开
2. 可以启动一条 `codex` run
3. Agent Card 会出现并更新状态
4. Chat Feed 会收到结构化事件
5. 可以停止运行中的 agent

## Preconditions

- 当前目录：`E:\mygit\AI-Pilot\monitor`
- Node.js 可用
- `monitor` 已构建
- 本机可启动 `codex`

决策说明：
- `Phase 1C` 当前只验证 `codex` 的页面闭环
- `Claude` 的 CLI 通讯链路已在 `Phase 0` 验证
- `Claude` 页面联调延后到 `codex` 多开稳定之后再执行，不作为当前 blocker

## Start Commands

在 `monitor/` 目录执行：

```powershell
npm run build
npm run start
```

预期输出：

```text
AI-Pilot monitor listening on http://127.0.0.1:4317
```

## Browser Flow

### Case 1: 页面基础渲染

1. 打开 `http://127.0.0.1:4317/`
2. 确认页面出现以下区域：
   - `AI-Pilot Monitor`
   - `Agent Board`
   - `Chat Feed`
   - `启动任务`

通过标准：

- 页面正常打开
- 没有空白页
- 没有明显脚本报错

### Case 2: 启动 Codex Run

1. `adapter` 选择 `codex`
2. Prompt 保持默认值：`Reply with the single word OK.`
3. 点击 `启动任务`

观察点：

- `Agent Board` 中出现一张新卡片
- 卡片中能看到：
  - `agentId`
  - `runId`
  - `status`
  - `stage`
- 页面顶部 `活跃运行` 有变化

通过标准：

- 成功出现新卡片
- 页面没有崩溃

### Case 3: 观察事件流

在启动 run 后观察 `Chat Feed`：

通过标准：

- 至少看到一条与该 run 相关的结构化事件
- 常见事件包括：
  - `run.started`
  - `run.error`
  - `run.finished`
  - `message.delta`

说明：

- 当前已知在短时集成验证里，`codex` 的中间 stdout 事件可能不稳定出现
- 如果只看到终态事件，也应记录到验收结果中，而不是直接判失败

### Case 4: 停止 Run

1. 在 Agent Card 中点击 `停止`

通过标准：

- 请求能成功返回
- 卡片状态发生变化
- `Chat Feed` 最终出现终态事件
- Windows 下不会留下明显悬挂的子进程

## Result Template

完成后按以下格式记录：

```markdown
## Phase 1C Manual Acceptance Result

- Date:
- Tester:
- Build command: `npm run build`
- Start command: `npm run start`

### Case 1
- Result: pass / fail
- Notes:

### Case 2
- Result: pass / fail
- Notes:

### Case 3
- Result: pass / fail
- Notes:

### Case 4
- Result: pass / fail
- Notes:

### Overall
- Overall result: pass / fail
- Follow-up: `Claude` 页面联调延后到 `codex` 多开稳定之后执行
```

也可以直接复制并填写：

- `monitor/docs/phase1c-manual-acceptance-result.template.md`

## Exit Rule

只有在以下条件全部满足时，才可在 `monitor/TASKS.md` 中勾掉：

- `public/index.html` 单页 spike
- 页面展示单卡片和最小 chat feed
- `codex` 单 agent 端到端手工验收

如果 Case 3 只收到终态事件而没有中间事件，不直接阻塞 Phase 2，但必须在记录中明确写出。
