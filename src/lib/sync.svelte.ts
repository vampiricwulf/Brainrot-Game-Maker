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
import { applyLocal, onLocalMediaChange, remoteMedia, type MediaCmd, type MediaState } from './mediactl.svelte';
import { newId, type Game, type Session } from './model';
import type { Live } from './live';
import { inTauri } from './platform';
import { browserArgs, closeAudienceNative } from './desktop.svelte';
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
  | { type: 'bye' }
  /**
   * Say hello again (with whether it may play sound): a host page that reloaded found the window it had opened, which
   * never reloaded itself, so it still knows whether it was clicked.
   */
  | { type: 'ping' }
  /** The host closed it (Exit, Close audience window): it closes itself, even one the host page no longer holds. */
  | { type: 'close' };

export type AudienceEvent =
  | { kind: 'media'; id: string; state: MediaState | null }
  | { kind: 'activation'; active: boolean }
  // A game sound played or was blocked (test: the nonce of a Test sound), or the chosen output is missing there.
  | SoundReport;

/** A key pressed in the audience window, for the host's shortcuts (the host clicked it to allow sound, and kept typing). */
export type AudienceKey = Pick<KeyboardEvent, 'key' | 'code' | 'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey'>;

/**
 * hello `scores`: from the scores-only window (one a reloaded host page doesn't know yet says so until it's found), with
 * `key`, the host page's key from its address (SCORES_PARAM): only a window that has it is taken back.
 */
export type AudienceMsg =
  | { type: 'hello'; scores?: boolean; key?: string }
  | { type: 'audience-event'; event: AudienceEvent }
  | { type: 'key'; key: AudienceKey }
  | { type: 'bye' };

/**
 * Envelope on the BroadcastChannel (it also reaches other same-origin tabs, so say who's talking). `page`: the host
 * page's address without its #hash, on a close (every page opened from disk shares the channel: a close is only for the
 * audience window of the page that sent it, whose address is that plus #audience).
 */
export type ChannelMsg = { from: 'host'; msg: HostMsg; page?: string } | { from: 'audience'; msg: AudienceMsg };

export const AUDIENCE_HASH = '#audience';
/** The scores-only window: the score plates and the countdown, for a lower-third capture in OBS. */
export const SCORES_HASH = '#audience-scores';
export const CHANNEL_NAME = 'brainrot-games-sync';
/** The scores window's address carries its host page's key (?scores=…), and its hellos say it. */
export const SCORES_PARAM = 'scores';
const SCORES_KEY = 'jb.scoresKey';
let scoresKeyMem = '';

/**
 * This tab's key for its scores window. Kept across a reload (the same address, so window.open finds the window without
 * reloading it): a window the page opened before says it, and nothing else knows it (a page opened from a media link
 * could otherwise say hello as the scores window, and get the whole game with its answers).
 */
function scoresKey(): string {
  try {
    let k = sessionStorage.getItem(SCORES_KEY);
    if (!k) sessionStorage.setItem(SCORES_KEY, (k = newId()));
    return k;
  } catch {
    return (scoresKeyMem ||= newId());
  }
}

/**
 * Where messages to the other windows may go: this page's own site when it is served over http(s), as the desktop app's
 * is (a window that went somewhere else gets nothing), else anywhere ('*': pages opened from disk have a "null" origin,
 * which can't be named).
 */
export function syncTarget(): string {
  return location.protocol === 'http:' || location.protocol === 'https:' ? location.origin : '*';
}

/** The audience window's title: Discord and OBS list the window by it ("My Game · Audience"). */
export function audienceTitle(game: Game | undefined): string {
  return `${game?.title.trim() || 'Brainrot Games Maker'} · Audience`;
}

/**
 * open: the audience window exists · activated: it has been clicked, so it may autoplay with sound · lost: it was open
 * and got closed some other way than the host closing it (its ✕, by accident): viewers see nothing, so the host is told.
 */
