// 🤫 A partner clue's cards on phones (partner-clues spec §6.5, §14.4, §14.9, §15, §19): the room gets a card only when
// the host sends it (one id per send), exactly to who it was sent to; Send again, Send changes and Take back touch only
// that card; an edited card comes off the phones; a reload uploads files only for cards sent or got ready; and the
// phones' status lines with a room that takes cards.
import { describe, expect, it, vi } from 'vitest';
import { jeopardyGame } from './testgame';
import { newImageEl, newTextEl, newVideoEl, setSlideText, type BoardRound, type Game, type PartnerGame, type Session } from './model';
import { backToBoard, judgePartner, migrateSession, newSession, openClue, rebaseSession, removePlayer } from './session';
import {
  addCard,
  cardHash,
  cardId,
  cardLines,
  cardRecipients,
  cardSends,
  filesWanted,
  markReady,
  partnerRules,
  partnerShares,
  recipientsText,
  sameTeam,
  sendAgain,
  sendCards,
  sendChanges,
  sendState,
  setDescriber,
  setPartner,
  setPartnerGame,
  setRecipients,
  swapParts,
  takeBack,
} from './partner';
import { buzzIdle, cardText, fitCards, hostState, newBuzz, partnerAnswerAsk, partnerAnswerId, partnerCards, phoneStatus, sendOf } from './buzz';
import { CARDS_BYTES, type HostCard } from './buzzproto';

const HASH = 'a'.repeat(64);

/** Ann (a), Bob (b) and Cat (c); Movies $400 a partner clue: Card 1 words only, Card 2 words and a picture from a file. */
function setup(game: PartnerGame = 'describe', opts: { typeGuess?: boolean; teams?: boolean } = {}) {
  const g = jeopardyGame();
  g.players = ['Ann', 'Bob', 'Cat'].map((name, i) => ({ id: name[0].toLowerCase(), name, color: ['#e6194b', '#3cb44b', '#4363d8'][i] }));
  if (opts.teams) g.settings.buzzTeams = true;
  const r = g.rounds[0] as BoardRound;
  r.categories[0].title = 'Movies';
  const clue = r.categories[0].clues[1];
  clue.type = 'partner';
  setPartnerGame(clue, game);
  if (opts.typeGuess) clue.partner!.typeGuess = true;
  setSlideText(clue.questionSlide, 'Describe this movie');
  setSlideText(clue.answerSlide, 'Shrek');
  if (!clue.cards?.length) addCard(clue);
  setSlideText(clue.cards![0], 'CARD-ONE-xyzzy');
  const two = addCard(clue)!;
  setSlideText(two, 'CARD-TWO-plugh');
  two.to = 'others';
  two.elements.push({ ...newImageEl('m1'), y: 600 });
  g.media.push({ id: 'm1', name: 'secret-pic.png', mime: 'image/png', size: 1000, kind: 'image' });
  const session = newSession(g);
  session.currentPickerId = 'a';
  openClue(session, { round: 0, cat: 0, row: 1 }, g);
  return { g, session, s: session.partner!, clue, one: clue.cards![0], two };
}

/** Everything the room is told now, with or without files. */
const told = (g: Game, session: Session, files: Record<string, string> | null = {}) =>
  JSON.stringify(hostState(g, session, buzzIdle(newBuzz(2)), 0, { status: phoneStatus(g, session, false, { cards: true }), cards: partnerCards(g, session, { files }) }));

