// 🪟 The card window (partner-clues spec §13.6, §14.1, §22): it shows one player's live cards and nothing else, and its
// messages go to it alone: never to the audience window, the BroadcastChannel or the scores window.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { jeopardyGame } from './testgame';
import { newImageEl, setSlideText, type BoardRound, type Game, type Session } from './model';
import { newSession, openClue } from './session';
import { addCard, sendCards, setPartner, setPartnerGame } from './partner';
import { quickSlide, sendCard, takeBackCard } from './sentcards';
import { CARD_WIN_TYPES, windowCards, windowFiles } from './cardwindow';

/** Ann (a), Bob (b) and Cat (c); Movies $400 has Card 1 ("TIP-xyzzy" and a picture from a file). */
function setup() {
  const g = jeopardyGame();
  g.players = ['Ann', 'Bob', 'Cat'].map((name, i) => ({ id: name[0].toLowerCase(), name, color: ['#e6194b', '#3cb44b', '#4363d8'][i] }));
  const r = g.rounds[0] as BoardRound;
  const clue = r.categories[0].clues[1];
  setSlideText(clue.questionSlide, 'A question');
  setSlideText(clue.answerSlide, 'Shrek');
  const card = addCard(clue)!;
  setSlideText(card, 'TIP-xyzzy');
  card.elements.push({ ...newImageEl('m1'), y: 600 });
  g.media.push({ id: 'm1', name: 'secret-pic.png', mime: 'image/png', size: 1000, kind: 'image' });
  const session = newSession(g);
  session.currentPickerId = 'a';
  return { g, session, clue, card };
}

describe('what the card window shows', () => {
  it('only that player’s cards out, newest first, and only those sent to their whole seat', () => {
    const { g, session, clue, card } = setup();
    expect(windowCards(g, session, 'a')).toEqual([]);
    sendCard(g, session, { to: [{ seat: 'a' }], content: { slide: quickSlide('SPY-plugh') }, until: 'host' }, 1000);
    sendCard(g, session, { to: [{ seat: 'b' }], content: { slide: quickSlide('LOCATION-qwop') }, until: 'host' }, 2000);
    // One person on Ann's team only: not the whole team's window.
    sendCard(g, session, { to: [{ seat: 'a', member: { id: 'm-1', name: 'Mia' } }], content: { slide: quickSlide('MIA-only') }, until: 'host' }, 3000);
    sendCard(g, session, { to: [{ seat: 'a' }, { seat: 'c' }], content: { clue: clue.id, card: card.id }, until: 'host' }, 4000);
    const ann = windowCards(g, session, 'a');
    expect(ann.map((c) => c.text)).toEqual(['TIP-xyzzy', 'SPY-plugh']);
    expect(JSON.stringify(ann)).not.toMatch(/LOCATION-qwop|MIA-only/);
    expect(windowCards(g, session, 'b').map((c) => c.text)).toEqual(['LOCATION-qwop']);
    // The picture from this computer goes as the file itself (by its media id), never its name.
    expect(ann[0].media).toEqual([{ kind: 'image', file: 'm1' }]);
    expect(windowFiles(ann)).toEqual(['m1']);
    expect(windowFiles(windowCards(g, session, 'b'))).toEqual([]);
    expect(JSON.stringify(ann)).not.toContain('secret-pic');
    // Nobody who isn't playing.
    expect(windowCards(g, session, 'zz')).toEqual([]);
  });

  it('a card taken back goes, and a tile’s card edited since it went is left out until ↻ Send again', () => {
    const { g, session, clue, card } = setup();
    const tip = sendCard(g, session, { to: [{ seat: 'a' }], content: { clue: clue.id, card: card.id }, until: 'host' }, 1000)!;
    expect(windowCards(g, session, 'a')).toHaveLength(1);
    setSlideText(card, 'TIP-edited');
    expect(windowCards(g, session, 'a')).toEqual([]);
    setSlideText(card, 'TIP-xyzzy');
    takeBackCard(session, tip.id);
    expect(windowCards(g, session, 'a')).toEqual([]);
  });

  it('the open partner clue’s sends to the player, with their lines', () => {
    const { g, session } = setup();
    const pc = (g.rounds[0] as BoardRound).categories[1].clues[0];
    pc.type = 'partner';
    setPartnerGame(pc, 'describe');
    setSlideText(pc.cards![0], 'PARTNER-card');
    openClue(session, { round: 0, cat: 1, row: 0 }, g);
    setPartner(session, session.partner!, 'b', 'wheel');
    expect(windowCards(g, session, 'b')).toEqual([]);
    sendCards(session, session.partner!, pc.cards!, 500);
    const bob = windowCards(g, session, 'b');
    expect(bob).toHaveLength(1);
    expect(bob[0]).toMatchObject({ text: 'PARTNER-card', role: 'Describer', open: true });
    // Ann guesses: she gets none of it.
    expect(windowCards(g, session, 'a')).toEqual([]);
    session.revealed = true;
    expect(windowCards(g, session, 'b')[0].open).toBe(false);
  });
});

