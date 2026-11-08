// A YouTube item set to Sound only (EmbedEl.soundOnly): what viewers see in its place, and its time bar's numbers.

import type { EmbedEl, SoundShows } from './model';
import { fmtTime } from './mediactl.svelte';

/** Whether a slide item is a YouTube video played for its sound only. */
export const isSoundOnly = (el: { kind: string; embedKind?: string; soundOnly?: boolean }): boolean =>
  el.kind === 'embed' && el.embedKind === 'youtube' && !!el.soundOnly;

/** What viewers see in its place (a game from before the choice: the speaker). */
export const soundShows = (el: Pick<EmbedEl, 'soundShows'>): SoundShows =>
  el.soundShows === 'nothing' || el.soundShows === 'time' ? el.soundShows : 'speaker';

/** The words for each choice, as the slide editor offers them. */
export const SOUND_SHOWS: [SoundShows, string][] = [
  ['nothing', 'Nothing'],
  ['speaker', 'A 🔊 speaker'],
  ['time', 'A 🔊 speaker and a time bar (how long it plays)'],
];

/**
 * How far into the part it plays it is (`start` to `end`, see playRange), and how long that part is, in seconds; `frac`
 * from 0 to 1 for the bar. A part with a Plays to is known from the start; with none, it waits for the video's length
 * (`duration` 0: null). Null too when the part is empty. A Plays to past the video's end (once that is known) counts to
 * its end.
 */
export function rangeProgress(time: number, duration: number, start: number, end?: number): { at: number; length: number; frac: number } | null {
  const known = Number.isFinite(duration) && duration > 0;
  const stop = end !== undefined && end > start ? (known ? Math.min(end, duration) : end) : known ? duration : 0;
  const length = stop - start;
  if (!(length > 0)) return null;
  const at = Math.max(0, Math.min(length, (Number.isFinite(time) ? time : 0) - start));
  return { at, length, frac: at / length };
}

/** The time bar's words: "0:12 / 3:30" (how far in, and how long the part it plays is). */
export function timeText(p: { at: number; length: number }): string {
  return `${fmtTime(p.at)} / ${fmtTime(p.length)}`;
}
