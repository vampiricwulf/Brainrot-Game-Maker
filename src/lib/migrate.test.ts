import { describe, expect, it } from 'vitest';
import { jeopardyGame } from './testgame';
import { parseGame } from './fileio';
import {
  blankName,
  clueCardName,
  clueCardWords,
  clueCountdown,
  clueValueTyped,
  compactPoints,
  countdownSeconds,
  FINAL_V1_ROUND_ID,
  formatPoints,
  gameProblem,
  gameRules,
  isBoard,
  isFinal,
  MAX_PLAYERS,
  MAX_POINTS,
  MAX_TILE_VALUE,
  migrateGame,
  mostPlayers,
  newGame,
  newSavedCard,
  savedCardName,
  slideText,
  textSlide,
  typedPoints,
  wholePoints,
  type BoardRound,
  type Game,
  type SavedCard,
} from './model';
import { validate } from './validate';
import { applyScore, finalJudge, finalTag, migrateSession, newSession, score } from './session';

/** A game as Jeopardy Builder saved it (format version 1). */
function v1Game(finalEnabled = true) {
  const g = jeopardyGame() as unknown as Record<string, unknown>;
  const rounds = (g.rounds as { mode?: string }[]).filter((r) => r.mode === 'board').map(({ mode: _m, ...r }) => r);
  return {
    ...g,
    version: 1,
    rounds,
    final: { enabled: finalEnabled, name: 'Final Brainrot', category: 'Memes', questionSlide: textSlide('Q?'), answerSlide: textSlide('A!'), timerSeconds: 45 },
  } as unknown as Game;
}

describe('games from before round modes (version 1)', () => {
  it('become version 2: rounds get a mode and an enabled Final becomes the last round', () => {
    const g = migrateGame(parseGame(JSON.stringify(v1Game())));
    expect(g.version).toBe(2);
    expect(g.rounds.map((r) => r.mode)).toEqual(['board', 'final']);
    const f = g.rounds[1];
    expect(isFinal(f) && [f.id, f.name, f.category, f.timerSeconds]).toEqual([FINAL_V1_ROUND_ID, 'Final Brainrot', 'Memes', 45]);
    expect('final' in g).toBe(false);
  });

  it('keeps a Final that was switched off but written, as the last round, and the checklist says so', () => {
    const g = migrateGame(parseGame(JSON.stringify(v1Game(false))));
    const f = g.rounds[g.rounds.length - 1];
    expect(isFinal(f) && [f.category, f.wasOff]).toEqual(['Memes', true]);
    expect(validate(g).some((p) => p.level === 'info' && p.text.includes('was switched off'))).toBe(true);
  });

  it('drops a Final that was switched off with nothing in it', () => {
    const old = v1Game(false) as unknown as { final: Record<string, unknown> };
    old.final = { enabled: false, name: 'Final', category: ' ', questionSlide: textSlide(''), answerSlide: textSlide('') };
    const g = migrateGame(old as unknown as Game);
    expect(g.rounds.every(isBoard)).toBe(true);
  });

  it('keeps a switched-off Final that only has a picture', () => {
    const old = v1Game(false) as unknown as { final: Record<string, unknown> };
    old.final = { enabled: false, questionSlide: { background: {}, elements: [{ id: 'i', kind: 'image', media: 'm' }] } };
    expect(migrateGame(old as unknown as Game).rounds.some(isFinal)).toBe(true);
  });

  it('drops rounds that are not objects (a null in the list)', () => {
    const old = v1Game() as unknown as { rounds: unknown[] };
    old.rounds.push(null, 5, 'x');
    expect(migrateGame(old as unknown as Game).rounds.map((r) => r.mode)).toEqual(['board', 'final']);
    const g2 = { ...jeopardyGame(), rounds: [...jeopardyGame().rounds, null] } as unknown as Game;
    expect(migrateGame(g2).rounds.every((r) => !!r?.mode)).toBe(true);
  });

  it('leaves version 2 games alone (a second pass changes nothing)', () => {
    const once = migrateGame(v1Game());
    expect(migrateGame(JSON.parse(JSON.stringify(once)))).toEqual(once);
  });

  it('refuses games from a newer version with a clear message', () => {
    expect(() => parseGame(JSON.stringify({ ...jeopardyGame(), version: 99 }))).toThrow(/newer version/);
  });

  it('carries a saved game in the middle of the Final over to its new round', () => {
    const old = v1Game();
    const game = migrateGame(old);
    const session = newSession(game);
    session.players = [{ id: 'a', name: 'A', color: '#111111', startScore: 0 }];
    applyScore(session, game, ['a'], 500, 'x');
    // What the old version saved: in the Final, on the last board round's index, events tagged 'final'.
    session.phase = 'final';
    session.finalStep = 'reveal';
    session.currentRound = 0;
    session.final = { players: ['a'], wagers: { a: 200 }, order: ['a'], shown: {}, results: { a: 'right' } };
    session.scoreLog.push({ id: 'e1', ts: 1, playerId: 'a', delta: 200, reason: 'Final', clueId: 'final' });
    migrateSession(session, game);
    expect(session.currentRound).toBe(1);
    expect(session.final.roundId).toBe(FINAL_V1_ROUND_ID);
    expect(score(session, 'a')).toBe(700);
    // Re-judging finds the old event under its new tag and replaces it.
    finalJudge(session, game, 'a', false);
    expect(score(session, 'a')).toBe(300);
    expect(session.scoreLog.find((e) => e.id === 'e1')?.clueId).toBe(finalTag(FINAL_V1_ROUND_ID));
  });
});

