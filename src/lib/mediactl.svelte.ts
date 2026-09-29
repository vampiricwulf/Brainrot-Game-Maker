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

export function registerMedia(id: string, role: MediaRole, handle: MediaHandle, state: MediaState, start = 0): void {
  entries.set(id, { role, handle, start });
  localMedia[id] = { ...state, role };
  listeners.forEach((l) => l(id, state));
}

export function updateMedia(id: string, patch: Partial<MediaState>): void {
  const cur = localMedia[id];
  if (!cur) return;
  Object.assign(cur, patch);
  listeners.forEach((l) => l(id, cur));
}

export function unregisterMedia(id: string): void {
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

export { classifyUrl, youtubeId, youtubeStart, youtubeThumb, youtubeWatchUrl } from './links';

/** Open the real page for an online media element in a popup window (the YouTube fallback). Web links only. */
export function openMediaPopup(url: string): boolean {
  if (!isWebUrl(url)) return false;
  return !!window.open(url, 'jb-media', 'popup=yes,width=1280,height=760');
}
