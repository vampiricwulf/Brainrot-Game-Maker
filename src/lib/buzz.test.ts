import { describe, expect, it } from 'vitest';
import { jeopardyGame } from './testgame';
import { finalName, newImageEl, newTextEl, textSlide, type BoardRound, type FinalRound } from './model';
import { applyScore, ddShowQuestion, finalChoose, finalNext, finalSetWager, goToRound, newSession, openClue, places } from './session';
import {
  buzzArm, buzzClueOpened, buzzDone, buzzIdle, buzzMissed, buzzOrder, buzzReset, buzzTake, hostState, newBuzz, phoneStatus, questionText, setupState, teamsOn, wagerAsk,
  whoBuzzed,
} from './buzz';
import { phoneView } from './buzzproto';

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

  it('a wrong answer with others in the buzz order: the next one who hasn’t missed answers, no new opening', () => {
    const a = buzzTake(buzzClueOpened(newBuzz(), true), 'a')!;
    const r = buzzMissed(a, 'a', P, ['a', 'c', 'b']);
    expect(r).toEqual({ phase: 'answering', armId: a.armId, answering: 'c', lockedOut: ['a'] });
    // c misses too: b is next; then the order is used up and the buzzers open for whoever is left.
    const s = buzzMissed(r, 'c', P, ['a', 'c', 'b']);
    expect(s).toMatchObject({ phase: 'answering', answering: 'b', lockedOut: ['a', 'c'] });
    const t = buzzMissed(buzzMissed(a, 'a', [...P, 'd'], ['a']), 'a', [...P, 'd'], ['a']);
    expect(t).toMatchObject({ phase: 'armed', answering: null, lockedOut: ['a'] });
    // A player who left the game is skipped.
    expect(buzzMissed(a, 'a', ['a', 'b'], ['a', 'gone', 'b'])).toMatchObject({ answering: 'b' });
  });

  it('0 opens them for everyone; a right answer closes them; leaving the clue clears it all', () => {
    const r = buzzMissed(buzzTake(buzzClueOpened(newBuzz(), true), 'a')!, 'a', P);
    expect(buzzReset(r)).toEqual({ phase: 'armed', armId: r.armId + 1, answering: null, lockedOut: [] });
    const done = buzzDone(buzzTake(r, 'b')!);
    expect(done).toMatchObject({ phase: 'closed', answering: null, lockedOut: ['a'], done: true, doneBy: 'b' });
    expect(buzzArm(done, P)).toMatchObject({ phase: 'armed', armId: r.armId + 1, lockedOut: ['a'] });
    expect(buzzIdle(done)).toEqual({ phase: 'lobby', armId: done.armId, answering: null, lockedOut: [] });
  });
});