describe('a new game', () => {
  it('starts with no rounds (the host adds them), and the checklist says so', () => {
    const g = newGame();
    expect(g.rounds).toEqual([]);
    expect(validate(g).find((p) => p.text.startsWith('No rounds yet'))).toMatchObject({ tab: 0, level: 'warn' });
  });
});

describe('hand-edited games', () => {
  const plain = (g: unknown) => JSON.parse(JSON.stringify(g));

  it('leaves a whole game exactly as it is', () => {
    const once = migrateGame(plain(jeopardyGame()));
    expect(JSON.stringify(migrateGame(plain(once)))).toBe(JSON.stringify(once));
  });

  it('fills in what has an obvious fill', () => {
    const g = plain(jeopardyGame());
    const board = g.rounds[0];
    delete board.values;
    delete board.categories[0].clues[0].answerSlide;
    board.categories[0].clues[1].questionSlide.elements[0].text = null;
    delete board.categories[1].clues[0].id;
    g.players = [{ name: 'Ann', color: '#e6194b' }, { name: 'Bo' }];
    const m = migrateGame(g);
    const r = m.rounds[0];
    if (!isBoard(r)) throw new Error('not a board');
    expect(r.values).toEqual([200, 400, 600, 800, 1000]);
    expect(r.categories[0].clues[0].answerSlide.elements).toHaveLength(1);
    expect((r.categories[0].clues[1].questionSlide.elements[0] as { text: string }).text).toBe('');
    expect(r.categories[1].clues[0].id).toBeTruthy();
    expect(m.players.every((p) => p.id)).toBe(true);
    expect(m.players[1].color).toBeTruthy();
    expect(m.players[1].color).not.toBe('#e6194b');
    expect(() => validate(m)).not.toThrow();
    expect(() => newSession(m)).not.toThrow();
    expect(gameProblem(m)).toBeNull();
  });

  it('never has Most players below the players listed (or past what the app shows)', () => {
    const g = plain(jeopardyGame());
    g.players = [1, 2, 3, 4, 5, 6].map((n) => ({ id: `p${n}`, name: `P${n}`, color: `#00000${n}` }));
    g.settings.maxPlayers = 4;
    expect(migrateGame(plain(g)).settings.maxPlayers).toBe(6);
    g.settings.maxPlayers = 99;
    expect(migrateGame(plain(g)).settings.maxPlayers).toBe(MAX_PLAYERS);
    g.settings.maxPlayers = 'lots';
    expect(migrateGame(plain(g)).settings.maxPlayers).toBe(8);
    g.settings.maxPlayers = 10;
    expect(migrateGame(plain(g)).settings.maxPlayers).toBe(10);
  });

  it("names the first part it can't use", () => {
    const g = plain(jeopardyGame());
    g.rounds[1].mode = 'quiz';
    expect(gameProblem(migrateGame(g))).toBe('rounds[1].mode: "quiz" isn\'t a kind of round');
  });

  it('gives every category a tile in every row (a short category, or none at all, gets empty tiles)', () => {
    const g = plain(jeopardyGame());
    const board = g.rounds[0];
    const kept = board.categories[0].clues[0].id;
    board.categories[0].clues = board.categories[0].clues.slice(0, 2);
    board.categories[1].clues = null;
    const r = migrateGame(g).rounds[0];
    if (!isBoard(r)) throw new Error('not a board');
    expect(r.categories.map((c) => c.clues.length)).toEqual(r.categories.map(() => r.values.length));
    expect(r.categories[0].clues[0].id).toBe(kept);
    expect(r.categories[1].clues.every((c) => c.questionSlide && c.answerSlide)).toBe(true);
    expect(r.categories[1].clues.every((c) => c.empty)).toBe(true);
    expect(r.categories[0].clues.slice(2).every((c) => c.empty) && !r.categories[0].clues[0].empty).toBe(true);
    expect(gameProblem(migrateGame(g))).toBeNull();
    expect(() => validate(migrateGame(g))).not.toThrow();
  });

  it('adds rows for a category longer than the row values, going up as they did (no clue is lost)', () => {
    const g = plain(jeopardyGame());
    const board = g.rounds[0];
    board.values = [100, 200];
    const r = migrateGame(g).rounds[0];
    if (!isBoard(r)) throw new Error('not a board');
    expect(r.values).toEqual([100, 200, 300, 400, 500]);
    board.values = [];
    const r2 = migrateGame(g).rounds[0];
    expect(isBoard(r2) && r2.values).toEqual([200, 400, 600, 800, 1000]);
  });

  it('a game the repairs missed is still caught before it opens (a category short of rows)', () => {
    const g = migrateGame(plain(jeopardyGame()));
    const r = g.rounds[0];
    if (!isBoard(r)) throw new Error('not a board');
    r.categories[2].clues.length = 3;
    expect(gameProblem(g)).toBe('rounds[0].categories[2].clues[3]: no clue for row 4');
  });

  it('a countdown saved below 1 second is made whole (none stays none)', () => {
    const g = plain(jeopardyGame());
    g.settings.defaultTimerSeconds = -5;
    g.rounds[1].timerSeconds = -10;
    const m = migrateGame(g);
    expect(m.settings.defaultTimerSeconds).toBe(1);
    expect(isFinal(m.rounds[1]) && m.rounds[1].timerSeconds).toBe(30);
    g.settings.defaultTimerSeconds = 'x';
    expect(migrateGame(g).settings.defaultTimerSeconds).toBeNull();
    g.settings.defaultTimerSeconds = null;
    expect(migrateGame(g).settings.defaultTimerSeconds).toBeNull();
  });
});


