// Downloading an online link into the game, and trying a link the game can't download.
//
// In the browser a page may only read a file from another site when that site allows it (it sends
// Access-Control-Allow-Origin), so many hosts can't be downloaded (files.catbox.moe, Google Drive).
// Those can still be shown with a plain <img>/<video>/<audio>, which needs no permission: that's the
// "live link" fallback, tried here with probeLink(). The desktop app downloads natively instead
// (tauri-plugin-http), which works for every host, Google Drive included.
import { driveUrls, linkMessages, nameFromUrl, type DriveRef, type LinkKind, type LinkProblem } from './links';
import { inTauri } from './platform';
import { fileMime, filenameFromDisposition, looksLikeHtml, readDrivePage, withExtension } from './sniff';

/** Files above this ask first; above MAX_DOWNLOAD they're never saved in the game. */
export const ASK_ABOVE = 150 * 1024 ** 2;
export const MAX_DOWNLOAD = 1024 ** 3;
/** How long a link gets to show that it plays. */
const PROBE_MS = 15000;

export interface DownloadJob {
  signal?: AbortSignal;
  onprogress?: (loaded: number, total?: number) => void;
  /** Asked before saving a file over 150 MB (`bytes` so far when the size isn't known); false plays it from the link. */
  confirmBig?: (bytes: number, known: boolean) => boolean | Promise<boolean>;
  /** What the spot needs: a sound spot takes an MP4 or WebM that nothing says is a video as a sound. */
  want?: LinkKind;
}

export interface Downloaded {
  blob: Blob;
  mime: string;
  name: string;
  /** Where it came from in the end (after redirects). */
  url: string;
}

/** Why a download didn't work. The reason decides whether playing the link live is worth a try. */
export class DownloadError extends Error {
  constructor(
    public reason: 'network' | 'http' | 'html' | 'too-big' | 'declined' | 'not-media',
    message: string,
    public status = 0,
    /** The page, when the site sent one (Google Drive explains itself in it). */
    public html = '',
    public url = '',
  ) {
    super(message);
  }
}

/** A problem to show the user as it is. */
export class LinkError extends Error {
  constructor(public problem: LinkProblem) {
    super(problem.message);
  }
}

/** The user pressed Cancel (the native fetch rejects with its own "Request cancelled" error). */
export function isAbort(e: unknown): boolean {
  return (e as Error)?.name === 'AbortError' || e === 'Request cancelled' || (e as Error)?.message === 'Request cancelled';
}
const aborted = () => new DOMException('Cancelled', 'AbortError');

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** The desktop app's native fetch (no CORS, no browser headers), or the page's own. */
async function fetcher(): Promise<{ fetch: Fetch; native: boolean }> {
  if (inTauri()) {
    try {
      // Only ever loaded inside the desktop app (the single-file build never runs this import).
      const http = await import('@tauri-apps/plugin-http');
      return { fetch: http.fetch as Fetch, native: true };
    } catch (err) {
      console.warn('Native download unavailable, using the page fetch', err);
    }
  }
  return { fetch: (url, init) => window.fetch(url, init), native: false };
}

async function readText(res: Response, max = 200_000): Promise<string> {
  try {
    return (await res.text()).slice(0, max);
  } catch {
    return '';
  }
}

