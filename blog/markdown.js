/* ═══════════════════════════════════════════
   Tiny Markdown → HTML renderer
   No dependencies, no build step.
   Supports: headings, paragraphs, bold/italic,
   strikethrough, inline code, fenced code,
   links, images, lists (nested), blockquotes,
   tables, horizontal rules.
   ═══════════════════════════════════════════ */

(function () {
  const ESCAPE_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
  }

  function slugify(text) {
    return text
      .toLowerCase()
      .replace(/<[^>]*>/g, "")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60)
      .replace(/-+$/, "");
  }

  function stripInline(text) {
    return text
      .replace(/`([^`]+)`/g, "$1")
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/~~([^~]+)~~/g, "$1");
  }

  /* inline formatting — input is raw markdown, output is safe HTML */
  function inline(text) {
    const codes = [];
    let out = escapeHtml(text);

    // protect code spans
    out = out.replace(/`([^`]+)`/g, (_, code) => {
      codes.push(code);
      return "\u0000" + (codes.length - 1) + "\u0000";
    });

    // images before links
    out = out.replace(
      /!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g,
      (_, alt, src, title) =>
        `<img src="${src}" alt="${alt}"${title ? ` title="${title}"` : ""} loading="lazy" />`
    );
    out = out.replace(
      /\[([^\]]+)\]\(([^)\s]+)\)/g,
      (_, label, href) => `<a href="${href}"${/^https?:/i.test(href) ? ' target="_blank" rel="noopener"' : ""}>${label}</a>`
    );

    out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    out = out.replace(/~~([^~]+)~~/g, "<del>$1</del>");

    return out.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[+i]}</code>`);
  }

  function codeBlock(code, lang) {
    return (
      `<div class="code-block">` +
      `<div class="code-head"><span class="code-lang">${escapeHtml(lang || "text")}</span>` +
      `<button class="copy-btn" type="button">Copy</button></div>` +
      `<pre><code>${escapeHtml(code)}</code></pre>` +
      `</div>`
    );
  }

  const isBlank = (line) => /^\s*$/.test(line);
  const isFence = (line) => /^```/.test(line);
  const isHeading = (line) => /^#{1,6}\s+/.test(line);
  const isHr = (line) => /^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line);
  const isQuote = (line) => /^\s{0,3}>/.test(line);
  const listMarker = (line) => line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
  const isTableSep = (line) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);

  function splitRow(row) {
    let cells = row.trim();
    if (cells.startsWith("|")) cells = cells.slice(1);
    if (cells.endsWith("|")) cells = cells.slice(0, -1);
    return cells.split("|").map((c) => c.trim());
  }

  function tableBlock(lines, i) {
    const head = splitRow(lines[i]);
    i++; // separator
    const rows = [];
    while (i < lines.length && !isBlank(lines[i]) && lines[i].includes("|")) {
      rows.push(splitRow(lines[i]));
      i++;
    }
    const thead = `<thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead>`;
    const tbody = rows.length
      ? `<tbody>${rows
          .map((r) => `<tr>${head.map((_, idx) => `<td>${inline(r[idx] || "")}</td>`).join("")}</tr>`)
          .join("")}</tbody>`
      : "";
    return [`<table>${thead}${tbody}</table>`, i];
  }

  function listBlock(lines, i) {
    const baseIndent = lines[i].match(/^(\s*)/)[1].length;
    const ordered = /^\s*\d+\.\s+/.test(lines[i]);
    const items = [];

    while (i < lines.length) {
      const line = lines[i];

      if (isBlank(line)) {
        let j = i + 1;
        while (j < lines.length && isBlank(lines[j])) j++;
        if (j < lines.length && listMarker(lines[j]) && !isFence(lines[j])) {
          i = j;
          continue;
        }
        break;
      }

      const indent = line.match(/^(\s*)/)[1].length;
      const marker = listMarker(line);

      if (marker && indent === baseIndent) {
        items.push({ text: [marker[3]], extra: [] });
        i++;
      } else if (marker && indent > baseIndent && items.length) {
        const [nested, next] = listBlock(lines, i);
        items[items.length - 1].extra.push(nested);
        i = next;
      } else if (!marker && indent > baseIndent && items.length) {
        items[items.length - 1].text.push(line.trim());
        i++;
      } else {
        break;
      }
    }

    const tag = ordered ? "ol" : "ul";
    const html =
      `<${tag}>` +
      items
        .map((item) => {
          const body = inline(item.text.join(" "));
          return `<li>${body}${item.extra.join("")}</li>`;
        })
        .join("") +
      `</${tag}>`;

    return [html, i];
  }

  function render(markdown) {
    const lines = String(markdown).replace(/\r\n?/g, "\n").split("\n");
    const html = [];
    const headings = [];
    const usedIds = {};

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      if (isBlank(line)) { i++; continue; }

      /* fenced code */
      if (isFence(line)) {
        const lang = line.replace(/^```/, "").trim();
        const buf = [];
        i++;
        while (i < lines.length && !/^```\s*$/.test(lines[i])) {
          buf.push(lines[i]);
          i++;
        }
        i++; // closing fence
        html.push(codeBlock(buf.join("\n"), lang));
        continue;
      }

      /* heading */
      if (isHeading(line)) {
        const level = line.match(/^#+/)[0].length;
        const raw = line.replace(/^#{1,6}\s+/, "").trim();
        let id = slugify(raw) || "section";
        if (usedIds[id]) {
          usedIds[id] += 1;
          id = id + "-" + usedIds[id];
        } else {
          usedIds[id] = 1;
        }
        if (level === 2 || level === 3) {
          headings.push({ level, id, text: stripInline(raw) });
        }
        html.push(
          `<h${level} id="${id}">` +
            `<a class="anchor" href="#${id}" aria-hidden="true">#</a>` +
            `${inline(raw)}</h${level}>`
        );
        i++;
        continue;
      }

      /* horizontal rule */
      if (isHr(line)) {
        html.push("<hr />");
        i++;
        continue;
      }

      /* blockquote (recursive) */
      if (isQuote(line)) {
        const buf = [];
        while (i < lines.length && isQuote(lines[i])) {
          buf.push(lines[i].replace(/^\s*>\s?/, ""));
          i++;
        }
        html.push(`<blockquote>${render(buf.join("\n")).html}</blockquote>`);
        continue;
      }

      /* table */
      if (line.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        const [table, next] = tableBlock(lines, i);
        html.push(table);
        i = next;
        continue;
      }

      /* lists */
      if (listMarker(line)) {
        const [list, next] = listBlock(lines, i);
        html.push(list);
        i = next;
        continue;
      }

      /* paragraph */
      const buf = [];
      while (
        i < lines.length &&
        !isBlank(lines[i]) &&
        !isFence(lines[i]) &&
        !isHeading(lines[i]) &&
        !isHr(lines[i]) &&
        !isQuote(lines[i]) &&
        !listMarker(lines[i]) &&
        !(lines[i].includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1]))
      ) {
        buf.push(lines[i].trim());
        i++;
      }
      html.push(`<p>${inline(buf.join(" "))}</p>`);
    }

    return { html: html.join("\n"), headings };
  }

  window.renderMarkdown = render;
})();
