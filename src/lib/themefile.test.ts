import { describe, expect, it } from 'vitest';
import { presetTheme, type Theme } from './theme';
import {
  CODE_PREFIX,
  findCode,
  KNOWN_KEYS,
  MAX_EMBED,
  parseThemeCode,
  parseThemeFile,
  PLAIN_PREFIX,
  sanitizeTheme,
  THEME_FORMAT,
  themeCode,
  themeFileText,
  ThemeError,
} from './themefile';
import { renameThemeFiles, withShared } from './themeapply';

const fancy: Theme = {
  ...presetTheme('neon'),
  tilePattern: 'checker',
  tile2: '#2a0050',
  tileGradient: '#000000',
  tileAngle: 135,
  tileBorder: '#ff00e6',
  tileBorderWidth: 5,
  tileRadius: 16,
  glowSize: 30,
  tileShadow: true,
  valueShadow: 'soft',
  usedLook: 'dim',
  tileGap: 14,
  headerBg: '#330066',
  header2: '#440088',
  headerGradient: '#110022',
  headerLine: 'none',
  plateShape: 'pill',
  leaderGlow: true,
  bgGradient: '#220044',
  bgAngle: 90,
  clueFont: "'Bangers', cursive",
  clueColor: '#ffee00',
  stageBg: 'green',
  scoreBar: 'top',
};

