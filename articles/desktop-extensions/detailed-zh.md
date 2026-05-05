# Desktop Extensions：一键安装 MCP 服务器 — 详细摘要

## MCP 安装难题

本地 MCP 服务器为 Claude Desktop 解锁了强大能力——与本地应用交互、访问私有数据、集成开发工具，同时数据保留在用户本机。然而现有安装流程存在五大障碍：

1. **需要开发者工具**：用户必须安装 Node.js、Python 等运行时
2. **手动配置**：每个服务器都需编辑 JSON 配置文件
3. **依赖管理**：需自行解决包冲突和版本不匹配
4. **无发现机制**：寻找有用的 MCP 服务器只能在 GitHub 上搜索
5. **更新复杂**：保持服务器最新需要手动重新安装

这些摩擦使 MCP 服务器对非技术用户几乎不可用。

## Desktop Extensions 介绍

Desktop Extensions（`.mcpb` 文件）将整个 MCP 服务器及其所有依赖打包为一个可安装包。安装流程从"安装运行时 → npm install → 编辑配置 → 重启 → 祈祷成功"简化为三步：下载 `.mcpb` 文件 → 双击打开 → 点击安装。无需终端、无需配置文件、无依赖冲突。

> 注：2025年9月更新，文件扩展名从 `.dxt` 改为 `.mcpb`（MCP Bundle），旧 `.dxt` 文件仍可使用。

## 架构概览

Desktop Extension 本质是 ZIP 压缩包，包含：

- `manifest.json`：扩展元数据和配置（唯一必需文件）
- `server/`：MCP 服务器实现
- `dependencies/`：所有依赖包（如 `node_modules/` 或 Python `lib/`）
- `icon.png`：可选扩展图标

Claude Desktop 承担三大职责：内置 Node.js 运行时消除外部依赖；扩展自动更新；敏感配置（如 API 密钥）存储于操作系统密钥链。

### Manifest 核心字段

manifest 定义了基本信息（name、version、description、author）、服务器配置（type、entry_point、mcp_config 中的 command/args/env）、用户配置声明以及动态值模板。

**模板变量**是关键机制：`${__dirname}` 替换为扩展解压目录路径，`${user_config.key}` 替换为用户提供的配置值，`${HOME}`/`${TEMP}` 替换为系统环境变量。

### 用户配置示例

当开发者在 manifest 的 `user_config` 中声明需要 `api_key`（标记 `sensitive: true`、`required: true`），Claude 在用户填写前不会启用该扩展，会自动将值存入 OS 密钥链，并在启动服务器时透明替换 `${user_config.api_key}`。支持的配置类型包括 string、directory、number 等，directory 类型支持 `multiple: true` 允许多个目录。

## 构建首个扩展

四步流程：

1. **创建 manifest**：`npx @anthropic-ai/mcpb init`（交互式工具，加 `--yes` 可快速生成最小 manifest）
2. **声明用户配置**：在 manifest 中添加 `user_config` 字段，Claude Desktop 会自动生成配置 UI、验证输入、安全存储、传递到服务器
3. **打包**：`npx @anthropic-ai/mcpb pack`（验证 manifest 并生成 `.mcpb` 压缩包）
4. **本地测试**：将 `.mcpb` 文件拖入 Claude Desktop 设置窗口，查看扩展信息、权限要求和安装按钮

## 高级特性

**跨平台支持**：在 `mcp_config` 的 `platforms` 字段中为 win32/darwin 等分别定义 command 和 env。

**功能声明**：`tools` 和 `prompts` 数组让用户在安装前了解扩展能力，如 `{"name": "read_file", "description": "Read contents of a file"}`。

## 扩展目录

Claude Desktop 内置了经策划的扩展目录，用户可浏览、搜索、一键安装，无需在 GitHub 上查找和审查代码。开发者提交扩展需遵循指南、跨平台测试、通过审核。

## 开放生态

Anthropic 开源了 MCPB 完整规范、打包验证工具、参考实现代码和 TypeScript 类型/Schema。目标是实现"打包一次，随处运行"——MCP 服务器开发者只需打包一次，任何支持 MCPB 的应用都能使用；应用开发者可直接复用现有实现。规范当前版本为 0.1，欢迎社区共同演进。

## 安全与企业考量

**用户侧**：敏感数据存于 OS 密钥链、自动更新、可审计已安装扩展。

**企业侧**：支持 Windows Group Policy 和 macOS MDM、预装已审批扩展、黑名单特定扩展或发布者、禁用扩展目录、部署私有扩展目录。

## 使用 Claude Code 构建扩展

Anthropic 内部发现 Claude 非常擅长构建扩展。推荐做法是在 prompt 中说明意图后，附加指引让 Claude 阅读规范、创建正确结构、遵循最佳实践（stdio 传输、工具 Schema 验证、JSON 响应、本地运行优化、日志调试）、考虑测试验证。

## 结论

Desktop Extensions 代表了用户与本地 AI 工具交互方式的根本性转变。Anthropic 内部已用此技术封装 PyBoy 模拟器扩展，让 Claude 直接操控 GameBoy——类似"Claude 玩宝可梦"实验。将模型能力连接到用户本机工具、数据和应用的机会不可限量，而一键安装让这种创造力能触达百万用户。
