// Themes to share: a .brainrot-theme file (JSON, with the pictures and uploaded fonts it uses when they're small
// enough), or a short text code (BRT1:…, no pictures or fonts). And checking a theme that came from outside the app:
// only colors, fonts and settings it knows go in (a theme's values end up in styles), anything else is left out.
import type { MediaKind, MediaRef } from './model';
import { EXTRA_LOOKS, isThemeColor, isThemeFont, LOOK_RANGES, PRESETS, presetTheme, type Ranged, type Theme, type ThemePreset } from './theme';

export const THEME_FORMAT = 'brainrot-theme';
/** The theme file format's version: a newer file says to update the app; an older one is read as it is. */
export const THEME_VERSION = 1;
export const THEME_EXT = '.brainrot-theme';
/** What 📂 Import theme… offers to open. */
export const THEME_FILES = `${THEME_EXT},.json,application/json`;
/** A theme file, by its name (Open… and a drop on the editor take one too). */
export const isThemeFile = (name: string) => /\.brainrot-theme$/i.test(name);
/** A code: deflate-compressed JSON, base64url. */
export const CODE_PREFIX = 'BRT1:';
/** A code made where the browser can't compress: plain JSON, base64url. */
export const PLAIN_PREFIX = 'BRT1P:';
/** Most bytes of pictures and fonts a theme file carries (more are left out, and it says which). */
export const MAX_EMBED = 8 * 1024 ** 2;
/** The longest theme file read (characters): its pictures in base64, and room to spare. */
const MAX_FILE_CHARS = 16 * 1024 ** 2;
/** The longest code read, and the most its JSON may unpack to. */
const MAX_CODE_CHARS = 60_000;
const MAX_CODE_JSON = 512 * 1024;

/** A theme that can't be used, with what to tell the host. */
export class ThemeError extends Error {}

/** A picture or uploaded font a shared theme carries. */
export interface ThemeMediaFile {
  ref: MediaRef;
  blob: Blob;
}

/** A theme read from a file or a code. */
export interface SharedTheme {
  name: string;
  theme: Theme;
  /** The pictures and uploaded fonts it carries (a code carries none). */
  media: ThemeMediaFile[];
  /** Files it uses that were too big to go in (their names). */
  leftOut: string[];
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
/** A media id as the app makes them (and nothing that could be more). */
const isMediaId = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,64}$/.test(v);

/** A theme's name: one line, 60 characters at most ('' when there's none). */
export function themeName(v: unknown): string {
  return typeof v === 'string' ? Array.from(v.replace(/\s+/g, ' ').trim()).slice(0, 60).join('') : '';
}

const COLORS = ['tile', 'tileUsed', 'boardGap', 'value', 'boardText', 'scoreBarBg'] as const;
const OPTIONAL_COLORS = ['stageText', 'clueColor', 'tile2', 'tileGradient', 'tileBorder', 'headerBg', 'header2', 'headerGradient', 'bgGradient'] as const;
const NUMBERS = Object.keys(LOOK_RANGES) as Ranged[];
function oneOf<T extends string>(v: unknown, options: readonly T[]): T | undefined {
  return options.includes(v as T) ? (v as T) : undefined;
}

/**
 * A theme from outside (a file, a code, this computer's storage): what it has that the app knows and is safe, on its
 * preset's colors and fonts for anything missing; fields the app doesn't know are left out. Null: it isn't a theme (no
 * tile color).
 */
export function sanitizeTheme(raw: unknown): Theme | null {
  if (!isObj(raw) || !isThemeColor(raw.tile)) return null;
  const preset: ThemePreset = oneOf(raw.preset, Object.keys(PRESETS) as ThemePreset[]) ?? 'classic';
  const base = presetTheme(preset);
  const t: Theme = { ...base };
  // (No text color of its own: it's worked out from the tiles, as for an older game.)
  delete t.stageText;
  for (const k of COLORS) if (isThemeColor(raw[k])) t[k] = raw[k];
  for (const k of OPTIONAL_COLORS) if (isThemeColor(raw[k])) t[k] = raw[k];
  if (raw.glow === 'none' || isThemeColor(raw.glow)) t.glow = raw.glow;
  for (const k of ['boardFont', 'valueFont'] as const) if (isThemeFont(raw[k])) t[k] = raw[k];
  if (isThemeFont(raw.clueFont)) t.clueFont = raw.clueFont;
  t.scoreBar = oneOf(raw.scoreBar, ['bottom', 'top', 'hidden'] as const) ?? base.scoreBar;
  const stageBg = oneOf(raw.stageBg, ['green', 'magenta'] as const);
  if (stageBg) t.stageBg = stageBg;
  if (isMediaId(raw.boardImage)) t.boardImage = raw.boardImage;
  if (isMediaId(raw.banner)) t.banner = raw.banner;
  if (typeof raw.bannerHeight === 'number' && Number.isFinite(raw.bannerHeight)) t.bannerHeight = Math.round(raw.bannerHeight);
  if (raw.bannerFit === 'cover') t.bannerFit = 'cover';
  // The other looks.
  const pattern = oneOf(raw.tilePattern, ['checker', 'rows', 'columns'] as const);
  if (pattern) t.tilePattern = pattern;
  for (const k of NUMBERS) {
    const v = raw[k];
    if (typeof v === 'number' && Number.isFinite(v)) t[k] = Math.min(LOOK_RANGES[k].max, Math.max(LOOK_RANGES[k].min, Math.round(v)));
  }
  if (raw.tileShadow === true) t.tileShadow = true;
  if (raw.leaderGlow === true) t.leaderGlow = true;
  const valueShadow = oneOf(raw.valueShadow, ['soft', 'none'] as const);
  if (valueShadow) t.valueShadow = valueShadow;
  const usedLook = oneOf(raw.usedLook, ['dim', 'hidden'] as const);
  if (usedLook) t.usedLook = usedLook;
  if (raw.headerLine === 'none' || isThemeColor(raw.headerLine)) t.headerLine = raw.headerLine;
  const plate = oneOf(raw.plateShape, ['square', 'pill'] as const);
  if (plate) t.plateShape = plate;
  return t;
}