describe('nothing goes to the room until the host sends it', () => {
  it('the tile opening, the wheel, ⇄ Swap, the chips and Show question send nothing, and upload nothing', () => {
    const { g, session, s, clue, two } = setup();
    const quiet = () => {
      expect(partnerCards(g, session, { files: {} })).toBeNull();
      expect(s.sent).toBeUndefined();
      expect(s.ready).toBeUndefined();
      expect(filesWanted(g, clue, s, {}, {})).toEqual([]);
      expect(told(g, session)).not.toMatch(/xyzzy|plugh|secret-pic|"cards"/);
    };
    quiet();
    setPartner(session, s, 'b', 'wheel');
    quiet();
    swapParts(s);
    swapParts(s);
    setRecipients(session, s, two, ['a', 'c']);
    quiet();
    s.stage = 'distribute';
    quiet();
    s.stage = 'live';
    quiet();
  });

  it('📤 Send for one card: exactly that card, to exactly its recipients, under its own id', () => {
    const { g, session, s, clue, one } = setup();
    setPartner(session, s, 'b', 'wheel');
    s.stage = 'distribute';
    expect(sendCards(session, s, [one], 1000)).toEqual([one]);
    expect(partnerCards(g, session, { files: {} })).toEqual([
      { id: `pc:${clue.id}:${one.id}:1000`, to: [{ seat: 'b' }], open: true, role: 'Describer', hint: 'Describe it to Ann: don’t say what’s on it!', text: 'CARD-ONE-xyzzy' },
    ]);
    expect(told(g, session)).not.toMatch(/plugh|secret-pic/);
    // Sending it again by mistake sends nothing new.
    expect(sendCards(session, s, [one], 2000)).toEqual([]);
    expect(cardSends(s, one.id)).toHaveLength(1);
  });

  it('📤 Send and start sends what’s left, not what’s out; a card for nobody stays', () => {
    const { g, session, s, clue, one, two } = setup();
    setPartner(session, s, 'b', 'wheel');
    sendCards(session, s, [one], 1000);
    setRecipients(session, s, two, []);
    expect(sendCards(session, s, clue.cards!, 2000)).toEqual([]);
    setRecipients(session, s, two, ['c']);
    expect(sendCards(session, s, clue.cards!, 3000)).toEqual([two]);
    expect(partnerCards(g, session, { files: {} })!.map((c) => [c.id, c.to])).toEqual([
      [cardId(clue.id, { card: one.id, at: 1000 }), [{ seat: 'b' }]],
      [cardId(clue.id, { card: two.id, at: 3000 }), [{ seat: 'c' }]],
    ]);
  });

  it('a card’s picture from this computer: { missing } with no files, { pending } until it’s up, then the room’s file', () => {
    const { g, session, s, two } = setup();
    setPartner(session, s, 'b', 'wheel');
    sendCards(session, s, [two], 1000);
    const media = (files: Record<string, string> | null) => partnerCards(g, session, { files })![0].media;
    expect(media(null)).toEqual([{ kind: 'image', missing: true }]);
    expect(media({})).toEqual([{ kind: 'image', pending: true }]);
    expect(media({ m1: HASH })).toEqual([{ kind: 'image', file: HASH, mime: 'image/png' }]);
    // (Never its name: it's often the answer.)
    expect(JSON.stringify(partnerCards(g, session, { files: { m1: HASH } }))).not.toContain('secret-pic');
  });

  it('the answer on screen marks the cards (they stay); the tile closing takes them all away', () => {
    const { g, session, s, one } = setup();
    setPartner(session, s, 'b', 'wheel');
    sendCards(session, s, [one], 1000);
    session.revealed = true;
    expect(partnerCards(g, session, { files: {} })![0].open).toBe(false);
    backToBoard(session, g, { markUsed: true });
    expect(partnerCards(g, session, { files: {} })).toBeNull();
    expect(told(g, session)).not.toContain('xyzzy');
  });
});

