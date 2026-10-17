// Shared by publish-drafts, refresh-drafts and check-drafts: normalising
// a draft (UTM tags, app box marker) and the checks that need no API call.
import { PUBLISHED } from './config.mjs';
import { insertCtaMarker, withAppUtm } from './links.mjs';
import { runChecks } from './quality.mjs';
import { readArticles } from './site.mjs';
import { articlePath } from './config.mjs';

export function normalize(body, site, slug) {
  return withAppUtm(insertCtaMarker(body), site, slug);
}

// Everything except the duplicate check against itself and the model review.
export function offlineCheck(doc, lang, site) {
  const published = readArticles(PUBLISHED, [lang.code]).filter((a) => a.slug !== doc.slug);
  const internalPaths = published.map((a) => articlePath(a.lang, a.slug));
  return runChecks({
    meta: { ...doc, slug: doc.slug },
    body: doc.body,
    lang,
    linkContext: {
      appUrl: site.appUrl,
      siteUrl: site.siteUrl,
      internalPaths,
      portals: lang.portals,
      // Published articles may link articles published after them; only a
      // NEW article must link an existing one, and generate.mjs checks that.
      requireInternal: false,
    },
    corpus: [],
  });
}
