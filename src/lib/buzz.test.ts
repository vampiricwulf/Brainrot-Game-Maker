import { describe, expect, it } from 'vitest';
import { jeopardyGame } from './testgame';
import { newImageEl, newTextEl, textSlide, type BoardRound } from './model';
import { applyScore, newSession, openClue } from './session';
import { buzzArm, buzzClueOpened, buzzDone, buzzIdle, buzzMissed, buzzReset, buzzTake, hostState, newBuzz, questionText } from './buzz';

const P = ['a', 'b', 'c'];

describe('buzzer rules', () => {
  it('a clue opens armed (a new armId) or closed, and nobody is locked out', () => {
    const b = { ...newBuzz(4), lockedOut: ['a'] };
    expect(buzzClueOpened(b, true)).toEqual({ phase: 'armed', armId: 5, answering: null, lockedOut: [] });
    expect(buzzClueOpened(b, false)).toEqual({ phase: 'closed', armId: 4, answering: null, lockedOut: [] });
  });

  it('the first buzz answers; a second one, or one from the lobby, does not count', () => {
    const armed = buzzClueOpened(newBuzz(), true);
    const a = buzzTake(armed, 'a')!;
    expect(a).toMatchObject({ phase: 'answering', answering: 'a', armId: 1 });
    expect(buzzTake(a, 'b')).toBeNull();
    expect(buzzTake(newBuzz(), 'a')).toBeNull();
    // The host overrides (a click, or a number key while closed).
    expect(buzzTake(buzzClueOpened(newBuzz(), false), 'b')).toMatchObject({ answering: 'b' });
    expect(buzzTake(a, 'b', true)).toMatchObject({ answering: 'b' });
  });

  it('a wrong answer locks that player out and opens the buzzers again for the rest (a new armId)', () => {
    const a = buzzTake(buzzClueOpened(newBuzz(), true), 'a')!;
    const r = buzzMissed(a, 'a', P);
    expect(r).toEqual({ phase: 'armed', armId: 2, answering: null, lockedOut: ['a'] });
    expect(buzzTake(r, 'a')).toBeNull();
    const b = buzzMissed(buzzTake(r, 'b')!, 'b', P);
    expect(b.lockedOut).toEqual(['a', 'b']);
    expect(b.armId).toBe(3);
    // Everyone missed: the buzzers stay closed.
    const c = buzzMissed(buzzTake(b, 'c')!, 'c', P);
    expect(c).toMatchObject({ phase: 'closed', lockedOut: ['a', 'b', 'c'], armId: 3 });
    expect(buzzArm(c, P).phase).toBe('closed');
  });

  it('0 opens them for everyone; a right answer closes them; leaving the clue clears it all', () => {
    const r = buzzMissed(buzzTake(buzzClueOpened(newBuzz(), true), 'a')!, 'a', P);
    expect(buzzReset(r)).toEqual({ phase: 'armed', armId: r.armId + 1, answering: null, lockedOut: [] });
    const done = buzzDone(buzzTake(r, 'b')!);
    expect(done).toMatchObject({ phase: 'closed', answering: null, lockedOut: ['a'] });
    expect(buzzArm(done, P)).toMatchObject({ phase: 'armed', armId: r.armId + 1, lockedOut: ['a'] });
    expect(buzzIdle(done)).toEqual({ phase: 'lobby', armId: done.armId, answering: null, lockedOut: [] });
  });
});

describe('hostState (what the buzzer room is told)', () => {
  function setup() {
    const game = jeopardyGame();
    game.title = 'Quiz';
    game.players = [
      { id: 'a', name: 'Ann', color: '#ff0000' },
      { id: 'b', name: 'Bo', color: '#00ff00' },
    ];
    const r = game.rounds[0] as BoardRound;
    r.categories[0].title = 'Memes';
    const clue = r.categories[0].clues[0];
    clue.questionSlide = textSlide('This dog says doge');
    const secret = newTextEl('SECRET ANSWER HINT');
    secret.secret = true;
    secret.hostNotes = 'LAYER NOTE';
    clue.questionSlide.elements.push(secret, newImageEl('img1'));
    clue.answerSlide = textSlide('What is Shiba Inu?');
    clue.hostNotes = 'HOST NOTE';
    const session = newSession(game);
    return { game, session };
  }

  it('in the lobby: seats, scores, no clue', () => {
    const { game, session } = setup();
    const s = hostState(game, session, newBuzz(), 1000);
    expect(s).toMatchObject({ title: 'Quiz', phase: 'lobby', clue: null, answering: null, lockedOut: [], earlyLockMs: 1000, allowNew: false });
    expect(s.seats).toEqual([
      { id: 'a', name: 'Ann', color: '#ff0000' },
      { id: 'b', name: 'Bo', color: '#00ff00' },
    ]);
    expect(s.scores).toEqual({ a: 0, b: 0 });
  });

  it('during a clue: the question words and caption only, never the answer, notes, hidden text or media', () => {
    const { game, session } = setup();
    openClue(session, { round: 0, cat: 0, row: 0 }, game);
    applyScore(session, game, ['b'], 200, 'x');
    session.revealed = true;
    const b = buzzMissed(buzzTake(buzzClueOpened(newBuzz(), true), 'a')!, 'a', ['a', 'b']);
    const s = hostState(game, session, b, 0);
    expect(s.clue?.text).toBe('This dog says doge');
    expect(s.clue?.caption).toMatch(/^Memes · /);
    expect(s).toMatchObject({ phase: 'armed', lockedOut: ['a'], scores: { a: 0, b: 200 } });
    const json = JSON.stringify(s);
    for (const leak of ['Shiba', 'HOST NOTE', 'LAYER NOTE', 'SECRET', 'img1', 'answerSlide', 'What is', 'hostNotes', 'media']) expect(json).not.toContain(leak);
    expect(Object.keys(s).sort()).toEqual(['allowNew', 'answering', 'armId', 'clue', 'earlyLockMs', 'lockedOut', 'phase', 'scores', 'seats', 'title']);
  });

  it('a phone sees no clue on the board, even if the buzz state says otherwise', () => {
    const { game, session } = setup();
    const s = hostState(game, session, { phase: 'armed', armId: 2, answering: null, lockedOut: [] }, 0);
    expect(s.clue).toBeNull();
  });

  it('only the players in the game (no avatars or stats) and only locked-out players still there', () => {
    const { game, session } = setup();
    session.players[0].avatar = 'pic';
    openClue(session, { round: 0, cat: 0, row: 0 }, game);
    const s = hostState(game, session, { phase: 'armed', armId: 3, answering: null, lockedOut: ['gone', 'b'] }, 1000);
    expect(s.lockedOut).toEqual(['b']);
    expect(JSON.stringify(s.seats)).not.toContain('pic');
  });

  it('question text: text boxes top to bottom', () => {
    const s = textSlide('second');
    s.elements[0].y = 300;
    s.elements.push(newTextEl('first', { x: 0, y: 10, w: 100, h: 50 }));
    expect(questionText(s)).toBe('first\nsecond');
    expect(questionText(undefined)).toBe('');
  });
});
