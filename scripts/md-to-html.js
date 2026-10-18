#!/usr/bin/env node
"use strict";

const fs = require("node:fs");

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inline(s) {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function convert(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++;
      out.push("<pre>" + escapeHtml(buf.join("\n")) + "</pre>");
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        rows.push(lines[i]);
        i++;
      }
      const cells = rows.map((r) =>
        r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim())
      );
      const isSep = (row) => row.every((c) => /^:?-{2,}:?$/.test(c));
      let html = "<table>";
      let headerDone = false;
      for (let r = 0; r < cells.length; r++) {
        if (isSep(cells[r])) continue;
        const tag = !headerDone ? "th" : "td";
        headerDone = true;
        html += "<tr>" + cells[r].map((c) => `<${tag}>${inline(c)}</${tag}>`).join("") + "</tr>";
      }
      html += "</table>";
      out.push(html);
      continue;
    }

    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const lvl = h[1].length;
      out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`);
      i++;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      out.push("<ul>" + items.map((t) => `<li>${inline(t)}</li>`).join("") + "</ul>");
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      out.push("<ol>" + items.map((t) => `<li>${inline(t)}</li>`).join("") + "</ol>");
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      out.push("<blockquote>" + inline(buf.join(" ")) + "</blockquote>");
      continue;
    }

    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      out.push("<hr>");
      i++;
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    const buf = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,6})\s/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^\s*\|/.test(lines[i]) &&
      !/^\s*[-*]\s/.test(lines[i]) &&
      !/^\s*\d+\.\s/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    out.push("<p>" + inline(buf.join(" ")) + "</p>");
  }

  return out.join("\n");
}

const [, , input = "docs/architecture.md", output = "docs/architecture.html"] = process.argv;
const md = fs.readFileSync(input, "utf8");

const css = `
@page { size: A4; margin: 2cm 1.8cm; }
html { font-family: "Liberation Sans", Arial, sans-serif; }
body { color: #1a1a1a; font-size: 10.5pt; line-height: 1.45; }
h1 { font-size: 20pt; border-bottom: 2px solid #333; padding-bottom: 4px; margin-top: 0; }
h2 { font-size: 14pt; margin-top: 18px; border-bottom: 1px solid #bbb; padding-bottom: 2px; page-break-after: avoid; }
h3 { font-size: 12pt; margin-top: 12px; page-break-after: avoid; }
p { margin: 6px 0; text-align: justify; }
pre { background: #f4f4f4; border: 1px solid #ddd; padding: 8px; font-family: "Liberation Mono", monospace; font-size: 8.5pt; white-space: pre-wrap; page-break-inside: avoid; }
code { background: #f0f0f0; padding: 0 2px; font-family: "Liberation Mono", monospace; font-size: 9pt; }
table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 9pt; page-break-inside: avoid; }
th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; vertical-align: top; }
th { background: #eee; }
blockquote { border-left: 3px solid #999; margin: 8px 0; padding: 4px 10px; color: #444; }
hr { border: none; border-top: 1px solid #ccc; margin: 12px 0; }
ul, ol { margin: 6px 0; padding-left: 22px; }
`;

const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>ShopFacil — Arquitetura e Observabilidade</title>
<style>${css}</style>
</head>
<body>
${convert(md)}
</body>
</html>
`;

fs.writeFileSync(output, html);
console.log(`Wrote ${output}`);
