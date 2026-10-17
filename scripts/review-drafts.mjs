#!/usr/bin/env node
// Runs the FULL quality check on existing drafts – offline checks, link
// check and the model review – without rewriting them. Use it after editing
// a draft by hand. Needs ANTHROPIC_API_KEY (one API call per draft).
//   npm run review-drafts                 # all drafts
//   npm run review-drafts -- no/cv-uten-erfaring
import { readFileSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import { complete, extractJson } from './lib/anthropic.mjs';
import { DRAFTS, ROOT, loadLanguages, loadSite } from './lib/config.mjs';
import { normalize, offlineCheck } from './lib/drafts.mjs';
import { parseDoc, serializeDoc } from './lib/frontmatter.mjs';
import { checkUrls, linkCheckEnabled } from './lib/linkcheck.mjs';
import { checkReview } from './lib/quality.mjs';
import { readArticles } from './lib/site.mjs';
import { externalUrls, headings, reviewerSystem, reviewerUser } from './generate.mjs';

const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const site = loadSite();
const byCode = Object.fromEntries(loadLanguages().map((l) => [l.code, l]));
const drafts = readArticles(DRAFTS);
let failed = 0;
for (const d of drafts.filter((x) => !wanted.length || wanted.includes(`${x.lang}/${x.slug}`))) {
  const lang = byCode[d.lang];
  const body = normalize(d.body, site, d.slug);
  const problems = [...offlineCheck({ ...d, body }, lang, site).problems];
  if (linkCheckEnabled()) problems.push(...(await checkUrls(externalUrls(body, site, d.slug))).map((x) => `lenker: ${x}`));
  const siblings = drafts.filter((o) => o.group === d.group && o.lang !== d.lang).map((o) => ({ lang: o.lang, headings: headings(o.body) }));
  const { text } = await complete({ model: site.reviewModel, system: reviewerSystem(lang, site), user: reviewerUser(d, body, siblings), maxTokens: 6000 });
  let review = null;
  try { review = extractJson(text); } catch { /* counted below */ }
  problems.push(...checkReview(review).map((x) => `kontroll: ${x}`));
  const { meta } = parseDoc(readFileSync(d.path, 'utf8'));
  writeFileSync(d.path, serializeDoc({ ...meta, review_local_fit: review?.local_market_fit ?? null,
    review_notes: String(review?.notes || '').slice(0, 300), reviewed_at: new Date().toISOString() }, body));
  console.log(`${problems.length ? 'FEIL' : 'OK  '} ${relative(ROOT, d.path)} (lokal tilpasning ${review?.local_market_fit ?? '?'}/5)${problems.length ? `\n  - ${problems.join('\n  - ')}` : ''}`);
  if (problems.length) failed += 1;
}
process.exit(failed ? 1 : 0);