/** A theme without its unset fields (what's written to a file or a code). */
export function compactTheme(t: Theme): Theme {
  return Object.fromEntries(Object.entries(t).filter(([, v]) => v !== undefined && v !== null)) as unknown as Theme;
}

// ---------- Files ----------

/** Bytes as base64 (in pieces: a big picture would overflow one call). */
function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/**
 * A theme file's text, with the files it uses (`media`: its pictures and uploaded fonts) while they add up to no more
 * than MAX_EMBED; `leftOut`: the names of those that didn't fit.
 */
export async function themeFileText(name: string, theme: Theme, media: readonly ThemeMediaFile[]): Promise<{ text: string; leftOut: string[] }> {
  const files: { id: string; name: string; mime: string; kind: MediaKind; data: string }[] = [];
  const leftOut: string[] = [];
  let total = 0;
  // Smallest first: a big background picture shouldn't keep out a small font.
  for (const m of [...media].sort((a, b) => a.blob.size - b.blob.size)) {
    if (total + m.blob.size > MAX_EMBED) {
      leftOut.push(m.ref.name);
      continue;
    }
    total += m.blob.size;
    files.push({ id: m.ref.id, name: m.ref.name, mime: m.ref.mime, kind: m.ref.kind, data: toBase64(new Uint8Array(await m.blob.arrayBuffer())) });
  }
  const t = compactTheme({ ...theme });
  // A picture that isn't in the file isn't the theme's.
  if (t.boardImage && !files.some((f) => f.id === t.boardImage)) delete t.boardImage;
  if (t.banner && !files.some((f) => f.id === t.banner)) delete t.banner;
  const file = { format: THEME_FORMAT, version: THEME_VERSION, app: 'Brainrot Games Maker', name: themeName(name) || 'My theme', theme: t, media: files, ...(leftOut.length ? { leftOut } : {}) };
  return { text: JSON.stringify(file, null, 1), leftOut };
}

const IMAGE_MIME = /^image\/(png|jpeg|gif|webp|avif|bmp)$/;
const FONT_MIME = /^(font\/[\w.+-]+|application\/(font-[\w.+-]+|x-font-[\w.+-]+|vnd\.ms-fontobject|octet-stream))$/;

/** What a parsed theme file or code (JSON) holds, checked. Throws a ThemeError saying what's wrong. */
function sharedTheme(data: unknown, from: 'file' | 'code'): SharedTheme {
  if (!isObj(data)) throw new ThemeError(from === 'file' ? 'This file isn’t a Brainrot theme.' : 'That code isn’t a Brainrot theme code.');
  if (data.format !== THEME_FORMAT) {
    if (Array.isArray(data.rounds))
      throw new ThemeError('This is a game, not a theme: open it with Open…, or take its look with “📂 Use a theme from another game…”.');
    throw new ThemeError(from === 'file' ? 'This file isn’t a Brainrot theme.' : 'That code isn’t a Brainrot theme code.');
  }
  const version = typeof data.version === 'number' ? data.version : 1;
  if (version > THEME_VERSION) throw new ThemeError('This theme was made with a newer version of Brainrot Games Maker: update the app to use it.');
  const theme = sanitizeTheme(data.theme);
  if (!theme) throw new ThemeError(`This theme has no colors in it: the ${from} may be damaged.`);
  const media: ThemeMediaFile[] = [];
  if (from === 'file' && Array.isArray(data.media)) {
    let total = 0;
    for (const m of data.media) {
      if (!isObj(m) || !isMediaId(m.id) || typeof m.data !== 'string' || typeof m.mime !== 'string') continue;
      const kind = m.kind === 'image' && IMAGE_MIME.test(m.mime) ? 'image' : m.kind === 'font' && FONT_MIME.test(m.mime) ? 'font' : null;
      if (!kind || media.some((x) => x.ref.id === m.id)) continue;
      let bytes: Uint8Array;
      try {
        bytes = fromBase64(m.data);
      } catch {
        continue;
      }
      total += bytes.length;
      if (total > MAX_EMBED * 2) break;
      const name = themeName(m.name).replace(/[\\/]/g, '-') || (kind === 'font' ? 'font' : 'picture');
      media.push({ ref: { id: m.id, name, mime: m.mime, size: bytes.length, kind }, blob: new Blob([bytes as BlobPart], { type: m.mime }) });
    }
  }
  // Pictures it doesn't carry aren't its own (an id from another game would point at nothing, or at the wrong picture).
  const has = (id: string | undefined) => !!id && media.some((m) => m.ref.id === id && m.ref.kind === 'image');
  if (!has(theme.boardImage)) delete theme.boardImage;
  if (!has(theme.banner)) delete theme.banner;
  const leftOut = Array.isArray(data.leftOut) ? data.leftOut.filter((x): x is string => typeof x === 'string').map(themeName).slice(0, 20) : [];
  return { name: themeName(data.name) || 'Shared theme', theme, media, leftOut };
}

