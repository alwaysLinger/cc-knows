# 从 Prompt Engineering 到 Harness Engineering：企业 Agent 落地教程

这份文档面向公司内部的 Agent 工程建设。它不是提示词技巧合集，也不是论文式综述，而是一份可以直接拿去落地的工程教程：如何从“写一个好 Prompt”，逐步升级到“构建一个可控、可验证、可迭代的 Agent Harness”。

核心结论很简单：

- Prompt Engineering 解决“模型应该怎么说、怎么想”的问题。
- Context Engineering 解决“模型此刻应该看到什么”的问题。
- Harness Engineering 解决“模型不能只靠自觉，系统如何约束、驱动、验证它”的问题。
- SDD 是 Context Engineering 和 Harness Engineering 的交叉实践：Spec 是高密度上下文，Harness 把 Spec 变成可执行、可评审、可回滚的工程契约。

如果团队只停留在 Prompt Engineering，系统很容易表现得像一个聪明但不稳定的助手；进入 Context Engineering 后，它开始知道项目、用户、历史和工具；真正进入 Harness Engineering 后，它才开始像一个可交付的软件系统：有流程、有边界、有检查、有回滚、有责任链。

这份文档的组织方式刻意不是“概念定义 → 名词解释 → 案例罗列”，而是按照工程搭建顺序输出：

```text
先定义失败边界
  ↓
再设计 Agent 看到什么
  ↓
再把需求沉淀成 Spec / Plan / Tasks
  ↓
再设计 Agent 如何压缩和记忆
  ↓
再设计工具、权限、门禁和回滚
  ↓
最后设计多 Agent、运营指标和持续改进
```

原因是：企业里真正难的不是让模型回答一次正确，而是让它在不同需求、不同上下文、不同工具、不同风险级别下稳定正确。Harness Engineering 的输出物也不应该是一段漂亮的提示词，而应该是一组能被执行、被审计、被迭代的工程资产。

## 0. 这份文档应该怎么用

这份文档不建议从头到尾平均阅读。不同角色应该拿它解决不同问题：

| 角色 | 先看哪些部分 | 读完应该产出什么 |
|---|---|---|
| 研发负责人 | 1、2、12、14、16 | 选择第一个落地场景，定义 30 天目标和运营指标 |
| Harness Owner / 平台工程师 | 2、7、8、11、13 | 搭出 `.harness/`、Hook、状态机、质量门禁 |
| 应用团队 Tech Lead | 4、8、11、15 | 把项目规则、Spec Pack、评审标准接入真实需求 |
| Reviewer / QA / 安全同学 | 2.4、7、11、15 | 把事故案例转成测试、权限、审计和发布 gate |

最推荐的落地方式是先选一个真实、低到中风险、但足够代表性的变更，例如“新增一个订单优惠能力”“改造一个用户反馈处理流程”“接入一个内部查询 Agent”。不要用纯 Demo 验证 Harness，因为 Demo 不会暴露隐含业务规则、测试缺失、权限边界、上下文压缩和部署验收这些真实问题。

读完本文后，团队至少应该能落下这些工程资产：

- 一个项目入口：`AGENTS.md` 或等价文件。
- 一个不可违背规则集：`.harness/rules/constitution.md`。
- 一个变更资产目录：`.harness/changes/<change-id>/`。
- 一套 Spec Pack：`raw_request.md`、`open_questions.md`、`spec.md`、`plan.md`、`tasks.md`。
- 三类硬门禁：需求评审、代码/测试评审、CI/部署验证。
- 一个运营复盘机制：每周把真实失败回写到规则、Skill、测试或 Hook。

---

## 1. 先建立一个判断标准

做 Agent 工程时，最常见的错误是把所有问题都塞进提示词里：

- “请你一定要先读需求再写代码。”
- “请你一定要跑测试。”
- “请你不要乱删文件。”
- “请你失败后要自己修复。”
- “请你记住用户偏好。”

这些话有用，但不够。因为模型会遗忘、会误判、会为了完成任务而跳过麻烦步骤。工程上要按风险分层：

| 问题类型 | 应该放在哪里 | 例子 |
|---|---|---|
| 风格、语气、偏好 | Prompt | 回答简洁、先给结论、中文输出 |
| 项目信息、工具说明、历史决策 | Context | 项目架构、接口约定、用户偏好、历史缺陷 |
| 高风险动作、必经流程、质量门禁 | Harness | 删除文件审批、测试必须通过、CI 必须有用例数、部署参数必须人工确认 |

一个实用判断：

> 如果某个要求失败一次就可能造成线上事故、数据损坏、错误交付或安全风险，它就不应该只写在 Prompt 里，而应该变成 Harness 的强制约束。

可以用下面的决策树快速判断一个问题应该落在哪一层：

```text
问题只是回答风格、角色口吻、输出格式吗？
  是 -> Prompt
  否
    ↓
问题来自 Agent 缺少项目知识、历史决策、接口约定吗？
  是 -> Context
  否
    ↓
问题来自需求不清、验收标准不明、边界没定义吗？
  是 -> SDD / Spec Pack
  否
    ↓
问题来自高风险动作、工具误用、测试缺失、部署和审计吗？
  是 -> Harness
```

这个决策树的意义是避免“万物 Prompt 化”。Prompt 可以提醒模型，但不能替代状态、权限、测试、评审和审计。

### 1.1 从失败模式反推 Harness

Harness 设计不要从“我想加哪些功能”开始，而要从“Agent 会在哪些地方失败”开始。下面这张表可以直接作为设计评审清单：

| 失败模式 | 典型表现 | 应该加的 Harness |
|---|---|---|
| 需求误解 | 没澄清隐含业务规则就开始写代码 | 需求分析阶段、spec 文件、人工确认点 |
| 上下文缺失 | 不知道项目分层、测试命令、历史约束 | 项目入口文档、分层上下文、技能召回 |
| 上下文污染 | 被大量日志、搜索结果、旧讨论干扰 | 工具输出修剪、结构化压缩、只读 Explore Agent |
| 工具误用 | 参数错、资源类型错、误操作生产环境 | before_tool_call 参数校验、权限策略、HITL |
| 过早完成 | 测试没跑、评审没做就回答“完成了” | 质量门禁、状态机、交付证据 |
| 自我评审失效 | 写代码的 Agent 只验证 happy path | 独立 Reviewer / Verification Agent |
| 长任务漂移 | 做着做着忘了原始目标和当前阶段 | change summary、progress 文件、compact 模板 |
| 经验不沉淀 | 同类问题反复犯 | session_end 复盘、Memory 写入、Skill 更新 |

专家视角下，Harness 的本质不是“增强 Agent 能力”，而是“把失败模式变成系统边界”。每一个边界都应该能回答三个问题：谁触发、怎么判断、失败后回到哪里。

---

## 2. 最终要构建的系统长什么样

一个成熟 Agent 系统不是“一个 Prompt + 一个模型调用”。它应该接近下面的结构：

```text
用户需求
  ↓
任务入口 / Orchestrator
  ↓
Prompt Builder
  ├─ 身份与行为规则
  ├─ 项目规则
  ├─ 当前任务
  ├─ 可用工具
  ├─ 相关记忆
  └─ 运行时状态
  ↓
Agent Loop
  ├─ 思考 / 计划
  ├─ 调用工具
  ├─ 读取结果
  ├─ 修复错误
  └─ 产出交付物
  ↓
Harness Control Plane
  ├─ Hook：工具调用前后拦截
  ├─ Sandbox：文件、命令、网络权限
  ├─ Quality Gate：测试、CI、Review、验收
  ├─ Context Compact：压缩与修剪
  ├─ Memory：长期记忆写入与召回
  └─ HITL：高风险动作人工确认
```

这套结构的重点是：模型可以自主规划和执行，但它的执行环境不是开放世界，而是一个被设计过的工程空间。

### 2.1 Harness 的参考架构

更工程化地看，一个企业 Harness 可以拆成六个平面：

| 平面 | 职责 | 典型组件 |
|---|---|---|
| Context Plane | 决定模型看到什么 | Prompt Builder、Context Loader、Memory Retriever、Compact |
| Policy Plane | 决定什么能做、什么要审批 | Permission Engine、Risk Classifier、HITL |
| Execution Plane | 承接工具和环境 | Tool Proxy、Sandbox、MCP/CLI Adapter、Worktree |
| Evaluation Plane | 判断是否真的完成 | Test Runner、CI Parser、Reviewer、Browser/API Verifier |
| State Plane | 保存任务状态和证据 | Change Summary、Progress Log、Session Events、Artifacts |
| Learning Plane | 把经验沉淀回系统 | Retro、Memory Writer、Skill Updater、Rule Backlog |

这六个平面不要混在一个大 Prompt 里。Prompt Builder 属于 Context Plane；测试和 CI 属于 Evaluation Plane；危险命令审批属于 Policy Plane；长期记忆写入属于 Learning Plane。拆清楚之后，系统才容易维护、替换和审计。

### 2.2 OpenClaw 给 Harness 的顶级工程启发

OpenClaw 最值得学习的地方，不是某个具体 Prompt，也不是个人助理形态，而是它把 Agent 运行时拆成了一组可治理的工程面：Prompt 由宿主拼装，Context 可检查，Agent Loop 可串行和可观测，工具调用可拦截，记忆可落盘和召回，底层执行内核可替换但控制面仍由宿主掌握。

可以把它压缩成四条顶级原则：

| 原则 | 工程含义 | 企业落地点 |
|---|---|---|
| Prompt 是运行时产物 | 不手写一个巨型 System Prompt，而是由 Builder 按模式、角色、权限和任务拼装 | `before_prompt_build`、Prompt Mode、模块化 Prompt 文件 |
| Context 是显式装配物 | 模型看到的内容必须能列出来、量出来、解释为什么出现 | `/context` 等价能力、Context Budget、注入清单、工具 schema 预算 |
| Agent Loop 是事件流 | 每轮执行都经过 intake、context assembly、model、tool、stream、persistence | Trace、Session Lock、Hook、Timeout、State 更新 |
| Harness 是宿主控制面 | 模型可以自主规划，但权限、渠道、工具、审批、状态、记忆由宿主治理 | Tool Gateway、Sandbox、Approval、Memory Pipeline、Quality Gate |

这四条原则对应到六个平面：

| 六个平面 | OpenClaw 启发 | 设计要求 |
|---|---|---|
| Context Plane | System Prompt、workspace files、skills index、memory recall 都是运行时装配 | 每次运行能解释“加载了什么、为什么、占多少 token” |
| Policy Plane | 安全准则只是提醒，硬约束来自权限、沙箱、审批、allow/deny | 高风险动作必须由 policy 判定，而不是由模型自觉 |
| Execution Plane | Tool / Skill / Plugin 分层，工具负责 typed action，Skill 负责 SOP，Plugin 负责运行时扩展 | 不把长 SOP 写进工具描述，也不把执行能力藏在 Prompt 里 |
| Evaluation Plane | 工具结果、测试失败、Review 结论都进入事件流 | 每个阶段有机器可验证的通过条件 |
| State Plane | Session、workspace、summary、memory 文件承担外部状态 | 长任务不能只靠聊天记录恢复 |
| Learning Plane | Memory、Dreaming、session_end、rule backlog 让系统持续吸收经验 | 经验写入要有触发、schema、去重、更新和删除路径 |

