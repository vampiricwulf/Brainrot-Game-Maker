import { describe, expect, it } from 'vitest';
import {
  cleanLink, cssUrl, driveUrls, embedName, embedOpenUrl, imageFallback, isDriveProblem, isLinkProblem, isMediaHost, isWebUrl, linkLifetime,
  linkMessages, nameFromUrl, parseDrive, parseMediaLink, playerFor, youtubeId,
  type LinkKind, type LinkProblem, type LinkProblemCode, type MediaLink,
} from './links';

const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345'; // modern 33-character id
const OLD = '0B1234567890abcdefghijklmnop'; // legacy 28-character id

describe('cleanLink', () => {
  it('strips chat punctuation and angle brackets', () => {
    expect(cleanLink('  <https://x.test/a.mp4>  ')).toBe('https://x.test/a.mp4');
    expect(cleanLink('https://x.test/a.mp4).')).toBe('https://x.test/a.mp4');
    expect(cleanLink('https://x.test/a.mp4)')).toBe('https://x.test/a.mp4');
    expect(cleanLink('<https://x.test/a.mp4>.')).toBe('https://x.test/a.mp4');
    expect(cleanLink('https://en.wikipedia.org/wiki/Foo_(bar)')).toBe('https://en.wikipedia.org/wiki/Foo_(bar)');
  });
});

