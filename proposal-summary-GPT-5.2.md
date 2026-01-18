# 方案总结（模型：GPT-5.2）
日期：2026-01-17

## 项目定义（一句话）
打造一套**规范驱动（SDD）的团队 AI 辅助研发环境发行版**：以 **OpenSpec 作为唯一真理源**统一需求/契约/验收标准；以 **MCP 作为上下文与能力总线**连接 repo/构建/测试/CI/（可选）后端与数据；以 **Pack+CLI+IDE 适配**实现 Vue2/Vue3 混合栈“零配置接入”；以 **Rules+Skills**实现可治理、可复用、可升级的端到端交付路径，并引导前端团队平滑进阶全栈。

---

## 核心问题与价值
- **解决“上下文碎片化”**：规范在文档、实现与知识在代码、联调依赖口头对齐 → 用 OpenSpec 固化真相，用 MCP 结构化分发给所有 IDE/Agent。
- **解决“交付方差与返工”**：把高频路径（新增页面/改接口/联调/回归/发布）产品化为 Skills，配合 Rules 做硬约束与质量门禁。
- **解决“Vue2/3 混合期成本”**：通过 repo 诊断 + 自适应装配，让新需求默认走更现代的路径（Vue3/TS/更强测试），旧代码可控维护、可增量迁移。
- **引导“前端平滑全栈”**：将后端工作拆成“规范清晰、可生成、可验证”的子任务（契约→mock/types→契约测试→轻量实现模板），降低跨栈门槛。

可量化指标建议：
- 接入耗时（init→可用）、联调时间（spec 合并→mock/types/client ready）、契约破坏次数（CI 拦截）、Vue2→3 迁移比例、新增页面默认 Vue3 比例、线上问题中“规范缺失/不一致”占比。

---

## 核心原则：SDD（Specification-Driven Development）
研发主路径从“先写实现再补文档”改为：
1) **先改 OpenSpec**（行为/接口/错误/权限/验收）  
2) **规范派生产物自动生成**（types/mock/client/测试骨架/任务清单）  
3) **实现与验证围绕规范收敛**（契约测试、CI 门禁、回归用例）  
4) **变更可追溯**（代码与测试能回溯到规范变更）

---

## 总体架构（四件套协同）
- **Agent（执行体）**：存在于 IDE/CLI 的编排与执行逻辑（任务分解、选择 skill、调用 MCP 工具、错误恢复）。
- **Rules（策略与约束）**：安全/合规/质量边界（默认只读、危险操作确认、目录/风格/流程门禁）。
- **Skills（标准作业流程）**：把高频任务封装成 SOP（SKILL.md + 模板/脚本/检查清单），降低执行方差。
- **MCP（上下文与能力总线）**：以 tools/resources/templates 统一暴露 OpenSpec + repo/构建/测试/CI/（可选）后端能力。

---

## 交付物（工程拆分建议）
1) **Pack（发行版内容）**
   - 默认 rules/skills、OpenSpec 目录模板、manifest 默认值、migrations。
2) **CLI（落地与治理工具）**
   - `init / generate / doctor / upgrade / uninstall / validate`
   - 负责 repo 诊断、自适应装配、写入/合并 IDE 配置（managed blocks）、备份回滚、迁移升级。
3) **MCP Servers（能力提供者）**
   - 优先 stdio；按风险拆分：`read` / `write` / `shell(exec)` / `ci` / `db`。
   - 所有写入/执行类工具支持 `dryRun`、强确认、审计日志。
4) **IDE Adapters（适配层）**
   - 从“中立 manifest”生成 VS Code / JetBrains / 其他 IDE 的配置片段；生成产物可再生。

---

## “零配置接入”的工程定义
用户只需一次安装与一次初始化（如 `npx ... init`），系统自动：
- 识别 Vue2/Vue3/混合、构建工具（Vue CLI/Vite/Webpack）、Router/Store（Vuex/Pinia）、TS/JS、monorepo 边界
- 生成最小 `.ai/` 工作目录（rules/skills/spec/mcp/ide）
- 装配匹配的 skills 与 MCP resources/tools
- 输出 doctor 诊断结果与下一步建议

---

## OpenSpec 作为真理源（建议分层推进）
第一期建议至少覆盖：
- **Contract**：接口契约（可从 OpenAPI 扩展或自定义 schema 起步）、错误码、权限模型
- **Quality Gates**：验收标准/契约测试入口（最小可行）

逐步扩展：
- UI Spec（路由/状态/表单/埋点）
- Domain（实体/校验/状态流转）

---

## MCP 能力清单（建议 MVP）
优先选择 2–3 个派生产物打通闭环：
- `spec.validate` / `spec.diff`（规范校验与变更）
- `spec.generateTypes`（前端类型生成）
- `spec.generateMock` 或 `spec.generateClient`（mock 或 client 其一先行）
- `test.contract`（契约测试/CI 门禁，后续引入）

配套 repo 诊断资源：
- `repo.detectStack`（Vue2/3、构建工具、路由、store）
- `repo.routesIndex`、`repo.componentsIndex`（只读索引）

---

## 安全与治理（必须前置）
- 默认只启用只读 MCP servers；写入/执行需显式开关
- tool 风险分级（low/medium/high）+ 强确认策略
- 审计日志（tool、参数摘要、结果、耗时、错误）
- 任何写入/执行工具必须提供 `dryRun`

---

## 迭代路线图（建议）
- **Phase 0（MVP）**：OpenSpec 最小集 + 只读 repo MCP + types 生成 + init/doctor/generate
- **Phase 1**：mock 或 client 生成 + 契约测试门禁 + upgrade/uninstall 完整闭环 + 第二个 IDE 适配
- **Phase 2**：读/写/exec server 进一步拆分 + CI/DB 上下文接入（按需）+ 迁移辅助（Vue2→3）技能化

---

## 待确认的关键输入（用于收敛 MVP）
1) OpenSpec 选择：基于 OpenAPI 扩展还是自定义 schema？  
2) 优先支持的 IDE（前两名即可）。  
3) 项目形态：Vue CLI 还是 Vite？是否 monorepo（pnpm/turbo）？  
4) 后端主栈（Node/Java/Go）与第一期是否接 CI/DB。  
5) MVP 派生产物优先级：`types`/`mock`/`client`/`contract tests`/`scaffold` 选 2–3 个。  

