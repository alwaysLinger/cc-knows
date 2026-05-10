#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);

function arg(name, fallback = "") {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return args[idx + 1] || "";
}

const url = arg("url");
const outDir = arg("out-dir");
const session = arg("session", `wechat-${Date.now()}`);

if (!url || !outDir) {
  console.error("Usage: node scrape_wechat_article.mjs --url <url> --out-dir <dir> [--session <name>]");
  process.exit(2);
}

function runAgentBrowser(commandArgs, input) {
  return execFileSync("agent-browser", ["--session", session, ...commandArgs], {
    cwd: process.cwd(),
    encoding: "utf8",
    input,
    maxBuffer: 64 * 1024 * 1024,
  });
}

const pageScript = String.raw`
(() => {
  const normalizeText = (text) => (text || "")
    .replace(/\u200b/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  const title =
    normalizeText(document.querySelector("#activity-name")?.innerText) ||
    normalizeText(document.querySelector("h1")?.innerText) ||
    normalizeText(document.title);
  const account = normalizeText(document.querySelector("#js_name")?.innerText);
  const publishTime = normalizeText(document.querySelector("#publish_time")?.innerText);
  const content = document.querySelector("#js_content") || document.querySelector(".rich_media_content") || document.body;

  const escapeMd = (text) => normalizeText(text)
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");

  const imageUrl = (el) =>
    el.getAttribute("data-src") ||
    el.getAttribute("data-original") ||
    el.getAttribute("src") ||
    "";

  function isHidden(el) {
    if (!el || el.nodeType !== 1) return false;
    const style = window.getComputedStyle(el);
    return style.display === "none" || style.visibility === "hidden";
  }

  function inlineMd(node) {
    if (!node) return "";
    if (node.nodeType === Node.TEXT_NODE) return escapeMd(node.textContent);
    if (node.nodeType !== Node.ELEMENT_NODE || isHidden(node)) return "";

    const tag = node.tagName.toLowerCase();
    if (tag === "br") return "\n";
    if (tag === "img") {
      const src = imageUrl(node);
      if (!src) return "";
      const alt = escapeMd(node.getAttribute("alt") || node.getAttribute("data-cropselx1") || "image");
      return "![" + alt + "](" + src + ")";
    }

    const childText = Array.from(node.childNodes).map(inlineMd).join("");
    const text = normalizeText(childText);
    if (!text) return "";

    if (tag === "a") {
      const href = node.href || node.getAttribute("href") || "";
      return href ? "[" + text + "](" + href + ")" : text;
    }
    if (tag === "strong" || tag === "b") return "**" + text + "**";
    if (tag === "em" || tag === "i") return "*" + text + "*";
    if (tag === "code") {
      const tick = String.fromCharCode(96);
      return tick + text.split(tick).join("\\" + tick) + tick;
    }
    return text;
  }

  function tableMd(table) {
    const rows = Array.from(table.querySelectorAll("tr")).map((tr) =>
      Array.from(tr.children).map((cell) => normalizeText(cell.innerText).replace(/\|/g, "\\|"))
    ).filter((row) => row.length);
    if (!rows.length) return "";
    const width = Math.max(...rows.map((row) => row.length));
    const padded = rows.map((row) => Array.from({ length: width }, (_, i) => row[i] || ""));
    const header = padded[0];
    const divider = Array.from({ length: width }, () => "---");
    const body = padded.slice(1);
    return [header, divider, ...body].map((row) => "| " + row.join(" | ") + " |").join("\n");
  }

  function listMd(list, ordered = false, depth = 0) {
    return Array.from(list.children)
      .filter((el) => el.tagName && el.tagName.toLowerCase() === "li")
      .map((li, idx) => {
        const direct = Array.from(li.childNodes)
          .filter((child) => !(child.nodeType === Node.ELEMENT_NODE && ["ul", "ol"].includes(child.tagName.toLowerCase())))
          .map(inlineMd)
          .join(" ");
        const prefix = ordered ? (idx + 1) + ". " : "- ";
        const nested = Array.from(li.children)
          .filter((child) => ["ul", "ol"].includes(child.tagName.toLowerCase()))
          .map((child) => listMd(child, child.tagName.toLowerCase() === "ol", depth + 1))
          .filter(Boolean)
          .join("\n");
        const line = "  ".repeat(depth) + prefix + normalizeText(direct);
        return nested ? line + "\n" + nested : line;
      })
      .join("\n");
  }

  function hasBlockChildren(el) {
    return Array.from(el.children).some((child) => {
      const tag = child.tagName.toLowerCase();
      return [
        "address", "article", "aside", "blockquote", "div", "dl", "figure", "footer",
        "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "ol",
        "p", "pre", "section", "table", "ul"
      ].includes(tag);
    });
  }

  function blockMd(node, depth = 0) {
    if (!node) return "";
    if (node.nodeType === Node.TEXT_NODE) return normalizeText(node.textContent);
    if (node.nodeType !== Node.ELEMENT_NODE || isHidden(node)) return "";

    const tag = node.tagName.toLowerCase();
    if (tag === "script" || tag === "style" || tag === "svg") return "";

    if (/^h[1-6]$/.test(tag)) {
      const level = Number(tag.slice(1));
      const text = normalizeText(node.innerText);
      return text ? "#".repeat(level) + " " + text : "";
    }
    if (tag === "p") {
      const text = normalizeText(Array.from(node.childNodes).map(inlineMd).join(""));
      return text;
    }
    if (tag === "blockquote") {
      const text = Array.from(node.childNodes).map((child) => blockMd(child, depth)).filter(Boolean).join("\n\n");
      return text.split("\n").map((line) => "> " + line).join("\n");
    }
    if (tag === "pre") {
      const fence = String.fromCharCode(96, 96, 96);
      return fence + "\n" + node.innerText.replace(/\n+$/g, "") + "\n" + fence;
    }
    if (tag === "ul" || tag === "ol") return listMd(node, tag === "ol", depth);
    if (tag === "table") return tableMd(node);
    if (tag === "img") return inlineMd(node);
    if (tag === "hr") return "---";

    if (!hasBlockChildren(node)) {
      const inline = normalizeText(Array.from(node.childNodes).map(inlineMd).join(""));
      return inline;
    }

    return Array.from(node.childNodes)
      .map((child) => blockMd(child, depth))
      .filter(Boolean)
      .join("\n\n");
  }

  const markdown = normalizeText(blockMd(content))
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^[ \t]+$/gm, "")
    .trim();

  return {
    title,
    account,
    publishTime,
    url: location.href,
    markdown,
  };
})()
`;

