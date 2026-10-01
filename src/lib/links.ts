// Online media links: recognise share links and turn them into the URLs the app can use.
// Every URL template for a third-party host lives here, because hosts change them (Google Drive did in
// 2024 and again in 2026), so a change means editing one file and its tests, never migrating games.
// Pure (no DOM, no Svelte state), so all of it is unit-tested (links.test.ts).

/** A Google Drive file: its id, plus the resource key some older link-shared files need. */
export interface DriveRef {
  id: string;
  resourceKey?: string;
}

export type LinkProblemCode =
  // Recognised links that can't be used as they are
  | 'not-link' | 'folder' | 'google-doc' | 'google-photos' | 'no-file' | 'short-link' | 'album' | 'discord-unsigned'
  | 'expired' | 'onedrive-personal' | 'box-viewer' | 'encrypted' | 'tenor-page' | 'embed-only'
  // Found out while downloading or trying the link
  | 'html-page' | 'not-media' | 'wrong-kind' | 'hotlink' | 'unreachable' | 'http' | 'save-failed'
  | 'drive-private' | 'drive-quota' | 'drive-no-download' | 'drive-page' | 'drive-browser' | 'drive-image';

/** A link we recognise but can't use as media, with what to tell the user. */
export interface LinkProblem {
  problem: LinkProblemCode;
  message: string;
}

export type LinkKind = 'image' | 'video' | 'audio';

/** A usable link to a picture, video or sound file, after undoing each host's share-page wrapping. */
export interface MediaLink {
  /** The link as pasted (tidied): kept on the media for credit and "Store in game". */
  source: string;
  /** Where to download the file from, in order (e.g. Discord's other CDN host second). */
  fetchUrls: string[];
  /** What to play straight from the internet, in order, when the file can't be downloaded. */
  playUrls: string[];
  /** Site name for messages ("files.catbox.moe", "Google Drive"). */
  host: string;
  /** What the link points to, when the URL says so (file extension or host). */
  kindHint?: LinkKind;
  /** The link stops working after a while. `when` finishes "stops working …" ("in about 3 hours"). */
  temporary?: { when: string; expiresAt?: number };
  /** Played in the site's own player on a slide (YouTube, Streamable), not as a file. */
  embed?: 'youtube' | 'streamable';
  /** The site blocks playing its files from other sites: never fall back to a live link. */
  noLive?: LinkProblem;
  /** A GIF turned into a video clip: loop it, muted. */
  gif?: boolean;
  /** A Google Drive file (the desktop app downloads it; the browser can only show pictures). */
  drive?: DriveRef;
}

export const isLinkProblem = (x: unknown): x is LinkProblem => !!x && typeof x === 'object' && 'problem' in x;

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

/** An http(s) URL, or null (javascript:, data:, file: and anything unparsable are refused). */
export function parseUrl(s: string): URL | null {
  try {
    const u = new URL(cleanLink(s));
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null;
  } catch {
    return null;
  }
}

/** Only http(s) links are ever stored, opened or played. */
export function isWebUrl(s: unknown): s is string {
  return typeof s === 'string' && /^https?:\/\//i.test(s.trim()) && !!parseUrl(s);
}

/** A URL inside a CSS url("…"), escaped so no link can end the string early. */
export function cssUrl(url: string): string {
  return `url("${url.replace(/["\\\n\r\f]/g, (c) => `\\${c.charCodeAt(0).toString(16)} `)}")`;
}

// ---------- YouTube ----------

export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\.|^m\./, '');
    let id: string | null = null;
    if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0] || null;
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'music.youtube.com')
      id = u.searchParams.get('v') ?? u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{6,})/)?.[1] ?? null;
    // Real ids are letters, digits, - and _ (anything else would end up in a URL or CSS unescaped).
    return id && /^[\w-]{6,}$/.test(id) ? id : null;
  } catch {
    return null;
  }
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

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;
const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|weba|mka)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv|mkv)$/i;

/** What a URL path's file extension says it is. */
export function kindFromPath(path: string): LinkKind | undefined {
  if (IMAGE_EXT.test(path)) return 'image';
  if (AUDIO_EXT.test(path)) return 'audio';
  if (VIDEO_EXT.test(path)) return 'video';
  return undefined;
}