export const audience = $state({ open: false, activated: false, lost: false });

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
/** The file sent for each id: one replaced under the same id (Replace…, its Undo, a relink) goes again. */
const sentMedia = new Map<string, Blob>();
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
      scoresWin.postMessage(msg, syncTarget());
    } catch (err) {
      console.warn('Scores window sync failed', err);
    }
  }
  if (win && !win.closed) {
    try {
      win.postMessage(msg, syncTarget());
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
    if (ref.url) continue;
    const blob = getBlob(ref.id);
    if (!blob || sentMedia.get(ref.id) === blob) continue;
    items.push({ id: ref.id, blob });
    sentMedia.set(ref.id, blob);
  }
  if (items.length) post({ type: 'media', items });
}

function resendAll(): void {
  sentMedia.clear();
  // First, so sounds in the state below already start on the right device.
  post({ type: 'audio-out', deviceId: audioOut.deviceId, label: audioOut.label });
  // The overlays (the cover, Starting soon) before the game and the session, so a window opening or coming back never
  // shows the stage under them for a moment.
  if (last.live) post({ type: 'live', live: last.live });
  if (last.game) {
    sendMedia(last.game);
    post({ type: 'game', game: last.game });
  }
  if (last.session) post({ type: 'session', session: last.session });
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

/**
 * What the audience window's media was doing when it said hello again (reloaded, or closed and reopened): an element
 * that starts over there (from 0:00, with sound) is put back where it was once its length is known, paused or muted if
 * it was. Like mediactl's restore for a slide coming back.
 */
let mediaWas: Record<string, { paused: boolean; muted: boolean; time: number; at: number; until: number; fresh?: boolean; seeked?: boolean }> = {};

function restoreMedia(id: string, st: MediaState): void {
  const was = mediaWas[id];
  if (!was) return;
  if (Date.now() > was.until) return void delete mediaWas[id];
  if (!was.fresh) {
    // Only one that started over on a new page (it first reports with no length yet). One in a window that said hello
    // again without reloading isn't put back, though its file sent there again does start it over.
    if (st.duration > 0) return void delete mediaWas[id];
    was.fresh = true;
  } else if (!was.seeked) {
    if (!(Number.isFinite(st.duration) && st.duration > 0)) return; // its length first, so the seek lands
    was.seeked = true;
    const t = was.time + (was.paused ? 0 : (Date.now() - was.at) / 1000);
    // One that would have ended meanwhile stays at its end (play() there would start it over); a loop goes round.
    if (t >= st.duration && !st.loop) was.paused = true;
    post({ type: 'media-cmd', cmd: { el: id, op: 'seek', value: st.loop ? t % st.duration : Math.min(t, st.duration) } });
    post({ type: 'media-cmd', cmd: { el: id, op: was.paused ? 'pause' : 'play' } });
    // Muted again if the host muted it (never unmuted from here: that would stop a muted autoplay before a click).
    if (was.muted && !st.muted) post({ type: 'media-cmd', cmd: { el: id, op: 'muted', value: true } });
    // Paused: an autoplay starting it a moment later is stopped again.
    if (was.paused) was.until = Date.now() + 1500;
    else delete mediaWas[id];
  } else if (was.paused && !st.paused) {
    delete mediaWas[id];
    post({ type: 'media-cmd', cmd: { el: id, op: 'pause' } });
  }
}

function fromAudience(msg: AudienceMsg): void {
  if (msg?.type === 'hello') {
    const at = Date.now();
    mediaWas = {};
    for (const [k, m] of Object.entries(remoteMedia))
      // Not a site's own player (it can't be sought), nor one that hadn't loaded yet (it starts afresh anyway). Muted
      // only if the host muted it, not a blocked autoplay's fallback.
      if (m.kind !== 'external' && m.duration > 0)
        mediaWas[k] = { paused: m.paused, muted: m.muted && !m.blocked, time: m.time, at, until: at + 10000 };
    for (const k of Object.keys(remoteMedia)) delete remoteMedia[k];
    audience.open = true;
    sound.cueBlocked = false;
    sound.outputMissing = false;
    resendAll();
  } else if (msg?.type === 'audience-event') {
    const ev = msg.event;
    if (ev.kind === 'media') {
      if (ev.state) {
        remoteMedia[ev.id] = ev.state;
        restoreMedia(ev.id, ev.state);
      } else delete remoteMedia[ev.id];
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
    markClosed(true);
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
    // The scores window an earlier load of this page opened (it knows this tab's key): it's this page's again (Exit
    // closes it, keys reach Play).
    if (!scoresWin && e.data?.type === 'hello' && e.data.scores && e.data.key === scoresKey() && e.source && e.source !== win) {
      adoptScores(e.source as Window);
      return fromScores(e.data);
    }
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
  // Media this window's copy took off while the audience window was closed went there too: reopened, the window
  // doesn't put it back where it was if the same one shows again by then (a clue opened again starts afresh).
  onLocalMediaChange((id, st) => !st && !audience.open && delete remoteMedia[id]);
}

/** `lost`: closed some other way than the host closing it (see audience.lost). */
function markClosed(lost = false): void {
  if (lost && audience.open) audience.lost = true;
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
    if (await check()) markClosed(true);
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
      height: 720,
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
    audience.lost = false;
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
  audience.lost = false;
  // Connected over the channel only (e.g. an audience page opened separately): it's open, just not ours to focus.
  if (audience.open && viaChannel) return true;
  const url = location.href.split('#')[0] + AUDIENCE_HASH;
  win = window.open(url, 'jb-audience', 'popup=yes,width=1280,height=720');
  sentMedia.clear();
  if (!win) return inTauri() ? openNativeAudience(title) : false;
  audience.open = true;
  watchClosed(() => !win || win.closed);
  // It may be the window an earlier load of this page opened (window.open found it by its name, and didn't reload it):
  // it says hello again, with whether it may play sound. (A new window says hello itself once it has loaded.)
  try {
    win.postMessage({ type: 'ping' } satisfies HostMsg, syncTarget());
  } catch {
    // Not loaded yet: it says hello itself.
  }
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
    const to = (m: HostMsg) => scoresWin?.postMessage(m, syncTarget());
    // (The overlays first, as for the audience window.)
    if (last.live) to({ type: 'live', live: last.live });
    if (last.game) {
      const items = last.game.media.flatMap((ref) => {
        const blob = ref.url ? undefined : getBlob(ref.id);
        return blob ? [{ id: ref.id, blob }] : [];
      });
      if (items.length) to({ type: 'media', items });
      to({ type: 'game', game: last.game });
    }
    if (last.session) to({ type: 'session', session: last.session });
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
  const url = new URL(location.href);
  url.searchParams.set(SCORES_PARAM, scoresKey());
  url.hash = SCORES_HASH;
  const w = window.open(url.href, 'jb-audience-scores', 'popup=yes,width=1280,height=240');
  if (!w) return false;
  adoptScores(w);
  return true;
}

function adoptScores(w: Window): void {
  scoresWin = w;
  scoresWindow.open = true;
  clearInterval(scoresPoll);
  scoresPoll = setInterval(() => (!scoresWin || scoresWin.closed) && scoresClosed(), 700);
}

export function closeScoresWindow(): void {
  scoresWin?.close();
  closeAudienceNative(true);
  scoresClosed();
}

/**
 * Close the audience window (and the scores window). After a reload of this page the window it opened isn't held any
 * more (it came back over the channel, or not at all): it's told to close itself, on every way it may be listening.
 */
export function closeAudienceWindow(): void {
  const msg: HostMsg = { type: 'close' };
  try {
    if (win && !win.closed) win.postMessage(msg, syncTarget());
    channel?.postMessage({ from: 'host', msg, page: location.href.split('#')[0] } satisfies ChannelMsg);
  } catch {
    // Gone already: nothing to tell.
  }
  win?.close();
  nativeWin?.close().catch(() => {});
  closeAudienceNative();
  markClosed();
  audience.lost = false;
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
