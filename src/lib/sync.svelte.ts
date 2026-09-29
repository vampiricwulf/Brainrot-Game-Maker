// Host ⇄ audience window sync (spec §6.2). The audience window is the same HTML file opened with
// #audience; it receives state snapshots and media blobs through postMessage, which works even when
// the file is opened from disk (file:// pages can't share storage or DOM reliably, but can message).
import { getBlob } from './media.svelte';
import type { Game, Session } from './model';
import type { Live } from './live';

export type HostMsg =
  | { type: 'game'; game: Game }
  | { type: 'session'; session: Session }
  | { type: 'live'; live: Live }
  | { type: 'media'; items: { id: string; blob: Blob }[] }
  | { type: 'bye' };

export type AudienceMsg = { type: 'hello' } | { type: 'audience-event'; event: unknown };

export const AUDIENCE_HASH = '#audience';

export const audience = $state({ open: false });

let win: Window | null = null;
let closedPoll: ReturnType<typeof setInterval> | undefined;
const sentMedia = new Set<string>();
const last: { game?: Game; session?: Session; live?: Live } = {};
const listeners = new Set<(event: unknown) => void>();

function post(msg: HostMsg): void {
  if (!win || win.closed) return;
  try {
    // file:// pages have an opaque "null" origin, so a specific targetOrigin can't be used.
    win.postMessage(msg, '*');
  } catch (err) {
    console.warn('Audience sync failed', err);
  }
}

function sendMedia(game: Game): void {
  const items: { id: string; blob: Blob }[] = [];
  for (const ref of game.media) {
    if (sentMedia.has(ref.id)) continue;
    const blob = getBlob(ref.id);
    if (!blob) continue;
    items.push({ id: ref.id, blob });
    sentMedia.add(ref.id);
  }
  if (items.length) post({ type: 'media', items });
}

function resendAll(): void {
  sentMedia.clear();
  if (last.game) {
    sendMedia(last.game);
    post({ type: 'game', game: last.game });
  }
  if (last.session) post({ type: 'session', session: last.session });
  if (last.live) post({ type: 'live', live: last.live });
}

if (typeof window !== 'undefined' && location.hash !== AUDIENCE_HASH) {
  window.addEventListener('message', (e: MessageEvent<AudienceMsg>) => {
    if (!win || e.source !== win) return;
    const msg = e.data;
    if (msg?.type === 'hello') resendAll();
    else if (msg?.type === 'audience-event') listeners.forEach((l) => l(msg.event));
  });
  window.addEventListener('beforeunload', () => post({ type: 'bye' }));
}

/** Open (or focus) the audience window. Must be called from a click. Returns false if a popup blocker stopped it. */
export function openAudienceWindow(): boolean {
  if (win && !win.closed) {
    win.focus();
    return true;
  }
  const url = location.href.split('#')[0] + AUDIENCE_HASH;
  win = window.open(url, 'jb-audience', 'popup=yes,width=1280,height=760');
  if (!win) return false;
  sentMedia.clear();
  audience.open = true;
  clearInterval(closedPoll);
  closedPoll = setInterval(() => {
    if (!win || win.closed) {
      audience.open = false;
      win = null;
      clearInterval(closedPoll);
    }
  }, 500);
  return true;
}

export function closeAudienceWindow(): void {
  win?.close();
  win = null;
  audience.open = false;
}

export function pushGame(game: Game): void {
  last.game = game;
  sendMedia(game);
  post({ type: 'game', game });
}

export function pushSession(session: Session): void {
  last.session = session;
  post({ type: 'session', session });
}

export function pushLive(live: Live): void {
  last.live = live;
  post({ type: 'live', live });
}

/** Events sent back by the audience window (e.g. media playback status). */
export function onAudienceEvent(fn: (event: unknown) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