describe('one send at a time (spec §14.4)', () => {
  it('↻ Send again renews only that card’s id; the other card keeps its own', () => {
    const { g, session, s, clue, one, two } = setup();
    setPartner(session, s, 'b', 'wheel');
    sendCards(session, s, [one, two], 1000);
    const ids = () => partnerCards(g, session, { files: {} })!.map((c) => c.id);
    const before = ids();
    expect(sendAgain(session, s, one, 5000)).toBe(true);
    const after = ids();
    expect(after).toContain(before[1]);
    expect(after).not.toContain(before[0]);
    expect(after).toContain(cardId(clue.id, { card: one.id, at: 5000 }));
    // To the same players.
    expect(partnerCards(g, session, { files: {} })!.find((c) => c.id.includes(one.id))!.to).toEqual([{ seat: 'b' }]);
  });

  it('two sends in the same millisecond still get two ids', () => {
    const { session, s, one } = setup();
    setPartner(session, s, 'b', 'wheel');
    sendCards(session, s, [one], 1000);
    sendAgain(session, s, one, 1000);
    expect(cardSends(s, one.id).map((x) => x.at)).toEqual([1001]);
  });

  it('📤 Send changes: a new id for whoever was added, the old id kept (smaller) for the rest, never widened', () => {
    const { g, session, s, clue, two } = setup();
    setPartner(session, s, 'b', 'wheel');
    setRecipients(session, s, two, ['a', 'c']);
    sendCards(session, s, [two], 1000);
    expect(sendState(session, s, two)).toBe('sent');
    setRecipients(session, s, two, ['c', 'b']);
    expect(sendState(session, s, two)).toBe('changed');
    sendChanges(session, s, two, 2000);
    expect(partnerCards(g, session, { files: {} })!.map((c) => [c.id, c.to])).toEqual([
      [cardId(clue.id, { card: two.id, at: 1000 }), [{ seat: 'c' }]],
      [cardId(clue.id, { card: two.id, at: 2000 }), [{ seat: 'b' }]],
    ]);
    expect(sendState(session, s, two)).toBe('sent');
  });

  it('✖ Take back removes every send of that card and leaves the others', () => {
    const { g, session, s, one, two } = setup();
    setPartner(session, s, 'b', 'wheel');
    sendCards(session, s, [one, two], 1000);
    sendAgain(session, s, two, 2000);
    takeBack(s, two.id);
    expect(partnerCards(g, session, { files: {} })!.map((c) => c.text)).toEqual(['CARD-ONE-xyzzy']);
    takeBack(s, one.id);
    expect(s.sent).toBeUndefined();
    expect(partnerCards(g, session, { files: {} })).toBeNull();
  });

  it('⇄ Swap after a send moves nothing by itself: the row reads changed until 📤 Send changes', () => {
    const { g, session, s, one } = setup();
    setPartner(session, s, 'b', 'wheel');
    sendCards(session, s, [one], 1000);
    swapParts(s);
    expect(sendState(session, s, one)).toBe('changed');
    expect(partnerCards(g, session, { files: {} })![0].to).toEqual([{ seat: 'b' }]);
    sendChanges(session, s, one, 2000);
    expect(partnerCards(g, session, { files: {} })!.map((c) => c.to)).toEqual([[{ seat: 'a' }]]);
  });

  it('a card edited after it was sent comes off the phones until ↻ Send again', () => {
    const { g, session, s, one } = setup();
    setPartner(session, s, 'b', 'wheel');
    sendCards(session, s, [one], 1000);
    setSlideText(one, 'EDITED-later');
    expect(sendState(session, s, one)).toBe('edited');
    expect(partnerCards(g, session, { files: {} })).toBeNull();
    sendAgain(session, s, one, 2000);
    expect(partnerCards(g, session, { files: {} })![0].text).toBe('EDITED-later');
  });

  it('a player taken out loses the cards sent to them; one sent to others too stays with the others', () => {
    const { g, session, s, one, two } = setup();
    setPartner(session, s, 'b', 'wheel');
    setRecipients(session, s, two, ['a', 'c']);
    sendCards(session, s, [one, two], 1000);
    removePlayer(session, 'c');
    expect(partnerCards(g, session, { files: {} })!.map((c) => c.to)).toEqual([[{ seat: 'b' }], [{ seat: 'a' }]]);
    removePlayer(session, 'a');
    // (Ann was the picker: the clue goes back to choosing, and her card is gone from her.)
    expect(partnerCards(g, session, { files: {} })!.map((c) => c.to)).toEqual([[{ seat: 'b' }]]);
  });
});

