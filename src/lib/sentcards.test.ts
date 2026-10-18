// 🤫 Cards anywhere (partner-clues spec §12, §14.1, §18.2, §22): a card goes to the buzzer room only when the host sends
// it (🤫 Send a card…, or a tile's panel), exactly to who it was sent to, under its own id; ↻ Send again and ✖ Take back
// touch only that card; a card lasts its round, its tile or until taken back; a tile's card edited since comes off the
// phones; a player taken out, a reload and Resume with my edits keep it right; and viewers never get Session.cards.
import { describe, expect, it } from 'vitest';
import { jeopardyGame } from './testgame';
import { newImageEl, newRound, setSlideText, type BoardRound, type FinalRound, type Game, type SavedCard, type SentCard, type Session } from './model';
import { backToBoard, backToLastRound, finalChoose, finalNext, forViewers, goToRound, migrateSession, newSession, openClue, rebaseSession, removePlayer } from './session';
import { addCard, cardHash, sendCards, setCardName, setPartner, setPartnerGame } from './partner';
import { hostCards, hostState, buzzIdle, newBuzz, phoneStatus, roomCardCount, roomCardsFull, sessionCards } from './buzz';
import {
  cardsOut,
  cleanTo,
  dropOverCards,
  finalRecipients,
  linkItem,
  nextLabel,
  quickSlide,
  repairSentCards,
  sendCard,
  sendCardAgain,
  sentCardId,
  sentState,
  sentToText,
  takeBackCard,
  tileCard,
  tileRecipients,
} from './sentcards';
import { OLD_FILE_LIMITS } from './buzzproto';

/** How big a file the buzzer server takes in these tests (one that doesn't say: 16 MB). */
const FILE_BYTES = OLD_FILE_LIMITS.fileBytes;

