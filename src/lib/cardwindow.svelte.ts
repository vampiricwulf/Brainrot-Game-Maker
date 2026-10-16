// 🪟 The card window, host side (partner-clues spec §13.6): opened from the host panel for one player, it shows only
// that player's 🤫 cards (cardwindow.ts windowCards). The host posts to it alone (cardWin.postMessage), never through
// sync's post(), which sends every message to the audience window and the BroadcastChannel: the card window's messages
// never reach the audience window's memory, the channel or the scores window. It takes no hello but from the window
// this page opened (a page that could post to this one gets nothing by saying hello).
import { getBlob } from './media.svelte';
import { CARDS_HASH, syncTarget } from './sync.svelte';
import { windowFiles, type CardWinMsg, type CardWinReply, type WindowCard } from './cardwindow';
import type { Id } from './model';

/** open: the card window exists. seat: whose cards it shows. */
export const cardWindow = $state<{ open: boolean; seat: Id | null }>({ open: false, seat: null });

let cardWin: Window | null = null;
let poll: ReturnType<typeof setInterval> | undefined;
/** What it was sent last (as JSON: the same again isn't sent), and what to send it again after it says hello. */
let lastJson = '';
let last: { name: string; cards: WindowCard[] } | null = null;
/** The files it has (media ids): a file goes once while a card shows it. */
const sentFiles = new Set<Id>();

function toWin(msg: CardWinMsg): void {
  if (!cardWin || cardWin.closed) return;
  try {
    cardWin.postMessage(msg, syncTarget());
  } catch (err) {
    console.warn('Card window sync failed', err);
  }
}

function closed(): void {
  cardWindow.open = false;
  cardWindow.seat = null;
  cardWin = null;
  last = null;
  lastJson = '';
  sentFiles.clear();
  clearInterval(poll);
}

/**
 * Open the card window for a player (or switch it to them, and bring it to the front). Must be called from a click.
 * False if the browser blocked the popup.
 */
export function openCardWindow(seat: Id): boolean {
  if (!cardWin || cardWin.closed) {
    // (The same address and name: a window this tab opened before is found again, not reloaded.)
    const w = window.open(location.href.split('#')[0] + CARDS_HASH, 'jb-cards', 'popup=yes,width=900,height=700');
    if (!w) return false;
    cardWin = w;
    clearInterval(poll);
    poll = setInterval(() => (!cardWin || cardWin.closed) && closed(), 700);
  } else cardWin.focus();
  cardWindow.open = true;
  cardWindow.seat = seat;
  // Everything again (it may be one found again, that dropped what it had when this page went).
  lastJson = '';
  sentFiles.clear();
  return true;
}

/** Close the card window. */
export function closeCardWindow(): void {
  toWin({ type: 'private-close' });
  cardWin?.close();
  closed();
}

/**
 * What the card window shows now: `name`'s cards (windowCards). Files from this computer that a card shows go with
 * them, each once; the window drops files no card shows any more.
 */
export function feedCardWindow(name: string, cards: WindowCard[]): void {
  if (!cardWin || cardWin.closed) return;
  const json = JSON.stringify([name, cards]);
  if (json === lastJson) return;
  lastJson = json;
  last = { name, cards };
  const need = windowFiles(cards);
  for (const id of [...sentFiles]) if (!need.includes(id)) sentFiles.delete(id);
  const items = need.flatMap((id) => {
    const blob = sentFiles.has(id) ? undefined : getBlob(id);
    return blob ? [{ id, blob }] : [];
  });
  if (items.length) toWin({ type: 'private-files', items });
  for (const it of items) sentFiles.add(it.id);
  toWin({ type: 'private-cards', name, cards });
}

// The host page only (the audience, scores and card windows are this app too).
if (typeof window !== 'undefined' && !location.hash.startsWith('#audience') && location.hash !== CARDS_HASH) {
  window.addEventListener('message', (e: MessageEvent<CardWinReply>) => {
    if (!cardWin || e.source !== cardWin) return;
    if (e.data?.type !== 'private-hello') return;
    // It (re)loaded: everything again. (It closing is seen by the poll.)
    const was = last;
    lastJson = '';
    sentFiles.clear();
    if (was) feedCardWindow(was.name, was.cards);
  });
  window.addEventListener('beforeunload', () => toWin({ type: 'private-bye' }));
}
