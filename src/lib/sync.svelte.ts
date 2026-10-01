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
import { newId, type Game, type Session } from './model';
import type { Live } from './live';
import { inTauri } from './platform';
import { browserArgs } from './desktop.svelte';
import { audioOut, onSoundReport, playChime, setAudioOut, type SoundReport } from './audioout.svelte';
import type { AudioOutput } from './audio';

export type HostMsg =
  | { type: 'game'; game: Game }
  | { type: 'session'; session: Session }
  | { type: 'live'; live: Live }
  | { type: 'media'; items: { id: string; blob: Blob }[] }
  | { type: 'media-cmd'; cmd: MediaCmd }
  /** Play the test chime and answer with a 'sound' event carrying this nonce. */
  | { type: 'test-sound'; nonce: string }
  /** The game audio output the host picked. */
  | { type: 'audio-out'; deviceId: string; label: string }
  | { type: 'bye' };

export type AudienceEvent =
  | { kind: 'media'; id: string; state: MediaState | null }
  | { kind: 'activation'; active: boolean }
  // A game sound played or was blocked (test: the nonce of a Test sound), or the chosen output is missing there.
  | SoundReport;

/** A key pressed in the audience window, for the host's shortcuts (the host clicked it to allow sound, and kept typing). */
export type AudienceKey = Pick<KeyboardEvent, 'key' | 'code' | 'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey'>;

export type AudienceMsg = { type: 'hello' } | { type: 'audience-event'; event: AudienceEvent } | { type: 'key'; key: AudienceKey } | { type: 'bye' };

/** Envelope on the BroadcastChannel (it also reaches other same-origin tabs, so say who's talking). */
export type ChannelMsg = { from: 'host'; msg: HostMsg } | { from: 'audience'; msg: AudienceMsg };

export const AUDIENCE_HASH = '#audience';
/** The scores-only window: the score plates and the countdown, for a lower-third capture in OBS. */
export const SCORES_HASH = '#audience-scores';
export const CHANNEL_NAME = 'brainrot-games-sync';

/** The audience window's title: Discord and OBS list the window by it ("My Game · Audience"). */
export function audienceTitle(game: Game | undefined): string {
  return `${game?.title.trim() || 'Brainrot Games Maker'} · Audience`;
}

/** open: the audience window exists · activated: it has been clicked, so it may autoplay with sound. */
export const audience = $state({ open: false, activated: false });

export type SoundTest = { nonce: string; where: 'audience' | 'host'; state: 'waiting' | 'ok' | 'blocked' | 'error' | 'no-answer' };
/**
 * Sound from the window that plays it (the audience window in dual mode, else this one):
 * cueBlocked: the browser blocked a game sound · outputMissing: the chosen output device wasn't found there ·
 * test: the last Test sound.
 */
export const sound = $state<{ cueBlocked: boolean; outputMissing: boolean; test: SoundTest | null }>({
  cueBlocked: false,
  outputMissing: false,
  test: null,
});

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
  // The scores window only shows the game's state (no sound, no media controls).
  if (scoresWin && !scoresWin.closed && SCORES_MSGS.has(msg.type)) {
    try {
      scoresWin.postMessage(msg, '*');
    } catch (err) {
      console.warn('Scores window sync failed', err);
    }
  }
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
  // First, so sounds in the state below already start on the right device.
  post({ type: 'audio-out', deviceId: audioOut.deviceId, label: audioOut.label });
  if (last.game) {
    sendMedia(last.game);
    post({ type: 'game', game: last.game });
  }
  if (last.session) post({ type: 'session', session: last.session });
  if (last.live) post({ type: 'live', live: last.live });
}

function onSound(ev: SoundReport): void {
  if (ev.kind === 'audio-out') {
    sound.outputMissing = ev.missing;
    return;
  }
  const t = sound.test;
  if (ev.test && t?.nonce === ev.test) t.state = ev.ok ? 'ok' : (ev.reason ?? 'error');
  // Anything that played means sound is allowed there now.
  if (ev.ok) sound.cueBlocked = false;
  else if (!ev.test && ev.reason === 'blocked') sound.cueBlocked = true;
}

function fromAudience(msg: AudienceMsg): void {
  if (msg?.type === 'hello') {
    for (const k of Object.keys(remoteMedia)) delete remoteMedia[k];
    audience.open = true;
    sound.cueBlocked = false;
    sound.outputMissing = false;
    resendAll();
  } else if (msg?.type === 'audience-event') {
    const ev = msg.event;
    if (ev.kind === 'media') {
      if (ev.state) remoteMedia[ev.id] = ev.state;
      else delete remoteMedia[ev.id];
    } else if (ev.kind === 'activation') {
      audience.activated = ev.active;
      if (ev.active) sound.cueBlocked = false;
    } else {
      // A sound played there, so it may play sound (a browser can allow that before any click).
      if (ev.kind === 'sound' && ev.ok) audience.activated = true;
      onSound(ev);
    }
  } else if (msg?.type === 'key') {
    keyHandler?.(msg.key);
  } else if (msg?.type === 'bye' && !win) {
    markClosed();
  }
}

