// Builds the public article pages from content/published/<lang>/<slug>.md:
//   /<lang>/<slug>/index.html, /<lang>/index.html (hub) and sitemap.xml.
// Only ENABLED languages are built. Existing pages are never touched: the
// build only rewrites /<lang>/ folders it created itself (marker file) and
// keeps every non-article entry of sitemap.xml as it is.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, PUBLISHED, articlePath, loadLanguages, loadSite } from './config.mjs';
import { parseDoc } from './frontmatter.mjs';
import { renderArticle, renderHub } from './render.mjs';

export const MARKER = '.generated-by-content-routine';

export function readArticles(dir, langCodes) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const code of readdirSync(dir)) {
    if (langCodes && !langCodes.includes(code)) continue;
    const ldir = join(dir, code);
    let files;
    try { files = readdirSync(ldir).filter((f) => f.endsWith('.md')); } catch { continue; }
    for (const f of files) {
      const path = join(ldir, f);
      const { meta, body } = parseDoc(readFileSync(path, 'utf8'));
      out.push({ ...meta, lang: code, slug: meta.slug || f.replace(/\.md$/, ''), body, path });
    }
  }
  return out;
}

function langRef(lang, order, url, title) {
  return { lang: lang.code, hreflang: lang.hreflang, htmlLang: lang.htmlLang, name: lang.name, ui: lang.ui, url, title, order };
}

export function buildSite({ root = ROOT, published = PUBLISHED, log = console.log } = {}) {
  const site = loadSite();
  const languages = loadLanguages();
  const enabled = languages.filter((l) => l.enabled);
  const order = Object.fromEntries(languages.map((l, i) => [l.code, i]));
  const byCode = Object.fromEntries(languages.map((l) => [l.code, l]));
  const articles = readArticles(published, enabled.map((l) => l.code))
    .map((a) => ({ ...a, url: articlePath(a.lang, a.slug) }));
  const paths = new Set(articles.map((a) => a.url));

  // Links to an article that is not (yet) public become plain text.
  const linkFilter = (u) => {
    if (u.startsWith(site.siteUrl)) u = u.slice(site.siteUrl.length) || '/';
    if (!u.startsWith('/')) return u;
    const p = u.replace(/[?#].*$/, '').replace(/\/?$/, '/');
    return p === '/' || paths.has(p) ? u : null;
  };

  // Remove what an earlier build generated, for every known language.
  for (const l of languages) {
    const dir = join(root, l.code);
    if (existsSync(dir)) {
      if (!existsSync(join(dir, MARKER))) throw new Error(`/${l.code}/ finnes allerede og er ikke laget av innholdsrutinen – rører den ikke`);
      rmSync(dir, { recursive: true, force: true });
    }
  }

  const written = [];
  for (const a of articles) {
    const lang = byCode[a.lang];
    const self = langRef(lang, order[a.lang], a.url, a.h1 || a.title);
    const alternates = articles
      .filter((o) => o !== a && o.group && o.group === a.group && o.lang !== a.lang)
      .map((o) => langRef(byCode[o.lang], order[o.lang], o.url, o.h1 || o.title));
    const html = renderArticle({ lang, meta: a, body: a.body, url: a.url, self, alternates, site, linkFilter });
    const dir = join(root, a.lang, a.slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), html);
    written.push(a.url);
  }

  const hubs = [];
  for (const lang of enabled) {
    const list = articles.filter((a) => a.lang === lang.code)
      .sort((x, y) => String(y.published_at).localeCompare(String(x.published_at)));
    if (!list.length) continue;
    hubs.push({ lang, list });
  }
  for (const { lang, list } of hubs) {
    const url = `/${lang.code}/`;
    const self = langRef(lang, order[lang.code], url, lang.ui.hubTitle);
    const alternates = hubs.filter((h) => h.lang !== lang)
      .map((h) => langRef(h.lang, order[h.lang.code], `/${h.lang.code}/`, h.lang.ui.hubTitle));
    writeFileSync(join(root, lang.code, 'index.html'), renderHub({ lang, articles: list, url, self, alternates, site }));
    written.push(url);
  }
  for (const { lang } of hubs) writeFileSync(join(root, lang.code, MARKER), 'Laget av scripts/build-site.mjs. Ikke rediger filene her; rediger content/published/.\n');

  writeSitemap({ root, site, languages, articles, hubs: hubs.map((h) => h.lang) });
  log(`[build] ${articles.length} artikler og ${hubs.length} språkforsider bygget (${enabled.map((l) => l.code).join(', ') || 'ingen aktive språk'})`);
  return { written, articles };
}

function xmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Keeps all existing <url> entries outside the language folders exactly as
// they are, and appends the hubs and articles (with hreflang alternates).
export function writeSitemap({ root, site, languages, articles, hubs }) {
  const file = join(root, 'sitemap.xml');
  const old = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const codes = languages.map((l) => l.code);
  const byCode = Object.fromEntries(languages.map((l) => [l.code, l]));
  const keep = [...old.matchAll(/[ \t]*<url>[\s\S]*?<\/url>/g)].map((m) => m[0]).filter((block) => {
    const loc = /<loc>([^<]+)<\/loc>/.exec(block)?.[1] || '';
    const path = loc.replace(site.siteUrl, '');
    return !codes.some((c) => path === `/${c}/` || path.startsWith(`/${c}/`));
  });
  const entry = (url, lastmod, alts, priority) => {
    const links = alts.length
      ? alts.map((a) => `\n    <xhtml:link rel="alternate" hreflang="${xmlEscape(a.hreflang)}" href="${xmlEscape(site.siteUrl + a.url)}"/>`).join('')
      : '';
    return `  <url>\n    <loc>${xmlEscape(site.siteUrl + url)}</loc>\n    <lastmod>${lastmod}</lastmod>${links}\n    <changefreq>monthly</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
  };
  const today = new Date().toISOString().slice(0, 10);
  const generated = [];
  const hubAlts = hubs.map((l) => ({ hreflang: l.hreflang, url: `/${l.code}/` }));
  for (const l of hubs) {
    const newest = articles.filter((a) => a.lang === l.code).map((a) => String(a.updated_at || a.published_at || today).slice(0, 10)).sort().pop() || today;
    generated.push(entry(`/${l.code}/`, newest, hubAlts.length > 1 ? hubAlts : [], '0.6'));
  }
  for (const a of articles) {
    const group = articles.filter((o) => o.group && o.group === a.group);
    const alts = group.length > 1 ? group.map((o) => ({ hreflang: byCode[o.lang].hreflang, url: o.url })) : [];
    generated.push(entry(a.url, String(a.updated_at || a.published_at || today).slice(0, 10), alts, '0.7'));
  }
  const ns = generated.some((g) => g.includes('xhtml:link')) ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"' : '';
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${ns}>\n${[...keep, ...generated].join('\n')}\n</urlset>\n`;
  if (xml !== old) writeFileSync(file, xml);
}
