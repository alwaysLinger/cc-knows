# Claude Code 最佳实践

> 从配置环境到跨并行会话扩展，获取 Claude Code 最大效能的技巧与模式。

Claude Code 是一个代理式编码环境（agentic coding environment）。与回答问题后等待的聊天机器人不同，Claude Code 可以读取你的文件、运行命令、做出修改，并在你观察、重定向或完全离开时自主地解决问题。

这改变了你的工作方式。你不再自己编写代码然后让 Claude 审查，而是描述你想要什么，Claude 自行决定如何构建。Claude 探索、规划并实现。

但这种自主性仍然伴随着学习曲线。Claude 在某些约束下工作，你需要理解这些约束。

本指南涵盖了在 Anthropic 内部团队以及各种代码库、语言和环境中使用 Claude Code 的工程师们证明有效的模式。关于代理式循环（agentic loop）底层工作原理，请参阅 [Claude Code 的工作原理](/en/how-claude-code-works)。

***

大多数最佳实践基于一个约束：Claude 的上下文窗口（context window）会快速填满，且性能随填充而下降。

Claude 的上下文窗口容纳你的整个对话，包括每条消息、Claude 读取的每个文件以及每条命令输出。然而，这可能会快速填满。一次调试会话或代码库探索可能生成并消耗数万个 token。

