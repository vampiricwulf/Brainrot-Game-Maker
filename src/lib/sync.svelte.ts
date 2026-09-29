// Host ⇄ audience window sync (spec §6.2). The audience window is the same app opened with #audience;
// it receives state snapshots and media blobs from the host.
//
// Two links, so it works everywhere:
// - postMessage through window.opener (a normal browser popup, including file:// pages, and the
//   desktop app, whose new-window handler keeps the opener link);
// - a BroadcastChannel between same-origin windows, used when the audience window has no opener
//   (e.g. the desktop app had to create the window through its own window API).
// The audience window picks one link, so nothing is processed twice.
import { getBlob } from './media.svelte';
import { applyLocal, remoteMedia, type MediaCmd, type MediaState } from './mediactl.svelte';
import type { Game, Session } from './model';
import type { Live } from './live';
import { inTauri } from './platform';

export type HostMsg =
  | { type: 'game'; game: Game }
  | { type: 'session'; session: Session }
  | { type: 'live'; live: Live }
  | { type: 'media'; items: { id: string; blob: Blob }[] }
  | { type: 'media-cmd'; cmd: MediaCmd }
  | { type: 'bye' };

export type AudienceEvent =
  | { kind: 'media'; id: string; state: MediaState | null }
  | { kind: 'activation'; active: boolean };

export type AudienceMsg = { type: 'hello' } | { type: 'audience-event'; event: AudienceEvent } | { type: 'bye' };

/** Envelope on the BroadcastChannel (it also reaches other same-origin tabs, so say who's talking). */
export type ChannelMsg = { from: 'host'; msg: HostMsg } | { from: 'audience'; msg: AudienceMsg };

export const AUDIENCE_HASH = '#audience';
export const CHANNEL_NAME = 'jeopardy-builder-sync';

/** open: the audience window exists · activated: it has been clicked, so it may autoplay with sound. */
export const audience = $state({ open: false, activated: false });

let win: Window | null = null;
/** Desktop app fallback: a window created through Tauri's API (no opener link). */
let nativeWin: { close(): Promise<void> } | null = null;
let closedPoll: ReturnType<typeof setInterval> | undefined;
/** The audience window said hello on the BroadcastChannel, so send there. */
let viaChannel = false;
const sentMedia = new Set<string>();
const last: { game?: Game; session?: Session; live?: Live } = {};

function makeChannel(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME);
  } catch {
    return null;
  }
}
let channel: BroadcastChannel | null = null;

function post(msg: HostMsg): void {
  if (win && !win.closed) {
    try {
      // file:// pages have an opaque "null" origin, so a specific targetOrigin can't be used.
      win.postMessage(msg, '*');
    } catch (err) {
      console.warn('Audience sync failed', err);
    }
  }
  if (viaChannel && channel) {
    try {
      channel.postMessage({ from: 'host', msg } satisfies ChannelMsg);
    } catch (err) {
      console.warn('Audience channel sync failed', err);
    }
  }
}

function sendMedia(game: Game): void {
  const items: { id: string; blob: Blob }[] = [];
  for (const ref of game.media) {
    // Live links have no file: the audience window plays them from the link too (registerLinks).
    if (sentMedia.has(ref.id) || ref.url) continue;
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

function fromAudience(msg: AudienceMsg): void {
  if (msg?.type === 'hello') {
    for (const k of Object.keys(remoteMedia)) delete remoteMedia[k];
    audience.open = true;
    resendAll();
  } else if (msg?.type === 'audience-event') {
    const ev = msg.event;
    if (ev.kind === 'media') {
      if (ev.state) remoteMedia[ev.id] = ev.state;
      else delete remoteMedia[ev.id];
    } else if (ev.kind === 'activation') audience.activated = ev.active;
  } else if (msg?.type === 'bye' && !win) {
    markClosed();
  }
}

if (typeof window !== 'undefined' && location.hash !== AUDIENCE_HASH) {
  window.addEventListener('message', (e: MessageEvent<AudienceMsg>) => {
    if (!win || e.source !== win) return;
    fromAudience(e.data);
  });
  channel = makeChannel();
  channel?.addEventListener('message', (e: MessageEvent<ChannelMsg>) => {
    if (e.data?.from !== 'audience') return;
    if (e.data.msg?.type === 'hello') viaChannel = true;
    fromAudience(e.data.msg);
  });
  window.addEventListener('beforeunload', () => post({ type: 'bye' }));
}

function markClosed(): void {
  audience.open = false;
  audience.activated = false;
  win = null;
  nativeWin = null;
  viaChannel = false;
  clearInterval(closedPoll);
}

function watchClosed(check: () => boolean | Promise<boolean>): void {
  clearInterval(closedPoll);
  closedPoll = setInterval(async () => {
    if (await check()) markClosed();
  }, 700);
}

/** Desktop app fallback: create the audience window with Tauri's window API. */
async function openNativeAudience(): Promise<boolean> {
  try {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const label = `popup-audience-${Date.now()}`;
    const w = new WebviewWindow(label, {
      url: `index.html${AUDIENCE_HASH}`,
      title: 'Jeopardy Builder · Audience',
      width: 1280,
      height: 760,
      resizable: true,
    });
    await new Promise<void>((resolve, reject) => {
      w.once('tauri://created', () => resolve());
      w.once('tauri://error', (e) => reject(e.payload));
    });
    nativeWin = w;
    audience.open = true;
    watchClosed(async () => !(await WebviewWindow.getByLabel(label)));
    return true;
  } catch (err) {
    console.warn('Could not create the audience window', err);
    return false;
  }
}

/**
 * Open (or focus) the audience window. Must be called from a click.
 * Resolves false if the browser's popup blocker (or the desktop app) refused.
 */
export async function openAudienceWindow(): Promise<boolean> {
  if (win && !win.closed) {
    win.focus();
    return true;
  }
  if (nativeWin) return true;
  // Connected over the channel only (e.g. an audience page opened separately): it's open, just not ours to focus.
  if (audience.open && viaChannel) return true;
  const url = location.href.split('#')[0] + AUDIENCE_HASH;
  win = window.open(url, 'jb-audience', 'popup=yes,width=1280,height=760');
  sentMedia.clear();
  if (!win) return inTauri() ? openNativeAudience() : false;
  audience.open = true;
  watchClosed(() => !win || win.closed);
  return true;
}

export function closeAudienceWindow(): void {
  win?.close();
  nativeWin?.close().catch(() => {});
  if (viaChannel) post({ type: 'bye' });
  markClosed();
}

/** Send a playback command to media in this window and, in dual mode, the audience window. */
export function mediaCommand(cmd: MediaCmd): void {
  applyLocal(cmd);
  post({ type: 'media-cmd', cmd });
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
