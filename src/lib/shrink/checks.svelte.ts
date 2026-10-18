// Whether each video and sound stored in the game really plays in this browser (card-files spec §4.12.3), worked out
// from what's inside it (playable.ts), one file at a time while the page is idle. Kept by the file's bytes: Replace…,
// an Undo or an edit gives a file other bytes, which are checked again. Only in the editor: in play nothing is checked
// (it would make the stream stutter), and what was worked out in the editor still holds there.
import { app } from '../app.svelte';
import { getBlob, mediaUrls } from '../media.svelte';
import type { Game, Id, MediaRef } from '../model';
import { elementTest, needsElementTest, readFacts } from './facts';
import { verdict, type Verdict } from './playable';
import { encodersFor, probe } from './probe';

/** Up by one each time a check lands: what shows a verdict reads it. */
export const checks = $state({ version: 0 });

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
    try {
      // (Not in the editor any more, or other bytes there now: not checked. The editor asks again for what it has.)
      if (next && app.screen === 'editor' && getBlob(next.id) === next.blob) verdicts.set(next.blob, await check(next.blob, next.kind, next.mime));
    } catch (e) {
      console.warn('Checking a file failed', e);
    } finally {
      if (next) waiting.delete(next.blob);
      running = false;
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