/** Download one URL into memory, with progress, the size limits and a check of what it really is. */
export async function download(url: string, job: DownloadJob = {}): Promise<Downloaded> {
  const { fetch, native } = await fetcher();
  let res: Response;
  try {
    res = await fetch(
      url,
      native
        ? // Like a normal download: no Origin (the plugin would send the app's own), a browser's User-Agent.
          { signal: job.signal, headers: { Origin: '', 'User-Agent': navigator.userAgent } }
        : { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', signal: job.signal },
    );
  } catch (e) {
    if (job.signal?.aborted || isAbort(e)) throw aborted();
    throw new DownloadError('network', String((e as Error)?.message ?? e), 0, '', url);
  }
  const finalUrl = res.url || url;
  const type = (res.headers.get('content-type') ?? '').toLowerCase();
  if (!res.ok) {
    const html = /html|text/.test(type) ? await readText(res) : (await res.body?.cancel().catch(() => {}), '');
    throw new DownloadError('http', `HTTP ${res.status}`, res.status, html, finalUrl);
  }
  if (type.startsWith('text/html')) throw new DownloadError('html', 'A web page', res.status, await readText(res), finalUrl);

  const len = res.headers.get('content-length');
  const total = len && /^\d+$/.test(len) ? +len : undefined;
  const stop = async (e: DownloadError) => {
    await res.body?.cancel().catch(() => {});
    throw e;
  };
  if (total !== undefined && total > MAX_DOWNLOAD) await stop(new DownloadError('too-big', 'Too big', 0, '', finalUrl));
  let asked = total !== undefined && total > ASK_ABOVE;
  if (asked && !(await (job.confirmBig?.(total!, true) ?? true))) await stop(new DownloadError('declined', 'Not saved', 0, '', finalUrl));

  const chunks: BlobPart[] = [];
  let loaded = 0;
  const reader = res.body?.getReader();
  try {
    if (!reader) chunks.push(await res.blob());
    else
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.byteLength;
        if (loaded > MAX_DOWNLOAD) throw new DownloadError('too-big', 'Too big', 0, '', finalUrl);
        if (!asked && loaded > ASK_ABOVE) {
          asked = true;
          if (!(await (job.confirmBig?.(loaded, false) ?? true))) throw new DownloadError('declined', 'Not saved', 0, '', finalUrl);
        }
        job.onprogress?.(loaded, total);
      }
  } catch (e) {
    reader?.cancel().catch(() => {});
    if (job.signal?.aborted || isAbort(e)) throw aborted();
    throw e instanceof DownloadError ? e : new DownloadError('network', String((e as Error)?.message ?? e), 0, '', finalUrl);
  }

  const whole = new Blob(chunks);
  const head = new Uint8Array(await whole.slice(0, 512).arrayBuffer());
  if (looksLikeHtml(head)) throw new DownloadError('html', 'A web page', res.status, await whole.slice(0, 200_000).text(), finalUrl);
  const headerType = /^(image|video|audio)\//.test(type) ? type.split(';')[0].trim() : null;
  const named = filenameFromDisposition(res.headers.get('content-disposition')) ?? nameFromUrl(finalUrl);
  const mime = fileMime(head, headerType, named, job.want);
  if (!mime) throw new DownloadError('not-media', 'Not a media file', 0, '', finalUrl);
  return { blob: whole.slice(0, whole.size, mime), mime, name: withExtension(named, mime), url: finalUrl };
}

/** Try each address in turn (e.g. Discord's two CDN hosts); a page or a non-media file stops at once. */
export async function downloadFirst(urls: string[], job: DownloadJob = {}): Promise<Downloaded> {
  let first: unknown;
  for (const url of urls) {
    try {
      return await download(url, job);
    } catch (e) {
      if (isAbort(e)) throw e;
      first ??= e;
      if (!(e instanceof DownloadError) || (e.reason !== 'network' && e.reason !== 'http')) throw e;
    }
  }
  throw first;
}

/**
 * Download a Google Drive file (desktop app only: Google refuses the file to web pages). Big files come
 * back as a "can't scan for viruses" page first, whose form is followed once; the other pages Google
 * sends (sign-in, quota, downloads turned off) become the matching message.
 */
export async function downloadDrive(ref: DriveRef, job: DownloadJob = {}): Promise<Downloaded> {
  let url = driveUrls.download(ref);
  for (let attempt = 0; ; attempt++) {
    try {
      return await download(url, job);
    } catch (e) {
      if (!(e instanceof DownloadError) || (e.reason !== 'html' && e.reason !== 'http')) throw e;
      const page = readDrivePage(e.html, e.status, e.url);
      if ('retry' in page && attempt === 0) {
        url = page.retry;
        continue;
      }
      throw new LinkError('retry' in page ? { problem: 'drive-page', message: linkMessages.drivePage } : page);
    }
  }
}

/**
 * What a link plays as when the page just shows it (a plain element: no download, no permission
 * needed): a picture, a video, a sound, or null if it doesn't load within 15 seconds.
 */
export function probeLink(url: string, want?: LinkKind, signal?: AbortSignal, ms = PROBE_MS): Promise<LinkKind | null> {
  return new Promise((resolve) => {
    let settled = false;
    let pending = 0;
    const img = want === 'video' || want === 'audio' ? null : new Image();
    const video = want === 'image' ? null : document.createElement('video');
    const finish = (kind: LinkKind | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onabort);
      img?.removeAttribute('src');
      if (video) {
        video.removeAttribute('src');
        video.load();
      }
      resolve(kind);
    };
    const failed = () => --pending <= 0 && finish(null);
    const onabort = () => finish(null);
    const timer = setTimeout(() => finish(null), ms);
    signal?.addEventListener('abort', onabort);
    if (img) {
      pending++;
      img.referrerPolicy = 'no-referrer';
      img.onload = () => (img.naturalWidth > 0 ? finish('image') : failed());
      img.onerror = failed;
      img.src = url;
    }
    if (video) {
      pending++;
      video.preload = 'metadata';
      video.muted = true;
      video.onloadedmetadata = () => finish(video.videoWidth > 0 ? 'video' : 'audio');
      video.onerror = failed;
      video.src = url;
    }
  });
}
