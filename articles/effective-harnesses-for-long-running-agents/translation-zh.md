# 长时间运行 Agent 的有效 Harness

发布于 2025 年 11 月 26 日

随着 AI Agent 变得越来越强大，开发者越来越多地要求它们承担跨越数小时甚至数天的复杂任务。但如何跨多个上下文窗口（context window）保持一致进展，仍然是一个开放问题。核心挑战在于：每次新会话都对之前的工作毫无记忆，就像没有交接记录的换班工程师。

我们为 Claude Agent SDK 构建了一个双层解决方案：一个**初始化 Agent**（initializer agent）在首次运行时搭建环境，一个**编码 Agent**（coding agent）进行增量推进，同时为后续会话留下清晰的产物。代码示例见[配套快速入门项目](https://github.com/anthropics/claude-quickstarts/tree/main/autonomous-coding)。

---

## 长时间运行 Agent 的问题

Claude Agent SDK 在编码和工具增强任务上表现良好，并具备上下文压缩（context compaction）机制来避免窗口耗尽。但仅靠压缩是不够的：即使是 Opus 4.5，也无法仅凭一条高层级提示词，在多个会话中从零构建一个生产级的 claude.ai 复制品。

两种关键失败模式浮出水面：

1. **一次性实现（One-shot implementation）**：Agent 试图一次构建整个应用，中途耗尽上下文，留给下一个会话一堆半成品、无文档的代码。
2. **过早完成（Premature completion）**：后续会话看到部分进展后，错误地宣称项目已经完工。

我们的解决方案同时应对这两个问题：

1. 为所有需要的功能搭建初始基础
2. 引导 Agent 进行增量、干净的推进，并在会话之间留下清晰的交接

---

## 环境管理

我们在 [Claude 4 提示工程指南](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/claude-4-best-practices#multi-context-window-workflows)的最佳实践基础上，对核心环境组件做了更深入的阐述：

### 特性列表（Feature List）

为解决一次性实现和过早完成问题，初始化 Agent 会将用户的提示词展开为一份详尽的 JSON 特性列表。以 claude.ai 复制品为例，这包含超过 200 条功能描述，比如：

> "用户可以打开新聊天，输入查询，按回车键，并看到 AI 回复"

所有功能初始标记为未通过（failing），并附有结构化的测试步骤。编码 Agent 只能更新 `passes` 字段，并被严格要求不得修改测试定义本身。示例条目：

```json
{
    "category": "functional",
    "description": "New chat button creates a fresh conversation",
    "steps": [
      "Navigate to main interface",
      "Click the 'New Chat' button",
      "Verify a new conversation is created",
      "Check that chat area shows welcome state",
      "Verify conversation appears in sidebar"
    ],
    "passes": false
}
```

### 增量推进（Incremental Progress）

一次只做一个特性，消除了 Agent 过度承诺的倾向。我们还要求 Agent：

1. 提交变更时附带描述性的 git commit 消息
2. 更新 `claude-progress.txt` 日志

这让 Agent 可以回滚错误的变更，也让后续会话无需猜测就能快速了解先前的工作。

### 测试（Testing）

在没有明确提示的情况下，Claude 经常在未经端到端验证时就标记功能完成。我们通过要求 Agent 使用 Puppeteer MCP 等浏览器自动化工具，像人类用户一样测试功能来解决这个问题，包括截图来验证功能：

![Claude 通过 Puppeteer MCP 服务器测试 claude.ai 复制品时截取的截图。](/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2Ff94c2257964fb2d623f1e81f874977ebfc0986bc-1920x1080.gif&w=3840&q=75)

仍有局限，例如 Puppeteer 无法检测原生浏览器警告弹窗（alert modal）。

---

## 快速上手

每个编码 Agent 会话都以标准化的入职步骤开始：

1. 运行 `pwd` 确认工作目录
2. 读取 git 日志和 `claude-progress.txt` 来了解近期工作
3. 读取特性列表，选择优先级最高的未完成特性

一个典型的会话流程：

```
[Assistant] I'll start by getting my bearings and understanding the current state of the project.
[Tool Use] <bash - pwd>
[Tool Use] <read - claude-progress.txt>
[Tool Use] <read - feature_list.json>
[Assistant] Let me check the git log to see recent work.
[Tool Use] <bash - git log --oneline -20>
[Assistant] Now let me check if there's an init.sh script to restart the servers.
<Starts the development server>
[Assistant] Excellent! Now let me navigate to the application and verify that some fundamental features are still working.
<Tests basic functionality>
[Assistant] Based on my verification testing, fundamental features work correctly. Now I'll review the feature list to pick the next task.
<Starts work on a new feature>
```

---

## Agent 失败模式与解决方案

| 问题 | 初始化 Agent 的行为 | 编码 Agent 的行为 |
|---|---|---|
| Claude 过早宣称整个项目完成 | 创建结构化 JSON 特性列表，涵盖所有需要的端到端功能 | 会话开始时读取特性列表，选取一个未完成特性来工作 |
| 环境留有 bug 或无文档 | 创建初始 git 仓库和 `claude-progress.txt` 日志 | 会话开始时读取进度笔记/git 日志，运行基线测试，结束时提交变更并更新进度文件 |
| 未经适当测试就标记功能完成 | 设置特性列表 | 仅在仔细的端到端测试通过后才标记功能为通过 |
| Agent 难以启动应用 | 编写 `init.sh` 脚本来启动开发服务器 | 会话开始时引用 `init.sh` 脚本 |

---

## 未来工作

本项工作展示了增量式跨会话编码的工作流，但仍有开放问题：

1. 专业化多 Agent 架构是否优于单一通用编码 Agent
2. 如何将这一面向 Web 应用的工作流泛化到科学研究或金融建模等其他领域

### 致谢

由 Justin Young 撰写。特别感谢 David Hershey、Prithvi Rajasakeran、Jeremy Hadfield、Naia Bouscal、Michael Tingley、Jesse Mu、Jake Eaton、Marius Buleandara、Maggie Vo、Pedram Navid、Nadine Yasser 和 Alex Notov。本项工作得益于 Anthropic 代码 RL 团队和 Claude Code 团队的支持。欢迎申请加入团队：[anthropic.com/careers](http://anthropic.com/careers)。

### 脚注

1. 我们将这些称为不同的 Agent，仅是因为它们使用了不同的初始提示词；系统提示、工具和 harness 在其他方面完全相同。
