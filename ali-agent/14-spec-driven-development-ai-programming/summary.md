# DAY 0 先写 Spec，AI 编程才会可控

## 文章信息

- 原文标题：5 人 7 天干完 20 人数周的活：Spec-Driven Development 如何重新定义 AI 编程
- 链接：https://mp.weixin.qq.com/s/hVizUucsy8rwFOUR-VZ6wA
- 公众号：阿里云开发者
- 发布时间：2026年5月9日 08:31

## 核心论点

文章用“5 人 7 天开发 QoderWork”的案例说明，AI 编程的关键不是让模型更快写代码，而是用 Spec 锚定并行任务。DAY 0 没写代码，只定义 MVP 边界、拆模块、写 Spec、汇入 Repo Wiki，却决定了后续六天能否并行而不失控。

SDD 的核心定义是：规格说明是唯一真实来源，代码是派生产物。人类定义 WHAT，AI 实现 HOW。与传统文档不同，AI 时代的 Spec 直接决定代码质量，因为 AI 不会稳定追问缺失边界，它会基于上下文推断；Spec 越模糊，错误空间越大。

## 技术/架构拆解

SDD 标准流程分四阶段：Specify 定义问题、边界和成功标准；Plan 生成架构选型、模块划分、接口契约和风险评估；Implement 由 AI 按任务实现代码与测试；Validate 通过自动化测试和人工 Review 确认实现满足规范。

文章重点介绍 Spec Kit 的三文件体系：`spec.md` 记录需求、用户故事、验收标准、非目标和约束；`plan.md` 把需求编译成架构方案和模块拆解；`tasks.md` 把方案拆成可独立验证的原子任务。另有 `constitution.md` 作为项目宪法，固化 API、安全、代码质量、基础设施等不可违背原则。

好 Spec 有六要素：Problem Statement、Success Metrics、User Stories、Acceptance Criteria、Non-Goals、Constraints。它强调可测试性，例如用 “P95 < 200ms” 替代“系统应该很快”；用 Non-Goals 明确不做什么；用 Constraints 限定外部技术边界，防止 AI 自作主张。

文章还把 SDD 放进 Harness Engineering 体系中理解：Spec 是结构化上下文，constitution 是约束层，plan 是执行层，tasks 是调度层。这使 SDD 不只是文档方法，而是 AI 驾驭框架的一部分。

## 作者论证路径

作者从 QoderWork 的 7 天时间线切入，追问为什么少数人能管理大量并行 AI 任务。答案指向 DAY 0 的 Spec。随后文章定义 SDD，说明它与 API-First、Design by Contract、TDD 的相似与差异，并介绍 2025 年多个工具生态同时收敛到 SDD。

中段文章拆解四阶段流程、三文件体系、constitution、好坏 Spec 对比、粒度控制和淘特团队 3-5 次迭代经验。之后扩展到工具生态、成功与失败数据、SDD 与 Vibe Coding 的辩论、SDD 和 Harness 的关系。最后诚实列出五大陷阱，并提出 L1 Spec-First、L2 Spec-Anchored、L3 Spec-as-Source 的未来光谱。

## 对开发者认知的改变

文章把代码的地位降级，把思考的地位升级。当 AI 可以快速重写代码时，更有价值的是需求边界、成功标准、非目标、约束和决策历史。Spec 变成“思考的版本控制”，记录为什么做、做到什么程度、哪些方向不做。

它也修正了对 Vibe Coding 的看法。Vibe Coding 不是完全错误，而是适合探索、小工具、一次性脚本；一旦进入长期维护的生产系统，就必须切换到 SDD。探索阶段可以快，但正式开发必须把发现沉淀为 Spec。

另一个重要认知是：Spec 是大型代码库的压缩表示。十万行代码无法完整塞进上下文窗口，但几千行高质量 Spec 可以让 AI 理解全局约束，从而减少基于局部代码做错决策的概率。

## 潜在局限或适用边界

SDD 不是银弹。过度规格化会把 Spec 写成自然语言伪代码，剥夺 AI 在 HOW 层面的发挥空间；规格腐烂会让 Spec 和代码分离，导致 Agent 基于过时事实生成冲突实现；规格官僚化会让小改动也背负沉重流程，最终被团队绕过。

有 Spec 也不能替代代码审查。Spec 主要定义做什么，不能保证 AI 实现一定安全、高效、可维护。Validate 阶段的测试、Review、安全检查仍是最后防线。

工具复杂度也是风险。为了 SDD 叠加 Spec Kit、IDE、CI/CD、Spec Linter 和多 Agent 平台，可能让工具链本身成为负担。文章建议从一个 `spec.md` 和现有 AI Agent 开始，而不是一开始搭完整平台。

## 实践中的指导意义

下一个中等复杂度功能可以先写一个最小 `spec.md`：问题是什么、成功指标是什么、用户故事是什么、验收标准如何测试、哪些不做、有哪些技术约束。写完后让 AI 生成 `plan.md`，再反向检查 Spec 是否遗漏边界，通常迭代 3-5 次再进入实现。

团队应把 Acceptance Criteria 设计成测试入口。能量化就量化，能自动化就自动化，再由 AI 或 CI 把这些标准转成测试。这样 Spec 不只是文档，而是约束代码行为的锚点。

实践上可采用混合策略：探索期允许 Vibe Coding 快速试错；确认要长期维护后，立即补 Spec；进入正式开发后，所有影响模块行为的变更先改 Spec，再改代码。小文案、局部样式等低风险变更不必强行完整 SDD，避免流程官僚化。

## 金句摘抄

- “先定义 WHAT，再让 AI 做 HOW。”
- “代码只是 Spec 的副产品。”
- “好 Spec 是可测试的。”
- “Spec 是活的。”

## 刷新普通开发者认知的句子

- “SDD is version control for your thinking.”
- “Spec 是代码的压缩表示。”
- “Spec 替代的是需求文档，不是 Code Review。”
- “WHAT 永远是人类的领地。”
