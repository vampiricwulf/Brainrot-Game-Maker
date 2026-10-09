import { describe, expect, it } from 'vitest';
import { jeopardyGame } from './testgame';
import { parseGame } from './fileio';
import {
  blankName,
  clueCountdown,
  clueValueTyped,
  compactPoints,
  countdownSeconds,
  FINAL_V1_ROUND_ID,
  formatPoints,
  gameProblem,
  isBoard,
  isFinal,
  MAX_PLAYERS,
  MAX_POINTS,
  MAX_TILE_VALUE,
  migrateGame,
  mostPlayers,
  newGame,
  textSlide,
  typedPoints,
  wholePoints,
  type Game,
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
    // Nothing that reads as a number: null (asked again, not set to something else).
    expect(typedPoints('')).toBeNull();
    expect(typedPoints('abc')).toBeNull();
    expect(typedPoints('$')).toBeNull();
    expect(typedPoints('1.2.3')).toBeNull();
    expect(typedPoints('12abc34')).toBeNull();
    expect(typedPoints('1.5K')).toBeNull();
    expect(typedPoints('2m pts')).toBeNull();
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