// ---------- Google Drive ----------

const DRIVE_ID = /^[A-Za-z0-9_-]{25,}$/;
const DRIVE_HOSTS = new Set(['drive.google.com', 'docs.google.com', 'drive.usercontent.google.com', 'lh3.googleusercontent.com', 'www.googleapis.com']);

/** How to share a Drive file so the game can use it. */
export const DRIVE_SHARE_HINT = 'In Google Drive: Share → General access → Anyone with the link → Copy link.';

/**
 * A Google Drive link → the file it points to, a problem (folder, Google Doc, Photos…), or null when it isn't
 * a Drive link at all.
 */
export function parseDrive(link: string): DriveRef | LinkProblem | null {
  const u = parseUrl(link);
  if (!u) return null;
  const host = u.hostname.toLowerCase();
  if (host === 'photos.google.com' || host === 'photos.app.goo.gl')
    return { problem: 'google-photos', message: `That's a Google Photos link. Download the picture or video and add it to the game, or put it in Google Drive. ${DRIVE_SHARE_HINT}` };
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
    return { problem: 'folder', message: `That's a link to a Drive folder. Open the file inside it and copy the file's own link. ${DRIVE_SHARE_HINT}` };
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
  return { problem: 'no-file', message: `That Google Drive link doesn't point to a file. ${DRIVE_SHARE_HINT}` };
}

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

/** A second address for a picture that failed to load (a Drive image falls back to its thumbnail), or null. */
export function imageFallback(src: string): string | null {
  const m = src.match(/^https:\/\/lh3\.googleusercontent\.com\/d\/([A-Za-z0-9_-]{25,})(?:=w(\d+))?/);
  return m ? driveUrls.thumbnail({ id: m[1] }, m[2] ? +m[2] : undefined) : null;
}

// ---------- Every other host ----------

const KIND_NAME: Record<LinkKind | 'font', string> = { image: 'picture', video: 'video', audio: 'sound', font: 'font' };
const article = (w: string) => (/^[aeiou]/.test(w) ? 'an' : 'a');

