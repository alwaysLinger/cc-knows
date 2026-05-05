# AI Agent 评估解密

发布于 2026 年 1 月 9 日

让 Agent 有用的能力，也让它们难以评估。跨部署场景有效的策略，是将多种技术组合以匹配其所衡量系统的复杂性。

## 引言

好的评估（evaluations）帮助团队更有信心地交付 AI Agent。没有评估，团队很容易陷入被动循环——只在生产环境中发现问题，而修复一个故障又会引发另一个。评估让问题和行为变化在影响用户之前变得可见，其价值在 Agent 的生命周期中复利增长。

正如我们在[构建有效的 Agent](https://www.anthropic.com/engineering/building-effective-agents)中所描述的，Agent 在多轮中运行：调用工具、修改状态、根据中间结果进行调整。这些让 AI Agent 有用的能力——自主性（autonomy）、智能性（intelligence）和灵活性（flexibility）——同样使它们更难被评估。

通过我们的内部工作以及与 Agent 开发前沿客户的合作，我们学到了如何为 Agent 设计更严谨、更有用的评估。以下是在各种 Agent 架构和真实部署用例中验证有效的经验。

## 评估的结构

一次**评估**（"eval"）是对 AI 系统的测试：给定 AI 一个输入，然后对其输出应用评分逻辑来衡量成功。在本文中，我们聚焦于开发阶段无需真实用户即可运行的**自动化评估**。

**单轮评估**（single-turn evaluations）较直观：一个提示、一个响应和评分逻辑。对于早期的 LLM，单轮、非 Agent 式的评估是主要的评估方法。随着 AI 能力的进步，**多轮评估**（multi-turn evaluations）变得越来越普遍。

在简单的评估中，Agent 处理一个提示，评分器（grader）检查输出是否符合预期。在更复杂的多轮评估中，编码 Agent 接收工具、任务（在此例中是构建一个 MCP 服务器）和环境，执行"Agent 循环"（工具调用和推理），并用实现更新环境。评分随后使用单元测试来验证可工作的 MCP 服务器。

**Agent 评估**更加复杂。Agent 在多轮中使用工具，在环境中修改状态并动态适应——这意味着错误可能传播和叠加。前沿模型还能找到超越静态评估限制的创造性解决方案。例如，Opus 4.5 通过"发现策略中的漏洞"解决了一个 [𝜏2-bench](https://github.com/sierra-research/tau2-bench) 中关于预订航班的问题。它按照评估的书面标准"失败"了，但实际上为用户找到了更好的解决方案。

在构建 Agent 评估时，我们使用以下定义：

- 一个**任务**（task，又称 **问题/problem** 或 **测试用例/test case**）是具有定义输入和成功标准的单次测试。
- 对任务的每次尝试是一个**试验**（trial）。由于模型输出在运行间存在变化，我们进行多次试验以产生更一致的结果。
- 一个**评分器**（grader）是对 Agent 某方面表现进行评分的逻辑。一个任务可以有多个评分器，每个评分器包含多个断言（assertions，有时称为 **检查/checks**）。
- 一个**轨迹**（transcript，也称为 **追踪/trace** 或 **路径/trajectory**）是试验的完整记录。对于 Anthropic API，这是评估运行结束时的完整 messages 数组。
- **结果**（outcome）是试验结束时环境中的最终状态。
- 一个**评估框架**（evaluation harness）是端到端运行评估的基础设施。
- 一个**Agent 框架**（agent harness，或 **脚手架/scaffold**）是使模型能够作为 Agent 行动的系统。
- 一个**评估套件**（evaluation suite）是为衡量特定能力或行为而设计的任务集合。

## 为什么要构建评估？

当团队刚开始构建 Agent 时，通过手动测试、内部试用（dogfooding）和直觉，可以走得相当远。但在早期原型阶段之后，没有评估的开发就会出问题。

转折点通常出现在用户报告 Agent 在变更后感觉变差了，而团队"盲目飞行"，除了猜测和试错别无他法来验证。没有评估，调试是被动的：等待投诉、手动复现、修复 bug，然后祈祷没有其他回归。

我们见过这种进程反复上演。例如，Claude Code 从基于反馈的快速迭代开始，然后增加了对简洁性和文件编辑等窄领域的评估，后来又增加了对过度工程（over-engineering）等复杂行为的评估。这些评估帮助识别问题、指导改进并聚焦研究-产品协作。

在任何阶段编写评估都是有用的。早期，它们迫使产品团队明确成功的含义。两位工程师阅读同一份初始规格可能对边缘情况有不同理解；评估套件能解决这种歧义。

评估还影响你采用新模型的速度。没有评估的团队面临数周的测试，而有评估的竞对可以快速确定模型优势、调整提示并在数天内完成升级。

评估一旦存在，你就免费获得了基线和回归测试：延迟、token 用量、单位任务成本和错误率可以在固定的任务库上追踪。评估还可以成为产品团队和研究团队之间最高带宽的沟通渠道，定义研究人员可以优化的指标。

## 如何评估 AI Agent

我们看到当今大规模部署的几种常见 Agent 类型，包括编码 Agent、研究 Agent、计算机使用 Agent 和对话 Agent。每种类型可能跨行业部署，但可以使用类似的技术进行评估。

### Agent 的评分器类型

Agent 评估通常组合三种类型的评分器：基于代码的、基于模型的和基于人工的。每个评分器评估轨迹或结果的某部分。

#### 基于代码的评分器（Code-based graders）

- **方法**：字符串匹配检查、二值测试、静态分析、结果验证、工具调用验证、轨迹分析
- **优势**：快速、便宜、客观、可复现、易于调试、验证特定条件
- **劣势**：对合理变化脆弱、缺乏细微度、对主观任务能力有限

#### 基于模型的评分器（Model-based graders）

- **方法**：评分规则（rubric）评分、自然语言断言、成对比较、基于参考的评估、多评判共识
- **优势**：灵活、可扩展、捕获细微差别、处理开放式任务、处理自由格式输出
- **劣势**：非确定性、比代码评分器昂贵、需与人工评分器校准

#### 基于人工的评分器（Human graders）

- **方法**：领域专家（SME）评审、众包判断、抽查采样、A/B 测试、标注者间一致性
- **优势**：金标准质量、匹配专家用户判断、用于校准基于模型的评分器
- **劣势**：昂贵、缓慢、通常需要大规模的人类专家

对于每个任务，评分可以是加权的（组合评分器分数必须达到阈值）、二值的（所有评分器必须通过）或混合的。

### 能力评估 vs 回归评估

- **能力评估**（capability 或 "quality" evals）：问的是"这个 Agent 擅长做什么？"它们从低通过率开始，针对 Agent 感到困难的任务。
- **回归评估**（regression evals）：问的是"Agent 是否仍然能处理以前能做的所有任务？"它们应接近 100% 的通过率。

在 Agent 启动并优化后，高通过率的能力评估可以"毕业"为回归评估套件。

### 评估编码 Agent

**编码 Agent**（Coding agents）编写、测试和调试代码，像人类开发者一样导航代码库。有效的评估通常依赖于明确的任务、稳定的测试环境，以及对生成代码的全面测试。

确定性评分器是编码 Agent 的天然选择，因为软件通常易于评估：代码能否运行、测试是否通过？两个广泛使用的基准是 [SWE-bench Verified](https://www.swebench.com/SWE-bench/) 和 [Terminal-Bench](https://www.tbench.ai/)。

一旦有了针对结果的通过/失败测试，对轨迹进行评分通常也很有用。例如，基于启发式的代码质量规则可以评估生成的代码，带有明确评分规则的基于模型的评分器可以评估工具调用行为。

**示例：编码 Agent 的理论评估**
```yaml
task:
  id: "fix-auth-bypass_1"
  desc: "Fix authentication bypass when password field is empty and ..."
  graders:
    - type: deterministic_tests
      required: [test_empty_pw_rejected.py, test_null_pw_rejected.py]
    - type: llm_rubric
      rubric: prompts/code_quality.md
    - type: static_analysis
      commands: [ruff, mypy, bandit]
    - type: state_check
      expect:
        security_logs: {event_type: "auth_blocked"}
    - type: tool_calls
      required:
        - {tool: read_file, params: {path: "src/auth/*"}}
        - {tool: edit_file}
        - {tool: run_tests}
  tracked_metrics:
    - type: transcript
      metrics: [n_turns, n_toolcalls, n_total_tokens]
    - type: latency
      metrics: [time_to_first_token, output_tokens_per_sec, time_to_last_token]
```

### 评估对话 Agent

**对话 Agent**（Conversational agents）在支持、销售或辅导等领域与用户交互。它们维护状态、使用工具并在对话中途执行操作。有效的评估通常依赖于可验证的最终状态结果，以及同时捕获任务完成度和交互质量的评分规则。它们通常需要第二个 LLM 来模拟用户。

对话 Agent 的成功可以是多维的：工单是否解决、是否在 10 轮内完成、语气是否恰当？两个纳入多维度的基准是 [𝜏-Bench](https://arxiv.org/abs/2406.12045) 和 [τ2-Bench](https://arxiv.org/abs/2506.07982)。

**示例：对话 Agent 的理论评估**
```yaml
graders:
  - type: llm_rubric
    rubric: prompts/support_quality.md
    assertions:
      - "Agent showed empathy for customer's frustration"
      - "Resolution was clearly explained"
      - "Agent's response grounded in fetch_policy tool results"
  - type: state_check
    expect:
      tickets: {status: resolved}
      refunds: {status: processed}
  - type: tool_calls
    required:
      - {tool: verify_identity}
      - {tool: process_refund, params: {amount: "<=100"}}
      - {tool: send_confirmation}
  - type: transcript
    max_turns: 10
tracked_metrics:
  - type: transcript
    metrics: [n_turns, n_toolcalls, n_total_tokens]
  - type: latency
    metrics: [time_to_first_token, output_tokens_per_sec, time_to_last_token]
```

### 评估研究 Agent

**研究 Agent**（Research agents）收集、综合和分析信息，然后产出答案或报告等输出。与编码 Agent 不同，研究质量只能相对于任务来判断。什么算"全面"或"有据可依"取决于上下文。

研究评估面临独特挑战：专家可能意见不一、真值（ground truth）会变化、更长的输出意味着更多出错空间。[BrowseComp](http://arxiv.org/abs/2504.12516) 等基准测试 AI Agent 能否在开放网络中大海捞针。

一种策略是组合评分器类型：依据性检查（groundedness checks）验证主张有来源支撑，覆盖度检查（coverage checks）定义关键事实，来源质量检查确认所参考的来源具有权威性。

鉴于研究质量的主观性，基于 LLM 的评分规则应频繁与人工专家判断校准。

### 评估计算机使用 Agent

**计算机使用 Agent**（Computer use agents）通过与人类相同的界面与软件交互——截图、鼠标点击、键盘输入和滚动。它们可以使用任何具有 GUI 的应用程序。评估需要在真实或沙盒环境中运行 Agent，并检查其是否达成了预期结果。

基准示例包括 [WebArena](https://arxiv.org/abs/2307.13854)（基于浏览器的任务）和 [OSWorld](https://os-world.github.io/)（完整操作系统控制）。

浏览器使用 Agent 需要在 token 效率和延迟之间取得平衡。基于 DOM 的交互执行速度快但消耗大量 token，而基于截图的交互速度较慢但 token 效率更高。

### 如何看待 Agent 评估中的非确定性

Agent 行为在运行间存在变化，这使评估结果更难解读。两个指标有助于捕捉这种细微差别：

- **pass@k**：衡量 Agent 在 k 次尝试中至少获得一个正确解决方案的可能性。50% 的 pass@1 意味着模型在首次尝试中成功完成一半的任务。
- **pass^k**：衡量所有 k 次试验都成功的概率。如果你的 Agent 每次试验成功率为 75%，运行 3 次试验，则全部通过的概率约为 42%。

两个指标都有用。对于一次成功即可的工具使用 pass@k，对于一致性至关重要的 Agent 使用 pass^k。

## 从零到一：构建优秀 Agent 评估的路线图

### 收集初始评估数据集的任务

1. **尽早开始**：从真实失败中提取的 20-50 个简单任务是很好的起点。
2. **从你已在手动测试的内容开始**：将手动检查、Bug 追踪项和支持队列问题转化为测试用例。
3. **编写无歧义的任务和参考解**：好的任务是两位领域专家独立判断会得出相同结论的任务。为每个任务创建参考解决方案。
4. **构建平衡的问题集**：同时测试行为应该发生和不应该发生的情况。

### 设计评估框架和评分器

5. **构建具有稳定环境的健壮评估框架**：每次试验应从干净的环境开始。
6. **审慎设计评分器**：尽可能使用确定性评分器，必要时使用 LLM 评分器，谨慎使用人工评分器。为多组件任务设计部分得分。

### 长期维护和使用评估

7. **检查轨迹**：阅读轨迹可以验证你的评估是否在测量真正重要的东西。
8. **监控能力评估饱和**：100% 通过率的评估只追踪回归，不提供改进信号。
9. **保持评估套件长期健康**：建立专职评估团队负责核心基础设施，同时领域专家和产品团队贡献任务。

## 评估如何与其他方法配合以全面理解 Agent

自动化评估只是理解 Agent 性能的一种方式。完整的图景还包括生产监控、用户反馈、A/B 测试、手动轨迹审查和系统性人工评估。

### 方法概览

- **自动化评估**：快速迭代、完全可复现、无用户影响。
- **生产监控**：追踪线上系统的指标和错误。
- **A/B 测试**：用真实用户流量比较不同变体。
- **用户反馈**：明确的信号，如踩或 Bug 报告。
- **手动轨迹审查**：人工阅读 Agent 对话记录。
- **系统性人工研究**：由受过训练的评分者进行结构化评分。

这些方法对应开发的不同阶段。自动化评估在上线前有用，生产监控在上线后发挥作用，人工审查用于校准 LLM 评分器。

## 结论

没有评估的团队深陷被动循环。及早投入评估的团队发现，随着失败转化为测试用例，开发速度加快。其价值复利增长，但前提是你将评估视为核心组件。

不同 Agent 类型的模式各有不同，但基础原则不变：尽早开始、来源真实的任务、定义无歧义的成功标准、审慎设计评分器、让问题足够有挑战性、持续迭代，以及阅读轨迹！

AI Agent 评估仍是一个新兴领域。随着 Agent 承担更长的任务并在多 Agent 系统中协作，我们需要调整评估技术。我们将持续分享最佳实践。

## 致谢

由 Mikaela Grace、Jeremy Hadfield、Rodrigo Olivares 和 Jiri De Jonghe 撰写。感谢众多贡献者和客户提供的见解。

## 附录：评估框架

多个开源和商业框架可以帮助实现 Agent 评估：

- [Harbor](https://harborframework.com/)：用于大规模运行 Agent 的容器化环境。
- [Braintrust](https://www.braintrust.dev/)：将离线评估与生产可观测性相结合。
- [LangSmith](https://docs.langchain.com/langsmith/evaluation)：追踪、离线/在线评估和数据集管理。
- [Langfuse](https://langfuse.com/)：满足数据驻留要求的自托管替代方案。
- [Arize](https://arize.com/)：Phoenix（开源）和 AX（SaaS），用于追踪、调试和评估。

我们发现框架能加速进展，但它们的好坏取决于你通过它们运行的任务。专注于高质量的测试用例和评分器。