describe('buzzer settings', () => {
  it('buzzing from keys is gone: buzzKeys and buzzFrom are dropped, Buzzer mode stays on (phones)', () => {
    const g = jeopardyGame();
    Object.assign(g.settings, { buzzer: true, buzzKeys: 'QPZM', buzzFrom: 'keys', buzzArm: 'host' });
    const m = migrateGame(JSON.parse(JSON.stringify(g)) as Game);
    expect(m.settings.buzzer).toBe(true);
    expect(m.settings.buzzArm).toBe('host');
    expect(m.settings).not.toHaveProperty('buzzKeys');
    expect(m.settings).not.toHaveProperty('buzzFrom');
  });

  it('a sound switched off the old way ("") is in soundsOff now', () => {
    const g = newGame() as Game;
    g.audio = { right: '', wrong: 'm1' };
    const m = migrateGame(JSON.parse(JSON.stringify(g)));
    expect(m.audio).toEqual({ wrong: 'm1' });
    expect(m.soundsOff).toEqual({ right: true });
    expect(migrateGame(JSON.parse(JSON.stringify(newGame()))).soundsOff).toBeUndefined();
  });
});

describe('⚖ Game rules: what can be typed', () => {
  it('a clue countdown is whole seconds, at least 1; blank or 0 is none', () => {
    expect(countdownSeconds('')).toBeNull();
    expect(countdownSeconds('0')).toBeNull();
    expect(countdownSeconds('abc')).toBeNull();
    expect(countdownSeconds('-5')).toBe(1);
    expect(countdownSeconds('0.4')).toBeNull();
    expect(countdownSeconds('0.6')).toBe(1);
    expect(countdownSeconds('12.6')).toBe(13);
    expect(countdownSeconds('30')).toBe(30);
  });

  it("a clue's own countdown: blank is the game's default, 0 is none, else whole seconds of at least 1", () => {
    expect(clueCountdown('')).toBeNull();
    expect(clueCountdown(' ')).toBeNull();
    expect(clueCountdown('0')).toBe(0);
    expect(clueCountdown('0.4')).toBe(0);
    expect(clueCountdown('-5')).toBe(1);
    expect(clueCountdown('7.6')).toBe(8);
    expect(clueCountdown('abc')).toBeNull();
  });

  it("a clue's own value: blank is the row's, else whole points, never below 0", () => {
    expect(clueValueTyped('')).toBeNull();
    expect(clueValueTyped('-300')).toBe(0);
    expect(clueValueTyped('750')).toBe(750);
    expect(clueValueTyped('99.6')).toBe(100);
    expect(clueValueTyped('1e15')).toBe(MAX_TILE_VALUE);
  });

  it('an amount the host types: whole points, within ±MAX_POINTS', () => {
    expect(wholePoints(2.5)).toBe(3);
    expect(wholePoints(-199.4)).toBe(-199);
    expect(wholePoints(1e20)).toBe(MAX_POINTS);
    expect(wholePoints(-1e20)).toBe(-MAX_POINTS);
    expect(wholePoints(null)).toBeNull();
    expect(wholePoints(NaN)).toBeNull();
  });

  it('points typed as text: thousands, a symbol or a word around the number read too', () => {
    expect(typedPoints('1,000')).toBe(1000);
    expect(typedPoints(' $500 ')).toBe(500);
    expect(typedPoints('500 pts')).toBe(500);
    expect(typedPoints('−$200')).toBe(-200);
    expect(typedPoints('$-200')).toBe(-200);
    expect(typedPoints('-1,500.6')).toBe(-1501);
    expect(typedPoints('€1 000')).toBe(1000);
    expect(typedPoints('1e20')).toBe(MAX_POINTS);
    // A dash pasted from a chat is a minus too (not a symbol, which would make it +200).
    expect(typedPoints('–200')).toBe(-200);
    expect(typedPoints('–$200')).toBe(-200);
    expect(typedPoints('—200')).toBe(-200);
    // The plate's own score with a word symbol ending in a period, and a word after the number that starts with K.
    expect(typedPoints('500 pts.')).toBe(500);
    expect(typedPoints('1,200 kr.')).toBe(1200);
    expect(typedPoints('5 kr')).toBe(5);
    expect(typedPoints('500 Kč')).toBe(500);
    // Nothing that reads as a number: null (asked again, not set to something else).
    expect(typedPoints('')).toBeNull();
    expect(typedPoints('abc')).toBeNull();
    expect(typedPoints('$')).toBeNull();
    expect(typedPoints('1.2.3')).toBeNull();
    expect(typedPoints('12abc34')).toBeNull();
    expect(typedPoints('1.5K')).toBeNull();
    expect(typedPoints('2m pts')).toBeNull();
    expect(typedPoints('10 k')).toBeNull();
    expect(typedPoints('1.5 K')).toBeNull();
    expect(typedPoints('12 B')).toBeNull();
  });

  it('a name with nothing to see in it is blank', () => {
    expect(blankName('')).toBe(true);
    expect(blankName('   ')).toBe(true);
    expect(blankName('\u200b\u200e\u2060 ')).toBe(true);
    expect(blankName(' Ann ')).toBe(false);
    expect(blankName('🎉')).toBe(false);
  });

  it('Most players: 1 to 20, never below the players listed', () => {
    expect(mostPlayers(0)).toBe(1);
    expect(mostPlayers(3, 5)).toBe(5);
    expect(mostPlayers(50)).toBe(MAX_PLAYERS);
    expect(mostPlayers(7.4)).toBe(7);
    expect(mostPlayers(undefined)).toBe(8);
    expect(mostPlayers(4, 30)).toBe(MAX_PLAYERS);
  });
});

