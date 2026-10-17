// The small Markdown subset the articles use, rendered without dependencies:
//   ## / ### headings, paragraphs, "- " and "1. " lists, "> " blockquotes
//   (for example sentences), **bold**, *italic* and [text](url).
// Anything else is escaped as text, so model output can never inject HTML.
// The FAQ follows a line "<!-- faq -->", as "### question" + answer.

export const FAQ_MARKER = '<!-- faq -->';

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function splitFaq(body) {
  const i = body.indexOf(FAQ_MARKER);
  if (i < 0) return { main: body.trim(), faqText: '' };
  return { main: body.slice(0, i).trim(), faqText: body.slice(i + FAQ_MARKER.length).trim() };
}

// [{ q, a }] from "### question\n\nanswer..." blocks.
export function parseFaq(faqText) {
  const items = [];
  let cur = null;
  for (const line of faqText.split('\n')) {
    const h = /^###\s+(.+)$/.exec(line.trim());
    if (h) {
      cur = { q: h[1].trim(), a: [] };
      items.push(cur);
    } else if (cur && line.trim()) {
      cur.a.push(line.trim());
    }
  }
  return items.map((it) => ({ q: it.q, a: it.a.join(' ') })).filter((it) => it.q && it.a);
}

// Inline formatting. `linkFilter(url)` returns the href to use, or null to
// render the link text only.
export function inline(text, linkFilter = (u) => u) {
  let out = '';
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    out += escapeHtml(text.slice(last, m.index));
    if (m[1] !== undefined) {
      const href = linkFilter(m[2]);
      const label = inline(m[1], () => null);
      if (href) {
        const external = /^https?:\/\//.test(href);
        out += `<a href="${escapeHtml(href)}"${external ? ' rel="noopener" target="_blank"' : ''}>${label}</a>`;
      } else {
        out += label;
      }
    } else if (m[3] !== undefined) {
      out += `<strong>${escapeHtml(m[3])}</strong>`;
    } else {
      out += `<em>${escapeHtml(m[4])}</em>`;
    }
    last = re.lastIndex;
  }
  return out + escapeHtml(text.slice(last));
}

// Block structure: [{ type: 'h2'|'h3'|'p'|'ul'|'ol'|'quote', text | items }]
export function parseBlocks(md) {
  const blocks = [];
  let para = [];
  let list = null;
  let quote = null;
  const flush = () => {
    if (para.length) blocks.push({ type: 'p', text: para.join(' ') });
    if (list) blocks.push(list);
    if (quote) blocks.push({ type: 'quote', text: quote.join(' '), lines: quote });
    para = [];
    list = null;
    quote = null;
  };
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    if (!line || /^<!--.*-->$/.test(line)) { flush(); continue; }
    let m;
    if ((m = /^(#{1,6})\s+(.+)$/.exec(line))) {
      flush();
      blocks.push({ type: m[1].length <= 2 ? (m[1].length === 1 ? 'h1' : 'h2') : 'h3', text: m[2].trim() });
    } else if ((m = /^[-*]\s+(.+)$/.exec(line))) {
      if (para.length || quote || (list && list.type !== 'ul')) flush();
      list = list || { type: 'ul', items: [] };
      list.items.push(m[1]);
    } else if ((m = /^\d+[.)]\s+(.+)$/.exec(line))) {
      if (para.length || quote || (list && list.type !== 'ol')) flush();
      list = list || { type: 'ol', items: [] };
      list.items.push(m[1]);
    } else if ((m = /^>\s?(.*)$/.exec(line))) {
      if (para.length || list) flush();
      quote = quote || [];
      quote.push(m[1]);
    } else {
      if (list || quote) flush();
      para.push(line);
    }
  }
  flush();
  return blocks;
}

export function slugId(text) {
  return String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

export function renderBlocks(blocks, linkFilter) {
  const used = new Set();
  return blocks.map((b) => {
    const t = (s) => inline(s, linkFilter);
    switch (b.type) {
      case 'h1':
      case 'h2': {
        let id = slugId(b.text) || 'del';
        while (used.has(id)) id += '-2';
        used.add(id);
        return `<h2 id="${id}">${t(b.text)}</h2>`;
      }
      case 'h3': return `<h3>${t(b.text)}</h3>`;
      case 'ul': return `<ul>${b.items.map((i) => `<li>${t(i)}</li>`).join('')}</ul>`;
      case 'ol': return `<ol>${b.items.map((i) => `<li>${t(i)}</li>`).join('')}</ol>`;
      // Each quoted line keeps its own line (example CV entries, letters).
      case 'quote': return `<blockquote>${(b.lines || [b.text]).map(t).join('<br>')}</blockquote>`;
      default: return `<p>${t(b.text)}</p>`;
    }
  }).join('\n');
}

// Plain text (for word counts, duplicate checks and language detection).
export function toPlainText(md) {
  return md
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*_`]/g, ' ')
    .replace(/^\s*(?:[-*]|\d+[.)])\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function linksIn(md) {
  return [...md.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)].map((m) => ({ text: m[1], url: m[2] }));
}
