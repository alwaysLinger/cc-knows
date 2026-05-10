#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = "ali-agent";
const dirs = readdirSync(root).filter((name) => /^\d\d-/.test(name)).sort();
const headings = ["金句摘抄", "刷新普通开发者认知的句子"];

function normalize(text) {
  return text.replace(/[\s`*_“”"'\u300a\u300b：:，,。.!！?？、；;（）()[\]【】]/g, "");
}

const misses = [];

for (const dir of dirs) {
  const original = normalize(readFileSync(join(root, dir, "original.md"), "utf8"));
  const summary = readFileSync(join(root, dir, "summary.md"), "utf8");

  for (const heading of headings) {
    const match = summary.match(new RegExp(`##\\s*${heading}\\n([\\s\\S]*?)(?=\\n##\\s|$)`));
    if (!match) {
      misses.push(`${dir}: missing ${heading}`);
      continue;
    }

    for (const line of match[1].split(/\n/)) {
      const bullet = line.match(/^\s*-\s*(.+?)\s*$/);
      if (!bullet) continue;

      const quote = normalize(bullet[1]);
      if (quote.length >= 4 && !original.includes(quote)) {
        misses.push(`${dir}: ${heading}: ${bullet[1]}`);
      }
    }
  }
}

if (misses.length) {
  console.log(misses.join("\n"));
  process.exitCode = 1;
} else {
  console.log("quote bullets all matched original text");
}
