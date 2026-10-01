import { describe, expect, it } from 'vitest';
import { jeopardyGame } from './testgame';
import { parseGame } from './fileio';
import { countdownSeconds, FINAL_V1_ROUND_ID, gameProblem, isBoard, isFinal, MAX_PLAYERS, migrateGame, mostPlayers, newGame, textSlide, type Game } from './model';
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

  it('drops a Final that was switched off', () => {
    const g = migrateGame(v1Game(false));
    expect(g.rounds.every(isBoard)).toBe(true);
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
});

describe('📋 Game rules: what can be typed', () => {
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

  it('Most players: 1 to 20, never below the players listed', () => {
    expect(mostPlayers(0)).toBe(1);
    expect(mostPlayers(3, 5)).toBe(5);
    expect(mostPlayers(50)).toBe(MAX_PLAYERS);
    expect(mostPlayers(7.4)).toBe(7);
    expect(mostPlayers(undefined)).toBe(8);
    expect(mostPlayers(4, 30)).toBe(MAX_PLAYERS);
  });
});
