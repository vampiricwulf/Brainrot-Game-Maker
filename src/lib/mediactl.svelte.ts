// Playback control for media elements on the current slide (spec §6.7).
// Every playing <video>/<audio>/YouTube element registers a handle here. The host's controls send
// commands; in dual-window mode they are also forwarded to the audience window, whose elements
// report their status back so the host sees real progress.

import { isWebUrl } from './links';

export type MediaRole = 'single' | 'mirror' | 'audience';

export interface MediaState {
  label: string;
  /** 'external': a site's own player (Google Drive, Streamable) that the app can't pause, seek or mute. */
  kind: 'video' | 'audio' | 'youtube' | 'remote' | 'external';
  paused: boolean;
  time: number;
  duration: number;
  volume: number;
  muted: boolean;
  loop: boolean;
  /** A silent loop (a GIF turned into a video, or a looping muted video): the keys go to other media first. */
  silent?: boolean;
  /** It plays by itself, and hasn't yet: it waits for its entrance delay (or to load). */
  waiting?: boolean;
  /** Autoplay with sound was blocked by the browser (fell back to muted or paused). */
  blocked?: boolean;
  /** The media failed (e.g. YouTube refused to embed); the host should use the "open" fallback. */
  failed?: boolean;
  /** Page to open as a fallback (YouTube watch URL or the remote media URL). */
  openUrl?: string;
  /** For 'external': the player is showing (false once the host stopped it). */
  shown?: boolean;
}

export interface MediaHandle {
  play(): void;
  pause(): void;
  seek(t: number): void;
  setVolume(v: number): void;
  setMuted(m: boolean): void;
  setLoop(l: boolean): void;
  /** Start over by reloading (a site's own player, which can't be sought). */
  reload?(): void;
  /** Take it off the screen (the only sure way to silence a site's own player). */
  stop?(): void;
}

export type MediaOp = 'play' | 'pause' | 'toggle' | 'seek' | 'seekBy' | 'volume' | 'muted' | 'loop' | 'restart' | 'stop';
export interface MediaCmd {
  el: string;
  op: MediaOp;
  value?: number | boolean;
}

interface Entry {
  role: MediaRole;
  handle: MediaHandle;
  start: number;
  /** What was on screen when it came up: where it was is kept only for that. */
  scope: string;
}

const entries = new Map<string, Entry>();
/** Status of media rendered in this window, keyed by element id. */
export const localMedia = $state<Record<string, MediaState & { role: MediaRole }>>({});
/** Status reported by the audience window (host side, dual mode). */
export const remoteMedia = $state<Record<string, MediaState>>({});

type Listener = (id: string, state: MediaState | null) => void;
const listeners = new Set<Listener>();
/** Called whenever a local media element's status changes (the audience window forwards these). */
export function onLocalMediaChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---------- Where a media element was, when its slide comes back ----------
// Hiding the answer again puts the question's slide back: its video goes on from where it was, muted if it was, not
// from the start. Only within one clue (the scope): another clue, or the same one opened again later, starts afresh.

interface Kept {
  time: number;
  muted: boolean;
  paused: boolean;
  volume: number;
  loop: boolean;
}
const kept = new Map<string, Kept>();
const restoring = new Map<string, { k: Kept; until: number; seeked: boolean }>();
let scope = '';

/** What's on screen now (a clue, a Final): media kept from anything else is forgotten. */
export function mediaScope(s: string): void {
  if (s === scope) return;
  scope = s;
  kept.clear();
  restoring.clear();
}

/** The scope and kept places from before the editor's previews, while any is open (see previewMediaScope). */
let held: { scope: string; kept: Map<string, Kept> } | null = null;
let previews = 0;

/**
 * The editor's ▶ Preview (or a page's demo stage, 🎨 Theme's): its media plays from the start and keeps nothing, and a
 * game left mid-clue still has where its media was, for Resume. Call what it returns when the preview stops. Previews
 * open at once (the theme import dialog's over 🎨 Theme's) put it back when the last one stops, in whatever order.
 */
export function previewMediaScope(): () => void {
  if (!previews++) held = { scope, kept: new Map(kept) };
  mediaScope('');
  let open = true;
  return () => {
    if (!open) return;
    open = false;
    if (--previews || !held) return;
    const was = held;
    held = null;
    mediaScope(was.scope);
    was.kept.forEach((k, key) => kept.set(key, k));
  };
}

export function registerMedia(id: string, role: MediaRole, handle: MediaHandle, state: MediaState, start = 0): void {
  entries.set(id, { role, handle, start, scope });
  const k = kept.get(`${role}:${id}`);
  kept.delete(`${role}:${id}`);
  // Muted, at the volume and looping as it was (the host's copy always stays muted); its place once it knows its length
  // (see updateMedia).
  const muted = role === 'mirror' || (k ? k.muted : state.muted);
  const now = k ? { ...state, muted, volume: k.volume, loop: k.loop } : { ...state, muted };
  localMedia[id] = { ...now, role };
  if (k) {
    handle.setMuted(muted);
    handle.setVolume(k.volume);
    handle.setLoop(k.loop);
    restoring.set(id, { k, until: Date.now() + 8000, seeked: false });
  }
  listeners.forEach((l) => l(id, now));
}