这很重要，因为 LLM 性能随上下文填充而下降。当上下文窗口即将满时，Claude 可能开始"遗忘"早期指令或犯更多错误。上下文窗口是需要管理的最重要资源。要查看会话实际如何填充，[观看交互式演示](/en/context-window)，了解启动时加载了什么以及每次文件读取消耗多少。使用[自定义状态栏](/en/statusline)持续跟踪上下文使用量，并参阅[减少 token 用量](/en/costs#reduce-token-usage)获取减少 token 使用的策略。

***

## 给 Claude 验证自身工作的方式

<Tip>
  包含测试、截图或预期输出，让 Claude 能自行检查。这是你能做的单一最高杠杆的事情。
</Tip>

Claude 在能验证自身工作时表现显著提升，例如运行测试、对比截图和验证输出。

没有明确的成功标准，它可能产出看起来正确但实际不工作的东西。你成为唯一的反馈环，每个错误都需要你的关注。

| 策略                                 | 之前                                                   | 之后                                                                                                                                                                                                   |
| ------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **提供验证标准**                     | *"实现一个验证邮箱地址的函数"*                         | *"写一个 validateEmail 函数。示例测试用例：user@example.com 为 true，invalid 为 false，user@.com 为 false。实现后运行测试"*                                                                            |
| **视觉验证 UI 变更**                 | *"让仪表盘看起来更好"*                                 | *"[粘贴截图] 实现这个设计。截图查看结果并与原始设计对比。列出差异并修复"*                                                                                                                               |
| **定位根因而非症状**                 | *"构建失败了"*                                         | *"构建失败，错误为：[粘贴错误]。修复它并验证构建成功。定位根因，不要压制错误"*                                                                                                                         |

UI 变更可以使用 [Claude Chrome 扩展](/en/chrome)进行验证。它会在你的浏览器中打开新标签页，测试 UI，并迭代直到代码正常工作。

你的验证也可以是测试套件、linter 或检查输出的 Bash 命令。投资于让你的验证坚如磐石。

***

## 先探索，再规划，再编码

<Tip>
  将研究和规划与实现分离，避免解决错误的问题。
</Tip>

让 Claude 直接跳到编码可能产出解决错误问题的代码。使用[规划模式](/en/permission-modes#analyze-before-you-edit-with-plan-mode)将探索与执行分离。

推荐的工作流有四个阶段：

<Steps>
  <Step title="探索">
    进入规划模式。Claude 读取文件并回答问题，不做修改。

    ```txt claude (plan mode) theme={null}
    读取 /src/auth 并了解我们如何处理会话和登录。
    同时看看我们如何管理环境变量来存放密钥。
    ```
  </Step>

  <Step title="规划">
    让 Claude 创建详细的实现方案。

    ```txt claude (plan mode) theme={null}
    我想添加 Google OAuth。需要修改哪些文件？
    会话流程是什么？创建一个方案。
    ```

    按 `Ctrl+G` 在文本编辑器中打开方案，在 Claude 继续之前直接编辑。
  </Step>

  <Step title="实现">
    退出规划模式，让 Claude 按方案编码并验证。

    ```txt claude (default mode) theme={null}
    按照你的方案实现 OAuth 流程。为回调处理器
    编写测试，运行测试套件并修复任何失败。
    ```
  </Step>

  <Step title="提交">
    让 Claude 用描述性消息提交并创建 PR。

    ```txt claude (default mode) theme={null}
    用描述性消息提交并打开 PR
    ```
  </Step>
</Steps>

<Callout>
  规划模式很有用，但也会增加开销。

  对于范围明确且修复很小的任务（比如修复错别字、添加日志行或重命名变量），让 Claude 直接做。

  规划在你不确信方案、修改涉及多个文件或你不熟悉要修改的代码时最有用。如果你能用一句话描述 diff，就跳过规划。
</Callout>

***

## 在提示中提供具体上下文

<Tip>
  你的指令越精确，需要的修正就越少。
</Tip>

Claude 能推断意图，但不会读心。引用具体文件、提及约束、指向示例模式。

| 策略                                                                                             | 之前                                               | 之后                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **界定范围。** 指定哪个文件、什么场景和测试偏好。                                                | *"为 foo.py 添加测试"*                             | *"为 foo.py 写一个测试，覆盖用户已登出的边界情况。避免使用 mock。"*                                                                                                                                                                                                                                                                                                  |
| **指向来源。** 引导 Claude 到能回答问题的来源。                                                   | *"为什么 ExecutionFactory 的 API 这么奇怪？"*      | *"查看 ExecutionFactory 的 git 历史并总结其 API 是如何形成的"*                                                                                                                                                                                                                                                                                                      |
| **引用已有模式。** 指向代码库中的模式。                                                            | *"添加一个日历组件"*                               | *"看看主页上现有组件是如何实现的，以了解模式。HotDogWidget.php 是个好例子。按照该模式实现一个新的日历组件，让用户选择月份并前后翻页选择年份。从零开始构建，不使用代码库中已有的库之外的其他库。"*                                                                                                                                                                       |
| **描述症状。** 提供症状、可能的位置和"修复"是什么样的。                                            | *"修复登录 bug"*                                   | *"用户报告会话超时后登录失败。检查 src/auth/ 中的认证流程，特别是 token 刷新。写一个复现问题的失败测试，然后修复它"*                                                                                                                                                                                                                                                   |

模糊提示在你在探索且有能力纠正方向时可能有用。像"你觉得这个文件有什么可以改进的？"这样的提示可以发现你没想过要问的问题。

### 提供丰富内容

<Tip>
  使用 `@` 引用文件、粘贴截图/图片或直接管道输入数据。
</Tip>

你可以通过多种方式向 Claude 提供丰富数据：

* **用 `@` 引用文件**，而非描述代码在哪里。Claude 在响应前会先读取文件。
* **直接粘贴图片**。复制/粘贴或拖放图片到提示中。
* **提供 URL** 获取文档和 API 参考。使用 `/permissions` 将常用域名加入白名单。
* **管道输入数据**，运行 `cat error.log | claude` 直接发送文件内容。
* **让 Claude 自行获取所需内容**。告诉 Claude 使用 Bash 命令、MCP 工具或读取文件来拉取上下文。

***

## 配置你的环境

几个设置步骤能让 Claude Code 在所有会话中显著更高效。关于扩展功能的完整概览以及何时使用每种功能，请参阅[扩展 Claude Code](/en/features-overview)。

### 写好 CLAUDE.md

<Tip>
  运行 `/init` 基于当前项目结构生成入门 CLAUDE.md 文件，然后随时间精炼。
</Tip>

CLAUDE.md 是 Claude 在每次对话开始时读取的特殊文件。包含 Bash 命令、代码风格和工作流规则。这为 Claude 提供了它无法从代码中推断的持久上下文。

`/init` 命令分析你的代码库以检测构建系统、测试框架和代码模式，给你一个扎实的基础来精炼。

CLAUDE.md 文件没有固定格式，但要保持简短和可读。例如：

```markdown CLAUDE.md theme={null}
# 代码风格
- 使用 ES modules (import/export) 语法，而非 CommonJS (require)
- 尽可能使用解构导入（例如 import { foo } from 'bar'）

# 工作流
- 完成一系列代码修改后务必进行类型检查
- 为了性能，优先运行单个测试而非整个测试套件
```

CLAUDE.md 在每次会话中加载，所以只包含广泛适用的内容。对于仅有时相关的领域知识或工作流，改用 [skills](/en/skills)。Claude 按需加载它们，不会膨胀每次对话。

保持简洁。对于每一行，问自己：*"删除这行会导致 Claude 犯错吗？"* 如果不会，删掉它。臃肿的 CLAUDE.md 文件会导致 Claude 忽略你的实际指令！

| ✅ 包含                                              | ❌ 排除                                            |
| ---------------------------------------------------- | -------------------------------------------------- |
| Claude 猜不到的 Bash 命令                            | Claude 能通过读代码推断的任何内容                   |
| 偏离默认值的代码风格规则                              | Claude 已知的标准语言惯例                           |
| 测试指令和首选测试运行器                              | 详细的 API 文档（改为链接到文档）                   |
| 仓库规范（分支命名、PR 约定）                         | 频繁变化的信息                                     |
| 你的项目特有的架构决策                                | 长篇解释或教程                                     |
| 开发环境怪癖（必需的环境变量）                         | 逐文件的代码库描述                                 |
| 常见陷阱或非显而易见的行为                            | "写干净代码"等不言自明的实践                       |

如果 Claude 尽管有规则仍然不断做你不想做的事，文件可能太长，规则被淹没了。如果 Claude 问你的问题在 CLAUDE.md 中已有答案，措辞可能有歧义。把 CLAUDE.md 当代码对待：出问题时审查它，定期修剪，通过观察 Claude 的行为是否实际改变来测试修改。

你可以通过添加强调（如 "IMPORTANT" 或 "YOU MUST"）来调优指令以提高遵从度。将 CLAUDE.md 提交到 git，让团队可以贡献。这个文件的价值会随时间复合增长。

CLAUDE.md 文件可以使用 `@path/to/import` 语法导入额外文件：

```markdown CLAUDE.md theme={null}
参见 @README.md 了解项目概览，@package.json 了解可用的 npm 命令。

# 额外指令
- Git 工作流：@docs/git-instructions.md
- 个人覆盖：@~/.claude/my-project-instructions.md
```

你可以将 CLAUDE.md 文件放在多个位置：

* **主目录 (`~/.claude/CLAUDE.md`)**：应用于所有 Claude 会话
* **项目根目录 (`./CLAUDE.md`)**：提交到 git 与团队共享
* **项目根目录 (`./CLAUDE.local.md`)**：个人项目特定笔记；将此文件添加到 `.gitignore` 以免与团队共享
* **父目录**：适用于 monorepo，`root/CLAUDE.md` 和 `root/foo/CLAUDE.md` 都会被自动拉入
* **子目录**：Claude 在处理这些目录中的文件时按需拉入子目录的 CLAUDE.md 文件

### 配置权限

<Tip>
  使用[自动模式](/en/permission-modes#eliminate-prompts-with-auto-mode)让分类器处理审批，`/permissions` 白名单特定命令，或 `/sandbox` 进行 OS 级隔离。每种方式都减少中断同时让你保持控制。
</Tip>

默认情况下，Claude Code 对可能修改系统的操作请求许可：文件写入、Bash 命令、MCP 工具等。这很安全但繁琐。第十次审批后你已经不是真正在审查了，只是在点击通过。有三种方式减少这些中断：

* **自动模式**：一个单独的分类器模型审查命令，只阻断看起来有风险的：范围升级、未知基础设施或恶意内容驱动的操作。在你信任任务大方向但不想点击每一步时最佳
* **权限白名单**：允许你知道安全的特定工具，如 `npm run lint` 或 `git commit`
* **沙箱**：启用 OS 级隔离，限制文件系统和网络访问，允许 Claude 在定义的边界内更自由地工作

阅读更多关于[权限模式](/en/permission-modes)、[权限规则](/en/permissions)和[沙箱](/en/sandboxing)。

### 使用 CLI 工具

<Tip>
  告诉 Claude Code 在与外部服务交互时使用 `gh`、`aws`、`gcloud` 和 `sentry-cli` 等 CLI 工具。
</Tip>

CLI 工具是与外部服务交互最节省上下文的方式。如果你使用 GitHub，安装 `gh` CLI。Claude 知道如何使用它来创建 issue、打开 PR 和阅读评论。没有 `gh`，Claude 仍然可以使用 GitHub API，但未经认证的请求经常触发速率限制。

Claude 也善于学习它不熟悉的 CLI 工具。试试这样的提示：`Use 'foo-cli-tool --help' to learn about foo tool, then use it to solve A, B, C.`

### 连接 MCP 服务器

<Tip>
  运行 `claude mcp add` 连接 Notion、Figma 或你的数据库等外部工具。
</Tip>

通过 [MCP 服务器](/en/mcp)，你可以让 Claude 从 issue 跟踪器实现功能、查询数据库、分析监控数据、从 Figma 集成设计以及自动化工作流。

### 设置 Hooks

<Tip>
  用 Hooks 处理必须每次都零例外执行的操作。
</Tip>

[Hooks](/en/hooks-guide) 在 Claude 工作流的特定节点自动运行脚本。与 CLAUDE.md 指令（建议性的）不同，Hooks 是确定性的，保证动作一定执行。

Claude 可以为你编写 Hooks。试试这样的提示：*"写一个在每次文件编辑后运行 eslint 的 hook"* 或 *"写一个阻止写入 migrations 文件夹的 hook。"* 直接编辑 `.claude/settings.json` 手动配置 hooks，运行 `/hooks` 浏览已配置的内容。

### 创建 Skills

<Tip>
  在 `.claude/skills/` 中创建 `SKILL.md` 文件，为 Claude 提供领域知识和可复用工作流。
</Tip>

[Skills](/en/skills) 用特定于你的项目、团队或领域的信息扩展 Claude 的知识。Claude 在相关时自动应用它们，或者你可以用 `/skill-name` 直接调用。

通过在 `.claude/skills/` 中添加包含 `SKILL.md` 的目录来创建 skill：

```markdown .claude/skills/api-conventions/SKILL.md theme={null}
---
name: api-conventions
description: 我们服务的 REST API 设计约定
---
# API 约定
- URL 路径使用 kebab-case
- JSON 属性使用 camelCase
- 列表端点始终包含分页
- 在 URL 路径中版本化 API (/v1/, /v2/)
```

Skills 也可以定义你直接调用的可复用工作流：

```markdown .claude/skills/fix-issue/SKILL.md theme={null}
---
name: fix-issue
description: 修复一个 GitHub issue
disable-model-invocation: true
---
分析并修复 GitHub issue：$ARGUMENTS。

1. 使用 `gh issue view` 获取 issue 详情
2. 理解 issue 中描述的问题
3. 在代码库中搜索相关文件
4. 实现必要的修改来修复问题
5. 编写并运行测试以验证修复
6. 确保代码通过 linting 和类型检查
7. 创建描述性的提交消息
8. 推送并创建 PR
```

运行 `/fix-issue 1234` 来调用它。对有副作用且你想手动触发的工作流使用 `disable-model-invocation: true`。

### 创建自定义子代理

<Tip>
  在 `.claude/agents/` 中定义专业助手，Claude 可以委托给它们处理隔离任务。
</Tip>

[子代理](/en/sub-agents)在独立上下文中运行，拥有自己的允许工具集。它们适用于需要读取大量文件或需要专注而不污染主对话的任务。

```markdown .claude/agents/security-reviewer.md theme={null}
---
name: security-reviewer
description: 审查代码的安全漏洞
tools: Read, Grep, Glob, Bash
model: opus
---
你是一名高级安全工程师。审查代码中的：
- 注入漏洞（SQL、XSS、命令注入）
- 认证和授权缺陷
- 代码中的秘密或凭证
- 不安全的数据处理

提供具体的行引用和建议的修复。
```

明确告诉 Claude 使用子代理：*"使用子代理审查此代码的安全问题。"*

### 安装插件

<Tip>
  运行 `/plugin` 浏览市场。插件无需配置即可添加 skills、工具和集成。
</Tip>

[插件](/en/plugins)将 skills、hooks、子代理和 MCP 服务器捆绑为来自社区和 Anthropic 的单一可安装单元。如果你使用类型化语言，安装[代码智能插件](/en/discover-plugins#code-intelligence)为 Claude 提供精确的符号导航和编辑后的自动错误检测。

关于在 skills、子代理、hooks 和 MCP 之间选择的指导，请参阅[扩展 Claude Code](/en/features-overview#match-features-to-your-goal)。

***

## 有效沟通

你与 Claude Code 沟通的方式显著影响结果质量。

### 提问代码库

<Tip>
  向 Claude 提问你会问资深工程师的问题。
</Tip>

在入职新代码库时，使用 Claude Code 进行学习和探索。你可以向 Claude 提问你会问另一位工程师的那些问题：

* 日志是怎么工作的？
* 我怎么创建新的 API 端点？
* `foo.rs` 第 134 行的 `async move { ... }` 是什么意思？
* `CustomerOnboardingFlowImpl` 处理了哪些边界情况？
* 为什么这段代码在第 333 行调用 `foo()` 而不是 `bar()`？

这样使用 Claude Code 是有效的入职工作流，改善上手时间并减少其他工程师的负担。不需要特殊提示：直接提问即可。

### 让 Claude 采访你

<Tip>
  对于更大的功能，先让 Claude 采访你。用最少的提示开始，让 Claude 使用 `AskUserQuestion` 工具采访你。
</Tip>

Claude 会问你可能还没考虑过的事情，包括技术实现、UI/UX、边界情况和权衡。

```text theme={null}
我想构建[简要描述]。使用 AskUserQuestion 工具详细采访我。

询问技术实现、UI/UX、边界情况、顾虑和权衡。不要问显而易见的问题，深挖我可能没考虑过的难点。

持续采访直到覆盖所有内容，然后写完整规格到 SPEC.md。
```

规格完成后，启动新会话来执行。新会话拥有完全专注于实现的干净上下文，你还有书面规格可以参考。

***

## 管理你的会话

对话是持久的和可逆的。善用这一点！

### 频繁且尽早纠偏

<Tip>
  一发现 Claude 偏离方向就立即纠正。
</Tip>

最好的结果来自紧密的反馈环。虽然 Claude 偶尔第一次尝试就完美解决问题，但快速纠正通常更快产生更好的方案。

* **`Esc`**：用 `Esc` 键中途停止 Claude。上下文保留，你可以重定向。
* **`Esc + Esc` 或 `/rewind`**：按两次 `Esc` 或运行 `/rewind` 打开回退菜单，恢复之前的对话和代码状态，或从选定消息开始摘要。
* **`"Undo that"`**：让 Claude 撤回其更改。
* **`/clear`**：在不相关任务间重置上下文。包含不相关上下文的长会话会降低性能。

如果你在同一个问题上纠正 Claude 超过两次，上下文已被失败方案污染。运行 `/clear` 并用融入了你所学教训的更具体提示重新开始。带有更好提示的干净会话几乎总是优于累积了纠正的长会话。

### 激进管理上下文

<Tip>
  在不相关任务之间运行 `/clear` 重置上下文。
</Tip>

Claude Code 在接近上下文限制时自动压缩对话历史，保留重要的代码和决策同时释放空间。

在长会话中，Claude 的上下文窗口可能充满不相关的对话、文件内容和命令。这可能降低性能，有时会分散 Claude 的注意力。

* 在任务之间频繁使用 `/clear` 完全重置上下文窗口
* 自动压缩触发时，Claude 会摘要最重要的内容，包括代码模式、文件状态和关键决策
* 要更多控制，运行 `/compact <指令>`，如 `/compact 专注于 API 变更`
* 要只压缩对话的一部分，使用 `Esc + Esc` 或 `/rewind`，选择一个消息检查点，选择**从这里摘要**。这会压缩该点之后的消息，同时保留之前的上下文完整
* 在 CLAUDE.md 中自定义压缩行为，添加如 `"压缩时，始终保留修改文件的完整列表和任何测试命令"` 的指令，确保关键上下文在摘要中保留
* 对于不需要留在上下文中的快速问题，使用 [`/btw`](/en/interactive-mode#side-questions-with-%2Fbtw)。答案出现在可关闭的浮层中，永远不会进入对话历史，所以你可以查看细节而不增长上下文。

### 用子代理做调研

<Tip>
  用 `"使用子代理调查 X"` 委托研究。它们在独立上下文中探索，保持主对话干净用于实现。
</Tip>

由于上下文是你的根本约束，子代理是可用的最强大的工具之一。当 Claude 研究代码库时，它读取大量文件，所有这些都消耗你的上下文。子代理在独立的上下文窗口中运行并返回摘要：

```text theme={null}
使用子代理调查我们的认证系统如何处理 token
刷新，以及我们是否有应该复用的现有 OAuth 工具。
```

子代理探索代码库、读取相关文件并返回发现，所有这些都不会污染你的主对话。

你也可以在 Claude 实现后使用子代理进行验证：

```text theme={null}
使用子代理审查此代码的边界情况
```

### 用检查点回退

<Tip>
  Claude 的每个操作都创建检查点。你可以将对话、代码或两者恢复到任何之前的检查点。
</Tip>

Claude 在修改前自动创建检查点。双击 `Escape` 或运行 `/rewind` 打开回退菜单。你可以仅恢复对话、仅恢复代码、恢复两者，或从选定消息开始摘要。详见[检查点](/en/checkpointing)。

与其仔细规划每一步，你可以让 Claude 尝试有风险的操作。如果不行，回退并尝试不同方案。检查点跨会话持久化，所以你可以关闭终端，稍后仍然可以回退。

<Warning>
  检查点只跟踪 *由 Claude* 做出的更改，而非外部进程。这不是 git 的替代品。
</Warning>

### 恢复对话

<Tip>
  用 `/rename` 命名会话，把它们当作分支对待：每个工作流有自己的持久上下文。
</Tip>

Claude Code 在本地保存对话，所以当任务跨越多个工作时段时，你不需要重新解释上下文。运行 `claude --continue` 继续最近的会话，或 `claude --resume` 从列表中选择。给会话起描述性的名字如 `oauth-migration`，以便日后查找。详见[管理会话](/en/sessions)获取完整的恢复、分支和命名控制。

***

## 自动化与扩展

一旦你用一个 Claude 变得高效，就可以通过并行会话、非交互模式和扇出模式倍增产出。

到目前为止的所有内容假设一个人、一个 Claude 和一个对话。但 Claude Code 可以水平扩展。本节的技巧展示如何完成更多工作。

### 运行非交互模式

<Tip>
  在 CI、pre-commit 钩子或脚本中使用 `claude -p "prompt"`。添加 `--output-format stream-json` 获取流式 JSON 输出。
</Tip>

使用 `claude -p "your prompt"`，你可以在没有会话的情况下非交互地运行 Claude。[非交互模式](/en/headless)是你将 Claude 集成到 CI 管道、pre-commit 钩子或任何自动化工作流的方式。输出格式让你可以编程式解析结果：纯文本、JSON 或流式 JSON。

```bash theme={null}
# 一次性查询
claude -p "解释这个项目做什么"

# 脚本的结构化输出
claude -p "列出所有 API 端点" --output-format json

# 实时处理的流式输出
claude -p "分析这个日志文件" --output-format stream-json
```

### 运行多个 Claude 会话

<Tip>
  并行运行多个 Claude 会话以加速开发、运行隔离实验或启动复杂工作流。
</Tip>

选择适合你希望做多少协调的并行方式：

* [Worktrees](/en/worktrees)：在隔离的 git 检出中运行独立的 CLI 会话，使编辑不冲突
* [桌面应用](/en/desktop#work-in-parallel-with-sessions)：可视化地管理多个本地会话，每个在自己的 worktree 中
* [Web 版 Claude Code](/en/claude-code-on-the-web)：在 Anthropic 管理的云基础设施上于隔离 VM 中运行会话
* [Agent Teams](/en/agent-teams)：多会话的自动协调，具有共享任务、消息和团队负责人

除了并行化工作，多会话还支持以质量为中心的工作流。全新上下文改善代码审查，因为 Claude 不会偏向它刚写的代码。

例如，使用写作者/审查者模式：

| 会话 A（写作者）                                                        | 会话 B（审查者）                                                                                                                                                        |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `为我们的 API 端点实现一个速率限制器`                                    |                                                                                                                                                                         |
|                                                                         | `审查 @src/middleware/rateLimiter.ts 中的速率限制器实现。寻找边界情况、竞态条件以及与我们现有中间件模式的一致性。`                                                        |
| `这是审查反馈：[会话 B 输出]。解决这些问题。`                            |                                                                                                                                                                         |

你可以用测试做类似的事情：让一个 Claude 写测试，然后另一个写代码来通过它们。

### 跨文件扇出

<Tip>
  循环遍历任务，为每个调用 `claude -p`。使用 `--allowedTools` 为批量操作限定权限。
</Tip>

对于大规模迁移或分析，你可以将工作分配到多个并行的 Claude 调用：

<Steps>
  <Step title="生成任务列表">
    让 Claude 列出所有需要迁移的文件（例如，`列出所有 2,000 个需要迁移的 Python 文件`）
  </Step>

  <Step title="编写脚本循环遍历列表">
    ```bash theme={null}
    for file in $(cat files.txt); do
      claude -p "将 $file 从 React 迁移到 Vue。返回 OK 或 FAIL。" \
        --allowedTools "Edit,Bash(git commit *)"
    done
    ```
  </Step>

  <Step title="先在几个文件上测试，然后大规模运行">
    根据前 2-3 个文件出现的问题优化你的提示，然后在完整集合上运行。`--allowedTools` 标志限制 Claude 能做什么，这在无人值守运行时很重要。
  </Step>
</Steps>

你也可以将 Claude 集成到现有的数据/处理管道中：

```bash theme={null}
claude -p "<你的提示>" --output-format json | your_command
```

开发时使用 `--verbose` 调试，生产中关闭它。

### 用自动模式自主运行

对于有后台安全检查的不间断执行，使用[自动模式](/en/permission-modes#eliminate-prompts-with-auto-mode)。分类器模型在命令运行前审查它们，阻断范围升级、未知基础设施和恶意内容驱动的操作，同时让常规工作无需提示即可进行。

```bash theme={null}
claude --permission-mode auto -p "修复所有 lint 错误"
```

对于使用 `-p` 标志的非交互运行，自动模式在分类器反复阻断操作时会中止，因为没有用户可以回退。参阅[自动模式何时回退](/en/permission-modes#when-auto-mode-falls-back)了解阈值。

***

## 避免常见失败模式

这些是常见错误。及早识别能节省时间：

* **大杂烩会话。** 你从一个任务开始，然后问 Claude 不相关的事，再回到第一个任务。上下文充满了不相关信息。
  > **修复**：在不相关任务之间 `/clear`。
* **反复纠正。** Claude 做错了什么，你纠正它，还是错的，你又纠正。上下文被失败方案污染。
  > **修复**：两次失败纠正后，`/clear` 并写一个融入所学的更好的初始提示。
* **过度指定的 CLAUDE.md。** 如果你的 CLAUDE.md 太长，Claude 会忽略其中一半，因为重要规则在噪音中丢失了。
  > **修复**：无情修剪。如果 Claude 没有这条指令也能正确做某事，删除它或转换为 hook。
* **信任-验证断层。** Claude 产出了一个看起来合理但不处理边界情况的实现。
  > **修复**：始终提供验证（测试、脚本、截图）。如果你不能验证它，就不要发布它。
* **无限探索。** 你让 Claude "调查"某事而不设定范围。Claude 读取数百个文件，填满上下文。
  > **修复**：窄化调查范围或使用子代理，让探索不消耗你的主上下文。

***

## 发展你的直觉

本指南中的模式并非一成不变。它们是在一般情况下效果很好的起点，但可能并非对每种情况都是最优的。

有时你 *应该* 让上下文积累，因为你深入一个复杂问题且历史有价值。有时你应该跳过规划让 Claude 自己摸索，因为任务是探索性的。有时模糊提示恰好在你想看 Claude 如何理解问题后再加以约束时是正确的。

注意什么有效。当 Claude 产出优秀结果时，留意你做了什么：提示结构、你提供的上下文、你使用的模式。当 Claude 挣扎时，问为什么。是上下文太嘈杂？提示太模糊？任务太大无法一次完成？

随着时间推移，你会发展出任何指南都无法捕捉的直觉。你会知道何时该具体、何时该开放，何时该规划、何时该探索，何时该清空上下文、何时该让它积累。

## 相关资源

* [Claude Code 的工作原理](/en/how-claude-code-works)：代理式循环、工具和上下文管理
* [扩展 Claude Code](/en/features-overview)：skills、hooks、MCP、子代理和插件
* [常见工作流](/en/common-workflows)：调试、测试、PR 等的分步配方
* [CLAUDE.md](/en/memory)：存储项目约定和持久上下文