/** The messages people see about links (plain English, one place). */
export const linkMessages = {
  notLink: "That doesn't look like a link. Paste a link that starts with https://",
  catboxAlbum: "That's a Catbox album page, not a file. Open it, right-click the file, choose Copy link. It should look like https://files.catbox.moe/abc123.mp4",
  imgurAlbum: "That's an Imgur album. Open the picture, right-click it, choose Copy image address (i.imgur.com/...).",
  discordUnsigned: 'This Discord link is incomplete. In Discord, right-click the file, choose Copy Link, and paste the whole link (it ends in ex=...&is=...&hm=...).',
  discordExpired: (date: string) => `This Discord link expired on ${date}. Discord links only last about a day. Copy a fresh one, or download the file and add it.`,
  folder: "That's a folder link. Open the file itself and copy its link.",
  onedrive: "OneDrive personal links can't be played by other apps. Download the file and add it, or upload it to catbox.moe.",
  box: "That Box link opens Box's viewer, not the file. Download the file and add it.",
  mega: "MEGA files are encrypted, so the game can't open them. Download the file and add it.",
  tenor: "That's a Tenor page. Right-click the GIF and choose Copy image address (media.tenor.com/...).",
  streamableOnly: 'Streamable videos can only go on a slide, with the 🌐 Link button.',
  youtubeOnly: 'YouTube videos can only go on a slide, with the 🌐 Link button.',
  htmlPage: "That link opens a web page, not a picture, video or sound file. Use the site's direct link, or right-click the media and choose Copy image/video address.",
  notMedia: "That link isn't a picture, video or sound the game can play.",
  heic: "That link is a HEIC photo (the iPhone's format), which the game can't show. Convert it to JPG or PNG, then add the file.",
  avi: "That link is an AVI video, which the game can't play. Convert it to MP4, then add the file.",
  wrongKind: (is: LinkKind | 'font', need: LinkKind | 'font') =>
    `That link is ${article(KIND_NAME[is])} ${KIND_NAME[is]}; this spot needs ${article(KIND_NAME[need])} ${KIND_NAME[need]}.`,
  hotlink: 'Pixeldrain blocks playing this file from other sites. Download it and add the file.',
  unreachable: (host: string) =>
    `Couldn't reach ${host}. Check that the link opens in your browser.` +
    (/catbox\.moe$/.test(host) ? ' catbox.moe is blocked in the UK and Ireland and by some internet providers; a VPN usually fixes it.' : '') +
    (/imgur\.com$/.test(host) ? " Imgur isn't available in the UK." : ''),
  /** The site answered with an error: what it means depends on the status. */
  http: (host: string, status: number) =>
    status === 404 || status === 410
      ? `${host} says the file doesn't exist (${status}). Check the link.`
      : status === 401 || status === 403
        ? `${host} says the file isn't shared publicly (${status}).`
        : status === 429
          ? `${host} is limiting downloads right now (${status}). Try again in a minute.`
          : status >= 500
            ? `${host} is having trouble right now (${status}). Try again later.`
            : `${host} says the file doesn't exist or isn't shared publicly (${status}).`,
  saved: (link: MediaLink) => `Stored in your game: it works offline now${link.temporary ? ` (the link itself expires ${link.temporary.when})` : ''}.`,
  /** Added as a live link: the site didn't allow a copy, or (`notSaved`) the user said no to a big file, or it's over 1 GB. */
  live: (link: MediaLink, desktop: boolean, notSaved?: 'declined' | 'too-big') =>
    (notSaved
      ? `Not saved in the game (${notSaved === 'declined' ? 'you chose not to' : "it's over 1 GB"}), so it plays from ${link.host} during the show. You'll need internet.`
      : `This site doesn't let the game save a copy, so it will play from ${link.host} during the show. You'll need internet.` +
        (desktop ? '' : ' The desktop app can save a copy.')) +
    (link.temporary ? ` Warning: this link stops working ${link.temporary.when}. Download the file and add it to the game, or upload it to catbox.moe.` : ''),
  saveFailed: (host: string, desktop: boolean) =>
    `${host} doesn't let the game save a copy. Download the file and add it instead${desktop ? '' : ', or use the desktop app'}.`,
  tooBig: "That file is bigger than 1 GB, too big to save in the game, and it won't play from the link either.",
  declined: (host: string) => `Not saved in the game (you chose not to), and it didn't play from ${host} either.`,
  drivePrivate: `This Google Drive file isn't shared publicly. ${DRIVE_SHARE_HINT}`,
  driveQuota:
    "Google Drive says too many people viewed or downloaded this file recently, so it's locked for now (up to 24 hours). Try again later, or download it in your browser and add the file.",
  driveNoDownload:
    "The owner turned off downloads for this Drive file. In Drive's Share ⚙ settings, tick \"Viewers and commenters can see the option to download\", or use Google Drive's player on a slide.",
  drivePage: `Google Drive sent a web page instead of the file. ${DRIVE_SHARE_HINT}`,
  driveBrowser: "Drive videos and sounds can't play inside the browser version. Download the file and add it, or use the desktop app.",
  driveImage: `Couldn't show that Google Drive picture. ${DRIVE_SHARE_HINT}`,
};

const problem = (code: LinkProblemCode, message: string): LinkProblem => ({ problem: code, message });

/** "Tue, Sep 30, 3:05 PM" (the reader's own locale and time zone). */
export function formatWhen(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** A file name from a URL path: its last segment, decoded ("my%20clip.mp4" → "my clip.mp4"). */
export function nameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').filter(Boolean).pop() ?? '';
    let name = seg;
    try {
      name = decodeURIComponent(seg);
    } catch {
      /* keep it encoded */
    }
    return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120) || u.hostname;
  } catch {
    return 'link';
  }
}

/**
 * A pasted link → where to download or play it from, a problem to explain, or null when it isn't a
 * web link at all. `want` is what the spot needs (a picker's kind); leave it out on a slide, where
 * YouTube and Streamable play in their own players. No network: this only reads the URL.
 */
