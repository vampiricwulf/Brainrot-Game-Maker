// "＋ Pick any color" on the phone (main.ts, openAny): the sums and words of the page's own color picker, a square
// (more color to the right, darker down) and a hue strip, with a Hex box. The color shows on the player's own buzzer as
// it's moved, and is sent only with OK (or a tap off it). Unit-tested in anycolor.test.ts.
import { hexSoFar, readHex, type Hsv } from '../../src/lib/colormath';

/** What OK (or a tap off the picker) does with a color: sends it, just closes (it's theirs already), or can't (taken). */
export type AnyVerdict = 'send' | 'same' | 'taken';

/** `mine`: the player's color now; `taken`: the other players' (lowercase #rrggbb, as the room sends them). */
export function anyVerdict(hex: string, mine: string, taken: readonly string[]): AnyVerdict {
  const c = hex.toLowerCase();
  if (c === mine.toLowerCase()) return 'same';
  return taken.some((t) => t.toLowerCase() === c) ? 'taken' : 'send';
}

/** A hue (0–360°) in a word. */
export function hueName(h: number): string {
  const d = ((h % 360) + 360) % 360;
  const names: [number, string][] = [
    [15, 'red'],
    [45, 'orange'],
    [70, 'yellow'],
    [160, 'green'],
    [195, 'cyan'],
    [255, 'blue'],
    [290, 'purple'],
    [340, 'pink'],
    [360, 'red'],
  ];
  return names.find(([upto]) => d < upto)?.[1] ?? 'red';
}

/** A color in plain words, for a screen reader ("dark blue", "pale pink", "grey"). */
export function colorWords({ h, s, v }: Hsv): string {
  if (v < 0.15) return 'black';
  if (s < 0.12) return v > 0.9 ? 'white' : v < 0.45 ? 'dark grey' : 'grey';
  const name = hueName(h);
  return v < 0.45 ? `dark ${name}` : s < 0.4 ? `pale ${name}` : name;
}

/** What the square says to a screen reader. */
export const squareText = (c: Hsv): string => `Color ${Math.round(c.s * 100)}%, brightness ${Math.round(c.v * 100)}%`;

/** What the hue strip says to a screen reader. */
export const hueText = (c: Hsv): string => `${hueName(c.h)}, ${Math.round(c.h)}°`;

/**
 * The Hex box as it's typed: `use`, the color to show now (six digits, or any color pasted; three wait for Enter or a
 * tap away, being the start of six too), and whether it's plainly not a color.
 */
export function typedHex(text: string, pasted = false): { use: string | null; bad: boolean } {
  const h = readHex(text);
  const ready = !!h && (pasted || text.replace(/[#\s]/g, '').length === 6);
  return { use: ready ? h : null, bad: !h && !hexSoFar(text) };
}
