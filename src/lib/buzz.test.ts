import { describe, expect, it } from 'vitest';
import { jeopardyGame } from './testgame';
import { finalName, newImageEl, newTextEl, setSlideText, textSlide, PARTNER_GAMES, type BoardRound, type FinalRound, type PartnerGame, type SavedCard } from './model';
import { applyScore, ddShowQuestion, finalChoose, finalNext, finalSetWager, goToRound, judgePartner, newSession, openClue, places, rebaseSession, removePlayer, undo } from './session';
import { addCard, setPartner, setPartnerGame, swapParts } from './partner';
import {
  answerRoundId, buzzArm, buzzClueOpened, buzzDone, buzzIdle, buzzMissed, buzzOrder, buzzReset, buzzTake, cardsLeftOff, everyoneAnswerAsk, finalAnswerAsk, hostCards, hostState, newBuzz, phoneStatus, questionText, roomCardCount,
  roomCardsFull, seenAtOnce, sessionCards, setupState, teamsOn, wagerAsk, whoBuzzed,
} from './buzz';
import { CARDS_MAX, phoneView, OLD_FILE_LIMITS } from './buzzproto';
import { phoneCard } from './phonecard';
import { sendCard, sendCardAgain, sentCardId } from './sentcards';

/** How big a file the buzzer server takes in these tests (one that doesn't say: 16 MB). */
const FILE_BYTES = OLD_FILE_LIMITS.fileBytes;

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

  it('question text: up to 1000 characters, cut with “…” on a whole character', () => {
    const long = 'Name the scientist. '.repeat(50);
    expect(questionText(textSlide(long.slice(0, 996)))).toBe(long.slice(0, 996).trim());
    const cut = questionText(textSlide('x'.repeat(1200)));
    expect(cut.length).toBe(1000);
    expect(cut.endsWith('x…')).toBe(true);
    // An emoji (two units) or a flag (four) right at the edge goes whole or not at all.
    for (const pic of ['😀', '🇬🇧']) {
      for (let at = 994; at <= 1000; at++) {
        const q = questionText(textSlide('x'.repeat(at) + pic.repeat(20)));
        expect(q.length).toBeLessThanOrEqual(1000);
        expect(q.endsWith('…')).toBe(true);
        expect(q.slice(at, -1).length % pic.length).toBe(0);
        expect(q.slice(at, -1).replaceAll(pic, '')).toBe('');
      }
    }
  });

  it('question text: line breaks stay, blank lines go (a slide’s spacing)', () => {
    expect(questionText(textSlide('first\n\n  \nsecond'))).toBe('first\nsecond');
    expect(questionText(textSlide('A) x\nB) y'))).toBe('A) x\nB) y');
    const s = textSlide('Which one?\n\n');
    s.elements.push(newTextEl('\n\nA) x\n\n\nB) y', { x: 0, y: 500, w: 100, h: 50 }));
    expect(questionText(s)).toBe('Which one?\nA) x\nB) y');
  });

  it('what viewers see as a slide comes up: no secret, see-through or later item (a hint), for the phones too', () => {
    const s = textSlide('question');
    const hint = newTextEl('hint', { x: 0, y: 200, w: 100, h: 50 });
    hint.entrance = { type: 'fade', delay: 20, duration: 1 };
    const clear = { ...newTextEl('see-through', { x: 0, y: 300, w: 100, h: 50 }), opacity: 0 };
    const secret = { ...newTextEl('secret', { x: 0, y: 400, w: 100, h: 50 }), secret: true };
    const soon = newTextEl('soon', { x: 0, y: 500, w: 100, h: 50 });
    soon.entrance = { type: 'pop', delay: 1, duration: 1 };
    s.elements.push(hint, clear, secret, soon);
    expect(s.elements.filter(seenAtOnce).map((e) => (e.kind === 'text' ? e.text : ''))).toEqual(['question', 'soon']);
    expect(questionText(s)).toBe('question\nsoon');
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
    // Then to the round before and back to the Final: still locked.
    goToRound(session, game, 0);
    goToRound(session, game, fi);
    expect([session.finalStep, wagerAsk(game, session, true)?.open]).toEqual(['wagers', false]);
  });

  it("a phone's Final wager put back by an Undo (not the last one it sent) reads as the host's", () => {
    const { game, session } = setup();
    applyScore(session, game, ['a'], 500, 'x');
    goToRound(session, game, 1);
    session.intro = null;
    finalChoose(session, 'b', false);
    finalChoose(session, 'c', false);
    // The phone sent $300, then $400 (its count 2): the host took both, then undid the second.
    finalSetWager(session, 'a', 300, 'phone');
    const view = () => {
      const st = hostState(game, session, newBuzz(), 0, { wager: wagerAsk(game, session, true, { a: 2 }, { a: 400 }) });
      return phoneView(st, 'a', null, null, { amount: 400, n: 2 }).wager;
    };
    expect(wagerAsk(game, session, true, { a: 2 }, { a: 400 })!.seats).toEqual([{ id: 'a', max: 500, amount: 300, fromHost: true, got: 2 }]);
    expect(view()).toMatchObject({ amount: 300, host: true });
    // Redo: the one it sent last is in again.
    finalSetWager(session, 'a', 400, 'phone');
    expect(wagerAsk(game, session, true, { a: 2 }, { a: 400 })!.seats).toEqual([{ id: 'a', max: 500, amount: 400, got: 2 }]);
    expect(view()).toMatchObject({ amount: 400, sent: true });
    expect(view()).not.toHaveProperty('host');
  });

  it("locked, a send the host never took (it came in as the question showed) reads as the host's amount", () => {
    const { game, session } = setup();
    applyScore(session, game, ['a'], 500, 'x');
    goToRound(session, game, 1);
    session.intro = null;
    finalChoose(session, 'b', false);
    finalChoose(session, 'c', false);
    // The host took the phone's $300 (its count 1); its $400 (count 2) reached the room, not the host, in time.
    finalSetWager(session, 'a', 300, 'phone');
    const view = (sent: { amount: number; n: number }, late = false) => {
      const st = hostState(game, session, newBuzz(), 0, { wager: wagerAsk(game, session, true, { a: 1 }, { a: 300 }) });
      return phoneView(st, 'a', null, null, sent, late).wager;
    };
    expect(view({ amount: 400, n: 2 })).toMatchObject({ open: true, amount: 400, sent: true });
    finalNext(session, game);
    expect(view({ amount: 400, n: 2 })).toMatchObject({ open: false, amount: 300 });
    // The one the host took is still the phone's to see (one seated after the wagers began too).
    expect(view({ amount: 300, n: 1 })).toMatchObject({ open: false, amount: 300, sent: true });
    expect(view({ amount: 300, n: 1 }, true)).toMatchObject({ open: false, amount: 300, sent: true });
    // A Daily Double the same way: the host took $700 (count 1) and showed the question; $900 (count 2) came too late.
    const dd = setup();
    applyScore(dd.session, dd.game, ['b'], 1500, 'x');
    openClue(dd.session, { round: 0, cat: 0, row: 0 }, dd.game);
    Object.assign(dd.session.dd!, { playerId: 'b', draft: 700, draftFrom: 'phone' });
    ddShowQuestion(dd.session, 'b', 700);
    const st = hostState(dd.game, dd.session, newBuzz(), 0, { wager: wagerAsk(dd.game, dd.session, true, { b: 1 }, { b: 700 }) });
    expect(phoneView(st, 'b', null, null, { amount: 900, n: 2 }).wager).toMatchObject({ open: false, mine: true, amount: 700 });
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

describe('each game’s answer rounds are its own (answerRoundId, everyoneAnswerAsk)', () => {
  it('a round is its base id with the session’s key; without a key (a session saved before), or too long for the room, the base', () => {
    expect(answerRoundId({ answerKey: 'k1234567' }, 'c1')).toBe('c1@k1234567');
    expect(answerRoundId({}, 'c1')).toBe('c1');
    expect(answerRoundId({ answerKey: 'k1234567' }, 'x'.repeat(91))).toBe(`${'x'.repeat(91)}@k1234567`);
    expect(answerRoundId({ answerKey: 'k1234567' }, 'x'.repeat(92))).toBe('x'.repeat(92));
  });

  it('every new session (a 🔁 Rematch too) gets its own key', () => {
    const game = jeopardyGame();
    const a = newSession(game).answerKey;
    const b = newSession(game).answerKey;
    expect(a).toMatch(/^\S{8}$/);
    expect(b).toMatch(/^\S{8}$/);
    expect(a).not.toBe(b);
  });

  it('a ✍ clue asks every player under its keyed id, open until the answer shows, with the answers taken', () => {
    const game = jeopardyGame();
    game.players = [
      { id: 'a', name: 'Ann', color: '#ff0000' },
      { id: 'b', name: 'Bo', color: '#00ff00' },
    ];
    const clue = (game.rounds[0] as BoardRound).categories[0].clues[0];
    const session = newSession(game);
    session.answerKey = 'k1234567';
    openClue(session, { round: 0, cat: 0, row: 0 }, game);
    // Not a ✍ clue: no ask.
    expect(everyoneAnswerAsk(game, session)).toBeNull();
    clue.everyone = true;
    const id = `${clue.id}@k1234567`;
    expect(everyoneAnswerAsk(game, session)).toEqual({ id, open: true, seats: [{ id: 'a' }, { id: 'b' }] });
    // The last game's answers to the same clue (a rematch in the same room) don't count as taken.
    session.remote = { code: 'ABCD', hostToken: 't', base: 'https://x', answers: { id: clue.id, seats: { a: { text: 'Doge', n: 3 } } } };
    expect(everyoneAnswerAsk(game, session)?.seats).toEqual([{ id: 'a' }, { id: 'b' }]);
    session.remote.answers = { id, seats: { b: { text: 'Shiba', n: 2 } } };
    expect(everyoneAnswerAsk(game, session)).toEqual({ id, open: true, seats: [{ id: 'a' }, { id: 'b', got: 2 }] });
    session.remote.answers.locked = true;
    expect(everyoneAnswerAsk(game, session)?.open).toBe(false);
    delete session.remote.answers.locked;
    session.revealed = true;
    expect(everyoneAnswerAsk(game, session)?.open).toBe(false);
    // Never the words.
    expect(JSON.stringify(everyoneAnswerAsk(game, session))).not.toContain('Shiba');
  });
});

describe('a ✍ clue’s multiple choices (everyoneAnswerAsk, phoneView)', () => {
  function setup() {
    const game = jeopardyGame();
    game.players = [
      { id: 'a', name: 'Ann', color: '#ff0000' },
      { id: 'b', name: 'Bo', color: '#00ff00' },
    ];
    const clue = (game.rounds[0] as BoardRound).categories[0].clues[0];
    clue.everyone = true;
    clue.choices = [
      { id: 'c1', text: 'Paris' },
      { id: 'c2', text: '' },
      { id: 'c3', text: 'Stockholm', right: true },
      { id: 'c4', text: ' Oslo ' },
    ];
    const session = newSession(game);
    openClue(session, { round: 0, cat: 0, row: 0 }, game);
    return { game, clue, session };
  }

  it('go along only with a room that shows them, only those with words, and never which one is right', () => {
    const { game, clue, session } = setup();
    expect(everyoneAnswerAsk(game, session)?.choices).toBeUndefined();
    const ask = everyoneAnswerAsk(game, session, { choices: true })!;
    expect(ask.choices).toEqual([
      { id: 'c1', text: 'Paris' },
      { id: 'c3', text: 'Stockholm' },
      { id: 'c4', text: 'Oslo' },
    ]);
    expect(JSON.stringify(ask)).not.toContain('right');
    // Fewer than two with words: the phones type.
    clue.choices = [{ id: 'c1', text: 'Paris', right: true }, { id: 'c2', text: ' ' }];
    expect(everyoneAnswerAsk(game, session, { choices: true })?.choices).toBeUndefined();
    // Kept on a clue without ✍: not asked at all.
    delete clue.everyone;
    expect(everyoneAnswerAsk(game, session, { choices: true })).toBeNull();
  });

  it('a phone gets them only for a seat in the ask', () => {
    const { game, session } = setup();
    const st = hostState(game, session, newBuzz(), 0, { answers: everyoneAnswerAsk(game, session, { choices: true }) });
    expect(phoneView(st, 'a').answer?.choices?.map((c) => c.text)).toEqual(['Paris', 'Stockholm', 'Oslo']);
    st.answers!.seats = st.answers!.seats.filter((x) => x.id !== 'b');
    expect(phoneView(st, 'b').answer).toEqual({ id: st.answers!.id, open: true, mine: false });
    // Its own pick, with its words.
    expect(phoneView(st, 'a', null, null, null, false, { text: 'Oslo', n: 1, pick: 'c4' }).answer).toMatchObject({ text: 'Oslo', pick: 'c4' });
  });
});

describe('the Final’s typed answers (finalAnswerAsk, and its question in hostState)', () => {
  /** Ann and Bo in the Final (Cy sits it out), wagers in; its question has a line viewers only see later. */
  function setup() {
    const game = jeopardyGame();
    game.players = [
      { id: 'a', name: 'Ann', color: '#ff0000' },
      { id: 'b', name: 'Bo', color: '#00ff00' },
      { id: 'c', name: 'Cy', color: '#0000ff' },
    ];
    const fi = game.rounds.findIndex((r) => r.mode === 'final');
    const round = game.rounds[fi] as FinalRound;
    round.category = '  US Presidents ';
    round.questionSlide = textSlide('He was the first');
    const later = newTextEl('LATER HINT');
    later.entrance = { type: 'fade', delay: 5, duration: 1 };
    round.questionSlide.elements.push(later);
    round.answerSlide = textSlide('Who is Washington?');
    const session = newSession(game);
    session.answerKey = 'k1234567';
    applyScore(session, game, ['a', 'b'], 500, 'x');
    goToRound(session, game, fi);
    session.intro = null;
    finalChoose(session, 'c', false);
    finalSetWager(session, 'a', 100);
    finalSetWager(session, 'b', 50);
    return { game, session, round, id: `final:${round.id}@k1234567` };
  }

  it('none on the wager screen, nor with typing switched off; open on the question, its players with what was taken', () => {
    const { game, session, round, id } = setup();
    expect(finalAnswerAsk(game, session)).toBeNull();
    finalNext(session, game);
    expect(finalAnswerAsk(game, session)).toEqual({ id, open: true, seats: [{ id: 'a' }, { id: 'b' }] });
    session.final!.answers = { b: { text: 'Washington', n: 2 } };
    expect(finalAnswerAsk(game, session)).toEqual({ id, open: true, seats: [{ id: 'a' }, { id: 'b', got: 2 }] });
    expect(JSON.stringify(finalAnswerAsk(game, session))).not.toContain('Washington');
    round.phoneAnswersOff = true;
    expect(finalAnswerAsk(game, session)).toBeNull();
  });

  it('its multiple choices go along with a room that shows them: those with words, never which is right, closed too', () => {
    const { game, session, round } = setup();
    round.choices = [
      { id: 'c1', text: 'Adams' },
      { id: 'c2', text: ' ' },
      { id: 'c3', text: 'Washington', right: true },
    ];
    finalNext(session, game);
    expect(finalAnswerAsk(game, session)?.choices).toBeUndefined();
    const ask = finalAnswerAsk(game, session, { choices: true })!;
    expect(ask.choices).toEqual([
      { id: 'c1', text: 'Adams' },
      { id: 'c3', text: 'Washington' },
    ]);
    expect(JSON.stringify(ask)).not.toContain('right');
    expect(phoneView(hostState(game, session, newBuzz(), 0, { answers: ask }), 'a').answer?.choices).toEqual(ask.choices);
    // (Each phone keeps its pick in sight once they lock.)
    session.final!.answers = {};
    finalNext(session, game);
    expect(finalAnswerAsk(game, session, { choices: true })).toMatchObject({ open: false, choices: ask.choices });
    // Fewer than two with words: the phones type.
    round.choices = [{ id: 'c1', text: 'Adams' }];
    expect(finalAnswerAsk(game, session, { choices: true })?.choices).toBeUndefined();
  });

  it('closed through the answer and the reveals; none there if the answers never began', () => {
    const { game, session, id } = setup();
    finalNext(session, game);
    finalNext(session, game);
    expect(finalAnswerAsk(game, session)).toBeNull();
    finalNext(session, game);
    expect(finalAnswerAsk(game, session)).toBeNull();
    session.final!.answers = { a: { text: 'Adams', n: 1 } };
    expect(finalAnswerAsk(game, session)).toEqual({ id, open: false, seats: [{ id: 'a', got: 1 }, { id: 'b' }] });
    session.finalStep = 'answer';
    expect(finalAnswerAsk(game, session)?.open).toBe(false);
    // Locked once the answer was up, even back on the question (an Undo).
    session.finalStep = 'question';
    session.final!.answersLocked = true;
    expect(finalAnswerAsk(game, session)?.open).toBe(false);
  });

  it('the phones get the Final’s question and caption only with its answers asked, never what viewers can’t see yet', () => {
    const { game, session, round } = setup();
    finalNext(session, game);
    expect(hostState(game, session, newBuzz(), 0).clue).toBeNull();
    const s = hostState(game, session, newBuzz(), 0, { answers: finalAnswerAsk(game, session) });
    expect(s.clue).toEqual({ text: 'He was the first', caption: `${finalName(round)} · US Presidents` });
    expect(phoneView(s, 'c').clue?.text).toBe('He was the first');
    const json = JSON.stringify(s);
    for (const leak of ['LATER', 'Washington']) expect(json).not.toContain(leak);
    round.category = '';
    expect(hostState(game, session, newBuzz(), 0, { answers: finalAnswerAsk(game, session) }).clue?.caption).toBe(finalName(round));
  });
});

describe('phoneStatus: a 🤝 partner clue (partner-clues spec §19.4, a room that takes no cards)', () => {
  /** Ann (a), Bob (b) and Cat (c); Movies $400 a partner clue with two cards, only words nobody else has on them. */
  function setup(game: PartnerGame = 'describe', teams = false) {
    const g = jeopardyGame();
    g.players = ['Ann', 'Bob', 'Cat'].map((name, i) => ({ id: name[0].toLowerCase(), name, color: ['#e6194b', '#3cb44b', '#4363d8'][i] }));
    if (teams) g.settings.buzzTeams = true;
    const r = g.rounds[0] as BoardRound;
    r.categories[0].title = 'Movies';
    const clue = r.categories[0].clues[1];
    clue.type = 'partner';
    setPartnerGame(clue, game);
    setSlideText(clue.questionSlide, 'Describe this movie');
    setSlideText(clue.answerSlide, 'Shrek');
    if (!clue.cards?.length) addCard(clue);
    setSlideText(clue.cards![0], 'CARD-WORDS-xyzzy');
    addCard(clue)!.elements.push({ ...newImageEl('m1'), name: 'secret-pic.png' });
    g.media.push({ id: 'm1', name: 'secret-pic.png', mime: 'image/png', size: 1, kind: 'image' });
    const session = newSession(g);
    session.currentPickerId = 'a';
    openClue(session, { round: 0, cat: 0, row: 1 }, g);
    return { g, session, s: session.partner! };
  }
  /** Nothing of a card in the phones' line or the rest of what the room is told. */
  const noCard = (g: ReturnType<typeof setup>['g'], session: ReturnType<typeof setup>['session']) => {
    const said = JSON.stringify([phoneStatus(g, session), hostState(g, session, buzzIdle(newBuzz(3)), 0, { status: phoneStatus(g, session) })]);
    expect(said).not.toMatch(/xyzzy|secret-pic|Shrek|cards/);
  };

  it('each moment: who needs a partner, the pair, who plays which part, how it went, then who played which', () => {
    const { g, session, s } = setup();
    const moments = [
      ['tile open', '🤝 Partner clue: Ann needs a partner…', ['a'], '🤝 Your partner clue! Spinning for your partner…'],
      ['paired', '🤝 Partner clue: Ann + Bob', ['a', 'b'], '🤝 You two play this one!'],
      ['question up', '🤝 Bob describes → Ann guesses', ['b'], '🗣 You’re describing!'],
      ['clock started', '🤝 Bob describes → Ann guesses', ['b'], '🗣 You’re describing!'],
      ['judged', '✔ Got it! Bob +$400 · Ann +$200'],
      ['revealed', '🤝 Bob described → Ann guessed'],
    ] as const;
    const steps: Record<string, () => void> = {
      paired: () => setPartner(session, s, 'b', 'wheel'),
      'question up': () => (s.stage = 'distribute'),
      'clock started': () => (s.stage = 'live'),
      judged: () => void judgePartner(session, g, true, 400),
      revealed: () => (session.revealed = true),
    };
    for (const [when, text, seats, seatsText] of moments) {
      steps[when]?.();
      expect(phoneStatus(g, session), when).toEqual(seats ? { text, seats, seatsText } : { text });
      noCard(g, session);
    }
  });

  it('✘ Missed says who lost points, and nothing about who lost none', () => {
    const { g, session, s } = setup();
    setPartner(session, s, 'b', 'wheel');
    s.stage = 'live';
    judgePartner(session, g, false, 400);
    expect(phoneStatus(g, session)).toEqual({ text: '✘ Missed: Ann −$200' });
    // An Undo takes the result away: the parts again.
    undo(session);
    expect(phoneStatus(g, session)?.text).toBe('🤝 Bob describes → Ann guesses');
    swapParts(s);
    judgePartner(session, g, false, 400);
    expect(phoneStatus(g, session)).toEqual({ text: '✘ Missed' });
  });

  it('in each game’s own words', () => {
    const lines: Record<PartnerGame, [string, string, string]> = {
      describe: ['Bob describes → Ann guesses', '🗣 You’re describing!', 'Bob described → Ann guessed'],
      draw: ['Bob draws → Ann guesses', '✏ You’re drawing!', 'Bob drew → Ann guessed'],
      act: ['Bob acts it out → Ann guesses', '🎭 You’re acting it out!', 'Bob acted it out → Ann guessed'],
      help: ['Bob helps → Ann answers', '🙋 You’re helping!', 'Bob helped → Ann answered'],
      split: ['Bob has half A → Ann has half B', '🧩 You’re sharing half A!', 'Bob had half A → Ann had half B'],
      custom: ['Bob gives the clues → Ann answers', '⚙ You’re giving the clues!', 'Bob gave the clues → Ann answered'],
    };
    expect(Object.keys(lines).sort()).toEqual(Object.keys(PARTNER_GAMES).sort());
    for (const game of Object.keys(lines) as PartnerGame[]) {
      const { g, session, s } = setup(game);
      setPartner(session, s, 'b', 'wheel');
      s.stage = 'distribute';
      expect(phoneStatus(g, session), game).toEqual({ text: `🤝 ${lines[game][0]}`, seats: ['b'], seatsText: lines[game][1] });
      session.revealed = true;
      expect(phoneStatus(g, session), game).toEqual({ text: `🤝 ${lines[game][2]}` });
      noCard(g, session);
    }
  });

  it('teams: each line is the team’s', () => {
    const { g, session, s } = setup('describe', true);
    expect(phoneStatus(g, session)?.seatsText).toBe('🤝 Your team’s partner clue! Spinning for your partner…');
    setPartner(session, s, 'b', 'wheel');
    expect(phoneStatus(g, session)?.seatsText).toBe('🤝 Your team plays this one!');
    s.stage = 'distribute';
    expect(phoneStatus(g, session)).toEqual({ text: '🤝 Bob describes → Ann guesses', seats: ['b'], seatsText: '🗣 Your team is describing!' });
    noCard(g, session);
  });

  it('Solo, no picker yet, and a picker who left', () => {
    const { g, session, s } = setup();
    s.includePicker = true;
    setPartner(session, s, 'a', 'wheel');
    expect(phoneStatus(g, session)).toEqual({ text: '🤝 Partner clue: Ann plays it alone', seats: ['a'], seatsText: '🤝 You play this one alone!' });
    s.stage = 'live';
    // (Solo: nobody describes, so no phone has a line of its own.)
    expect(phoneStatus(g, session)).toEqual({ text: '🤝 Ann · Solo!' });
    const other = setup();
    delete other.s.pickerId;
    expect(phoneStatus(other.g, other.session)).toEqual({ text: '🤝 Partner clue!' });
    other.s.pickerId = 'b';
    removePlayer(other.session, 'b');
    expect(phoneStatus(other.g, other.session)).toEqual({ text: '🤝 Partner clue!' });
  });

  it('long names are cut to fit (120 characters, an emoji being one)', () => {
    const { g, session, s } = setup();
    session.players[1].name = 'B'.repeat(200);
    setPartner(session, s, 'b', 'wheel');
    const st = phoneStatus(g, session)!;
    expect([...st.text]).toHaveLength(120);
    expect(st.text).toMatch(/^🤝 Partner clue: Ann \+ B+…$/);
  });
});

describe('one of the editor’s 🤫 Cards on the phones (sessionCards)', () => {
  /** Ann (a), Bob (b) and Cat (c); 🤫 Cards "NAME-wild" (a title, words and a picture from a file) and "NAME-tip". */
  function setup() {
    const g = jeopardyGame();
    g.players = ['Ann', 'Bob', 'Cat'].map((name, i) => ({ id: name[0].toLowerCase(), name, color: ['#e6194b', '#3cb44b', '#4363d8'][i] }));
    g.media.push({ id: 'm1', name: 'secret-pic.png', mime: 'image/png', size: 1000, kind: 'image' });
    const wild: SavedCard = {
      id: 'sc1',
      name: 'NAME-wild',
      until: 'host',
      background: {},
      elements: [
        { ...newTextEl('WILD-title', { x: 120, y: 40, w: 1600, h: 160 }), size: 120 },
        { ...newTextEl('WILD-plugh words', { x: 120, y: 260, w: 1600, h: 200 }), size: 60 },
        { ...newImageEl('m1'), y: 600 },
      ],
    };
    const tip: SavedCard = { id: 'sc2', name: 'NAME-tip', background: {}, elements: [] };
    setSlideText(tip, 'TIP-qwop');
    g.cards = [wild, tip];
    const session = newSession(g);
    return { g, session, wild, tip };
  }

  it('goes as phoneCard builds it (title, words, the picture), to exactly who it was sent to; its name never goes', () => {
    const { g, session, wild } = setup();
    const c = sendCard(g, session, { to: [{ seat: 'b' }], content: { saved: 'sc1' }, until: 'host' }, 1000)!;
    const pc = phoneCard(g, wild, { fileBytes: FILE_BYTES, files: {} });
    expect(pc.title).toBe('WILD-title');
    expect(sessionCards(g, session, { fileBytes: FILE_BYTES, files: {} })).toEqual([{ id: sentCardId(c), to: [{ seat: 'b' }], open: true, title: pc.title, text: pc.text, media: pc.media }]);
    // (No name at all on a card: not the card's, nor a file's.)
    expect(JSON.stringify(sessionCards(g, session, { fileBytes: FILE_BYTES, files: {} }))).not.toMatch(/"name"|NAME-|secret-pic/);
    const told = JSON.stringify(hostState(g, session, buzzIdle(newBuzz(3)), 0, { status: phoneStatus(g, session, false, { cards: true }), cards: hostCards(g, session, { fileBytes: FILE_BYTES, files: {} }) }));
    expect(told).toContain('WILD-plugh words');
    expect(told).not.toMatch(/NAME-|secret-pic|TIP-qwop/);
  });

  it('one edited in the editor since it went is left out; the others stay', () => {
    const { g, session, tip } = setup();
    sendCard(g, session, { to: [{ seat: 'a' }], content: { saved: 'sc1' }, until: 'host' }, 1000);
    const t = sendCard(g, session, { to: [{ seat: 'c' }], content: { saved: 'sc2' }, until: 'round' }, 2000)!;
    expect(sessionCards(g, session, { fileBytes: FILE_BYTES, files: {} })!.map((x) => x.id)).toHaveLength(2);
    setSlideText(tip, 'TIP-changed');
    const now = sessionCards(g, session, { fileBytes: FILE_BYTES, files: {} })!;
    expect(now.map((x) => x.id)).not.toContain(sentCardId(t));
    expect(JSON.stringify(now)).not.toMatch(/TIP-/);
  });

  it(`the room takes ${CARDS_MAX} at once: sent over and over, the next is refused`, () => {
    const { g, session } = setup();
    for (let i = 0; i < CARDS_MAX; i++) {
      expect(roomCardsFull(g, session)).toBe(false);
      expect(sendCard(g, session, { to: [{ seat: P[i % 3] }], content: { saved: i % 2 ? 'sc2' : 'sc1' }, until: 'host' }, 1000 + i, roomCardsFull(g, session))).not.toBeNull();
    }
    expect(roomCardCount(g, session)).toBe(CARDS_MAX);
    expect(roomCardsFull(g, session)).toBe(true);
    expect(sendCard(g, session, { to: [{ seat: 'a' }], content: { saved: 'sc1' }, until: 'host' }, 2000, roomCardsFull(g, session))).toBeNull();
    expect(session.cards).toHaveLength(CARDS_MAX);
  });

  /** Bob has the room's CARDS_MAX: Wild over and over, then the Tip; then ▶ Resume with my edits changes the Tip. */
  function fullThenEdited() {
    const { g, session } = setup();
    const toBob = (saved: string, at: number) => sendCard(g, session, { to: [{ seat: 'b' }], content: { saved }, until: 'host' }, at, roomCardsFull(g, session));
    for (let i = 0; i < CARDS_MAX - 1; i++) expect(toBob('sc1', 1000 + i)).not.toBeNull();
    const tip = toBob('sc2', 2000)!;
    const first = session.cards![0];
    const edited: typeof g = JSON.parse(JSON.stringify(g));
    setSlideText(edited.cards![1], 'TIP-changed');
    rebaseSession(session, g, edited);
    return { g, edited, session, tip, first };
  }

  it('one changed in the editor since it went keeps its place: no new card takes it, and ↻ Send again leaves no older one off', () => {
    const { edited, session, tip } = fullThenEdited();
    // (Off Bob's phone until ↻ Send again, but still out.)
    expect(sessionCards(edited, session, { fileBytes: FILE_BYTES, files: {} })!.map((x) => x.id)).not.toContain(sentCardId(tip));
    expect(roomCardCount(edited, session)).toBe(CARDS_MAX);
    expect(roomCardsFull(edited, session)).toBe(true);
    expect(sendCard(edited, session, { to: [{ seat: 'b' }], content: { saved: 'sc1' }, until: 'host' }, 3000, roomCardsFull(edited, session))).toBeNull();
    // ↻ Send again adds nothing: never refused, and every card out is on the phones.
    expect(roomCardsFull(edited, session, (t) => void sendCardAgain(edited, t, tip.id, 4000))).toBe(false);
    expect(sendCardAgain(edited, session, tip.id, 4000)).toBe(true);
    expect(roomCardCount(edited, session)).toBe(CARDS_MAX);
    expect(cardsLeftOff(edited, session)).toEqual([]);
    expect(hostCards(edited, session, { fileBytes: FILE_BYTES, files: {} })).toHaveLength(CARDS_MAX);
  });

  it('a ▶ Resume that undoes the change puts it back with no older card left off', () => {
    const { g, edited, session, first } = fullThenEdited();
    expect(roomCardsFull(edited, session)).toBe(true);
    rebaseSession(session, edited, g);
    expect(roomCardCount(g, session)).toBe(CARDS_MAX);
    expect(cardsLeftOff(g, session)).toEqual([]);
    expect(hostCards(g, session, { fileBytes: FILE_BYTES, files: {} })!.map((x) => x.id)).toContain(sentCardId(first));
  });
});
