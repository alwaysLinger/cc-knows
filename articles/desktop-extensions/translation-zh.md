# Desktop Extensions：Claude Desktop 的一键 MCP 服务器安装

发布于 2025 年 6 月 26 日

Desktop Extensions 让安装 MCP 服务器变得像点击按钮一样简单。我们分享了技术架构和创建优秀扩展的技巧。

* 文件扩展名更新：2025 年 9 月 11 日。Claude Desktop Extensions 现在使用 .mcpb（MCP Bundle）文件扩展名，而非 .dxt。现有的 .dxt 扩展将继续工作，但我们建议开发者在新的扩展中使用 .mcpb。所有功能保持不变——这纯粹是命名约定的更新。

---

当我们去年发布 Model Context Protocol（MCP）时，我们看到开发者构建了令人惊叹的本地服务器，让 Claude 可以访问从文件系统到数据库的各种资源。但我们不断听到同样的反馈：安装太复杂了。用户需要开发者工具，必须手动编辑配置文件，还经常卡在依赖问题上。

今天，我们推出 Desktop Extensions——一种新的打包格式，让安装 MCP 服务器变得像点击按钮一样简单。

### 解决 MCP 安装问题

本地 MCP 服务器为 Claude Desktop 用户解锁了强大的能力。它们可以与本地应用交互、访问私有数据、集成开发工具——同时将数据保留在用户本机。然而，当前的安装流程造成了重大障碍：

* **需要开发者工具**：用户需要安装 Node.js、Python 或其他运行时
* **手动配置**：每个服务器都需要编辑 JSON 配置文件
* **依赖管理**：用户必须解决包冲突和版本不匹配
* **无发现机制**：找到有用的 MCP 服务器需要在 GitHub 上搜索
* **更新复杂性**：保持服务器最新意味着手动重新安装

这些摩擦点意味着，尽管 MCP 服务器功能强大，但对非技术用户来说仍然很大程度上无法使用。

### 介绍 Desktop Extensions

Desktop Extensions（`.mcpb` 文件）通过将整个 MCP 服务器——包括所有依赖——打包成一个可安装的包来解决这些问题。以下是用户侧的变化：

**之前：**

```
# 先安装 Node.js
npm install -g @example/mcp-server
# 手动编辑 ~/.claude/claude_desktop_config.json
# 重启 Claude Desktop
# 祈祷它能工作
```

**之后：**

1. 下载一个 `.mcpb` 文件
2. 双击以在 Claude Desktop 中打开
3. 点击"安装"

就是这样。不需要终端，不需要配置文件，没有依赖冲突。

## 架构概览

Desktop Extension 是一个 ZIP 压缩包，包含本地 MCP 服务器以及一个 `manifest.json`，后者描述了 Claude Desktop 和其他支持桌面扩展的应用所需了解的一切。

```
extension.mcpb (ZIP 压缩包)
├── manifest.json         # 扩展元数据和配置
├── server/               # MCP 服务器实现
│   └── [服务器文件]
├── dependencies/         # 所有需要的包/库
└── icon.png             # 可选：扩展图标

# 示例：Node.js 扩展
extension.mcpb
├── manifest.json         # 必需：扩展元数据和配置
├── server/               # 服务器文件
│   └── index.js          # 主入口点
├── node_modules/         # 打包的依赖
├── package.json          # 可选：NPM 包定义
└── icon.png              # 可选：扩展图标

# 示例：Python 扩展
extension.mcpb (ZIP 文件)
├── manifest.json         # 必需：扩展元数据和配置
├── server/               # 服务器文件
│   ├── main.py           # 主入口点
│   └── utils.py          # 附加模块
├── lib/                  # 打包的 Python 包
├── requirements.txt      # 可选：Python 依赖列表
└── icon.png              # 可选：扩展图标
```

Desktop Extension 中唯一必需的文件是 manifest.json。Claude Desktop 处理所有复杂性：

* **内置运行时**：我们在 Claude Desktop 中内置了 Node.js，消除了外部依赖
* **自动更新**：当新版本可用时，扩展会自动更新
* **安全密钥**：API 密钥等敏感配置存储在操作系统密钥链（OS keychain）中

manifest 包含人类可读的信息（如名称、描述或作者）、功能声明（tools、prompts）、用户配置和运行时要求。大多数字段是可选的，因此最简版本非常短，尽管在实践中，我们期望所有三种支持的扩展类型（Node.js、Python 和传统二进制/可执行文件）都包含文件：

