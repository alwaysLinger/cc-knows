# "Think"工具：让 Claude 在复杂工具调用场景中停下来思考
发布于 2025 年 3 月 20 日

一种提升 Claude 复杂问题解决能力的新工具

> **扩展思考更新**
>
> 2025 年 12 月 15 日
>
> 扩展思考（extended thinking）功能自最初发布以来已有改进，因此在大多数情况下，我们推荐使用该功能而非专用的 think 工具。扩展思考提供了类似的优势——给 Claude 空间来推理复杂问题——同时具有更好的集成和性能。请参阅我们的[扩展思考文档](https://platform.claude.com/docs/en/build-with-claude/extended-thinking)了解实现细节。

在我们持续增强 Claude 的复杂问题解决能力的过程中，我们发现了一种特别有效的方法：一个"think"工具，在复杂任务中为结构化思考创造专属空间。

这种简单却强大的技术——正如我们将在下文解释的，它与 Claude 新的"[扩展思考](https://www.anthropic.com/research/visible-extended-thinking)"能力不同（参见[扩展思考实现细节](https://platform.claude.com/docs/en/build-with-claude/extended-thinking)）——在 Claude 的智能体工具使用能力方面带来了显著提升。这包括遵循策略、做出一致性决策以及处理多步骤问题，且实现开销极小。

在这篇文章中，我们将探讨如何在不同的应用中实现"think"工具，并基于经过验证的基准测试结果分享面向开发者的实用指导。

## 什么是"think"工具？

通过"think"工具，我们让 Claude 在得出最终答案的过程中，能够包含一个额外的思考步骤——拥有自己专属的空间。

虽然听起来与扩展思考相似，但这是一个不同的概念。扩展思考关注的是 Claude 在开始生成响应**之前**做什么。通过扩展思考，Claude 会在采取行动前深入考虑并迭代其计划。而"think"工具是让 Claude 在**已经开始**生成响应后，增加一个步骤来停下来思考是否拥有继续前进所需的全部信息。这在执行长链工具调用或与用户进行长多步对话时特别有帮助。

这使得"think"工具更适合 Claude 无法仅凭用户查询就拥有制定响应所需全部信息的情况，以及需要处理外部信息（例如工具调用结果中的信息）的情况。Claude 使用"think"工具进行的推理不如扩展思考全面，更聚焦于模型发现的**新**信息。

我们推荐在较简单的工具使用场景中使用扩展思考，如非顺序工具调用或简单的指令跟随。扩展思考也适用于编码、数学和物理等不需要 Claude 调用工具的用例。"think"工具则更适合 Claude 需要调用复杂工具、在长链工具调用中仔细分析工具输出、在策略密集型环境中遵循详细指南导航、或进行序列决策（每一步都建立在前一步之上且错误代价高昂）的场景。

以下是使用 [τ-Bench](https://arxiv.org/abs/2406.12045) 中的标准工具规范格式的示例实现：

```json
{
  "name": "think",
  "description": "Use the tool to think about something. It will not obtain new information or change the database, but just append the thought to the log. Use it when complex reasoning or some cache memory is needed.",
  "input_schema": {
    "type": "object",
    "properties": {
      "thought": {
        "type": "string",
        "description": "A thought to think about."
      }
    },
    "required": ["thought"]
  }
}
```

## τ-Bench 上的表现

我们使用 τ-bench（tau-bench）评估了"think"工具，这是一个综合基准测试，旨在测试模型在真实客服场景中使用工具的能力，其中"think"工具是评估标准环境的一部分。

τ-bench 评估 Claude 的以下能力：
- 与模拟用户进行真实对话导航
- 一致地遵循复杂的客服代理策略指南
- 使用各种工具访问和操作环境数据库

τ-bench 中使用的主要评估指标是 pass^_k_，它衡量给定任务的所有 _k_ 次独立试验全部成功的概率，并在所有任务上取平均值。与其他 LLM 评估中常见的 pass@_k_ 指标（衡量 _k_ 次试验中至少一次成功）不同，pass^_k_ 评估一致性和可靠性——这是客服应用的关键品质，因为一致地遵守策略至关重要。

### 性能分析

我们的评估比较了几种不同的配置：
1. 基线（无"think"工具，无扩展思考模式）
2. 仅扩展思考模式
3. 仅"think"工具
4. "think"工具配合优化提示词（针对航空领域）

结果显示，当 Claude 3.7 在基准测试的"航空"和"零售"客服领域中有效使用"think"工具时，带来了显著改善：
- **航空领域**："think"工具配合优化提示词在 pass¹ 指标上达到 0.570，而基线仅为 0.370——相对提升 54%；
- **零售领域**：仅"think"工具即达到 0.812，而基线为 0.783。

![折线图显示 Claude 3.7 Sonnet 在 Tau-Bench 评估"航空"领域的表现](/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2Fff91e5c84be59ae71306bcc60adba9affed86484-2200x1300.jpg&w=3840&q=75)

Claude 3.7 Sonnet 在 Tau-Bench 评估"航空"领域的表现

| 配置 | k=1 | k=2 | k=3 | k=4 | k=5 |
|---|---|---|---|---|---|
| "Think" + 提示词 | 0.584 | 0.444 | 0.384 | 0.356 | 0.340 |
| "Think" | 0.404 | 0.254 | 0.186 | 0.140 | 0.100 |
| 扩展思考 | 0.412 | 0.290 | 0.232 | 0.192 | 0.160 |
| 基线 | 0.332 | 0.206 | 0.148 | 0.116 | 0.100 |

四种不同配置的评估结果。分数为比例值。

航空领域中最佳表现是通过将"think"工具与优化提示词配对实现的，该提示词给出了在分析客户请求时使用的推理方法示例。以下是优化提示词的示例：

```
## 使用 think 工具

在收到工具结果后采取任何行动或响应用户之前，使用 think 工具作为草稿板来：
- 列出适用于当前请求的特定规则
- 检查是否已收集所有必要信息
- 验证计划行动是否符合所有策略
- 迭代检查工具结果的正确性

以下是在 think 工具中迭代检查的一些示例：
<think_tool_example_1>
用户想要取消航班 ABC123
- 需要验证：用户 ID、预订 ID、原因
- 检查取消规则：
  * 是否在预订后 24 小时内？
  * 如果不是，检查票务等级和保险
- 验证没有已飞或已过期的航段
- 计划：收集缺失信息，验证规则，获取确认
</think_tool_example_1>

<think_tool_example_2>
用户想要预订 3 张去纽约的机票，每人 2 件托运行李
- 需要用户 ID 以检查：
  * 会员等级对应的行李额度
  * 个人资料中有哪些支付方式
- 行李计算：
  * 经济舱 × 3 名乘客
  * 如果是普通会员：每人 1 件免费行李 → 3 件额外行李 = $150
  * 如果是银卡会员：每人 2 件免费行李 → 0 件额外行李 = $0
  * 如果是金卡会员：每人 3 件免费行李 → 0 件额外行李 = $0
- 需要验证的支付规则：
  * 最多 1 张旅行券、1 张信用卡、3 张礼品卡
  * 所有支付方式必须在个人资料中
  * 旅行券余额不找零
- 计划：
1. 获取用户 ID
2. 验证会员等级以确定行李费用
3. 检查个人资料中有哪些支付方式及其组合是否允许
4. 计算总额：票价 + 任何行李费用
5. 获取预订的明确确认
</think_tool_example_2>
```

特别有趣的是不同方法的对比。使用"think"工具配合优化提示词取得了显著优于扩展思考模式的结果（扩展思考的表现与未提示的"think"工具相似）。单独使用"think"工具（无提示）相比基线有所改善，但仍远不及优化方法。

"think"工具与优化提示词的组合以显著优势提供了最强表现，这可能是因为基准测试中[航空策略](https://github.com/sierra-research/tau-bench/blob/main/tau_bench/envs/airline/wiki.md)部分的高复杂度，模型从获得如何"思考"的示例中受益最大。

在零售领域，我们还测试了各种配置以了解每种方法的具体影响

![折线图显示 Claude 3.7 Sonnet 在 Tau-Bench 评估"零售"领域的表现](/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F5819616b4cc109d30f1a7d47ec8a32a6b839637b-7638x4513.jpg&w=3840&q=75)

Claude 3.7 Sonnet 在三种不同配置下 Tau-Bench 评估"零售"领域的表现

| 配置 | k=1 | k=2 | k=3 | k=4 | k=5 |
|---|---|---|---|---|---|
| "Think" + 无提示 | 0.812 | 0.735 | 0.685 | 0.650 | 0.626 |
| 扩展思考 | 0.770 | 0.681 | 0.623 | 0.581 | 0.548 |
| 基线 | 0.783 | 0.695 | 0.643 | 0.607 | 0.583 |

三种不同配置的评估结果。分数为比例值。

"think"工具即使没有额外提示也达到了最高的 pass¹ 分数 0.812。[零售策略](https://github.com/sierra-research/tau-bench/blob/main/tau_bench/envs/retail/wiki.md)相比航空领域明显更容易导航，Claude 仅凭拥有思考空间就能改善表现，无需进一步指导。

### τ-Bench 分析的关键洞察

我们的详细分析揭示了几个模式，可以帮助你有效地实现"think"工具：
1. **在困难领域中，提示词影响显著**。仅仅提供"think"工具可能会在一定程度上改善性能，但在困难领域中，将其与优化提示词配对会产生显著更好的结果。然而，较简单的领域可能仅从拥有"think"访问权中就能受益。
2. **跨试验的一致性提升**。使用"think"带来的改善在 pass^k 直到 k=5 都得以保持，表明该工具帮助 Claude 更有效地处理边缘情况和不寻常场景。

## SWE-Bench 上的表现

在评估 Claude 3.7 Sonnet 时，我们的 SWE-bench 设置中也添加了类似的"think"工具，助力其取得了 0.623 的当时最优成绩。适配的"think"工具定义如下：

```json
{
  "name": "think",
  "description": "Use the tool to think about something. It will not obtain new information or make any changes to the repository, but just log the thought. Use it when complex reasoning or brainstorming is needed. For example, if you explore the repo and discover the source of a bug, call this tool to brainstorm several unique ways of fixing the bug, and assess which change(s) are likely to be simplest and most effective. Alternatively, if you receive some test results, call this tool to brainstorm ways to fix the failing tests.",
  "input_schema": {
    "type": "object",
    "properties": {
      "thought": {
        "type": "string",
        "description": "Your thoughts."
      }
    },
    "required": ["thought"]
  }
}
```

我们的实验（_n_=30 个有"think"工具的样本，_n_=144 个无"think"工具的样本）显示，包含该工具的独立效果平均提升了 1.6%（Welch's _t_ 检验：_t_(38.89) = 6.71, _p_ < .001, _d_ = 1.47）。

## 何时使用"think"工具

基于这些评估结果，我们确定了 Claude 最能从"think"工具中受益的具体场景：
1. **工具输出分析**。当 Claude 需要在行动前仔细处理先前工具调用的输出，且可能需要回溯其方法时；
2. **策略密集型环境**。当 Claude 需要遵循详细的指南并验证合规性时；以及
3. **序列决策**。当每个行动都建立在前一个行动之上且错误代价高昂时（常见于多步骤领域中）。

## 实施最佳实践

为了充分利用 Claude 的"think"工具，我们基于 τ-bench 实验推荐以下实施实践。

### 1. 配合领域特定示例的策略性提示

最有效的方法是提供关于何时以及如何使用"think"工具的明确说明，例如 τ-bench 航空领域中使用的方法。提供针对你特定用例的示例可显著改善模型使用"think"工具的效果：
- 期望的推理过程详细程度；
- 如何将复杂指令分解为可操作步骤；
- 处理常见场景的决策树；以及
- 如何检查是否已收集所有必要信息。

### 2. 将复杂指导放在系统提示中

我们发现，当关于"think"工具的说明很长和/或很复杂时，将其放在系统提示中比放在工具描述本身中更有效。这种方法提供了更广泛的上下文，帮助模型更好地将思考过程整合到其整体行为中。

## 何时不使用"think"工具

虽然"think"工具可以提供实质性改善，但它并不适用于所有工具使用场景，并且确实会以增加提示长度和输出 token 为代价。具体而言，我们发现"think"工具在以下用例中不会带来任何改善：
1. **非顺序工具调用**。如果 Claude 只需要进行单次工具调用或多次并行调用来完成任务，添加"think"不太可能带来任何改善。
2. **简单指令跟随**。当 Claude 需要遵守的约束不多，且其默认行为已经足够好时，额外的"思考"不太可能带来收益。

## 入门指南

"think"工具是对 Claude 实现的一个简单补充，只需几个步骤就能产生有意义的改善：
1. **用智能体工具使用场景进行测试**。从具有挑战性的用例开始——即 Claude 当前在策略合规或长工具调用链中的复杂推理方面挣扎的场景。
2. **添加工具定义**。实现一个针对你的领域定制的"think"工具。它需要最少的代码，但能实现更结构化的推理。同时考虑在系统提示中包含关于何时以及如何使用该工具的说明，并提供与你领域相关的示例。
3. **监控和优化**。观察 Claude 在实践中如何使用该工具，并调整你的提示以鼓励更有效的思考模式。

最棒的是，添加这个工具在性能结果方面几乎没有负面影响。除非 Claude 决定使用它，否则它不会改变外部行为，也不会干扰你现有的工具或工作流。

## 结论

我们的研究表明，"think"工具可以显著提升 Claude 3.7 Sonnet 在需要策略遵循和长链工具调用推理的复杂任务上的表现¹。"Think"并非一刀切的解决方案，但对于正确的用例，它以最小的实现复杂度提供了实质性收益。

我们期待看到你如何使用"think"工具来构建更强大、更可靠、更透明的 Claude AI 系统。

¹ 虽然我们的 τ-Bench 结果聚焦于 Claude 3.7 Sonnet 使用"think"工具的改善，但我们的实验表明 Claude 3.5 Sonnet（New）在相同配置下也能实现性能提升，表明这种改善也泛化到其他 Claude 模型。