/** A theme file's text, checked (see sharedTheme). */
export function parseThemeFile(text: string): SharedTheme {
  if (text.length > MAX_FILE_CHARS) throw new ThemeError('This file is too big to be a theme.');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ThemeError('This file can’t be read as a theme: it may be cut off or damaged.');
  }
  return sharedTheme(data, 'file');
}

// ---------- Codes ----------

function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  return fromBase64(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
}

/** Bytes through a (de)compression stream, or null where there's none (or it fails). At most `max` bytes out. */
async function squeeze(bytes: Uint8Array, how: 'compress' | 'decompress', max = Infinity): Promise<Uint8Array | null> {
  const Stream = how === 'compress' ? globalThis.CompressionStream : globalThis.DecompressionStream;
  if (typeof Stream === 'undefined') return null;
  try {
    const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(new Stream('deflate-raw')).getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) {
        await reader.cancel();
        return null;
      }
      parts.push(value);
    }
    const out = new Uint8Array(size);
    let at = 0;
    for (const p of parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  } catch {
    return null;
  }
}

/** A theme as a code to paste (no pictures, no fonts' files: a code stays short). */
export async function themeCode(name: string, theme: Theme): Promise<string> {
  const { boardImage: _b, banner: _n, ...rest } = compactTheme(theme);
  const json = new TextEncoder().encode(JSON.stringify({ format: THEME_FORMAT, version: THEME_VERSION, name: themeName(name) || 'My theme', theme: rest }));
  const packed = await squeeze(json, 'compress');
  return packed ? CODE_PREFIX + toBase64Url(packed) : PLAIN_PREFIX + toBase64Url(json);
}

/** Is there a theme code in this text (it may have words around it, or be split over lines)? */
export function findCode(text: string): { plain: boolean; body: string } | null {
  const m = /BRT1(P?):\s*([A-Za-z0-9_\-\r\n]+)/.exec(text);
  return m ? { plain: m[1] === 'P', body: m[2].replace(/\s+/g, '') } : null;
}

/** A pasted theme code, checked. Throws a ThemeError saying what's wrong. */
export async function parseThemeCode(text: string): Promise<SharedTheme> {
  const code = findCode(text);
  if (!code || !code.body) throw new ThemeError('That isn’t a theme code: a theme code starts with “BRT1:”.');
  if (code.body.length > MAX_CODE_CHARS) throw new ThemeError('That code is too long to be a theme code.');
  let bytes: Uint8Array | null;
  try {
    bytes = fromBase64Url(code.body);
  } catch {
    throw new ThemeError('That theme code is damaged: copy it again, all of it.');
  }
  if (!code.plain) {
    if (typeof globalThis.DecompressionStream === 'undefined') throw new ThemeError('This browser can’t read theme codes: use a theme file instead.');
    bytes = await squeeze(bytes, 'decompress', MAX_CODE_JSON);
    if (!bytes) throw new ThemeError('That theme code is damaged or cut off: copy it again, all of it.');
  }
  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ThemeError('That theme code is damaged or cut off: copy it again, all of it.');
  }
  return sharedTheme(data, 'code');
}

/** The looks a code or file has that the app knows (for tests: nothing else gets through). */
export const KNOWN_KEYS = new Set<string>([
  'preset',
  ...COLORS,
  ...OPTIONAL_COLORS,
  'glow',
  'boardFont',
  'valueFont',
  'clueFont',
  'scoreBar',
  'stageBg',
  'boardImage',
  'banner',
  'bannerHeight',
  'bannerFit',
  ...EXTRA_LOOKS,
]);
