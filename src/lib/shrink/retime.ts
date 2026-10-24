// After ✎ Edit trims or crops a file (card-files spec §4.11.5): the slide items that play it keep playing the same
// moments (their Start at and Stop at move with the trim), and a video's box takes the picture's new shape when it
// had the old one. Every item anywhere in the game is found by walking it, as moveMediaRefs does, so there's no list
// of places to keep up to date. Pure, so it's unit-tested.
import { fitAspect } from '../editing';
import { SLIDE_H, SLIDE_W, type AudioEl, type Game, type Id, type VideoEl } from '../model';
import { allSlides } from '../usage';

/** The part of a file an edit kept: from and to (seconds on the old file's timeline), and the old file's length. */
export interface Cut {
  from: number;
  to: number;
  length: number;
}

/** (Less than this either way isn't a Start at or a Stop at worth keeping.) */
const SLACK = 0.05;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Every video and sound item in `node` that plays file `id` (or only `only`). */
function itemsOn(node: unknown, id: Id, only: VideoEl | AudioEl | undefined, out: (VideoEl | AudioEl)[] = []): (VideoEl | AudioEl)[] {
  if (!node || typeof node !== 'object') return out;
  const o = node as Record<string, unknown>;
  if ((o.kind === 'video' || o.kind === 'audio') && o.media === id && (!only || (o as unknown) === only || o.id === only.id)) out.push(o as unknown as VideoEl | AudioEl);
  for (const v of Object.values(o)) if (v && typeof v === 'object') itemsOn(v, id, only, out);
  return out;
}

/** Where an item plays from and to: a Start at of 0 or less is none, and a Stop at that isn't after it is none too. */
function span(el: Pick<VideoEl, 'startAt' | 'endAt'>, length: number): { s: number; e: number; stops: boolean } {
  const s = el.startAt !== undefined && el.startAt > 0 ? el.startAt : 0;
  const stops = el.endAt !== undefined && el.endAt > s;
  return { s, e: stops ? el.endAt! : length, stops };
}

/** An item with a Start at or a Stop at of its own (one with neither plays the whole file, trimmed or not). */
const timedEl = (el: Pick<VideoEl, 'startAt' | 'endAt'>): boolean => (el.startAt ?? 0) > 0 || el.endAt !== undefined;

/**
 * Inside a step: every item playing file `id` (now the trimmed one), or only `only`, plays the same moments of it:
 * its times move back by the part cut off the start, and a Stop at past the new end goes. One that played only a
 * part that was cut out loses its times (it plays the whole trimmed file). Returns how many kept their part
 * (`kept`: one with no times of its own too), lost some of it (`clipped`), or play the whole file now (`whole`).
 */
export function retimeUses(game: Game, id: Id, cut: Cut, only?: VideoEl | AudioEl): { kept: number; clipped: number; whole: number } {
  const n = { kept: 0, clipped: 0, whole: 0 };
  for (const el of itemsOn(game, id, only)) {
    const timed = timedEl(el);
    const { s, e, stops } = span(el, cut.length);
    if (e <= cut.from || s >= cut.to) {
      delete el.startAt;
      delete el.endAt;
      n.whole++;
      continue;
    }
    const s2 = Math.max(0, s - cut.from);
    if (s2 > SLACK) el.startAt = round2(s2);
    else delete el.startAt;
    if (stops && e < cut.to - SLACK) el.endAt = round2(Math.min(e, cut.to) - cut.from);
    else delete el.endAt;
    if (timed && (s < cut.from || e > cut.to)) n.clipped++;
    else n.kept++;
  }
  return n;
}

/**
 * The slide items playing file `id`, with times of their own, that the cut takes part of what they play from: they
 * play from before it, or on past it. Where they are, what they play (on the old file's timeline), and what of that
 * they'll play.
 */
export function cutClips(game: Game, id: Id, cut: Cut): { where: string; start: number; end: number; from: number; to: number }[] {
  const out: { where: string; start: number; end: number; from: number; to: number }[] = [];
  for (const { slide, where } of allSlides(game, { empty: true }))
    for (const el of slide.elements) {
      if ((el.kind !== 'video' && el.kind !== 'audio') || el.media !== id || !timedEl(el)) continue;
      const { s, e } = span(el, cut.length);
      if (e <= cut.from || s >= cut.to || (s >= cut.from && e <= cut.to)) continue;
      out.push({ where, start: s, end: e, from: Math.max(s, cut.from), to: Math.min(e, cut.to) });
    }
  return out;
}

/**
 * The slide items playing file `id` that play only a part `cut` leaves out (they'll play the whole trimmed file):
 * where they are (as 🖼 Media says), and what they play now.
 */
export function cutLeavesOut(game: Game, id: Id, cut: Cut): { where: string; start: number; end: number }[] {
  const out: { where: string; start: number; end: number }[] = [];
  for (const { slide, where } of allSlides(game, { empty: true }))
    for (const el of slide.elements) {
      if ((el.kind !== 'video' && el.kind !== 'audio') || el.media !== id) continue;
      const { s, e } = span(el, cut.length);
      if (e <= cut.from || s >= cut.to) out.push({ where, start: s, end: e });
    }
  return out;
}

/** The video and sound items playing file `id` with a Start at or a Stop at (the dialog says they move with a trim). */
export function timedItems(game: Game, id: Id): number {
  return itemsOn(game, id, undefined).filter(timedEl).length;
}

/** Every video and sound item playing file `id` (slides of every kind, 🤫 cards, RPG looks, board spaces' slides…). */
export const itemsPlaying = (game: Game, id: Id): (VideoEl | AudioEl)[] => itemsOn(game, id, undefined);

/**
 * Inside a step: each video box playing file `id` (or only `only`) whose shape was the picture's old one (`was`,
 * width ÷ height, within 2%) takes its new one (`now`), about as big and where it was, whatever its fit: a box that
 * crops or stretches would otherwise undo the crop. Returns how many changed.
 */
export function refitBoxes(game: Game, id: Id, was: number, now: number, only?: VideoEl): number {
  if (!(was > 0) || !(now > 0) || Math.abs(was - now) < 1e-9) return 0;
  let n = 0;
  for (const el of itemsOn(game, id, only)) {
    if (el.kind !== 'video' || !(el.h > 0) || Math.abs(el.w / el.h - was) / was >= 0.02) continue;
    Object.assign(el, fitAspect(el, now, SLIDE_W, SLIDE_H));
    n++;
  }
  return n;
}
