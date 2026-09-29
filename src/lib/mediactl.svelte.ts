// Playback control for media elements on the current slide (spec §6.7).
// Every playing <video>/<audio>/YouTube element registers a handle here. The host's controls send
// commands; in dual-window mode they are also forwarded to the audience window, whose elements
// report their status back so the host sees real progress.

export type MediaRole = 'single' | 'mirror' | 'audience';

export interface MediaState {
  label: string;
  kind: 'video' | 'audio' | 'youtube' | 'remote';
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
}

export interface MediaHandle {
  play(): void;
  pause(): void;
  seek(t: number): void;
  setVolume(v: number): void;
  setMuted(m: boolean): void;
  setLoop(l: boolean): void;
}

export type MediaOp = 'play' | 'pause' | 'toggle' | 'seek' | 'seekBy' | 'volume' | 'muted' | 'loop' | 'restart';
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
      h.seek(e.start);
      h.play();
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

// ---------- YouTube / URL helpers ----------

export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\.|^m\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'music.youtube.com') {
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{6,})/);
      if (m) return m[1];
    }
  } catch {
    /* not a URL */
  }
  return null;
}

/** Start time from a YouTube link (?t=90, ?t=1m30s, ?start=90). */
export function youtubeStart(url: string): number | undefined {
  try {
    const u = new URL(url.trim());
    const t = u.searchParams.get('t') ?? u.searchParams.get('start');
    if (!t) return undefined;
    if (/^\d+$/.test(t)) return +t;
    const m = t.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
    if (!m) return undefined;
    return (+(m[1] ?? 0)) * 3600 + (+(m[2] ?? 0)) * 60 + (+(m[3] ?? 0));
  } catch {
    return undefined;
  }
}

export function youtubeWatchUrl(id: string, start?: number): string {
  return `https://www.youtube.com/watch?v=${id}${start ? `&t=${Math.floor(start)}s` : ''}`;
}

export function youtubeThumb(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/** Guess what kind of online media a pasted URL is. */
export function classifyUrl(url: string): 'youtube' | 'remoteVideo' | 'remoteAudio' | 'remoteImage' | null {
  if (youtubeId(url)) return 'youtube';
  let path = '';
  try {
    path = new URL(url.trim()).pathname.toLowerCase();
  } catch {
    return null;
  }
  if (/\.(png|jpe?g|gif|webp|svg|avif|bmp)$/.test(path)) return 'remoteImage';
  if (/\.(mp3|wav|ogg|oga|m4a|aac|flac|opus)$/.test(path)) return 'remoteAudio';
  if (/\.(mp4|webm|mov|m4v|ogv|mkv)$/.test(path)) return 'remoteVideo';
  return 'remoteVideo';
}

/** Open the real page for an online media element in a popup window (the YouTube fallback). */
export function openMediaPopup(url: string): boolean {
  return !!window.open(url, 'jb-media', 'popup=yes,width=1280,height=760');
}