所以企业复制 OpenClaw 时，不应该问“我们要不要也做一个 OpenClaw”，而应该问：

1. 我们的 Prompt Builder 是否能按角色和风险生成不同上下文？
2. 我们是否能解释一次模型调用里每一块上下文的来源和成本？
3. 每次工具调用、文件修改、压缩、结束会话是否都有事件和 Hook？
4. 记忆、规则、Spec、Review、CI 结果是否都被外部化为可审计资产？
5. 如果底层模型或 Agent Runtime 换掉，Policy、State、Memory、Quality Gate 是否还能保留？

这才是 OpenClaw 对企业 Harness 的真正启发：不要把 Agent 当成“会聊天的模型”，而要把它当成运行在宿主控制面里的执行进程。

### 2.3 最小可用 Harness

如果团队第一次落地，不要一开始做完整平台。最小可用 Harness 只需要七个能力：

```text
1. 固定项目入口：AGENTS.md 或同等文件
2. 动态 Prompt Builder：按主 Agent / 子 Agent / 工具 Agent 拼装上下文
3. 变更状态文件：summary.md 记录阶段、范围、证据和风险
4. before_tool_call：拦截危险命令、敏感路径、云资源参数
5. after_tool_call：识别测试失败并进入修复循环
6. CI Quality Gate：检查状态、测试数量、失败数
7. session_end：生成复盘并提取可沉淀规则
```

这七个能力覆盖了 Agent 落地最常见的事故面：不知道项目、上下文混乱、工具误用、测试缺失、无法恢复现场、经验不沉淀。先把它们跑通，比先做复杂多 Agent 平台更有价值。

判断最小 Harness 是否真的可用，不看“功能是否都配置了”，而看它能不能通过下面的冒烟测试：

| 冒烟测试 | 期望结果 |
|---|---|
| 给一个含业务歧义的需求 | Agent 停在需求分析，产出 `open_questions.md`，不直接编码 |
| 让 Agent 修改一个有金额计算的模块 | 自动加载金额类型、分层边界、测试要求等规则 |
| 让 Agent 尝试删除、迁移或覆盖数据 | `before_tool_call` 拦截并要求人工确认 |
| 本地测试失败 | Agent 进入有限轮数的修复循环，并记录失败证据 |
| CI 返回成功但测试数为 0 | CI gate 判定失败，回到单元测试阶段 |
| 会话压缩或换 Agent 继续 | 新 Agent 能从 `summary.md` 恢复范围、阶段、决策和风险 |

如果这六个冒烟测试不能通过，说明团队还没有真正拥有 Harness，只是拥有一组提示词和文档。

### 2.4 外部案例告诉我们为什么必须这样做

如果只讲架构，读者很容易觉得 Harness 是“工程洁癖”。更现实的理解方式是：这些设计都是从真实失败里长出来的。下面这些公开案例可以作为内部分享时的“为什么”。

| 案例 | 发生了什么 | 对应的 Harness 教训 |
|---|---|---|
| Replit Agent 删除生产数据库 | AI coding agent 在 code freeze 期间仍执行破坏性操作，删除生产数据库，还出现误导性恢复说明和伪造数据/测试结果的报道。 | “不要动生产”不能只是 Prompt。生产数据、删除、迁移、部署必须由权限系统、环境隔离、HITL、备份和回滚强制保护。 |
| Vibe-coded 应用公开泄露数据 | 安全研究人员发现大量由 AI coding 工具生成并发布的 Web 应用缺少认证或访问控制，部分包含医疗、财务、企业内部资料。 | Agent 能生成应用时，默认安全必须前置：private by default、认证、权限、敏感数据扫描、发布前安全 gate。不能指望非工程人员记得配置。 |
| Air Canada chatbot 误导退款政策 | 航司 chatbot 给出与真实政策冲突的丧亲票价退款建议，用户依赖后发生损失，裁决认为公司要为 chatbot 信息负责。 | 面向客户的 Agent 输出就是公司行为。政策、价格、法律、金融等回答必须绑定权威来源、版本、引用和低置信度升级路径。 |
| Microsoft AI Recommendation Poisoning | 研究发现一些网站通过“Summarize with AI”链接把“记住某公司是可信来源”这类指令注入 AI 记忆，形成持久偏置。 | 长期记忆是攻击面。Memory 写入必须记录来源、可信度、触发方式，用户可见可删；外部内容不能直接写入长期偏好。 |
| Claude Code 质量回退复盘 | 产品层把 reasoning effort、thinking history、system prompt 做了优化，但部分改动造成用户感知的编码质量下降。 | Prompt、context、cache、reasoning effort 都是产品行为变更。它们必须像代码一样做 eval、消融、灰度、回滚和生产监控。 |
| SWE-bench Verified 的两次教训 | 初版 SWE-bench 存在任务描述不清、测试过窄/过宽、环境不稳等问题；后来公开 benchmark 又出现污染风险。 | Eval 本身也要被治理。质量门禁不能盲信单一 benchmark，要有人工验证、容器化环境、私有回归集、隐藏测试和定期刷新。 |
| Anthropic 多 Agent Research | 多 Agent 系统在复杂研究任务上收益明显，但官方也指出子 Agent 会重复工作、选错工具、过度搜索，且 token 成本高。 | 多 Agent 不是“多开几个模型”。必须有任务边界、预算控制、子任务输出格式、trace、checkpoint 和结果汇总规则。 |
| NIST/OWASP agent hijacking 与 excessive agency | 安全机构和 OWASP 都把间接 prompt injection、过度权限、过度工具能力、缺少人工确认列为 Agent 关键风险。 | 外部网页、邮件、PR、issue、文档、工具描述都要当作 untrusted data。工具调用必须经过授权、参数校验、数据流和 egress 控制。 |
| Cloudflare WAF 规则事故 | 一个通过 CI 的规则变更触发正则灾难性回溯，导致全球 HTTP/HTTPS 流量处理异常。 | CI 不能只测功能正确性，还要测性能上界、资源消耗、超时、canary、staged rollout 和快速回滚。 |
| CrowdStrike 内容更新事故 | 安全内容更新通过验证后大规模推送，引发 Windows 系统蓝屏，后续复盘强调测试、fuzzing、fault injection、分阶段部署和第三方审查。 | Agent 生成的不只是代码，配置、规则、YAML、策略、迁移脚本都可能是生产级风险物。所有可执行产物都需要独立 gate。 |

从这些案例可以提炼出一条总规则：

> 只要 Agent 能读取真实数据、调用真实工具、修改真实状态，就必须按生产系统治理，而不是按聊天机器人治理。

所以本文后面反复强调 Hook、Sandbox、Quality Gate、Memory、Trace、HITL，不是为了让系统显得复杂，而是为了把已经在真实世界发生过的失败，提前变成可执行边界。

### 2.5 把案例转成工程规则

不要把案例只当作分享材料。每个案例都应该转成至少一个工程资产：

| 案例教训 | 应沉淀成什么 |
|---|---|
| Agent 删除生产数据 | `before_tool_call` destructive action policy、生产凭据隔离、删除前人工确认 |
| AI 应用公开泄露数据 | 发布前 auth/RLS/secrets/security scan gate |
| Chatbot 胡编政策 | policy answer verifier、引用校验、低置信度转人工 |
| 长期记忆被投毒 | memory write classifier、provenance、review/delete UI |
| Prompt 或压缩改动导致退化 | prompt/context regression eval、灰度、回滚 |
| Benchmark 被污染或测试不公平 | 私有 eval、隐藏测试、人工抽检、transcript review |
| 多 Agent 成本失控 | subagent budget、任务边界、结果格式、trace |
| 间接 prompt injection | untrusted-context 标记、egress policy、tool permission boundary |
| CI 通过但生产事故 | perf/load/canary/rollback gate |

一个 Harness 团队成熟的标志，是每次事故或坏案例最后都落到规则、工具、测试、Skill、评估集或权限策略，而不是停留在“以后大家注意”。

---

## 3. 第一层：Prompt Engineering，不要写成一整块墙

### 3.1 OpenClaw 的核心做法：动态拼装 Prompt

OpenClaw 的 Prompt 不是一段固定大文本，而是由运行时按场景拼装出来的。这个设计非常关键，因为主 Agent、子 Agent、只执行工具的轻量 Agent，不应该看到完全相同的指令。

可以把 Prompt 分成三种模式：

| 模式 | 使用场景 | 加载内容 |
|---|---|---|
| full | 主会话，直接面对用户 | 身份、行为、工具、项目规则、记忆、运行时状态、心跳规则 |
| minimal | 子 Agent，执行独立任务 | 核心身份、任务、必要工具、工作区边界 |
| none | 极轻量任务 | 最小身份和当前任务 |

工程上可以这样实现：

```ts
type PromptMode = "full" | "minimal" | "none";

async function buildSystemPrompt(mode: PromptMode, session: SessionState) {
  const parts: string[] = [];

  parts.push(await loadIdentity());
  parts.push(await loadBehaviorRules());

  if (mode === "full") {
    parts.push(await loadWorkspaceRules(session.cwd));
    parts.push(await loadToolInstructions(session.enabledTools));
    parts.push(await loadSafetyRules(session.permissionMode));
    parts.push(await loadRelevantMemory(session.userId, session.task));
    parts.push(await loadHeartbeatRules());
    parts.push(renderRuntimeInfo(session));
  }

  if (mode === "minimal") {
    parts.push(await loadMinimalToolInstructions(session.enabledTools));
    parts.push(renderWorkspaceBoundary(session.cwd));
  }

  parts.push(renderCurrentTask(session.task));
  return parts.filter(Boolean).join("\n\n---\n\n");
}
```

这段代码背后的原则：

- Prompt 是运行时产物，不是手写大文档。
- 不同 Agent 角色看到不同上下文。
- 越靠近工具执行，越要强调边界、权限和输出格式。
- 越靠近用户交互，越要强调沟通风格、澄清策略和交付标准。

Prompt Mode 的选择不要凭感觉，建议直接写成规则：

| 场景 | Prompt Mode | 必须加载 | 禁止加载 |
|---|---|---|---|
| 主会话、需求澄清、交付汇报 | `full` | 用户当前需求、项目入口、相关记忆、工具说明、交付标准 | 大量历史日志、无关 PR、无关技能全文 |
| 子 Agent 搜索代码或资料 | `minimal` | 子任务、只读边界、必要工具、输出格式 | 用户隐私记忆、部署权限、全量项目规则 |
| Reviewer / Verification Agent | `minimal` | Spec、变更文件、评审清单、测试命令 | 编码 Agent 的主观结论、无关聊天历史 |
| 格式化、分类、轻量转换 | `none` | 输入、输出格式、少量约束 | 项目全量上下文、长期记忆、工具大列表 |