runAgentBrowser(["open", url]);
try {
  runAgentBrowser(["wait", "--text", "阿里"]);
} catch {
  // The article may not contain this text. Continue after open; extraction validates the content.
}

const raw = runAgentBrowser(["eval", "--stdin"], pageScript);
let article;
try {
  article = JSON.parse(raw);
} catch (error) {
  console.error("Failed to parse extraction output:");
  console.error(raw.slice(0, 2000));
  throw error;
}

if (!article.title || !article.markdown || article.markdown.length < 1000) {
  console.error(JSON.stringify({
    title: article.title,
    markdownLength: article.markdown?.length || 0,
    url: article.url,
  }, null, 2));
  throw new Error("Article extraction looks incomplete.");
}

mkdirSync(outDir, { recursive: true });

const original = [
  `# ${article.title}`,
  "",
  `- 原文链接：${article.url || url}`,
  article.account ? `- 公众号：${article.account}` : "",
  article.publishTime ? `- 发布时间：${article.publishTime}` : "",
  "",
  "---",
  "",
  article.markdown,
  "",
].filter((line) => line !== "").join("\n");

writeFileSync(join(outDir, "original.md"), original, "utf8");
writeFileSync(join(outDir, "meta.json"), JSON.stringify({
  title: article.title,
  account: article.account,
  publishTime: article.publishTime,
  url: article.url || url,
  markdownLength: article.markdown.length,
}, null, 2) + "\n", "utf8");

console.log(JSON.stringify({
  outDir,
  title: article.title,
  account: article.account,
  publishTime: article.publishTime,
  markdownLength: article.markdown.length,
}, null, 2));