export function parseMediaLink(raw: string, want?: LinkKind | 'font', now = Date.now()): MediaLink | LinkProblem | null {
  const u = parseUrl(raw);
  if (!u) return null;
  const source = u.href;
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const path = u.pathname;
  const segs = path.split('/').filter(Boolean);
  const direct = (url = source, extra: Partial<MediaLink> = {}): MediaLink => ({
    source,
    fetchUrls: [url],
    playUrls: [url],
    host: u.hostname.toLowerCase(),
    kindHint: kindFromPath(new URL(url).pathname),
    ...extra,
  });

  // YouTube and Streamable play in their own players, so only on a slide.
  if (youtubeId(source)) return want ? problem('embed-only', linkMessages.youtubeOnly) : { ...direct(), host: 'YouTube', embed: 'youtube', kindHint: 'video' };
  if (host === 'streamable.com') {
    const id = (segs[0] === 'e' || segs[0] === 'o' ? segs[1] : segs[0])?.match(/^[a-z0-9]+$/i)?.[0];
    if (id) return want ? problem('embed-only', linkMessages.streamableOnly) : { ...direct(`https://streamable.com/${id}`), host: 'Streamable', embed: 'streamable', kindHint: 'video' };
  }
  if (host.endsWith('.streamable.com') && u.searchParams.has('Expires')) {
    const expiresAt = Number(u.searchParams.get('Expires')) * 1000 || undefined;
    return direct(source, { temporary: { when: expiresAt ? `on ${formatWhen(expiresAt)}` : 'soon', expiresAt } });
  }

  // Google Drive (and Google Photos / goo.gl, which it explains).
  const drive = parseDrive(source);
  if (isLinkProblem(drive)) return drive;
  if (drive) {
    return {
      source,
      fetchUrls: [driveUrls.download(drive)],
      playUrls: [driveUrls.image(drive), driveUrls.thumbnail(drive)],
      host: 'Google Drive',
      drive,
    };
  }

  // Catbox: files.* is a direct, permanent file; litter.* expires; /c/ is an album page.
  if (host === 'catbox.moe' && segs[0] === 'c') return problem('album', linkMessages.catboxAlbum);
  if (host === 'litter.catbox.moe') return direct(source, { temporary: { when: 'within 3 days' } });

  // GitHub file pages → the raw file (the redirect GitHub would do can't be downloaded from a page).
  if (host === 'github.com' && (segs[2] === 'blob' || segs[2] === 'raw') && segs.length > 4)
    return direct(`https://raw.githubusercontent.com/${[segs[0], segs[1], ...segs.slice(3)].join('/')}`);

  // Dropbox share pages → the same path on the file host, keeping the key that unlocks the link.
  if (host === 'dropbox.com') {
    if (segs[0] === 'sh' || (segs[0] === 'scl' && segs[1] === 'fo')) return problem('folder', linkMessages.folder);
    if ((segs[0] === 'scl' && segs[1] === 'fi') || segs[0] === 's') {
      const keep = new URLSearchParams();
      for (const k of ['rlkey', 'st']) if (u.searchParams.get(k)) keep.set(k, u.searchParams.get(k)!);
      const q = keep.toString();
      const file = `https://dl.dropboxusercontent.com${path}${q ? `?${q}` : ''}`;
      const raw1 = new URL(source);
      raw1.searchParams.delete('dl');
      raw1.searchParams.set('raw', '1');
      return { ...direct(file), host: 'Dropbox', playUrls: [file, raw1.href] };
    }
  }

  // Discord attachment links are signed and expire (ex= is the expiry time in hex seconds).
  if ((host === 'cdn.discordapp.com' || host === 'media.discordapp.net') && /^(ephemeral-)?attachments$/.test(segs[0] ?? '')) {
    const [ex, is, hm] = ['ex', 'is', 'hm'].map((k) => u.searchParams.get(k));
    if (!ex || !is || !hm) return problem('discord-unsigned', linkMessages.discordUnsigned);
    const expiresAt = parseInt(ex, 16) * 1000;
    if (!Number.isFinite(expiresAt)) return problem('discord-unsigned', linkMessages.discordUnsigned);
    if (expiresAt < now) return problem('expired', linkMessages.discordExpired(formatWhen(expiresAt)));
    const other = new URL(source);
    other.hostname = host === 'cdn.discordapp.com' ? 'media.discordapp.net' : 'cdn.discordapp.com';
    return {
      ...direct(),
      host: 'Discord',
      fetchUrls: [source, other.href],
      playUrls: [source, other.href],
      temporary: { when: `on ${formatWhen(expiresAt)}`, expiresAt },
    };
  }

  // Imgur: .gifv is a page around an .mp4; imgur.com/ID is a page around i.imgur.com/ID.*
  if (host === 'i.imgur.com' && /\.gifv$/i.test(path))
    return want === 'image' ? direct(source.replace(/\.gifv(?=$|\?)/i, '.gif')) : { ...direct(source.replace(/\.gifv(?=$|\?)/i, '.mp4')), kindHint: 'video', gif: true };
  if (host === 'imgur.com' || host === 'm.imgur.com') {
    if (['a', 'gallery', 't', 'r', 'user'].includes(segs[0] ?? '')) return problem('album', linkMessages.imgurAlbum);
    const m = segs.length === 1 ? segs[0].match(/^([a-z0-9]{5,8})(\.[a-z0-9]+)?$/i) : null;
    if (m) {
      if (m[2]) return direct(`https://i.imgur.com/${m[1]}${m[2].toLowerCase() === '.gifv' ? '.mp4' : m[2]}`);
      const png = `https://i.imgur.com/${m[1]}.png`;
      const mp4 = `https://i.imgur.com/${m[1]}.mp4`;
      const order = want === 'video' || want === 'audio' ? [mp4, png] : [png, mp4];
      return { ...direct(order[0]), fetchUrls: order, playUrls: order, kindHint: undefined };
    }
  }

  // GIPHY: pages and every media host → the file itself (a looping muted MP4, or the GIF for a picture spot).
  // (i.giphy.com/ID.gif; media*.giphy.com/media/[v1.…/]ID/giphy.gif; giphy.com/gifs/some-slug-ID)
  const giphyId =
    host === 'giphy.com' && /^(gifs|stickers|clips|embed)$/.test(segs[0] ?? '') ? segs[1]?.split('-').pop()
    : /^(media\d*|i)\.giphy\.com$/.test(host)
      ? segs.length === 1 ? segs[0].replace(/\.\w+$/, '') : segs.filter((s) => s !== 'media' && !/^v1\./.test(s)).at(-2)
      : undefined;
  if (giphyId && /^[a-z0-9]+$/i.test(giphyId)) {
    if (want === 'image') return { ...direct(`https://i.giphy.com/${giphyId}.gif`), host: 'GIPHY' };
    // Clips have sound; GIFs and stickers are silent loops.
    return { ...direct(`https://media.giphy.com/media/${giphyId}/giphy.mp4`), host: 'GIPHY', kindHint: 'video', gif: segs[0] !== 'clips' };
  }

  // Tenor: the page isn't the file (media.tenor.com links are).
  if (host === 'tenor.com' && segs.includes('view')) return problem('tenor-page', linkMessages.tenor);

  // Pixeldrain: the viewer page → its file API. It refuses to be played from other sites.
  if (host === 'pixeldrain.com') {
    if (segs[0] === 'l') return problem('folder', linkMessages.folder);
    const id = segs[0] === 'u' ? segs[1] : segs[0] === 'api' && segs[1] === 'file' ? segs[2] : undefined;
    if (id) return { ...direct(`https://pixeldrain.com/api/file/${id}`), host: 'Pixeldrain', noLive: problem('hotlink', linkMessages.hotlink) };
  }

  // Short-lived upload sites.
  if (host === 'tmpfiles.org') {
    const file = segs[0] === 'dl' ? source : `https://tmpfiles.org/dl/${segs.join('/')}`;
    return { ...direct(file), temporary: { when: 'in about an hour' } };
  }
  if (host === 'uguu.se' || host.endsWith('.uguu.se')) return direct(source, { temporary: { when: 'in about 3 hours' } });

  // Microsoft, Box and MEGA share pages.
  if (host === '1drv.ms' || host === 'onedrive.live.com') return problem('onedrive-personal', linkMessages.onedrive);
  if (host.endsWith('.sharepoint.com')) {
    const d = new URL(source);
    d.searchParams.set('download', '1');
    return direct(d.href);
  }
  if ((host === 'box.com' || host.endsWith('.box.com')) && segs[0] === 's') return problem('box-viewer', linkMessages.box);
  if (host === 'mega.nz' || host === 'mega.io' || host === 'mega.co.nz') return problem('encrypted', linkMessages.mega);

  // Anything else is used as it is (qu.ax, pomf, 0x0.st, media.tenor.com, i.imgur.com, files.catbox.moe…).
  return direct();
}