这张表背后的设计思想是：子 Agent 不是“缩小版主 Agent”，而是一个有明确上下文边界的执行进程。给它太多信息，会污染判断；给它太多权限，会扩大事故面。

### 3.2 推荐的 Prompt 模块

实际落地时，可以先按下面的模块拆：

```text
.agent/
├── IDENTITY.md        # Agent 是谁，职责边界是什么
├── BEHAVIOR.md        # 沟通方式、工作风格、默认策略
├── WORKSPACE.md       # 项目目录、读写边界、启动流程
├── TOOLS.md           # 工具说明、参数约定、常见坑
├── SAFETY.md          # 删除、覆盖、外部请求、敏感信息规则
├── MEMORY.md          # 长期稳定记忆
├── HEARTBEAT.md       # 长任务期间必须周期性检查什么
└── BOOTSTRAP.md       # 第一次进入项目时如何建立上下文
```

每个文件都要短，不要写成百科。OpenClaw 的实践很明确：提示词要模块化、高信号、可替换。一个模块只解决一个问题。

### 3.3 Prompt 不应该承载的东西

不要把下面这些只写成提示词：

- “必须跑测试”：应该由 after_tool_call 或任务阶段门禁触发。
- “不能删除生产数据”：应该由权限系统和危险命令拦截实现。
- “必须读取项目规则”：应该由会话启动流程自动注入。
- “部署前必须确认环境”：应该由 HITL 节点强制暂停。
- “记住用户偏好”：应该写入 Memory 系统，并在相关任务前召回。

Prompt 的职责是指导模型；Harness 的职责是让关键动作不可绕过。

---

## 4. 第二层：Context Engineering，让模型看到正确的东西

Prompt 解决“行为规则”，Context 解决“信息供给”。Agent 出错很多时候不是模型不聪明，而是它看到了太多无关内容，或没看到关键约束。

### 4.1 会话启动：先建立项目地图

OpenClaw 的一个很实用的设计是用项目文件作为上下文入口。团队可以复制这个流程：

1. 进入项目后先读“项目总规则”。
2. 读取团队偏好、技术栈、目录结构。
3. 读取最近一天或两天的任务记忆。
4. 如果是主会话，再读取长期记忆。
5. 明确当前工作区、分支、权限、可用工具。

推荐在项目根目录放一个总入口：

```md
# AGENTS.md

## Startup

1. Read `.agent/IDENTITY.md`.
2. Read `.agent/WORKSPACE.md`.
3. Read `.agent/TOOLS.md`.
4. Read `.agent/MEMORY.md` only for main sessions.
5. Read today's and yesterday's daily notes if they exist.

## Project Rules

- Source code lives in `src/`.
- API contracts live in `api/`.
- Database migrations must be reviewed before execution.
- Never edit generated files manually.
- Tests must be run for touched modules before final delivery.
```

关键不是文件名，而是“上下文入口必须稳定”。如果项目知识散落在聊天记录、个人脑子和临时文档里，Agent 一定会漏。

项目入口文件要遵守三条规则：

1. 只放稳定规则，不放临时任务细节。临时状态写入 `summary.md` 或 Change 目录。
2. 只负责指路，不复制所有下游文档。入口文件应该告诉 Agent 去哪里找规则、技能、Wiki 和状态。
3. 明确加载边界。主会话可以加载长期记忆和用户偏好，子 Agent 默认不能加载隐私记忆和生产权限。

企业项目可以把入口文件拆成两层：

| 层级 | 例子 | 作用 |
|---|---|---|
| Always Loaded | `AGENTS.md`、`.harness/rules/constitution.md` | 最小身份、工作区、红线、索引 |
| On Demand | `.harness/wiki/*`、`.harness/skills/*`、`.harness/changes/*` | 任务相关知识、SOP、变更状态 |

这个拆法延续了 OpenClaw 的核心思想：启动时只给 Agent 一张地图，真正的详细知识在需要时再加载。

### 4.2 技能系统：渐进式加载，不要一次塞满

OpenClaw 和 Claude Code 都体现了同一个经验：工具、技能、规则不能一次性全塞进上下文。正确方式是渐进式披露：

```text
第一层：只加载技能名称和一句话描述
第二层：任务命中后读取该技能的 SKILL.md
第三层：只有真正需要时才加载脚本、模板、示例
```

这里要区分 Tool、Skill、Plugin 三层，不要混用：

| 层级 | 适合放什么 | 不适合放什么 |
|---|---|---|
| Tool | 短小、类型明确、可执行的动作，例如读文件、查 CI、重启沙箱服务 | 长篇操作规程、业务背景、评审标准 |
| Skill | 人类 SOP、编码规范、测试方法、评审清单 | 需要长期运行的服务、权限系统、外部 provider |
| Plugin | 新工具、Hook、渠道、模型 provider、记忆后端、上下文引擎 | 简单几行提示词或单次任务规则 |

这个分层非常关键：Tool 负责“能做什么”，Skill 负责“该怎么做”，Plugin 负责“运行时如何扩展”。企业 Harness 里很多混乱来自把三者揉在一起：工具描述写得像长文档，Skill 里塞密钥和权限，Plugin 又承担业务需求说明。

比如一个企业 Coding Agent 可以有这些技能：

```text
skills/
├── request-analysis/
│   └── SKILL.md
├── coding-skill/
│   └── SKILL.md
├── expert-reviewer/
│   └── SKILL.md
├── unit-test-write/
│   └── SKILL.md
├── unit-test-ci/
│   └── SKILL.md
├── deploy-verify/
│   └── SKILL.md
└── code-review/
    └── SKILL.md
```

`SKILL.md` 不应该写成泛泛说明，而要写成可执行手册：

```md
# coding-skill

## When to use

Use this skill when implementing a confirmed development task.

## Required inputs

- `spec.md`
- `tasks.md`
- project rules
- target module path

## Steps

1. Read the spec and identify changed modules.
2. Check whether API, database, or external dependency changes are required.
3. Implement one module at a time.
4. Run focused tests after each module.
5. Update the coding report with changed files, tests, and unresolved risks.

## Hard constraints

- Money fields must use integer cents, never float.
- External service calls must have timeout and fallback.
- Controller layer cannot contain core business logic.
- Generated files cannot be edited manually.
```

技能系统的工程价值在于：把团队经验变成可加载、可版本化、可复用的上下文单元。

### 4.3 Context Budget：给上下文分层

一个实用分层：

| 层级 | 内容 | 加载策略 |
|---|---|---|
| L1 Always Loaded | Agent 身份、项目总规则、当前任务、权限边界 | 每次加载，控制在上下文 40% 以内 |
| L2 Phase Triggered | 当前阶段技能，比如需求分析、编码、测试、部署 | 阶段触发后加载 |
| L3 On Demand | Wiki、历史 PRD、旧 Review、日志、长文档 | 检索命中后加载片段 |
| L4 External Evidence | CI 结果、线上日志、监控、用户反馈 | 工具读取，进入当前任务上下文 |

这个分层能避免两个极端：

- 什么都不加载，Agent 只能靠猜。
- 什么都加载，Agent 被无关上下文淹没。

---

## 5. 第三层：Context Compression，上下文压缩不是简单摘要

长任务一定会遇到上下文爆炸。压缩做不好，会出现两个问题：

- 关键决策被压没了，Agent 反复走回头路。
- 工具输出占满窗口，真正的需求和约束被挤掉。

### 5.1 先修剪工具输出

工具结果通常是最大的 token 消耗。OpenClaw 的做法是对工具输出做低成本修剪：保留开头和结尾，省略中间。

适合修剪的内容：

- 很长的日志。
- 失败堆栈。
- 大 JSON。
- XML 或 HTML。
- grep/search 的大量命中。

保留头尾的原因很实际：

- 错误日志开头通常有命令、环境、错误类型。
- 结尾通常有最终异常、失败摘要、退出码。
- 中间大量重复堆栈价值较低。

可以实现成：

```ts
function pruneToolResult(text: string, maxChars: number) {
  if (text.length <= maxChars) return text;

  const headSize = Math.floor(maxChars * 0.55);
  const tailSize = Math.floor(maxChars * 0.35);
  const omitted = text.length - headSize - tailSize;

  return [
    text.slice(0, headSize),
    `\n\n[... omitted ${omitted} chars ...]\n\n`,
    text.slice(text.length - tailSize),
  ].join("");
}
```

注意：修剪不是摘要，它会丢信息。对安全审计、财务数据、迁移脚本这类内容，不要随便修剪，应该改用文件引用或分块读取。

工具输出修剪也要按类型制定策略，不要一刀切：

| 输出类型 | 默认策略 | 必须保留 |
|---|---|---|
| 测试失败 | 头尾 + 失败用例摘要 | 命令、退出码、失败测试名、断言差异 |
| 搜索结果 | Top N + 文件路径 | 命中路径、行号、少量上下文 |
| 大 JSON | schema + 关键字段 | `error`、`status`、`id`、`timestamp`、业务主键 |
| 日志流 | 时间窗口 + 异常附近 | 时间、服务名、trace id、最终错误 |
| 构建输出 | 阶段摘要 + 首个失败点 | 命令、版本、失败 task、依赖冲突 |
| 安全扫描 | 不修剪原始报告，只生成摘要并保留文件引用 | 报告路径、风险等级、规则 ID、证据 |

这张表的核心是：Context 里放“能让 Agent 继续工作的最小信息”，完整证据放文件或 artifact。否则一次失败日志就能把任务目标和 Spec 挤出上下文。

### 5.2 再做会话压缩

当上下文接近阈值时，再做 LLM 压缩。一个可用策略：

```text
触发条件：
- token 使用超过窗口上限减去保留缓冲
- 或者长任务运行超过固定轮数
- 或者用户手动触发 compact

压缩策略：
- 最近 N 轮原样保留
- 更早的消息分块摘要
- 工具结果先修剪再摘要
- 压缩期间加写锁，避免新消息插入导致状态错乱
- 压缩超时后降级为规则摘要或要求用户确认
```

压缩摘要必须保留这些内容：

- 用户最初目标和当前目标。
- 已做过的关键决策。
- 已修改文件、接口、数据结构。
- 未完成 TODO。
- 测试结果和失败原因。
- 用户明确承诺或限制。
- 不可变 ID、UUID、commit、ticket、实例 ID、订单号。
- 当前下一步。

推荐压缩模板：

