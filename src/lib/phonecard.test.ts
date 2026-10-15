// A 🤫 card as its players get it (partner-clues spec §12.3, §22): its items in the order they sit (by y, then x) with
// the names the host knows them by, its words top to bottom, and its links once each.
import { describe, expect, it } from 'vitest';
import { newAudioEl, newEmbedEl, newImageEl, newShapeEl, newTextEl, newVideoEl, type MediaRef, type Slide, type SlideElement } from './model';
import { cardItems, cardLinks, cardWords } from './phonecard';

const at = <T extends SlideElement>(el: T, x: number, y: number, more: Partial<T> = {}): T => ({ ...el, x, y, ...more });
const media: MediaRef[] = [
  { id: 'pic', name: 'shrek.png', mime: 'image/png', size: 10, kind: 'image' },
  { id: 'gif', name: 'dance.GIF', mime: 'image/gif', size: 10, kind: 'image' },
  { id: 'still', name: 'still.png', mime: 'image/png', size: 10, kind: 'image' },
  { id: 'clip', name: 'trailer.mp4', mime: 'video/mp4', size: 10, kind: 'video' },
  { id: 'tune', name: 'theme.mp3', mime: 'audio/mpeg', size: 10, kind: 'audio' },
  // (A file added as a link that wasn't saved: it plays from its link.)
  { id: 'linked', name: 'poster.jpg', mime: 'image/jpeg', size: 0, kind: 'image', url: 'https://files.example/poster.jpg' },
];
const game = { media };
const card = (...elements: SlideElement[]): Slide => ({ background: {}, elements });

describe('cardItems', () => {
  it('goes top to bottom, then left to right on the same line; words and shapes aren’t items', () => {
    const slide = card(
      at(newImageEl('pic'), 900, 500),
      at(newTextEl('Words'), 0, 0),
      at(newVideoEl('clip'), 100, 500),
      at(newShapeEl('rect'), 0, 10),
      at(newAudioEl('tune'), 50, 900),
      at(newImageEl('gif'), 1500, 20),
    );
    expect(cardItems(game, slide).map((i) => [i.kind, i.name])).toEqual([
      ['gif', 'dance.GIF'],
      ['video', 'trailer.mp4'],
      ['picture', 'shrek.png'],
      ['sound', 'theme.mp3'],
    ]);
    expect(cardItems(game, card(at(newTextEl('Only words'), 0, 0), newShapeEl('ellipse')))).toEqual([]);
  });

  it('names each item as the host named it, else by its file, else by what it is', () => {
    const slide = card(
      at(newImageEl('pic'), 0, 1, { name: 'The ogre' }),
      at(newImageEl('gone'), 0, 2),
      at(newVideoEl('gone'), 0, 3),
      at(newAudioEl('gone'), 0, 4),
      at(newImageEl('still'), 0, 5, { editedMedia: 'edit1' }),
      at(newImageEl('linked'), 0, 6),
    );
    expect(cardItems(game, slide).map((i) => [i.kind, i.name, i.media, i.url])).toEqual([
      ['picture', 'The ogre', 'pic', undefined],
      ['picture', 'Picture', 'gone', undefined],
      ['video', 'Video', 'gone', undefined],
      ['sound', 'Sound', 'gone', undefined],
      // An edited picture plays its edited copy, under the name of the picture it was made from.
      ['picture', 'still.png', 'edit1', undefined],
      ['picture', 'poster.jpg', 'linked', 'https://files.example/poster.jpg'],
    ]);
  });

  it('names online items by their link: a file’s name, or the site', () => {
    const slide = card(
      at(newEmbedEl('https://files.example/clips/funny%20cat.gif?x=1', 'remoteImage'), 0, 1),
      at(newEmbedEl('https://files.example/a/photo.png', 'remoteImage'), 0, 2),
      at(newEmbedEl('https://files.example/a/clip.mp4', 'remoteVideo'), 0, 3),
      at(newEmbedEl('https://files.example/a/song.mp3', 'remoteAudio'), 0, 4),
      at(newEmbedEl('https://youtu.be/abcdefghijk', 'youtube'), 0, 5),
      at(newEmbedEl('https://streamable.com/abc', 'streamable'), 0, 6, { name: 'The trailer' }),
    );
    expect(cardItems(game, slide).map((i) => [i.kind, i.name, i.url])).toEqual([
      ['gif', 'funny cat.gif', 'https://files.example/clips/funny%20cat.gif?x=1'],
      ['picture', 'photo.png', 'https://files.example/a/photo.png'],
      ['video', 'clip.mp4', 'https://files.example/a/clip.mp4'],
      ['sound', 'song.mp3', 'https://files.example/a/song.mp3'],
      ['embed', 'YouTube', 'https://youtu.be/abcdefghijk'],
      ['embed', 'The trailer', 'https://streamable.com/abc'],
    ]);
  });
});

describe('cardWords and cardLinks', () => {
  it('gives every text box with words in it, top to bottom then left to right (one hidden from viewers too)', () => {
    const slide = card(
      at(newTextEl('Third'), 0, 800),
      at(newTextEl('   '), 0, 10),
      at(newTextEl('Second'), 900, 100),
      at(newTextEl('  First  '), 100, 100),
      at(newTextEl('Fourth'), 0, 900, { secret: true }),
      at(newImageEl('pic'), 0, 0),
    );
    expect(cardWords(slide)).toBe('First\nSecond\nThird\nFourth');
    expect(cardWords(card(newImageEl('pic')))).toBe('');
  });

  it('lists each online link once, in the items’ order', () => {
    const slide = card(
      at(newEmbedEl('https://youtu.be/abcdefghijk', 'youtube'), 0, 5),
      at(newImageEl('linked'), 0, 1),
      at(newImageEl('linked'), 0, 9),
      at(newImageEl('pic'), 0, 2),
    );
    expect(cardLinks(game, slide)).toEqual(['https://files.example/poster.jpg', 'https://youtu.be/abcdefghijk']);
    expect(cardLinks(game, card(newImageEl('pic'), newTextEl('Words')))).toEqual([]);
  });
});
