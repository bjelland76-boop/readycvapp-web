// Draft/article files: a front matter block of `key: <JSON value>` lines,
// then the Markdown body. JSON values keep quotes, colons and non-Latin
// text safe; plain unquoted values (e.g. `approved: true` typed by hand)
// are read too.

export function parseDoc(text) {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text.replace(/\r\n/g, '\n'));
  if (!m) throw new Error('mangler front matter (--- ... ---)');
  const meta = {};
  for (const line of m[1].split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const i = line.indexOf(':');
    if (i < 0) throw new Error(`ugyldig linje i front matter: ${line}`);
    const key = line.slice(0, i).trim();
    const raw = line.slice(i + 1).trim();
    try {
      meta[key] = JSON.parse(raw);
    } catch {
      meta[key] = raw;
    }
  }
  return { meta, body: m[2].replace(/^\n+/, '') };
}

export function serializeDoc(meta, body) {
  const lines = Object.entries(meta).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `---\n${lines.join('\n')}\n---\n\n${body.trim()}\n`;
}