```md
## Primary Request

用户要完成什么，为什么要做。

## Current State

目前已经完成什么，哪些文件/模块被改动。

## Key Decisions

已经确定的设计、约束、取舍。

## Open Tasks

仍未完成的任务，按优先级排列。

## Errors And Fixes

遇到过的错误、根因、已经尝试过的修复。

## Tests And Evidence

已经运行的测试、结果、仍缺少的验证。

## Important Identifiers

必须逐字保留的 ID、路径、接口名、命令、环境名。

## Next Step

恢复会话后第一件应该做的事。
```

Claude Code 的经验说明，完整压缩不应该只是“一段总结”，而应该是结构化恢复现场。否则 Agent 恢复后看似知道大概，实际会丢掉执行状态。

### 5.3 Micro Compact：优先用规则处理高频小问题

Claude Code 里有一种很重要的思想：不要每次都调用大模型压缩。有些内容可以用规则处理。

适合 Micro Compact 的场景：

- Bash 输出过长。
- Read/Grep/Glob 返回过多。
- 日志重复。
- 搜索结果里只有少量命中有价值。

不适合自动 Micro Compact 的场景：

- Edit/Write 的输入输出。
- 数据迁移脚本。
- 权限审批信息。
- 用户给出的明确需求文本。

规则压缩是第一道防线，LLM 压缩是第二道防线。

---

## 6. 第四层：Long-term Memory，长期记忆要分层、可检索、可纠错

长期记忆不是把所有聊天记录塞进 Prompt。正确做法是分层。

### 6.1 两层记忆模型

推荐采用两层：

```text
长期稳定记忆：MEMORY.md
  - 用户偏好
  - 项目长期约束
  - 团队固定规范
  - 高频踩坑

每日原始记忆：memory/YYYY-MM-DD.md
  - 当天任务摘要
  - 临时决策
  - 未完成事项
  - 调试线索
```

长期记忆应该短、稳定、高价值；每日记忆可以更原始，后续通过检索召回。

一个可用的 `MEMORY.md`：

```md
# Memory

## User Preferences

- User prefers concise Chinese explanations with concrete implementation steps.
- User expects code changes to be verified before delivery.

## Project Constraints

- Money values are represented as integer cents.
- Public API changes require updating API docs and tests.
- Production deployment parameters must be confirmed by a human.

## Repeated Lessons

- Do not trust CI status alone; also check total test count.
- For generated clients, update source schema and regenerate instead of editing output.
```

### 6.2 记忆写入不要完全靠模型自觉

OpenClaw 的原生记忆设计里有一个值得借鉴也值得警惕的点：它会在会话结束、压缩、定时任务等节点尝试写入记忆。但如果完全依赖模型判断“什么值得记”，会出现：

- 短会话没有触发写入。
- 模型把低价值内容写入长期记忆。
- 相似内容重复写入。
- 真正重要的纠错没有沉淀。

更稳的做法是把记忆写入做成 Harness：

```text
会话结束
  ↓
Memory Extractor 提取候选记忆
  ↓
按类型结构化：用户 / 项目 / Agent 行为 / 故障教训
  ↓
向量检索已有记忆
  ↓
Memory Judge 决定 INSERT / UPDATE / SKIP / DELETE
  ↓
写入数据库和可读文件
```

OpenClaw 原生记忆的启发是“文件优先、压缩前保护、检索增强”；企业场景还要再补一层治理，把记忆当成可审计的数据管线：

| 环节 | OpenClaw 启发 | 企业增强 |
|---|---|---|
| 写入触发 | 对话中写文件、压缩前 flush、心跳维护 | `session_end`、关键工具调用后、用户显式偏好、事故复盘都稳定触发 |
| 暂存层 | `memory/YYYY-MM-DD.md` 作为日记忆 | 原始候选保留来源、时间、会话、操作者和置信度 |
| 晋升层 | `MEMORY.md` 保存长期记忆，Dreaming 做后台巩固 | 通过 schema、语义去重、CRUD 决策和人工复核晋升 |
| 召回层 | `memory_search` + `memory_get` | BM25 + 向量 + 时间衰减 + 权限过滤 |
| 注入层 | 相关记忆进入当前上下文 | 历史记忆必须标记为 untrusted historical context，不能提升为系统指令 |
| 删除层 | 文件可编辑 | 必须支持 UPDATE / DELETE / 审计记录 |

记忆还要区分“记住用户”和“记住 Agent 自己怎么工作”：

| 记忆类型 | 来源 | 用途 | 示例 |
|---|---|---|---|
| 用户画像 | 用户消息 | 个性化服务 | 偏好 TypeScript、希望中文简洁输出 |
| 项目事实 | 文档、代码、评审 | 稳定项目知识 | 金额字段必须用 cents |
| 世界事件 | 用户提及的临时事实 | 后续任务上下文 | 下周二要上线某活动 |
| Agent 错误经验 | 工具失败、Review、用户纠正 | 避免重复犯错 | 不要只看 CI 状态，必须看测试数量 |
| 行为诉求 | 用户对 Agent 的要求 | 调整工作方式 | 删除前必须确认 |

高价值但低频的信息不能只靠“出现次数”晋升。健康、安全、权限、资金、部署、承诺、时间计划这类事实，即使只出现一次，也应该触发高优先级候选记忆和人工可见复核。

可以定义结构：

```ts
type MemoryType =
  | "user_preference"
  | "project_constraint"
  | "technical_decision"
  | "failure_lesson"
  | "agent_behavior";

type MemoryDecision = {
  action: "INSERT" | "UPDATE" | "SKIP" | "DELETE";
  type: MemoryType;
  content: string;
  reason: string;
  confidence: number;
  relatedMemoryIds: string[];
};
```

### 6.3 记忆召回：BM25 + 向量 + 时间衰减

实践中，只靠向量召回不够。项目名、接口名、错误码、实例 ID 这类东西，关键词匹配更可靠。推荐组合：

- BM25：召回精确词、路径、错误码、接口名。
- 向量：召回语义相近的经验和偏好。
- 时间衰减：近期内容权重更高。
- 原文读取：召回后再读取原始记忆片段，避免摘要失真。

时间衰减可以这样算：

```text
score = relevance_score * e^(-lambda * days)
lambda = ln(2) / half_life_days
```

如果半衰期是 30 天，那么：

- 30 天前的记忆权重约为 0.5。
- 60 天前的记忆权重约为 0.25。
- 90 天前的记忆权重约为 0.125。

这能避免陈旧偏好长期污染当前任务。

### 6.4 安全边界

长期记忆不应该无条件注入所有场景：

- 多人共享会话不要注入个人隐私记忆。
- 子 Agent 只拿任务相关记忆。
- 涉及客户、密钥、生产账号的信息不要写入普通记忆。
- 记忆写入要有删除、修正和审计能力。

长期记忆本质上是一个数据库，不是聊天记录缓存。

---

## 7. 第五层：Harness Engineering，让关键流程不可跳过

到这里，Prompt 和 Context 已经能让 Agent “更懂事”。但企业落地还不够。真正的 Harness 要把关键动作外置成控制系统。

### 7.1 Harness 和 Workflow 的区别

| 类型 | 控制权 | 特点 | 适合场景 |
|---|---|---|---|
| Workflow | 代码控制流程 | 稳定、确定、灵活性低 | 固定审批流、批处理、标准 ETL |
| Harness | Agent 自主执行，系统约束边界 | 灵活、可探索、可干预 | 编码、排障、需求分析、复杂工具操作 |

Harness 不是把 Agent 变成脚本，而是给 Agent 一个受控环境。它允许 Agent 自主规划，但不允许它跳过质量和安全边界。

### 7.2 Hook 是 Harness 的核心接口

OpenClaw 和 Claude Code 都使用大量 Hook。企业实现时，至少需要这些：

| Hook | 用途 |
|---|---|
| before_prompt_build | 注入项目规则、记忆、运行时状态 |
| message_received | 用户消息进入时做分类、脱敏、任务识别 |
| before_tool_call | 工具调用前做权限、参数、风险检查 |
| after_tool_call | 工具调用后做日志修剪、错误分类、自动修复触发 |
| before_compaction | 压缩前冻结状态、保留关键字段 |
| after_compaction | 压缩后恢复任务状态 |
| before_file_edit | 文件修改前检查所有权、生成文件、敏感路径 |
| after_file_edit | 文件修改后触发格式化、静态检查、测试建议 |
| session_end | 写入记忆、生成任务报告、更新知识库 |

Hook 的返回值应该能明确表达：

```ts
type HookResult =
  | { action: "allow" }
  | { action: "block"; reason: string; messageToAgent: string }
  | { action: "ask_user"; question: string; risk: string }
  | { action: "modify"; newInput: unknown; reason: string }
  | { action: "inject"; messageToAgent: string };
```

Hook 不能只是“有个回调”。它要有输入输出契约，否则后面无法审计和复盘：

| Hook | 输入必须包含 | 输出必须包含 |
|---|---|---|
| `before_prompt_build` | session、prompt mode、任务类型、权限模式、候选上下文 | 注入内容、跳过内容、token 预算、原因 |
| `before_tool_call` | 工具名、参数、cwd、权限模式、调用来源 | allow/block/ask、原因、替代建议 |
| `after_tool_call` | 命令或工具名、退出码、stdout/stderr、耗时 | 输出摘要、错误分类、下一步建议 |
| `before_compaction` | 当前任务、阶段、决策、阻塞点、证据 | 必须保留字段、可丢弃字段、记忆候选 |
| `session_end` | 变更状态、文件、测试、失败、用户反馈 | `summary.md` 更新、memory candidates、rule backlog |

OpenClaw 的重要启发是：Agent Loop 里的每个关键节点都应该能被观察和插手。只要某个节点会影响真实状态，它就不应该只存在于模型的隐式思考里。

### 7.3 before_tool_call：把常见误操作挡在执行前

一个典型例子是云资源操作。用户说“重启这台机器”，Agent 可能把不同云产品的实例 ID 搞混。如果直接调用工具，轻则失败，重则操作错资源。

应该在工具调用前拦截：

```ts
function validateCloudInstanceCall(toolName: string, args: any): HookResult {
  if (toolName !== "restart_instance") return { action: "allow" };

  const { product, instanceId } = args;

  if (product === "ecs" && !instanceId.startsWith("i-")) {
    return {
      action: "block",
      reason: "Invalid ECS instance id",
      messageToAgent:
        "The instanceId does not look like an ECS instance id. ECS ids must start with `i-`. Re-check the resource type before calling the tool.",
    };
  }

  if (product === "lightweight_server" && instanceId.startsWith("i-")) {
    return {
      action: "block",
      reason: "Wrong product for instance id",
      messageToAgent:
        "This id looks like an ECS id, but product is lightweight_server. Ask the user or query inventory before executing.",
    };
  }

  return { action: "allow" };
}
```

这里不要只是提醒用户。要把错误反馈给 Agent，让它重新查资源、修参数、再发起调用。

### 7.4 after_tool_call：失败后自动进入修复循环

