# Anthropic 开发者平台推出高级工具使用功能

发布于 2025 年 11 月 24 日

我们新增了三项 Beta 功能，让 Claude 能够动态发现、学习和执行工具。以下是它们的工作原理。

AI 智能体（Agent）的未来是模型能够无缝地跨数百甚至数千个工具工作。一个 IDE 助手集成 git 操作、文件操作、包管理器、测试框架和部署流水线。一个运维协调器同时连接 Slack、GitHub、Google Drive、Jira、公司数据库和数十个 MCP 服务器。

要[构建有效的智能体](https://www.anthropic.com/research/building-effective-agents)，它们需要能够在不将每个定义预先塞入上下文的情况下使用无限工具库。我们关于[将代码执行与 MCP 结合使用](https://www.anthropic.com/engineering/code-execution-with-mcp)的博客文章讨论了工具结果和定义有时如何在智能体读取请求之前就消耗 50,000+ token。智能体应该按需发现和加载工具，只保留当前任务相关的内容。

智能体还需要能够从代码中调用工具。使用自然语言工具调用时，每次调用都需要一次完整的推理过程（inference pass），中间结果不管有用没用都堆积在上下文中。代码天然适合编排逻辑（orchestration logic），如循环、条件分支和数据转换。智能体需要根据任务灵活选择代码执行还是推理。

智能体还需要从示例中学习正确的工具使用方式，而不仅仅是从 Schema 定义。JSON Schema 定义了结构上的合法性，但无法表达使用模式：何时包含可选参数、哪些组合有意义、或者你的 API 期望什么约定。

今天，我们发布三项功能来使其成为可能：

* **Tool Search Tool（工具搜索工具）**，允许 Claude 使用搜索来访问数千个工具，而不会消耗其上下文窗口
* **Programmatic Tool Calling（编程式工具调用）**，允许 Claude 在代码执行环境中调用工具，减少对模型上下文窗口的影响
* **Tool Use Examples（工具使用示例）**，提供演示如何有效使用给定工具的通用标准

在内部测试中，我们发现这些功能帮助我们构建了使用传统工具使用模式无法实现的东西。例如，**[Claude for Excel](https://www.claude.com/claude-for-excel)** 使用编程式工具调用来读取和修改包含数千行的电子表格，而不会使模型的上下文窗口过载。

基于我们的经验，我们相信这些功能为你使用 Claude 构建的能力打开了新的可能性。

---

## Tool Search Tool

### 挑战

MCP 工具定义提供了重要的上下文，但随着更多服务器连接，这些 token 会不断累积。考虑一个五服务器的配置：

* GitHub：35 个工具（约 26K token）
* Slack：11 个工具（约 21K token）
* Sentry：5 个工具（约 3K token）
* Grafana：5 个工具（约 3K token）
* Splunk：2 个工具（约 2K token）

这是 58 个工具，在对话甚至还没开始之前就消耗了约 55K token。再添加更多服务器，比如 Jira（仅它就使用约 17K token），你很快就会接近 100K+ token 的开销。在 Anthropic，我们看到工具定义在优化前曾消耗 134K token。

但 token 成本不是唯一的问题。最常见的故障是错误的工具选择和不正确的参数，尤其是当工具有相似名称时，如 `notification-send-user` 与 `notification-send-channel`。

### 我们的方案

Tool Search Tool 不再预先加载所有工具定义，而是按需发现工具。Claude 只能看到当前任务实际需要的工具。

> *Tool Search Tool 相比 Claude 传统方法的 122,800 token，保留了 191,300 token 的上下文。*

传统方法：

* 所有工具定义预先加载（50+ MCP 工具约 72K token）
* 对话历史和系统提示争夺剩余空间
* 总上下文消耗：任何工作开始前约 77K token

使用 Tool Search Tool：

* 仅预先加载 Tool Search Tool 本身（约 500 token）
* 按需发现工具（3-5 个相关工具，约 3K token）
* 总上下文消耗：约 8.7K token，保留了 95% 的上下文窗口

这代表了 token 使用量减少 85%，同时保持对完整工具库的访问。内部测试显示，在处理大型工具库时，MCP 评估的准确率显著提升。Opus 4 从 49% 提升到 74%，Opus 4.5 从 79.5% 提升到 88.1%。

### Tool Search Tool 如何工作

Tool Search Tool 让 Claude 动态发现工具，而不是预先加载所有定义。你将所有工具定义提供给 API，但用 `defer_loading: true` 标记工具使其可按需发现。延迟加载的工具最初不会加载到 Claude 的上下文中。Claude 只能看到 Tool Search Tool 本身以及任何 `defer_loading: false` 的工具（你最关键、最常用的工具）。

当 Claude 需要特定能力时，它会搜索相关工具。Tool Search Tool 返回匹配工具的引用，这些引用会在 Claude 的上下文中展开为完整定义。

例如，如果 Claude 需要与 GitHub 交互，它搜索 "github"，只有 `github.createPullRequest` 和 `github.listIssues` 被加载——而不是来自 Slack、Jira 和 Google Drive 的其他 50+ 个工具。

这样，Claude 可以访问你的完整工具库，同时只支付实际需要的工具的 token 成本。

**提示缓存（Prompt Caching）说明：** Tool Search Tool 不会破坏提示缓存，因为延迟加载的工具完全排除在初始提示之外。它们只有在 Claude 搜索之后才被添加到上下文中，因此你的系统提示和核心工具定义仍然可缓存。

**实现方式：**

```json
{
  "tools": [
    // 包含一个工具搜索工具（regex、BM25 或自定义）
    {"type": "tool_search_tool_regex_20251119", "name": "tool_search_tool_regex"},

    // 标记工具以实现按需发现
    {
      "name": "github.createPullRequest",
      "description": "Create a pull request",
      "input_schema": {...},
      "defer_loading": true
    }
    // ... 数百个更多带有 defer_loading: true 的延迟加载工具
  ]
}
```

对于 MCP 服务器，你可以延迟加载整个服务器，同时保持特定的高频使用工具始终加载：

```json
{
  "type": "mcp_toolset",
  "mcp_server_name": "google-drive",
  "default_config": {"defer_loading": true}, # 延迟加载整个服务器
  "configs": {
    "search_files": {
      "defer_loading": false
    }  // 保持最常用工具始终加载
  }
}
```

Claude 开发者平台开箱即用提供基于正则表达式（regex）和基于 BM25 的搜索工具，但你也可以使用嵌入（embeddings）或其他策略实现自定义搜索工具。

### 何时使用 Tool Search Tool

与任何架构决策一样，启用 Tool Search Tool 涉及权衡。该功能在工具调用之前增加了一个搜索步骤，因此当上下文节省和准确率提升超过额外延迟时，它能提供最佳的投资回报。

**适合使用的场景：**
* 工具定义消耗 >10K token
* 遇到工具选择准确率问题
* 构建具有多个服务器的 MCP 驱动系统
* 可用工具 10+ 个

**收益较少的场景：**
* 小型工具库（<10 个工具）
* 所有工具在每个会话中频繁使用
* 工具定义本身就很紧凑

---

## Programmatic Tool Calling

### 挑战

传统工具调用随着工作流变得越来越复杂，会产生两个根本性问题：

* **中间结果导致的上下文污染**：当 Claude 分析一个 10MB 日志文件中的错误模式时，整个文件进入其上下文窗口，即使 Claude 只需要错误频率的摘要。当跨多个表获取客户数据时，每条记录都堆积在上下文中，无论是否相关。这些中间结果消耗大量 token 预算，并可能将重要信息完全推出上下文窗口。
* **推理开销和手动综合**：每次工具调用都需要一次完整的模型推理过程。收到结果后，Claude 必须"目测"数据来提取相关信息、推理各部分如何组合、并决定下一步——全部通过自然语言处理。五次工具调用意味着五次推理过程加上 Claude 解析每个结果、比较值并综合结论。这既慢又容易出错。

### 我们的方案

Programmatic Tool Calling 使 Claude 能够通过代码编排工具，而不是通过单独的 API 往返。Claude 不再每次请求一个工具并让每个结果返回其上下文，而是编写代码来调用多个工具、处理其输出、并控制哪些信息实际进入其上下文窗口。

Claude 擅长编写代码，通过让它用 Python 而非自然语言工具调用来表达编排逻辑，你可以获得更可靠、更精确的控制流。循环、条件分支、数据转换和错误处理在代码中都是显式的，而非隐含在 Claude 的推理中。

#### 示例：预算合规检查

考虑一个常见的业务任务："哪些团队成员超过了他们 Q3 的差旅预算？"

你有三个可用工具：

* `get_team_members(department)` - 返回带有 ID 和级别的团队成员列表
* `get_expenses(user_id, quarter)` - 返回用户的费用明细项
* `get_budget_by_level(level)` - 返回员工级别的预算限额

**传统方法**：

* 获取团队成员 → 20 人
* 为每个人获取其 Q3 费用 → 20 次工具调用，每次返回 50-100 条明细项（航班、酒店、餐饮、收据）
* 按员工级别获取预算限额
* 所有这些进入 Claude 的上下文：2,000+ 条费用明细项（50 KB+）
* Claude 手动汇总每个人的费用、查找其预算、将费用与预算限额进行比较
* 更多到模型的往返，显著的上下文消耗

**使用编程式工具调用**：

不再是每个工具结果返回给 Claude，而是 Claude 编写一个 Python 脚本来编排整个工作流。该脚本在代码执行工具（一个沙箱环境）中运行，当需要你的工具结果时暂停。当你通过 API 返回工具结果时，它们由脚本处理而非被模型消费。脚本继续执行，Claude 只看到最终输出。

> *编程式工具调用使 Claude 能够通过代码而非单独的 API 往返来编排工具，支持并行工具执行。*

以下是 Claude 为预算合规任务编写的编排代码：

```python
team = await get_team_members("engineering")

# 为每个唯一级别获取预算
levels = list(set(m["level"] for m in team))
budget_results = await asyncio.gather(*[
    get_budget_by_level(level) for level in levels
])

# 创建查找字典：{"junior": budget1, "senior": budget2, ...}
budgets = {level: budget for level, budget in zip(levels, budget_results)}

# 并行获取所有费用
expenses = await asyncio.gather(*[
    get_expenses(m["id"], "Q3") for m in team
])

# 找出超过差旅预算的员工
exceeded = []
for member, exp in zip(team, expenses):
    budget = budgets[member["level"]]
    total = sum(e["amount"] for e in exp)
    if total > budget["travel_limit"]:
        exceeded.append({
            "name": member["name"],
            "spent": total,
            "limit": budget["travel_limit"]
        })

print(json.dumps(exceeded))
```

Claude 的上下文只接收最终结果：超出预算的两三个人。2,000+ 条明细项、中间汇总和预算查找不会影响 Claude 的上下文，将消耗从 200KB 原始费用数据降至仅 1KB 的结果。

效率提升是显著的：

* **Token 节省**：通过将中间结果排除在 Claude 的上下文之外，编程式工具调用大幅减少了 token 消耗。平均使用量从 43,588 降至 27,297 token，在复杂研究任务上减少 37%。
* **降低延迟**：每次 API 往返需要模型推理（数百毫秒到数秒）。当 Claude 在单个代码块中编排 20+ 次工具调用时，你消除了 19+ 次推理过程。API 处理工具执行而无需每次返回模型。
* **提高准确率**：通过编写显式的编排逻辑，Claude 比在自然语言中处理多个工具结果时犯的错误更少。内部知识检索从 25.6% 提升至 28.5%；[GIA 基准](https://arxiv.org/abs/2311.12983)从 46.5% 提升至 51.2%。

生产工作流涉及混乱的数据、条件逻辑和需要扩展的操作。编程式工具调用让 Claude 以编程方式处理这种复杂性，同时保持其关注可操作的结果而非原始数据处理。

### 编程式工具调用如何工作

#### 1. 将工具标记为可从代码调用

添加 `code_execution` 到工具中，并设置 `allowed_callers` 来选择启用工具的编程式执行：

```json
{
  "tools": [
    {
      "type": "code_execution_20250825",
      "name": "code_execution"
    },
    {
      "name": "get_team_members",
      "description": "Get all members of a department...",
      "input_schema": {...},
      "allowed_callers": ["code_execution_20250825"] # 选择启用编程式工具调用
    },
    {
      "name": "get_expenses",
      ...
    },
    {
      "name": "get_budget_by_level",
      ...
    }
  ]
}
```

API 将这些工具定义转换为 Claude 可以调用的 Python 函数。

#### 2. Claude 编写编排代码

Claude 不再逐一请求工具，而是生成 Python 代码：

```json
{
  "type": "server_tool_use",
  "id": "srvtoolu_abc",
  "name": "code_execution",
  "input": {
    "code": "team = get_team_members('engineering')\n..." # 上面的代码示例
  }
}
```

#### 3. 工具执行而不进入 Claude 的上下文

当代码调用 `get_expenses()` 时，你收到一个带有 `caller` 字段的工具请求：

```json
{
  "type": "tool_use",
  "id": "toolu_xyz",
  "name": "get_expenses",
  "input": {"user_id": "emp_123", "quarter": "Q3"},
  "caller": {
    "type": "code_execution_20250825",
    "tool_id": "srvtoolu_abc"
  }
}
```

你提供结果，结果在代码执行环境中处理而非 Claude 的上下文中。此请求-响应周期对代码中的每个工具调用重复。

#### 4. 仅最终输出进入上下文

当代码完成运行时，只有代码的结果返回给 Claude：

```json
{
  "type": "code_execution_tool_result",
  "tool_use_id": "srvtoolu_abc",
  "content": {
    "stdout": "[{\"name\": \"Alice\", \"spent\": 12500, \"limit\": 10000}...]"
  }
}
```

这就是 Claude 看到的全部，而不是沿途处理的 2000+ 条费用明细项。

### 何时使用编程式工具调用

编程式工具调用为你的工作流增加了一个代码执行步骤。当 token 节省、延迟改善和准确率提升显著时，这种额外开销是值得的。

**最有益的场景：**
* 处理大数据集，只需要汇总或摘要
* 运行三步或更多依赖工具调用的多步骤工作流
* 在 Claude 看到工具结果之前进行过滤、排序或转换
* 处理中间数据不应影响 Claude 推理的任务
* 跨多个项目运行并行操作（例如检查 50 个端点）

**收益较少的场景：**
* 进行简单的单工具调用
* 处理 Claude 应该审视并推理所有中间结果的任务
* 运行响应很小的快速查询

---

## Tool Use Examples

### 挑战

JSON Schema 擅长定义结构——类型、必需字段、允许的枚举——但它无法表达使用模式：何时包含可选参数、哪些组合有意义、或者你的 API 期望什么约定。

考虑一个工单支持 API：

```json
{
  "name": "create_ticket",
  "input_schema": {
    "properties": {
      "title": {"type": "string"},
      "priority": {"enum": ["low", "medium", "high", "critical"]},
      "labels": {"type": "array", "items": {"type": "string"}},
      "reporter": {
        "type": "object",
        "properties": {
          "id": {"type": "string"},
          "name": {"type": "string"},
          "contact": {
            "type": "object",
            "properties": {
              "email": {"type": "string"},
              "phone": {"type": "string"}
            }
          }
        }
      },
      "due_date": {"type": "string"},
      "escalation": {
        "type": "object",
        "properties": {
          "level": {"type": "integer"},
          "notify_manager": {"type": "boolean"},
          "sla_hours": {"type": "integer"}
        }
      }
    },
    "required": ["title"]
  }
}
```

Schema 定义了什么是合法的，但留下了关键问题未解答：

* **格式歧义**：`due_date` 应该使用 "2024-11-06"、"Nov 6, 2024" 还是 "2024-11-06T00:00:00Z"？
* **ID 约定**：`reporter.id` 是 UUID、"USR-12345" 还是仅仅是 "12345"？
* **嵌套结构使用**：何时应该填充 `reporter.contact`？
* **参数关联**：`escalation.level` 和 `escalation.sla_hours` 如何与 priority 关联？

这些歧义可能导致畸形的工具调用和不一致的参数使用。

### 我们的方案

Tool Use Examples 让你直接在工具定义中提供示例工具调用。不再仅依赖 Schema，你向 Claude 展示具体的使用模式：

```json
{
    "name": "create_ticket",
    "input_schema": { /* 与上面相同的 schema */ },
    "input_examples": [
      {
        "title": "Login page returns 500 error",
        "priority": "critical",
        "labels": ["bug", "authentication", "production"],
        "reporter": {
          "id": "USR-12345",
          "name": "Jane Smith",
          "contact": {
            "email": "jane@acme.com",
            "phone": "+1-555-0123"
          }
        },
        "due_date": "2024-11-06",
        "escalation": {
          "level": 2,
          "notify_manager": true,
          "sla_hours": 4
        }
      },
      {
        "title": "Add dark mode support",
        "labels": ["feature-request", "ui"],
        "reporter": {
          "id": "USR-67890",
          "name": "Alex Chen"
        }
      },
      {
        "title": "Update API documentation"
      }
    ]
  }
```

从这三个示例中，Claude 学到：

* **格式约定**：日期使用 YYYY-MM-DD，用户 ID 遵循 USR-XXXXX，标签使用 kebab-case（短横线小写）
* **嵌套结构模式**：如何构建 reporter 对象及其嵌套的 contact 对象
* **可选参数关联**：关键 bug 有完整联系信息 + 紧密 SLA 的升级信息；功能请求有 reporter 但没有联系/升级信息；内部任务仅有标题

在我们自己的内部测试中，工具使用示例将复杂参数处理的准确率从 72% 提升至 90%。

### 何时使用 Tool Use Examples

Tool Use Examples 会向工具定义中添加 token，因此当准确率提升超过额外成本时最有价值。

**最有益的场景：**
* 复杂嵌套结构，合法的 JSON 并不意味着正确使用
* 具有许多可选参数且包含模式很重要的工具
* 具有 Schema 中未捕获的领域特定约定的 API
* 相似工具，示例可以澄清使用哪个（例如 `create_ticket` vs `create_incident`）

**收益较少的场景：**
* 使用方式明显的简单单参数工具
* Claude 已经理解的标准格式，如 URL 或电子邮件
* 最好通过 JSON Schema 约束处理的验证问题

---

## 最佳实践

构建执行真实世界操作的智能体意味着同时处理规模、复杂性和精确性。这三项功能协同解决工具使用工作流中的不同瓶颈。以下是如何有效地组合它们。

### 分层策略性使用

并非每个智能体都需要为给定任务使用所有三项功能。从你最大的瓶颈开始：

* 工具定义导致的上下文膨胀 → Tool Search Tool
* 大量中间结果污染上下文 → Programmatic Tool Calling
* 参数错误和畸形调用 → Tool Use Examples

这种聚焦的方法让你解决限制智能体性能的特定约束，而不是预先增加复杂性。

然后根据需要叠加额外功能。它们是互补的：Tool Search Tool 确保找到正确的工具，Programmatic Tool Calling 确保高效执行，Tool Use Examples 确保正确调用。

### 设置 Tool Search Tool 以实现更好的发现

工具搜索匹配名称和描述，因此清晰、具体的定义能提高发现准确率。

```json
// 好
{
    "name": "search_customer_orders",
    "description": "Search for customer orders by date range, status, or total amount. Returns order details including items, shipping, and payment info."
}

// 差
{
    "name": "query_db_orders",
    "description": "Execute order query"
}
```

添加系统提示指导，让 Claude 知道有什么可用：

> You have access to tools for Slack messaging, Google Drive file management, Jira ticket tracking, and GitHub repository operations. Use the tool search to find specific capabilities.

保持 3-5 个最常用工具始终加载，其余延迟加载。这在常见操作的即时访问与所有其他工具的按需发现之间取得平衡。

### 设置编程式工具调用以实现正确执行

由于 Claude 编写代码来解析工具输出，因此清楚记录返回格式。这有助于 Claude 编写正确的解析逻辑：

```json
{
    "name": "get_orders",
    "description": "Retrieve orders for a customer.
Returns:
    List of order objects, each containing:
    - id (str): Order identifier
    - total (float): Order total in USD
    - status (str): One of 'pending', 'shipped', 'delivered'
    - items (list): Array of {sku, quantity, price}
    - created_at (str): ISO 8601 timestamp"
}
```

对以下工具选择启用编程式编排：

* 可以并行运行的工具（独立操作）
* 安全重试的操作（幂等的）

### 设置 Tool Use Examples 以实现参数准确率

精心制作示例以实现行为清晰度：

* 使用真实数据（真实城市名、合理价格，而非 "string" 或 "value"）
* 展示多样性，包括最小、部分和完整规格模式
* 保持简洁：每个工具 1-5 个示例
* 专注于歧义（仅在正确使用方式从 Schema 不明显时添加示例）

---

## 开始使用

这些功能以 Beta 形式提供。要启用它们，添加 Beta 标头并包含你需要的工具：

```python
client.beta.messages.create(
    betas=["advanced-tool-use-2025-11-20"],
    model="claude-sonnet-4-5-20250929",
    max_tokens=4096,
    tools=[
        {"type": "tool_search_tool_regex_20251119", "name": "tool_search_tool_regex"},
        {"type": "code_execution_20250825", "name": "code_execution"},
        # 你的带有 defer_loading、allowed_callers 和 input_examples 的工具
    ]
)
```

有关详细的 API 文档和 SDK 示例，请参阅：

* Tool Search Tool 的[文档](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)和[cookbook](https://github.com/anthropics/claude-cookbooks/blob/main/tool_use/tool_search_with_embeddings.ipynb)
* Programmatic Tool Calling 的[文档](https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling)和[cookbook](https://github.com/anthropics/claude-cookbooks/blob/main/tool_use/programmatic_tool_calling_ptc.ipynb)
* Tool Use Examples 的[文档](https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use#providing-tool-use-examples)

这些功能将工具使用从简单的函数调用推向智能编排。随着智能体处理跨越数十个工具和大型数据集的更复杂工作流，动态发现、高效执行和可靠调用成为基础设施。

我们期待看到你构建的作品。

---

## 致谢

由 Bin Wu 撰写，Adam Jones、Artur Renault、Henry Tay、Jake Noble、Noah Picard、Sam Jiang 和 Claude 开发者平台团队贡献。本工作建立在 Chris Gorgolewski、Daniel Jiang、Jeremy Fox 和 Mike Lambert 的基础研究之上。我们还从 AI 生态系统中汲取了灵感，包括 [Joel Pobar 的 LLMVM](https://github.com/9600dev/llmvm)、[Cloudflare 的 Code Mode](https://blog.cloudflare.com/code-mode/) 和[代码执行作为 MCP](https://www.anthropic.com/engineering/code-execution-with-mcp)。特别感谢 Andy Schumeister、Hamish Kerr、Keir Bradwell、Matt Bleifer 和 Molly Vorwerck 的支持。