describe('points with the game’s symbol', () => {
  it('a symbol that is a word goes after the number; $, €, R$ or an emoji goes in front', () => {
    expect(formatPoints(200, 'pts')).toBe('200 pts');
    expect(formatPoints(-300, 'pts')).toBe('−300 pts');
    expect(formatPoints(1000, ' coins ')).toBe('1,000 coins');
    expect(formatPoints(-300, '$')).toBe('−$300');
    expect(formatPoints(1000, '€')).toBe('€1,000');
    expect(formatPoints(50, 'R$')).toBe('R$50');
    expect(formatPoints(7, '🧠')).toBe('🧠7');
    expect(formatPoints(7, '')).toBe('7');
  });

  it('shortened for a narrow spot: cut down, never rounded up', () => {
    expect(compactPoints(9_999, '$')).toBe('$9,999');
    expect(compactPoints(1_250_000, '$')).toBe('$1.2M');
    expect(compactPoints(999_999_999, '$')).toBe('$999.9M');
    expect(compactPoints(-3_480_000_000, 'pts')).toBe('−3.4B pts');
    // From 1,000, and with no digit after the point (narrower still).
    expect(compactPoints(1_250, '$', 1000)).toBe('$1.2K');
    expect(compactPoints(1_999, '$', 1000, 0)).toBe('$1K');
    expect(compactPoints(999, '$', 1000, 0)).toBe('$999');
  });
});

