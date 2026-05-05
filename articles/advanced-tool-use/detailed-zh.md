# Advanced Tool Use 详细摘要

## 背景

AI 智能体的未来需要无缝操作成百上千个工具——IDE 助手集成 git、包管理器、测试框架和部署流水线；运维协调器连接 Slack、GitHub、Jira 和多个 MCP 服务器。为此，智能体需要：按需发现和加载工具而非预先全部加载、通过代码而非纯推理调用工具、从示例而非仅从 Schema 学习工具使用方式。

## Tool Search Tool

### 问题

MCP 工具定义的 token 开销随服务器增多急剧膨胀。5 个服务器（GitHub 35 工具约 26K tokens、Slack 11 工具约 21K tokens 等）合计 58 个工具消耗约 55K tokens。在 Anthropic 内部，优化前工具定义曾消耗 134K tokens。除 token 成本外，工具选择错误和参数错误也屡见不鲜，尤其是名称相似的工具（如 `notification-send-user` vs `notification-send-channel`）。

### 方案

Tool Search Tool 让 Claude 按需搜索工具而非预先加载所有定义。开发者用 `defer_loading: true` 标记可延迟加载的工具，Claude 初始仅看到 Tool Search Tool 本身（约 500 tokens）和少数关键工具，需要时再搜索并加载相关工具（3-5 个，约 3K tokens）。上下文占用从约 77K 降至 8.7K tokens，减少 85%。Opus 4 准确率从 49% 提升至 74%，Opus 4.5 从 79.5% 提升至 88.1%。延迟加载工具不参与初始 prompt，因此不影响 prompt caching（提示缓存）。

### 适用场景

推荐在工具定义超过 10K tokens、工具选择准确率有问题、使用多个 MCP 服务器或工具数超过 10 个时启用。工具少于 10 个或全部频繁使用时收益有限。

## Programmatic Tool Calling

### 问题

传统工具调用存在两大问题：中间结果污染上下文（分析 10MB 日志文件时全部进入上下文窗口）、以及每次调用需要完整推理开销（5 次工具调用 = 5 次推理 + 人工综合结果），既慢又易出错。

### 方案

Claude 在代码执行沙箱（Code Execution）中编写 Python 脚本编排工具调用。工具结果在脚本中处理，仅最终输出返回模型上下文。以差旅预算合规检查为例：传统方式需 2000+ 条费用明细全部进入上下文（50KB+），编程式调用仅返回超预算的 2-3 人信息（1KB），token 消耗减少 37%（从 43,588 降至 27,297），还支持并行调用，消除 19+ 次推理往返。知识检索准确率从 25.6% 提升至 28.5%，GIA 基准从 46.5% 提升至 51.2%。

### 工作流程

1. 在工具定义中添加 `allowed_callers: ["code_execution_20250825"]` 加入编程式调用
2. Claude 生成 Python 编排代码
3. 代码中的工具调用通过 API 请求结果，结果在沙箱中处理
4. 仅最终 stdout 输出进入 Claude 上下文

### 适用场景

处理大数据集仅需汇总、多步骤依赖调用（3+ 步）、需过滤/转换结果、中间数据不应影响推理、并行操作时最为有效。简单单次调用或需 Claude 审视全部中间结果时收益有限。

## Tool Use Examples

### 问题

JSON Schema 定义了结构合法性，但无法传达使用模式：日期格式约定、ID 格式、嵌套结构何时填充、参数间关联关系等。这些歧义导致畸形调用和参数不一致。

### 方案

在工具定义中通过 `input_examples` 字段提供具体调用示例。从示例中 Claude 学习格式惯例（如日期用 YYYY-MM-DD、ID 用 USR-XXXXX）、嵌套结构模式、可选参数关联（critical bug 需完整联系信息 + 升级信息；feature request 有 reporter 但无升级信息；内部任务仅需 title）。测试中准确率从 72% 提升至 90%。

### 适用场景

复杂嵌套结构、多可选参数且有使用模式、领域特定约定、相似工具区分时最有价值。简单单参数工具、Claude 已知的标准格式、Schema 约束即可解决的场景收益有限。

## 最佳实践

**分层使用**：从最大瓶颈入手——上下文膨胀用 Tool Search Tool、中间结果污染用 Programmatic Tool Calling、参数错误用 Tool Use Examples——然后按需叠加。

**Tool Search Tool**：工具名称和描述要清晰具体以提升搜索匹配；在系统提示中说明可用工具范围；保留 3-5 个最常用工具始终加载，其余延迟加载。

**Programmatic Tool Calling**：在工具描述中清楚标注返回格式，帮助 Claude 编写正确的解析逻辑；对可并行的工具和幂等操作启用编程式编排。

**Tool Use Examples**：使用真实数据（非 "string"）；展示最小、部分、完整三种规格模式；每工具 1-5 个示例；专注于 Schema 未表达的歧义。
