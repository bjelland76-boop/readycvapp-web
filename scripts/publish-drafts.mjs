#!/usr/bin/env node
// Moves approved drafts into the site and rebuilds pages + sitemap.
//
//   npm run publish-drafts                       # every draft with approved: true
//   npm run publish-drafts -- no/cv-uten-erfaring en/cv-with-no-experience
//   npm run publish-drafts -- --all              # every draft (used only when AUTO_PUBLISH=true)
//
// A draft that fails the checks (wrong UTM, missing app box, prices, ...)
// is not published; the reason is printed.
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { DRAFTS, PUBLISHED, ROOT, articlePath, loadLanguages, loadSite, loadTopics, saveTopics } from './lib/config.mjs';
import { normalize, offlineCheck } from './lib/drafts.mjs';
import { serializeDoc } from './lib/frontmatter.mjs';
import { buildSite, readArticles } from './lib/site.mjs';
import { checkUrls, linkCheckEnabled } from './lib/linkcheck.mjs';
import { externalUrls } from './generate.mjs';

export async function main(argv = process.argv.slice(2), log = console.log) {
  const all = argv.includes('--all');
  const wanted = argv.filter((a) => !a.startsWith('--'));
  const site = loadSite();
  const languages = loadLanguages();
  const byCode = Object.fromEntries(languages.map((l) => [l.code, l]));
  const topicsData = loadTopics();
  const drafts = readArticles(DRAFTS);
  const chosen = drafts.filter((d) => (wanted.length
    ? wanted.includes(`${d.lang}/${d.slug}`)
    : all || d.approved === true || d.approved === 'true'));
  for (const w of wanted) if (!drafts.some((d) => `${d.lang}/${d.slug}` === w)) log(`[publish] fant ikke utkastet ${w}`);
  if (!chosen.length) log('[publish] ingen godkjente utkast (sett approved: true i utkastet, eller oppgi lang/slug)');

  const published = [];
  const refused = [];
  for (const d of chosen) {
    const lang = byCode[d.lang];
    if (!lang) { refused.push(`${d.lang}/${d.slug}: ukjent språk`); continue; }
    const body = normalize(d.body, site, d.slug);
    const check = offlineCheck({ ...d, body }, lang, site);
    if (!check.ok) { refused.push(`${d.lang}/${d.slug}: ${check.problems.join('; ')}`); continue; }
    if (linkCheckEnabled()) {
      const dead = await checkUrls(externalUrls(body, site, d.slug));
      if (dead.length) { refused.push(`${d.lang}/${d.slug}: ${dead.join('; ')}`); continue; }
    }
    const now = new Date().toISOString();
    const { body: _b, path, approved, lang: _l, ...meta } = d;
    const out = { lang: d.lang, ...meta, published_at: d.published_at || now, updated_at: now };
    mkdirSync(join(PUBLISHED, d.lang), { recursive: true });
    const target = join(PUBLISHED, d.lang, `${d.slug}.md`);
    writeFileSync(path, serializeDoc(out, body));
    renameSync(path, target);
    const topic = topicsData.topics.find((t) => t.lang === d.lang && t.slug === d.slug);
    if (topic) Object.assign(topic, { status: 'published', published_at: out.published_at, url: articlePath(d.lang, d.slug), draft: undefined });
    published.push(`${d.lang}/${d.slug}${lang.enabled ? '' : ' (språket er av: siden bygges først når enabled=true)'}`);
    log(`[publish] ${relative(ROOT, target)}`);
  }
  saveTopics(topicsData);
  buildSite({ log });
  if (refused.length) log(`\n[publish] IKKE publisert:\n${refused.map((r) => `- ${r}`).join('\n')}`);
  log(`[publish] publisert: ${published.length}`);
  return { published, refused };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(({ refused }) => process.exit(refused.length ? 2 : 0)).catch((e) => {
    console.error(`[publish] ${e.message}`);
    process.exit(1);
  });
}
