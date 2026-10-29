// The color picker's sums (ColorPicker.svelte): a color as hue, saturation and brightness (HSV), which the square
// (saturation across, brightness down) and the hue bar show, and the Hex and RGB boxes read and write. The picker keeps
// its HSV while it's open, so moving one thing never nudges another: a grey keeps the hue it had, and a color typed
// in comes back out as the same #rrggbb. Unit-tested in colormath.test.ts.
import { parseHex } from './colors';

/** Hue 0–360 (degrees round the bar), saturation and brightness 0–1. */
export interface Hsv {
  h: number;
  s: number;
  v: number;
}

export type Rgb = [number, number, number];

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function rgbToHex(rgb: Rgb): string {
  return '#' + rgb.map((c) => clamp(Math.round(c), 0, 255).toString(16).padStart(2, '0')).join('');
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * s * clamp(Math.min(k, 4 - k), 0, 1)) * 255);
  };
  return [f(5), f(3), f(1)];
}

export const hsvToHex = (c: Hsv): string => rgbToHex(hsvToRgb(c));

/**
 * A color as HSV. `keep`: what the picker had, for what this color doesn't say: a grey has no hue (the bar stays where
 * it was) and black no saturation either (nor does the square's dot move across).
 */
export function rgbToHsv([r, g, b]: Rgb, keep?: Hsv): Hsv {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const d = max - Math.min(R, G, B);
  let h = keep?.h ?? 0;
  if (d) {
    const sector = max === R ? (G - B) / d : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
    h = (sector * 60 + 360) % 360;
  }
  const s = max ? d / max : (keep?.s ?? 0);
  return { h, s, v: max };
}

/** A #rgb or #rrggbb color (with or without #) as HSV (see rgbToHsv), or null when it isn't one. */
export function hexToHsv(hex: string, keep?: Hsv): Hsv | null {
  const rgb = parseHex(hex);
  return rgb ? rgbToHsv(rgb, keep) : null;
}

/** What's typed or pasted in the Hex box as "#rrggbb": 3 or 6 digits, with or without #, any case. Null if it's not. */
export function readHex(text: string): string | null {
  const rgb = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(text.trim()) ? parseHex(text) : null;
  return rgb && rgbToHex(rgb);
}

/** The Hex box half typed ("#1f", "#1f2a"): not a color yet, but not a mistake either while it's being typed. */
export const hexSoFar = (text: string): boolean => /^#?[0-9a-f]{0,6}$/i.test(text.trim());

/** What's typed in an R, G or B box: a whole number 0–255, or null if it's not. */
export function readChannel(text: string): number | null {
  const t = text.trim();
  return /^\d{1,3}$/.test(t) && +t <= 255 ? +t : null;
}

/** Where the square's dot is for a color: x across (saturation), y down (0 bright … 1 black), both 0–1. */
export const squareAt = (c: Hsv): { x: number; y: number } => ({ x: c.s, y: 1 - c.v });

/** The color at a place on the square (kept to it), with the hue it has. */
export const fromSquare = (c: Hsv, x: number, y: number): Hsv => ({ h: c.h, s: clamp(x, 0, 1), v: 1 - clamp(y, 0, 1) });

/** Where the hue bar's handle is for a color, 0 (left) – 1 (right). */
export const barAt = (c: Hsv): number => c.h / 360;

/** The color at a place on the hue bar (kept to it). */
export const fromBar = (c: Hsv, x: number): Hsv => ({ ...c, h: clamp(x, 0, 1) * 360 });

/**
 * An arrow key on the square or the hue bar: the color one step on (1% of the square, 1° of hue; ten with Shift), or
 * null for another key. Up is brighter.
 */
export function nudge(c: Hsv, on: 'square' | 'bar', key: string, big: boolean): Hsv | null {
  const n = big ? 10 : 1;
  const dx = key === 'ArrowRight' ? n : key === 'ArrowLeft' ? -n : 0;
  const dy = key === 'ArrowDown' ? n : key === 'ArrowUp' ? -n : 0;
  if (!dx && !dy) return null;
  if (on === 'bar') return { ...c, h: clamp(c.h + (dx || -dy), 0, 360) };
  return { h: c.h, s: clamp(c.s + dx / 100, 0, 1), v: clamp(c.v - dy / 100, 0, 1) };
}
