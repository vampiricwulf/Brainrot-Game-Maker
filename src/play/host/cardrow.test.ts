// A 🤫 card's row in the host panel: a card changed in the editor since it went says how to put it out again, with the
// button that's there (↻ Send again with phones; without them, ✖ Take back and show it again).
import { describe, expect, it } from 'vitest';
import { jeopardyGame } from '../../lib/testgame';
import { newImageEl, newVideoEl, setSlideText, type SavedCard, type Slide } from '../../lib/model';
import { phoneCard } from '../../lib/phonecard';
import { newSession } from '../../lib/session';
import { remote } from '../../lib/remote.svelte';
import { sendCard, sentCardId } from '../../lib/sentcards';
import { clearUploads, uploads } from '../../lib/cardfiles.svelte';
import { leftLine, sentLine, shrinkIds, slowLine } from './cardrow';

/** Ann (a) and Bob (b); the editor's 🤫 Cards have the Wild card, out to Bob. */
function setup() {
  const g = jeopardyGame();
  g.players = ['Ann', 'Bob'].map((name, i) => ({ id: name[0].toLowerCase(), name, color: ['#e6194b', '#3cb44b'][i] }));
  const wild: SavedCard = { id: 'sc1', name: 'Wild card', background: {}, elements: [] };
  setSlideText(wild, 'WILD-plugh');
  g.cards = [wild];
  const session = newSession(g);
  const c = sendCard(g, session, { to: [{ seat: 'b' }], content: { saved: 'sc1' }, until: 'host' }, 1000)!;
  return { g, session, wild, c };
}

describe('an edited card’s row', () => {
  it('with phones, points at ↻ Send again; without them (the 🪟 card window), at ✖ Take back', () => {
    const { g, session, wild, c } = setup();
    expect(sentLine(g, session, c, false, false, false)).toEqual({ text: 'sent', warn: false });
    setSlideText(wild, 'WILD-changed');
    expect(sentLine(g, session, c, false)).toEqual({ text: 'changed in the editor: off the phones until ↻ Send again', warn: true });
    const none = sentLine(g, session, c, false, false, false);
    expect(none.warn).toBe(true);
    expect(none.text).toContain('✖ Take it back and show it again');
    expect(none.text).not.toContain('↻');
  });

  it('a phone late for it is named only while phones get cards (a room that turned this window away keeps its list)', () => {
    const { g, session, c } = setup();
    remote.cardsLate = [{ id: sentCardId(c), seatId: 'b' }];
    try {
      expect(sentLine(g, session, c, false)).toEqual({ text: 'sent · Bob’s new phone hasn’t got it: ↻ Send again', warn: true });
      expect(sentLine(g, session, c, false, false, false)).toEqual({ text: 'sent', warn: false });
    } finally {
      remote.cardsLate = [];
    }
  });
});

describe('what of a card is big, or too big, counted', () => {
  it('a file over 16 MB that goes: “📶 1 video is big…”, its kinds counted, never named or sized', () => {
    expect(slowLine([])).toBe('');
    expect(slowLine(['video'])).toBe('📶 1 video is big: phones on mobile data may wait for it (WiFi is fine)');
    expect(slowLine(['gif', 'video', 'gif'])).toBe('📶 2 GIFs and 1 video are big: phones on mobile data may wait for them (WiFi is fine)');
  });

  it('one over the server’s limit is too big for the buzzer server (not “for phones”)', () => {
    expect(leftLine([{ kind: 'video', why: 'big' }])).toBe('🖼 1 video won’t reach the phones (too big for the buzzer server)');
  });
});