describe('one card per part (spec §12.3: each phone gets its own lines)', () => {
  it('a card to its part and someone else: one card each, with their own lines, both marked shared', () => {
    const { g, session, s, clue, one } = setup();
    setPartner(session, s, 'b', 'wheel');
    setRecipients(session, s, one, ['b', 'c']);
    sendCards(session, s, [one], 1000);
    const id = cardId(clue.id, { card: one.id, at: 1000 });
    expect(partnerCards(g, session, { files: {} })).toEqual([
      { id: `${id}~g`, to: [{ seat: 'b' }], open: true, role: 'Describer', hint: 'Describe it to Ann: don’t say what’s on it!', shared: true, text: 'CARD-ONE-xyzzy' },
      { id: `${id}~o`, to: [{ seat: 'c' }], open: true, hint: 'A card from the host: don’t show it to Ann', shared: true, text: 'CARD-ONE-xyzzy' },
    ]);
    // Each is the send, for ✓ seen.
    expect(partnerCards(g, session, { files: {} })!.map((c) => sendOf(c.id))).toEqual([id, id]);
    // A card to one part only is one card, its own id, not shared (the room marks one to several seats shared).
    const { g: g2, session: s2, s: p2, one: one2 } = setup();
    setPartner(s2, p2, 'b', 'wheel');
    sendCards(s2, p2, [one2], 1000);
    expect(partnerCards(g2, s2, { files: {} })![0]).not.toHaveProperty('shared');
  });

  it('which card a phone has stays as it was sent: ⇄ Swap changes its lines, never its id', () => {
    const { g, session, s, one } = setup();
    setPartner(session, s, 'b', 'wheel');
    setRecipients(session, s, one, ['b', 'c']);
    sendCards(session, s, [one], 1000);
    const ids = () => partnerCards(g, session, { files: {} })!.map((c) => c.id);
    const before = ids();
    swapParts(s);
    expect(ids()).toEqual(before);
    expect(partnerCards(g, session, { files: {} })![0]).toMatchObject({ to: [{ seat: 'b' }], role: 'Guesser' });
  });

  it('the card’s own line is for the part it’s set to go to; anyone else gets the line for them', () => {
    const { session, s, clue, one } = setup();
    setPartner(session, s, 'b', 'wheel');
    const rules = partnerRules(clue);
    const name = (id: string) => session.players.find((p) => p.id === id)!.name;
    const own = { ...one, hint: 'Draw it, {giver}!' };
    expect(cardLines(rules, s, own, ['b'], name)).toEqual({ role: 'Describer', hint: 'Draw it, Bob!' });
    expect(cardLines(rules, s, own, ['c'], name)).toEqual({ hint: 'A card from the host: don’t show it to Ann' });
    expect(cardLines(rules, s, { ...own, to: 'others' }, ['c'], name)).toEqual({ hint: 'Draw it, Bob!' });
  });
});

describe('one person describes to their own team (spec §10.2)', () => {
  /** Red (a) picked it and plays it: Zoe on Red describes. */
  function red() {
    const t = setup('describe', { teams: true });
    sameTeam(t.s, true);
    setDescriber(t.s, { id: 'mZoe', name: 'Zoe' });
    return t;
  }

  it('the picker’s own team, with a describer: the describer’s card to them only, the guesser’s to the rest of the team', () => {
    const { session, s, clue, one, two } = red();
    expect([s.partnerId, s.member]).toEqual(['a', { id: 'mZoe', name: 'Zoe' }]);
    expect(cardRecipients(session, s, one)).toEqual([{ seat: 'a', member: { id: 'mZoe', name: 'Zoe' } }]);
    two.to = 'guesser';
    expect(cardRecipients(session, s, two)).toEqual([{ seat: 'a', except: ['mZoe'] }]);
    const rules = partnerRules(clue);
    expect(recipientsText(session, s, rules, one)).toBe('Zoe (describer)');
    expect(recipientsText(session, s, rules, two)).toBe('the rest of Ann (guesser)');
    two.to = 'others';
    expect(cardRecipients(session, s, two)).toEqual([{ seat: 'b' }, { seat: 'c' }]);
    // Scored as Solo: one award to the team, the bigger "got" share.
    expect(partnerShares(400, rules, s, true)).toEqual([{ id: 'a', role: 'solo', points: 400 }]);
  });

  it('sends: Zoe’s card to Zoe only, and the rest of the team a line with it, nothing of the card', () => {
    const { g, session, s, clue, one } = red();
    s.stage = 'distribute';
    sendCards(session, s, [one], 1000);
    const id = cardId(clue.id, { card: one.id, at: 1000 });
    expect(partnerCards(g, session, { files: {} })).toEqual([
      { id, to: [{ seat: 'a', member: 'mZoe' }], open: true, role: 'Describer', hint: 'Describe it to your team: don’t say what’s on it!', text: 'CARD-ONE-xyzzy' },
      { id: `${id}~t`, to: [{ seat: 'a', except: ['mZoe'] }], open: true, role: 'Guesser', hint: '🎯 Your team is guessing! Zoe is describing', tap: false },
    ]);
    expect(sendState(session, s, one)).toBe('sent');
    // A new describer later: the card stays with Zoe until 📤 Send changes.
    setDescriber(s, { id: 'mMax', name: 'Max' });
    expect(sendState(session, s, one)).toBe('changed');
    expect(partnerCards(g, session, { files: {} })![0].to).toEqual([{ seat: 'a', member: 'mZoe' }]);
    sendChanges(session, s, one, 2000);
    expect(partnerCards(g, session, { files: {} })!.map((c) => c.to)).toEqual([[{ seat: 'a', member: 'mMax' }], [{ seat: 'a', except: ['mMax'] }]]);
  });

  it('the phones’ lines say who describes; the team’s line goes to Zoe too, so it never says she guesses', () => {
    const { g, session, s } = red();
    expect(phoneStatus(g, session, false, { cards: true })).toEqual({
      text: '🤝 Zoe describes → Ann guesses',
      off: true,
      sub: 'Nobody buzzes on this one',
      seats: ['a'],
      seatsText: '🤝 Your team plays this one!',
      seatsSub: 'Zoe is describing: wait for the question',
    });
  });

  it('a damaged save never widens one person to their whole team', () => {
    const { g, session, s, one } = red();
    s.stage = 'distribute';
    sendCards(session, s, [one], 1000);
    const bad: Session = JSON.parse(JSON.stringify(session));
    bad.partner!.sent![0].to = [{ seat: 'a', member: 'mZoe' as never }];
    migrateSession(bad, g);
    expect(bad.partner!.sent).toBeUndefined();
    const ok: Session = JSON.parse(JSON.stringify(session));
    migrateSession(ok, g);
    expect(partnerCards(g, ok, { files: {} })).toEqual(partnerCards(g, session, { files: {} }));
  });
});