// ---------- Site players on slides ----------

/** A site's own player for a slide item ('drive', 'streamable'): what to frame and what to open, or null. */
export function playerFor(kind: string, url: string): { src: string; openUrl: string; name: string } | null {
  if (kind === 'drive') {
    const ref = parseDrive(url);
    if (!ref || isLinkProblem(ref)) return null;
    return { src: driveUrls.preview(ref), openUrl: driveUrls.preview(ref), name: 'Google Drive player' };
  }
  if (kind === 'streamable') {
    const link = parseMediaLink(url);
    const id = link && !isLinkProblem(link) && link.embed === 'streamable' ? link.fetchUrls[0].split('/').pop() : undefined;
    return id ? { src: `https://streamable.com/e/${id}?autoplay=1`, openUrl: `https://streamable.com/e/${id}`, name: 'Streamable player' } : null;
  }
  return null;
}

/** How an online slide item is named (layers list, host controls, the player's title). */
export function embedName(kind: string, url: string): string {
  if (kind === 'youtube') return 'YouTube';
  if (kind === 'drive') return 'Google Drive player';
  if (kind === 'streamable') return 'Streamable player';
  return parseUrl(url)?.hostname ?? 'Link';
}

/** Where to send the host for an online slide item ("Check ↗", "Open link"). */
export function embedOpenUrl(kind: string, url: string, startAt?: number): string {
  const yt = kind === 'youtube' ? youtubeId(url) : null;
  if (yt) return youtubeWatchUrl(yt, startAt ?? youtubeStart(url));
  return playerFor(kind, url)?.openUrl ?? url;
}

