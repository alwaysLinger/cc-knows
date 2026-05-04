# cc-knows

定时抓取 [Anthropic Engineering Blog](https://www.anthropic.com/engineering) 的文章，通过 Claude Code headless 模式自动生成中文摘要和全文翻译。

## 产出

每篇文章一个独立目录，包含三个 markdown 文件：

```
articles/<slug>/
├── brief-zh.md        # 简要提炼 (300-500 字)
├── detailed-zh.md     # 详细摘要 (800-1000 字)
└── translation-zh.md  # 中文全文翻译
```

## 工作流程

GitHub Action 手动触发，串行处理每篇新文章：

1. 抓取 engineering 页面获取文章列表
2. 对比 `processed.json` 找出未处理的新文章
3. 逐篇调用 Claude Code headless 抓取全文并生成三个中文文档
4. 每篇文章处理完立即 commit，最后统一 push

## 配置

在 GitHub 仓库设置以下 Secrets：

| Secret | 说明 |
|--------|------|
| `ANTHROPIC_API_KEY` | Claude API 密钥 |
| `ANTHROPIC_BASE_URL` | API 端点地址 |

可选环境变量（在 workflow 中设置）：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `CLAUDE_MODEL` | `glm-5.1` | 使用的模型 |

## 手动运行

1. 进入 GitHub 仓库的 **Actions** 页签
2. 选择 **Collect Anthropic Engineering Articles**
3. 点击 **Run workflow**

启用定时执行：取消 `.github/workflows/collect-articles.yml` 中 `schedule` 的注释。