const b64 = (s: string | Uint8Array) =>
  btoa(String.fromCharCode(...(typeof s === 'string' ? new TextEncoder().encode(s) : s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const deflateRaw = async (s: string) =>
  new Uint8Array(await new Response(new Blob([s]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());

describe('theme codes', () => {
  it('round-trip every look, compressed, and stay short', async () => {
    const code = await themeCode('Neon party', fancy);
    expect(code.startsWith(CODE_PREFIX)).toBe(true);
    expect(code.length).toBeLessThan(700);
    const back = await parseThemeCode(code);
    expect(back.name).toBe('Neon party');
    expect(back.theme).toEqual(fancy);
    expect(back.media).toEqual([]);
  });

  it('leave pictures out', async () => {
    const back = await parseThemeCode(await themeCode('Pics', { ...fancy, boardImage: 'img1', banner: 'ban1' }));
    expect(back.theme.boardImage).toBeUndefined();
    expect(back.theme.banner).toBeUndefined();
  });

  it('are found in a pasted message, split over lines', async () => {
    const code = await themeCode('X', presetTheme('pastel'));
    const pasted = `here's my theme:\n${code.slice(0, 20)}\n${code.slice(20)}  thanks!`;
    expect(findCode(pasted)?.body).toBe(code.slice(CODE_PREFIX.length));
    expect((await parseThemeCode(pasted)).theme.tile).toBe(presetTheme('pastel').tile);
  });

  it('stop at words on the line after them', async () => {
    const code = await themeCode('X', presetTheme('pastel'));
    expect((await parseThemeCode(`${code}\nhave fun`)).theme.tile).toBe(presetTheme('pastel').tile);
    expect((await parseThemeCode(`${code.slice(0, 30)}\n${code.slice(30)}\nthanks`)).theme.tile).toBe(presetTheme('pastel').tile);
  });

  it('a plain (uncompressed) code reads too', async () => {
    const json = JSON.stringify({ format: THEME_FORMAT, version: 1, name: 'Plain', theme: presetTheme('dark') });
    const back = await parseThemeCode(PLAIN_PREFIX + b64(json));
    expect(back).toMatchObject({ name: 'Plain', theme: { tile: presetTheme('dark').tile } });
  });

  it('a bad code says what’s wrong', async () => {
    await expect(parseThemeCode('hello')).rejects.toThrow(/starts with “BRT1:”/);
    await expect(parseThemeCode('BRT1:AAAA')).rejects.toThrow(ThemeError);
    const code = await themeCode('Cut', fancy);
    await expect(parseThemeCode(code.slice(0, code.length / 2))).rejects.toThrow(/damaged or cut off/);
    const notTheme = CODE_PREFIX + b64(await deflateRaw(JSON.stringify({ hello: 1 })));
    await expect(parseThemeCode(notTheme)).rejects.toThrow(/isn’t a Brainrot theme code/);
    const newer = CODE_PREFIX + b64(await deflateRaw(JSON.stringify({ format: THEME_FORMAT, version: 99, theme: presetTheme('dark') })));
    await expect(parseThemeCode(newer)).rejects.toThrow(/newer version/);
  });
});

describe('theme files', () => {
  const png = new Blob([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], { type: 'image/png' });
  const font = new Blob([new Uint8Array([0, 1, 0, 0, 9])], { type: 'font/ttf' });
  const img = { ref: { id: 'img00001', name: 'bg.png', mime: 'image/png', size: png.size, kind: 'image' as const }, blob: png };
  const ttf = { ref: { id: 'fnt00001', name: 'Comic.ttf', mime: 'font/ttf', size: font.size, kind: 'font' as const }, blob: font };

  it('carry their pictures and uploaded fonts', async () => {
    const theme = { ...fancy, boardImage: 'img00001', boardFont: "'jb-fnt00001', sans-serif" };
    const { text, leftOut } = await themeFileText('With pics', theme, [img, ttf]);
    expect(leftOut).toEqual([]);
    const data = JSON.parse(text);
    expect(data).toMatchObject({ format: 'brainrot-theme', version: 1, name: 'With pics' });
    const back = parseThemeFile(text);
    expect(back.theme).toEqual(theme);
    expect(back.media.map((m) => m.ref.id)).toEqual(['fnt00001', 'img00001']);
    expect(new Uint8Array(await back.media[1].blob.arrayBuffer())).toEqual(new Uint8Array(await png.arrayBuffer()));
  });

  it('leave out files past the size limit (and the picture with them), and say so', async () => {
    const big = { ref: { ...img.ref, size: MAX_EMBED + 1 }, blob: new Blob([new Uint8Array(MAX_EMBED + 1)], { type: 'image/png' }) };
    const { text, leftOut } = await themeFileText('Big', { ...fancy, boardImage: 'img00001' }, [big, ttf]);
    expect(leftOut).toEqual(['bg.png']);
    const back = parseThemeFile(text);
    expect(back.theme.boardImage).toBeUndefined();
    expect(back.leftOut).toEqual(['bg.png']);
    expect(back.media.map((m) => m.ref.name)).toEqual(['Comic.ttf']);
  });

  it('refuse what isn’t a theme, with a clear message', () => {
    expect(() => parseThemeFile('{oops')).toThrow(/cut off or damaged/);
    expect(() => parseThemeFile('[]')).toThrow(/isn’t a Brainrot theme/);
    expect(() => parseThemeFile(JSON.stringify({ version: 2, rounds: [], players: [] }))).toThrow(/This is a game, not a theme/);
    expect(() => parseThemeFile(JSON.stringify({ format: THEME_FORMAT, version: 1, theme: { tile: 'url(x)' } }))).toThrow(/no colors/);
    expect(() => parseThemeFile(JSON.stringify({ format: THEME_FORMAT, version: 7, theme: presetTheme('dark') }))).toThrow(/newer version/);
  });

  it('tolerate old and unknown fields, and drop bad media', () => {
    const text = JSON.stringify({
      format: THEME_FORMAT,
      // (No version: the first.)
      name: 42,
      future: { stuff: true },
      theme: { tile: '#123456', sparkle: 'max', boardImage: 'nope' },
      media: [
        { id: '../evil', kind: 'image', mime: 'image/png', data: 'AAAA' },
        { id: 'svg1', kind: 'image', mime: 'image/svg+xml', data: 'AAAA' },
        { id: 'bad64', kind: 'image', mime: 'image/png', data: '!!!' },
        'junk',
      ],
    });
    const back = parseThemeFile(text);
    expect(back.name).toBe('Shared theme');
    expect(back.theme.tile).toBe('#123456');
    expect(back.theme.tileUsed).toBe(presetTheme('classic').tileUsed);
    expect('sparkle' in back.theme).toBe(false);
    expect(back.theme.boardImage).toBeUndefined();
    expect(back.media).toEqual([]);
  });
});

describe('checking a theme from outside', () => {
  it('lets only safe colors, fonts and known settings in', () => {
    const t = sanitizeTheme({
      tile: '#abcdef',
      value: 'red; background: url(http://x)',
      boardText: 'rgb(1, 2, 3)',
      boardFont: "x'; } body { display: none",
      valueFont: "'Anton', Impact, sans-serif",
      tile2: 'hsl(10, 50%, 50%)',
      tilePattern: 'spiral',
      tileRadius: 9999,
      tileGap: -5,
      glow: 'expression(alert(1))',
      leaderGlow: 'yes',
      headerLine: 'none',
      scoreBar: 'left',
    })!;
    expect(t.tile).toBe('#abcdef');
    expect(t.value).toBe(presetTheme('classic').value);
    expect(t.boardText).toBe('rgb(1, 2, 3)');
    expect(t.boardFont).toBe(presetTheme('classic').boardFont);
    expect(t.valueFont).toBe("'Anton', Impact, sans-serif");
    expect(t.tile2).toBe('hsl(10, 50%, 50%)');
    expect(t.tilePattern).toBeUndefined();
    expect([t.tileRadius, t.tileGap]).toEqual([60, 0]);
    expect(t.glow).toBe('none');
    expect(t.leaderGlow).toBeUndefined();
    expect(t.headerLine).toBe('none');
    expect(t.scoreBar).toBe('bottom');
    for (const k of Object.keys(t)) expect(KNOWN_KEYS.has(k)).toBe(true);
    expect(sanitizeTheme({})).toBeNull();
    expect(sanitizeTheme('x')).toBeNull();
  });

  it('a preset theme comes through unchanged', () => {
    for (const p of ['classic', 'dark', 'neon', 'pastel'] as const) expect(sanitizeTheme(presetTheme(p))).toEqual(presetTheme(p));
  });
});

describe('a shared theme in a game', () => {
  it('its pictures and fonts under new ids when this browser has others under theirs', () => {
    const t = { ...fancy, boardImage: 'a', banner: 'b', boardFont: "'jb-fnt00001', sans-serif", clueFont: undefined };
    const out = renameThemeFiles(t, new Map([['a', 'z1'], ['fnt00001', 'new00002']]));
    expect(out).toMatchObject({ boardImage: 'z1', banner: 'b', boardFont: "'jb-new00002', sans-serif" });
  });

  it('brings the pictures it carries; the game keeps its own otherwise', () => {
    const game = { ...presetTheme('classic'), boardImage: 'mine', banner: 'myBanner' };
    const media = [{ id: 'theirs', name: 'x.png', mime: 'image/png', size: 1, kind: 'image' as const }];
    const out = withShared(game, { ...fancy, boardImage: 'theirs' }, media);
    expect(out).toMatchObject({ boardImage: 'theirs', banner: 'myBanner', tilePattern: 'checker' });
    expect(withShared(game, fancy, media).boardImage).toBe('mine');
  });
});
