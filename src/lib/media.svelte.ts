// Media store: blobs for images/video/audio/fonts, keyed by MediaRef id.
// Kept in memory (with object URLs for rendering) and persisted to IndexedDB when available,
// so autosaved drafts keep their media. The .jbr pack is the portable copy.
import { del, get, keys, set } from 'idb-keyval';
import { newId, type Game, type MediaKind, type MediaRef } from './model';
import { uniqueMediaName } from './medianame';

const blobs = new Map<string, Blob>();
/** id → object URL, reactive so components re-render when media arrives. */
export const mediaUrls = $state<Record<string, string>>({});

const KEY = (id: string) => `media:${id}`;

export function registerBlob(id: string, blob: Blob): void {
  if (blobs.get(id) === blob) return;
  if (mediaUrls[id]) URL.revokeObjectURL(mediaUrls[id]);
  blobs.set(id, blob);
  mediaUrls[id] = URL.createObjectURL(blob);
}

export function getBlob(id: string): Blob | undefined {
  return blobs.get(id);
}

export async function putMedia(id: string, blob: Blob): Promise<void> {
  registerBlob(id, blob);
  try {
    await set(KEY(id), blob);
  } catch {
    /* storage unavailable: media lives in memory until the game is saved */
  }
}

/** Load any of the game's media that isn't in memory yet from IndexedDB. Returns ids still missing. */
export async function loadGameMedia(game: Game): Promise<string[]> {
  const missing: string[] = [];
  for (const ref of game.media) {
    if (blobs.has(ref.id)) continue;
    try {
      const b = await get<Blob>(KEY(ref.id));
      if (b) registerBlob(ref.id, b);
      else missing.push(ref.id);
    } catch {
      missing.push(ref.id);
    }
  }
  return missing;
}

/** Delete stored media not referenced by any of the given games. */
export async function pruneMedia(games: (Game | null | undefined)[]): Promise<void> {
  const keep = new Set(games.flatMap((g) => g?.media.map((m) => m.id) ?? []));
  try {
    for (const k of await keys()) {
      if (typeof k === 'string' && k.startsWith('media:') && !keep.has(k.slice(6))) await del(k);
    }
  } catch {
    /* ignore */
  }
  for (const id of [...blobs.keys()]) {
    if (!keep.has(id)) {
      blobs.delete(id);
      URL.revokeObjectURL(mediaUrls[id]);
      delete mediaUrls[id];
    }
  }
}

const EXT_KIND: Record<string, MediaKind> = {
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image', avif: 'image', bmp: 'image',
  mp4: 'video', webm: 'video', mov: 'video', mkv: 'video', ogv: 'video', m4v: 'video',
  mp3: 'audio', wav: 'audio', ogg: 'audio', oga: 'audio', m4a: 'audio', aac: 'audio', flac: 'audio', opus: 'audio',
  ttf: 'font', otf: 'font', woff: 'font', woff2: 'font',
};

const EXT_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  avif: 'image/avif', bmp: 'image/bmp', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  mkv: 'video/x-matroska', ogv: 'video/ogg', m4v: 'video/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
  oga: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', opus: 'audio/opus', ttf: 'font/ttf',
  otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2',
};

export function extOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

export function mediaKind(name: string, mime: string): MediaKind | null {
  const top = mime.split('/')[0];
  if (top === 'image' || top === 'video' || top === 'audio') return top;
  if (top === 'font') return 'font';
  return EXT_KIND[extOf(name)] ?? null;
}

export function mimeFor(name: string, mime?: string): string {
  return mime || EXT_MIME[extOf(name)] || 'application/octet-stream';
}

export const ACCEPT = {
  image: 'image/*,.svg,.avif',
  video: 'video/*,.mkv,.mov',
  audio: 'audio/*,.flac,.opus,.m4a',
  font: '.ttf,.otf,.woff,.woff2',
  any: 'image/*,video/*,audio/*,.mkv,.mov,.flac,.opus,.m4a',
};

/** Store a user file with the game and return its ref. SVGs are sanitized first. */
export async function addMediaFile(game: Game, file: File | Blob, name = (file as File).name ?? 'file'): Promise<MediaRef> {
  const mime = mimeFor(name, file.type);
  const kind = mediaKind(name, mime);
  if (!kind) throw new Error(`"${name}" isn't a supported image, video, audio or font file.`);
  let blob: Blob = file;
  if (mime === 'image/svg+xml') blob = new Blob([sanitizeSvg(await file.text())], { type: mime });
  // Same name as a file already in the game (e.g. every pasted screenshot is "image.png"): randomize it.
  const ref: MediaRef = { id: newId(), name: uniqueMediaName(game.media.map((m) => m.name), name), mime, size: blob.size, kind };
  await putMedia(ref.id, blob.type ? blob : new Blob([blob], { type: mime }));
  game.media.push(ref);
  return ref;
}

/** Strip scripts, event handlers and external references from an SVG (spec §10 security). */
export function sanitizeSvg(svg: string): string {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  doc.querySelectorAll('script, foreignObject').forEach((n) => n.remove());
  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of [...el.attributes]) {
      const v = attr.value.trim().toLowerCase();
      if (attr.name.startsWith('on') || ((attr.name === 'href' || attr.name === 'xlink:href') && v.startsWith('javascript:'))) {
        el.removeAttribute(attr.name);
      }
    }
  });
  return new XMLSerializer().serializeToString(doc);
}

/** Will this browser likely play the file? Used to warn on import (e.g. HEVC .mov). */
export function canPlay(mime: string): boolean {
  const el = document.createElement(mime.startsWith('audio') ? 'audio' : 'video');
  return el.canPlayType(mime) !== '';
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}
