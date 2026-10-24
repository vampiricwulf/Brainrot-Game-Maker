// Whether each video and sound stored in the game really plays in this browser (card-files spec §4.12.3), worked out
// from what's inside it (playable.ts), one file at a time while the page is idle. Kept by the file's bytes: Replace…,
// an Undo or an edit gives a file other bytes, which are checked again. Only in the editor: in play nothing is checked
// (it would make the stream stutter), and what was worked out in the editor still holds there. A file just added in
// the editor that won't play here is offered 🔄 Convert (the note at the top of the editor, ConvertNotice.svelte).
import { app, toast } from '../app.svelte';
import { canPlay, getBlob, mediaUrls } from '../media.svelte';
import type { Game, Id, MediaRef } from '../model';
import { elementTest, needsElementTest, readFacts } from './facts';
import { verdict, type Verdict } from './playable';
import { encodersFor, probe } from './probe';
import { severalText } from './words';

/**
 * `version`: up by one each time a check lands (what shows a verdict reads it). `offers`: files added in the editor
 * this page load that won't play here, or play without their sound (not dismissed, nor converted yet).
 */
export const checks = $state<{ version: number; offers: Id[] }>({ version: 0, offers: [] });

const verdicts = new WeakMap<Blob, Verdict>();
/** Bytes waiting for their check, or being checked. */
const waiting = new WeakSet<Blob>();
const queue: { id: Id; blob: Blob; kind: 'video' | 'audio'; mime: string }[] = [];
let running = false;

/** A video or sound stored in the game (not a link, nor a 🗜 copy for phones). */
const checkable = (m: MediaRef): boolean => !m.url && !m.phoneCopy && (m.kind === 'video' || m.kind === 'audio');

/** What was worked out for file `id` as its bytes are now ('checking': soon; undefined: not asked, or not stored). */
export function verdictOf(id: Id): Verdict | 'checking' | undefined {
  void checks.version;
  void mediaUrls[id];
  const blob = getBlob(id);
  if (!blob) return undefined;
  return verdicts.get(blob) ?? (waiting.has(blob) ? 'checking' : undefined);
}

/** The verdict for a file, once it's worked out (validate's `plays`). */
export function knownVerdict(m: MediaRef): Verdict | undefined {
  const v = verdictOf(m.id);
  return typeof v === 'object' ? v : undefined;
}

/** What bytes made here (a conversion, an edit) are known to be, without checking them again. */
export function markChecked(blob: Blob, v: Verdict): void {
  verdicts.set(blob, v);
  checks.version++;
}

function enqueue(ref: MediaRef): void {
  const blob = getBlob(ref.id);
  if (!blob || !checkable(ref) || verdicts.has(blob) || waiting.has(blob)) return;
  waiting.add(blob);
  queue.push({ id: ref.id, blob, kind: ref.kind as 'video' | 'audio', mime: ref.mime });
  pump();
}

/** Check file `id` of `game` soon (once a page, as long as its bytes stay the same). */
export function checkSoon(id: Id, game: Game = app.game): void {
  const ref = game.media.find((m) => m.id === id);
  if (ref) enqueue(ref);
}

/**
 * Files just added in the editor whose checks haven't landed: what they were added as (for today's toast), and `n`,
 * the order they were added in.
 */
const added = new Map<Id, { kind: 'video' | 'audio'; name: string; mime: string; n: number }>();
let addedSeq = 0;
/** Offers that landed since a toast last said so, and the files added by the last of them (`upTo`: their `n`). */
let fresh: { id: Id; is: 'fails' | 'silent'; kind: 'video' | 'audio' }[] = [];
let upTo = 0;
let saying: ReturnType<typeof setTimeout> | null = null;

/** Today's toast for a file whose type alone says it may not play. */
const mayNotPlay = (m: { name: string; mime: string }) => toast(`⚠ This browser may not play "${m.name}" (${m.mime}). Try converting it to MP4 (H.264) or MP3.`);

/**
 * After a video or sound is added (or put in place of another). In the editor, a stored one is checked soon: when it
 * won't play here (or plays without its sound), it's offered 🔄 Convert, and a toast says so (the picker may cover the
 * note); when the app can't read it, today's toast says it may not play, if its type says so. Elsewhere (play, the
 * pre-game screen), and for a link, that toast at once. It changes nothing in the game and awaits nothing, so it's
 * safe inside a step.
 */
