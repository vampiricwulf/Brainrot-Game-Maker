import { describe, expect, it } from 'vitest';
import { dedupeMediaNames, uniqueMediaName } from './medianame';

describe('media file names', () => {
  it('keeps a new name and randomizes a taken one (ignoring case)', () => {
    expect(uniqueMediaName(['a.png'], 'b.png')).toBe('b.png');
    const n = uniqueMediaName(['image.png'], 'IMAGE.png');
    expect(n).toMatch(/^IMAGE-[a-z0-9]{6}\.png$/);
    expect(uniqueMediaName(['notes'], 'notes')).toMatch(/^notes-[a-z0-9]{6}$/);
    expect(uniqueMediaName(['my.clip.mp4'], 'my.clip.mp4')).toMatch(/^my\.clip-[a-z0-9]{6}\.mp4$/);
  });

  it('gives each upload of the same file its own name', () => {
    const names: string[] = [];
    for (let i = 0; i < 20; i++) names.push(uniqueMediaName(names, 'image.png'));
    expect(new Set(names.map((x) => x.toLowerCase())).size).toBe(20);
    expect(names[0]).toBe('image.png');
  });

  it('renames later duplicates in an older game, keeping the first', () => {
    const media = [{ name: 'a.png' }, { name: 'b.png' }, { name: 'A.png' }, { name: 'a.png' }];
    dedupeMediaNames(media);
    expect(media[0].name).toBe('a.png');
    expect(media[1].name).toBe('b.png');
    expect(new Set(media.map((m) => m.name.toLowerCase())).size).toBe(4);
  });
});
