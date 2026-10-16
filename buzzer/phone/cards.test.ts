import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CardMedia, PhoneCard } from '../../src/lib/buzzproto';
import {
  arrivedLine,
  bigWords,
  brokenLine,
  cardHead,
  cardsLine,
  comingLine,
  filesIn,
  FRAME_ORIGINS,
  isGif,
  lateLine,
  mediaName,
  missingLine,
  playerSrc,
  retryAfter,
  roleLine,
} from './cards';

const DRIVE = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';
const FILE = 'a'.repeat(64);

describe('the phone’s players for a card’s embeds', () => {
  it('frames YouTube’s no-cookie player, started by the tap that makes it, from the card’s times or the link’s', () => {
    expect(playerSrc({ kind: 'embed', site: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })).toEqual({
      src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?playsinline=1&rel=0&autoplay=1',
      title: 'YouTube video',
    });
    expect(playerSrc({ kind: 'embed', site: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ?t=90' })?.src).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?playsinline=1&rel=0&autoplay=1&start=90',
    );
    expect(playerSrc({ kind: 'embed', site: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ?t=90', start: 12, end: 20 })?.src).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?playsinline=1&rel=0&autoplay=1&start=12&end=20',
    );
  });

  it('frames Drive’s and Streamable’s players as the app does on a slide', () => {
    expect(playerSrc({ kind: 'embed', site: 'drive', url: `https://drive.google.com/file/d/${DRIVE}/view?usp=sharing` })).toEqual({
      src: `https://drive.google.com/file/d/${DRIVE}/preview`,
      title: 'Google Drive video',
    });
    expect(playerSrc({ kind: 'embed', site: 'streamable', url: 'https://streamable.com/abc12' })).toEqual({
      src: 'https://streamable.com/e/abc12?autoplay=1',
      title: 'Streamable video',
    });
  });

  it('frames nothing else: other links, a site that doesn’t match, http, a user name in the link', () => {
    expect(playerSrc({ kind: 'embed', site: 'youtube', url: 'https://example.com/watch?v=dQw4w9WgXcQ' })).toBeNull();
    expect(playerSrc({ kind: 'embed', site: 'youtube', url: `https://drive.google.com/file/d/${DRIVE}/view` })).toBeNull();
    expect(playerSrc({ kind: 'embed', site: 'drive', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })).toBeNull();
    expect(playerSrc({ kind: 'embed', site: 'youtube', url: 'http://www.youtube.com/watch?v=dQw4w9WgXcQ' })).toBeNull();
    expect(playerSrc({ kind: 'embed', site: 'streamable', url: 'https://me:pw@streamable.com/abc12' })).toBeNull();
    expect(playerSrc({ kind: 'embed', site: 'youtube', url: 'javascript:alert(1)' })).toBeNull();
  });

  it('every frame it makes is on the page’s content policy, which limits only pictures, media and frames', () => {
    const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
    const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] ?? '';
    const rules = Object.fromEntries(policy.split(';').map((r) => r.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));
    expect(Object.keys(rules).sort()).toEqual(['frame-src', 'img-src', 'media-src']);
    expect(rules['frame-src'].sort()).toEqual([...FRAME_ORIGINS].sort());
    // (data: for the page's own icon; blob: for card files.)
    expect(rules['img-src']).toEqual(expect.arrayContaining(['https:', 'blob:', 'data:']));
    expect(rules['media-src']).toEqual(expect.arrayContaining(['https:', 'blob:']));
    expect(rules['media-src']).not.toContain('data:');
    for (const m of [
      { kind: 'embed', site: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ' },
      { kind: 'embed', site: 'drive', url: `https://drive.google.com/open?id=${DRIVE}` },
      { kind: 'embed', site: 'streamable', url: 'https://streamable.com/xyz9' },
    ] as const)
      expect(FRAME_ORIGINS.some((o) => playerSrc(m)!.src.startsWith(`${o}/`))).toBe(true);
  });
});

describe('a card’s lines', () => {
  it('says who can see it, and its part', () => {
    expect(cardHead({})).toBe('🤫 Only you can see this');
    expect(cardHead({ team: true })).toBe('🤫 Only your team can see this');
    // Sent to others too: never who, only that it isn't theirs alone.
    expect(cardHead({ shared: true })).toBe('🤫 Only you and the others the host chose can see this');
    expect(cardHead({ team: true, shared: true })).toBe('🤫 Only your team and the others the host chose can see this');
    expect(roleLine('Describer')).toBe('You’re the Describer');
  });

  it('shows up to three short words huge', () => {
    expect(bigWords('Shrek')).toBe(true);
    expect(bigWords('  The Lion King ')).toBe(true);
    expect(bigWords('Four words in here')).toBe(false);
    expect(bigWords('Supercalifragilisticexpialidocious and more')).toBe(false);
    expect(bigWords('Two\nlines')).toBe(false);
    expect(bigWords(' ')).toBe(false);
  });

  it('names each item for a screen reader, and says what’s coming, what won’t and what didn’t load', () => {
    expect(mediaName({ kind: 'image', url: 'https://a.test/x.png' })).toBe('Picture');
    expect(mediaName({ kind: 'image', url: 'https://a.test/x.png', name: 'The ogre' })).toBe('The ogre');
    expect(mediaName({ kind: 'audio', pending: true })).toBe('Sound');
    expect(comingLine('image')).toBe('🖼 Picture coming…');
    expect(comingLine('video')).toBe('🎞 Video coming…');
    expect(missingLine('image')).toBe('🖼 The host will show you this picture');
    expect(missingLine('audio')).toBe('🔊 The host will show you this sound');
    expect(brokenLine('embed')).toBe('🎞 This video didn’t load. Ask the host to show you.');
    expect(arrivedLine('image')).toBe('Your picture is here');
  });

  it('tells a GIF by its type, or a link’s name', () => {
    expect(isGif({ kind: 'image', file: FILE, mime: 'image/gif' })).toBe(true);
    expect(isGif({ kind: 'image', file: FILE, mime: 'image/webp' })).toBe(false);
    expect(isGif({ kind: 'image', url: 'https://media.tenor.com/x/dance.GIF?raw=1' })).toBe(true);
    expect(isGif({ kind: 'image', url: 'https://a.test/x.png#a.gif' })).toBe(false);
    expect(isGif({ kind: 'video', url: 'https://a.test/x.gif' })).toBe(false);
    expect(isGif({ kind: 'image', pending: true })).toBe(false);
  });

  it('counts the cards for a screen reader, and the ones this phone joined too late for', () => {
    expect(cardsLine(0, false)).toBe('');
    expect(cardsLine(1, false)).toBe('A card only you can see');
    expect(cardsLine(2, true)).toBe('2 cards only your team can see');
    expect(cardsLine(1, false, true)).toBe('A card the host sent to you and others');
    expect(cardsLine(2, true, true)).toBe('2 cards the host sent to your team and others');
    expect(lateLine(0, false)).toBe('');
    expect(lateLine(1, false)).toBe('A card went to your seat before this phone joined. Ask the host to send it again.');
    expect(lateLine(2, true)).toBe('2 cards went to your team before this phone joined. Ask the host to send them again.');
  });
});

describe('card files on the phone', () => {
  it('keeps the files its cards use, each once', () => {
    const card = (id: string, media: CardMedia[]): PhoneCard => ({ id, open: true, media });
    const other = 'b'.repeat(64);
    expect([
      ...filesIn([
        card('1', [{ kind: 'image', file: FILE, mime: 'image/png' }, { kind: 'image', pending: true }, { kind: 'video', url: 'https://a.test/v.mp4' }]),
        card('2', [{ kind: 'image', file: FILE, mime: 'image/png' }, { kind: 'audio', file: other, mime: 'audio/mpeg' }]),
        { id: '3', open: true },
        // (Not a file id: never fetched.)
        card('4', [{ kind: 'image', file: '../../x', mime: 'image/png' }]),
      ]),
    ]).toEqual([FILE, other]);
    expect(filesIn([]).size).toBe(0);
  });

  it('tries a download again after a moment’s 404, too many requests, a server error or no network, a few times only', () => {
    expect(retryAfter(404, 1)).toBe(1500);
    expect(retryAfter(404, 2)).toBeNull();
    expect(retryAfter(429, 1)).toBe(1500);
    expect(retryAfter(503, 2)).toBe(4000);
    expect(retryAfter(null, 3)).toBe(10_000);
    expect(retryAfter(null, 4)).toBeNull();
    expect(retryAfter(401, 1)).toBeNull();
    expect(retryAfter(415, 1)).toBeNull();
  });
});
