# Claude Code 的可靠性来自工程化的三重控制

## 文章信息

- 原文标题：深度解析 Claude Code 在 Prompt / Context / Harness 的设计与实践
- 原文链接：https://mp.weixin.qq.com/s/YgGW92VBP8s846yzIxjVWQ
- 公众号：阿里云开发者
- 发布时间：2026年4月20日 08:32

## 多角度总结

### 核心论点

文章认为，Claude Code 的强体验并不只来自 Claude 基座模型，而来自 CLI 程序在 Prompt、Context、Harness 三个层面的深度工程化。直接调用 Claude API 与使用 Claude Code 的效果差异，恰好说明“模型之外的系统设计”会显著放大模型能力。

作者把三层关系概括为：Prompt 是基线，Context 是增强，Harness 是可控性保障。想做高分 Agent 系统，不能期待单靠提示词达到生产可用，而要通过模块化 Prompt、分层上下文管理、结构化记忆、专用子 Agent、权限引擎、沙箱、主循环和 Hook 共同完成。

### 技术/架构拆解

Prompt 层面，Claude Code 的 System Prompt 由 QueryEngine 触发组装。`fetchSystemPromptParts()` 并行获取默认 prompt、Git 等系统上下文和 `CLAUDE.md` 等用户上下文；`getSystemPrompt()` 把内容分为静态部分和动态部分，中间用 `__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__` 标记缓存边界；`buildEffectiveSystemPrompt()` 再按 override、Coordinator、Agent、自定义 prompt、默认 prompt 的优先级决定最终版本。

静态 Prompt 包含身份介绍、系统行为规则、任务执行指南、操作安全守则、工具使用指南、语气风格和输出效率。动态 Prompt 包含会话指导、自动记忆、环境信息、语言偏好、输出风格、MCP 指令、Scratchpad、函数结果清理、工具结果总结提示、长度锚点和 token 预算。最终还会追加 Git 状态，并把 `CLAUDE.md` 和当前日期作为特殊上下文插入用户消息前。缓存分块把静态前缀和动态内容分开，提高 KV Cache 命中率。

项目上下文通过 `CLAUDE.md` 管理。全局 `~/.claude/CLAUDE.md` 适合个人偏好，项目根目录 `CLAUDE.md` 适合团队共享规范，`CLAUDE.local.md` 存放本地私有指令，`.claude/rules/*.md` 可按文件类型或路径定义规则。这与 OpenClaw 的多 Markdown 文件体系不同，但共同点都是用文件系统驱动 Agent 行为。

Context 层面，Claude Code 采用三层渐进式压缩。MicroCompact 对 Bash、Read、Grep、Glob 等大输出工具做规则截断，成本最低；Session Memory Compact 复用已有会话记忆替换旧历史，避免重复总结；Full LLM Compact 在必要时调用模型生成九段式结构化摘要，并通过隐式分析、禁止工具调用等约束提升摘要质量。AutoCompact 在剩余 token 低于缓冲水位时按成本从低到高回退。

记忆层面，Memdir 把记忆拆成 User、Feedback、Project、Reference 四类，`loadMemoryPrompt()` 按类型归类并应用预算限制；`findRelevantMemories.ts` 让 Sonnet 参与语义筛选，最多只返回 5 条最相关记忆，兼顾精确度和上下文成本。

Harness 层面，Claude Code 大量使用 `<system-reminder>` 包裹系统注入信息，避免模型把元信息误认为用户自然语言。它还内置多类 AgentTool：General-Purpose 处理通用任务，Explore 只读探索代码库，Plan 负责架构计划，Verification 专门做独立验证，Guide 回答 Claude Code 使用问题，Statusline 配置状态栏，Fork Sub Agent 在共享缓存或 worktree 中继承上下文执行任务。不同 Agent 用不同模型、权限和上下文策略，体现成本、隔离和质量控制。