describe('🤝 partner clues in saved games', () => {
  const plain = (g: unknown) => JSON.parse(JSON.stringify(g));
  const firstClue = (g: Game) => {
    const r = g.rounds[0];
    if (!isBoard(r)) throw new Error('not a board');
    return r.categories[0].clues[0];
  };

  it('leaves a whole partner clue exactly as it is (older games have none, and get none)', () => {
    const g = jeopardyGame();
    const clue = firstClue(g);
    Object.assign(clue, { type: 'partner', partner: { ...gameRules('help'), includePicker: true, words: { giver: 'Spy' } }, cards: [{ id: 'c1', ...textSlide('Shrek'), to: 'others' }] });
    const once = migrateGame(plain(g));
    expect(JSON.stringify(migrateGame(plain(once)))).toBe(JSON.stringify(once));
    expect(firstClue(once).partner).toEqual(clue.partner);
    const old = migrateGame(plain(jeopardyGame()));
    expect(firstClue(old).partner).toBeUndefined();
    expect(firstClue(old).cards).toBeUndefined();
  });

  it('gives a partner clue saved without rules Describe it’s; drops rules that aren’t rules', () => {
    const g = plain(jeopardyGame());
    g.rounds[0].categories[0].clues[0].type = 'partner';
    g.rounds[0].categories[0].clues[1].partner = 'oops';
    const m = migrateGame(g);
    expect(firstClue(m).partner).toEqual(gameRules('describe'));
    expect((m.rounds[0] as BoardRound).categories[0].clues[1].partner).toBeUndefined();
  });

  it('repairs damaged rules: unknown game and giver, shares out of range or missing, odd switches and words', () => {
    const g = plain(jeopardyGame());
    g.rounds[0].categories[0].clues[0] = {
      ...g.rounds[0].categories[0].clues[0],
      type: 'partner',
      partner: { game: 'charades', giver: 'nobody', got: { giver: 5000, guesser: 'lots' }, missed: null, partnerSafe: 'yes', points: 'some', words: { giver: '', guesser: 'x'.repeat(40) } },
    };
    const p = firstClue(migrateGame(g)).partner!;
    expect(p.game).toBe('custom');
    expect(p.giver).toBe('partner');
    // (A missing share is the game's: Custom's are Describe it's.)
    expect(p.got).toEqual({ giver: 1000, guesser: 50 });
    expect(p.missed).toEqual({ giver: 0, guesser: -50 });
    // A missing partnerSafe means on.
    expect(p.partnerSafe).toBeUndefined();
    expect(p.points).toBeUndefined();
    expect(p.words).toEqual({ guesser: 'x'.repeat(24) });
  });

  it('repairs cards like slides; one going to someone unknown goes to nobody; more than six are kept', () => {
    const g = plain(jeopardyGame());
    const cards = [
      { to: 'giver', background: {}, elements: [{ kind: 'text', text: null }] },
      { id: 'c2', to: 'the audience', elements: 'x' },
      null,
      ...Array.from({ length: 6 }, (_, i) => ({ id: `k${i}`, to: 'both', ...textSlide('') })),
    ];
    Object.assign(g.rounds[0].categories[0].clues[0], { type: 'partner', cards });
    g.rounds[0].categories[0].clues[1].cards = [];
    const m = migrateGame(g);
    const out = firstClue(m).cards!;
    expect(out).toHaveLength(8);
    expect(out.every((c) => typeof c.id === 'string' && c.id)).toBe(true);
    expect((out[0].elements[0] as { text: string }).text).toBe('');
    expect([out[0].to, out[1].to, out[2].to]).toEqual(['giver', 'nobody', 'both']);
    expect([out[1].elements, out[1].background]).toEqual([[], {}]);
    expect((m.rounds[0] as BoardRound).categories[0].clues[1].cards).toBeUndefined();
    expect(validate(m).some((p) => p.text.includes('has 8 cards'))).toBe(true);
  });

  it('keeps a card’s name; one that isn’t text or is blank goes, a long one is cut to 60', () => {
    const g = plain(jeopardyGame());
    const cards = [
      { id: 'c1', name: 'Clue tip', to: 'picker', ...textSlide('a') },
      { id: 'c2', name: 5, to: 'picker', ...textSlide('b') },
      { id: 'c3', name: '  ', to: 'picker', ...textSlide('c') },
      { id: 'c4', name: 'N'.repeat(61), to: 'picker', ...textSlide('d') },
    ];
    g.rounds[0].categories[0].clues[0].cards = cards;
    const out = firstClue(migrateGame(g)).cards!;
    expect(out.map((c) => c.name)).toEqual(['Clue tip', undefined, undefined, 'N'.repeat(60)]);
    expect(['name' in out[1], 'name' in out[2]]).toEqual([false, false]);
  });

  it('gives a tile’s card whose id another of its cards has a new one; a whole list stays as it is', () => {
    const g = plain(jeopardyGame());
    g.rounds[0].categories[0].clues[0].cards = [
      { id: 'c1', name: 'Clue tip', to: 'picker', ...textSlide('a') },
      { id: 'c1', to: 'nobody', ...textSlide('b') },
    ];
    const whole = [{ id: 'w1', name: 'Tip', to: 'others', ...textSlide('w') }];
    const before = plain(whole);
    g.rounds[0].categories[0].clues[1].cards = whole;
    const m = migrateGame(g);
    const ids = firstClue(m).cards!.map((c) => c.id);
    expect(ids[0]).toBe('c1');
    expect(new Set(ids).size).toBe(2);
    const second = (m.rounds[0] as BoardRound).categories[0].clues[1];
    expect(second.cards).toBe(whole);
    expect(second.cards).toEqual(before);
    expect(JSON.stringify(migrateGame(plain(m)))).toBe(JSON.stringify(m));
  });

  it('sends a tile’s card going to someone a tile doesn’t know (“everyone playing” is a Final’s) to nobody', () => {
    const g = plain(jeopardyGame());
    g.rounds[0].categories[0].clues[0].cards = [{ id: 'c1', to: 'playing', ...textSlide('a') }];
    expect(firstClue(migrateGame(g)).cards![0].to).toBe('nobody');
  });

  it('names a tile’s card by its name, or by its place when it has none', () => {
    expect(clueCardName({}, 1)).toBe('Card 2');
    expect(clueCardName({ name: '  ' }, 1)).toBe('Card 2');
    expect(clueCardName({ name: ' Tip ' }, 0)).toBe('Tip');
    expect(clueCardWords({}, 1)).toBe('card 2');
    expect(clueCardWords({}, 1, true)).toBe('Card 2');
    expect(clueCardWords({ name: 'Tip' }, 0)).toBe('card “Tip”');
    expect(clueCardWords({ name: ' Tip ' }, 0, true)).toBe('Card “Tip”');
  });
});

