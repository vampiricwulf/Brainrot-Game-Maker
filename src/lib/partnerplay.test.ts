// 🤝 Playing a partner clue (docs/PARTNER-CLUES-SPEC.md §6–§8): who picked it and their partner, the parts, who each
// 🤫 card goes to, the session's guards (ownPlayers), the partner wheel and the phones' line.
import { describe, expect, it } from 'vitest';
import { jeopardyGame } from './testgame';
import { newImageEl, newTextEl, setSlideText, type BoardRound, type ClueCard, type Game, type PartnerState } from './model';
import {
  addCard,
  cardCopyText,
  cardRecipients,
  cardSummary,
  defaultRecipients,
  giverLine,
  pairOnly,
  partnerCandidates,
  partnerRoles,
  partsLine,
  recipientsText,
  resetRecipients,
  setPartner,
  setPartnerGame,
  setPartnerPicker,
  setRecipients,
  startPartner,
  swapParts,
} from './partner';
import { cardItems, cardLinks, cardWords } from './phonecard';
import {
  awardOpen, backToBoard, backToLastRound, goToRound, migrateSession, newSession, openClue, ownPlayers, rebaseSession, removePlayer, reveal, stepSlide,
} from './session';
import { buzzIdle, hostState, newBuzz, phoneStatus } from './buzz';
import { newLive, overlayDoneAt } from './live';
import { addWheel, openPartnerWheel, openPlayerWheel, spinningRolls, spinWheel } from './overlay';
import { clone } from './ops';

const REF = { round: 0, cat: 0, row: 1 };

/** Ann, Bob, Cat and Dan, Ann picking; Movies $400 a Describe it partner clue with Card 1 for the describer. */
function setup(game = 'describe' as Parameters<typeof setPartnerGame>[1]) {
  const g = jeopardyGame();
  g.players = ['Ann', 'Bob', 'Cat', 'Dan'].map((name, i) => ({ id: name[0].toLowerCase(), name, color: ['#e6194b', '#3cb44b', '#4363d8', '#f58231'][i] }));
  const r = g.rounds[0] as BoardRound;
  r.categories[0].title = 'Movies';
  const clue = r.categories[0].clues[1];
  clue.type = 'partner';
  setPartnerGame(clue, game);
  setSlideText(clue.questionSlide, 'Describe this movie without saying its name!');
  setSlideText(clue.answerSlide, 'Shrek');
  const card = clue.cards![0];
  setSlideText(card, 'Shrek');
  const session = newSession(g);
  session.currentPickerId = 'a';
  return { g, r, clue, card, session };
}

const seats = (to: { seat: string }[]) => to.map((t) => t.seat);

