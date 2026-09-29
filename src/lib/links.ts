// Online media links: recognise share links and turn them into the URLs the app can use.
// Every URL template for a third-party host lives here, because hosts change them (Google Drive did in
// 2024 and again in 2026), so a change means editing one file and its tests, never migrating games.

/** A Google Drive file: its id, plus the resource key some older link-shared files need. */
export interface DriveRef {
  id: string;
  resourceKey?: string;
}

/** A link we recognise but can't use as media, with what to tell the user. */
export interface LinkProblem {
  problem: 'folder' | 'google-doc' | 'google-photos' | 'no-file' | 'short-link';
  message: string;
}

/** Tidy a link pasted from chat or a document: whitespace, <…>, and trailing punctuation. */
export function cleanLink(s: string): string {
  let t = s.trim();
  for (;;) {
    const last = t.at(-1);
    if (last && '.,;:!?\'"'.includes(last)) t = t.slice(0, -1).trimEnd();
    // A trailing ")" only when unbalanced, so links that really end in ")" survive.
    else if (last === ')' && (t.match(/\(/g)?.length ?? 0) < (t.match(/\)/g)?.length ?? 0)) t = t.slice(0, -1);
    else if (t.startsWith('<') && last === '>') t = t.slice(1, -1).trim();
    else break;
  }
  return t;
}

function parseUrl(s: string): URL | null {
  try {
    const u = new URL(cleanLink(s));
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null;
  } catch {
    return null;
  }
}

const DRIVE_ID = /^[A-Za-z0-9_-]{25,}$/;
const DRIVE_HOSTS = new Set(['drive.google.com', 'docs.google.com', 'drive.usercontent.google.com', 'lh3.googleusercontent.com', 'www.googleapis.com']);

const SHARE_HINT = "In Google Drive, use Share → General access → \"Anyone with the link\", then Copy link.";

/**
 * A Google Drive link → the file it points to, a problem (folder, Google Doc, Photos…), or null when it isn't
 * a Drive link at all.
 */
export function parseDrive(link: string): DriveRef | LinkProblem | null {
  const u = parseUrl(link);
  if (!u) return null;
  const host = u.hostname.toLowerCase();
  if (host === 'photos.google.com' || host === 'photos.app.goo.gl')
    return { problem: 'google-photos', message: `That's a Google Photos link. Download the picture or video and add it to the game, or put it in Google Drive. ${SHARE_HINT}` };
  if (host === 'goo.gl') return { problem: 'short-link', message: 'Short goo.gl links no longer work. Paste the full Google Drive link.' };
  if (!DRIVE_HOSTS.has(host)) return null;
  const path = u.pathname;
  const q = new Map([...u.searchParams].map(([k, v]) => [k.toLowerCase(), v]));
  const withKey = (id: string): DriveRef | null => {
    if (!DRIVE_ID.test(id)) return null;
    const rk = q.get('resourcekey');
    return rk ? { id, resourceKey: rk } : { id };
  };

  if (host === 'lh3.googleusercontent.com') {
    const m = path.match(/^\/d\/([A-Za-z0-9_-]+)(?:=[^/]*)?\/?$/);
    return (m && withKey(m[1])) || null;
  }
  if (host === 'www.googleapis.com') {
    const m = path.match(/^\/drive\/v[23]\/files\/([A-Za-z0-9_-]+)/);
    return (m && withKey(m[1])) || null;
  }
  if (/\/(?:u\/\d+\/)?folders\//.test(path) || /\/embeddedfolderview/.test(path))
    return { problem: 'folder', message: `That's a link to a Drive folder. Open the file inside it and copy the file's own link. ${SHARE_HINT}` };
  if (/^\/(?:a\/[^/]+\/)?(?:document|spreadsheets|presentation|forms|drawings)\/(?:u\/\d+\/)?d\//.test(path))
    return { problem: 'google-doc', message: "That's a Google Docs/Sheets/Slides file, not a picture, video or audio file." };

  // /file/d/ID, /file/u/0/d/ID, /a/domain/file/d/ID (…/view, /edit, /preview)
  const m = path.match(/^(?:\/a\/[^/]+)?\/file(?:\/u\/\d+)?\/d\/([A-Za-z0-9_-]+)/);
  if (m) return withKey(m[1]) ?? { problem: 'no-file', message: "That Google Drive link doesn't point to a file." };
  // ?id=ID on /open, /uc, /download, /thumbnail (optionally under /u/N/ or /a/domain/)
  if (/^(?:\/a\/[^/]+|\/u\/\d+)?\/(?:open|uc|download|thumbnail)\/?$/.test(path)) {
    const id = q.get('id');
    const ref = id ? withKey(id) : null;
    if (ref) return ref;
  }
  return { problem: 'no-file', message: `That Google Drive link doesn't point to a file. ${SHARE_HINT}` };
}

export const isDriveProblem = (x: DriveRef | LinkProblem | null): x is LinkProblem => !!x && 'problem' in x;

const rk = (ref: DriveRef, sep: '?' | '&') => (ref.resourceKey ? `${sep}resourcekey=${encodeURIComponent(ref.resourceKey)}` : '');

/** URLs for a Drive file. Which of these work where is documented on each. */
export const driveUrls = {
  /** The Drive page (open in a normal browser tab/window). `t` = start time in seconds. */
  view: (ref: DriveRef, t?: number) => `https://drive.google.com/file/d/${ref.id}/view${rk(ref, '?')}${t ? `${ref.resourceKey ? '&' : '?'}t=${Math.round(t)}` : ''}`,
  /** Drive's own player, for an iframe or a popup window (not controllable from the app). */
  preview: (ref: DriveRef) => `https://drive.google.com/file/d/${ref.id}/preview${rk(ref, '?')}`,
  /**
   * The file itself. Google refuses it (403) as an <img>/<video>/<audio> src or fetch() from any other
   * site, file:// and the desktop app's webview included; it only works as a top-level navigation (the
   * browser downloads it) or from the desktop app's native side.
   */
  download: (ref: DriveRef) => `https://drive.usercontent.google.com/download?id=${ref.id}&export=download&confirm=t${rk(ref, '&')}`,
  /** An image rendition that other sites may show (use referrerpolicy="no-referrer"). Videos give a poster frame. */
  image: (ref: DriveRef, width = 1920) => `https://lh3.googleusercontent.com/d/${ref.id}=w${width}`,
  /** A static thumbnail (rate-limited: only for what's on screen). */
  thumbnail: (ref: DriveRef, width = 1920) => `https://drive.google.com/thumbnail?id=${ref.id}&sz=w${width}`,
};
