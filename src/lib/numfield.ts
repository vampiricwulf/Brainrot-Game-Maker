// Number fields in the slide editor's Inspector (size, position, effects…): a field left empty or holding
// something that isn't a number never saves null or NaN into the slide. It keeps the last good value, and a
// number outside the field's range is pulled back into it.

/** Clamp `n` into [min, max] (either bound may be missing). */
export function clampTo(n: number, min?: number, max?: number): number {
  if (min !== undefined && n < min) return min;
  if (max !== undefined && n > max) return max;
  return n;
}

/**
 * The value a number field keeps when it's left (blur, Enter): what was typed, clamped into range, or `last` (the
 * value before) when it's empty or not a number. A `last` that isn't a number either gives `fallback`.
 */
export function numberFieldValue(raw: string, last: unknown, min?: number, max?: number, fallback = 0): number {
  const keep = typeof last === 'number' && Number.isFinite(last) ? last : fallback;
  const n = raw.trim() === '' ? NaN : Number(raw);
  return clampTo(Number.isFinite(n) ? n : keep, min, max);
}

/**
 * While typing: the number to use at once, or null to wait (empty, not a number, or out of range — typing "1" on
 * the way to "100" mustn't jump to the minimum).
 */
export function liveNumber(raw: string, min?: number, max?: number): number | null {
  const n = raw.trim() === '' ? NaN : Number(raw);
  if (!Number.isFinite(n)) return null;
  return clampTo(n, min, max) === n ? n : null;
}
