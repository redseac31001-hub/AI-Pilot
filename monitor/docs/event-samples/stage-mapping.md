# Stage Mapping

本文件用于记录 Phase 0 中从原始 CLI 事件到统一 `AgentStage` 的映射规则。

## Codex

| 原始事件 | 关键字段 | 统一事件/阶段 | 置信度 | 备注 |
|---|---|---|---|---|
| `thread.started` | `thread_id` | `run.started` | high | 可直接作为一次运行开始 |
| `turn.started` | - | `run.stage = planning` 或 `executing` | medium | 当前样本不足以精确判断，需更多样本 |
| `item.completed` | `item.type = agent_message` | `message.delta` 或最终消息聚合 | medium | 当前只看到纯文本输出 |
| `turn.completed` | `usage.*` | `run.finished` | high | turn 结束信号清晰 |

当前结论：

- Codex 已确认可稳定输出 JSONL 事件
- 当前样本能支撑最小 `run.started -> message -> run.finished` 流程
- 工具调用与中间阶段仍需补样本

## Claude

| 原始事件 | 关键字段 | 统一事件/阶段 | 置信度 | 备注 |
|---|---|---|---|---|
| `system` (`subtype = init`) | `session_id`, `cwd`, `model` | `run.started` | medium | 更偏初始化上下文 |
| `assistant` | `message.content`, `error` | `run.error` | high | 当前样本为认证失败 |
| `result` | `is_error`, `result`, `usage`, `total_cost_usd` | `run.finished` | high | 终态信号明确 |

当前结论：

- Claude 的 `stream-json` 要求 `--verbose`
- 当前已确认初始化、错误和终态事件可被采集
- 成功执行路径上的阶段映射仍可在后续样本中补强，但不阻塞当前推进

## Unknown Field Handling

统一策略：

1. adapter 解析时对未知字段保持宽松，默认忽略，不抛异常
2. 原始事件行必须保留在采样文件中，便于回溯与重放
3. 若出现未知 `type`，先记录到 adapter debug 日志，再映射为“未识别事件”，不影响主流程
4. 只有在未知字段会破坏基础契约时，才升级为 `run.error`
