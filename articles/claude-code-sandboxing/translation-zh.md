# 超越权限提示：让 Claude Code 更安全、更自主

发布于 2025 年 10 月 20 日

Claude Code 的新沙箱（Sandboxing）功能——沙箱化 bash 工具和 Web 版 Claude Code——通过实现文件系统隔离和网络隔离两大边界，减少了权限提示并提升了用户安全性。

在 [Claude Code](https://www.claude.com/product/claude-code) 中，Claude 与你并肩编写、测试和调试代码，浏览你的代码库、编辑多个文件并运行命令来验证其工作。赋予 Claude 对代码库和文件的如此大访问权限可能带来风险，尤其是在提示注入（prompt injection）的情况下。

为了帮助解决这个问题，我们在 Claude Code 中引入了两个基于沙箱的新功能，两者都旨在为开发者提供一个更安全的工作环境，同时让 Claude 能够更自主地运行，减少权限提示。在我们的内部使用中，我们发现沙箱可以安全地减少 84% 的权限提示。通过定义 Claude 可以在其中自由工作的边界集合，它们提高了安全性和自主性。

## 在 Claude Code 上保障用户安全

Claude Code 运行在基于权限的模型上：默认情况下，它是只读的，这意味着它在进行修改或运行任何命令之前会请求许可。有一些例外：我们自动放行安全命令，如 echo 或 cat，但大多数操作仍然需要显式批准。

不断点击"批准"会拖慢开发周期，并可能导致"审批疲劳"（approval fatigue），即用户可能不会仔细关注他们批准的内容，从而使开发变得不那么安全。

为了解决这个问题，我们为 Claude Code 推出了沙箱机制。

### 沙箱：一种更安全、更自主的方法

沙箱创建预定义的边界，让 Claude 可以在其中更自由地工作，而不是为每个操作请求许可。启用沙箱后，你会获得大幅减少的权限提示和提升的安全性。

我们的沙箱方法建立在操作系统级功能之上，以实现两个边界：

1. **文件系统隔离**（Filesystem isolation），确保 Claude 只能访问或修改特定目录。这对于防止被提示注入的 Claude 修改敏感系统文件尤为重要。
2. **网络隔离**（Network isolation），确保 Claude 只能连接到已批准的服务器。这防止了被提示注入的 Claude 泄露敏感信息或下载恶意软件。

值得注意的是，有效的沙箱需要**同时具备**文件系统隔离和网络隔离。没有网络隔离，被入侵的 Agent 可以外泄 SSH 密钥等敏感文件；没有文件系统隔离，被入侵的 Agent 可以轻易逃逸沙箱并获得网络访问权限。正是通过同时使用这两种技术，我们才能为 Claude Code 用户提供更安全、更快的 Agent 体验。

---

## Claude Code 中的两个新沙箱功能

### 沙箱化 Bash 工具：无需权限提示的安全 bash 执行

我们正在推出[一个新的沙箱运行时](https://docs.claude.com/en/docs/claude-code/sandboxing)，作为 beta 研究预览版可用，让你可以精确定义 Agent 可以访问哪些目录和网络主机，而无需启动和管理容器的开销。这可用于对任意进程、Agent 和 MCP 服务器进行沙箱化。它也可作为[开源研究预览](https://github.com/anthropic-experimental/sandbox-runtime)获取。

在 Claude Code 中，我们使用此运行时来沙箱化 bash 工具，这允许 Claude 在你设定的定义限制内运行命令。在安全的沙箱内，Claude 可以更自主地运行，安全地执行命令而无需权限提示。如果 Claude 尝试访问沙箱_之外_的内容，你会立即收到通知，并可以选择是否允许。

我们将其构建在操作系统级原语之上，如 [Linux bubblewrap](https://github.com/containers/bubblewrap) 和 macOS seatbelt，以在操作系统级别执行这些限制。它们不仅覆盖 Claude Code 的直接交互，还覆盖由命令衍生的任何脚本、程序或子进程。如上所述，此沙箱同时执行：

1. **文件系统隔离**，允许对当前工作目录进行读写访问，但阻止修改其外的任何文件。
2. **网络隔离**，仅允许通过连接到沙箱外运行的代理服务器的 Unix 域套接字进行互联网访问。此代理服务器对进程可以连接的域名实施限制，并处理新请求域名的用户确认。如果你希望进一步提高安全性，我们还支持自定义此代理以对出站流量执行任意规则。

两个组件都是可配置的：你可以轻松选择允许或禁止特定的文件路径或域名。

![此图展示了 Claude Code 中沙箱的工作原理。](/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2F0d1c612947c798aef48e6ab4beb7e8544da9d41a-4096x2305.png&w=3840&q=75)

Claude Code 的沙箱架构通过文件系统和网络控制隔离代码执行，自动允许安全操作，阻止恶意操作，仅在需要时请求许可。

沙箱确保即使成功的提示注入也被完全隔离，不会影响整体用户安全。这样，被入侵的 Claude Code 无法窃取你的 SSH 密钥，也无法连接到攻击者的服务器。

要开始使用此功能，在 Claude Code 中运行 `/sandbox` 并查看关于我们安全模型的[更多技术细节](https://docs.claude.com/en/docs/claude-code/sandboxing)。

为了让其他团队更容易构建更安全的 Agent，我们已经[开源](https://github.com/anthropic-experimental/sandbox-runtime)了此功能。我们相信其他人应该考虑为自己的 Agent 采用这项技术，以增强其 Agent 的安全态势。

---

### Web 版 Claude Code：在云端安全运行 Claude Code

今天，我们还发布了 [Web 版 Claude Code](https://docs.claude.com/en/docs/claude-code/claude-code-on-the-web)，使用户能够在云端的隔离沙箱中运行 Claude Code。Web 版 Claude Code 在隔离沙箱中执行每个 Claude Code 会话，在其中它可以以安全的方式完全访问其服务器。我们设计此沙箱以确保敏感凭证（如 git 凭证或签名密钥）始终不在与 Claude Code 相同的沙箱内。这样，即使沙箱中运行的代码被入侵，用户也不会受到进一步危害。

Web 版 Claude Code 使用自定义代理服务，透明地处理所有 git 交互。在沙箱内，git 客户端使用自定义构建的范围限定凭证（scoped credential）向此服务认证。代理验证此凭证和 git 交互的内容（例如，确保只推送到配置的分支），然后在向 GitHub 发送请求之前附加正确的认证令牌。

![此图展示了 Web 版 Claude Code 如何使用自定义代理处理所有 git 交互。](/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2Fe8f66bcf73d9d23cae67e67776b2d31373c13050-4096x2305.png&w=3840&q=75)

Claude Code 的 Git 集成通过安全代理路由命令，该代理验证认证令牌、分支名称和仓库目标——允许安全的版本控制工作流，同时防止未经授权的推送。

---

## 快速开始

我们新的沙箱化 bash 工具和 Web 版 Claude Code 为使用 Claude 进行工程工作的开发者提供了安全性和生产力方面的显著提升。

要开始使用这些工具：

1. 在 Claude 中运行 `/sandbox`，并查看关于如何配置此沙箱的[我们的文档](https://docs.claude.com/en/docs/claude-code/sandboxing)。
2. 前往 [claude.com/code](http://claude.ai/redirect/website.v1.44bfff23-69bc-4e13-aac4-02b70da05265/code) 体验 Web 版 Claude Code。

或者，如果你正在构建自己的 Agent，请查看我们[开源的沙箱代码](https://github.com/anthropic-experimental/sandbox-runtime)，并考虑将其集成到你的工作中。我们期待看到你构建的内容。

要了解更多关于 Web 版 Claude Code 的信息，请查看我们的[发布博客文章](https://www.anthropic.com/news/claude-code-on-the-web)。

---

## 致谢

文章由 David Dworken 和 Oliver Weller-Davies 撰写，Meaghan Choi、Catherine Wu、Molly Vorwerck、Alex Isken、Kier Bradwell 和 Kevin Garcia 贡献。
