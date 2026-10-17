#!/usr/bin/env node
// Moves approved drafts into the site and rebuilds pages + sitemap.
//
//   npm run publish-drafts                       # every draft with approved: true
//   npm run publish-drafts -- no/cv-uten-erfaring en/cv-with-no-experience
//   npm run publish-drafts -- --all              # every draft, approved or not (manual use only)
//   npm run publish-drafts -- --auto             # the workflow: approved drafts of the ACTIVE
//                                                # languages, within the weekly limit per language
//
// Only languages with enabled=true are ever published (at most
// maxActiveLanguages); drafts in other languages stay drafts.
// A draft that fails the checks (wrong UTM, missing app box, prices, ...)
// is not published; the reason is printed.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { DRAFTS, PUBLISHED, ROOT, activeLanguages, articlePath, loadLanguages, loadSite, loadTopics, saveTopics } from './lib/config.mjs';

const WEEK_MS = 7 * 24 * 3600 * 1000;
export function publishedThisWeek(topics, lang, now = Date.now()) {
  return topics.filter((t) => t.lang === lang && t.published_at && now - Date.parse(t.published_at) < WEEK_MS).length;
}
import { normalize, offlineCheck } from './lib/drafts.mjs';
import { parseDoc, serializeDoc } from './lib/frontmatter.mjs';
import { buildSite, readArticles } from './lib/site.mjs';
import { checkUrls, linkCheckEnabled } from './lib/linkcheck.mjs';
import { externalUrls } from './generate.mjs';

export async function main(argv = process.argv.slice(2), log = console.log) {
  const all = argv.includes('--all');
  const auto = argv.includes('--auto');
  const wanted = argv.filter((a) => !a.startsWith('--'));
  const site = loadSite();
  const languages = loadLanguages();
  const byCode = Object.fromEntries(languages.map((l) => [l.code, l]));
  const topicsData = loadTopics();
  const active = new Set(activeLanguages(languages, site).map((l) => l.code));
  const drafts = readArticles(DRAFTS);
  let chosen = drafts.filter((d) => (wanted.length
    ? wanted.includes(`${d.lang}/${d.slug}`)
    : all || d.approved === true || d.approved === 'true'));
  for (const d of chosen.filter((x) => !active.has(x.lang))) log(`[publish] ${d.lang}/${d.slug}: språket er ikke aktivt (enabled=false) – forblir utkast`);
  chosen = chosen.filter((d) => active.has(d.lang));
  if (auto) {
    // Weekly limit: no more than maxArticlesPerLanguagePerWeek published per
    // language in the last 7 days; the oldest approved drafts go first.
    const room = Object.fromEntries([...active].map((c) => [c, Math.max(0,
      site.maxArticlesPerLanguagePerWeek - publishedThisWeek(topicsData.topics, c))]));
    chosen = chosen.sort((x, y) => String(x.generated_at).localeCompare(String(y.generated_at))).filter((d) => {
      if (room[d.lang] > 0) { room[d.lang] -= 1; return true; }
      log(`[publish] ${d.lang}/${d.slug}: ukegrensen for publisering er nådd – venter til neste uke`);
      return false;
    });
  }
  for (const w of wanted) if (!drafts.some((d) => `${d.lang}/${d.slug}` === w)) log(`[publish] fant ikke utkastet ${w}`);
  if (!chosen.length) log('[publish] ingen godkjente utkast (sett approved: true i utkastet, eller oppgi lang/slug)');

  const published = [];
  const refused = [];
  for (const d of chosen) {
    const lang = byCode[d.lang];
    if (!lang) { refused.push(`${d.lang}/${d.slug}: ukjent språk`); continue; }
    const body = normalize(d.body, site, d.slug);
    const check = offlineCheck({ ...d, body }, lang, site);
    const problems = check.ok ? [] : check.problems;
    if (!problems.length && linkCheckEnabled()) problems.push(...await checkUrls(externalUrls(body, site, d.slug)));
    if (problems.length) {
      // Not published: stays a draft, no longer approved, reason in topics.json.
      refused.push(`${d.lang}/${d.slug}: ${problems.join('; ')}`);
      writeFileSync(d.path, serializeDoc({ ...parseDoc(readFileSync(d.path, 'utf8')).meta, approved: false }, body));
      const t = topicsData.topics.find((x) => x.lang === d.lang && x.slug === d.slug);
      if (t) t.last_error = `publisering stoppet: ${problems.join(' | ')}`.slice(0, 1000);
      continue;
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
