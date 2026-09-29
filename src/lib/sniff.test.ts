import { describe, expect, it } from 'vitest';
import { filenameFromDisposition, looksLikeHtml, mimeFromName, readDrivePage, sniffMime, withExtension } from './sniff';
import { migrateGame, newGame } from './model';

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)));
const pad = (b: Uint8Array, n = 64) => {
  const out = new Uint8Array(Math.max(n, b.length));
  out.set(b);
  return out;
};

describe('sniffMime', () => {
  const cases: [string, Uint8Array, string | null][] = [
    ['PNG', bytes([0x89], 'PNG', [13, 10, 26, 10]), 'image/png'],
    ['JPEG', bytes([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg'],
    ['GIF', bytes('GIF89a'), 'image/gif'],
    ['WebP', bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 '), 'image/webp'],
    ['WAV', bytes('RIFF', [0, 0, 0, 0], 'WAVEfmt '), 'audio/wav'],
    ['AVI', bytes('RIFF', [0, 0, 0, 0], 'AVI LIST'), 'video/x-msvideo'],
    ['MP4', bytes([0, 0, 0, 0x20], 'ftypisom'), 'video/mp4'],
    ['M4A', bytes([0, 0, 0, 0x20], 'ftypM4A '), 'audio/mp4'],
    ['MOV', bytes([0, 0, 0, 0x14], 'ftypqt  '), 'video/quicktime'],
    ['AVIF', bytes([0, 0, 0, 0x1c], 'ftypavif'), 'image/avif'],
    ['WebM', bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 1, 0x42, 0x82, 0x84], 'webm'), 'video/webm'],
    ['Matroska', bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x88], 'matroska'), 'video/x-matroska'],
    ['Ogg Vorbis', bytes('OggS', [0, 2], [0, 0, 0, 0, 0, 0, 0, 0], [1], 'vorbis'), 'audio/ogg'],
    ['Ogg Theora', bytes('OggS', [0, 2], [0, 0, 0, 0, 0, 0, 0, 0], [0x80], 'theora'), 'video/ogg'],
    ['FLAC', bytes('fLaC', [0, 0, 0, 34]), 'audio/flac'],
    ['MP3 with ID3', bytes('ID3', [4, 0, 0]), 'audio/mpeg'],
    ['MP3 frame', bytes([0xff, 0xfb, 0x90, 0x44]), 'audio/mpeg'],
    ['AAC (ADTS)', bytes([0xff, 0xf1, 0x50, 0x80]), 'audio/aac'],
    ['BMP', pad(bytes('BM', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [40, 0, 0, 0])), 'image/bmp'],
    ['SVG', bytes('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'image/svg+xml'],
    ['HTML is not media', bytes('<!DOCTYPE html><html><head>'), null],
    ['text is not media', bytes('Hello there, frog'), null],
    ['JSON is not media', bytes('{"error":"not found"}'), null],
    ['too short', bytes('ab'), null],
  ];
  it.each(cases)('%s', (_name, b, mime) => expect(sniffMime(b)).toBe(mime));
});

describe('looksLikeHtml', () => {
  it('spots web pages, even after a BOM, whitespace or a comment', () => {
    expect(looksLikeHtml(bytes('<!doctype html><html>'))).toBe(true);
    expect(looksLikeHtml(bytes([0xef, 0xbb, 0xbf], '\n  <HTML lang="en">'))).toBe(true);
    expect(looksLikeHtml(bytes('<!-- hi --><!DOCTYPE html>'))).toBe(true);
    expect(looksLikeHtml(bytes('<svg xmlns="x"></svg>'))).toBe(false);
    expect(looksLikeHtml(bytes([0x89], 'PNG'))).toBe(false);
  });
});

describe('file names', () => {
  it('reads Content-Disposition (the UTF-8 form wins)', () => {
    expect(filenameFromDisposition('attachment; filename="frog clip.mp4"')).toBe('frog clip.mp4');
    expect(filenameFromDisposition("attachment; filename=\"x.mp4\"; filename*=UTF-8''Gr%C3%BC%C3%9Fe%20%F0%9F%90%B8.mp4")).toBe('Grüße 🐸.mp4');
    expect(filenameFromDisposition('inline; filename=plain.png')).toBe('plain.png');
    expect(filenameFromDisposition('attachment; filename="../../evil.mp3"')).toBe('evil.mp3');
    expect(filenameFromDisposition('attachment')).toBeNull();
    expect(filenameFromDisposition(null)).toBeNull();
  });

  it('gives a name the extension of what the file really is', () => {
    expect(withExtension('download', 'video/mp4')).toBe('download.mp4');
    expect(withExtension('pic.png', 'image/jpeg')).toBe('pic.jpg');
    expect(withExtension('pic.jpeg', 'image/jpeg')).toBe('pic.jpeg');
    expect(withExtension('clip.m4v', 'video/mp4')).toBe('clip.m4v');
    expect(withExtension('v1.2 final', 'audio/mpeg')).toBe('v1.2 final.mp3');
    expect(mimeFromName('a.MP3')).toBe('audio/mpeg');
    expect(mimeFromName('a.jpeg')).toBe('image/jpeg');
    expect(mimeFromName('noext')).toBeNull();
  });
});

describe('readDrivePage (what Google Drive sent instead of the file)', () => {
  const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';
  it('follows the virus-scan form of a big file', () => {
    const html = `<!DOCTYPE html><html><head><title>Google Drive - Virus scan warning</title></head><body>
      <p class="uc-warning-subcaption">Google Drive can't scan this file for viruses.</p>
      <form id="download-form" action="https://drive.usercontent.google.com/download" method="get">
        <input type="submit" id="uc-download-link" class="goog-inline-block jfk-button" value="Download anyway"/>
        <input type="hidden" name="id" value="${ID}">
        <input type="hidden" name="export" value="download">
        <input type="hidden" name="confirm" value="t">
        <input type="hidden" name="uuid" value="a1b2-c3&amp;d4">
        <input type="hidden" name="at" value="APvzH3r:17000">
      </form></body></html>`;
    const r = readDrivePage(html, 200, 'https://drive.usercontent.google.com/download?id=x');
    expect(r).toEqual({ retry: `https://drive.usercontent.google.com/download?id=${ID}&export=download&confirm=t&uuid=a1b2-c3%26d4&at=APvzH3r%3A17000` });
  });

  it('follows the older "Download anyway" link', () => {
    const html = `<html><a id="uc-download-link" href="/uc?export=download&amp;confirm=AbCd&amp;id=${ID}">Download anyway</a></html>`;
    expect(readDrivePage(html, 200)).toEqual({ retry: `https://drive.google.com/uc?export=download&confirm=AbCd&id=${ID}` });
  });

  it('never follows a form to another site', () => {
    const html = `<form id="download-form" action="https://evil.test/steal"><input type="hidden" name="id" value="x"></form>`;
    expect(readDrivePage(html, 200)).toMatchObject({ problem: 'drive-page' });
  });

  it('explains quota, disabled downloads and private files', () => {
    const problem = (html: string, status = 200, url = '') => (readDrivePage(html, status, url) as { problem: string }).problem;
    expect(problem('<html><p class="uc-error-subcaption">Too many users have viewed or downloaded this file recently.</p></html>')).toBe('drive-quota');
    expect(problem('<html>Sorry, you can\'t view or download this file at this time. Download quota exceeded</html>')).toBe('drive-quota');
    expect(problem('<html>This file cannot be downloaded by the user.</html>', 403)).toBe('drive-no-download');
    expect(problem('<html><title>Sign in - Google Accounts</title></html>', 200, 'https://accounts.google.com/v3/signin/identifier?continue=x')).toBe('drive-private');
    expect(problem('<html>You need access</html>', 200)).toBe('drive-private');
    expect(problem('<html>Not found</html>', 404)).toBe('drive-private');
    expect(problem('<html>Something new from Google</html>', 200)).toBe('drive-page');
  });
});

describe('migrateGame and online links', () => {
  it('keeps link fields and drops anything that is not a web link', () => {
    const g = newGame();
    g.media = [
      { id: 'a', name: 'a.mp4', mime: 'video/mp4', size: 0, kind: 'video', url: 'https://files.catbox.moe/a.mp4', source: 'https://files.catbox.moe/a.mp4', expiresAt: 123 },
      { id: 'b', name: 'b.png', mime: 'image/png', size: 5, kind: 'image', source: 'https://litter.catbox.moe/b.png' },
      { id: 'c', name: 'c.png', mime: 'image/png', size: 0, kind: 'image', url: 'javascript:alert(1)', source: 'file:///c.png' },
    ];
    const m = migrateGame(JSON.parse(JSON.stringify(g))).media;
    expect(m[0]).toMatchObject({ url: 'https://files.catbox.moe/a.mp4', source: 'https://files.catbox.moe/a.mp4', expiresAt: 123 });
    expect(m[1]).toMatchObject({ source: 'https://litter.catbox.moe/b.png' });
    expect(m[2].url).toBeUndefined();
    expect(m[2].source).toBeUndefined();
  });
});