describe('cardHash', () => {
  it('counts what a phone gets: words, items and their order, the line; not where they sit or how they look', () => {
    const { one } = setup();
    const was = cardHash(one);
    const text = one.elements[0];
    if (text.kind !== 'text') throw new Error('a text box');
    Object.assign(text, { x: text.x + 50, color: '#ff0000', size: 99 });
    expect(cardHash(one)).toBe(was);
    expect(cardHash({ ...one, elements: one.elements.map((e) => JSON.parse(JSON.stringify(e, Object.keys(e).sort()))) })).toBe(was);
    text.text = 'Other words';
    expect(cardHash(one)).not.toBe(was);
    text.text = 'CARD-ONE-xyzzy';
    expect(cardHash({ ...one, hint: 'Psst' })).not.toBe(was);
    expect(cardHash({ ...one, elements: [...one.elements, newVideoEl('v1')] })).not.toBe(was);
  });
});

describe('a reload uploads only what a press started (spec §15.2)', () => {
  it('files are wanted for a card sent, or got ready (⇡), and never for one that was neither', () => {
    const { g, session, s, clue, two } = setup();
    setPartner(session, s, 'b', 'wheel');
    s.stage = 'distribute';
    expect(filesWanted(g, clue, s, {}, {})).toEqual([]);
    markReady(s, [two.id]);
    expect(s.ready).toEqual([two.id]);
    expect(s.sent).toBeUndefined();
    expect(filesWanted(g, clue, s, {}, {})).toEqual(['m1']);
    // Got ready once already (the room cleaned it up since): not again until it's sent.
    expect(filesWanted(g, clue, s, {}, { m1: HASH })).toEqual([]);
    sendCards(session, s, [two], 1000);
    expect(filesWanted(g, clue, s, {}, { m1: HASH })).toEqual(['m1']);
    expect(filesWanted(g, clue, s, { m1: HASH }, { m1: HASH })).toEqual([]);
    // One that was turned down isn't tried again by itself.
    expect(filesWanted(g, clue, s, {}, {}, { m1: 'failed' })).toEqual([]);
  });

  it('a send saved with the game comes back the same after a reload: the same ids, nothing sent again', () => {
    const { g, session, s, one } = setup();
    setPartner(session, s, 'b', 'wheel');
    sendCards(session, s, [one], 1000);
    const before = partnerCards(g, session, { files: {} });
    const saved: Session = JSON.parse(JSON.stringify(session));
    migrateSession(saved, g);
    expect(partnerCards(g, saved, { files: {} })).toEqual(before);
    expect(saved.partner!.sent).toHaveLength(1);
  });

  it('sends that aren’t well-formed are dropped on load, never widened', () => {
    const { g, session, s, one } = setup();
    setPartner(session, s, 'b', 'wheel');
    const bad: Session = JSON.parse(JSON.stringify(session));
    bad.partner!.sent = [
      { card: one.id, to: [], at: 1, hash: cardHash(one) },
      { card: one.id, to: [{ seat: 7 }], at: 2, hash: 'x' } as never,
      { card: one.id, to: [{ seat: 'b' }], at: 3 } as never,
    ];
    bad.partner!.ready = 'all' as never;
    migrateSession(bad, g);
    expect(bad.partner!.sent).toBeUndefined();
    expect(bad.partner!.ready).toBeUndefined();
    expect(partnerCards(g, bad, { files: {} })).toBeNull();
  });

  it('Resume with my edits: a deleted card goes from the phones and from the cards got ready', () => {
    const { g, session, s, one, two } = setup();
    setPartner(session, s, 'b', 'wheel');
    sendCards(session, s, [one, two], 1000);
    markReady(s, [two.id]);
    const edited: Game = JSON.parse(JSON.stringify(g));
    const clue = (edited.rounds[0] as BoardRound).categories[0].clues[1];
    clue.cards = clue.cards!.filter((c) => c.id !== two.id);
    rebaseSession(session, g, edited);
    expect(session.partner!.sent!.map((x) => x.card)).toEqual([one.id]);
    expect(session.partner!.ready).toBeUndefined();
  });
});

