/**
 * Minimal Markdown → HTML for internal legal docs (trusted source).
 * Supports: ATX headings, ---, blockquotes, ul, paragraphs, GFM-style tables,
 * **bold**, *italic*, `code`, [text](url).
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeHref(url: string): string {
  const u = url.trim();
  if (/PRIVACY_POLICY\.md$/i.test(u) || u === "./PRIVACY_POLICY.md") {
    return escapeHtml("/legal/privacy");
  }
  if (/TERMS_OF_SERVICE\.md$/i.test(u) || u === "./TERMS_OF_SERVICE.md") {
    return escapeHtml("/legal/terms");
  }
  if (/^https?:\/\//i.test(u) || u.startsWith("/") || u.startsWith("#") || u.startsWith("mailto:")) {
    return escapeHtml(u);
  }
  return "#";
}

export function inlineMarkdown(text: string): string {
  const codes: string[] = [];
  let s = text.replace(/`([^`]+)`/g, (_m, c) => {
    codes.push(c);
    return `\x00C${codes.length - 1}\x00`;
  });
  const links: Array<{ label: string; url: string }> = [];
  s = s.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (_m, label, url) => {
    links.push({ label, url });
    return `\x00L${links.length - 1}\x00`;
  });
  s = escapeHtml(s);
  s = s.replace(/\x00C(\d+)\x00/g, (_m, i) => `<code>${escapeHtml(codes[Number(i)]!)}</code>`);
  s = s.replace(/\x00L(\d+)\x00/g, (_m, i) => {
    const { label, url } = links[Number(i)]!;
    const href = safeHref(url);
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return s;
}

function isTableLine(line: string): boolean {
  const t = line.trimStart();
  return t.startsWith("|") && t.includes("|");
}

function isTableSeparator(line: string): boolean {
  const t = line.trim();
  if (!t.startsWith("|")) return false;
  return /^\|?[\s|:-]+\|[\s|:-|]+$/.test(t) && t.includes("-");
}

function parseTableRow(line: string): string[] {
  const t = line.trim();
  const inner = t.startsWith("|") ? t.slice(1) : t;
  const parts = inner.split("|").map((c) => c.trim());
  if (parts.length && parts[parts.length - 1] === "") parts.pop();
  return parts;
}

function renderTable(lines: string[]): string {
  if (lines.length < 2) return `<p>${inlineMarkdown(lines.join(" "))}</p>`;
  const rows = lines.map(parseTableRow);
  let bodyStart = 1;
  if (lines.length >= 2 && isTableSeparator(lines[1] ?? "")) {
    bodyStart = 2;
  }
  const header = rows[0] ?? [];
  const bodyRows = rows.slice(bodyStart);
  const th = header.map((c) => `<th>${inlineMarkdown(c)}</th>`).join("");
  const trs = bodyRows
    .filter((r) => r.some((c) => c.length > 0))
    .map((r) => `<tr>${r.map((c) => `<td>${inlineMarkdown(c)}</td>`).join("")}</tr>`)
    .join("");
  return `<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
}

export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  let inUl = false;
  let inBlockquote = false;

  const closeUl = () => {
    if (inUl) {
      out.push("</ul>");
      inUl = false;
    }
  };
  const closeBq = () => {
    if (inBlockquote) {
      out.push("</blockquote>");
      inBlockquote = false;
    }
  };

  while (i < lines.length) {
    const raw = lines[i] ?? "";
    const line = raw;
    const trimmed = line.trim();

    if (trimmed === "") {
      closeUl();
      closeBq();
      i++;
      continue;
    }

    if (isTableLine(line)) {
      closeUl();
      closeBq();
      const block: string[] = [];
      while (i < lines.length && isTableLine(lines[i] ?? "")) {
        block.push(lines[i]!);
        i++;
      }
      out.push(renderTable(block));
      continue;
    }

    if (trimmed === "---") {
      closeUl();
      closeBq();
      out.push("<hr />");
      i++;
      continue;
    }

    if (line.startsWith("### ")) {
      closeUl();
      closeBq();
      out.push(`<h3>${inlineMarkdown(line.slice(4))}</h3>`);
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      closeUl();
      closeBq();
      out.push(`<h2>${inlineMarkdown(line.slice(3))}</h2>`);
      i++;
      continue;
    }
    if (line.startsWith("# ")) {
      closeUl();
      closeBq();
      out.push(`<h1>${inlineMarkdown(line.slice(2))}</h1>`);
      i++;
      continue;
    }

    if (trimmed.startsWith(">")) {
      closeUl();
      const content = trimmed.replace(/^>\s?/, "");
      if (!inBlockquote) {
        out.push("<blockquote>");
        inBlockquote = true;
      }
      out.push(`<p>${inlineMarkdown(content)}</p>`);
      i++;
      continue;
    }

    const ulMatch = /^(\s*)([-*])\s+(.+)$/.exec(line);
    if (ulMatch) {
      closeBq();
      if (!inUl) {
        out.push("<ul>");
        inUl = true;
      }
      out.push(`<li>${inlineMarkdown(ulMatch[3]!)}</li>`);
      i++;
      continue;
    }

    closeUl();
    closeBq();

    const paraLines: string[] = [];
    while (i < lines.length) {
      const L = lines[i] ?? "";
      const tr = L.trim();
      if (tr === "") break;
      if (isTableLine(L) || L.startsWith("#") || tr === "---" || tr.startsWith(">")) break;
      if (/^(\s*)([-*])\s+/.test(L)) break;
      paraLines.push(L);
      i++;
    }
    const para = paraLines.join(" ").trim();
    if (para) out.push(`<p>${inlineMarkdown(para)}</p>`);
  }

  closeUl();
  closeBq();
  return out.join("\n");
}