describe('parseDrive', () => {
  const ok = (link: string, id = ID, resourceKey?: string) =>
    expect(parseDrive(link), link).toEqual(resourceKey ? { id, resourceKey } : { id });

  it('reads every file link shape', () => {
    ok(`https://drive.google.com/file/d/${ID}/view?usp=sharing`);
    ok(`https://drive.google.com/file/d/${ID}/view?usp=drive_link`);
    ok(`https://drive.google.com/file/d/${ID}/edit`);
    ok(`https://drive.google.com/file/d/${ID}/preview`);
    ok(`https://drive.google.com/file/d/${ID}`);
    ok(`https://drive.google.com/file/u/0/d/${ID}/view`);
    ok(`https://drive.google.com/a/school.edu/file/d/${ID}/view`);
    ok(`https://docs.google.com/file/d/${ID}/edit`);
    ok(`https://drive.google.com/open?id=${ID}`);
    ok(`https://drive.google.com/u/1/open?id=${ID}&authuser=0`);
    ok(`https://drive.google.com/a/school.edu/open?id=${ID}`);
    ok(`https://drive.google.com/uc?id=${ID}&export=download`);
    ok(`https://drive.google.com/uc?export=view&id=${OLD}`, OLD);
    ok(`https://drive.usercontent.google.com/download?id=${ID}&export=download&confirm=t`);
    ok(`https://drive.google.com/thumbnail?id=${ID}&sz=w1000`);
    ok(`https://lh3.googleusercontent.com/d/${ID}=w1920`);
    ok(`https://lh3.googleusercontent.com/d/${ID}`);
    ok(`https://www.googleapis.com/drive/v3/files/${ID}?alt=media&key=abc`);
    ok(`<https://drive.google.com/file/d/${ID}/view?usp=sharing>.`);
  });

  it('keeps the resource key', () => {
    ok(`https://drive.google.com/file/d/${OLD}/view?resourcekey=0-abcDEF123`, OLD, '0-abcDEF123');
    ok(`https://drive.google.com/open?id=${OLD}&resourceKey=0-xyz`, OLD, '0-xyz');
  });

  it('explains links that are not media files', () => {
    const problem = (link: string) => {
      const r = parseDrive(link);
      expect(isDriveProblem(r), link).toBe(true);
      return isDriveProblem(r) ? r.problem : '';
    };
    expect(problem('https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz0')).toBe('folder');
    expect(problem('https://drive.google.com/drive/u/0/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz0?usp=sharing')).toBe('folder');
    expect(problem(`https://docs.google.com/document/d/${ID}/edit`)).toBe('google-doc');
    expect(problem(`https://docs.google.com/presentation/d/${ID}/edit#slide=id.p`)).toBe('google-doc');
    expect(problem('https://photos.app.goo.gl/AbCdEf123')).toBe('google-photos');
    expect(problem('https://goo.gl/abc')).toBe('short-link');
    expect(problem('https://drive.google.com/drive/my-drive')).toBe('no-file');
    expect(problem('https://drive.google.com/file/d/short/view')).toBe('no-file');
  });

  it('ignores everything else', () => {
    expect(parseDrive('https://files.catbox.moe/abc123.mp4')).toBeNull();
    expect(parseDrive('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(parseDrive('not a link')).toBeNull();
    expect(parseDrive('javascript:alert(1)')).toBeNull();
    expect(parseDrive('https://lh3.googleusercontent.com/a/profile-photo')).toBeNull();
  });
});

describe('driveUrls', () => {
  it('builds the player, page, download and image URLs', () => {
    const ref = { id: ID };
    expect(driveUrls.preview(ref)).toBe(`https://drive.google.com/file/d/${ID}/preview`);
    expect(driveUrls.view(ref, 42.4)).toBe(`https://drive.google.com/file/d/${ID}/view?t=42`);
    expect(driveUrls.download(ref)).toBe(`https://drive.usercontent.google.com/download?id=${ID}&export=download&confirm=t`);
    expect(driveUrls.image(ref)).toBe(`https://lh3.googleusercontent.com/d/${ID}=w1920`);
    const withKey = { id: OLD, resourceKey: '0-a b' };
    expect(driveUrls.preview(withKey)).toBe(`https://drive.google.com/file/d/${OLD}/preview?resourcekey=0-a%20b`);
    expect(driveUrls.view(withKey, 5)).toBe(`https://drive.google.com/file/d/${OLD}/view?resourcekey=0-a%20b&t=5`);
    expect(driveUrls.download(withKey)).toContain('&resourcekey=0-a%20b');
  });
});

// ---------- parseMediaLink: every host the game knows ----------

const NOW = Date.UTC(2026, 8, 29, 12, 0, 0);
const hex = (ms: number) => Math.floor(ms / 1000).toString(16);
const FUTURE = hex(NOW + 20 * 3600 * 1000);
const PAST = hex(NOW - 3600 * 1000);
const discord = (host: string, q: string) => `https://${host}/attachments/111/222/clip.mp4${q}`;

type Row = [label: string, input: string, expected: Partial<MediaLink> | LinkProblemCode | null, want?: LinkKind];
const rows: Row[] = [
  // Direct links are used as they are.
  ['catbox file', 'https://files.catbox.moe/abc123.mp4', { fetchUrls: ['https://files.catbox.moe/abc123.mp4'], kindHint: 'video' }],
  ['catbox sound', 'https://files.catbox.moe/abc123.mp3', { kindHint: 'audio', host: 'files.catbox.moe' }],
  ['fatbox mirror', 'https://files.fatbox.moe/abc123.png', { fetchUrls: ['https://files.fatbox.moe/abc123.png'], kindHint: 'image' }],
  ['catbox album', 'https://catbox.moe/c/abc123', 'album'],
  ['litterbox', 'https://litter.catbox.moe/abc123.webm', { temporary: { when: 'within 3 days' }, kindHint: 'video' }],
  ['qu.ax', 'https://qu.ax/xyz.mp4', { fetchUrls: ['https://qu.ax/xyz.mp4'] }],
  ['0x0.st', 'https://0x0.st/abc.png', { kindHint: 'image' }],
  ['tenor media', 'https://media.tenor.com/abcDEF/cat.gif', { fetchUrls: ['https://media.tenor.com/abcDEF/cat.gif'], kindHint: 'image' }],
  ['no extension', 'https://example.com/media/12345', { fetchUrls: ['https://example.com/media/12345'], kindHint: undefined }],
  // GitHub pages → the raw file.
  ['github blob', 'https://github.com/me/repo/blob/main/sounds/ding.mp3', { fetchUrls: ['https://raw.githubusercontent.com/me/repo/main/sounds/ding.mp3'], kindHint: 'audio' }],
  ['github raw=true', 'https://github.com/me/repo/raw/v1.2/img/a%20b.png?raw=true', { fetchUrls: ['https://raw.githubusercontent.com/me/repo/v1.2/img/a%20b.png'] }],
  // Dropbox share pages → the file host, keeping rlkey/st, dropping dl.
  [
    'dropbox scl/fi',
    'https://www.dropbox.com/scl/fi/abc123/clip.mp4?rlkey=KEY9&st=ST1&dl=0',
    {
      fetchUrls: ['https://dl.dropboxusercontent.com/scl/fi/abc123/clip.mp4?rlkey=KEY9&st=ST1'],
      playUrls: ['https://dl.dropboxusercontent.com/scl/fi/abc123/clip.mp4?rlkey=KEY9&st=ST1', 'https://www.dropbox.com/scl/fi/abc123/clip.mp4?rlkey=KEY9&st=ST1&raw=1'],
      host: 'Dropbox',
    },
  ],
  ['dropbox /s/', 'https://dropbox.com/s/xyz789/pic.png?dl=0', { fetchUrls: ['https://dl.dropboxusercontent.com/s/xyz789/pic.png'], kindHint: 'image' }],
  ['dropbox folder', 'https://www.dropbox.com/scl/fo/abc/xyz?rlkey=1', 'folder'],
  ['dropbox sh', 'https://www.dropbox.com/sh/abc/xyz', 'folder'],
  // Discord: signed, expiring links.
  [
    'discord signed',
    discord('cdn.discordapp.com', `?ex=${FUTURE}&is=66aa&hm=beef&`),
    {
      host: 'Discord',
      fetchUrls: [discord('cdn.discordapp.com', `?ex=${FUTURE}&is=66aa&hm=beef&`), discord('media.discordapp.net', `?ex=${FUTURE}&is=66aa&hm=beef&`)],
      temporary: { when: expect.stringMatching(/^on /) as unknown as string, expiresAt: parseInt(FUTURE, 16) * 1000 },
    },
  ],
  ['discord media host', discord('media.discordapp.net', `?ex=${FUTURE}&is=1&hm=2`), { fetchUrls: [discord('media.discordapp.net', `?ex=${FUTURE}&is=1&hm=2`), discord('cdn.discordapp.com', `?ex=${FUTURE}&is=1&hm=2`)] }],
  ['discord unsigned', discord('cdn.discordapp.com', ''), 'discord-unsigned'],
  ['discord half-signed', discord('cdn.discordapp.com', `?ex=${FUTURE}`), 'discord-unsigned'],
  ['discord expired', discord('cdn.discordapp.com', `?ex=${PAST}&is=1&hm=2`), 'expired'],
  // Imgur
  ['imgur gifv', 'https://i.imgur.com/AbC123x.gifv', { fetchUrls: ['https://i.imgur.com/AbC123x.mp4'], kindHint: 'video', gif: true }],
  ['imgur gifv for a picture', 'https://i.imgur.com/AbC123x.gifv', { fetchUrls: ['https://i.imgur.com/AbC123x.gif'], kindHint: 'image' }, 'image'],
  ['imgur direct', 'https://i.imgur.com/AbC123x.jpg', { fetchUrls: ['https://i.imgur.com/AbC123x.jpg'], kindHint: 'image' }],
  ['imgur page', 'https://imgur.com/AbC123x', { fetchUrls: ['https://i.imgur.com/AbC123x.png', 'https://i.imgur.com/AbC123x.mp4'] }],
  ['imgur page for a video spot', 'https://imgur.com/AbC123x', { fetchUrls: ['https://i.imgur.com/AbC123x.mp4', 'https://i.imgur.com/AbC123x.png'] }, 'video'],
  ['imgur album', 'https://imgur.com/a/AbC123x', 'album'],
  ['imgur gallery', 'https://imgur.com/gallery/funny-AbC123x', 'album'],
  // GIPHY
  ['giphy page', 'https://giphy.com/gifs/funny-cat-dancing-l0HlBO7eyXzSZkJri', { fetchUrls: ['https://media.giphy.com/media/l0HlBO7eyXzSZkJri/giphy.mp4'], kindHint: 'video', gif: true, host: 'GIPHY' }],
  ['giphy page for a picture', 'https://giphy.com/gifs/funny-cat-dancing-l0HlBO7eyXzSZkJri', { fetchUrls: ['https://i.giphy.com/l0HlBO7eyXzSZkJri.gif'], kindHint: 'image' }, 'image'],
  ['giphy media v1', 'https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjEx/3o7TKSjRrfIPjeiVyM/giphy.gif?cid=1', { fetchUrls: ['https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.mp4'] }],
  ['giphy i.', 'https://i.giphy.com/3o7TKSjRrfIPjeiVyM.webp', { fetchUrls: ['https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.mp4'] }],
  ['giphy clip keeps its sound', 'https://giphy.com/clips/show-name-abcDEF123', { gif: false, kindHint: 'video' }],
  // Tenor, Streamable, YouTube
  ['tenor page', 'https://tenor.com/view/cat-dance-gif-12345', 'tenor-page'],
  ['tenor page (locale)', 'https://tenor.com/en-GB/view/cat-dance-gif-12345', 'tenor-page'],
  ['streamable on a slide', 'https://streamable.com/abc12', { embed: 'streamable', fetchUrls: ['https://streamable.com/abc12'] }],
  ['streamable embed page', 'https://streamable.com/e/abc12', { embed: 'streamable', fetchUrls: ['https://streamable.com/abc12'] }],
  ['streamable in a picker', 'https://streamable.com/abc12', 'embed-only', 'video'],
  ['youtube on a slide', 'https://youtu.be/dQw4w9WgXcQ?t=42', { embed: 'youtube', host: 'YouTube' }],
  ['youtube in a picker', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'embed-only', 'audio'],
  // Pixeldrain, tmpfiles, uguu
  ['pixeldrain page', 'https://pixeldrain.com/u/AbCdEf12', { fetchUrls: ['https://pixeldrain.com/api/file/AbCdEf12'], noLive: { problem: 'hotlink', message: expect.any(String) as unknown as string } }],
  ['pixeldrain list', 'https://pixeldrain.com/l/AbCdEf12', 'folder'],
  ['tmpfiles page', 'https://tmpfiles.org/1234567/clip.mp4', { fetchUrls: ['https://tmpfiles.org/dl/1234567/clip.mp4'], temporary: { when: 'in about an hour' } }],
  ['tmpfiles dl', 'https://tmpfiles.org/dl/1234567/clip.mp4', { fetchUrls: ['https://tmpfiles.org/dl/1234567/clip.mp4'] }],
  ['uguu', 'https://h.uguu.se/AbCdEf.mp3', { temporary: { when: 'in about 3 hours' }, kindHint: 'audio' }],
  // Microsoft, Box, MEGA
  ['sharepoint', 'https://contoso.sharepoint.com/:v:/g/personal/me/EAbCd?e=xyz', { fetchUrls: ['https://contoso.sharepoint.com/:v:/g/personal/me/EAbCd?e=xyz&download=1'] }],
  ['onedrive short', 'https://1drv.ms/v/s!AbCdEf', 'onedrive-personal'],
  ['onedrive live', 'https://onedrive.live.com/?cid=1&id=2', 'onedrive-personal'],
  ['box share page', 'https://app.box.com/s/abc123', 'box-viewer'],
  ['box company share page', 'https://acme.app.box.com/s/abc123', 'box-viewer'],
  ['box static file', 'https://app.box.com/shared/static/abc123.mp4', { fetchUrls: ['https://app.box.com/shared/static/abc123.mp4'], kindHint: 'video' }],
  ['mega', 'https://mega.nz/file/AbC#key', 'encrypted'],
  // Google Drive
  [
    'drive share link',
    `https://drive.google.com/file/d/${ID}/view?usp=sharing`,
    {
      host: 'Google Drive',
      drive: { id: ID },
      fetchUrls: [`https://drive.usercontent.google.com/download?id=${ID}&export=download&confirm=t`],
      playUrls: [`https://lh3.googleusercontent.com/d/${ID}=w1920`, `https://drive.google.com/thumbnail?id=${ID}&sz=w1920`],
    },
  ],
  ['drive folder', 'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz0', 'folder'],
  ['google doc', `https://docs.google.com/document/d/${ID}/edit`, 'google-doc'],
  // Not web links at all
  ['javascript:', 'javascript:alert(1)', null],
  ['data:', 'data:image/png;base64,AAAA', null],
  ['file:', 'file:///C:/clip.mp4', null],
  ['plain text', 'a frog in a hat', null],
];

describe('parseMediaLink', () => {
  it.each(rows)('%s', (_label, input, expected, want) => {
    const r = parseMediaLink(input, want, NOW);
    if (expected === null) return expect(r).toBeNull();
    if (typeof expected === 'string') {
      expect(isLinkProblem(r), JSON.stringify(r)).toBe(true);
      return expect((r as LinkProblem).problem).toBe(expected);
    }
    expect(isLinkProblem(r), JSON.stringify(r)).toBe(false);
    expect(r).toMatchObject(expected);
  });

  it('keeps the pasted link (tidied) as the source', () => {
    const r = parseMediaLink('  <https://files.catbox.moe/abc123.mp4>. ') as MediaLink;
    expect(r.source).toBe('https://files.catbox.moe/abc123.mp4');
    expect(r.temporary, 'catbox files are permanent').toBeUndefined();
  });

  it('explains problems in plain words', () => {
    const msg = (link: string, want?: LinkKind) => (parseMediaLink(link, want, NOW) as LinkProblem).message;
    expect(msg('https://catbox.moe/c/abc')).toContain('https://files.catbox.moe/abc123.mp4');
    expect(msg(discord('cdn.discordapp.com', ''))).toContain('ex=...&is=...&hm=...');
    expect(msg(discord('cdn.discordapp.com', `?ex=${PAST}&is=1&hm=2`))).toMatch(/^This Discord link expired on .+\. Discord links only last about a day\./);
    expect(msg('https://tenor.com/view/x-gif-1')).toContain('media.tenor.com');
    expect(msg('https://streamable.com/abc12', 'video')).toContain('🌐 Link');
  });
});

describe('link messages', () => {
  const link = parseMediaLink('https://litter.catbox.moe/abc.mp4') as MediaLink;
  const permanent = parseMediaLink('https://files.catbox.moe/abc.mp4') as MediaLink;
  it('say what happened', () => {
    expect(linkMessages.saved(permanent)).toBe('Saved a copy in your game. It works offline now.');
    expect(linkMessages.saved(link)).toBe('Saved a copy in your game. It works offline now (the link itself expires within 3 days).');
    expect(linkMessages.live(permanent, false)).toBe(
      "This site doesn't let the game save a copy, so it will play from files.catbox.moe during the show. You'll need internet. The desktop app can save a copy.",
    );
    expect(linkMessages.live(link, true)).toContain('Warning: this link stops working within 3 days.');
    expect(linkMessages.wrongKind('video', 'image')).toBe('That link is a video; this spot needs a picture.');
    expect(linkMessages.wrongKind('image', 'audio')).toBe('That link is a picture; this spot needs a sound.');
    expect(linkMessages.unreachable('files.catbox.moe')).toContain('VPN');
    expect(linkMessages.unreachable('i.imgur.com')).toContain("Imgur isn't available in the UK.");
    expect(linkMessages.http('example.com', 404)).toBe("example.com says the file doesn't exist or isn't shared publicly (404).");
  });
});

describe('site players and link helpers', () => {
  it('builds Google Drive and Streamable players', () => {
    expect(playerFor('drive', `https://drive.google.com/file/d/${ID}/view`)).toEqual({
      src: `https://drive.google.com/file/d/${ID}/preview`,
      openUrl: `https://drive.google.com/file/d/${ID}/preview`,
      name: 'Google Drive player',
    });
    expect(playerFor('streamable', 'https://streamable.com/abc12')?.src).toBe('https://streamable.com/e/abc12?autoplay=1');
    expect(playerFor('drive', 'https://example.com/x')).toBeNull();
    expect(embedName('drive', 'x')).toBe('Google Drive player');
    expect(embedName('remoteVideo', 'https://files.catbox.moe/a.mp4')).toBe('files.catbox.moe');
    expect(embedOpenUrl('youtube', 'https://youtu.be/dQw4w9WgXcQ', 30)).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s');
  });

  it('falls a Drive picture back to its thumbnail', () => {
    expect(imageFallback(`https://lh3.googleusercontent.com/d/${ID}=w1920`)).toBe(`https://drive.google.com/thumbnail?id=${ID}&sz=w1920`);
    expect(imageFallback('https://files.catbox.moe/a.png')).toBeNull();
  });

  it('knows which links expire', () => {
    expect(linkLifetime({ url: 'https://files.catbox.moe/a.mp4' }, NOW)).toBeNull();
    expect(linkLifetime({ url: 'https://h.uguu.se/a.mp4' }, NOW)).toBe('temporary');
    expect(linkLifetime({ url: 'x', source: 'https://litter.catbox.moe/a.mp4' }, NOW)).toBe('temporary');
    expect(linkLifetime({ url: 'x', expiresAt: NOW + 1000 }, NOW)).toBe('temporary');
    expect(linkLifetime({ url: 'x', expiresAt: NOW - 1000 }, NOW)).toBe('expired');
    expect(linkLifetime({ url: discord('cdn.discordapp.com', `?ex=${PAST}&is=1&hm=2`) }, NOW)).toBe('expired');
  });

  it('only lets web links through, and escapes them for CSS', () => {
    expect(isWebUrl('https://a.test/x.png')).toBe(true);
    expect(isWebUrl('javascript:alert(1)')).toBe(false);
    expect(isWebUrl('file:///etc/passwd')).toBe(false);
    expect(isWebUrl(42)).toBe(false);
    expect(cssUrl('https://a.test/x.png?q=a")b\\c')).toBe('url("https://a.test/x.png?q=a\\22 )b\\5c c")');
  });

  it('recognises media sites (so a pasted share link is media, not text)', () => {
    for (const link of [
      'https://youtu.be/dQw4w9WgXcQ',
      `https://drive.google.com/file/d/${ID}/view`,
      'https://www.dropbox.com/scl/fi/abc/clip?rlkey=1',
      'https://imgur.com/AbC123x',
      'https://giphy.com/gifs/x-abc',
      'https://tenor.com/view/x-1',
      'https://streamable.com/abc12',
      'https://files.catbox.moe/abc',
    ])
      expect(isMediaHost(link), link).toBe(true);
    expect(isMediaHost('https://en.wikipedia.org/wiki/Frog')).toBe(false);
    expect(isMediaHost('https://github.com/me/repo')).toBe(false);
    expect(isMediaHost('https://github.com/me/repo/blob/main/a.png')).toBe(true);
  });

  it('names files from their links', () => {
    expect(nameFromUrl('https://files.catbox.moe/abc123.mp4')).toBe('abc123.mp4');
    expect(nameFromUrl('https://x.test/a/my%20clip.mp3?x=1')).toBe('my clip.mp3');
    expect(nameFromUrl('https://x.test/')).toBe('x.test');
  });

  it('refuses YouTube ids with odd characters', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=abc)def')).toBeNull();
    expect(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });
});