describe('a Final’s 🤫 cards in saved games', () => {
  const plain = (g: unknown) => JSON.parse(JSON.stringify(g));
  const finalOf = (g: Game) => {
    const r = g.rounds[1];
    if (!isFinal(r)) throw new Error('not a Final');
    return r;
  };

  it('a game with none gains none', () => {
    expect('cards' in finalOf(migrateGame(plain(jeopardyGame())))).toBe(false);
  });

  it('drops cards that aren’t a list, or an empty one; repairs each like a slide, with its own id', () => {
    const g = plain(jeopardyGame());
    g.rounds[1].cards = 'oops';
    expect('cards' in finalOf(migrateGame(plain(g)))).toBe(false);
    g.rounds[1].cards = [];
    expect('cards' in finalOf(migrateGame(plain(g)))).toBe(false);
    g.rounds[1].cards = [
      { to: 'playing', background: {}, elements: [{ kind: 'text', text: null }] },
      null,
      5,
      { id: 'f1', to: 'playing', elements: 'x' },
      { id: 'f1', to: 'nobody', ...textSlide('b') },
    ];
    const out = finalOf(migrateGame(g)).cards!;
    expect(out).toHaveLength(3);
    expect(out.every((c) => typeof c.id === 'string' && c.id)).toBe(true);
    expect(new Set(out.map((c) => c.id)).size).toBe(3);
    expect(out[1].id).toBe('f1');
    expect((out[0].elements[0] as { text: string }).text).toBe('');
    expect([out[1].elements, out[1].background]).toEqual([[], {}]);
  });

  it('keeps “everyone playing” and nobody; a tile’s choices, or anything else, go to nobody', () => {
    const g = plain(jeopardyGame());
    g.rounds[1].cards = ['playing', 'nobody', 'picker', 'giver', 5].map((to, i) => ({ id: `f${i}`, to, ...textSlide('x') }));
    expect(finalOf(migrateGame(g)).cards!.map((c) => c.to)).toEqual(['playing', 'nobody', 'nobody', 'nobody', 'nobody']);
  });

  it('keeps a name; one that isn’t text or is blank goes, a long one is cut to 60', () => {
    const g = plain(jeopardyGame());
    g.rounds[1].cards = ['Leader hint', 5, '  ', 'N'.repeat(61)].map((name, i) => ({ id: `f${i}`, name, to: 'playing', ...textSlide('x') }));
    const out = finalOf(migrateGame(g)).cards!;
    expect(out.map((c) => c.name)).toEqual(['Leader hint', undefined, undefined, 'N'.repeat(60)]);
    expect(['name' in out[1], 'name' in out[2]]).toEqual([false, false]);
  });

  it('leaves a whole list exactly as it is', () => {
    const g = plain(jeopardyGame());
    const whole = [{ id: 'f1', name: 'Leader hint', to: 'playing', ...textSlide('Hint') }, { id: 'f2', to: 'nobody', ...textSlide('Side') }];
    const before = plain(whole);
    g.rounds[1].cards = whole;
    const m = migrateGame(g);
    expect(finalOf(m).cards).toBe(whole);
    expect(finalOf(m).cards).toEqual(before);
    expect(JSON.stringify(migrateGame(plain(m)))).toBe(JSON.stringify(m));
  });
});