let keyHandler: ((key: AudienceKey) => void) | null = null;
/** Keys pressed in the audience window go to `fn` (Play's shortcuts). Returns the function that stops it. */
export function onAudienceKey(fn: (key: AudienceKey) => void): () => void {
  keyHandler = fn;
  return () => {
    if (keyHandler === fn) keyHandler = null;
  };
}

if (typeof window !== 'undefined' && location.hash !== AUDIENCE_HASH && location.hash !== SCORES_HASH) {
  window.addEventListener('message', (e: MessageEvent<AudienceMsg>) => {
    if (scoresWin && e.source === scoresWin) return fromScores(e.data);
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
  // Sounds this window plays itself (single-window mode; in dual mode its copy is silent).
  onSoundReport((r) => !audience.open && onSound(r));
}

function markClosed(): void {
  audience.open = false;
  audience.activated = false;
  sound.cueBlocked = false;
  sound.outputMissing = false;
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
async function openNativeAudience(title: string): Promise<boolean> {
  try {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const label = `popup-audience-${Date.now()}`;
    const args = browserArgs();
    const options = {
      url: `index.html${AUDIENCE_HASH}`,
      // This window keeps its title (it doesn't follow the page's), so give it the page's from the start.
      title,
      width: 1280,
      height: 760,
      resizable: true,
      // With the Discord audio fix on, the app runs with its own WebView2 switches, and WebView2 only creates
      // windows with exactly the same ones (the option is real but missing from the TypeScript types).
      ...(args ? { additionalBrowserArgs: args } : {}),
    };
    const w = new WebviewWindow(label, options as ConstructorParameters<typeof WebviewWindow>[1]);
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
 * Open (or focus) the audience window. Must be called from a click. `title`: audienceTitle(game).
 * Resolves false if the browser's popup blocker (or the desktop app) refused.
 */
export async function openAudienceWindow(title: string): Promise<boolean> {
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
  if (!win) return inTauri() ? openNativeAudience(title) : false;
  audience.open = true;
  watchClosed(() => !win || win.closed);
  return true;
}

// ---------- The scores-only window ----------

const SCORES_MSGS = new Set<HostMsg['type']>(['game', 'session', 'live', 'media', 'bye']);
let scoresWin: Window | null = null;
let scoresPoll: ReturnType<typeof setInterval> | undefined;
/** open: the scores-only window exists. */
export const scoresWindow = $state({ open: false });

function fromScores(msg: AudienceMsg): void {
  if (msg?.type === 'hello') {
    // Everything it needs, to it alone: the files (fonts, avatars) too.
    const to = (m: HostMsg) => scoresWin?.postMessage(m, '*');
    if (last.game) {
      const items = last.game.media.flatMap((ref) => {
        const blob = ref.url ? undefined : getBlob(ref.id);
        return blob ? [{ id: ref.id, blob }] : [];
      });
      if (items.length) to({ type: 'media', items });
      to({ type: 'game', game: last.game });
    }
    if (last.session) to({ type: 'session', session: last.session });
    if (last.live) to({ type: 'live', live: last.live });
  } else if (msg?.type === 'key') keyHandler?.(msg.key);
  else if (msg?.type === 'bye') scoresClosed();
}

function scoresClosed(): void {
  scoresWindow.open = false;
  scoresWin = null;
  clearInterval(scoresPoll);
}

/** Open (or focus) the scores-only window. Must be called from a click. False if the popup was blocked. */
export function openScoresWindow(): boolean {
  if (scoresWin && !scoresWin.closed) {
    scoresWin.focus();
    return true;
  }
  scoresWin = window.open(location.href.split('#')[0] + SCORES_HASH, 'jb-audience-scores', 'popup=yes,width=1280,height=240');
  if (!scoresWin) return false;
  scoresWindow.open = true;
  clearInterval(scoresPoll);
  scoresPoll = setInterval(() => (!scoresWin || scoresWin.closed) && scoresClosed(), 700);
  return true;
}

export function closeScoresWindow(): void {
  scoresWin?.close();
  scoresClosed();
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

let testTimer: ReturnType<typeof setTimeout> | undefined;
/** Play the test chime in the window that plays the game's sound; the result lands in `sound.test`. */
export function testSound(): void {
  const nonce = newId();
  clearTimeout(testTimer);
  if (audience.open) {
    sound.test = { nonce, where: 'audience', state: 'waiting' };
    post({ type: 'test-sound', nonce });
    testTimer = setTimeout(() => {
      if (sound.test?.nonce === nonce && sound.test.state === 'waiting') sound.test.state = 'no-answer';
    }, 4000);
  } else {
    sound.test = { nonce, where: 'host', state: 'waiting' };
    playChime(nonce);
  }
}

/** Send the game's sound to this output (remembered on this computer), here and in the audience window. */
export function chooseAudioOut(out: AudioOutput): void {
  setAudioOut(out, true);
  sound.outputMissing = false;
  post({ type: 'audio-out', deviceId: out.deviceId, label: out.label });
}
