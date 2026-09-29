// What a downloaded file really is, read from its first bytes (file hosts often send every file as
// application/octet-stream), plus reading the web pages Google Drive sends instead of a file.
// Pure (no DOM), so it's unit-tested (sniff.test.ts).
import { linkMessages, type LinkKind, type LinkProblem } from './links';

const ascii = (b: Uint8Array, from: number, len: number) => String.fromCharCode(...b.subarray(from, from + len));
const has = (b: Uint8Array, from: number, s: string) => ascii(b, from, s.length) === s;

/** The media type of a file from its first bytes (64 are plenty), or null when it isn't one we know. */
export function sniffMime(b: Uint8Array): string | null {
  if (b.length < 4) return null;
  if (has(b, 0, '\x89PNG')) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (has(b, 0, 'GIF8')) return 'image/gif';
  if (has(b, 0, 'RIFF') && has(b, 8, 'WEBP')) return 'image/webp';
  if (has(b, 0, 'RIFF') && has(b, 8, 'WAVE')) return 'audio/wav';
  if (has(b, 0, 'RIFF') && has(b, 8, 'AVI ')) return 'video/x-msvideo';
  // "BM", then a header size one of the BMP versions uses.
  if (has(b, 0, 'BM') && [12, 40, 52, 56, 108, 124].includes(b[14]) && !b[15]) return 'image/bmp';
  if (has(b, 4, 'ftyp')) {
    const brand = ascii(b, 8, 4);
    if (/^M4[AB] /.test(brand)) return 'audio/mp4';
    if (brand === 'qt  ') return 'video/quicktime';
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
    if (/^(heic|heix|mif1|msf1)$/.test(brand)) return 'image/heic';
    return 'video/mp4';
  }
  // Older QuickTime files start straight with a movie atom instead of "ftyp".
  if (/^(moov|mdat|wide|free|skip|pnot)$/.test(ascii(b, 4, 4))) return 'video/quicktime';
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) {
    // EBML: WebM or Matroska, told apart by the DocType near the start.
    return ascii(b, 0, Math.min(64, b.length)).includes('webm') ? 'video/webm' : 'video/x-matroska';
  }
  if (has(b, 0, 'OggS')) return /theora/i.test(ascii(b, 0, Math.min(64, b.length))) ? 'video/ogg' : 'audio/ogg';
  if (has(b, 0, 'fLaC')) return 'audio/flac';
  if (has(b, 0, 'ID3')) return 'audio/mpeg';
  // An MPEG audio frame (MP3) or an AAC ADTS frame: 11 sync bits, then the layer (00 = AAC).
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return (b[1] & 0x06) === 0 ? 'audio/aac' : 'audio/mpeg';
  const head = textHead(b);
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(head)) return 'image/svg+xml';
  return null;
}

/** The start of a file as text, without a byte-order mark or leading whitespace. */
function textHead(b: Uint8Array): string {
  return new TextDecoder().decode(b.subarray(0, 512)).replace(/^\uFEFF/, '').trimStart();
}

/** Is this the start of a web page (Drive's warning pages, a share page…), not a file? */
export function looksLikeHtml(b: Uint8Array): boolean {
  return /^(<!doctype html|<html[\s>]|<head[\s>]|<body[\s>]|<!--[\s\S]*?-->\s*<(!doctype|html))/i.test(textHead(b));
}

export function kindOfMime(mime: string): LinkKind | null {
  const top = mime.split('/')[0];
  return top === 'image' || top === 'video' || top === 'audio' ? top : null;
}

const MIME_EXT: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp', 'image/avif': 'avif',
  'image/heic': 'heic', 'image/svg+xml': 'svg', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
  'video/x-matroska': 'mkv', 'video/ogg': 'ogv', 'video/x-msvideo': 'avi', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3',
  'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/flac': 'flac',
};

/** The media type a file name's extension stands for, or null. */
export function mimeFromName(name: string): string | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const alias: Record<string, string> = { jpeg: 'jpg', m4v: 'mp4', oga: 'ogg', opus: 'ogg' };
  const want = alias[ext] ?? ext;
  return Object.keys(MIME_EXT).find((m) => MIME_EXT[m] === want) ?? null;
}