describe('a card’s file going up', () => {
  it('its row says how far it got, once the upload has said', () => {
    const g = jeopardyGame();
    g.players = [{ id: 'b', name: 'Bob', color: '#3cb44b' }];
    g.media.push({ id: 'v', name: 'clip.mp4', mime: 'video/mp4', size: 1000, kind: 'video' });
    const tip: SavedCard = { id: 'sc1', name: 'Tip', background: {}, elements: [newVideoEl('v')] };
    g.cards = [tip];
    const session = newSession(g);
    session.remote = { code: 'ROOM', hostToken: 't', base: 'https://buzz.test' };
    const c = sendCard(g, session, { to: [{ seat: 'b' }], content: { saved: 'sc1' }, until: 'host' }, 1000)!;
    const was = { features: remote.features, files: remote.files };
    Object.assign(remote, { features: ['cards', 'files'], files: [] });
    try {
      uploads.jobs = { v: { code: 'ROOM', state: 'uploading' } };
      expect(sentLine(g, session, c, true).text).toBe('sent · uploading 1 of 1…');
      uploads.jobs.v.progress = 0.347;
      expect(sentLine(g, session, c, true).text).toBe('sent · uploading 1 of 1 (34%)…');
    } finally {
      clearUploads();
      Object.assign(remote, was);
    }
  });
});

describe('🗜 Make smaller on a card’s line', () => {
  it('offers the files of the items that are big, or too big for the buzzer server, each once: a big one going as itself, one too big even as its copy', () => {
    const MB = 1024 * 1024;
    const g = jeopardyGame();
    g.media.push(
      { id: 'huge', name: 'huge.gif', mime: 'image/gif', size: 50 * MB, kind: 'image' },
      { id: 'slow', name: 'slow.mp4', mime: 'video/mp4', size: 20 * MB, kind: 'video' },
      { id: 'small', name: 'small.mp4', mime: 'video/mp4', size: MB, kind: 'video' },
      // (Its copy is what goes, and is big itself: another one made the same way wouldn't be smaller.)
      { id: 'had', name: 'had.mp4', mime: 'video/mp4', size: 40 * MB, kind: 'video' },
      { id: 'hadcopy', name: 'had (phones).webm', mime: 'video/webm', size: 25 * MB, kind: 'video', phoneCopy: { of: 'had' } },
      { id: 'other', name: 'other.mp4', mime: 'video/mp4', size: 20 * MB, kind: 'video' },
      // (Its copy came out too big for the buzzer server: 🗜 again offers smaller ones, when there are.)
      { id: 'over', name: 'over.mp4', mime: 'video/mp4', size: 60 * MB, kind: 'video' },
      { id: 'overcopy', name: 'over (phones).webm', mime: 'video/webm', size: 35 * MB, kind: 'video', phoneCopy: { of: 'over', width: 854, height: 480 } },
    );
    const card: Slide = { background: {}, elements: [newImageEl('huge'), newVideoEl('slow'), newVideoEl('small'), newVideoEl('slow'), newVideoEl('had'), newVideoEl('other')] };
    const { items } = phoneCard(g, card, { files: {}, fileBytes: 30 * MB });
    const here = (id: string) => id !== 'other';
    const yes = () => true;
    expect(shrinkIds(items, 'big', here, yes)).toEqual(['huge']);
    expect(shrinkIds(items, 'slow', here, yes)).toEqual(['slow']);
    expect(shrinkIds(items, 'slow', () => false, yes)).toEqual([]);
    // (A 'big' line's are only those too big for the buzzer server: the ones that go are on the 'slow' one.)
    expect(shrinkIds(items, 'big', yes, yes)).toEqual(['huge']);
    const over = phoneCard(g, { background: {}, elements: [newVideoEl('over')] }, { files: {}, fileBytes: 30 * MB }).items;
    expect([shrinkIds(over, 'big', yes, yes), shrinkIds(over, 'slow', yes, yes)]).toEqual([['over'], []]);
    // (None smaller left than that copy: 🗜 again would make it the same.)
    expect(shrinkIds(over, 'big', yes, (id) => id !== 'over')).toEqual([]);
    expect(shrinkIds(items, 'slow', yes, yes)).toEqual(['slow', 'other']);
  });
});
