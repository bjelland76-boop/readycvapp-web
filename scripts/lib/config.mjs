// Shared configuration: content/languages.json, content/site.json and
// content/topics.json, with defaults and environment overrides.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = process.env.CONTENT_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CONTENT = join(ROOT, 'content');
export const DRAFTS = join(CONTENT, 'drafts');
export const PUBLISHED = join(CONTENT, 'published');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}

// English UI is the fallback for a language added with only code + name.
const FALLBACK_UI_LANG = 'en';

export function loadLanguages() {
  const { languages } = readJson(join(CONTENT, 'languages.json'));
  const fallback = languages.find((l) => l.code === FALLBACK_UI_LANG)?.ui || {};
  return languages.map((l) => ({
    englishName: l.name,
    htmlLang: l.code,
    hreflang: l.code,
    ogLocale: l.code,
    market: '',
    marketNotes: '',
    portals: [],
    wordMin: 800,
    wordMax: 1500,
    enabled: false,
    ...l,
    ui: { ...fallback, ...(l.ui || {}) },
  }));
}

function envInt(name, fallback) {
  const raw = (process.env[name] || '').trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${name}=${raw} må være et heltall >= 0`);
  return n;
}

export function envBool(name, fallback = false) {
  const raw = (process.env[name] || '').trim().toLowerCase();
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'ja', 'on'].includes(raw);
}

export function loadSite() {
  const s = readJson(join(CONTENT, 'site.json'));
  return {
    ...s,
    siteUrl: (process.env.SITE_URL || s.siteUrl).replace(/\/+$/, ''),
    maxArticlesPerLanguagePerWeek: envInt('MAX_ARTICLES_PER_LANGUAGE_PER_WEEK', s.maxArticlesPerLanguagePerWeek),
    maxArticlesPerRun: envInt('MAX_ARTICLES_PER_RUN', s.maxArticlesPerRun),
    maxActiveLanguages: envInt('MAX_ACTIVE_LANGUAGES', s.maxActiveLanguages),
    maxAttemptsPerTopic: envInt('MAX_ATTEMPTS_PER_TOPIC', s.maxAttemptsPerTopic),
    model: process.env.CONTENT_MODEL || s.model,
    reviewModel: process.env.CONTENT_REVIEW_MODEL || s.reviewModel || s.model,
  };
}

// Enabled languages, capped at maxActiveLanguages (in file order).
export function activeLanguages(languages, site) {
  const enabled = languages.filter((l) => l.enabled);
  if (enabled.length > site.maxActiveLanguages) {
    console.warn(`[config] ${enabled.length} språk er enabled, men maxActiveLanguages=${site.maxActiveLanguages}: `
      + `bruker ${enabled.slice(0, site.maxActiveLanguages).map((l) => l.code).join(', ')}`);
  }
  return enabled.slice(0, site.maxActiveLanguages);
}

export function loadTopics() {
  return readJson(join(CONTENT, 'topics.json'));
}

export function saveTopics(data) {
  writeJson(join(CONTENT, 'topics.json'), data);
}

export function articlePath(lang, slug) {
  return `/${lang}/${slug}/`;
}