```json
{
  "mcpb_version": "0.1",                    // 此 manifest 遵循的 MCPB 规范版本
  "name": "my-extension",                   // 机器可读名称（用于 CLI、API）
  "version": "1.0.0",                       // 扩展的语义版本
  "description": "A simple MCP extension",  // 扩展功能的简要描述
  "author": {                               // 作者信息（必需）
    "name": "Extension Author"              // 作者名称（必需字段）
  },
  "server": {                               // 服务器配置（必需）
    "type": "node",                         // 服务器类型："node"、"python" 或 "binary"
    "entry_point": "server/index.js",       // 主服务器文件路径
    "mcp_config": {                         // MCP 服务器配置
      "command": "node",                    // 运行服务器的命令
      "args": [                             // 传递给命令的参数
        "${__dirname}/server/index.js"      // ${__dirname} 将被替换为扩展的目录
      ]
    }
  }
}
```

manifest 规范中有许多[便捷选项](https://github.com/anthropics/dxt/blob/main/MANIFEST.md)，旨在使本地 MCP 服务器的安装和配置更加容易。服务器配置对象可以以兼顾用户定义的模板字面量（template literals）配置和平台特定覆盖的方式定义。扩展开发者可以详细声明他们希望从用户那里收集什么样的配置。

让我们看一个具体示例，了解 manifest 如何辅助配置。在下面的 manifest 中，开发者声明用户需要提供 `api_key`。Claude 在用户提供该值之前不会启用扩展，会自动将其保存在操作系统的密钥库中，并在启动服务器时透明地将 `${user_config.api_key}` 替换为用户提供的值。同样，`${__dirname}` 将被替换为扩展解压目录的完整路径。

```json
{
  "mcpb_version": "0.1",
  "name": "my-extension",
  "version": "1.0.0",
  "description": "A simple MCP extension",
  "author": {
    "name": "Extension Author"
  },
  "server": {
    "type": "node",
    "entry_point": "server/index.js",
    "mcp_config": {
      "command": "node",
      "args": ["${__dirname}/server/index.js"],
      "env": {
        "API_KEY": "${user_config.api_key}"
      }
    }
  },
  "user_config": {
    "api_key": {
      "type": "string",
      "title": "API Key",
      "description": "Your API key for authentication",
      "sensitive": true,
      "required": true
    }
  }
}
```

一个包含大多数可选字段的完整 `manifest.json` 可能如下所示：

```json
{
  "mcpb_version": "0.1",
  "name": "My MCP Extension",
  "display_name": "My Awesome MCP Extension",
  "version": "1.0.0",
  "description": "A brief description of what this extension does",
  "long_description": "A detailed description that can include multiple paragraphs explaining the extension's functionality, use cases, and features. It supports basic markdown.",
  "author": {
    "name": "Your Name",
    "email": "yourname@example.com",
    "url": "https://your-website.com"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/your-username/my-mcp-extension"
  },
  "homepage": "https://example.com/my-extension",
  "documentation": "https://docs.example.com/my-extension",
  "support": "https://github.com/your-username/my-mcp-extension/issues",
  "icon": "icon.png",
  "screenshots": [
    "assets/screenshots/screenshot1.png",
    "assets/screenshots/screenshot2.png"
  ],
  "server": {
    "type": "node",
    "entry_point": "server/index.js",
    "mcp_config": {
      "command": "node",
      "args": ["${__dirname}/server/index.js"],
      "env": {
        "ALLOWED_DIRECTORIES": "${user_config.allowed_directories}"
      }
    }
  },
  "tools": [
    {
      "name": "search_files",
      "description": "Search for files in a directory"
    }
  ],
  "prompts": [
    {
      "name": "poetry",
      "description": "Have the LLM write poetry",
      "arguments": ["topic"],
      "text": "Write a creative poem about the following topic: ${arguments.topic}"
    }
  ],
  "tools_generated": true,
  "keywords": ["api", "automation", "productivity"],
  "license": "MIT",
  "compatibility": {
    "claude_desktop": ">=1.0.0",
    "platforms": ["darwin", "win32", "linux"],
    "runtimes": {
      "node": ">=16.0.0"
    }
  },
  "user_config": {
    "allowed_directories": {
      "type": "directory",
      "title": "Allowed Directories",
      "description": "Directories the server can access",
      "multiple": true,
      "required": true,
      "default": ["${HOME}/Desktop"]
    },
    "api_key": {
      "type": "string",
      "title": "API Key",
      "description": "Your API key for authentication",
      "sensitive": true,
      "required": false
    },
    "max_file_size": {
      "type": "number",
      "title": "Maximum File Size (MB)",
      "description": "Maximum file size to process",
      "default": 10,
      "min": 1,
      "max": 100
    }
  }
}
```

要查看扩展和 manifest 示例，请参考 [MCPB 仓库中的示例](https://github.com/anthropics/dxt/tree/main/examples)。

`manifest.json` 中所有必需和可选字段的完整规范可以在我们的[开源工具链](https://github.com/anthropics/dxt/blob/main/MANIFEST.md)中找到。

### 构建你的第一个扩展

让我们演练将现有的 MCP 服务器打包为 Desktop Extension。我们将使用一个简单的文件系统服务器作为示例。

#### 步骤 1：创建 manifest

首先，为你的服务器初始化一个 manifest：

```
npx @anthropic-ai/mcpb init
```

这个交互式工具会询问你的服务器信息并生成完整的 manifest.json。如果你想快速生成最基本的 manifest.json，可以带 `--yes` 参数运行该命令。

#### 步骤 2：处理用户配置

如果你的服务器需要用户输入（如 API 密钥或允许的目录），在 manifest 中声明：

```json
"user_config": {
  "allowed_directories": {
    "type": "directory",
    "title": "Allowed Directories",
    "description": "Directories the server can access",
    "multiple": true,
    "required": true,
    "default": ["${HOME}/Documents"]
  }
}
```

Claude Desktop 会：

* 显示用户友好的配置界面
* 在启用扩展之前验证输入
* 安全地存储敏感值
* 根据开发者的配置，将配置作为参数或环境变量传递给服务器

在下面的示例中，我们将用户配置作为环境变量传递，但也可以作为参数传递。

```json
"server": {
   "type": "node",
   "entry_point": "server/index.js",
   "mcp_config": {
   "command": "node",
   "args": ["${__dirname}/server/index.js"],
   "env": {
      "ALLOWED_DIRECTORIES": "${user_config.allowed_directories}"
   }
   }
}
```

#### 步骤 3：打包扩展

将所有内容打包成 `.mcpb` 文件：

```
npx @anthropic-ai/mcpb pack
```

此命令会：

1. 验证你的 manifest
2. 生成 `.mcpb` 压缩包

#### 步骤 4：本地测试

将你的 `.mcpb` 文件拖入 Claude Desktop 的设置窗口。你会看到：

* 关于你的扩展的人类可读信息
* 所需的权限和配置
* 一个简单的"安装"按钮

### 高级特性

#### 跨平台支持

扩展可以适配不同的操作系统：

```json
"server": {
  "type": "node",
  "entry_point": "server/index.js",
  "mcp_config": {
    "command": "node",
    "args": ["${__dirname}/server/index.js"],
    "platforms": {
      "win32": {
        "command": "node.exe",
        "env": {
          "TEMP_DIR": "${TEMP}"
        }
      },
      "darwin": {
        "env": {
          "TEMP_DIR": "${TMPDIR}"
        }
      }
    }
  }
}
```

#### 动态配置

使用模板字面量（template literals）来表示运行时值：

* `${__dirname}`：扩展的安装目录
* `${user_config.key}`：用户提供的配置
* `${HOME}, ${TEMP}`：系统环境变量

#### 功能声明

帮助用户预先了解扩展能力：

```json
"tools": [
  {
    "name": "read_file",
    "description": "Read contents of a file"
  }
],
"prompts": [
  {
    "name": "code_review",
    "description": "Review code for best practices",
    "arguments": ["file_path"]
  }
]
```

### 扩展目录

我们推出时内置了一个经过策划的扩展目录，集成在 Claude Desktop 中。用户可以浏览、搜索、一键安装——无需在 GitHub 上搜索或审查代码。

虽然我们期望 Desktop Extension 规范以及 macOS 和 Windows 版 Claude 中的实现会随时间演进，但我们期待看到扩展以创造性的方式扩展 Claude 能力的各种可能性。

提交你的扩展：

1. 确保它遵循提交表单中的指南
2. 在 Windows 和 macOS 上进行测试
3. [提交你的扩展](https://docs.google.com/forms/d/14_Dmcig4z8NeRMB_e7TOyrKzuZ88-BLYdLvS6LPhiZU/edit)
4. 我们的团队会审核质量和安全性

### 构建开放生态

我们致力于 MCP 服务器周围的开放生态，并相信其被多个应用和服务普遍采用的能力已使社区受益。秉承这一承诺，我们将 Desktop Extension 规范、工具链以及 macOS 和 Windows 版 Claude 用于实现 Desktop Extension 支持的 Schema 和关键函数全部开源。我们希望 MCPB 格式不仅让本地 MCP 服务器对 Claude 更具可移植性，对其他 AI 桌面应用也是如此。

我们开源的内容：

* 完整的 MCPB 规范
* 打包和验证工具
* 参考实现代码
* TypeScript 类型和 Schema

这意味着：

* **对于 MCP 服务器开发者**：打包一次，在支持 MCPB 的任何地方运行
* **对于应用开发者**：无需从零开始构建即可添加扩展支持
* **对于用户**：在所有支持 MCP 的应用中获得一致的体验

规范和工具链有意使用 0.1 版本号，因为我们期待与更大的社区合作演进和改进该格式。期待你的反馈。

### 安全与企业考量

我们理解扩展引入了新的安全考量，特别是对企业而言。我们在 Desktop Extensions 的预览版中内置了多项安全措施：

#### 对于用户

* 敏感数据保存在操作系统密钥链中
* 自动更新
* 能够审计已安装的扩展

#### 对于企业

* Windows Group Policy 和 macOS MDM 支持
* 能够预装已审批的扩展
* 将特定扩展或发布者加入黑名单
* 完全禁用扩展目录
* 部署私有扩展目录

有关如何在组织内管理扩展的更多信息，请参阅我们的[文档](https://support.anthropic.com/en/articles/10949351-getting-started-with-model-context-protocol-mcp-on-claude-for-desktop)。

### 开始使用

准备好构建你自己的扩展了吗？以下是如何开始：

**对于 MCP 服务器开发者**：查看我们的[开发者文档](https://github.com/anthropics/dxt)——或者直接在你的本地 MCP 服务器目录中运行以下命令：

```
npm install -g @anthropic-ai/mcpb
mcpb init
mcpb pack
```

**对于 Claude Desktop 用户**：更新到最新版本，在设置中找到扩展部分

**对于企业**：查看我们的企业文档了解部署选项

### 使用 Claude Code 构建

在 Anthropic 内部，我们发现 Claude 非常擅长以最少的干预构建扩展。如果你也想使用 Claude Code，我们建议你在 prompt 中简要说明你希望扩展做什么，然后添加以下上下文：

```
I want to build this as a Desktop Extension, abbreviated as "MCPB". Please follow these steps:

1. **Read the specifications thoroughly:**
   - https://github.com/anthropics/mcpb/blob/main/README.md - MCPB architecture overview, capabilities, and integration patterns
   - https://github.com/anthropics/mcpb/blob/main/MANIFEST.md - Complete extension manifest structure and field definitions
   - https://github.com/anthropics/mcpb/tree/main/examples - Reference implementations including a "Hello World" example

2. **Create a proper extension structure:**
   - Generate a valid manifest.json following the MANIFEST.md spec
   - Implement an MCP server using @modelcontextprotocol/sdk with proper tool definitions
   - Include proper error handling and timeout management

3. **Follow best development practices:**
   - Implement proper MCP protocol communication via stdio transport
   - Structure tools with clear schemas, validation, and consistent JSON responses
   - Make use of the fact that this extension will be running locally
   - Add appropriate logging and debugging capabilities
   - Include proper documentation and setup instructions

4. **Test considerations:**
   - Validate that all tool calls return properly structured responses
   - Verify manifest loads correctly and host integration works

Generate complete, production-ready code that can be immediately tested. Focus on defensive programming, clear error messages, and following the exact
MCPB specifications to ensure compatibility with the ecosystem.
```

### 结论

Desktop Extensions 代表了用户与本地 AI 工具交互方式的根本性转变。通过消除安装摩擦，我们正在让强大的 MCP 服务器对所有人开放——而不仅仅是开发者。

在内部，我们正在使用桌面扩展来分享高度实验性的 MCP 服务器——有些有趣，有些实用。一个团队做了实验，看看当直接连接到 GameBoy 时我们的模型能走多远，类似于我们的["Claude 玩宝可梦"研究](https://www.anthropic.com/news/visible-extended-thinking)。我们使用 Desktop Extensions 打包了一个单一扩展，打开了流行的 [PyBoy](https://github.com/Baekalfen/PyBoy) GameBoy 模拟器并让 Claude 取得控制权。我们相信，将模型的能力连接到用户本机已有的工具、数据和应用的机会是不可限量的。

![桌面显示 PyBoy MCP 与超级马里奥大陆启动画面](/_next/image?url=https%3A%2F%2Fwww-cdn.anthropic.com%2Fimages%2F4zrzovbb%2Fwebsite%2Fd48f3ea1218a4b90450b9ab8134fa0e24db5a167-720x542.png&w=1920&q=75)

我们迫不及待想看到你的创作。催生了数千个 MCP 服务器的同一种创造力，现在只需一次点击就能触达数百万用户。准备好分享你的 MCP 服务器了吗？[提交你的扩展进行审核](https://forms.gle/tyiAZvch1kDADKoP9)。