/** Ann (a), Bob (b) and Cat (c); Movies $400 a standard tile with Card 1 ("TIP-xyzzy" and a picture from a file). */
function setup() {
  const g = jeopardyGame();
  g.rounds.splice(1, 0, newRound('Double Jeopardy!'));
  g.players = ['Ann', 'Bob', 'Cat'].map((name, i) => ({ id: name[0].toLowerCase(), name, color: ['#e6194b', '#3cb44b', '#4363d8'][i] }));
  const r = g.rounds[0] as BoardRound;
  r.categories[0].title = 'Movies';
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

/** One of the editor's 🤫 Cards, with these words. */
function saved(id: string, name: string, words: string): SavedCard {
  const c: SavedCard = { id, name, background: {}, elements: [] };
  setSlideText(c, words);
  return c;
}

const REF = { round: 0, cat: 0, row: 1 };
/** Everything the room is told now. */
const told = (g: Game, session: Session) =>
  JSON.stringify(hostState(g, session, buzzIdle(newBuzz(2)), 0, { status: phoneStatus(g, session, false, { cards: true }), cards: hostCards(g, session, { fileBytes: FILE_BYTES, files: {} }) }));

describe('🤫 Send a card…: only the host’s press sends, exactly to who it went to', () => {
  it('nothing out, nothing told; a quick card goes to its players, labelled in the order sent', () => {
    const { g, session } = setup();
    expect(sessionCards(g, session, { fileBytes: FILE_BYTES, files: {} })).toBeNull();
    expect(told(g, session)).not.toMatch(/"cards"|SPY-plugh/);
    const slide = quickSlide('SPY-plugh');
    const one = sendCard(g, session, { to: [{ seat: 'b' }], content: { slide }, until: 'round' }, 1000)!;
    expect(one).toMatchObject({ label: 'Card 1', to: [{ seat: 'b' }], at: 1000, until: 'round', round: g.rounds[0].id });
    // (A copy went: the dialog's card changing afterwards doesn't change it.)
    setSlideText(slide, 'changed');
    expect(sessionCards(g, session, { fileBytes: FILE_BYTES, files: {} })).toEqual([{ id: `sc:${one.id}:1000`, to: [{ seat: 'b' }], open: true, text: 'SPY-plugh' }]);
    const two = sendCard(g, session, { to: [{ seat: 'c' }, { seat: 'a' }], content: { slide: quickSlide('Location-qwop') }, until: 'host' }, 2000)!;
    expect(two.label).toBe('Card 2');
    expect(two.to).toEqual([{ seat: 'a' }, { seat: 'c' }]);
    // Each phone gets its own: the room is told who gets which, and the labels never go to it.
    expect(sessionCards(g, session, { fileBytes: FILE_BYTES, files: {} })!.map((c) => [c.id, c.to])).toEqual([
      [sentCardId(one), [{ seat: 'b' }]],
      [sentCardId(two), [{ seat: 'a' }, { seat: 'c' }]],
    ]);
    expect(told(g, session)).not.toMatch(/Card 1|Card 2/);
  });

  it('refuses a card for nobody, or with nothing to send', () => {
    const { g, session } = setup();
    expect(sendCard(g, session, { to: [], content: { slide: quickSlide('x') }, until: 'host' })).toBeNull();
    expect(sendCard(g, session, { to: [{ seat: 'gone' }], content: { slide: quickSlide('x') }, until: 'host' })).toBeNull();
    expect(sendCard(g, session, { to: [{ seat: 'a' }], content: { clue: 'nope', card: 'nope' }, until: 'host' })).toBeNull();
    // A card that lasts until its tile closes needs a tile open.
    expect(sendCard(g, session, { to: [{ seat: 'a' }], content: { slide: quickSlide('x') }, until: 'tile' })).toBeNull();
    expect(session.cards).toBeUndefined();
  });

  it('recipients: players still here, in order, once; a whole team takes in one person on it', () => {
    const { session } = setup();
    const mia = { id: 'm-1', name: 'Mia' };
    expect(cleanTo(session, [{ seat: 'c' }, { seat: 'a' }, { seat: 'a' }, { seat: 'zz' }])).toEqual([{ seat: 'a' }, { seat: 'c' }]);
    expect(cleanTo(session, [{ seat: 'b', member: mia }, { seat: 'b', member: mia }])).toEqual([{ seat: 'b', member: mia }]);
    expect(cleanTo(session, [{ seat: 'b', member: mia }, { seat: 'b' }])).toEqual([{ seat: 'b' }]);
    expect(sentToText(session, [{ seat: 'b', member: mia }, { seat: 'a' }], true)).toBe('Mia (Bob), Ann');
  });

  it('one person on a team: the room is told their member id, not the team', () => {
    const { g, session } = setup();
    const c = sendCard(g, session, { to: [{ seat: 'b', member: { id: 'm-1', name: 'Mia' } }], content: { slide: quickSlide('x') }, until: 'host' })!;
    expect(sessionCards(g, session, { fileBytes: FILE_BYTES, files: {} })![0].to).toEqual([{ seat: 'b', member: 'm-1' }]);
    expect(c.to[0].member).toEqual({ id: 'm-1', name: 'Mia' });
  });

  it('↻ Send again renews only that card’s id (a phone late for it gets it); ✖ Take back takes only that one', () => {
    const { g, session } = setup();
    const one = sendCard(g, session, { to: [{ seat: 'a' }], content: { slide: quickSlide('A') }, until: 'host' }, 1000)!;
    const two = sendCard(g, session, { to: [{ seat: 'b' }], content: { slide: quickSlide('B') }, until: 'host' }, 1000)!;
    expect(sendCardAgain(g, session, one.id, 1000)).toBe(true);
    const ids = sessionCards(g, session, { fileBytes: FILE_BYTES, files: {} })!.map((c) => c.id);
    expect(ids).toEqual([`sc:${one.id}:1001`, `sc:${two.id}:1000`]);
    expect(session.cards!.find((c) => c.id === one.id)!.label).toBe('Card 1');
    takeBackCard(session, one.id);
    expect(sessionCards(g, session, { fileBytes: FILE_BYTES, files: {} })!.map((c) => c.id)).toEqual([`sc:${two.id}:1000`]);
    // (Numbered in the order sent: the next isn't another "Card 1" or "Card 2" while one is out.)
    expect(nextLabel(session)).toBe('Card 3');
    takeBackCard(session, two.id);
    expect(session.cards).toBeUndefined();
    expect(sessionCards(g, session, { fileBytes: FILE_BYTES, files: {} })).toBeNull();
    expect(nextLabel(session)).toBe('Card 1');
  });

  it('a picture from this computer: { pending } until it’s up, then the room’s file; { missing } with no files', () => {
    const { g, session, clue, card } = setup();
    openClue(session, REF, g);
    sendCard(g, session, { to: [{ seat: 'a' }], content: { clue: clue.id, card: card.id }, until: 'tile' });
    expect(sessionCards(g, session, { fileBytes: FILE_BYTES, files: {} })![0].media).toEqual([{ kind: 'image', pending: true }]);
    expect(sessionCards(g, session, { fileBytes: FILE_BYTES, files: { m1: 'f'.repeat(64) } })![0].media).toEqual([{ kind: 'image', file: 'f'.repeat(64), mime: 'image/png' }]);
    expect(sessionCards(g, session, { fileBytes: FILE_BYTES, files: null })![0].media).toEqual([{ kind: 'image', missing: true }]);
    expect(told(g, session)).not.toMatch(/secret-pic/);
  });
});

describe('a tile’s own cards (🤫 Just you, 💡 Insider tip)', () => {
  it('start with whoever picked it, a Daily Double’s player, everyone else, or nobody', () => {
    const { session } = setup();
    expect(tileRecipients(session, { to: 'picker' })).toEqual([{ seat: 'a' }]);
    expect(tileRecipients(session, { to: 'others' })).toEqual([{ seat: 'b' }, { seat: 'c' }]);
    expect(tileRecipients(session, { to: 'nobody' })).toEqual([]);
    // (A partner clue's card kept on a tile whose type changed: nobody yet.)
    expect(tileRecipients(session, { to: 'giver' })).toEqual([]);
    session.dd = { stage: 'splash', playerId: 'c' };
    expect(tileRecipients(session, { to: 'picker' })).toEqual([{ seat: 'c' }]);
    session.dd = { stage: 'splash' };
    expect(tileRecipients(session, { to: 'picker' })).toEqual([]);
  });

  it('a card from the tile’s panel lasts until the tile closes; it answers "the answer’s on screen" after Reveal', () => {
    const { g, session, clue, card } = setup();
    openClue(session, REF, g);
    const c = sendCard(g, session, { to: tileRecipients(session, card), content: { clue: clue.id, card: card.id }, until: 'tile' })!;
    expect(c).toMatchObject({ until: 'tile', tile: clue.id, to: [{ seat: 'a' }] });
    expect(sessionCards(g, session, { fileBytes: FILE_BYTES, files: {} })![0]).toMatchObject({ open: true, text: 'TIP-xyzzy' });
    session.revealed = true;
    expect(sessionCards(g, session, { fileBytes: FILE_BYTES, files: {} })![0].open).toBe(false);
    backToBoard(session, g);
    expect(session.cards).toBeUndefined();
    expect(told(g, session)).not.toMatch(/xyzzy/);
  });

  it('a tile’s card edited in the editor since it went is off the phones until ↻ Send again', () => {
    const { g, session, clue, card } = setup();
    openClue(session, REF, g);
    const c = sendCard(g, session, { to: [{ seat: 'a' }], content: { clue: clue.id, card: card.id }, until: 'tile' })!;
    expect(sentState(g, c)).toBe('sent');
    setSlideText(card, 'TIP-changed');
    expect(sentState(g, session.cards![0])).toBe('edited');
    expect(sessionCards(g, session, { fileBytes: FILE_BYTES, files: {} })).toBeNull();
    expect(told(g, session)).not.toMatch(/TIP-/);
    sendCardAgain(g, session, c.id);
    expect(sessionCards(g, session, { fileBytes: FILE_BYTES, files: {} })![0].text).toBe('TIP-changed');
  });

  it('a card renamed in the editor stays on the phones, and its name never reaches the room or its label', () => {
    const { g, session, clue, card } = setup();
    card.name = 'Clue tip';
    openClue(session, REF, g);
    const c = sendCard(g, session, { to: [{ seat: 'a' }], content: { clue: clue.id, card: card.id }, until: 'tile' })!;
    expect(c.label).toBe('Card 1');
    card.name = 'Leader hint';
    expect(sentState(g, c)).toBe('sent');
    expect(sessionCards(g, session, { fileBytes: FILE_BYTES, files: {} })![0].text).toBe('TIP-xyzzy');
    expect(told(g, session)).not.toMatch(/Clue tip|Leader hint/);
  });

  it('a partner clue’s sends and these go to the room together, at most 8: a 9th send is refused, and no card ever leaves the room’s list and comes back', () => {
    const { g, session } = setup();
    const r = g.rounds[0] as BoardRound;
    const pc = r.categories[1].clues[0];
    pc.type = 'partner';
    setPartnerGame(pc, 'describe');
    setSlideText(pc.cards![0], 'PARTNER-card');
    openClue(session, { round: 0, cat: 1, row: 0 }, g);
    setPartner(session, session.partner!, 'b', 'wheel');
    // Every id the room was told, and those it was told and then not: one of those told again would be a card the room
    // forgot meanwhile, which it would give to a phone that came after it was sent.
    const told = new Set<string>();
    const gone = new Set<string>();
    const look = () => {
      const now = (hostCards(g, session, { fileBytes: FILE_BYTES, files: {} }) ?? []).map((c) => c.id);
      for (const id of now) expect(gone.has(id), `${id} came back`).toBe(false);
      for (const id of told) if (!now.includes(id)) gone.add(id);
      for (const id of now) told.add(id);
      return now;
    };
    for (let i = 0; i < 9; i++) {
      sendCard(g, session, { to: [{ seat: 'c' }], content: { slide: quickSlide(`Q${i}`) }, until: 'round' }, 1000 + i, roomCardsFull(g, session));
      look();
    }
    // Eight went; the 9th was refused, never sent by leaving Q0 off.
    expect(session.cards).toHaveLength(8);
    expect(roomCardCount(g, session)).toBe(8);
    expect(hostCards(g, session, { fileBytes: FILE_BYTES, files: {} })!.map((c) => c.text)).toEqual(['Q0', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7']);
    // The partner clue's card can't go either (the room is full): refused, not sent over another.
    expect(roomCardsFull(g, session, (t) => sendCards(t, t.partner!, pc.cards!, 500))).toBe(true);
    // One taken back: there's room for it.
    takeBackCard(session, session.cards![7].id);
    look();
    expect(roomCardsFull(g, session, (t) => sendCards(t, t.partner!, pc.cards!, 500))).toBe(false);
    sendCards(session, session.partner!, pc.cards!, 500);
    expect(look()).toHaveLength(8);
    expect(hostCards(g, session, { fileBytes: FILE_BYTES, files: {} })!.map((c) => c.text)).toEqual(['PARTNER-card', 'Q0', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6']);
    expect(sendCard(g, session, { to: [{ seat: 'c' }], content: { slide: quickSlide('Q9') }, until: 'round' }, 2000, roomCardsFull(g, session))).toBeNull();
    // ↻ Send again adds nothing: never refused.
    expect(roomCardsFull(g, session, (t) => sendCardAgain(g, t, t.cards![0].id, 3000))).toBe(false);
    // Taken back one by one: none of those left comes back.
    while (session.cards?.length) {
      takeBackCard(session, session.cards[session.cards.length - 1].id);
      look();
    }
    expect(hostCards(g, session, { fileBytes: FILE_BYTES, files: {} })!.map((c) => c.text)).toEqual(['PARTNER-card']);
  });

  it('the room gets them in the order sent, whichever kind each is (a phone shows the newest first); ↻ Send again makes one the newest', () => {
    const { g, session } = setup();
    const r = g.rounds[0] as BoardRound;
    const pc = r.categories[1].clues[0];
    pc.type = 'partner';
    setPartnerGame(pc, 'describe');
    setSlideText(pc.cards![0], 'PARTNER-card');
    const old = sendCard(g, session, { to: [{ seat: 'b' }], content: { slide: quickSlide('OLD-role') }, until: 'host' }, 1000)!;
    sendCard(g, session, { to: [{ seat: 'b' }], content: { slide: quickSlide('WILD-card') }, until: 'host' }, 2000);
    openClue(session, { round: 0, cat: 1, row: 0 }, g);
    setPartner(session, session.partner!, 'b', 'wheel');
    sendCards(session, session.partner!, pc.cards!, 3000);
    const texts = () => hostCards(g, session, { fileBytes: FILE_BYTES, files: {} })!.map((c) => c.text);
    expect(texts()).toEqual(['OLD-role', 'WILD-card', 'PARTNER-card']);
    sendCard(g, session, { to: [{ seat: 'c' }], content: { slide: quickSlide('TIP-later') }, until: 'host' }, 4000);
    expect(texts()).toEqual(['OLD-role', 'WILD-card', 'PARTNER-card', 'TIP-later']);
    sendCardAgain(g, session, old.id, 5000);
    expect(texts()).toEqual(['WILD-card', 'PARTNER-card', 'TIP-later', 'OLD-role']);
  });
});

describe('one of the editor’s 🤫 Cards', () => {
  it('goes by reference (its id, never a copy), read from the game as it is now: changed since, it’s edited; deleted, gone', () => {
    const { g, session } = setup();
    g.cards = [saved('sc1', 'Wild card', 'WILD-plugh')];
    const c = sendCard(g, session, { to: [{ seat: 'b' }], content: { saved: 'sc1' }, until: 'host' }, 1000)!;
    expect(c).toMatchObject({ label: 'Card 1', content: { saved: 'sc1' }, hash: cardHash(g.cards[0]) });
    expect(sentState(g, c)).toBe('sent');
    // (Its name and how long it lasts aren't what's on it.)
    g.cards[0].name = 'Joker';
    g.cards[0].until = 'host';
    expect(sentState(g, c)).toBe('sent');
    setSlideText(g.cards[0], 'WILD-changed');
    expect(sentState(g, c)).toBe('edited');
    delete g.cards;
    expect(sentState(g, c)).toBe('gone');
    expect(sendCard(g, session, { to: [{ seat: 'b' }], content: { saved: 'sc1' }, until: 'host' })).toBeNull();
  });

  it('↻ Send again sends what’s on it now; one deleted in the editor (▶ Resume with my edits) is taken back', () => {
    const { g, session, clue, card } = setup();
    g.cards = [saved('sc1', 'Wild card', 'WILD-plugh'), saved('sc2', 'Tip A', 'TIP-qwop')];
    const wild = sendCard(g, session, { to: [{ seat: 'b' }], content: { saved: 'sc1' }, until: 'host' }, 1000)!;
    const tip = sendCard(g, session, { to: [{ seat: 'a' }], content: { saved: 'sc2' }, until: 'round' }, 2000)!;
    const tile = sendCard(g, session, { to: [{ seat: 'c' }], content: { clue: clue.id, card: card.id }, until: 'host' }, 3000)!;
    setSlideText(g.cards[0], 'WILD-changed');
    expect(sentState(g, wild)).toBe('edited');
    expect(sessionCards(g, session, { fileBytes: FILE_BYTES, files: {} })!.map((c) => c.text)).toEqual(['TIP-qwop', 'TIP-xyzzy']);
    expect(sendCardAgain(g, session, wild.id, 4000)).toBe(true);
    const again = session.cards!.find((c) => c.id === wild.id)!;
    expect(again).toMatchObject({ at: 4000, hash: cardHash(g.cards[0]), content: { saved: 'sc1' } });
    expect(sentState(g, again)).toBe('sent');
    expect(sessionCards(g, session, { fileBytes: FILE_BYTES, files: {} })!.map((c) => c.text)).toEqual(['WILD-changed', 'TIP-qwop', 'TIP-xyzzy']);
    // Tip A deleted in the editor: it isn't out, and Resume with my edits takes it back.
    const edited: Game = JSON.parse(JSON.stringify(g));
    edited.cards!.splice(1, 1);
    expect(cardsOut(edited, session).map((c) => c.id)).toEqual([wild.id, tile.id]);
    rebaseSession(session, g, edited);
    expect(session.cards!.map((c) => c.id)).toEqual([wild.id, tile.id]);
    expect(session.cards!.some((c) => c.id === tip.id)).toBe(false);
    // The last one too: the tile's card is left.
    delete edited.cards;
    dropOverCards(edited, session);
    expect(session.cards!.map((c) => c.id)).toEqual([tile.id]);
    // (An object with only the boards still reads a tile's card; it reads every 🤫 Card as deleted, so pass the game.)
    expect(cardsOut({ rounds: g.rounds }, session).map((c) => c.id)).toEqual([tile.id]);
  });

  it('a reload keeps it by its id; a card id that isn’t one is dropped', () => {
    const { g, session } = setup();
    g.cards = [saved('sc1', 'Wild card', 'WILD-plugh')];
    const c = sendCard(g, session, { to: [{ seat: 'b' }], content: { saved: 'sc1' }, until: 'host' }, 1000)!;
    const reloaded: Session = JSON.parse(JSON.stringify(session));
    migrateSession(reloaded, g);
    expect(reloaded.cards).toEqual(session.cards);
    expect(sessionCards(g, reloaded, { fileBytes: FILE_BYTES, files: {} })!.map((x) => [x.id, x.text])).toEqual([[sentCardId(c), 'WILD-plugh']]);
    const bad = JSON.parse(JSON.stringify(session)) as Session;
    const good = bad.cards![0];
    bad.cards = [
      good,
      { ...good, id: 'x1', content: { saved: 5 } },
      { ...good, id: 'x2', content: { saved: 'x' } },
      // (Read as a slide first, as sentSlide reads it: a slide that isn't one, whatever else is there.)
      { ...good, id: 'x3', content: { saved: 'sc1', slide: 5 } },
      { ...good, id: 'x4', content: { clue: 'c', card: 'k', slide: 5 } },
    ] as unknown as SentCard[];
    repairSentCards(bad);
    // (A card id the game doesn't have is still well-formed: dropOverCards takes it back with the game at hand.)
    expect(bad.cards!.map((x) => x.id)).toEqual([good.id, 'x2']);
    expect(sessionCards(g, bad, { fileBytes: FILE_BYTES, files: {} })!.map((x) => x.text)).toEqual(['WILD-plugh']);
  });
});

describe('how long a card lasts', () => {
  it('until the round ends; until taken back stays across rounds; the end screen has no round', () => {
    const { g, session } = setup();
    const round = sendCard(g, session, { to: [{ seat: 'a' }], content: { slide: quickSlide('R') }, until: 'round' })!;
    const host = sendCard(g, session, { to: [{ seat: 'b' }], content: { slide: quickSlide('H') }, until: 'host' })!;
    expect(cardsOut(g, session).map((c) => c.id)).toEqual([round.id, host.id]);
    goToRound(session, g, 1);
    expect(session.cards!.map((c) => c.id)).toEqual([host.id]);
    goToRound(session, g, 99);
    expect(session.phase).toBe('end');
    expect(session.cards!.map((c) => c.id)).toEqual([host.id]);
    // (No round to last on the end screen.)
    expect(sendCard(g, session, { to: [{ seat: 'a' }], content: { slide: quickSlide('x') }, until: 'round' })).toBeNull();
  });

  it('a player taken out is dropped from every card; a card only for them is taken back', () => {
    const { g, session } = setup();
    sendCard(g, session, { to: [{ seat: 'a' }, { seat: 'b' }], content: { slide: quickSlide('AB') }, until: 'host' });
    sendCard(g, session, { to: [{ seat: 'b' }], content: { slide: quickSlide('B') }, until: 'host' });
    removePlayer(session, 'b');
    expect(session.cards!.map((c) => [c.label, c.to])).toEqual([['Card 1', [{ seat: 'a' }]]]);
  });

  it('Resume with my edits: a tile’s card deleted is taken back; a quick card and a kept round stay', () => {
    const { g, session, clue, card } = setup();
    sendCard(g, session, { to: [{ seat: 'a' }], content: { clue: clue.id, card: card.id }, until: 'round' });
    sendCard(g, session, { to: [{ seat: 'b' }], content: { slide: quickSlide('Q') }, until: 'round' });
    const edited: Game = JSON.parse(JSON.stringify(g));
    delete (edited.rounds[0] as BoardRound).categories[0].clues[1].cards;
    rebaseSession(session, g, edited);
    expect(session.cards!.map((c) => c.label)).toEqual(['Card 2']);
    // The round itself deleted: its cards go with it.
    const fewer: Game = JSON.parse(JSON.stringify(edited));
    fewer.rounds.splice(0, 1);
    rebaseSession(session, edited, fewer);
    expect(session.cards).toBeUndefined();
  });

  it('a reload keeps them as they were (the same ids), and drops what isn’t well-formed', () => {
    const { g, session } = setup();
    const c = sendCard(g, session, { to: [{ seat: 'a' }], content: { slide: quickSlide('X') }, until: 'round' }, 1000)!;
    const saved: Session = JSON.parse(JSON.stringify(session));
    migrateSession(saved, g);
    expect(sessionCards(g, saved, { fileBytes: FILE_BYTES, files: {} })!.map((x) => x.id)).toEqual([sentCardId(c)]);
    const bad = { ...JSON.parse(JSON.stringify(session)) } as Session;
    const good = bad.cards![0];
    bad.cards = [
      good,
      { ...good, id: 'x1', label: 'typed by someone' },
      { ...good, id: 'x2', to: [] },
      { ...good, id: 'x3', until: 'tile' },
      { ...good, id: 'x4', content: { nope: true } },
      { ...good, id: 'x5', to: [{ seat: 'a', member: 'not a member' }] },
    ] as unknown as SentCard[];
    repairSentCards(bad);
    expect(bad.cards!.map((x) => x.id)).toEqual([good.id]);
    const junk = { cards: 'junk' } as unknown as Session;
    repairSentCards(junk);
    expect(junk.cards).toBeUndefined();
  });
});

describe('a Final’s own cards', () => {
  /** setup()'s game at its Final (the third round, wagers up), with Card 1 "Leader hint" ("HINT-zork") and Card 2. */
  function atFinal() {
    const { g, session } = setup();
    const final = g.rounds[2] as FinalRound;
    setSlideText(final.questionSlide, 'The final question');
    setSlideText(final.answerSlide, 'The final answer');
    const hint = addCard(final, 'playing')!;
    setSlideText(hint, 'HINT-zork');
    setCardName(hint, 'Leader hint');
    const side = addCard(final, 'nobody')!;
    setSlideText(side, 'SIDE-frotz');
    goToRound(session, g, 2);
    return { g, session, final, hint, side };
  }

  it('found by the Final round’s id and their own, numbered there', () => {
    const { g, final, hint, side } = atFinal();
    expect(tileCard(g, final.id, hint.id)).toEqual({ holder: final, card: hint, n: 1 });
    expect(tileCard(g, final.id, side.id)?.n).toBe(2);
    expect(tileCard(g, final.id, 'nope')).toBeUndefined();
    // (A tile's still are.)
    const clue = (g.rounds[0] as BoardRound).categories[0].clues[1];
    expect(tileCard(g, clue.id, clue.cards![0].id)?.holder).toBe(clue);
  });

  it('start with everyone playing it, in the players’ order, following the ticks; or nobody', () => {
    const { session, hint, side } = atFinal();
    expect(session.phase).toBe('final');
    expect(finalRecipients(session, hint)).toEqual([{ seat: 'a' }, { seat: 'b' }, { seat: 'c' }]);
    finalChoose(session, 'b', false);
    expect(finalRecipients(session, hint)).toEqual([{ seat: 'a' }, { seat: 'c' }]);
    finalChoose(session, 'b', true);
    expect(finalRecipients(session, hint)).toEqual([{ seat: 'a' }, { seat: 'b' }, { seat: 'c' }]);
    expect(finalRecipients(session, side)).toEqual([]);
    expect(finalRecipients({ players: session.players }, hint)).toEqual([]);
  });

  it('a card from the Final’s panel lasts the Final, through every step, and goes when it ends (an Undo back into it doesn’t bring it back)', () => {
    const { g, session, final, hint } = atFinal();
    // (Not "until the tile closes": no tile is open in a Final.)
    expect(sendCard(g, session, { to: [{ seat: 'a' }], content: { clue: final.id, card: hint.id }, until: 'tile' })).toBeNull();
    const c = sendCard(g, session, { to: finalRecipients(session, hint), content: { clue: final.id, card: hint.id }, until: 'round' }, 1000)!;
    expect(c).toMatchObject({ label: 'Card 1', until: 'round', round: final.id, hash: cardHash(hint), content: { clue: final.id, card: hint.id } });
    expect(sessionCards(g, session, { fileBytes: FILE_BYTES, files: {} })).toEqual([{ id: sentCardId(c), to: [{ seat: 'a' }, { seat: 'b' }, { seat: 'c' }], open: true, text: 'HINT-zork' }]);
    // A card to three players is one card for the room.
    expect(roomCardCount(g, session)).toBe(1);
    for (const step of ['question', 'answer', 'reveal'] as const) {
      finalNext(session, g);
      expect(session.finalStep).toBe(step);
      expect(cardsOut(g, session).map((x) => x.id)).toEqual([c.id]);
      // (Never "the answer's on screen": it isn't the tile's answer.)
      expect(sessionCards(g, session, { fileBytes: FILE_BYTES, files: {} })![0].open).toBe(true);
    }
    finalNext(session, g);
    expect(session.phase).toBe('end');
    expect(session.cards).toBeUndefined();
    backToLastRound(session, g, 2);
    expect(session.phase).toBe('final');
    expect(session.cards).toBeUndefined();
    expect(told(g, session)).not.toMatch(/zork/);
  });

  it('◀ Previous round from the wagers takes it back too, and coming back to the Final doesn’t bring it back', () => {
    const { g, session, final, hint } = atFinal();
    sendCard(g, session, { to: [{ seat: 'b' }], content: { clue: final.id, card: hint.id }, until: 'round' });
    goToRound(session, g, 1);
    expect(session.cards).toBeUndefined();
    goToRound(session, g, 2);
    expect(session.cards).toBeUndefined();
  });

  it('renamed in the editor it stays on the phones; its words edited, it’s off them; the Final deleted, it’s gone', () => {
    const { g, session, final, hint } = atFinal();
    const c = sendCard(g, session, { to: [{ seat: 'a' }], content: { clue: final.id, card: hint.id }, until: 'round' })!;
    setCardName(hint, 'Side bet');
    expect(sentState(g, c)).toBe('sent');
    expect(told(g, session)).not.toMatch(/Leader hint|Side bet/);
    setSlideText(hint, 'HINT-changed');
    expect(sentState(g, c)).toBe('edited');
    expect(sessionCards(g, session, { fileBytes: FILE_BYTES, files: {} })).toBeNull();
    const edited: Game = JSON.parse(JSON.stringify(g));
    edited.rounds.splice(2, 1);
    expect(sentState(edited, c)).toBe('gone');
    rebaseSession(session, g, edited);
    expect(session.cards).toBeUndefined();
  });

  it('a reload keeps it, by the Final’s id', () => {
    const { g, session, final, hint } = atFinal();
    const c = sendCard(g, session, { to: [{ seat: 'a' }, { seat: 'c' }], content: { clue: final.id, card: hint.id }, until: 'round' }, 1000)!;
    const saved: Session = JSON.parse(JSON.stringify(session));
    repairSentCards(saved);
    migrateSession(saved, g);
    expect(saved.cards).toEqual([c]);
    expect(sessionCards(g, saved, { fileBytes: FILE_BYTES, files: {} })!.map((x) => x.id)).toEqual([sentCardId(c)]);
  });
});

describe('viewers never get them', () => {
  it('forViewers drops Session.cards (a quick card holds the words the host typed)', () => {
    const { g, session } = setup();
    sendCard(g, session, { to: [{ seat: 'a' }], content: { slide: quickSlide('SECRET-words') }, until: 'host' });
    const v = forViewers(session);
    expect(v.cards).toBeUndefined();
    expect(JSON.stringify(v)).not.toMatch(/SECRET-words/);
    expect(session.cards).toHaveLength(1);
  });
});

describe('a quick card’s items', () => {
  it('a link: a YouTube video in its player, a picture link as a picture, words when it won’t work', () => {
    const yt = linkItem('https://youtu.be/dQw4w9WgXcQ?t=30');
    expect(yt).toMatchObject({ kind: 'embed', embedKind: 'youtube', startAt: 30 });
    expect(linkItem('https://files.catbox.moe/abc.mp4')).toMatchObject({ kind: 'embed', embedKind: 'remoteVideo', url: 'https://files.catbox.moe/abc.mp4' });
    expect(linkItem('https://example.com/pic')).toMatchObject({ kind: 'embed', embedKind: 'remoteImage' });
    expect(typeof linkItem('not a link')).toBe('string');
    expect(typeof linkItem('https://mega.nz/file/x')).toBe('string');
  });

  it('words first, then the items in order', () => {
    const s = quickSlide('  Hi  ', [newImageEl('m1'), newImageEl('m2')]);
    expect(s.elements.map((e) => (e.kind === 'text' ? e.text : e.kind === 'image' ? e.media : ''))).toEqual(['Hi', 'm1', 'm2']);
    expect(s.elements[1].y).toBeLessThan(s.elements[2].y);
    expect(quickSlide('   ').elements).toEqual([]);
  });
});