export function checkAdded(ref: MediaRef): void {
  if (ref.kind !== 'video' && ref.kind !== 'audio') return;
  if (app.screen === 'editor' && !app.editGame && !app.playerOnly && checkable(ref) && getBlob(ref.id)) {
    added.set(ref.id, { kind: ref.kind, name: ref.name, mime: ref.mime, n: ++addedSeq });
    const known = verdicts.get(getBlob(ref.id)!);
    // (The same bytes as a file checked already: worked out.)
    if (known) landed(ref.id, known);
    else enqueue(ref);
    return;
  }
  if (!canPlay(ref.mime)) mayNotPlay(ref);
}

/** The host said to leave file `id` as it is (or it was converted): no more note about it. */
export function dismissOffer(id: Id): void {
  const i = checks.offers.indexOf(id);
  if (i >= 0) checks.offers.splice(i, 1);
}

/** A check landed for file `id` (`v` undefined: it failed): an offer, or today's toast, if it was just added. */
function landed(id: Id, v: Verdict | undefined): void {
  const a = added.get(id);
  if (!a) return;
  added.delete(id);
  if (v?.is === 'fails' || v?.is === 'silent') {
    if (!checks.offers.includes(id)) checks.offers.push(id);
    fresh.push({ id, is: v.is, kind: a.kind });
    upTo = addedSeq;
  } else if ((!v || v.is === 'unknown') && !canPlay(a.mime)) mayNotPlay(a);
  // Said once the files added with it have landed too: one toast for them all.
  if (!fresh.length) return;
  if (saying) clearTimeout(saying);
  saying = setTimeout(sayFresh, 400);
}

function sayFresh(): void {
  saying = null;
  // (Files added with these still being checked: they say it with these. One added since isn't waited for.)
  if ([...added].some(([id, a]) => a.n <= upTo && verdictOf(id) === 'checking')) return;
  // (One dismissed meanwhile, or converted, isn't counted.)
  const said = fresh.filter((f) => checks.offers.includes(f.id));
  fresh = [];
  if (!said.length) return;
  const one = said[0];
  // (A window over the editor, the clue editor's say, hides the note at the top: the item's own panel beside it says so.)
  const over = !!document.querySelector?.('[aria-modal="true"]');
  const see = over ? `🔄 Convert… is in ${said.length > 1 ? 'their panels' : 'its panel'}` : 'see the note at the top';
  if (said.length > 1) toast(`⚠ ${severalText(said.map((f) => f.is))}: ${see}.`);
  else toast(`⚠ A ${one.kind === 'audio' ? 'sound' : 'video'} you just added ${one.is === 'silent' ? 'plays without its sound' : 'won’t play'} in this browser: ${see}.`);
}

/** Check every video and sound stored in `game` that hasn't been (the editor, as files arrive). */
export function checkGame(game: Game): void {
  for (const m of game.media) enqueue(m);
}

/** `fn` once the page is idle and on show (an element plays nothing in a tab nobody looks at). */
function whenIdle(fn: () => void): void {
  if (document.hidden) return void document.addEventListener('visibilitychange', () => whenIdle(fn), { once: true });
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => fn(), { timeout: 2000 });
  else setTimeout(fn, 200);
}

function pump(): void {
  if (running || !queue.length) return;
  running = true;
  whenIdle(async () => {
    const next = queue.shift();
    let v: Verdict | undefined;
    let asked = false;
    try {
      // (Not in the editor any more, or other bytes there now: not checked. The editor asks again for what it has.)
      if (next && app.screen === 'editor' && getBlob(next.id) === next.blob) {
        asked = true;
        v = await check(next.blob, next.kind, next.mime);
        verdicts.set(next.blob, v);
      }
    } catch (e) {
      console.warn('Checking a file failed', e);
    } finally {
      if (next) waiting.delete(next.blob);
      running = false;
      // (Only for the bytes it was added with: other bytes there now are checked next, and land then.)
      if (next && asked && getBlob(next.id) === next.blob) landed(next.id, v);
      else if (next && app.screen !== 'editor') added.delete(next.id);
      checks.version++;
      pump();
    }
  });
}

/** Whether bytes of a `kind` file of type `mime` play here: what's in them, and a page element's word where it's needed. */
async function check(blob: Blob, kind: 'video' | 'audio', mime: string): Promise<Verdict> {
  const f = await readFacts(blob);
  if (needsElementTest(f)) f.element = await elementTest(blob, kind, kind === 'video' && !!f.video);
  const can = await probe();
  // (The encoders at its picture's size, asked only when its picture may not play.)
  const v = kind === 'video' ? f.video : null;
  const unsure = v && (f.element?.opens === 'no' || !(f.element?.picture ?? v.cpt));
  const enc = v && unsure && can.ok ? await encodersFor(v.width, v.height) : undefined;
  return verdict(f, can, kind, mime, enc);
}