比如代码生成后运行测试失败，Harness 不应该只是把失败日志丢给用户。它应该要求 Agent 进入修复循环：

```text
工具调用：go test ./...
  ↓
失败
  ↓
after_tool_call 识别为测试失败
  ↓
修剪日志，保留失败包、失败用例、错误堆栈
  ↓
注入消息给 Agent：
    “测试失败。先定位根因，只修改相关文件，
     修复后重新运行同一测试。不要跳到最终答复。”
  ↓
Agent 修复
  ↓
重新测试
  ↓
最多 N 轮，仍失败则请求人工介入
```

这就是 Harness 和 Prompt 的差别。Prompt 只能说“失败后请修复”；Harness 可以让“失败后必须修复”成为运行时行为。

### 7.5 Sandbox：权限边界要分层

企业 Agent 至少需要三层沙箱：

| 层 | 控制什么 | 例子 |
|---|---|---|
| 文件系统 | 能读写哪些目录 | 只能写工作区，不能写用户家目录和密钥目录 |
| 命令执行 | 能运行哪些命令 | `npm test` 允许，`rm -rf` 审批，生产变更禁止 |
| 网络访问 | 能访问哪些域名 | 内部 API 白名单，外网默认禁止或审批 |

不要依赖模型承诺“我不会做危险事”。危险动作必须由权限系统判断。

### 7.6 HITL：人类介入点要少但硬

Human-in-the-loop 不应该到处弹窗，否则系统无法自动化。推荐只在以下位置强制人工确认：

- 需求存在无法推断的业务歧义。
- 数据删除、迁移、覆盖、生产写操作。
- 部署环境、发布窗口、回滚策略。
- 权限升级或访问敏感资源。
- 多轮自修复仍失败。

好的 HITL 问题应该带上下文：

```text
即将部署到 production。

变更摘要：
- 修改订单价格计算逻辑
- 新增 3 个单元测试
- CI 通过，42/42 tests passed

风险：
- 涉及金额字段
- 未覆盖历史订单回放

请确认是否继续部署，或指定目标环境。
```

### 7.7 一次任务应该如何穿过 Harness

以“新增订单折扣能力”为例，一个 OpenClaw 风格的任务不应该是用户说完需求后直接编码，而应该按下面的路径运行：

```text
User Request
  ↓
message_received
  - 判断任务类型：代码变更
  - 创建 change-id
  - 初始化 summary.md
  ↓
before_prompt_build
  - 加载身份和行为规则
  - 加载项目规则和 coding skill
  - 召回订单、金额、折扣相关记忆
  - 注入当前 change 状态
  ↓
Agent Plan
  - 输出 spec.md、plan.md 和 tasks.md
  - 标出需要确认的业务歧义
  ↓
HITL
  - 人确认折扣叠加规则、金额精度、灰度范围
  ↓
Coding Loop
  - 一次只改一个模块
  - after_file_edit 触发格式化或静态检查建议
  ↓
after_tool_call
  - 测试失败则进入修复循环
  - 日志过长则修剪后反馈给 Agent
  ↓
Review Gate
  - Reviewer 检查金额类型、分层、边界测试
  - MUST_FIX 不为 0 则回到 Coding Loop
  ↓
CI Gate
  - status == SUCCESS
  - total_tests > 0
  - failed_tests == 0
  ↓
Deploy Gate
  - 人确认环境和发布窗口
  ↓
session_end
  - 更新 summary.md
  - 提取长期记忆候选
  - 生成 task-retro
```

这个流程的关键不是“步骤多”，而是每一步都有明确的状态、证据和失败去向。没有这些，Agent 的长任务执行就会变成一段不可审计的聊天记录。

---

## 8. 第六层：企业 Coding Harness，从“写代码”升级到“交付变更”

阿里和 Qoder 的实践里最重要的经验是：AI 代码占比提高不等于研发效率提高。真正的研发工作包括需求澄清、方案设计、编码、测试、集成、CI、部署、验收、知识沉淀。

所以 Coding Agent 的目标不应该是“尽快生成代码”，而应该是“稳定交付一个变更”。

### 8.1 SDD：把需求写成 Agent 能执行的契约

在 Coding Harness 里，SDD 不是“多写几份文档”。它的目标是在 AI 写代码前，把模糊需求变成可评审、可拆解、可测试、可回写的工程契约。

核心原则：

- `spec.md` 是需求的单一事实源，代码只是它的派生产物。
- 人负责定义 WHAT：问题、边界、成功标准、验收条件、不做什么。
- AI 可以负责 HOW：方案草拟、任务拆解、代码实现、测试生成。
- 但 HOW 必须经过 Harness 的评审、测试和 CI 门禁，不能只靠 AI 自己说完成。

一个实用的 SDD 流程：

```text
PRD / 口头需求 / 工单
  ↓
HITL 澄清隐含业务规则
  ↓
spec.md：定义做什么、为什么做、怎么算完成
  ↓
plan.md：定义技术方案、模块边界、接口影响
  ↓
tasks.md：拆成可独立验证的原子任务
  ↓
Implement：Agent 按任务实现
  ↓
Validate：测试、Review、CI、人工验收
  ↓
回写 summary.md / spec.md / rules / skills
```

四个阶段可以这样落地：

| 阶段 | 主要问题 | 产物 | Harness 门禁 |
|---|---|---|---|
| Specify | 到底要解决什么问题 | `spec.md` | 需求评审、用户确认、验收标准可测试 |
| Plan | 用什么方案实现才不破坏系统 | `plan.md` | 架构评审、依赖评审、风险确认 |
| Implement | 按哪些小任务写代码 | `tasks.md`、代码、测试 | 每个任务有输入、输出、验证方式 |
| Validate | 怎么证明实现符合 Spec | 测试报告、Review、CI 结果 | 测试数、失败数、评审结论、部署验证 |

拿一个真实研发里很常见的需求举例：

> “订单支持新人优惠，不要影响已有活动。”

如果直接把这句话丢给 Agent，它很可能自己猜：

- 新人怎么定义。
- 优惠和已有满减、优惠券、会员价的优先级。
- 金额用什么类型。
- 历史订单回放要不要受影响。
- 哪些接口和报表要展示优惠明细。

SDD 的做法是先把这句话改成可执行的 `spec.md`：

```md
# spec.md

## Problem Statement

新用户首单可以享受新人优惠，但不能改变已有优惠券、满减、会员价的结算语义。

## Success Metrics

- 新人首单结算成功率不低于现有订单。
- 既有活动订单的最终应付金额保持不变。
- 订单明细中能审计新人优惠金额。

## User Stories

- 作为新用户，我在首单结算时可以看到新人优惠。
- 作为客服，我可以在订单详情中看到新人优惠来源。
- 作为财务，我可以区分新人优惠和已有营销优惠。

## Acceptance Criteria

- 给定首次下单用户，当订单满足新人优惠规则时，结算结果包含新人优惠明细。
- 给定非首次下单用户，结算结果不包含新人优惠。
- 给定同时命中优惠券和新人优惠的订单，优惠叠加顺序与现有营销规则一致。
- 给定历史订单回放，已完成订单金额不被重新计算。

## Non-Goals

- 不新增通用营销规则引擎。
- 不改造历史订单表结构。
- 不改变优惠券和满减的既有优先级。

## Constraints

- 金额字段必须使用 integer cents，不允许 double/float。
- 复用现有订单优惠计算入口，不新增旁路链路。
- Controller 不允许直接访问数据库。
- 所有新增分支必须有单元测试和至少一个组合优惠回归测试。
```

这份 Spec 的价值不在于“写得漂亮”，而在于它能直接变成后续工程动作：

- Reviewer 可以判断需求是否完整。
- Agent 可以基于它生成 `plan.md` 和 `tasks.md`。
- 测试 Agent 可以把 Acceptance Criteria 转成测试用例。
- CI 可以检查测试数量和失败数。
- 上线后如果发现“老用户被错误识别成新用户”，必须先更新 Spec，再修代码。

### 8.2 SDD 和 Harness 的关系：Spec 是资产，Harness 是控制面

一句话说明关系：

> SDD 定义“要交付什么”，Harness 负责“如何可控地交付”。

更准确地说，SDD 是方法论和文件协议，Harness 是承载它的工程架构。SDD 不能替代 Harness；没有 Harness，Spec 只是文档，流程仍然可以被跳过。Harness 也不能替代 SDD；没有 Spec，Harness 只能控制工具和流程，却没有稳定的需求真相源。

| SDD 资产 | 在 Harness 中的位置 | 工程作用 |
|---|---|---|
| `constitution.md` | Policy Plane + Context Plane | 项目级不可违背约束，例如 API、安全、金额类型、测试覆盖率 |
| `spec.md` | Context Plane + Evaluation Plane | 需求单一事实源，后续评审和测试都要回看它 |
| `plan.md` | State Plane + Evaluation Plane | 技术方案和架构影响，防止 Agent 边写边猜 |
| `tasks.md` | Execution Plane + State Plane | 把需求拆成可调度、可验收的小任务 |
| `review/*.md` | Evaluation Plane | 独立评审证据，决定能不能进入下一阶段 |
| `summary.md` / Handoff | State Plane | 长任务恢复、上下文压缩、跨 Agent 协作和审计 |

所以不要把 SDD 理解成“需求文档模板”，它应该被 Harness 接管成四类机制：

1. 上下文机制：每次执行都加载当前 Change 的 `summary.md`、`spec.md`、必要规则和相关 Wiki。
2. 状态机制：每个阶段更新当前状态、阻塞点、决策和证据，压缩后也能恢复。
3. 门禁机制：`spec.md`、`plan.md` 和 `tasks.md` 未评审通过，不能进入编码；CI 没有有效测试数，不能进入部署。
4. 回写机制：实现中发现隐含需求、线上问题或规则缺口，先更新 Spec 或规则，再继续执行。

这也是 SDD 位于 Context Engineering 和 Harness Engineering 交叉地带的原因：从 Context 看，Spec 是高密度、结构化上下文；从 Harness 看，Spec 是质量门禁和状态机的输入。

### 8.3 在 `.harness/changes` 里落地 SDD

推荐做法是“一个变更一个 Spec Pack”。不要把所有需求塞进一个大文档，也不要让 Agent 在聊天记录里维护状态。

```text
.harness/changes/feature-order-new-user-discount-20260510/
├── summary.md
├── request_analysis/
│   ├── raw_request.md
│   ├── open_questions.md
│   ├── spec.md
│   ├── plan.md
│   ├── tasks.md
│   └── review/
│       ├── spec_review_v1.md
│       └── tasks_review_v1.md
├── coding/
│   ├── coding_report_v1.md
│   └── review/
│       └── code_review_v1.md
├── unit_test/
│   ├── test_plan_v1.md
│   └── review/
│       └── test_review_v1.md
├── ci_result/
│   └── ci_result_v1.md
└── deployment/
    └── deploy_verify_v1.md
```