describe('the lines above a card', () => {
  it('its part and the game’s line for it, with names; a card for both or the others has no part', () => {
    const { session, s, clue } = setup('split');
    setPartner(session, s, 'b', 'wheel');
    const rules = partnerRules(clue);
    const name = (id: string) => session.players.find((p) => p.id === id)!.name;
    expect(cardLines(rules, s, {}, ['b'], name)).toEqual({ role: 'Half A', hint: 'Your half: share it with Ann and work it out together!' });
    expect(cardLines(rules, s, {}, ['a'], name)).toEqual({ role: 'Half B', hint: 'Your half: share it with Bob and work it out together!' });
    expect(cardLines(rules, s, {}, ['a', 'b'], name)).toEqual({});
    expect(cardLines(rules, s, { hint: 'For {guesser}, from {giver}' }, ['c'], name)).toEqual({ hint: 'For Ann, from Bob' });
  });
});

describe('phoneStatus with a room that takes cards (spec §8.2, §19.4)', () => {
  it('every phone greyed (off) from the tile opening, a big line and a small one, each moment', () => {
    const { g, session, s } = setup();
    const room = { cards: true };
    expect(phoneStatus(g, session, false, room)).toEqual({
      text: '🤝 Partner clue',
      off: true,
      sub: 'Ann needs a partner…',
      seats: ['a'],
      seatsText: '🤝 Your partner clue!',
      seatsSub: 'Spinning for your partner…',
    });
    setPartner(session, s, 'b', 'wheel');
    expect(phoneStatus(g, session, false, room)).toEqual({
      text: '🤝 Ann + Bob',
      off: true,
      sub: 'Partner clue: nobody buzzes',
      seats: ['a', 'b'],
      seatsText: '🤝 You two play this one!',
      seatsSub: 'Wait for the question',
    });
    s.stage = 'distribute';
    expect(phoneStatus(g, session, false, room)).toEqual({
      text: '🤝 Bob describes → Ann guesses',
      off: true,
      sub: 'Nobody buzzes on this one',
      seats: ['a'],
      seatsText: '🎯 You’re guessing!',
      seatsSub: 'Bob is describing: say it out loud',
    });
    s.stage = 'live';
    judgePartner(session, g, true, 400);
    expect(phoneStatus(g, session, false, room)).toEqual({ text: '✔ Got it! Bob +$400 · Ann +$200', off: true });
    session.revealed = true;
    expect(phoneStatus(g, session, false, room)).toEqual({ text: '🤝 Bob described → Ann guessed', off: true });
    expect(JSON.stringify(phoneStatus(g, session, false, room))).not.toMatch(/xyzzy|plugh|secret-pic|Shrek/);
  });

  it('a guesser who types their guess is told so; teams say "your team"', () => {
    const { g, session, s } = setup('draw', { typeGuess: true, teams: true });
    setPartner(session, s, 'b', 'wheel');
    s.stage = 'distribute';
    expect(phoneStatus(g, session, false, { cards: true })).toMatchObject({ seatsText: '🎯 Your team is guessing!', seatsSub: 'Bob is drawing: type your guess' });
  });

  it('without a room that takes cards: the lines as before (no off, no small line)', () => {
    const { g, session } = setup();
    expect(phoneStatus(g, session)).toEqual({ text: '🤝 Partner clue: Ann needs a partner…', seats: ['a'], seatsText: '🤝 Your partner clue! Spinning for your partner…' });
  });
});