/**
 * Where the host's own copy was when the audience window opened (as it took the sound): sync puts that window's copy
 * there when it says hello, so the clip goes on from the host's time, muted and at the volume the host had.
 */
export const handover = new Map<string, Kept & { at: number }>();

/** The same element changing role: the audience window opened or closed while its slide is up. */
export function setMediaRole(id: string, role: MediaRole): void {
  const e = entries.get(id);
  if (!e || e.role === role) return;
  const st = localMedia[id];
  // (Not a site's own player, nor one not loaded yet or still waiting to play by itself: those start afresh there.)
  if (e.role === 'single' && role === 'mirror' && st && st.kind !== 'external' && st.duration > 0 && !st.waiting)
    handover.set(id, { time: st.time, paused: st.paused, muted: st.muted && !st.blocked, volume: st.volume, loop: st.loop, at: Date.now() });
  else handover.delete(id);
  e.role = role;
  if (localMedia[id]) localMedia[id].role = role;
  // The host's copy goes silent at once, so the sound only ever comes from one window.
  if (role === 'mirror') e.handle.setMuted(true);
}

/** A media element coming back: its place (once its length is known), and paused if it was (autoplay or not). */
function restore(id: string, patch: Partial<MediaState>): void {
  const r = restoring.get(id);
  const e = entries.get(id);
  if (!r || !e) return;
  if (Date.now() > r.until) return void restoring.delete(id);
  if (!r.seeked && patch.duration) {
    r.seeked = true;
    // (Again: the element's own muted attribute may have been applied after it registered.)
    e.handle.setMuted(e.role === 'mirror' || r.k.muted);
    e.handle.seek(r.k.time);
    if (r.k.paused) e.handle.pause();
    else e.handle.play();
    // Paused: an autoplay starting it in a moment is stopped again.
    if (r.k.paused) r.until = Date.now() + 1500;
    else restoring.delete(id);
  } else if (r.seeked && r.k.paused && patch.paused === false) {
    restoring.delete(id);
    e.handle.pause();
  }
}

export function updateMedia(id: string, patch: Partial<MediaState>): void {
  const cur = localMedia[id];
  if (!cur) return;
  Object.assign(cur, patch);
  listeners.forEach((l) => l(id, cur));
  if (restoring.size) restore(id, patch);
}

export function unregisterMedia(id: string): void {
  const e = entries.get(id);
  const st = localMedia[id];
  // Only in the scope it came up in: not the editor's preview's media (it came up in none). Nor one still waiting to
  // play by itself: it starts afresh, after its entrance again.
  if (e && st && scope && e.scope === scope && st.kind !== 'external' && !st.waiting)
    kept.set(`${e.role}:${id}`, { time: st.time, muted: st.muted, paused: st.paused, volume: st.volume, loop: st.loop });
  restoring.delete(id);
  handover.delete(id);
  entries.delete(id);
  delete localMedia[id];
  listeners.forEach((l) => l(id, null));
}

/** Apply a command to media elements rendered in this window. */
export function applyLocal(cmd: MediaCmd): void {
  const e = entries.get(cmd.el);
  const st = localMedia[cmd.el];
  if (!e || !st) return;
  const h = e.handle;
  switch (cmd.op) {
    case 'play':
      h.play();
      break;
    case 'pause':
      h.pause();
      break;
    case 'toggle':
      if (st.paused) h.play();
      else h.pause();
      break;
    case 'seek':
      h.seek(Number(cmd.value) || 0);
      break;
    case 'seekBy':
      h.seek(Math.max(0, st.time + (Number(cmd.value) || 0)));
      break;
    case 'restart':
      if (h.reload) h.reload();
      else {
        h.seek(e.start);
        h.play();
      }
      break;
    case 'stop':
      if (h.stop) h.stop();
      else h.pause();
      break;
    case 'volume':
      h.setVolume(Number(cmd.value));
      break;
    case 'muted':
      // The host's mirror copy always stays muted so audio only comes from one window.
      if (e.role !== 'mirror') h.setMuted(!!cmd.value);
      break;
    case 'loop':
      h.setLoop(!!cmd.value);
      break;
  }
}

export function fmtTime(t: number): string {
  if (!Number.isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ---------- URL helpers (they live in links.ts; re-exported for existing imports) ----------

export { youtubeId, youtubeStart, youtubeThumb, youtubeWatchUrl } from './links';

/** What the host is told when openMediaPopup fails. */
export const POPUP_FAILED = "Couldn't open the link. If the browser blocked the popup, allow popups for this file.";

/**
 * Open the real page for an online media element in a popup window (the YouTube fallback). Web links only. False if
 * the popup was blocked.
 */
export function openMediaPopup(url: string): boolean {
  if (!isWebUrl(url)) return false;
  // Cut loose at once, before the link loads: the page there gets no handle on this one (it could say hello as the
  // scores window, press the host's keys, or send this tab somewhere else). Each link gets a window of its own. The
  // link goes in the request itself, not about:blank first: the desktop app's window is built for the URL asked for,
  // and WebView2 loads that. ('noopener' would cut it loose too, but window.open then returns null, as when blocked.)
  const w = window.open(url, '_blank', 'popup=yes,width=1280,height=720');
  if (!w) return false;
  try {
    w.opener = null;
  } catch {
    // (Not this page's to change: it can't reach this page anyway.)
  }
  return true;
}