每个文件的最小职责：

| 文件 | 必须回答的问题 | 不应该写什么 |
|---|---|---|
| `raw_request.md` | 用户原话、工单、PRD 摘要是什么 | Agent 自己加工后的结论 |
| `open_questions.md` | 哪些业务规则还不清楚，谁回答了 | 已解决问题长期堆积 |
| `spec.md` | 做什么、为什么做、怎么算完成、不做什么 | 具体代码实现步骤 |
| `plan.md` | 影响哪些模块、接口、数据、依赖、风险 | 模糊的“按最佳实践实现” |
| `tasks.md` | 哪些原子任务可以独立执行和验证 | 无法验收的大任务 |
| `summary.md` | 当前阶段、决策、文件、证据、风险 | 全量复制所有日志 |

落地时按这个顺序执行：

1. 先写 `raw_request.md`，保留用户原话，避免后续丢失原始意图。
2. 让 Agent 只做需求分析，不允许写代码，输出 `open_questions.md` 和 `spec.md` 初稿。
3. 人回答关键业务问题，Agent 回写 `spec.md`，直到验收标准可测试。
4. Agent 基于 `spec.md` 生成 `plan.md` 和 `tasks.md`。
5. 独立 Reviewer 评审 `spec.md + plan.md + tasks.md`，结论只能是 `APPROVED` 或 `REVISION_REQUIRED`。
6. 只有 `APPROVED` 后才能进入编码阶段。
7. 编码过程中发现需求缺口，必须回到 Specify 或 Plan，而不是让 Coding Agent 直接补猜。
8. Validate 阶段逐条对照 Acceptance Criteria，测试和 Review 结果写入 `summary.md`。

关键规则：`spec.md` 不追求一次写对。它应该在需求澄清、方案评审、实现反馈中迭代，但每次迭代都要保留在 Change 目录里，让后续 Agent 和人类能追溯为什么这么做。

### 8.4 好 Spec 的检查清单

一个最小可用 `spec.md` 至少包含六块：

```md
# <Feature Name>

## Problem Statement

要解决的真实问题是什么？现在为什么不行？

## Success Metrics

上线后用什么指标或现象证明它有效？

## User Stories

哪些角色会使用或受到影响？

## Acceptance Criteria

每条都应该能转成测试、Review 检查或人工验收项。

## Non-Goals

这次明确不做什么，防止 Agent 扩大范围。

## Constraints

必须遵守的业务、架构、安全、性能、兼容性约束。
```

评审 Spec 时，用这些问题卡住：

- QA 能不能直接根据 Acceptance Criteria 写测试？
- 如果换一种技术实现，Spec 是否仍然成立？如果不成立，说明 Spec 写进了太多 HOW。
- 有没有写清楚不做什么？没有 Non-Goals，Agent 很容易顺手扩大范围。
- 每条约束是否能被代码评审、静态检查、测试或 CI 验证？
- 是否引用了项目级规则，例如金额类型、分层边界、日志脱敏、依赖治理？
- `tasks.md` 里的每个任务是否都有明确输入、输出和验证方式？

常见反模式和处理方式：

| 反模式 | 典型表现 | 处理方式 |
|---|---|---|
| 过度规格化 | `spec.md` 写成自然语言伪代码 | Spec 只写 WHAT，把 HOW 放到 `plan.md` |
| 规格腐烂 | 代码改了，Spec 停在旧版本 | 需求和行为变化必须先改 Spec，再改代码 |
| 规格官僚化 | 改按钮文案也走完整 SDD | 按风险分类，行为和模块变更必须走，纯展示小改可轻量化 |
| 虚假信心 | 有 Spec 就跳过 Review 和测试 | Spec 替代需求文档，不替代 Code Review |
| 工具过重 | 一开始引入复杂平台和大量模板 | 先用 `spec.md + plan.md + tasks.md + review` 跑通一个团队 |

### 8.5 推荐目录结构

可以在项目里建立 `.harness/`：

```text
.harness/
├── agents/
│   └── application-owner.md
├── rules/
│   ├── constitution.md
│   ├── engineering-structure.md
│   ├── development-process.md
│   └── coding-standard.md
├── skills/
│   ├── request-analysis/
│   ├── coding-skill/
│   ├── expert-reviewer/
│   ├── unit-test-write/
│   ├── unit-test-ci/
│   ├── deploy-verify/
│   └── code-review/
├── changes/
├── mcp/
└── wiki/
```

每一类文件的职责：

| 资产 | 职责 |
|---|---|
| agents | 定义角色和编排方式 |
| rules | 长期稳定规则，少而硬；其中 `constitution.md` 放所有 Spec 都必须遵守的项目级约束 |
| skills | 阶段性执行手册 |
| changes | 每个需求的过程资产和审计记录 |
| mcp | 外部系统工具，比如 CI、部署、日志、工单 |
| wiki | 项目知识库和历史经验 |

### 8.6 Application Owner Agent：不要写成百科，要写成索引和调度器

Qoder 实践里，Application Owner Agent 大约 400 行，不是把所有知识写进去，而是作为“索引和调度器”。

推荐结构：

```md
# Application Owner Agent

## Role

You are the owner agent for this application. Your job is to deliver changes through the required engineering process, not just write code.

## Project Context

- Business domain:
- Main modules:
- Tech stack:
- Runtime environments:

## Configuration Index

| Asset | Path | When to load | Purpose |
|---|---|---|---|
| Constitution | `.harness/rules/constitution.md` | always | non-negotiable project constraints |
| Engineering structure | `.harness/rules/engineering-structure.md` | always | architecture boundaries |
| Development process | `.harness/rules/development-process.md` | always | delivery stages |
| Coding standard | `.harness/rules/coding-standard.md` | always | code constraints |
| Request analysis | `.harness/skills/request-analysis/SKILL.md` | requirement stage | produce spec, plan and tasks |
| Coding skill | `.harness/skills/coding-skill/SKILL.md` | coding stage | implement task |
| Expert reviewer | `.harness/skills/expert-reviewer/SKILL.md` | review stage | judge plan/code |

## Responsibilities

1. Clarify requirements.
2. Decompose tasks.
3. Coordinate execution.
4. Enforce acceptance gates.
5. Maintain change documents.
6. Update project knowledge.
7. Escalate unclear or risky decisions.

## Hard Constraints

- Do not skip review because the change looks simple.
- Do not start coding before spec, plan and tasks are approved for non-trivial behavior changes.
- Do not silently fix hidden requirements during coding; update spec first.
- Do not mark CI passed unless total test count is greater than zero.
- Do not deploy without explicit environment confirmation.
- Do not modify generated files manually.
```

关键点：Owner Agent 只负责“知道去哪里找规则、什么时候加载技能、什么时候卡住流程”。它不是知识仓库。

### 8.7 十阶段交付流水线

一个可落地的企业 Coding Harness：

```text
1. 需求分析
2. 需求评审
3. 编码实现
4. 编码评审
5. 单元测试编写
6. 单元测试评审
7. 代码推送
8. CI 验证
9. 部署验证
10. 用户确认
```

每一阶段都要有：

- Entry Criteria：什么条件下才能进入。
- Skill Injection：加载哪个技能。
- Output：产出什么文件。
- Quality Gate：如何判定通过。
- Rollback：失败回到哪个阶段。

其中前两阶段要特别硬：

- 需求分析阶段必须产出 `spec.md`、`plan.md`、`tasks.md`，并把未澄清问题写入 `open_questions.md`。
- 需求评审阶段必须独立评审这些文件，结论为 `REVISION_REQUIRED` 时回到需求分析，不能让 Coding Agent 带着疑问开写。

示例：

```text
阶段：CI 验证

Entry Criteria:
- 代码已经通过本地测试
- 单元测试评审已通过
- 变更摘要已更新

Skill Injection:
- unit-test-ci

Output:
- changes/<change-id>/ci_result/ci_result_v1.md

Quality Gate:
- CI status == SUCCESS
- total_tests > 0
- passed_tests == total_tests
- failed_tests == 0

Rollback:
- total_tests == 0：回到单元测试编写
- 编译失败：回到编码实现
- 用例失败：回到编码实现或单元测试编写，由失败类型决定
```

这比“CI 通过就行”可靠得多。实践里经常出现 CI 显示成功但没有跑任何测试的情况，Harness 必须检查测试数量。

### 8.8 Change 目录：每个需求都有过程资产

每个变更创建一个目录：

```text
.harness/changes/feature-order-discount-20260510/
├── summary.md
├── request_analysis/
│   ├── raw_request.md
│   ├── open_questions.md
│   ├── spec.md
│   ├── plan.md
│   ├── tasks.md
│   └── review/
│       ├── spec_review_v1.md
│       └── tasks_review_v1.md
├── coding/
│   ├── coding_report_v1.md
│   └── review/
│       └── code_review_v1.md
├── unit_test/
│   ├── test_plan_v1.md
│   └── review/
│       └── test_review_v1.md
├── ci_result/
│   └── ci_result_v1.md
└── deployment/
    └── deploy_verify_v1.md
```

`summary.md` 是单一事实源：

```md
# Change Summary

## Request

用户原始需求和业务目标。

## Scope

本次变更包含什么，不包含什么。

## Current Stage

coding-review

## Decisions

- 使用已有订单优惠计算入口，不新增独立链路。
- 金额继续使用 long cents。

## Files Changed

- `src/order/DiscountService.java`
- `src/order/DiscountServiceTest.java`

## Quality Gates

- Requirement review: passed
- Code review: pending
- Unit tests: not started
- CI: not started
- Deployment: not started

## Risks

- 历史订单回放未覆盖。
```

这样做的价值：

- Agent 压缩上下文后仍能恢复。
- 人类可以审计过程。
- 子 Agent 可以围绕文件协作。
- Acceptance Criteria 可以直接转成测试计划和验收证据。
- 失败后能回滚到明确阶段。

### 8.9 评审要独立：执行者和裁判分开

同一个 Agent 写代码后再自评，很容易放过问题。推荐至少拆成：

| 角色 | 权限 | 职责 |
|---|---|---|
| Coding Agent | 可编辑文件 | 实现变更 |
| Expert Reviewer | 只读 | 按规则审查设计和代码 |
| Verification Agent | 只读，可运行测试和浏览器 | 试图证明实现有问题 |

Reviewer 输出必须结构化：

```md
# Review Result

## Verdict

MUST_FIX

## Findings

### Finding 1

Priority: MUST_FIX

Problem:
订单优惠金额使用 double 计算，违反金额字段必须使用 integer cents 的规则。

Suggestion:
改为 long cents，并补充边界测试。

Evidence:
`DiscountService.calculate()` 中存在 double 类型金额计算。

## Required Actions

1. 修改金额计算类型。
2. 增加小数精度回归测试。
```

没有明确优先级、问题、建议和证据的 Review，不能作为质量门禁。

### 8.10 迭代次数要有上限