describe('the guesser types their guess (spec §5.4)', () => {
  it('their seat only, from the question on, never during PARTNER UP!; locked once it’s judged or the answer shows', () => {
    const { g, session, s, clue } = setup('describe', { typeGuess: true });
    setPartner(session, s, 'b', 'wheel');
    expect(partnerAnswerAsk(g, session)).toBeNull();
    // (No ask, no question words for the phones yet.)
    const st = hostState(g, session, buzzIdle(newBuzz(1)), 0, { answers: partnerAnswerAsk(g, session) });
    expect(st.answers).toBeUndefined();
    expect(st.clue).toBeNull();
    s.stage = 'distribute';
    expect(partnerAnswerAsk(g, session)).toEqual({ id: `${clue.id}@${s.at}`, open: true, seats: [{ id: 'a' }] });
    expect(partnerAnswerAsk(g, session, { a: { n: 2 } })!.seats).toEqual([{ id: 'a', got: 2 }]);
    swapParts(s);
    expect(partnerAnswerAsk(g, session)!.seats).toEqual([{ id: 'b' }]);
    swapParts(s);
    s.stage = 'live';
    judgePartner(session, g, true, 400);
    expect(partnerAnswerAsk(g, session)!.open).toBe(false);
  });

  it('one round of guesses per play of the tile: put back and played again, it starts with none', () => {
    const { g, session, s } = setup('describe', { typeGuess: true });
    const first = partnerAnswerId(s);
    vi.useFakeTimers({ now: (s.at ?? 0) + 5000 });
    backToBoard(session, g, { markUsed: false });
    session.currentPickerId = 'a';
    openClue(session, { round: 0, cat: 0, row: 1 }, g);
    vi.useRealTimers();
    expect(partnerAnswerId(session.partner!)).not.toBe(first);
    // (Undo and a reload keep the play's time, so a guess survives those.)
    expect(partnerAnswerId(JSON.parse(JSON.stringify(session.partner)))).toBe(partnerAnswerId(session.partner!));
  });

  it('off unless the clue says so', () => {
    const { g, session, s } = setup();
    setPartner(session, s, 'b', 'wheel');
    s.stage = 'distribute';
    expect(partnerAnswerAsk(g, session)).toBeNull();
  });
});

describe('cardText and fitting the room', () => {
  it('every text box, a hidden one too, cut at 1000 characters with "…"', () => {
    const slide = { background: {}, elements: [{ ...newTextEl('Top'), y: 0 }, { ...newTextEl('Hidden from viewers'), y: 100, secret: true }, { ...newTextEl('x'.repeat(2000)), y: 200 }] };
    const t = cardText(slide);
    expect(t.startsWith('Top\nHidden from viewers\n')).toBe(true);
    expect([...t]).toHaveLength(1000);
    expect(t.endsWith('…')).toBe(true);
  });

  it('over the room’s 12 KB: media go first (the newest card first), then words, then the newest cards', () => {
    const link = (i: number) => ({ kind: 'image' as const, url: `https://files.example/${'p'.repeat(1900)}${i}.png` });
    const cards: HostCard[] = [0, 1, 2].map((i) => ({ id: `c${i}`, to: [{ seat: 'a' }], open: true, text: 'w'.repeat(900), media: [link(i), link(i + 10)] }));
    const out = fitCards(cards);
    expect(new TextEncoder().encode(JSON.stringify(out)).length).toBeLessThanOrEqual(CARDS_BYTES);
    expect(out[0].media).toEqual(cards[0].media);
    expect(out[2].media!.every((m) => 'missing' in m)).toBe(true);
    expect(out.map((c) => c.id)).toEqual(['c0', 'c1', 'c2']);
  });
});
