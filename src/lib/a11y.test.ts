// Lint over every component: a button showing only an icon (◀ ✕ 🗑 ⌨…) needs an aria-label, or a screen reader
// names it by its glyph ("black left-pointing triangle"). A title alone isn't a name every screen reader reads.
import { describe, expect, it } from 'vitest';

/** Every component's source, by its path. */
const sources = import.meta.glob<string>('/src/**/*.svelte', { query: '?raw', import: 'default', eager: true });

/** Each <button …>…</button> in a component: its attributes and its contents (braces in attributes skipped over). */
function buttons(src: string): { attrs: string; body: string; line: number }[] {
  const out: { attrs: string; body: string; line: number }[] = [];
  for (let at = src.indexOf('<button'); at >= 0; at = src.indexOf('<button', at + 1)) {
    if (!/[\s>]/.test(src[at + 7])) continue;
    let i = at + 7;
    let depth = 0;
    let quote = '';
    for (; i < src.length; i++) {
      const c = src[i];
      if (quote) {
        if (c === quote) quote = '';
      } else if (depth > 0 && (c === "'" || c === '"' || c === '`')) quote = c;
      else if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
    }
    const end = src.indexOf('</button', i);
    if (end < 0) continue;
    out.push({ attrs: src.slice(at + 7, i), body: src.slice(i + 1, end), line: src.slice(0, at).split('\n').length });
  }
  return out;
}

/** What a button shows as text: tags dropped, and for {…} expressions the strings they can show. */
function shownText(body: string): string {
  const noTags = body.replace(/<[^>]*>/g, ' ');
  return noTags.replace(/\{[^}]*\}/g, (expr) => {
    const strings = [...expr.matchAll(/'([^']*)'|"([^"]*)"|`([^`]*)`/g)].map((m) => m[1] ?? m[2] ?? m[3]);
    // An expression with no strings in it (a name, a number): text.
    return strings.length ? strings.join(' ') : 'x';
  });
}

describe('icon-only buttons', () => {
  it('all have an aria-label', () => {
    const bad: string[] = [];
    expect(Object.keys(sources).length).toBeGreaterThan(100);
    for (const [f, src] of Object.entries(sources)) {
      for (const b of buttons(src)) {
        if (/aria-label(ledby)?=/.test(b.attrs) || /\{\.\.\./.test(b.attrs)) continue;
        if (/[\p{L}\p{N}]/u.test(shownText(b.body))) continue;
        bad.push(`${f}:${b.line} ${b.body.trim().slice(0, 40)}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('text size', () => {
  it('is 12px or more everywhere (the app’s smallest text: hints, badges, small buttons)', () => {
    const tiny = Object.entries(sources).flatMap(([f, src]) =>
      // A glyph sized down on purpose says so: `/* glyph … */`.
      [...src.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px;(?!\s*\/\* glyph)/g)].filter((m) => +m[1] < 12).map((m) => `${f}: ${m[0]}`),
    );
    expect(tiny).toEqual([]);
  });
});