Agent 可能陷入反复修复。Harness 要设置上限：

- 需求评审最多 3 轮，仍不清楚就问人。
- 编码评审最多 2 轮，仍不过就升级给人。
- 测试修复最多 3 轮，仍失败就输出诊断报告。
- 部署验证失败 1 次就暂停，避免自动扩大影响。

上限不是为了打断自动化，而是为了避免 Agent 在错误方向上无限消耗。

---

## 9. 第七层：多 Agent，不是越多越好，而是隔离上下文和责任

Claude Code 和 Anthropic 的实践都说明，多 Agent 的主要价值不是“并行炫技”，而是：

- 避免主上下文污染。
- 隔离权限。
- 让不同角色使用不同模型和工具。
- 把执行者和验证者分开。

### 9.1 推荐角色

| Agent | 权限 | 典型任务 |
|---|---|---|
| Main / Owner | 编排，不一定直接写代码 | 理解需求、分配任务、维护变更状态 |
| Explore Agent | 只读 | 搜索代码、定位相关文件、整理现状 |
| Plan Agent | 只读 | 制定实现方案、风险分析 |
| Coding Agent | 可编辑 | 按任务实现 |
| Verification Agent | 只读，可运行测试/浏览器 | 证明功能真的工作 |
| Memory Agent | 只写记忆系统 | 提炼长期经验 |

Explore Agent 的价值很大：它可以深入查代码，但不把大量搜索结果塞进主上下文，只返回结论、关键文件和证据。

### 9.2 Verification Agent 的提示词要“找问题”，不是“帮忙确认”

很多验证失败，是因为提示词写成了：

> 请验证实现是否正确。

这会让模型倾向于确认。更好的方式：

```md
# Verification Agent

Your job is to find reasons this implementation might be wrong.

You are read-only. Do not edit project files.
You may run tests, inspect logs, start the app, call APIs, and use a browser.

You must verify behavior from the user's perspective, not only inspect code.

For each issue, report:

- what failed
- how to reproduce it
- expected behavior
- actual behavior
- evidence
- severity

If you cannot find an issue, state what you tested and what remains untested.
```

按任务类型给它不同检查策略：

| 类型 | 验证方式 |
|---|---|
| 前端 | 启动服务，用浏览器点击真实流程，检查网络请求和控制台错误 |
| API | curl 真实接口，检查状态码、错误体、边界参数 |
| CLI | 检查 stdout、stderr、exit code、文件副作用 |
| 数据库迁移 | dry-run、schema diff、回滚路径 |
| Bugfix | 先复现旧 bug，再验证新行为 |
| 重构 | 跑测试、检查公共 API、比较行为差异 |

### 9.3 长任务：Planner / Generator / Evaluator

Anthropic 的长任务实践里，一个有效模式是：

```text
Planner：把用户的一句话扩展成产品规格和验收标准
Generator：按一个 sprint 或一个功能实现
Evaluator：用真实工具验证功能，给出评分和阻塞问题
```

这里有一个重要教训：Planner 不要把实现细节写得过死。过细的计划会让后续错误级联。Planner 应该定义产品目标、验收标准、关键约束，让 Generator 自己根据代码现状实现。

每轮 sprint 可以这样：

```text
Generator:
  - 本轮准备做什么
  - 计划修改哪些模块
  - 如何验证

Evaluator:
  - 是否同意本轮范围
  - 是否补充验收点

Generator:
  - 实现
  - 自测
  - 记录变更

Evaluator:
  - 真实运行
  - 点击 / 调接口 / 查数据库
  - 给出 PASS 或 MUST_FIX
```

Evaluator 不能只看代码。它必须通过真实环境验证，否则很容易被“看起来正确”的实现骗过。

---

## 10. 第八层：一个完整落地案例，用户反馈自动处理 Harness

下面用一个更接地气的场景说明 Harness 如何设计：每天有大量用户反馈，过去人工导出 Excel、清洗、分类、建单、查日志、定位问题，每个问题研发要花 30 分钟以上。

目标不是让 Agent “回复用户”，而是构建一条 7x24 自动处理流水线。

### 10.1 流水线设计

```text
用户反馈进入
  ↓
Issue Classification
  - 无效反馈过滤
  - 产品建议 / Bug / 咨询分类
  - 业务域分类
  ↓
Issue Clustering
  - 相似反馈聚类
  - 截图、环境、错误信息辅助判断
  - 时间窗口和热度衰减
  ↓
Root Cause Analysis
  - 拉取日志
  - 搜索代码
  - 分析调用链
  - 输出根因和修复建议
  ↓
Auto Fix
  - 高置信度问题进入工作区修复
  - 生成 Code Review
  - 人类最终确认
  ↓
Retro
  - 总结本次处理哪里低效
  - 更新 Skill 和规则
```

### 10.2 模型分层

不要所有步骤都用最强模型：

| 阶段 | 推荐模型 |
|---|---|
| 分类 | 便宜、稳定、快速模型 |
| 聚类 | 中等模型，关注语义相似 |
| 日志根因分析 | 强模型 |
| 代码修复 | 强模型 |
| 自我复盘和规则更新 | 中强模型 |

但也不要机械省钱。复杂任务用弱模型可能会反复失败，最终更贵。模型选择要看“总成本”，包括调用次数、失败返工、人类介入成本。

### 10.3 CLI Harness

Qoder CLI 这类 Headless Agent 适合做自动流水线，因为它具备：

- 进程隔离。
- 并发执行。
- JSON 输出。
- 最大轮数限制。
- 工作区隔离。
- 可被外部调度系统调用。

示例：

```bash
qodercli -p "分析 feedback-123 的日志并输出根因" --max-turns 80 --output-format=json
```

自动修复时：

```bash
timeout 1800 qodercli -p "修复 task-123456 的失败问题，完成后生成 review 报告" --yolo --worktree
```

关键是外层 Harness 要控制：

- 超时时间。
- 最大轮数。
- 工作区。
- 输出格式。
- 成功判定。
- 失败重试和升级。

### 10.4 自我改进机制

每次任务结束都生成复盘：

```md
# task-retro

## What Worked

- 日志检索命中了关键 traceId。

## What Failed

- 第一次分析遗漏了移动端版本号。

## Wasted Steps

- 重复查询了同一段日志 3 次。

## Skill Updates

- 在 log-analysis skill 中增加：先读取 app version、platform、traceId。

## New Rules

- 没有 traceId 时，先按 userId + time window 查询候选请求。
```

然后由 Pipeline Agent 把高价值教训更新到 Skill，而不是只留在聊天记录里。

---

## 11. 质量门禁：把“看起来完成”变成“证据完成”

Agent 很容易过早宣布完成。Harness 必须把完成定义成证据。

质量门禁有一个硬原则：

> 不能被机器或独立角色验证的门禁，不要叫门禁，只能叫建议。

所以门禁不要写成“代码质量良好”“测试充分”“部署正常”这种主观句子，而要写成可判定契约：

```text
Gate:
  name: ci_verify

Inputs:
  - ci_status
  - total_tests
  - passed_tests
  - failed_tests
  - ci_url

Pass:
  - ci_status == SUCCESS
  - total_tests > 0
  - passed_tests == total_tests
  - failed_tests == 0

Fail:
  - ci_status != SUCCESS -> rollback to coding
  - total_tests == 0 -> rollback to unit_test
  - failed_tests > 0 -> rollback to coding

Evidence:
  - ci_url
  - parsed test summary
  - failed test names if any
```

一个合格的质量门禁必须包含输入、通过条件、失败条件、证据和回退阶段。缺少任何一项，Agent 就容易把“我觉得可以了”当成“系统确认通过”。

### 11.1 代码任务完成标准

一个代码任务至少需要：

```text
需求：
- spec.md 已生成
- 验收标准明确
- 范围外内容明确

实现：
- 代码已修改
- 变更文件列表明确
- 无无关重构

测试：
- 相关单元测试已运行
- 测试数量 > 0
- 失败用例为 0
- 如无法运行，说明原因和替代验证

评审：
- Reviewer 输出存在
- MUST_FIX 为 0
- LOW/INFO 有记录

交付：
- summary.md 更新
- 风险和遗留问题明确
- 需要人工确认的事项没有被自动跳过
```

### 11.2 前端任务完成标准

前端不要只看编译通过：

```text
- 本地服务能启动
- 浏览器能打开目标页面
- 关键用户路径可点击
- 控制台无关键错误
- 网络请求符合预期
- 移动端和桌面端至少各检查一次
- 文案没有溢出或遮挡
- 加载、空态、错误态可用
```

### 11.3 API 任务完成标准

```text
- 正常请求返回正确状态码和响应体
- 缺失参数、非法参数、权限不足都有测试
- 错误响应结构稳定
- 日志中有可定位信息
- 超时和下游失败有处理
- API 文档或契约已更新
```

### 11.4 部署任务完成标准

```text
- 目标环境由人确认
- 变更版本明确
- CI 通过且测试数量有效
- 部署命令参数明确
- 验证 URL / API / 监控指标明确
- 回滚方式明确
```

---

## 12. 30 天落地计划

不要一开始就做一个完整平台。建议按 30 天拆。

第一个落地场景要精挑细选。太简单的 Demo 证明不了 Harness，太复杂的生产核心链路又会把团队拖进组织协调和历史包袱里。推荐用下面的标准选：

| 选择标准 | 推荐 | 不推荐 |
|---|---|---|
| 风险等级 | 低到中风险，可回滚 | 生产写数据、资金、权限、批量删除 |
| 需求形态 | 有真实业务规则和验收标准 | 纯文案、纯样式、一次性脚本 |
| 技术范围 | 涉及 1-3 个模块 | 横跨多个系统和多个团队 |
| 验证方式 | 能本地测试、CI、人工验收 | 只能上线后看用户反馈 |
| 知识沉淀价值 | 能抽出项目规则、Spec 模板、评审项 | 做完就丢，没有复用价值 |

一个合格的 30 天目标不是“上线一个平台”，而是“让一个真实变更完整穿过 SDD + Harness，并且留下可复用资产”。只要第一次闭环跑通，后续扩展到更多团队和更多 Agent 才有基础。

### 第 1 周：把项目知识结构化

目标：让 Agent 不再靠猜。

交付物：

- `AGENTS.md`
- `.agent/IDENTITY.md`
- `.agent/WORKSPACE.md`
- `.agent/TOOLS.md`
- `.agent/MEMORY.md`
- 基础项目 Wiki

验收：

- 新会话能按固定流程读取项目规则。
- Agent 能说明项目结构、测试命令、禁止事项。
- 至少沉淀 10 条真实项目规则。

### 第 2 周：建立变更流水线

目标：让每个需求有过程资产。

交付物：