describe('a Final’s ✍ switch in saved games', () => {
  it('keeps true or false (left out: players type on their phones); anything else goes', () => {
    const g = JSON.parse(JSON.stringify(jeopardyGame()));
    const off = (v: unknown) => {
      g.rounds[1].phoneAnswersOff = v;
      const r = migrateGame(JSON.parse(JSON.stringify(g))).rounds[1];
      if (!isFinal(r)) throw new Error('not a Final');
      return 'phoneAnswersOff' in r ? r.phoneAnswersOff : 'gone';
    };
    expect([off(true), off(false), off('x'), off(1), off(null)]).toEqual([true, false, 'gone', 'gone', 'gone']);
  });
});

describe('a ✍ clue’s multiple choices in saved games', () => {
  const choicesOf = (v: unknown) => {
    const g = JSON.parse(JSON.stringify(jeopardyGame()));
    g.rounds[0].categories[0].clues[0].choices = v;
    return (migrateGame(g).rounds[0] as BoardRound).categories[0].clues[0].choices;
  };

  it('each needs words and an id of its own; ✔ Right on the first marked only; 6 at most; none left, none', () => {
    const c = choicesOf([
      { id: 'a', text: 'Paris', right: true },
      { id: 'a', text: 'Oslo', right: true },
      { text: 'Bern', right: 'yes' },
      { id: 'd', text: 5 },
      'Rome',
      { id: 'e', text: 'x'.repeat(100) },
    ])!;
    expect(c.map((x) => x.text)).toEqual(['Paris', 'Oslo', 'Bern', 'x'.repeat(80)]);
    expect(new Set(c.map((x) => x.id)).size).toBe(4);
    expect(c.map((x) => !!x.right)).toEqual([true, false, false, false]);
    expect(choicesOf(Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, text: `${i}` })))).toHaveLength(6);
    for (const v of ['Paris', [], [{ id: 'a' }], null]) expect(choicesOf(v)).toBeUndefined();
    // A good list is kept as it is.
    const good = [{ id: 'a', text: 'Paris' }, { id: 'b', text: '', right: true }];
    expect(choicesOf(good)).toEqual(good);
  });
});

