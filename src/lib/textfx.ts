// How a slide's text box draws its effects and its typewriter entrance (TextBox.svelte).
import type { TextEl } from './model';

/**
 * How far a text box's outline, drop shadow and glow reach past the letters (px). The box keeps that much room
 * inside its edges, so shrink-to-fit leaves space for them and they're never cut off at the box's border.
 */
export function textBleed(el: Pick<TextEl, 'stroke' | 'shadow' | 'glow'>): number {
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const stroke = el.stroke ? Math.max(0, n(el.stroke.width)) / 2 : 0;
  const shadow = el.shadow ? Math.max(Math.abs(n(el.shadow.x)), Math.abs(n(el.shadow.y))) + Math.max(0, n(el.shadow.blur)) : 0;
  // The glow is two shadows, the wider one blurred by twice its size.
  const glow = el.glow ? Math.max(0, n(el.glow.blur)) * 2 : 0;
  return Math.ceil(Math.max(stroke, shadow, glow));
}

/** The text split into the characters a typewriter shows one by one (an emoji or accented letter is one). */
export function typewriterChars(text: string): string[] {
  const Seg = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Seg) return [...new Seg(undefined, { granularity: 'grapheme' }).segment(text)].map((s) => s.segment);
  return Array.from(text);
}

/**
 * When each character appears (seconds after the slide): spread evenly over `duration` after `delay`, the first one
 * at once and the last one just as the time is up. Spaces and line breaks count, so the pace stays even.
 */
export function typewriterTimes(count: number, delay: number, duration: number): number[] {
  const d = Math.max(0, Number.isFinite(delay) ? delay : 0);
  const t = Math.max(0, Number.isFinite(duration) ? duration : 0);
  if (count <= 1) return count ? [d] : [];
  return Array.from({ length: count }, (_, i) => +(d + (t * i) / (count - 1)).toFixed(3));
}
