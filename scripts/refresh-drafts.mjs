#!/usr/bin/env node
// Brings existing drafts (and published sources) up to date: UTM tags on
// every web-app link and the mid-article app box marker. Then runs the
// offline checks and lists what still needs fixing (e.g. a draft made
// before the app boxes existed has no cta_* text: regenerate it or add the
// fields by hand).
//
//   npm run refresh-drafts
import { readFileSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import { DRAFTS, PUBLISHED, ROOT, loadLanguages, loadSite } from './lib/config.mjs';
import { normalize, offlineCheck } from './lib/drafts.mjs';
import { parseDoc, serializeDoc } from './lib/frontmatter.mjs';
import { buildSite, readArticles } from './lib/site.mjs';

export function main(log = console.log) {
  const site = loadSite();
  const byCode = Object.fromEntries(loadLanguages().map((l) => [l.code, l]));
  let changed = 0;
  let publishedChanged = 0;
  const problems = [];
  for (const [dir, isPublished] of [[DRAFTS, false], [PUBLISHED, true]]) {
    for (const d of readArticles(dir)) {
      const { meta, body } = parseDoc(readFileSync(d.path, 'utf8'));
      const next = normalize(body, site, d.slug);
      if (next !== body) {
        writeFileSync(d.path, serializeDoc(meta, next));
        changed += 1;
        if (isPublished) publishedChanged += 1;
        log(`[refresh] oppdatert ${relative(ROOT, d.path)}`);
      }
      const lang = byCode[d.lang];
      if (!lang) continue;
      const res = offlineCheck({ ...d, body: next }, lang, site);
      if (!res.ok) problems.push(`${relative(ROOT, d.path)}: ${res.problems.join('; ')}`);
    }
  }
  if (publishedChanged) buildSite({ log });
  log(`[refresh] ${changed} fil(er) oppdatert`);
  if (problems.length) log(`[refresh] må rettes før publisering:\n${problems.map((p) => `- ${p}`).join('\n')}`);
  return { changed, problems };
}

if (import.meta.url === `file://${process.argv[1]}`) main();