describe('🤫 Cards in saved games', () => {
  const plain = (g: unknown) => JSON.parse(JSON.stringify(g));
  const withCards = (cards: unknown) => migrateGame(plain({ ...jeopardyGame(), cards }));

  it('a new one has an id, its name and one empty words box; one left blank is named by its place', () => {
    const c = newSavedCard('Tip A');
    expect(c.id).toBeTruthy();
    expect(c.name).toBe('Tip A');
    expect(c.elements).toHaveLength(1);
    expect(c.elements[0].kind).toBe('text');
    expect(slideText(c)).toBe('');
    expect(c.until).toBeUndefined();
    expect(newSavedCard('X').id).not.toBe(c.id);
    expect(savedCardName({ name: '  ' }, 1)).toBe('Untitled card 2');
    expect(savedCardName({ name: ' Tip A ' }, 1)).toBe('Tip A');
  });

  it('leaves a whole list exactly as it is (and a game without any gets none)', () => {
    const g = plain(jeopardyGame());
    g.cards = [
      { id: 'sc1', name: 'Wild card', until: 'host', ...textSlide('Wild') },
      { id: 'sc2', name: '', ...textSlide('') },
    ];
    const before = plain(g.cards);
    const m = migrateGame(g);
    expect(m.cards).toBe(g.cards);
    expect(m.cards).toEqual(before);
    const once = migrateGame(plain(m));
    expect(JSON.stringify(migrateGame(plain(once)))).toBe(JSON.stringify(once));
    expect('cards' in migrateGame(plain(jeopardyGame()))).toBe(false);
  });

  it('drops a list that isn’t one, and anything in it that isn’t a card; an emptied list goes', () => {
    expect('cards' in withCards('lots')).toBe(false);
    expect('cards' in withCards([])).toBe(false);
    expect('cards' in withCards([null, 3, 'x'])).toBe(false);
    const m = withCards([null, { id: 'sc1', name: 'Tip A', ...textSlide('Hi') }, 'x']);
    expect(m.cards!.map((c) => c.id)).toEqual(['sc1']);
  });

  it('repairs each card: an id, a name of at most 60 characters, what a slide needs, and an until it knows', () => {
    const m = withCards([
      { name: 'No id', ...textSlide('a') },
      { id: 'sc2', name: 42, elements: 'x' },
      { id: 'sc3', name: 'N'.repeat(80), background: null, elements: [{ kind: 'text', text: null }] },
      { id: 'sc4', name: 'Round', until: 'round', ...textSlide('b') },
      { id: 'sc5', name: 'Five', until: 5, ...textSlide('c') },
      { id: 'sc6', name: 'Host', until: 'host', ...textSlide('d') },
    ]);
    const cards = m.cards as SavedCard[];
    expect(cards).toHaveLength(6);
    expect(typeof cards[0].id === 'string' && cards[0].id).toBeTruthy();
    expect(cards[1].name).toBe('');
    expect([cards[1].elements, cards[1].background]).toEqual([[], {}]);
    expect(cards[2].name).toBe('N'.repeat(60));
    expect(cards[2].background).toEqual({});
    expect((cards[2].elements[0] as { text: string }).text).toBe('');
    expect(cards[2].elements[0].id).toBeTruthy();
    expect(['until' in cards[3], 'until' in cards[4], cards[5].until]).toEqual([false, false, 'host']);
    expect(gameProblem(m)).toBeNull();
    expect(() => validate(m)).not.toThrow();
  });

  it('gives a card whose id another has already a new one (the first keeps it): each is sent by its own', () => {
    const m = withCards([
      { id: 'sc_wild', name: 'Wild card', ...textSlide('Wild') },
      { id: 'sc_wild', name: 'Tip A', ...textSlide('Tip') },
      { id: 'sc_wild', name: 'Tip B', ...textSlide('Tip B') },
    ]);
    const ids = m.cards!.map((c) => c.id);
    expect(ids[0]).toBe('sc_wild');
    expect(new Set(ids).size).toBe(3);
    expect(m.cards!.map((c) => [c.name, slideText(c)])).toEqual([['Wild card', 'Wild'], ['Tip A', 'Tip'], ['Tip B', 'Tip B']]);
    expect(JSON.stringify(migrateGame(plain(m)))).toBe(JSON.stringify(m));
  });
});

describe('🗜 copies for phones in saved games', () => {
  const plain = (g: unknown) => JSON.parse(JSON.stringify(g));
  const withMedia = (media: unknown[]) => migrateGame(plain({ ...jeopardyGame(), media }));
  const gif = { id: 'g', name: 'dance.gif', mime: 'image/gif', size: 9, kind: 'image' };
  const copy = (id: string, of: unknown, more = {}) => ({ id, name: `${id}.webm`, mime: 'video/webm', size: 1, kind: 'video', phoneCopy: { of }, ...more });

  it('keeps one copy a file, of a file in the game that isn’t a copy itself; any other goes', () => {
    const m = withMedia([gif, copy('c1', 'g'), copy('c2', 'g'), copy('c3', 'gone'), copy('c4', 'c1'), copy('c5', 42), copy('c6', 'g', { phoneCopy: 'x' }), copy('c7', 'c7')]);
    expect(m.media.map((x) => x.id)).toEqual(['g', 'c1']);
    expect(gameProblem(m)).toBeNull();
    // (One with the link of a file isn't a stored copy.)
    expect(withMedia([gif, copy('c1', 'g', { url: 'https://x.test/a.webm' })]).media.map((x) => x.id)).toEqual(['g']);
    expect(JSON.stringify(migrateGame(plain(m)))).toBe(JSON.stringify(m));
  });
});
