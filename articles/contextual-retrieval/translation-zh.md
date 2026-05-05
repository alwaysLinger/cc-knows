# 介绍 Contextual Retrieval

发布于 2024 年 9 月 19 日

要让 AI 模型在特定场景中发挥作用，它通常需要访问背景知识。例如，客户支持聊天机器人需要了解其服务的特定业务知识，法律分析机器人需要了解大量过往案例。

开发者通常使用检索增强生成（Retrieval-Augmented Generation，RAG）来增强 AI 模型的知识。RAG 是一种从知识库中检索相关信息并将其附加到用户提示中的方法，可以显著增强模型的响应。问题在于，传统 RAG 解决方案在编码信息时会丢失上下文，这往往导致系统无法从知识库中检索到相关信息。

在这篇文章中，我们概述了一种大幅改善 RAG 中检索步骤的方法。该方法称为"Contextual Retrieval"（上下文检索），使用两个子技术：Contextual Embeddings（上下文嵌入）和 Contextual BM25（上下文 BM25）。该方法可以将检索失败次数减少 49%，结合重排序（Reranking）后可减少 67%。这些改进显著提升了检索准确性，直接转化为下游任务中更好的性能。

你可以使用 Claude 轻松部署自己的 Contextual Retrieval 解决方案，参考[我们的 cookbook](https://platform.claude.com/cookbook/capabilities-contextual-embeddings-guide)。

## 关于直接使用更长提示的说明

有时最简单的方案就是最好的。如果你的知识库小于 200,000 个 token（约 500 页材料），你可以直接将整个知识库包含在给模型的提示中，无需 RAG 或类似方法。

几周前，我们发布了 Claude 的[提示缓存（Prompt Caching）](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)，使这种方法显著更快、更经济。开发者现在可以在 API 调用之间缓存常用提示，将延迟降低超过 2 倍，成本降低最多 90%（你可以通过阅读我们的[提示缓存 cookbook](https://platform.claude.com/cookbook/misc-prompt-caching)了解其工作原理）。

然而，随着知识库的增长，你需要一个更具可扩展性的解决方案。这就是 Contextual Retrieval 发挥作用的地方。

## RAG 入门：扩展到更大的知识库

对于无法放入上下文窗口的大型知识库，RAG 是典型的解决方案。RAG 通过以下步骤预处理知识库：

1. 将知识库（文档的"语料库"）分解为较小的文本块（chunk），通常不超过几百个 token；
2. 使用嵌入模型（Embedding Model）将这些文本块转换为编码语义的向量嵌入；
3. 将这些嵌入存储在向量数据库中，支持按语义相似度进行搜索。

运行时，当用户向模型输入查询时，向量数据库用于根据与查询的语义相似度找到最相关的文本块。然后，将最相关的文本块添加到发送给生成模型的提示中。

虽然嵌入模型擅长捕获语义关系，但它们可能会遗漏关键的精确匹配。幸运的是，有一种较旧的技术可以在这些情况下提供帮助。BM25（Best Matching 25）是一种使用词法匹配来查找精确词或短语匹配的排序函数。它对于包含唯一标识符或技术术语的查询特别有效。

BM25 基于 TF-IDF（Term Frequency-Inverse Document Frequency，词频-逆文档频率）概念构建。TF-IDF 衡量一个词对文档集合中某篇文档的重要程度。BM25 通过考虑文档长度并对词频应用饱和函数来改进这一点，有助于防止常见词主导结果。

以下是 BM25 在语义嵌入失败时成功的例子：假设用户在技术支持数据库中查询"Error code TS-999"。嵌入模型可能找到关于一般错误码的内容，但可能遗漏精确的"TS-999"匹配。BM25 查找这个特定的文本字符串来识别相关文档。

RAG 解决方案可以通过以下步骤结合嵌入和 BM25 技术来更准确地检索最适用的文本块：

1. 将知识库（文档的"语料库"）分解为较小的文本块，通常不超过几百个 token；
2. 为这些文本块创建 TF-IDF 编码和语义嵌入；
3. 使用 BM25 基于精确匹配查找 Top 文本块；
4. 使用嵌入基于语义相似度查找 Top 文本块；
5. 使用 rank fusion 技术合并和去重步骤 (3) 和 (4) 的结果；
6. 将 Top-K 文本块添加到提示中以生成响应。

通过同时利用 BM25 和嵌入模型，传统 RAG 系统可以提供更全面和准确的结果，在精确术语匹配与更广泛的语义理解之间取得平衡。

![标准 RAG 系统](https://www-cdn.anthropic.com/images/4zrzovbb/website/45603646e979c62349ce27744a940abf30200d57-3840x2160.png)

一个同时使用嵌入和 Best Match 25（BM25）来检索信息的标准检索增强生成（RAG）系统。TF-IDF（词频-逆文档频率）衡量词语重要性，是 BM25 的基础。

这种方法使你能够经济高效地扩展到远超单个提示容量的庞大知识库。但这些传统 RAG 系统有一个重大局限：它们经常会破坏上下文。

### 传统 RAG 中的上下文困境

在传统 RAG 中，文档通常被分割成较小的文本块以便高效检索。虽然这种方法在许多应用中效果良好，但当单个文本块缺乏足够的上下文时，可能会导致问题。

例如，假设你的知识库中嵌入了一系列财务信息（比如美国 SEC 文件），你收到了以下问题："ACME 公司 2023 年 Q2 的收入增长是多少？"

一个相关的文本块可能包含以下文本："公司收入较上季度增长3%。"然而，这个文本块本身没有指明它指的是哪家公司或相关的时间段，这使得检索正确信息或有效使用信息变得困难。

## 介绍 Contextual Retrieval

Contextual Retrieval 通过在嵌入（"Contextual Embeddings"）和创建 BM25 索引（"Contextual BM25"）之前，为每个文本块前置（prepend）块特定的解释性上下文来解决这个问题。

让我们回到 SEC 文件集合的例子。以下是文本块如何被转换的示例：

```python
original_chunk = "The company's revenue grew by 3% over the previous quarter."

contextualized_chunk = "This chunk is from an SEC filing on ACME corp's performance in Q2 2023; the previous quarter's revenue was $314 million. The company's revenue grew by 3% over the previous quarter."
```

值得注意的是，过去已经有人提出过其他使用上下文改善检索的方法。其他提议包括：向文本块添加通用文档摘要（我们实验后发现收益非常有限）、假设性文档嵌入（Hypothetical Document Embedding）和基于摘要的索引（我们评估后发现性能较低）。这些方法与本文提出的方案不同。

### 实现 Contextual Retrieval

当然，手动注释知识库中数千甚至数百万个文本块的工作量太大了。为了实现 Contextual Retrieval，我们求助于 Claude。我们编写了一个提示，指示模型提供简洁的、块特定的上下文，使用整个文档的上下文来解释该文本块。我们使用以下 Claude 3 Haiku 提示为每个文本块生成上下文：

```
<document>
{{WHOLE_DOCUMENT}}
</document>
Here is the chunk we want to situate within the whole document
<chunk>
{{CHUNK_CONTENT}}
</chunk>
Please give a short succinct context to situate this chunk within the overall document for the purposes of improving search retrieval of the chunk. Answer only with the succinct context and nothing else.
```

生成的上下文文本通常为 50-100 个 token，在嵌入和创建 BM25 索引之前前置到文本块。

以下是实践中预处理流程的样子：

![Contextual Retrieval 预处理](https://www-cdn.anthropic.com/images/4zrzovbb/website/2496e7c6fedd7ffaa043895c23a4089638b0c21b-3840x2160.png)

_Contextual Retrieval 是一种提升检索准确性的预处理技术。_

如果你有兴趣使用 Contextual Retrieval，可以通过[我们的 cookbook](https://platform.claude.com/cookbook/capabilities-contextual-embeddings-guide)开始。

### 使用 Prompt Caching 降低 Contextual Retrieval 的成本

得益于我们上面提到的特殊提示缓存功能，Contextual Retrieval 在 Claude 上可以以极低成本实现。使用提示缓存，你不需要为每个文本块传入参考文档。你只需将文档加载到缓存一次，然后引用之前缓存的内容。假设 800 token 的文本块、8k token 的文档、50 token 的上下文指令和每个文本块 100 token 的上下文，生成上下文化文本块的一次性成本为每百万文档 token $1.02。

#### 方法论

我们在各种知识领域（代码库、小说、ArXiv 论文、科学论文）、嵌入模型、检索策略和评估指标上进行了实验。我们在[附录 II](https://assets.anthropic.com/m/1632cded0a125333/original/Contextual-Retrieval-Appendix-2.pdf)中包含了每个领域使用的问题和答案的一些示例。

下面的图表显示了所有知识领域的平均性能，使用表现最佳的嵌入配置（Gemini Text 004）并检索 Top-20 文本块。我们使用 1 减去 recall@20 作为评估指标，该指标衡量在 Top 20 文本块中未能被检索到的相关文档的百分比。你可以在附录中看到完整结果——上下文化在我们评估的每个嵌入源组合中都提升了性能。

#### 性能提升

我们的实验表明：

* **Contextual Embeddings 将 Top-20 文本块检索失败率降低了 35%**（5.7% → 3.7%）。
* **结合 Contextual Embeddings 和 Contextual BM25 将 Top-20 文本块检索失败率降低了 49%**（5.7% → 2.9%）。

![Contextual Retrieval 的性能提升](https://www-cdn.anthropic.com/images/4zrzovbb/website/7f8d739e491fe6b3ba0e6a9c74e4083d760b88c9-3840x2160.png)

_结合 Contextual Embedding 和 Contextual BM25 将 Top-20 文本块检索失败率降低了 49%。_

#### 实现注意事项

在实现 Contextual Retrieval 时，有几个注意事项需要牢记：

1. **文本块边界**：考虑如何将文档分割成文本块。文本块大小、边界和重叠的选择可能影响检索性能。
2. **嵌入模型**：虽然 Contextual Retrieval 在我们测试的所有嵌入模型中都提升了性能，但某些模型可能受益更多。我们发现 [Gemini](https://ai.google.dev/gemini-api/docs/embeddings) 和 [Voyage](https://www.voyageai.com/) 嵌入特别有效。
3. **自定义上下文提示**：虽然我们提供的通用提示效果良好，但使用针对特定领域或用例定制的提示可能会获得更好的结果（例如，包含可能只在知识库中其他文档中定义的关键术语表）。
4. **文本块数量**：向上下文窗口添加更多文本块会增加包含相关信息的机会。然而，更多信息可能会干扰模型，因此这有限度。我们尝试了传递 5、10 和 20 个文本块，发现使用 20 个是这些选项中性能最好的（参见附录中的比较），但值得在你的用例上进行实验。

**始终运行评估**：通过向模型传递上下文化的文本块并区分上下文和文本块内容，可能会改善响应生成。

## 通过 Reranking 进一步提升性能

在最后一步，我们可以将 Contextual Retrieval 与另一种技术结合，以获得更大的性能提升。在传统 RAG 中，AI 系统搜索其知识库以找到可能相关的信息块。对于大型知识库，这种初始检索通常返回大量文本块——有时数百个——相关性和重要性各不相同。

重排序（Reranking）是一种常用的过滤技术，用于确保只有最相关的文本块被传递给模型。重排序提供更好的响应并降低成本和延迟，因为模型处理的信息更少。关键步骤是：

1. 执行初始检索以获取 Top 可能相关的文本块（我们使用了 Top 150）；
2. 将 Top-N 文本块连同用户查询一起传入重排序模型；
3. 使用重排序模型，根据每个文本块与提示的相关性和重要性给出评分，然后选择 Top-K 文本块（我们使用了 Top 20）；
4. 将 Top-K 文本块作为上下文传入模型以生成最终结果。

![带 Reranking 的 Contextual Retrieval](https://www-cdn.anthropic.com/images/4zrzovbb/website/8f82c6175a64442ceff4334b54fac2ab3436a1d1-3840x2160.png)

_结合 Contextual Retrieval 和 Reranking 以最大化检索准确性。_

### 性能提升

市场上有几种重排序模型。我们使用 [Cohere reranker](https://cohere.com/rerank) 进行了测试。Voyage 也提供重排序器，但我们没有时间测试。我们的实验表明，在不同领域中，添加重排序步骤进一步优化了检索。

具体而言，我们发现 Reranked Contextual Embedding 和 Contextual BM25 将 Top-20 文本块检索失败率降低了 67%（5.7% → 1.9%）。

![带 Reranking 的性能](https://www-cdn.anthropic.com/images/4zrzovbb/website/93a70cfbb7cca35bb8d86ea0a23bdeeb699e8e58-3840x2160.png)

_Reranked Contextual Embedding 和 Contextual BM25 将 Top-20 文本块检索失败率降低了 67%。_

#### 成本和延迟注意事项

重排序的一个重要考虑因素是对延迟和成本的影响，特别是在重排序大量文本块时。由于重排序在运行时增加了一个额外步骤，它不可避免地会增加少量延迟，即使重排序器并行对所有文本块进行评分。在重排序更多文本块以获得更好性能与重排序更少文本块以获得更低延迟和成本之间存在固有的权衡。我们建议在你的特定用例上尝试不同的设置，以找到合适的平衡。

## 结论

我们运行了大量测试，比较了上述所有技术的不同组合（嵌入模型、BM25 的使用、Contextual Retrieval 的使用、重排序器的使用以及检索的 Top-K 结果总数），涵盖了各种不同的数据集类型。以下是我们发现的总结：

1. 嵌入 + BM25 优于单独使用嵌入；
2. 在我们测试的嵌入中，Voyage 和 Gemini 是最好的；
3. 向模型传递 Top-20 文本块比仅传递 Top-10 或 Top-5 更有效；
4. 为文本块添加上下文大幅提升检索准确性；
5. 重排序优于无重排序；
6. **所有这些收益可以叠加**：为了最大化性能提升，我们可以结合上下文嵌入（来自 Voyage 或 Gemini）与上下文 BM25，加上重排序步骤，并将 20 个文本块添加到提示中。

我们鼓励所有使用知识库的开发者使用[我们的 cookbook](https://platform.claude.com/cookbook/capabilities-contextual-embeddings-guide)来实验这些方法，以解锁新的性能水平。

## 附录 I

以下是各数据集的结果明细，包括嵌入提供商、是否额外使用 BM25、是否使用 Contextual Retrieval 以及是否使用重排序，基于 Retrievals @ 20 的结果。

参见[附录 II](https://assets.anthropic.com/m/1632cded0a125333/original/Contextual-Retrieval-Appendix-2.pdf)，了解 Retrievals @ 10 和 @ 5 的明细以及每个数据集的示例问答。

![详细结果](https://www-cdn.anthropic.com/images/4zrzovbb/website/646a894ec4e6120cade9951a362f685cd2ec89b2-2458x2983.png)

_各数据集和嵌入提供商的 1 minus recall @ 20 结果。_

## 致谢

研究和撰写由 Daniel Ford 完成。感谢 Orowa Sikder、Gautam Mittal 和 Kenneth Lien 提供关键反馈，Samuel Flamini 实现 cookbook，Lauren Polansky 负责项目协调，以及 Alex Albert、Susan Payne、Stuart Ritchie 和 Brad Abrams 帮助塑造这篇博文。

## 获取开发者通讯

产品更新、操作指南、社区亮点等。每月发送到您的收件箱。

如果您希望接收我们的月度开发者通讯，请提供您的电子邮件地址。您可以随时取消订阅。
