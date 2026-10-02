// Distinct, stream-readable player colors (spec §5.1: colors must be unique). The first 8 stay apart for colour-blind
// viewers too (deuteranopia and protanopia, simulated: see colors.test.ts), mostly from the Okabe–Ito set; each takes
// black or white text (textOn) at 4.5:1 or better. Games keep the colors they were saved with.
export const PLAYER_PALETTE = [
  '#e6194b', // red
  '#56b4e9', // sky blue
  '#f0e442', // yellow
  '#4f7cff', // cornflower blue (not navy: that vanished on the Classic blue tiles and the dark score bars)
  '#d55e00', // orange (vermillion)
  '#f2f2f2', // white
  '#009e73', // bluish green
  '#cc79a7', // pink
  '#911eb4', // purple
  '#9a6324', // brown
  '#bfef45', // lime
  '#f032e6', // magenta
];
/** How many of the palette's first colors stay apart for colour-blind viewers. */
export const CVD_SAFE_UPTO = 8;

export function normalizeColor(c: string): string {
  return c.trim().toLowerCase();
}

export function isColorTaken(color: string, used: string[]): boolean {
  const n = normalizeColor(color);
  return used.some((u) => normalizeColor(u) === n);
}

/** First palette color not already used, or a random unused hex if the palette runs out. */
export function nextFreeColor(used: string[]): string {
  const free = PLAYER_PALETTE.find((c) => !isColorTaken(c, used));
  if (free) return free;
  for (;;) {
    const c = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
    if (!isColorTaken(c, used)) return c;
  }
}

/** A #rgb or #rrggbb color as [r, g, b] (0–255), or null for anything else. */
export function parseHex(c: string): [number, number, number] | null {
  let h = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim())?.[1];
  if (!h) return null;
  if (h.length === 3) h = [...h].map((d) => d + d).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Any CSS color a theme may hold as #rrggbb (its alpha left off), for a color box or a contrast check: #rgb(a),
 * #rrggbb(aa), rgb()/rgba() with plain numbers or percentages, or a color name (in a browser). Null when it isn't one.
 */
export function toHex(c: string | undefined): string | null {
  if (!c) return null;
  const s = c.trim();
  const short = /^#([0-9a-f]{3})[0-9a-f]?$/i.exec(s)?.[1];
  if (short) return '#' + [...short].map((d) => d + d).join('').toLowerCase();
  const long = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(s)?.[1];
  if (long) return '#' + long.toLowerCase();
  const rgb = /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/i.exec(s);
  if (rgb) {
    const ch = (v: string) => Math.max(0, Math.min(255, Math.round(v.endsWith('%') ? (parseFloat(v) * 255) / 100 : parseFloat(v))));
    return '#' + rgb.slice(1, 4).map((v) => ch(v).toString(16).padStart(2, '0')).join('');
  }
  // A name (or hsl()): as the browser reads it.
  if (typeof document === 'undefined' || !/^[a-z]{3,24}$|^hsla?\(/i.test(s)) return null;
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#010203';
    ctx.fillStyle = s;
    const out = String(ctx.fillStyle);
    // (Not a color: the fill stays as it was.)
    if (out === '#010203' && s.toLowerCase() !== '#010203') return null;
    return out.startsWith('#') ? out : toHex(out);
  } catch {
    return null;
  }
}

/** WCAG relative luminance (0 black … 1 white). */
export function luminance(c: string): number {
  const rgb = parseHex(c);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colors (1 … 21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Black or white, whichever has more contrast on the given background. */
export function textOn(bg: string): string {
  if (!parseHex(bg)) return '#fff';
  return contrast(bg, '#000') > contrast(bg, '#fff') ? '#000' : '#fff';
}

/** `a` mixed with `b` (`amount` of b, 0 … 1) as #rrggbb; `a` itself when either isn't a #hex color. */
export function mixHex(a: string, b: string, amount: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  if (!x || !y) return a;
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * amount).toString(16).padStart(2, '0')).join('');
}

/** Colour vision as simulated (Machado et al. 2009, full strength), in linear RGB. */
export type Vision = 'normal' | 'deutan' | 'protan';
const CVD: Record<Exclude<Vision, 'normal'>, number[][]> = {
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
};

const toLinear = (v: number) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** A color in CIE L*a*b* (D65) as someone with this vision sees it (unreadable colors: black). */
export function labOf(c: string, vision: Vision = 'normal'): [number, number, number] {
  let rgb = (parseHex(c) ?? [0, 0, 0]).map(toLinear);
  if (vision !== 'normal') {
    const lin = rgb;
    rgb = CVD[vision].map((row) => Math.max(0, Math.min(1, row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2])));
  }
  const [r, g, b] = rgb;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** How far apart two colors look (CIE76 ΔE: about 2 is just noticeable, 15 and more clearly different), for this vision. */
export function colorDistance(a: string, b: string, vision: Vision = 'normal'): number {
  const p = labOf(a, vision);
  const q = labOf(b, vision);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/**
 * A player color a chroma key would take out: close in hue to the key color and colorful enough (OBS keys by hue and
 * saturation more than brightness, so a dark green goes too).
 */
export function nearKey(color: string, key: string): boolean {
  const c = labOf(color);
  const k = labOf(key);
  if (!parseHex(color) || Math.hypot(c[1], c[2]) < 25) return false;
  const hue = (l: number[]) => (Math.atan2(l[2], l[1]) * 180) / Math.PI;
  const d = Math.abs(hue(c) - hue(k));
  return Math.min(d, 360 - d) < 30;
}
