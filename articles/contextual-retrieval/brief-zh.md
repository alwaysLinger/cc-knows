# Contextual Retrieval 简要提炼

## 核心问题

传统 RAG（检索增强生成）系统在将文档切分为小块进行索引时，会丢失上下文信息。例如，一个包含"公司收入较上季度增长3%"的文本块，脱离原文后无法判断是哪家公司、哪个季度，导致检索失败。

## 核心方案

Anthropic 提出 **Contextual Retrieval**（上下文检索），通过两个子技术解决上下文丢失问题：

1. **Contextual Embeddings**（上下文嵌入）：在嵌入前，为每个文本块 prepend 一段由 Claude 生成的简短上下文说明（通常50-100 token），将其置于整个文档的语境中
2. **Contextual BM25**（上下文 BM25）：在构建 BM25 索引前，同样 prepend 上下文说明

## 关键数据

- Contextual Embeddings 单独使用：检索失败率降低 **35%**（5.7% → 3.7%）
- 结合 Contextual Embeddings + Contextual BM25：检索失败率降低 **49%**（5.7% → 2.9%）
- 再叠加 Reranking（重排序）：检索失败率降低 **67%**（5.7% → 1.9%）

## 成本优势

借助 Claude 的 Prompt Caching（提示缓存），生成上下文的成本极低——每百万文档 token 仅需 **$1.02**。文档只需加载到缓存一次，即可为所有文本块生成上下文。

## 核心结论

所有技术收益可叠加：嵌入 + BM25 优于纯嵌入；添加上下文大幅提升检索精度；Reranking 进一步优化；最佳组合是上下文嵌入 + 上下文 BM25 + 重排序 + 传递 Top-20 文本块。对于小于 20 万 token 的知识库，直接将全部内容放入提示即可，无需 RAG。
