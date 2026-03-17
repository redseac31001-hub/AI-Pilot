# Event Samples

本目录用于存放 Phase 0 采样得到的真实 CLI 输出。

建议结构：

```text
monitor/docs/event-samples/
  codex/
    sample-01.jsonl
    notes.md
  claude/
    sample-01.jsonl
    notes.md
```

采样要求：

1. 保留原始输出，不做清洗
2. 单独记录命令行参数、运行时间和 CLI 版本号
3. 在 `notes.md` 中标出关键字段、阶段映射和未知字段
4. 如输出包含敏感信息，提交前做脱敏副本