/** Will a live link stop working? ('expired', 'temporary', or null as far as the link tells.) */
export function linkLifetime(ref: { url?: string; source?: string; expiresAt?: number }, now = Date.now()): 'expired' | 'temporary' | null {
  if (ref.expiresAt) return ref.expiresAt < now ? 'expired' : 'temporary';
  const p = parseMediaLink(ref.source ?? ref.url ?? '', undefined, now);
  if (isLinkProblem(p)) return p.problem === 'expired' ? 'expired' : null;
  return p?.temporary ? 'temporary' : null;
}

/** A link's site, for labels ("files.catbox.moe"). */
export function linkHost(url: string | undefined): string {
  return (url && parseUrl(url)?.hostname.replace(/^www\./, '')) || 'the internet';
}

/** Hosts whose links are media even without a file extension (so a pasted one isn't treated as text). */
const MEDIA_HOSTS =
  /(^|\.)(catbox\.moe|fatbox\.moe|dropbox\.com|dropboxusercontent\.com|discordapp\.(com|net)|imgur\.com|giphy\.com|tenor\.com|streamable\.com|pixeldrain\.com|tmpfiles\.org|uguu\.se|qu\.ax|1drv\.ms|onedrive\.live\.com|sharepoint\.com|box\.com|mega\.nz|drive\.google\.com|docs\.google\.com|googleusercontent\.com|photos\.google\.com|photos\.app\.goo\.gl)$/i;

/** Is this URL from a site whose links are pictures, videos or sounds (or explained ones)? */
export function isMediaHost(url: string): boolean {
  const u = parseUrl(url);
  if (!u) return false;
  if (youtubeId(u.href)) return true;
  if (u.hostname === 'github.com') return /\/(blob|raw)\//.test(u.pathname) && !!kindFromPath(u.pathname);
  return MEDIA_HOSTS.test(u.hostname);
}
