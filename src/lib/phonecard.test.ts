// A 🤫 card as its players get it (partner-clues spec §12.3, §22): its items in the order they sit (by y, then x) with
// the names the host knows them by, its words top to bottom, and its links once each.
import { describe, expect, it } from 'vitest';
import { newAudioEl, newEmbedEl, newImageEl, newShapeEl, newTextEl, newVideoEl, type MediaRef, type Slide, type SlideElement } from './model';
import { cardItems, cardLinks, cardWords, filesToSend, phoneCard } from './phonecard';
import { OLD_FILE_LIMITS } from './buzzproto';

/** How big a file the buzzer server takes in these tests (one that doesn't say: 16 MB). */
const FILE_BYTES = OLD_FILE_LIMITS.fileBytes;

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

describe('phoneCard: the stack a phone gets (spec §12.3, §13.4, §13.5)', () => {
  const HASH = 'b'.repeat(64);
  const more: MediaRef[] = [
    ...media,
    // A stored copy of a lasting link (it plays from there), and of a link that stops working.
    { id: 'kept', name: 'cat.png', mime: 'image/png', size: 5000, kind: 'image', source: 'https://files.catbox.moe/abc123.png' },
    { id: 'brief', name: 'tmp.png', mime: 'image/png', size: 5000, kind: 'image', source: 'https://litter.catbox.moe/zz9.png' },
    { id: 'huge', name: 'clip.mp4', mime: 'video/mp4', size: 40 * 1024 * 1024, kind: 'video' },
    { id: 'mov', name: 'clip.mov', mime: 'video/quicktime', size: 1000, kind: 'video' },
    { id: 'old', name: 'old.png', mime: 'image/png', size: 0, kind: 'image', url: 'https://cdn.discordapp.com/attachments/1/2/old.png?ex=1&is=1&hm=1', expiresAt: 1000 },
  ];
  const g = { media: more };

  it('a title (the largest short line, with other words too), the words, then each item in the order it sits', () => {
    const slide = card(
      at({ ...newTextEl('SHREK'), size: 140 }, 0, 0),
      at({ ...newTextEl('Don’t say: ogre, green'), size: 48 }, 0, 300),
      at(newVideoEl('clip'), 0, 900),
      at(newImageEl('pic'), 0, 500),
      at(newEmbedEl('https://youtu.be/abcdefghijk', 'youtube'), 0, 1000, { startAt: 30 }),
    );
    const pc = phoneCard(g, slide, { fileBytes: FILE_BYTES, files: { pic: HASH } });
    expect(pc.title).toBe('SHREK');
    expect(pc.text).toBe('Don’t say: ogre, green');
    expect(pc.media).toEqual([
      { kind: 'image', file: HASH, mime: 'image/png' },
      { kind: 'video', pending: true },
      { kind: 'embed', site: 'youtube', url: 'https://youtu.be/abcdefghijk', start: 30 },
    ]);
    expect(pc.left).toEqual([]);
    expect(filesToSend(pc)).toEqual(['clip']);
    // One line of words is the words, not a title.
    expect(phoneCard(g, card(newTextEl('Shrek')), { fileBytes: FILE_BYTES, files: {} })).toMatchObject({ text: 'Shrek', media: [] });
    expect(phoneCard(g, card(newTextEl('Shrek')), { fileBytes: FILE_BYTES, files: {} }).title).toBeUndefined();
  });

  it('online items go as their links; a stored copy of a lasting link goes as that link (not when edited)', () => {
    const slide = card(
      at(newImageEl('linked'), 0, 1),
      at(newImageEl('kept'), 0, 2),
      at(newImageEl('kept'), 0, 3, { editedMedia: 'pic' }),
      at(newImageEl('brief'), 0, 4),
      at(newEmbedEl('https://files.example/a/clip.mp4', 'remoteVideo'), 0, 5),
      at(newEmbedEl('https://streamable.com/abc', 'streamable'), 0, 6),
    );
    expect(phoneCard(g, slide, { fileBytes: FILE_BYTES, files: {} }).media).toEqual([
      { kind: 'image', url: 'https://files.example/poster.jpg' },
      { kind: 'image', url: 'https://files.catbox.moe/abc123.png' },
      { kind: 'image', pending: true },
      { kind: 'image', pending: true },
      { kind: 'video', url: 'https://files.example/a/clip.mp4' },
      { kind: 'embed', site: 'streamable', url: 'https://streamable.com/abc' },
    ]);
    expect(filesToSend(phoneCard(g, slide, { fileBytes: FILE_BYTES, files: {} }))).toEqual(['pic', 'brief']);
  });

  it('what won’t reach a phone, and why: too big, expired, a kind phones can’t play, no files, turned down, gone, past six', () => {
    const slide = card(
      at(newVideoEl('huge'), 0, 1),
      at(newImageEl('old'), 0, 2),
      at(newVideoEl('mov'), 0, 3),
      at(newImageEl('gone'), 0, 4),
      at(newImageEl('pic'), 0, 5),
      at(newEmbedEl('http://files.example/a.png', 'remoteImage'), 0, 6),
      at(newAudioEl('tune'), 0, 7),
    );
    const pc = phoneCard(g, slide, { fileBytes: FILE_BYTES, files: {}, failed: { pic: 'failed' } });
    expect(pc.left.map((l) => [l.item, l.why])).toEqual([
      ['clip.mp4', 'big'],
      ['old.png', 'expired'],
      ['clip.mov', 'kind'],
      ['Picture', 'lost'],
      ['shrek.png', 'failed'],
      ['a.png', 'kind'],
      ['theme.mp3', 'many'],
    ]);
    // Six at most on the card, each that won't come as { missing } ("the host will show you this").
    expect(pc.media).toHaveLength(6);
    expect(pc.media.every((m) => 'missing' in m)).toBe(true);
    expect(filesToSend(pc)).toEqual([]);
    // A buzzer server that takes no files: the files from this computer won't come; links still do.
    const none = phoneCard(g, card(at(newImageEl('pic'), 0, 1), at(newImageEl('linked'), 0, 2)), { fileBytes: FILE_BYTES, files: null });
    expect(none.media).toEqual([{ kind: 'image', missing: true }, { kind: 'image', url: 'https://files.example/poster.jpg' }]);
    expect(none.left).toEqual([{ item: 'shrek.png', kind: 'picture', why: 'nofiles' }]);
  });

  it('a picture goes shrunk whatever its size; a GIF goes as it is, so a big one is too big', () => {
    const big: MediaRef[] = [
      { id: 'p', name: 'huge.png', mime: 'image/png', size: 30 * 1024 * 1024, kind: 'image' },
      { id: 'g', name: 'huge.gif', mime: 'image/gif', size: 30 * 1024 * 1024, kind: 'image' },
    ];
    const pc = phoneCard({ media: big }, card(at(newImageEl('p'), 0, 1), at(newImageEl('g'), 0, 2)), { fileBytes: FILE_BYTES, files: {} });
    expect(pc.media).toEqual([{ kind: 'image', pending: true }, { kind: 'image', missing: true }]);
    expect(pc.left).toEqual([{ item: 'huge.gif', kind: 'gif', why: 'big' }]);
  });

  it('too big is the buzzer server’s own limit (can.fileBytes), to the byte', () => {
    const MB = 1024 * 1024;
    const files: MediaRef[] = [
      { id: 'v', name: 'clip.mp4', mime: 'video/mp4', size: 24 * MB, kind: 'video' },
      { id: 's', name: 'tune.mp3', mime: 'audio/mpeg', size: 24 * MB + 1, kind: 'audio' },
    ];
    const slide = card(at(newVideoEl('v'), 0, 1), at(newAudioEl('s'), 0, 2));
    const big = (fileBytes: number) => phoneCard({ media: files }, slide, { fileBytes, files: {} }).left.map((l) => l.item);
    expect(big(FILE_BYTES)).toEqual(['clip.mp4', 'tune.mp3']);
    expect(big(24 * MB)).toEqual(['tune.mp3']);
    expect(big(24 * MB + 1)).toEqual([]);
    expect(phoneCard({ media: files }, slide, { fileBytes: 24 * MB, files: {} }).items.map((i) => i.goes)).toEqual([
      { kind: 'video', pending: true },
      { kind: 'audio', missing: true },
    ]);
  });

  it('a file over 16 MB that the server takes goes, marked slow (never a why); a picture never is; over the limit it’s too big', () => {
    const MB = 1024 * 1024;
    const files: MediaRef[] = [
      { id: 'v', name: 'clip.mp4', mime: 'video/mp4', size: 16 * MB + 1, kind: 'video' },
      { id: 'g', name: 'dance.gif', mime: 'image/gif', size: 20 * MB, kind: 'image' },
      { id: 'p', name: 'huge.png', mime: 'image/png', size: 40 * MB, kind: 'image' },
      { id: 's', name: 'tune.mp3', mime: 'audio/mpeg', size: 16 * MB, kind: 'audio' },
    ];
    const slide = card(at(newVideoEl('v'), 0, 1), at(newImageEl('g'), 0, 2), at(newImageEl('p'), 0, 3), at(newAudioEl('s'), 0, 4));
    const pc = (fileBytes: number) => phoneCard({ media: files }, slide, { fileBytes, files: {} });
    const roomy = pc(24 * MB);
    expect(roomy.items.map((i) => [i.name, i.slow ?? false, i.why ?? null])).toEqual([
      ['clip.mp4', true, null],
      ['dance.gif', true, null],
      // (A picture is shrunk first; 16 MB is no more than 16 MB.)
      ['huge.png', false, null],
      ['tune.mp3', false, null],
    ]);
    // A note only: they go up as any other (what's sent and what's left out are the same).
    expect(roomy.left).toEqual([]);
    expect(filesToSend(roomy)).toEqual(['v', 'g', 'p', 's']);
    // Up there, still slow: the phones still download them.
    expect(phoneCard({ media: files }, slide, { fileBytes: 24 * MB, files: { v: HASH } }).items[0]).toMatchObject({ slow: true, goes: { file: HASH } });
    // Over the server's limit (an older server's 16 MB: no band in between), too big and never slow.
    const old = pc(FILE_BYTES);
    expect(old.items.map((i) => [i.name, i.slow ?? false, i.why ?? null])).toEqual([
      ['clip.mp4', false, 'big'],
      ['dance.gif', false, 'big'],
      ['huge.png', false, null],
      ['tune.mp3', false, null],
    ]);
    // Nor when it won't go for another reason.
    expect(phoneCard({ media: files }, slide, { fileBytes: 24 * MB, files: null }).items.some((i) => i.slow)).toBe(false);
  });

  it('an item’s own name goes with it (for the phone’s text alternative), never its file’s', () => {
    const pc = phoneCard(g, card(at(newImageEl('linked'), 0, 1, { name: 'The ogre' }), at(newImageEl('pic'), 0, 2)), { fileBytes: FILE_BYTES, files: { pic: HASH } });
    expect(pc.media).toEqual([
      { kind: 'image', url: 'https://files.example/poster.jpg', name: 'The ogre' },
      { kind: 'image', file: HASH, mime: 'image/png' },
    ]);
  });
});