/** `name` with an extension that matches the file's real type ("download" → "download.mp4"). */
export function withExtension(name: string, mime: string): string {
  const ext = MIME_EXT[mime];
  if (!ext) return name;
  const dot = name.lastIndexOf('.');
  const cur = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  const same = cur === ext || (ext === 'jpg' && cur === 'jpeg') || (ext === 'mp4' && cur === 'm4v') || (ext === 'ogg' && (cur === 'oga' || cur === 'opus'));
  if (same) return name;
  // A known media extension that disagrees (e.g. ".png" on a JPEG) is replaced; anything else is kept.
  const base = dot > 0 && /^(png|jpe?g|gif|webp|bmp|avif|svg|mp4|m4v|webm|mov|mkv|ogv|avi|mp3|m4a|aac|ogg|oga|opus|wav|flac|bin)$/.test(cur) ? name.slice(0, dot) : name;
  return `${base}.${ext}`;
}

/** The file name from a Content-Disposition header (filename*=UTF-8''… wins over filename="…"). */
export function filenameFromDisposition(header: string | null | undefined): string | null {
  if (!header) return null;
  const star = header.match(/filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i);
  if (star) {
    try {
      return clean(decodeURIComponent(star[2].trim().replace(/^"|"$/g, '')));
    } catch {
      /* fall through to the plain name */
    }
  }
  const plain = header.match(/filename\s*=\s*("((?:\\.|[^"\\])*)"|[^;]+)/i);
  if (!plain) return null;
  return clean((plain[2] ?? plain[1]).replace(/\\(.)/g, '$1').trim());
}

function clean(name: string): string | null {
  const base = name.split(/[\\/]/).pop() ?? '';
  const safe = base.replace(/[:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 120);
  return safe || null;
}

const decodeEntities = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const attr = (tag: string, name: string) => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? decodeEntities(m[2] ?? m[3] ?? m[4] ?? '') : null;
};

/**
 * What a page Google Drive sent instead of the file means. Big files get a "can't scan for viruses"
 * page whose form leads to the file (`retry`); the rest are problems to explain. Google changes these
 * pages (the form moved in 2024 and again in September 2026), so this reads them loosely.
 */
export function readDrivePage(html: string, status: number, finalUrl = ''): { retry: string } | LinkProblem {
  const form = html.match(/<form\b[^>]*\bid\s*=\s*["']?download-form\b[^>]*>([\s\S]*?)<\/form>/i);
  if (form) {
    const tag = form[0].slice(0, form[0].indexOf('>') + 1);
    const action = attr(tag, 'action') || 'https://drive.usercontent.google.com/download';
    const url = new URL(action, 'https://drive.usercontent.google.com/');
    for (const input of form[1].match(/<input\b[^>]*>/gi) ?? []) {
      const name = attr(input, 'name');
      if (name && (attr(input, 'type') ?? 'hidden').toLowerCase() === 'hidden') url.searchParams.set(name, attr(input, 'value') ?? '');
    }
    if (url.protocol === 'https:' && /(^|\.)google(usercontent)?\.com$/.test(url.hostname)) return { retry: url.href };
  }
  // The older page: a "Download anyway" link.
  const a = html.match(/<a\b[^>]*\bid\s*=\s*["']?uc-download-link\b[^>]*>/i);
  const href = a && attr(a[0], 'href');
  if (href) {
    const url = new URL(href, 'https://drive.google.com/');
    if (url.protocol === 'https:' && /(^|\.)google(usercontent)?\.com$/.test(url.hostname)) return { retry: url.href };
  }
  if (/too many users|quota (has been )?exceeded|download quota|uc-error-subcaption/i.test(html)) return { problem: 'drive-quota', message: linkMessages.driveQuota };
  if (/cannot ?download|can(?:no|')t be downloaded|download(?:ing)? (?:is |has been )?disabled|only (?:view|see) this file/i.test(html))
    return { problem: 'drive-no-download', message: linkMessages.driveNoDownload };
  let host = '';
  try {
    host = new URL(finalUrl).hostname;
  } catch {
    /* no final URL */
  }
  if (host === 'accounts.google.com' || status === 401 || status === 403 || status === 404 || /you need access|request access|servicelogin|sign in/i.test(html))
    return { problem: 'drive-private', message: linkMessages.drivePrivate };
  return { problem: 'drive-page', message: linkMessages.drivePage };
}
