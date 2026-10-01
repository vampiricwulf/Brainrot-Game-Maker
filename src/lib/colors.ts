// Distinct, stream-readable player colors (spec §5.1: colors must be unique).
export const PLAYER_PALETTE = [
  '#e6194b', // red
  '#3cb44b', // green
  '#ffe119', // yellow
  '#4363d8', // blue
  '#f58231', // orange
  '#911eb4', // purple
  '#42d4f4', // cyan
  '#f032e6', // magenta
  '#bfef45', // lime
  '#fabed4', // pink
  '#469990', // teal
  '#9a6324', // brown
];

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
