import { describe, expect, it } from 'vitest';
import { cleanLink, driveUrls, isDriveProblem, parseDrive } from './links';

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