// ---------- The card window's own channel ----------

/** A window the host page opened (audience, scores or card window): what was posted to it. */
class FakeWin {
  msgs: { type: string }[] = [];
  closed = false;
  postMessage(m: { type: string }): void {
    this.msgs.push(m);
  }
  focus(): void {}
  close(): void {
    this.closed = true;
  }
}

/** A BroadcastChannel bus in this test: every post on a channel reaches the others with its name. */
class FakeChannel {
  static all: FakeChannel[] = [];
  static posted: unknown[] = [];
  listeners: ((e: { data: unknown }) => void)[] = [];
  constructor(public name: string) {
    FakeChannel.all.push(this);
  }
  postMessage(data: unknown): void {
    FakeChannel.posted.push(data);
    for (const c of FakeChannel.all) if (c !== this && c.name === this.name) for (const l of c.listeners) l({ data });
  }
  addEventListener(_t: string, l: (e: { data: unknown }) => void): void {
    this.listeners.push(l);
  }
  close(): void {}
}

describe('the card window’s messages reach it alone', () => {
  const opened: Record<string, FakeWin> = {};
  const listeners: Record<string, ((e: unknown) => void)[]> = {};
  beforeAll(() => {
    vi.stubGlobal('location', { href: 'https://host.test/index.html', hash: '', protocol: 'https:', origin: 'https://host.test', search: '' });
    vi.stubGlobal('BroadcastChannel', FakeChannel);
    vi.stubGlobal('window', {
      addEventListener: (t: string, f: (e: unknown) => void) => (listeners[t] ??= []).push(f),
      open: (_url: string, name: string) => (opened[name] = new FakeWin()),
    });
  });
  afterAll(() => vi.unstubAllGlobals());

  /** Every message the viewers' windows and the channel got, as text (blobs as their size). */
  const viewersGot = () => JSON.stringify([opened['jb-audience']?.msgs, opened['jb-audience-scores']?.msgs, FakeChannel.posted], (_k, v) => (v instanceof Blob ? `blob:${v.size}` : v));

  it('the audience window, the channel and the scores window never get a card window message or what’s on a card', async () => {
    const sync = await import('./sync.svelte');
    const cw = await import('./cardwindow.svelte');
    const { registerBlob } = await import('./media.svelte');
    const { g, session, clue, card } = setup();
    registerBlob('m1', new Blob(['png-bytes'], { type: 'image/png' }));
    // The audience window (opened by this page, and heard on the channel too) and the scores window, all open.
    expect(await sync.openAudienceWindow('Game')).toBe(true);
    const audienceOnChannel = new FakeChannel(sync.CHANNEL_NAME);
    audienceOnChannel.postMessage({ from: 'audience', msg: { type: 'hello' } });
    expect(sync.openScoresWindow()).toBe(true);
    // A quick card for Ann (its words only in the session), and the tile's card with a picture from this computer.
    sendCard(g, session, { to: [{ seat: 'a' }], content: { slide: quickSlide('SPY-plugh') }, until: 'host' }, 1000);
    sendCard(g, session, { to: [{ seat: 'a' }], content: { clue: clue.id, card: card.id }, until: 'host' }, 2000);
    const feed = (gm: Game, s: Session) => cw.feedCardWindow('Ann', windowCards(gm, s, 'a'));
    sync.pushGame(g);
    sync.pushSession(session);

    // 🪟 for Ann: what it shows goes to it.
    expect(cw.openCardWindow('a')).toBe(true);
    expect(cw.cardWindow).toMatchObject({ open: true, seat: 'a' });
    feed(g, session);
    const win = opened['jb-cards'];
    const got = () => win.msgs.filter((m) => m.type === 'private-cards') as unknown as { cards: { text?: string }[] }[];
    expect(got().at(-1)!.cards.map((c) => c.text)).toEqual(['TIP-xyzzy', 'SPY-plugh']);
    const files = win.msgs.find((m) => m.type === 'private-files') as unknown as { items: { id: string; blob: Blob }[] };
    expect(files.items.map((i) => i.id)).toEqual(['m1']);
    // The same again isn't sent again; a change is.
    const n = win.msgs.length;
    feed(g, session);
    expect(win.msgs).toHaveLength(n);

    // It (re)loads and says hello: everything again, to it.
    for (const l of listeners.message) l({ source: win, data: { type: 'private-hello' } });
    expect(win.msgs.length).toBeGreaterThan(n);
    // A hello from any other window (the audience window, a page opened from a media link) gets nothing.
    for (const l of listeners.message) l({ source: opened['jb-audience'], data: { type: 'private-hello' } });
    sync.pushSession(session);
    sync.pushLive({ ...((await import('./live')).newLive()) });

    // Nothing of it reached the viewers' windows or the channel, then or since. (The game itself goes to them, its
    // files too, as ever: AudienceView never draws a card.)
    const seen = viewersGot();
    expect(opened['jb-audience'].msgs.some((m) => m.type === 'session')).toBe(true);
    expect((FakeChannel.posted as { msg?: { type: string } }[]).some((m) => m.msg?.type === 'session')).toBe(true);
    for (const t of CARD_WIN_TYPES) expect(seen).not.toContain(t);
    expect(seen).not.toMatch(/SPY-plugh|private-/);
    // (The scores window gets only the game's state: still nothing private.)
    expect(opened['jb-audience-scores'].msgs.every((m) => ['game', 'session', 'live', 'media', 'bye'].includes(m.type))).toBe(true);

    // ✖ Close: it's told to close, and nothing more goes to it.
    cw.closeCardWindow();
    expect(win.msgs.at(-1)).toEqual({ type: 'private-close' });
    expect(cw.cardWindow).toMatchObject({ open: false, seat: null });
    const m = win.msgs.length;
    feed(g, session);
    expect(win.msgs).toHaveLength(m);
  });

  const src = import.meta.glob<string>(['/src/audience/AudienceApp.svelte', '/src/audience/CardWindow.svelte', '/src/lib/cardwindow.svelte.ts'], {
    query: '?raw',
    import: 'default',
    eager: true,
  });

  it('the audience window handles none of its message types, and the card window page reads only them, only from its opener', () => {
    const audience = src['/src/audience/AudienceApp.svelte'];
    // (Its code, not the comment at its top.)
    const page = src['/src/audience/CardWindow.svelte'].split('<script lang="ts">')[1];
    // (Its code, not its comments.)
    const host = src['/src/lib/cardwindow.svelte.ts']
      .split('\n')
      .filter((l: string) => !/^\s*(\/\/|\/\*\*|\*)/.test(l))
      .join('\n');
    for (const t of CARD_WIN_TYPES) expect(audience).not.toContain(t);
    expect(audience).not.toMatch(/cardwindow|WindowCard/);
    // The card window page: no BroadcastChannel, no game, no session; messages only from the page that opened it.
    expect(page).not.toMatch(/BroadcastChannel|CHANNEL_NAME|HostMsg|Session|Game\b/);
    expect(page).toContain('e.source !== host');
    // The host side posts to that window alone: never through post() or the channel.
    expect(host).not.toMatch(/\bpost\(|BroadcastChannel|channel/);
    expect(host).toContain('cardWin.postMessage');
  });
});