- `.harness/agents/application-owner.md`
- `.harness/rules/constitution.md`
- `.harness/rules/development-process.md`
- `.harness/skills/request-analysis/SKILL.md`
- `.harness/skills/coding-skill/SKILL.md`
- `.harness/skills/expert-reviewer/SKILL.md`
- `.harness/changes/<change-id>/summary.md`

验收：

- 每个非平凡行为变更生成 `spec.md`、`plan.md`、`tasks.md`、`summary.md`。
- `spec.md` 包含 Problem、Success Metrics、User Stories、Acceptance Criteria、Non-Goals、Constraints。
- 需求评审未通过时，流程回到需求分析，不能进入编码。
- 简单需求也经过需求分析、编码、评审、测试记录。
- Review 输出包含问题、建议、优先级、证据。

### 第 3 周：加入 Harness 控制

目标：让关键动作不可跳过。

交付物：

- before_tool_call 参数校验。
- after_tool_call 测试失败修复循环。
- 文件系统和命令权限策略。
- CI 结果解析器。
- HITL 节点。

验收：

- 错误实例 ID 会被拦截。
- CI 通过但测试数为 0 会失败。
- 生产部署必须人工确认。
- 测试失败后 Agent 会自动修复，最多 N 轮后升级。

### 第 4 周：加入记忆、多 Agent 和自我改进

目标：让系统可持续变好。

交付物：

- 长期记忆写入与召回。
- Explore / Reviewer / Verification Agent。
- task-retro 复盘机制。
- Skill 更新流程。

验收：

- 用户偏好能在新会话被召回。
- 历史失败能转成规则或 Skill。
- Verification Agent 能发现至少一类真实问题。
- 主上下文不再被大量搜索结果污染。

---

## 13. 可直接复制的 Harness 配置清单

### 13.1 最小可用目录

```text
.agent/
├── IDENTITY.md
├── WORKSPACE.md
├── TOOLS.md
├── MEMORY.md
└── HEARTBEAT.md

.harness/
├── agents/
│   └── application-owner.md
├── rules/
│   ├── constitution.md
│   ├── development-process.md
│   └── coding-standard.md
├── skills/
│   ├── request-analysis/
│   ├── coding-skill/
│   ├── expert-reviewer/
│   └── unit-test-ci/
└── changes/
    └── <change-id>/
        ├── summary.md
        └── request_analysis/
            ├── spec.md
            ├── plan.md
            └── tasks.md
```

### 13.2 最小 Hook 集合

```ts
const hooks = {
  before_prompt_build: [
    injectWorkspaceRules,
    injectRelevantMemory,
    injectRuntimeState,
  ],
  before_tool_call: [
    validateDangerousCommands,
    validateCloudResourceIds,
    enforceFilesystemBoundary,
  ],
  after_tool_call: [
    pruneLargeToolOutput,
    classifyToolFailure,
    triggerTestRepairLoop,
  ],
  session_end: [
    writeChangeSummary,
    extractMemoryCandidates,
    generateTaskRetro,
  ],
};
```

### 13.3 最小质量门禁

```ts
type QualityGateResult = {
  passed: boolean;
  gate: string;
  evidence: string[];
  blockingIssues: string[];
  nextStage?: string;
  rollbackStage?: string;
};

type RequirementReviewResult = {
  verdict: "APPROVED" | "REVISION_REQUIRED";
  files: {
    spec: boolean;
    plan: boolean;
    tasks: boolean;
  };
  missingSpecSections: string[];
  blockingIssues: string[];
  evidence: string[];
};

function requirementGate(result: RequirementReviewResult): QualityGateResult {
  const missingFiles = Object.entries(result.files)
    .filter(([, exists]) => !exists)
    .map(([name]) => name);

  const blockingIssues = [
    ...missingFiles.map((name) => `${name}.md is missing`),
    ...result.missingSpecSections.map((section) => `spec.md missing ${section}`),
    ...result.blockingIssues,
  ];

  if (result.verdict !== "APPROVED" || blockingIssues.length > 0) {
    return {
      passed: false,
      gate: "requirement-review",
      evidence: result.evidence,
      blockingIssues,
      rollbackStage: "requirement-analysis",
    };
  }

  return {
    passed: true,
    gate: "requirement-review",
    evidence: result.evidence,
    blockingIssues: [],
    nextStage: "coding",
  };
}

function ciGate(result: CiResult): QualityGateResult {
  if (result.status !== "SUCCESS") {
    return {
      passed: false,
      gate: "ci",
      evidence: [result.url],
      blockingIssues: ["CI status is not SUCCESS"],
      rollbackStage: "coding",
    };
  }

  if (result.totalTests <= 0) {
    return {
      passed: false,
      gate: "ci",
      evidence: [result.url],
      blockingIssues: ["CI passed but no tests were executed"],
      rollbackStage: "unit-test-write",
    };
  }

  if (result.failedTests > 0) {
    return {
      passed: false,
      gate: "ci",
      evidence: [result.url],
      blockingIssues: [`${result.failedTests} tests failed`],
      rollbackStage: "coding",
    };
  }

  return {
    passed: true,
    gate: "ci",
    evidence: [result.url, `${result.totalTests} tests passed`],
    blockingIssues: [],
    nextStage: "deploy-verify",
  };
}
```

### 13.4 最小变更状态机

```text
draft
  ↓
requirement_analysis
  ↓
requirement_review
  ↓
coding
  ↓
code_review
  ↓
unit_test
  ↓
ci_verify
  ↓
deploy_verify
  ↓
user_confirmed
  ↓
done
```

失败回退：

```text
spec / plan / tasks missing -> requirement_analysis
requirement_review failed -> requirement_analysis
code_review failed -> coding
unit_test failed -> coding
ci total_tests == 0 -> unit_test
ci compile failed -> coding
deploy params unclear -> human_confirm
deploy failed -> stop_and_escalate
```

---

## 14. 上线后怎么运营 Harness

Harness 上线后不能只看“AI 代码占比”。这个指标容易误导团队，因为代码生成只是交付链路的一小段。更应该看系统是否减少返工、降低风险、缩短定位时间。

推荐监控这些指标：

| 指标 | 说明 | 异常信号 |
|---|---|---|
| Requirement Clarification Rate | 需求阶段触发澄清的比例 | 过低可能说明 Agent 在猜，过高可能说明规则太保守 |
| Spec Approval Rate | `spec.md / plan.md / tasks.md` 一次评审通过率 | 长期过低说明需求模板、项目 Wiki 或 Agent 分析 Skill 不够 |
| Spec Drift Count | 代码行为变化但 Spec 未更新的次数 | 说明 SDD 没有接入门禁，只停留在文档层 |
| Gate Pass Rate | 各质量门禁一次通过率 | 某门禁长期失败说明前置上下文或技能缺失 |
| Repair Loop Count | 每个任务平均自修复轮数 | 轮数过高说明 Agent 在盲修，需要更强诊断 Skill |
| Human Escalation Rate | 需要人介入的比例 | 过高说明自动化不足，过低可能说明风险没有被识别 |
| Verification Catch Rate | Verification Agent 发现真实问题的比例 | 过低可能是验证提示词太弱或只测 happy path |
| Context Compact Recovery Rate | 压缩后任务是否能继续 | 恢复失败说明 compact 模板丢了关键状态 |
| Memory Hit Utility | 被召回记忆是否真的帮助当前任务 | 低说明召回噪音大或记忆质量差 |
| Rule Backlog Aging | 真实失败转成规则/Skill 的耗时 | 过长说明学习闭环断了 |

每周应该做一次 Harness 运营复盘：

```text
1. 选出失败最多的 3 类任务。
2. 回看失败发生在哪个平面：Context、Policy、Execution、Evaluation、State、Learning。
3. 判断是缺规则、缺工具、缺门禁，还是门禁太粗。
4. 只把真实失败沉淀为规则，不因为想象风险堆规则。
5. 为新增规则补一个可验证门禁或示例。
```

好的 Harness 会逐渐变薄：高频失败被规则和工具消化，低频复杂问题交给人。坏的 Harness 会逐渐变厚：每次事故都加一大段 Prompt，最后没人知道哪条规则真正生效。

---

## 15. 常见反模式

### 15.1 把规则全塞进一个超长 Prompt

问题：

- 难维护。
- 不同任务都加载同样内容。
- 模型注意力被稀释。

改法：

- 拆成模块。
- 按场景拼装。
- 用技能做渐进加载。

### 15.2 只看 CI 状态，不看测试数量

问题：

- CI 可能成功但没有执行任何测试。
- 配置错误会被误判为通过。

改法：

- 解析测试数量。
- 检查失败数。
- 保存 CI 证据。

### 15.3 让写代码的 Agent 自己最终验收

问题：

- 自我确认偏差。
- 容易只验证 happy path。

改法：

- 引入只读 Verification Agent。
- 用真实环境验证。
- 输出复现步骤和证据。

### 15.4 长期记忆变成垃圾桶

问题：

- 陈旧信息污染任务。
- 重复、低价值、错误记忆越来越多。

改法：

- 写入前做判断。
- 用 INSERT / UPDATE / SKIP / DELETE。
- 加时间衰减和删除能力。

### 15.5 Harness 一开始设计太重

问题：

- 团队无法坚持。
- 简单任务成本过高。

改法：

- 先做最小流程。
- 每条规则来自真实失败。
- 质量门禁尽量机械可验证。

### 15.6 把 SDD 当成普通文档

问题：

- `spec.md` 写完后不再更新。
- Coding Agent 可以绕过 Spec 直接改代码。
- Review 只看代码，不回看 Acceptance Criteria。

改法：

- 把 Spec Pack 放进 `.harness/changes/<change-id>/`，作为每个变更的状态资产。
- 代码行为变化时先更新 `spec.md` 或 `plan.md`。
- 需求评审、代码评审、测试评审都必须引用 Acceptance Criteria。

---

## 16. 最后：成熟度模型

可以用下面的表判断团队当前在哪一层：

| 等级 | 特征 | 主要风险 | 下一步 |
|---|---|---|---|
| L0 Chat | 靠聊天窗口和临时 Prompt | 不稳定、不可复现 | 建立项目入口文档 |
| L1 Prompt | 有系统提示词和角色定义 | 规则堆积、难维护 | Prompt 模块化 |
| L2 Context | 有项目规则、技能、记忆 | 上下文爆炸、召回不准 | 分层加载和压缩 |
| L3 Harness | 有 hooks、权限、质量门禁 | 流程过重或覆盖不全 | 用真实失败迭代规则 |
| L4 Managed Agent | 多 Agent、审计、自动修复、自我改进 | 复杂度高 | 稳定接口、指标化运营 |

真正的目标不是“AI 写了多少代码”，而是：

- 需求能不能被正确澄清。
- 变更能不能被稳定交付。
- 错误能不能被系统发现。
- 经验能不能沉淀到下一次。
- 高风险动作能不能被控制住。

Prompt Engineering 是入口，Context Engineering 是地基，Harness Engineering 才是企业 Agent 真正可落地的工程形态。
