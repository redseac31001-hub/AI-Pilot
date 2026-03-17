# Claude Sample Notes

## Sample

- Sample file: `sample-2026-03-16T09-34-52-619Z.jsonl`
- Version: `2.1.76 (Claude Code)`
- Exit code: `1`
- Prompt: `Reply with the single word OK.`

## Important Observation

当前环境中的 Claude CLI 未登录。

样本返回：

- `assistant.error = "authentication_failed"`
- 文本结果：`Not logged in · Please run /login`

因此这是一份**认证失败样本**，不是正常任务执行样本。但它已经证明：

- `stream-json` 通讯链路可建立
- 初始化事件、错误事件和终态事件都可被 monitor 采集

## Stream JSON Requirement

在 `2.1.76` 版本中，`--print` 搭配 `--output-format stream-json` 时必须显式带上 `--verbose`，否则 CLI 直接报错，不会输出事件流。

## Observed Event Types

- `system` (`subtype = "init"`)
- `assistant`
- `result`

## Key Fields

### `system:init`

- `cwd`
- `session_id`
- `tools`
- `model`
- `permissionMode`
- `claude_code_version`

用途：
- 初始化上下文
- 能拿到 session 级信息与 CLI 版本

### `assistant`

- `message.content[]`
- `error = "authentication_failed"`

用途：
- 即使失败，也会通过 assistant message 暴露错误文本

### `result`

- `is_error = true`
- `duration_ms`
- `result`
- `usage`
- `total_cost_usd`

用途：
- 任务终态事件
- usage / total_cost_usd 说明 Claude 的流式结果天生更接近成本统计模型

## Current Mapping Confidence

- `system:init` -> `run.started`: medium
- `assistant(error)` -> `run.error`: high
- `result(is_error=true)` -> `run.finished(result=failed)`: high

## Scope Boundary

当前样本尚未覆盖：

- 正常 `message.delta`
- 工具调用事件
- 成功完成时的完整阶段信号

这些属于后续可选补样本范围，不阻塞当前阶段继续推进 monitor 实现。
