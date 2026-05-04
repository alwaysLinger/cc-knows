#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ARTICLES_DIR="$PROJECT_DIR/articles"
PROCESSED_FILE="$PROJECT_DIR/processed.json"
ARTICLE_LIST_FILE="$PROJECT_DIR/.article-list.json"
MODEL="${CLAUDE_MODEL:-glm-5.1}"

mkdir -p "$ARTICLES_DIR"

# Ensure processed.json exists
if [ ! -f "$PROCESSED_FILE" ]; then
  echo '{}' > "$PROCESSED_FILE"
fi

# ─── Step 1: Get article list from engineering page ──────────────────────────

echo "=== Fetching article list ==="

# Have Claude write the article list directly to a file (avoids stdout parsing issues)
claude -p --print --no-session-persistence \
  --model "$MODEL" \
  --allowedTools "WebFetch,Write" \
  --max-budget-usd 1 \
  "访问 https://www.anthropic.com/engineering 页面，提取所有文章链接。
   将结果以 JSON 数组写入文件 .article-list.json，格式：
   [{\"url\": \"https://www.anthropic.com/engineering/...\", \"title\": \"文章标题\"}]
   除此之外不要写入任何其他内容到该文件。"

# Validate the article list file
if [ ! -f "$ARTICLE_LIST_FILE" ]; then
  echo "Error: Article list file was not created"
  exit 1
fi

ARTICLE_COUNT=$(jq 'length' "$ARTICLE_LIST_FILE" 2>/dev/null || echo 0)
echo "Article list contains $ARTICLE_COUNT articles"

if ! jq -e 'type == "array"' "$ARTICLE_LIST_FILE" > /dev/null 2>&1; then
  echo "Error: Invalid article list JSON. Content:"
  cat "$ARTICLE_LIST_FILE"
  exit 1
fi

# ─── Step 2: Find new articles ───────────────────────────────────────────────

echo "=== Finding new articles ==="

# Normalize URLs (strip fragment and trailing slash)
jq -c 'map(.url |= (split("#")[0] | sub("/$"; "")))' \
  "$ARTICLE_LIST_FILE" > "$ARTICLE_LIST_FILE.tmp"
mv "$ARTICLE_LIST_FILE.tmp" "$ARTICLE_LIST_FILE"

NEW_ARTICLES=$(jq -c --slurpfile processed "$PROCESSED_FILE" '
  map(. as $a | select(($processed[0] | has($a.url)) | not))
' "$ARTICLE_LIST_FILE")

NEW_COUNT=$(echo "$NEW_ARTICLES" | jq 'length')
echo "Found $NEW_COUNT new article(s) (already processed: $(jq 'length' "$PROCESSED_FILE"))"

if [ "$NEW_COUNT" -eq 0 ]; then
  echo "No new articles. Exiting."
  rm -f "$ARTICLE_LIST_FILE" "$ARTICLE_LIST_FILE.tmp"
  exit 0
fi

# Show which articles will be processed
echo "New articles:"
echo "$NEW_ARTICLES" | jq -r '.[] | "  - \(.title)"'

# ─── Step 3: Process each new article ────────────────────────────────────────

PROCESSED_COUNT=0

process_article() {
  local url="$1"
  local title="$2"

  # Normalize URL
  url=$(echo "$url" | sed -E 's|[#].*||; s|/$||')

  # Extract slug from URL (last path segment)
  local slug
  slug=$(echo "$url" | sed -E 's|^https?://||; s|[?#].*||; s|/$||' | awk -F/ '{print $NF}')

  local article_dir="$ARTICLES_DIR/$slug"
  mkdir -p "$article_dir"

  echo "=== Processing: $title ($slug) ==="

  local prompt="获取文章：${url}

然后将该文章的内容进行以下处理，生成三个文件：

**文件 1: brief-zh.md** — 简要提炼
- 用中文写 300-500 字
- 抓核心观点、主要论据和结论
- 让读者 2 分钟内理解文章要义
- 保存到: articles/${slug}/brief-zh.md

**文件 2: detailed-zh.md** — 详细摘要
- 用中文写 800-1000 字
- 按文章原有章节结构，逐节提炼
- 保留关键论据、数据、例子
- 保存到: articles/${slug}/detailed-zh.md

**文件 3: translation-zh.md** — 全文翻译
- 将整篇文章完整翻译成中文
- 严格保留原文的 markdown 格式、代码块、链接、引用
- 技术术语首次出现时括号附英文原文
- 保存到: articles/${slug}/translation-zh.md"

  if claude -p --print --no-session-persistence \
    --model "$MODEL" \
    --allowedTools "WebFetch,Write" \
    --max-budget-usd 3 \
    "$prompt"; then

    # Update processed.json
    local now
    now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    jq --arg url "$url" --arg slug "$slug" --arg time "$now" \
      '.[$url] = {"processed_at": $time, "slug": $slug}' \
      "$PROCESSED_FILE" > "$PROCESSED_FILE.tmp"
    mv "$PROCESSED_FILE.tmp" "$PROCESSED_FILE"

    # Commit this article
    git add "$article_dir" "$PROCESSED_FILE"
    git commit -m "collect: ${title}" || echo "WARNING: git commit failed (nothing to commit?)"

    echo "Done: $title"
    PROCESSED_COUNT=$((PROCESSED_COUNT + 1))
  else
    echo "ERROR: Failed to process $title"
  fi

  echo ""
}

# Process articles sequentially (use process substitution to avoid subshell)
while IFS= read -r article; do
  url=$(echo "$article" | jq -r '.url')
  title=$(echo "$article" | jq -r '.title')
  process_article "$url" "$title"
done < <(echo "$NEW_ARTICLES" | jq -c '.[]')

# Cleanup
rm -f "$ARTICLE_LIST_FILE" "$ARTICLE_LIST_FILE.tmp"
echo "All done. Processed $PROCESSED_COUNT article(s)."
