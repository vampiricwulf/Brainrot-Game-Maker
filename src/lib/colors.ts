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

/** Black or white, whichever reads better on the given background. */
export function textOn(bg: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(bg.trim());
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#000' : '#fff';
}
