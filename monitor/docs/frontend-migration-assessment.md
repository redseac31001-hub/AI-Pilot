# Frontend Migration Assessment

> Date: 2026-03-17
> Scope: `monitor/public/index.html`
> Decision: migrate to a standalone frontend sub-app

## Conclusion

`Phase 2` 评估结论为：应正式将 `monitor/public/index.html` 从单文件 spike 迁移为独立前端子应用。

当前不建议直接引入大型框架。当前工作区已完成第一步原生模块化拆分：保留 `public/index.html` 作为壳页面，并将客户端逻辑迁移到 `frontend/` 目录。

## Evidence

- `monitor/public/index.html` 已达到 `953` 行，明显超出项目在 [`monitor/README.md`](../README.md) 中定义的单页迁移阈值。
- 该文件同时承担状态存储、HTTP 调用、WebSocket 生命周期、事件归并、卡片渲染、Feed 渲染、run 创建与 stop 操作等职责。
- 当前页面已经形成多个稳定 UI 领域：顶部统计、运行控制、板块统计、agent 卡片、chat feed。
- `Phase 2` 已引入多 agent、摘要、配置驱动默认 agents 和 `Claude/Codex` 分支；继续把这些逻辑堆在单页脚本里，会放大 `Phase 3` 稳定性改动成本。

## Recommended Target Structure

```text
monitor/
  public/
    index.html
  frontend/
    app.js
    state/
      store.js
    api/
      client.js
    ws/
      socket.js
    components/
      hero-stats.js
      run-controls.js
      board-stats.js
      agent-board.js
      chat-feed.js
    render/
      render-app.js
```

## Migration Rules

- `public/index.html` 只保留容器节点、基础样式入口和脚本引用。
- 先做原生 ES modules 拆分，不在这一轮引入新的前端框架。
- 优先拆出 `state`、`api`、`ws` 和 `render` 边界，再逐步组件化。
- 迁移期间保持现有 HTTP/WS 协议不变，避免前后端同时重构。

## Execution Status

- 已执行：`public/index.html` 壳化
- 已执行：`public/index.css` 外置
- 已执行：`frontend/` 模块目录落地
- 已执行：服务端静态资源路径扩展到 `/frontend/*`
- 结果记录：`monitor/docs/frontend-modularization-result.md`
