# Codex Sample Notes

## Sample

- Sample file: `sample-2026-03-16T09-33-37-669Z.jsonl`
- Version: `codex-cli 0.114.0`
- Exit code: `0`
- Prompt: `Reply with the single word OK.`

## Observed Event Types

- `thread.started`
- `turn.started`
- `item.completed`
- `turn.completed`

## Key Fields

### `thread.started`

- `thread_id`

用途：
- 可映射为 monitor 内部的 `runId` 或上游线程标识

### `turn.started`

当前样本仅确认该事件表示一次 turn 开始，尚无法区分它对应 `planning` 还是 `executing`。

### `item.completed`

样本中出现：

- `item.type = "agent_message"`
- `item.text = "OK"`

用途：
- 可映射为最终文本输出
- 若未来样本包含工具调用，需继续观察 `item.type` 的其他取值

### `turn.completed`

- `usage.input_tokens`
- `usage.cached_input_tokens`
- `usage.output_tokens`

用途：
- 说明 Codex 在 turn 结束时可提供 usage 信息
- 后续若实现成本统计，可基于该事件派生 Phase 4 的 `cost.updated`

## Current Mapping Confidence

- `thread.started` -> `run.started`: high
- `turn.started` -> `run.stage`: medium
- `item.completed(agent_message)` -> `message.delta` 或最终消息聚合: medium
- `turn.completed` -> `run.finished`: high

## Gaps

- 当前样本没有工具调用
- 当前样本没有中间阶段信号
- 当前样本不足以确认 `planning` / `editing` / `testing` 的精确映射

下一步需要采样一个会触发工具使用的 prompt
