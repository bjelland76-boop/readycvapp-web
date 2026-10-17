#!/usr/bin/env node
// Opens every link in drafts and published articles, and every portal in
// content/languages.json, and lists the ones that don't work.
//   npm run check-links
import { relative } from 'node:path';
import { DRAFTS, PUBLISHED, ROOT, loadLanguages, loadSite } from './lib/config.mjs';
import { checkUrls } from './lib/linkcheck.mjs';
import { readArticles } from './lib/site.mjs';
import { externalUrls } from './generate.mjs';

const site = loadSite();
let bad = 0;
for (const a of [...readArticles(DRAFTS), ...readArticles(PUBLISHED)]) {
  const dead = await checkUrls(externalUrls(a.body, site, a.slug));
  console.log(`${dead.length ? 'FEIL' : 'OK  '} ${relative(ROOT, a.path)}${dead.length ? `\n  - ${dead.join('\n  - ')}` : ''}`);
  bad += dead.length;
}
for (const l of loadLanguages()) {
  const dead = await checkUrls(l.portals);
  if (dead.length) { console.log(`FEIL portaler for ${l.code} (content/languages.json)\n  - ${dead.join('\n  - ')}`); bad += dead.length; }
}
console.log(bad ? `\n${bad} lenke(r) virker ikke` : '\nAlle lenker virker');
process.exit(bad ? 1 : 0);
