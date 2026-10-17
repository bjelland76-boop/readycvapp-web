#!/usr/bin/env node
// Rebuilds /<lang>/ article pages, language hubs and sitemap.xml from
// content/published/. Run after editing a published article or after
// turning a language on/off in content/languages.json.
import { buildSite } from './lib/site.mjs';

try {
  buildSite();
} catch (e) {
  console.error(`[build] ${e.message}`);
  process.exit(1);
}
