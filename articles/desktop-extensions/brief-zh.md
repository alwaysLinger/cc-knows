# Desktop Extensions：一键安装 MCP 服务器

Anthropic 推出了 Desktop Extensions（桌面扩展），将 MCP（Model Context Protocol）服务器的安装从复杂的手动流程简化为一键操作。

## 核心问题

MCP 服务器功能强大，能让 Claude 访问本地文件系统、数据库和开发工具，但安装门槛极高：用户需要安装 Node.js/Python 运行时、手动编辑 JSON 配置文件、解决依赖冲突，且缺乏发现和更新机制。这导致非技术用户几乎无法使用。

## 解决方案

Desktop Extensions 以 `.mcpb` 文件格式打包整个 MCP 服务器（含所有依赖），用户只需下载、双击、点击"安装"即可完成。核心技术要点：

- **打包格式**：ZIP 压缩包内含 `manifest.json`（元数据和配置）、`server/`（服务器实现）、`dependencies/`（依赖包）和可选图标
- **内置运行时**：Claude Desktop 自带 Node.js，消除外部依赖
- **安全配置**：API 密钥等敏感信息存储在操作系统密钥链（Keychain）中，通过模板变量（如 `${user_config.api_key}`）动态注入
- **跨平台支持**：可在 manifest 中为不同操作系统定义差异化配置

## 构建流程

开发者通过 `npx @anthropic-ai/mcpb init` 初始化、在 manifest 中声明用户配置项、`npx @anthropic-ai/mcpb pack` 打包，即可生成 `.mcpb` 文件。

## 生态与安全

Anthropic 开源了完整的规范、工具链和参考实现，希望 MCPB 格式能被其他 AI 桌面应用采用。企业侧支持 MDM/Group Policy 部署、扩展预装和黑名单管理。同时推出内置扩展目录，用户可一键浏览和安装经审核的扩展。

## 结论

Desktop Extensions 将 MCP 服务器的可用性从开发者群体扩展到所有用户。Anthropic 内部已用此技术将 PyBoy 模拟器打包为扩展，让 Claude 直接操控 GameBoy，展现了本地 AI 工具集成的广阔可能。
