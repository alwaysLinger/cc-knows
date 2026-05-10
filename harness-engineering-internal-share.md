# 从 Prompt Engineering 到 Harness Engineering：企业 Agent 落地教程

这份文档面向公司内部的 Agent 工程建设。它不是提示词技巧合集，也不是论文式综述，而是一份可以直接拿去落地的工程教程：如何从“写一个好 Prompt”，逐步升级到“构建一个可控、可验证、可迭代的 Agent Harness”。

核心结论很简单：

- Prompt Engineering 解决“模型应该怎么说、怎么想”的问题。
- Context Engineering 解决“模型此刻应该看到什么”的问题。
- Harness Engineering 解决“模型不能只靠自觉，系统如何约束、驱动、验证它”的问题。

如果团队只停留在 Prompt Engineering，系统很容易表现得像一个聪明但不稳定的助手；进入 Context Engineering 后，它开始知道项目、用户、历史和工具；真正进入 Harness Engineering 后，它才开始像一个可交付的软件系统：有流程、有边界、有检查、有回滚、有责任链。

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

### 4.2 技能系统：渐进式加载，不要一次塞满

OpenClaw 和 Claude Code 都体现了同一个经验：工具、技能、规则不能一次性全塞进上下文。正确方式是渐进式披露：

```text
第一层：只加载技能名称和一句话描述
第二层：任务命中后读取该技能的 SKILL.md
第三层：只有真正需要时才加载脚本、模板、示例
```

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

---

## 8. 第六层：企业 Coding Harness，从“写代码”升级到“交付变更”

阿里和 Qoder 的实践里最重要的经验是：AI 代码占比提高不等于研发效率提高。真正的研发工作包括需求澄清、方案设计、编码、测试、集成、CI、部署、验收、知识沉淀。

所以 Coding Agent 的目标不应该是“尽快生成代码”，而应该是“稳定交付一个变更”。

### 8.1 推荐目录结构

可以在项目里建立 `.harness/`：

```text
.harness/
├── agents/
│   └── application-owner.md
├── rules/
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
| rules | 长期稳定规则，少而硬 |
| skills | 阶段性执行手册 |
| changes | 每个需求的过程资产和审计记录 |
| mcp | 外部系统工具，比如 CI、部署、日志、工单 |
| wiki | 项目知识库和历史经验 |

### 8.2 Application Owner Agent：不要写成百科，要写成索引和调度器

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
| Engineering structure | `.harness/rules/engineering-structure.md` | always | architecture boundaries |
| Development process | `.harness/rules/development-process.md` | always | delivery stages |
| Coding standard | `.harness/rules/coding-standard.md` | always | code constraints |
| Request analysis | `.harness/skills/request-analysis/SKILL.md` | requirement stage | produce spec and tasks |
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
- Do not mark CI passed unless total test count is greater than zero.
- Do not deploy without explicit environment confirmation.
- Do not modify generated files manually.
```

关键点：Owner Agent 只负责“知道去哪里找规则、什么时候加载技能、什么时候卡住流程”。它不是知识仓库。

### 8.3 十阶段交付流水线

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

### 8.4 Change 目录：每个需求都有过程资产

每个变更创建一个目录：

```text
.harness/changes/feature-order-discount-20260510/
├── summary.md
├── request_analysis/
│   ├── spec.md
│   ├── tasks.md
│   └── review/
│       └── review_v1.md
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
- 失败后能回滚到明确阶段。

### 8.5 评审要独立：执行者和裁判分开

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

### 8.6 迭代次数要有上限

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
- `.harness/rules/development-process.md`
- `.harness/skills/request-analysis/SKILL.md`
- `.harness/skills/coding-skill/SKILL.md`
- `.harness/skills/expert-reviewer/SKILL.md`
- `.harness/changes/<change-id>/summary.md`

验收：

- 每个需求生成 spec、tasks、summary。
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
│   ├── development-process.md
│   └── coding-standard.md
├── skills/
│   ├── request-analysis/
│   ├── coding-skill/
│   ├── expert-reviewer/
│   └── unit-test-ci/
└── changes/
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
requirement_review failed -> requirement_analysis
code_review failed -> coding
unit_test failed -> coding
ci total_tests == 0 -> unit_test
ci compile failed -> coding
deploy params unclear -> human_confirm
deploy failed -> stop_and_escalate
```

---

## 14. 常见反模式

### 14.1 把规则全塞进一个超长 Prompt

问题：

- 难维护。
- 不同任务都加载同样内容。
- 模型注意力被稀释。

改法：

- 拆成模块。
- 按场景拼装。
- 用技能做渐进加载。

### 14.2 只看 CI 状态，不看测试数量

问题：

- CI 可能成功但没有执行任何测试。
- 配置错误会被误判为通过。

改法：

- 解析测试数量。
- 检查失败数。
- 保存 CI 证据。

### 14.3 让写代码的 Agent 自己最终验收

问题：

- 自我确认偏差。
- 容易只验证 happy path。

改法：

- 引入只读 Verification Agent。
- 用真实环境验证。
- 输出复现步骤和证据。

### 14.4 长期记忆变成垃圾桶

问题：

- 陈旧信息污染任务。
- 重复、低价值、错误记忆越来越多。

改法：

- 写入前做判断。
- 用 INSERT / UPDATE / SKIP / DELETE。
- 加时间衰减和删除能力。

### 14.5 Harness 一开始设计太重

问题：

- 团队无法坚持。
- 简单任务成本过高。

改法：

- 先做最小流程。
- 每条规则来自真实失败。
- 质量门禁尽量机械可验证。

---

## 15. 最后：成熟度模型

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