describe('who plays a partner clue', () => {
  it('opens on PARTNER UP! with whoever was marked to pick, and the clue’s parts', () => {
    const { g, clue, session } = setup();
    openClue(session, REF, g);
    expect(session.partner).toEqual({ clue: clue.id, stage: 'pick', giver: 'partner', pickerId: 'a' });
    expect(session.dd).toBeNull();
  });

  it('with nobody marked to pick, nobody is the picker (the host says who)', () => {
    const { g, session } = setup();
    session.currentPickerId = undefined;
    openClue(session, REF, g);
    const s = session.partner!;
    expect(s.pickerId).toBeUndefined();
    setPartnerPicker(session, s, 'c');
    expect(s.pickerId).toBe('c');
  });

  it('the partner can be anyone but the picker, unless the picker can be on the wheel too', () => {
    const { g, session } = setup();
    openClue(session, REF, g);
    const s = session.partner!;
    expect(partnerCandidates(session, s).map((p) => p.id)).toEqual(['b', 'c', 'd']);
    expect(setPartner(session, s, 'a', 'host')).toBe(false);
    expect(s.partnerId).toBeUndefined();
    s.includePicker = true;
    expect(partnerCandidates(session, s).map((p) => p.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(setPartner(session, s, 'a', 'host')).toBe(true);
    expect(partnerRoles(s)).toEqual({ guesser: 'a', solo: true });
  });

  it('the wheel landing on the picker (put on it in ✎ Edit wheel) is Solo', () => {
    const { g, session } = setup();
    openClue(session, REF, g);
    const s = session.partner!;
    expect(setPartner(session, s, 'a', 'wheel')).toBe(true);
    expect(partnerRoles(s).solo).toBe(true);
    expect(setPartner(session, s, 'zz', 'wheel')).toBe(false);
  });

  it('with two players the other one is the partner at once; with one, nobody is', () => {
    const { g, session } = setup();
    session.players = session.players.slice(0, 2);
    openClue(session, REF, g);
    expect(session.partner).toMatchObject({ partnerId: 'b', how: 'only' });
    session.players = session.players.slice(0, 1);
    openClue(session, REF, g);
    expect(session.partner!.partnerId).toBeUndefined();
    expect(partnerCandidates(session, session.partner!)).toEqual([]);
  });

  it('a new picker who was the partner leaves no partner', () => {
    const { g, session } = setup();
    openClue(session, REF, g);
    const s = session.partner!;
    setPartner(session, s, 'b', 'host');
    setPartnerPicker(session, s, 'b');
    expect(s).toMatchObject({ pickerId: 'b' });
    expect(s.partnerId).toBeUndefined();
  });

  it('the partner describes and the picker guesses; ⇄ Swap turns it round', () => {
    const { g, session } = setup();
    openClue(session, REF, g);
    const s = session.partner!;
    setPartner(session, s, 'b', 'wheel');
    expect(partnerRoles(s)).toEqual({ giver: 'b', guesser: 'a', solo: false });
    swapParts(s);
    expect(partnerRoles(s)).toEqual({ giver: 'a', guesser: 'b', solo: false });
  });

  it('“Who describes: the picker” starts the other way round', () => {
    const { g, clue, session } = setup();
    clue.partner!.giver = 'picker';
    openClue(session, REF, g);
    const s = session.partner!;
    setPartner(session, s, 'b', 'wheel');
    expect(partnerRoles(s)).toEqual({ giver: 'a', guesser: 'b', solo: false });
  });
});

describe('who gets each card', () => {
  function paired() {
    const x = setup();
    openClue(x.session, REF, x.g);
    const s = x.session.partner!;
    setPartner(x.session, s, 'b', 'wheel');
    return { ...x, s };
  }

  it('each Goes to, from the parts now: everyone else is every player but the two', () => {
    const { session, s } = paired();
    expect(seats(defaultRecipients(session, s, 'giver'))).toEqual(['b']);
    expect(seats(defaultRecipients(session, s, 'guesser'))).toEqual(['a']);
    expect(seats(defaultRecipients(session, s, 'both'))).toEqual(['a', 'b']);
    expect(seats(defaultRecipients(session, s, 'others'))).toEqual(['c', 'd']);
    expect(defaultRecipients(session, s, 'nobody')).toEqual([]);
  });

  it('a card that follows a part moves with ⇄ Swap; one the host changed stays', () => {
    const { session, s, clue, card } = paired();
    const two = addCard(clue)!;
    expect(seats(cardRecipients(session, s, card))).toEqual(['b']);
    setRecipients(session, s, two, ['b', 'c']);
    swapParts(s);
    expect(seats(cardRecipients(session, s, card))).toEqual(['a']);
    expect(seats(cardRecipients(session, s, two))).toEqual(['b', 'c']);
    resetRecipients(s, two.id);
    expect(seats(cardRecipients(session, s, two))).toEqual(['a']);
    expect(s.deal).toBeUndefined();
  });

  it('choosing the same players as the default isn’t a change', () => {
    const { session, s, card } = paired();
    setRecipients(session, s, card, ['b', 'c']);
    expect(s.deal?.[card.id]).toEqual([{ seat: 'b' }, { seat: 'c' }]);
    setRecipients(session, s, card, ['b']);
    expect(s.deal).toBeUndefined();
    setRecipients(session, s, card, []);
    expect(cardRecipients(session, s, card)).toEqual([]);
    expect(recipientsText(session, s, clueRules(), card)).toBe('nobody yet');
  });

  it('Solo: only a card for the guesser starts with the picker', () => {
    const { session, s, clue } = paired();
    s.partnerId = 'a';
    expect(seats(defaultRecipients(session, s, 'guesser'))).toEqual(['a']);
    for (const to of ['giver', 'both', 'others', 'nobody'] as const) expect(defaultRecipients(session, s, to)).toEqual([]);
    expect(clue.cards!.length).toBe(1);
  });

  it('says who in words, never what’s on the card', () => {
    const { session, s, clue, card } = paired();
    expect(recipientsText(session, s, clueRules(), card)).toBe('Bob (describer)');
    delete s.partnerId;
    expect(recipientsText(session, s, clueRules(), card)).toBe('the describer');
    expect(clue.cards![0]).toBe(card);
  });

  it('a removed player leaves the cards they were given; the picker or partner removed goes back to choosing', () => {
    const { session, s, card } = paired();
    s.stage = 'distribute';
    setRecipients(session, s, card, ['b', 'c']);
    removePlayer(session, 'c');
    expect(seats(cardRecipients(session, s, card))).toEqual(['b']);
    removePlayer(session, 'b');
    expect(s.stage).toBe('pick');
    // (Dan is the only one left to partner Ann with: paired at once.)
    expect(s).toMatchObject({ pickerId: 'a', partnerId: 'd', how: 'only' });
    removePlayer(session, 'a');
    expect(s.pickerId).toBeUndefined();
    expect(s.partnerId).toBeUndefined();
  });
});

const clueRules = () => ({ game: 'describe' as const, giver: 'partner' as const, got: { giver: 100, guesser: 50 }, missed: { giver: 0, guesser: -50 }, partnerSafe: true });

describe('what a card holds, counted and copied', () => {
  function withMedia() {
    const x = setup();
    const g: Game = x.g;
    g.media.push({ id: 'm1', name: 'shrek.png', mime: 'image/png', size: 10, kind: 'image' }, { id: 'm2', name: 'dance.gif', mime: 'image/gif', size: 10, kind: 'image' });
    const card: ClueCard = x.card;
    const below = { ...newImageEl('m2'), y: 900, x: 10 };
    const above = { ...newImageEl('m1'), y: 100, x: 50 };
    card.elements.push(below, above, { ...newTextEl('Ogres are like onions'), y: 700 });
    return { ...x, card };
  }

  it('lists its items by where they sit (top to bottom), with their names', () => {
    const { g, card } = withMedia();
    expect(cardItems(g, card).map((i) => [i.kind, i.name])).toEqual([
      ['picture', 'shrek.png'],
      ['gif', 'dance.gif'],
    ]);
    expect(cardWords(card)).toBe('Shrek\nOgres are like onions');
  });

  it('names each kind of item as the host knows it: its own name, its file’s, or its link’s', () => {
    const { g } = withMedia();
    const base = { x: 0, w: 10, h: 10, rotation: 0, opacity: 1, zIndex: 1, autoplay: false, loop: false, muted: false, volume: 1 };
    const edited = { ...newImageEl('m1'), y: 1, editedMedia: 'gone' };
    const card: ClueCard = {
      id: 'k',
      to: 'giver',
      background: {},
      elements: [
        { ...base, id: 'e1', kind: 'embed', url: 'https://files.example/clips/funny%20cat.gif', embedKind: 'remoteImage', y: 5 },
        { ...base, id: 'e2', kind: 'embed', url: 'https://files.example/a/clip.mp4', embedKind: 'remoteVideo', y: 6 },
        { ...base, id: 'e3', kind: 'embed', url: 'https://streamable.com/abc', embedKind: 'streamable', y: 7, name: 'The trailer' },
        edited,
      ],
    };
    expect(cardItems(g, card).map((i) => [i.kind, i.name])).toEqual([
      ['picture', 'shrek.png'],
      ['gif', 'funny cat.gif'],
      ['video', 'clip.mp4'],
      ['embed', 'The trailer'],
    ]);
    // (An edited picture plays its edited copy.)
    expect(cardItems(g, card)[0].media).toBe('gone');
  });

  it('counts it without its words or its items’ names (the panel can be on stream)', () => {
    const { g, card } = withMedia();
    const said = cardSummary(g, card);
    expect(said).toBe('2 lines of words, 1 picture, 1 GIF');
    expect(said).not.toMatch(/Shrek|onions|shrek\.png|dance/);
    expect(cardSummary(g, { background: {}, elements: [newTextEl('')] })).toBe('nothing on it');
  });

  it('copies its words for who it’s for, with its links', () => {
    const { g, card } = withMedia();
    card.elements.push({ ...newTextEl(''), id: 'x' });
    card.elements.push({ id: 'yt', kind: 'embed', url: 'https://youtu.be/abc', embedKind: 'youtube', x: 0, y: 950, w: 10, h: 10, rotation: 0, opacity: 1, zIndex: 1, autoplay: false, loop: false, muted: false, volume: 1 });
    expect(cardLinks(g, card)).toEqual(['https://youtu.be/abc']);
    expect(cardCopyText(g, card, 1, 'Movies $400', ['Bob'])).toBe('🤫 For Bob only (Movies $400, card 1): Shrek\nOgres are like onions\nhttps://youtu.be/abc');
    expect(cardCopyText(g, card, 2, 'Movies $400', ['Bob', 'Cat', 'Dan'])).toMatch(/^🤫 For Bob, Cat and Dan only \(Movies \$400, card 2\): /);
  });
});

describe('the session while a partner clue is open (ownPlayers)', () => {
  it('nobody buzzes; the award row, the next slide and the answer wait for the question', () => {
    const { g, session, clue } = setup();
    clue.extraSlides = [{ id: 'x2', background: {}, elements: [newTextEl('More')] }];
    openClue(session, REF, g);
    expect(ownPlayers(session)).toEqual({ kind: 'partner', ids: ['a'], setup: true });
    expect(awardOpen(session)).toBe(false);
    expect(stepSlide(session, g, 1)).toBe(false);
    reveal(session);
    expect(session.revealed).toBe(false);
    setPartner(session, session.partner!, 'b', 'wheel');
    expect(ownPlayers(session)).toEqual({ kind: 'partner', ids: ['a', 'b'], setup: true });
    session.partner!.stage = 'distribute';
    expect(ownPlayers(session)?.setup).toBe(false);
    expect(awardOpen(session)).toBe(true);
    expect(stepSlide(session, g, 1)).toBe(true);
    reveal(session);
    expect(session.revealed).toBe(true);
  });

  it('gives the same answers as the Daily Double’s own checks did', () => {
    const { g, session, r } = setup();
    r.categories[1].clues[0].type = 'dailyDouble';
    openClue(session, { round: 0, cat: 1, row: 0 }, g);
    expect(ownPlayers(session)).toEqual({ kind: 'dd', ids: ['a'], setup: true });
    expect(awardOpen(session)).toBe(false);
    session.dd!.stage = 'question';
    expect(ownPlayers(session)).toEqual({ kind: 'dd', ids: ['a'], setup: false });
    expect(awardOpen(session)).toBe(true);
    openClue(session, { round: 0, cat: 1, row: 1 }, g);
    expect(ownPlayers(session)).toBeNull();
    backToBoard(session, g);
    expect(ownPlayers(session)).toBeNull();
  });

  it('is cleared with the clue, the round, and a clue that isn’t a partner clue any more', () => {
    const { g, session } = setup();
    for (const leave of [() => backToBoard(session, g), () => goToRound(session, g, 1), () => backToLastRound(session, g, 0)]) {
      openClue(session, REF, g);
      expect(session.partner).toBeTruthy();
      leave();
      expect(session.partner).toBeNull();
    }
    openClue(session, REF, g);
    const edited = clone(g);
    (edited.rounds[0] as BoardRound).categories[0].clues[1].type = 'standard';
    rebaseSession(session, g, edited);
    expect(session.partner).toBeNull();
  });

  it('a card deleted in the editor goes from who it was given to', () => {
    const { g, session, card } = setup();
    openClue(session, REF, g);
    const s = session.partner!;
    setPartner(session, s, 'b', 'wheel');
    setRecipients(session, s, card, ['c']);
    const edited = clone(g);
    delete (edited.rounds[0] as BoardRound).categories[0].clues[1].cards;
    rebaseSession(session, g, edited);
    expect(session.partner?.deal).toBeUndefined();
  });

  it('a saved partner state that can’t be read is dropped', () => {
    const { g, session } = setup();
    (session as { partner: unknown }).partner = { clue: 5 };
    migrateSession(session, g);
    expect(session.partner).toBeNull();
    session.partner = { clue: 'x', stage: 'live', giver: 'nope' as PartnerState['giver'], deal: { c: 'bad' as unknown as [] } };
    migrateSession(session, g);
    expect(session.partner).toEqual({ clue: 'x', stage: 'live', giver: 'partner' });
  });
});

describe('the partner wheel', () => {
  function wheel(includePicker = false) {
    const x = setup();
    openClue(x.session, REF, x.g);
    const s = x.session.partner!;
    if (includePicker) s.includePicker = true;
    const live = newLive();
    openPartnerWheel(live, x.session, s, 'Ann');
    const o = live.overlay!;
    if (o.kind !== 'wheel') throw new Error('no wheel');
    return { ...x, s, live, o };
  }

  it('never draws the picker, from the first frame (✎ Edit wheel lists them, switched off)', () => {
    const { o, s } = wheel();
    expect(o.name).toBe('Partner for Ann');
    expect(o.partnerFor).toBe(s.clue);
    expect(o.segments.map((x) => x.id)).toEqual(['b', 'c', 'd']);
    expect(o.pool?.find((x) => x.id === 'a')?.off).toBe(true);
    expect(wheel(true).o.segments.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('never lands on the picker', () => {
    const { o, live, session, g } = wheel();
    for (let i = 0; i < 1000; i++) {
      spinWheel(live, session, g);
      expect(o.segments[o.result!].id).not.toBe('a');
    }
  });

  it('notes the roll its spin logged, and the log hides it until it lands', () => {
    const { o, live, session, g } = wheel();
    spinWheel(live, session, g);
    expect(o.rollId).toBe(session.rollLog!.at(-1)!.id);
    const end = overlayDoneAt(o);
    expect(spinningRolls(o, end - 1)).toEqual([o.rollId]);
    expect(spinningRolls(o, end)).toEqual([]);
    // (The scores over it: still spinning under them.)
    expect(spinningRolls({ kind: 'scoreboard', nonce: 'n', under: o }, end - 1)).toEqual([o.rollId]);
    // Kept through a reload, as the game in progress saves the wheel.
    const kept = JSON.parse(JSON.stringify(o));
    expect(spinningRolls(kept, end - 1)).toEqual([o.rollId]);
  });

  it('every wheel spun together has its roll, until it lands', () => {
    const { session, g } = setup();
    const live = newLive();
    openPlayerWheel(live, session);
    addWheel(live, session, g, 'player');
    const o = live.overlay!;
    if (o.kind !== 'wheel') throw new Error('no wheel');
    o.extra = [{ key: 'k', name: 'Pick a player', players: true, segments: clone(o.segments), rotation: 0, spin: null, result: null }];
    spinWheel(live, session, g);
    const ids = spinningRolls(o, Date.now());
    expect(ids).toHaveLength(2);
    expect(ids).toEqual([o.rollId, o.extra[0].rollId]);
    expect(spinningRolls(o, overlayDoneAt(o) + 1)).toEqual([]);
  });
});

describe('the phones’ line (no card content, ever)', () => {
  it('says who plays which part under each name', () => {
    const { g, session } = setup();
    openClue(session, REF, g);
    const s = session.partner!;
    expect(phoneStatus(g, session)).toEqual({ text: '🤝 Partner clue: Ann needs a partner…', seats: ['a'], seatsText: '🤝 Your partner clue! Spinning for your partner…' });
    setPartner(session, s, 'b', 'wheel');
    expect(phoneStatus(g, session)).toEqual({ text: '🤝 Partner clue: Ann + Bob', seats: ['a', 'b'], seatsText: '🤝 You two play this one!' });
    s.stage = 'distribute';
    expect(phoneStatus(g, session)).toEqual({ text: '🤝 Bob describes → Ann guesses', seats: ['b'], seatsText: '🗣 You’re describing!' });
    session.revealed = true;
    expect(phoneStatus(g, session)).toEqual({ text: '🤝 Bob described → Ann guessed' });
    for (const st of [phoneStatus(g, session)]) expect(JSON.stringify(st)).not.toMatch(/Shrek/);
  });

  it('in the game’s words', () => {
    const { g, session } = setup('draw');
    openClue(session, REF, g);
    const s = session.partner!;
    setPartner(session, s, 'b', 'wheel');
    s.stage = 'live';
    expect(phoneStatus(g, session)).toMatchObject({ text: '🤝 Bob draws → Ann guesses', seatsText: '✏ You’re drawing!' });
    expect(giverLine({ ...clueRules(), game: 'help' }, true)).toBe('🙋 Your team is helping!');
    expect(partsLine({ ...clueRules(), game: 'split' }, { giver: 'Bob', guesser: 'Ann' })).toBe('Bob has half A → Ann has half B');
    expect(partsLine(clueRules(), { guesser: 'Ann', solo: true })).toBe('Ann · Solo!');
  });

  it('phones get no question words: nobody buzzes', () => {
    const { g, session } = setup();
    openClue(session, REF, g);
    const s = session.partner!;
    setPartner(session, s, 'b', 'wheel');
    s.stage = 'distribute';
    const st = hostState(g, session, buzzIdle(newBuzz(3)), 0, { status: phoneStatus(g, session) });
    expect(st.phase).toBe('lobby');
    expect(st.clue).toBeNull();
    expect(JSON.stringify(st)).not.toMatch(/Shrek|without saying/);
  });

  it('a pair is known only once chosen: with two players at once', () => {
    const { g, session } = setup();
    openClue(session, REF, g);
    const s = session.partner!;
    session.players.splice(2);
    pairOnly(session, s);
    expect(startPartner(session, (g.rounds[0] as BoardRound).categories[0].clues[1])).toMatchObject({ partnerId: 'b', how: 'only' });
  });
});