describe('team buzzers', () => {
  it('a team member’s buzz: the team answers, and the state says who on it buzzed', () => {
    const armed = buzzClueOpened(newBuzz(), true);
    const a = buzzTake(armed, 'a', false, 'Ann')!;
    expect(a).toEqual({ phase: 'answering', armId: 1, answering: 'a', lockedOut: [], by: 'Ann' });
    // A teammate (or anyone) buzzing after doesn't take over.
    expect(buzzTake(a, 'a', false, 'Al')).toBeNull();
    // Picked by the host: nobody on the team buzzed.
    expect(buzzTake(armed, 'a', true)).not.toHaveProperty('by');
    expect(whoBuzzed('Red team', 'Ann')).toBe('Ann (Red team)');
    expect(whoBuzzed('Ann')).toBe('Ann');
    expect(whoBuzzed('Ann', null)).toBe('Ann');
  });

  it('a wrong answer locks out the whole team; the next team in the order answers, with who buzzed for it', () => {
    const a = buzzTake(buzzClueOpened(newBuzz(), true), 'a', false, 'Ann')!;
    const r = buzzMissed(a, 'a', P, [{ id: 'a', by: 'Ann' }, { id: 'a', by: 'Al' }, { id: 'b', by: 'Bea' }]);
    expect(r).toEqual({ phase: 'answering', armId: 1, answering: 'b', lockedOut: ['a'], by: 'Bea' });
    // Team b misses too: c (no phone buzz: picked by number key earlier) is next, then a rebound for nobody left.
    const s = buzzMissed(r, 'b', P, [{ id: 'a', by: 'Ann' }, { id: 'b', by: 'Bea' }, 'c']);
    expect(s).toEqual({ phase: 'answering', armId: 1, answering: 'c', lockedOut: ['a', 'b'] });
    const t = buzzMissed(s, 'c', P, ['a', 'b', 'c']);
    expect(t).toMatchObject({ phase: 'closed', lockedOut: ['a', 'b', 'c'] });
    expect(t).not.toHaveProperty('by');
    // A rebound (nobody left in the order) opens the buzzers with nobody answering.
    expect(buzzMissed(a, 'a', P, [{ id: 'a', by: 'Ann' }])).toEqual({ phase: 'armed', armId: 2, answering: null, lockedOut: ['a'] });
  });

  it('the buzz order has each team once, its first buzz (a teammate’s later one is no new place)', () => {
    expect(buzzOrder([{ id: 'a', by: 'Ann' }, { id: 'b', by: 'Bea' }, { id: 'a', by: 'Al' }, 'c', 'b'])).toEqual([
      { id: 'a', by: 'Ann' },
      { id: 'b', by: 'Bea' },
      { id: 'c' },
    ]);
    expect(buzzOrder([])).toEqual([]);
  });

  it('the room is told teams are on (and new players from phones are off); off, nothing changes', () => {
    const game = jeopardyGame();
    game.players = [{ id: 'a', name: 'Red', color: '#ff0000' }];
    const session = newSession(game);
    game.settings.phoneJoin = true;
    const solo = hostState(game, session, newBuzz(), 0);
    expect(solo.allowNew).toBe(true);
    expect(solo).not.toHaveProperty('teams');
    expect(teamsOn(game.settings)).toBe(false);
    game.settings.buzzTeams = true;
    expect(teamsOn(game.settings)).toBe(true);
    expect(hostState(game, session, newBuzz(), 0)).toMatchObject({ teams: true, allowNew: false });
    expect(setupState(game, session.players, 3, 0)).toMatchObject({ teams: true, allowNew: false, phase: 'lobby' });
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

  it('a ✍ clue: the answers asked for go along with the clue words (the phones need them to answer), never the answer', () => {
    const { game, session } = setup();
    openClue(session, { round: 0, cat: 0, row: 0 }, game);
    const s = hostState(game, session, newBuzz(), 0, { answers: { id: 'c', open: true, seats: [{ id: 'a' }, { id: 'b' }] } });
    expect(s.phase).toBe('lobby');
    expect(s.clue?.text).toBe('This dog says doge');
    expect(s.answers).toEqual({ id: 'c', open: true, seats: [{ id: 'a' }, { id: 'b' }] });
    expect(JSON.stringify(s)).not.toContain('Shiba');
  });

  it('lets players pick their colour unless it is turned off or there are teams', () => {
    const { game, session } = setup();
    expect(hostState(game, session, newBuzz(), 0).colorPick).toBe(true);
    game.settings.phoneColorsOff = true;
    expect(hostState(game, session, newBuzz(), 0).colorPick).toBeUndefined();
    game.settings.phoneColorsOff = undefined;
    game.settings.buzzTeams = true;
    expect(hostState(game, session, newBuzz(), 0).colorPick).toBeUndefined();
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
    expect(Object.keys(s).sort()).toEqual(['allowNew', 'answerShown', 'answering', 'armId', 'clue', 'colorPick', 'currency', 'earlyLockMs', 'lockedOut', 'phase', 'scores', 'seats', 'title']);
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

  it('a right answer: the phones are told who got it (only while closed)', () => {
    const { game, session } = setup();
    openClue(session, { round: 0, cat: 0, row: 0 }, game);
    const done = buzzDone(buzzTake(buzzClueOpened(newBuzz(), true), 'b')!);
    expect(hostState(game, session, done, 0)).toMatchObject({ phase: 'closed', done: { by: 'b' } });
    expect(hostState(game, session, buzzArm(done, ['a', 'b']), 0).done).toBeUndefined();
    expect(hostState(game, session, buzzClueOpened(newBuzz(), false), 0).done).toBeUndefined();
  });

  it('the status line, locked seats, the points symbol and long names cut to fit', () => {
    const { game, session } = setup();
    session.players[0].name = 'A'.repeat(60);
    game.settings.currencySymbol = '€';
    const s = hostState(game, session, newBuzz(), 0, { status: { text: 'Hi' }, locked: true });
    expect(s).toMatchObject({ status: { text: 'Hi' }, locked: true, currency: '€' });
    expect(Array.from(s.seats[0].name)).toHaveLength(40);
    expect(s.seats[0].name.endsWith('…')).toBe(true);
    expect('status' in hostState(game, session, newBuzz(), 0, { status: null })).toBe(false);
  });

  it('phoneStatus: what phones say when nobody buzzes', () => {
    const { game, session } = setup();
    expect(phoneStatus(game, session, true)).toEqual({ text: 'The game starts soon' });
    session.phase = 'board';
    session.intro = null;
    session.currentPickerId = 'a';
    expect(phoneStatus(game, session)).toEqual({ text: 'Ann picks the next clue', seats: ['a'], seatsText: 'Your pick! Tell the host which clue' });
    session.phase = 'clue';
    session.dd = { stage: 'splash', playerId: 'b' };
    expect(phoneStatus(game, session)).toEqual({ text: 'Daily Double: Bo', seats: ['b'], seatsText: 'Daily Double — you’re up!' });
    session.dd = null;
    expect(phoneStatus(game, session)).toBeNull();
    session.phase = 'end';
    expect(phoneStatus(game, session)?.text).toBe('Game over: thanks for playing!');
    // The game is over: the room is told (phones say where each came).
    expect(hostState(game, session, newBuzz(), 0).over).toBe(true);
    session.phase = 'board';
    expect(hostState(game, session, newBuzz(), 0).over).toBeUndefined();
  });

  it('game over after a tiebreaker: the room is told who won it, so the phones rank as the end screen does', () => {
    const { game, session } = setup();
    session.phase = 'end';
    // Ann and Bo tied for first (0 each); Bo won the roll-off.
    session.rollOffWinner = 'b';
    const s = hostState(game, session, newBuzz(), 0);
    expect(s).toMatchObject({ over: true, winner: 'b' });
    expect(places(session).map((p) => [p.player.id, p.place])).toEqual([
      ['b', 1],
      ['a', 2],
    ]);
    expect(phoneView(s, 'b').final).toEqual({ place: 1 });
    expect(phoneView(s, 'a').final).toEqual({ place: 2 });
    // No tie any more (a score fixed later): nothing to settle.
    applyScore(session, game, ['a'], 100, 'x');
    expect('winner' in hostState(game, session, newBuzz(), 0)).toBe(false);
    // Not over: no winner either.
    applyScore(session, game, ['b'], 100, 'x');
    session.phase = 'board';
    expect('winner' in hostState(game, session, newBuzz(), 0)).toBe(false);
  });

  it('question text: text boxes top to bottom', () => {
    const s = textSlide('second');
    s.elements[0].y = 300;
    s.elements.push(newTextEl('first', { x: 0, y: 10, w: 100, h: 50 }));
    expect(questionText(s)).toBe('first\nsecond');
    expect(questionText(undefined)).toBe('');
  });
});

describe('wagerAsk (the wagers phones may send)', () => {
  function setup() {
    const game = jeopardyGame();
    game.players = [
      { id: 'a', name: 'Ann', color: '#ff0000' },
      { id: 'b', name: 'Bo', color: '#00ff00' },
      { id: 'c', name: 'Cy', color: '#0000ff' },
    ];
    const r = game.rounds[0] as BoardRound;
    r.categories[0].clues[0].type = 'dailyDouble';
    const session = newSession(game);
    session.phase = 'board';
    session.intro = null;
    return { game, session };
  }

  it('a Final whose question was on screen stays locked for phones after an Undo back to its wagers', () => {
    const { game, session } = setup();
    applyScore(session, game, ['a', 'b'], 500, 'x');
    const fi = game.rounds.findIndex((r) => r.mode === 'final');
    goToRound(session, game, fi);
    session.intro = null;
    expect(wagerAsk(game, session, true)?.open).toBe(true);
    finalNext(session, game);
    expect(wagerAsk(game, session, true)?.open).toBe(false);
    session.finalStep = 'wagers';
    expect(wagerAsk(game, session, true)?.open).toBe(false);
  });

  it('none on the board or during an ordinary clue', () => {
    const { game, session } = setup();
    expect(wagerAsk(game, session, true)).toBeNull();
    openClue(session, { round: 0, cat: 1, row: 0 }, game);
    expect(wagerAsk(game, session, true)).toBeNull();
  });

  it("a Daily Double: its player, their max, the host's box; locked once the question shows", () => {
    const { game, session } = setup();
    applyScore(session, game, ['b'], 1500, 'x');
    openClue(session, { round: 0, cat: 0, row: 0 }, game);
    // Nobody picked yet: nobody is asked.
    session.dd!.playerId = undefined;
    expect(wagerAsk(game, session, true)).toBeNull();
    session.dd!.playerId = 'b';
    const ask = wagerAsk(game, session, true)!;
    const clue = (game.rounds[0] as BoardRound).categories[0].clues[0].id;
    expect(ask).toEqual({ id: `dd:${clue}:b`, kind: 'dd', open: true, seats: [{ id: 'b', max: 1500 }] });
    // The limit on: phones are held to it. The host typed 300: it's the host's.
    session.dd!.draft = 300;
    expect(wagerAsk(game, session, false)).toMatchObject({ limit: true, seats: [{ id: 'b', max: 1500, amount: 300, fromHost: true }] });
    // From the phone (taken as count 2): not the host's.
    Object.assign(session.dd!, { draft: 400, draftFrom: 'phone' });
    expect(wagerAsk(game, session, true, { b: 2 })!.seats).toEqual([{ id: 'b', max: 1500, amount: 400, got: 2 }]);
    ddShowQuestion(session, 'b', 400);
    expect(wagerAsk(game, session, true)).toMatchObject({ open: false, seats: [{ id: 'b', amount: 400 }] });
    // Another player picked: another round of wagers.
    session.dd!.stage = 'splash';
    session.dd!.playerId = 'a';
    expect(wagerAsk(game, session, true)!.id).toBe(`dd:${clue}:a`);
  });

  it('a Final: the players in it on the wager screen; locked through the question and the answer; gone in the reveals', () => {
    const { game, session } = setup();
    applyScore(session, game, ['a'], 500, 'x');
    applyScore(session, game, ['b'], 200, 'x');
    goToRound(session, game, 1);
    session.intro = null;
    // Cy (0) sits out under the TV rule unless the round lets them play; tick them out to be sure.
    finalChoose(session, 'c', false);
    finalSetWager(session, 'a', 100, 'phone');
    finalSetWager(session, 'b', 50);
    const id = `final:${game.rounds[1].id}`;
    expect(wagerAsk(game, session, true)).toEqual({
      id,
      kind: 'final',
      open: true,
      seats: [
        { id: 'a', max: 500, amount: 100 },
        { id: 'b', max: 200, amount: 50, fromHost: true },
      ],
    });
    finalNext(session, game);
    expect(wagerAsk(game, session, true)).toMatchObject({ id, open: false });
    finalNext(session, game);
    expect(wagerAsk(game, session, true)).toMatchObject({ open: false });
    finalNext(session, game);
    expect(wagerAsk(game, session, true)).toBeNull();
  });

  it('goes to the room in the host state, and each phone sees only its own amount', () => {
    const { game, session } = setup();
    applyScore(session, game, ['a', 'b'], 500, 'x');
    goToRound(session, game, 1);
    session.intro = null;
    finalChoose(session, 'c', false);
    finalSetWager(session, 'a', 4321);
    finalSetWager(session, 'b', 1234);
    const st = hostState(game, session, newBuzz(), 0, { wager: wagerAsk(game, session, true) });
    expect(st.wager?.seats.map((x) => x.amount)).toEqual([4321, 1234]);
    // (As numbers in the JSON: a random id can contain the same digits.)
    const ann = JSON.stringify(phoneView(st, 'a'));
    expect(ann).toMatch(/:4321[,}]/);
    expect(ann).not.toMatch(/:1234[,}]/);
    expect(JSON.stringify(phoneView(st, 'c'))).not.toMatch(/:(4321|1234)[,}]/);
    expect(phoneView(st, 'c').wager).toMatchObject({ mine: false });
    expect(hostState(game, session, newBuzz(), 0).wager).toBeUndefined();
    // A phone seated after the wagers began isn't told the host's amount, only that one is in.
    const late = phoneView(st, 'a', null, null, null, true);
    expect(JSON.stringify(late)).not.toMatch(/:4321[,}]/);
    expect(late.wager).toMatchObject({ mine: true, hidden: true });
    // What it sent itself it sees (unless the host typed over it: still not shown).
    expect(phoneView(st, 'a', null, null, { amount: 77, n: 1 }, true).wager).toMatchObject({ hidden: true });
    finalSetWager(session, 'a', 77, 'phone');
    const st2 = hostState(game, session, newBuzz(), 0, { wager: wagerAsk(game, session, true) });
    expect(phoneView(st2, 'a', null, null, { amount: 77, n: 1 }, true).wager).toMatchObject({ amount: 77, sent: true });
  });

  it("the phones' line in a Final says its category (on screen from the wagers on)", () => {
    const { game, session } = setup();
    goToRound(session, game, 1);
    session.intro = null;
    const f = game.rounds[1] as FinalRound;
    f.category = '  US Presidents ';
    expect(phoneStatus(game, session)?.text).toBe(`${finalName(f)} · US Presidents`);
    f.category = '';
    expect(phoneStatus(game, session)?.text).toBe(finalName(f));
  });
});
