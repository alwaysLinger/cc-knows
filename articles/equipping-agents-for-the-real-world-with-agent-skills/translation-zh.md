# 为智能体装备现实世界能力：Agent Skills

发布于 2025 年 10 月 16 日

Claude 功能强大，但真正的工作需要程序性知识和组织上下文。推出 Agent Skills——一种使用文件和文件夹构建专业智能体的新方式。

_更新：我们已将_ [_Agent Skills_](https://agentskills.io/) _发布为跨平台可移植的开放标准。（2025 年 12 月 18 日）_

随着模型能力的提升，我们现在可以构建与完整计算环境交互的通用智能体（Agent）。例如，[Claude Code](https://claude.com/product/claude-code) 可以利用本地代码执行和文件系统跨领域完成复杂任务。但随着这些智能体变得更加强大，我们需要更加可组合、可扩展和可移植的方式来为其配备领域特定的专业知识。

这促使我们创建了 [**Agent Skills**](https://www.anthropic.com/news/skills)：由指令、脚本和资源组成的有序文件夹，智能体可以动态发现和加载这些文件夹，以在特定任务上表现更佳。Skills 通过将你的专业知识打包为 Claude 可组合的资源来扩展 Claude 的能力，将通用智能体转变为符合你需求的专业智能体。

为智能体构建一个 Skill 就像为新员工编写入职指南。你不再需要为每个用例构建碎片化的、定制设计的智能体，任何人现在都可以通过捕获和分享程序性知识来为智能体配备可组合的能力。在本文中，我们将解释什么是 Skills，展示它们如何工作，并分享构建你自己的 Skills 的最佳实践。

![要激活 Skills，你只需要编写一个 SKILL.md 文件，为你的智能体提供自定义指导。](/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2Fddd7e6e572ad0b6a943cacefe957248455f6d522-1650x929.jpg&w=3840&q=75)

一个 Skill 是一个包含 SKILL.md 文件的目录，其中收纳了为智能体提供额外能力的指令、脚本和资源的有序文件夹。

## Skill 的结构

要了解 Skills 的实际运作，让我们看一个真实示例：为 [Claude 最近推出的文档编辑功能](https://www.anthropic.com/news/create-files)提供支持的 Skills 之一。Claude 已经对理解 PDF 有很多了解，但直接操作 PDF 的能力有限（例如填写表单）。这个 [PDF Skill](https://github.com/anthropics/skills/tree/main/document-skills/pdf) 让我们能够赋予 Claude 这些新能力。

最简单的情况下，一个 Skill 是一个包含 `SKILL.md` 文件的目录。该文件必须以 YAML frontmatter 开头，其中包含一些必需的元数据：`name` 和 `description`。在启动时，智能体会将每个已安装 Skill 的 `name` 和 `description` 预加载到其系统提示中。

这些元数据是**渐进式披露（Progressive Disclosure）**的**第一层**：它提供了刚好足够的信息，让 Claude 知道何时应该使用每个 Skill，而无需将所有内容加载到上下文中。该文件的实际正文是**第二层**细节。如果 Claude 认为 Skill 与当前任务相关，它会通过将完整的 `SKILL.md` 读入上下文来加载该 Skill。

![SKILL.md 文件的结构，包括相关元数据：name、description，以及与 Skill 应执行的特定操作相关的上下文。](/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F6f22d8913dbc6228e7f11a41e0b3c124d817b6d2-1650x929.jpg&w=3840&q=75)

SKILL.md 文件必须以包含 name 和 description 的 YAML Frontmatter 开头，这些内容在启动时被加载到系统提示中。

随着 Skills 复杂度的增长，它们可能包含过多上下文以至于无法放入单个 `SKILL.md`，或者包含仅在特定场景下相关的上下文。在这些情况下，Skills 可以在 Skill 目录中捆绑额外文件，并从 `SKILL.md` 中按名称引用它们。这些额外的链接文件是**第三层**（及更深层）的细节，Claude 可以选择仅在需要时导航和发现它们。

在下面展示的 PDF Skill 中，`SKILL.md` 引用了两个额外文件（`reference.md` 和 `forms.md`），Skill 作者选择将它们与核心 `SKILL.md` 捆绑在一起。通过将表单填写指令移到单独的文件（`forms.md`）中，Skill 作者能够保持 Skill 核心的精简，相信 Claude 只会在填写表单时才读取 `forms.md`。

![如何将额外内容捆绑到 SKILL.md 文件中。](/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F191bf5dd4b6f8cfe6f1ebafe6243dd1641ed231c-1650x1069.jpg&w=3840&q=75)

你可以将更多上下文（通过额外文件）整合到你的 Skill 中，然后由 Claude 根据系统提示触发使用。

渐进式披露是使 Agent Skills 灵活且可扩展的核心设计原则。就像一本组织良好的手册，从目录开始，然后是具体章节，最后是详细附录，Skills 让 Claude 仅在需要时加载信息：

![此图描绘了 Skills 中上下文的渐进式披露。](/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2Fa3bca2763d7892982a59c28aa4df7993aaae55ae-2292x673.jpg&w=3840&q=75)

拥有文件系统和代码执行工具的智能体在处理特定任务时，不需要将整个 Skill 读入上下文窗口。这意味着 Skill 中可捆绑的上下文量实际上是**无上限的**。

### Skills 与上下文窗口

下图展示了当 Skill 被用户消息触发时，上下文窗口的变化。

![此图描绘了 Skills 在上下文窗口中如何被触发。](/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F441f6cc0d2337913c1f41b05357f16f51f702e-1650x929.jpg&w=3840&q=75)

Skills 通过系统提示在上下文窗口中被触发。

图中展示的操作序列：

1. 首先，上下文窗口包含核心系统提示和每个已安装 Skill 的元数据，以及用户的初始消息；
2. Claude 通过调用 Bash 工具读取 `pdf/SKILL.md` 的内容来触发 PDF Skill；
3. Claude 选择读取与 Skill 捆绑的 `forms.md` 文件；
4. 最后，Claude 在加载了 PDF Skill 中的相关指令后，继续执行用户的任务。

### Skills 与代码执行

Skills 还可以包含供 Claude 自行决定作为工具执行的代码。

大语言模型在许多任务上表现出色，但某些操作更适合传统的代码执行。例如，通过 token 生成来排序列表远比直接运行排序算法昂贵得多。除了效率问题，许多应用还需要只有代码才能提供的确定性可靠性。

在我们的示例中，PDF Skill 包含一个预编写的 Python 脚本，可以读取 PDF 并提取所有表单字段。Claude 可以运行此脚本，而无需将脚本或 PDF 加载到上下文中。而且由于代码是确定性的，此工作流是一致且可重复的。

![此图描绘了如何通过 Skills 执行代码。](/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2Fc24b4a2ff77277c430f2c9ef1541101766ae5714-1650x929.jpg&w=3840&q=75)

Skills 还可以包含供 Claude 根据任务性质自行决定作为工具执行的代码。

## 开发和评估 Skills

以下是一些有助于开始编写和测试 Skills 的指导原则：

* **从评估开始：** 通过在代表性任务上运行智能体并观察它们在哪里遇到困难或需要额外上下文，来识别智能体能力的具体差距。然后增量式构建 Skills 来解决这些不足。
* **为规模而结构化：** 当 `SKILL.md` 文件变得臃肿时，将其内容拆分为单独的文件并引用它们。如果某些上下文是互斥的或很少一起使用，将它们分开存放将减少 token 使用量。最后，代码既可以充当可执行工具，也可以充当文档。应明确 Claude 是应该直接运行脚本，还是将其读入上下文作为参考。
* **站在 Claude 的视角思考：** 监控 Claude 在真实场景中如何使用你的 Skill，并根据观察进行迭代：留意意外的轨迹或对某些上下文的过度依赖。特别注意 Skill 的 `name` 和 `description`。Claude 在决定是否响应当前任务而触发 Skill 时会使用它们。
* **与 Claude 协作迭代：** 当你与 Claude 一起完成任务时，让 Claude 将其成功的方法和常见错误捕获为 Skill 中可复用的上下文和代码。如果在使用 Skill 完成任务时偏离了轨道，让它自我反思哪里出了问题。这个过程将帮助你发现 Claude 真正需要的上下文，而不是试图事先猜测。

### 使用 Skills 时的安全考量

Skills 通过指令和代码为 Claude 提供新能力。虽然这使它们非常强大，但也意味着恶意 Skills 可能在使用它们的环境中引入漏洞，或指示 Claude 泄露数据和执行非预期操作。

我们建议仅从可信来源安装 Skills。当从不太可信的来源安装 Skill 时，在使用前应进行彻底审计。首先阅读 Skill 中捆绑的文件内容以了解其功能，特别注意代码依赖和捆绑的资源（如图像或脚本）。同样，注意 Skill 中指示 Claude 连接可能不可信的外部网络来源的指令或代码。

## Skills 的未来

Agent Skills 目前已在 [Claude.ai](http://claude.ai/redirect/website.v1.160683d3-b377-4ce4-97f8-fdb70520e69d)、Claude Code、Claude Agent SDK 和 Claude 开发者平台上[获得支持](https://www.anthropic.com/news/skills)。

在接下来的几周里，我们将继续添加支持创建、编辑、发现、分享和使用 Skills 完整生命周期的功能。我们对 Skills 帮助组织和个人与 Claude 分享其上下文和工作流的机会感到特别兴奋。我们还将探索 Skills 如何与[模型上下文协议（Model Context Protocol）](https://modelcontextprotocol.io/)（MCP）服务器互补，通过教授智能体涉及外部工具和软件的更复杂工作流。

展望更远的未来，我们希望使智能体能够自行创建、编辑和评估 Skills，让它们将自己的行为模式固化为可复用的能力。

Skills 是一个简单的概念，对应着同样简单的格式。这种简单性使得组织、开发者和终端用户更容易构建定制的智能体并赋予它们新能力。

我们很高兴看到人们用 Skills 构建出什么。立即开始使用，请查看我们的 Skills [文档](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview)和[ cookbook](https://github.com/anthropics/claude-cookbooks/tree/main/skills)。

## 致谢

由 Barry Zhang、Keith Lazuka 和 Mahesh Murag 撰写，他们都非常喜欢文件夹。特别感谢 Anthropic 内部许多倡导、支持和构建 Skills 的人。