安全体系包括 Permission Engine 的 Allow、Deny、Ask 三行为模型，以及基于操作系统能力的沙箱隔离。主循环使用异步生成器，支持流式事件、暂停恢复、优雅取消、状态维持和异常自愈。Hook 系统覆盖工具、会话、消息、文件操作等二十多类事件，支持阻断、修改输入输出、注入反馈和超时保护，使 Agent 从黑盒变成可编程平台。

### 作者论证路径

作者先从自己对 Claude Code 体验的好奇切入，说明同样的模型在 Claude Code 内表现更强，原因应在工程设计。随后沿用 OpenClaw 文章的三层框架，先拆 System Prompt 的组装、优先级和缓存，再讲 `CLAUDE.md` 与子 Agent Prompt，接着分析上下文压缩和 Memdir，最后进入 Harness：system reminder、内置 AgentTool、权限沙箱、异步主循环、Hook 和产品彩蛋。

文章的论证方式是“从公开实现细节反推方法论”。它不只列举功能，而是把每个功能放回 Agent 系统设计问题中：如何减少上下文污染，如何降低 token 成本，如何让验证独立，如何在危险操作前停下来，如何让外部规则干预模型执行。

### 对开发者认知的改变

文章最强的认知变化是：Claude Code 的产品力来自大量细小但严密的工程约束。比如输出简洁、读文件前理解上下文、危险操作确认、压缩时禁止工具调用、验证 Agent 只能看不能改，这些都不是模型自然产生的能力，而是系统持续施加的边界。

第二个变化是：子 Agent 的价值不只是“并行”。Explore 用便宜模型和只读权限保护主上下文；Plan 用强模型做架构；Verification 用对抗式思维找最后的缺陷；Fork 在保留上下文的同时隔离改动。子 Agent 是成本控制、权限隔离、上下文隔离和质量控制的统一工具。

第三个变化是：压缩也需要分层治理。很多工具输出不值得调用 LLM 总结，规则截断就够；已有会话记忆可以复用；只有当前两层不够时才动用 Full LLM Compact。上下文工程的关键是“在正确时机用合适成本处理信息”。

### 潜在局限或适用边界

文章声明所依赖的是网络公开信息，并非官方完整源码说明，部分细节可能来自内部版本、实验功能或已随版本变化。Claude Code 的很多机制与 Anthropic API、模型能力、Prompt Cache、内部用户配置强相关，迁移到其他模型或平台时不一定能等价复现。

这套设计复杂度也很高。多层 Prompt、Memdir、AutoCompact、子 Agent、权限引擎、沙箱和 Hook 都需要长期维护。对于简单问答 Agent 或低风险自动化工具，完整复制 Claude Code 式架构可能过度设计。企业落地还要补充日志审计、权限治理、数据隔离、成本预算和插件安全审核。

### 实践中的指导意义

构建 AI Coding Agent 时，可以优先借鉴 Claude Code 的结构，而不是表层文案。Prompt 要分静态和动态两段，并显式规划缓存边界；项目规范要用类似 `CLAUDE.md` 的文件固化，区分全局偏好、团队规则、本地私有配置和路径级规则；上下文压缩要先规则、再复用、最后才 LLM 总结。

执行侧应把专用 Agent 作为系统能力设计：只读探索、架构规划、独立验证、文档答疑、后台分支执行分别配置不同模型和权限。危险操作要有 Allow/Deny/Ask 权限引擎和沙箱兜底；所有外部注入内容要用统一标签隔离；Hook 要覆盖工具调用、文件写入、会话生命周期和模型采样，并设置超时。最重要的是，验证不能由实现者自己一句“完成了”结束，应有独立的 Verification 流程尝试复现、打端点、跑测试和检查边界。

## 金句摘抄

- “Prompt一定是这三者的基石”
- “细节决定成败”
- “不要重复造轮子”
- “工具调用将被拒绝”
- “系统工程”

## 刷新普通开发者认知的句子

- “Prompt Engineering”的内涵其实早就已经发生了质的变化
- “规则驱动的微压缩才是 ROI 最高的选择”
- “验证逃避”
- “通过禁用工具实现“最小权限原则””
- “主循环被重构为一个`async function*`”
