import { describe, expect, it } from 'vitest';
import { jeopardyGame } from './testgame';
import { migrateGame, newFinalRound, newGame, newId, newRound, textSlide, type BoardRound, type FinalRound, type Game } from './model';

const board = (g: Game, i: number = 0) => g.rounds[i] as BoardRound;
import { setRowCount, addCategory, removeCategory, clone } from './ops';
import {
  applyScore, answerShowing, backToBoard, ddCap, finalJudge, toggleReveal, finalNext, finalWagerCap, goToRound, introNext, randomizeDailyDoubles, tiedLeaders, newSession, openClue, redo, roundComplete, score, setScore, toggleEvent, undo,
  backToLastRound, finalAdvance, finalUnjudged, findClueRef, rebaseSession, removePlayer, restorePlayer, startIntro, stepOf, toggleStep,
  toggleUsed, usedTiles, describeStep, awardOpen, clueMarks, clueScored, places, clueName, standings, finalWagersOk, finalWagerProblems, finalChoose,
  finalWagerRefused, finalSetWager, finalWagerEditable, wagerFromPhone, finalShow, migrateSession, finalStepFix, wagerSentBy, forViewers,
  blankSlide, toolOnlyClue, finalBack, rosterChange, nameList,
} from './session';
import { newRpgRound } from './rpg';
import { applyAction } from './tools';

function setup(players = 3) {
  const game = jeopardyGame();
  for (let i = 0; i < players; i++) game.players.push({ id: newId(), name: `P${i + 1}`, color: `#00000${i}` });
  // These tests go by the TV rule: players with 0 or less sit out the Final.
  for (const r of game.rounds) if (r.mode === 'final') r.allowNonPositive = false;
  const session = newSession(game);
  const [a, b, c] = session.players.map((p) => p.id);
  return { game, session, a, b, c };
}

describe('scoring', () => {
  it('awards and deducts custom amounts to any subset of players', () => {
    const { game, session, a, b, c } = setup();
    applyScore(session, game, [a, b], 350, 'x');
    applyScore(session, game, [c], -125, 'x');
    applyScore(session, game, [], 400, 'nobody');
    expect([score(session, a), score(session, b), score(session, c)]).toEqual([350, 350, -125]);
  });

  it('knows how each player was marked on a clue (since it opened, undone marks left out)', () => {
    const { game, session, a, b, c } = setup();
    applyScore(session, game, [a], 400, 'old', 'q1');
    const since = Date.now() + 1;
    for (const e of session.scoreLog) e.ts = since - 10;
    applyScore(session, game, [a], -400, 'x', 'q1');
    applyScore(session, game, [b], 400, 'x', 'q1');
    applyScore(session, game, [b], -400, 'x', 'q1');
    applyScore(session, game, [c], 400, 'x', 'q1');
    undo(session);
    applyScore(session, game, [c], 400, 'x', 'other');
    for (const e of session.scoreLog) if (e.reason === 'x') e.ts = since;
    expect(clueMarks(session, 'q1', since)).toEqual({ [a]: { right: false, delta: -400 }, [b]: { right: false, delta: 0 } });
  });

  it('clamps deductions at 0 when negative scores are off', () => {
    const { game, session, a } = setup();
    game.settings.allowNegativeScores = false;
    applyScore(session, game, [a], 100, 'x');
    applyScore(session, game, [a], -400, 'x');
    expect(score(session, a)).toBe(0);
    expect(applyScore(session, game, [a], -400, 'x')).toHaveLength(0);
  });

  it('undoes and redoes in order, and a new change clears redo', () => {
    const { game, session, a } = setup();
    applyScore(session, game, [a], 100, 'x');
    applyScore(session, game, [a], 200, 'x');
    undo(session);
    expect(score(session, a)).toBe(100);
    undo(session);
    expect(score(session, a)).toBe(0);
    redo(session);
    expect(score(session, a)).toBe(100);
    applyScore(session, game, [a], 5, 'x');
    expect(redo(session)).toEqual([]);
    expect(score(session, a)).toBe(105);
  });

  it('can toggle one specific log entry', () => {
    const { game, session, a, b } = setup();
    const [ea] = applyScore(session, game, [a], 100, 'x');
    applyScore(session, game, [b], 300, 'x');
    toggleEvent(session, ea.id);
    expect(score(session, a)).toBe(0);
    expect(score(session, b)).toBe(300);
    toggleEvent(session, ea.id);
    expect(score(session, a)).toBe(100);
  });

  it('manual score edits are logged and undoable', () => {
    const { session, a } = setup();
    setScore(session, a, 1234);
    expect(score(session, a)).toBe(1234);
    undo(session);
    expect(score(session, a)).toBe(0);
  });
});

describe('flow', () => {
  it('marks clues used and detects round completion', () => {
    const { game, session } = setup();
    const round = board(game, 0);
    setRowCount(round, 1);
    while (round.categories.length > 2) removeCategory(round, 0);
    round.categories[1].clues[0].empty = true;
    expect(roundComplete(session, game)).toBe(false);
    openClue(session, { round: 0, cat: 0, row: 0 });
    backToBoard(session, game);
    expect(roundComplete(session, game)).toBe(true);
    game.rounds.splice(1); // no Final round
    goToRound(session, game, 1);
    expect(session.phase).toBe('end');
  });

  it('goes through Final Jeopardy with wagers and a per-player reveal', () => {
    const { game, session, a, b, c } = setup();
    applyScore(session, game, [a], 1000, 'x');
    applyScore(session, game, [b], 400, 'x');
    goToRound(session, game, 1);
    expect([session.phase, session.finalStep]).toEqual(['final', 'wagers']);
    // c has $0 and sits out; reveal order is lowest score first.
    expect(session.final!.players).toEqual([a, b]);
    expect(session.final!.order).toEqual([b, a]);
    expect(finalWagerCap(session, b)).toBe(400);
    session.final!.wagers[a] = 600;
    session.final!.wagers[b] = 400;
    finalNext(session, game); // question
    finalNext(session, game); // answer
    finalNext(session, game); // reveal
    expect(session.final!.current).toBe(b);
    finalJudge(session, game, b, true);
    finalJudge(session, game, a, false);
    expect([score(session, a), score(session, b)]).toEqual([400, 800]);
    // Re-judging replaces the earlier result instead of stacking.
    finalJudge(session, game, a, true);
    expect(score(session, a)).toBe(1600);
    expect(score(session, c)).toBe(0);
    finalNext(session, game);
    expect(session.phase).toBe('end');
  });

  it('caps Daily Double wagers TV-style', () => {
    const { game, session, a } = setup();
    expect(ddCap(session, game, a)).toBe(1000);
    applyScore(session, game, [a], 2500, 'x');
    expect(ddCap(session, game, a)).toBe(2500);
  });

  it('places Daily Doubles at most one per category, skipping empty tiles', () => {
    const { game } = setup();
    const round = board(game, 0);
    round.categories[0].clues.forEach((c) => (c.empty = true));
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    expect(randomizeDailyDoubles(round, 3, rand)).toBe(3);
    const dds = round.categories.map((c) => c.clues.filter((cl) => cl.type === 'dailyDouble').length);
    expect(dds[0]).toBe(0);
    expect(dds.every((n) => n <= 1)).toBe(true);
    expect(dds.reduce((x, y) => x + y)).toBe(3);
  });

  it('only adds the missing Daily Doubles when keeping the ones placed by hand', () => {
    const { game } = setup();
    const round = board(game, 0);
    const byHand = round.categories[1].clues[0];
    byHand.type = 'dailyDouble';
    expect(randomizeDailyDoubles(round, 3, () => 0.5, { keepExisting: true })).toBe(2);
    expect(byHand.type).toBe('dailyDouble');
    const dds = round.categories.map((c) => c.clues.filter((cl) => cl.type === 'dailyDouble').length);
    expect(dds.reduce((x, y) => x + y)).toBe(3);
    expect(dds[1]).toBe(1);
    // Nothing missing: nothing moves.
    const before = JSON.stringify(round);
    expect(randomizeDailyDoubles(round, 3, () => 0.5, { keepExisting: true })).toBe(0);
    expect(JSON.stringify(round)).toBe(before);
  });

  it('runs the round intro steps and detects tied leaders', () => {
    const { game, session, a, b } = setup();
    goToRound(session, game, 0);
    session.phase = 'clue';
    goToRound(session, game, 0);
    expect(session.intro?.stage).toBe('title');
    introNext(session, game);
    expect(session.intro?.stage).toBe('fill');
    introNext(session, game);
    for (let i = 0; i < board(game, 0).categories.length; i++) introNext(session, game);
    expect(session.intro).toBeNull();
    applyScore(session, game, [a, b], 500, 'x');
    expect(tiedLeaders(session).map((p) => p.id)).toEqual([a, b]);
  });
});

describe('reveal / hide', () => {
  it('toggles the answer off again after an accidental reveal', () => {
    const { game, session } = setup();
    openClue(session, { round: 0, cat: 0, row: 0 }, game);
    toggleReveal(session);
    expect(answerShowing(session)).toBe(true);
    toggleReveal(session);
    expect([answerShowing(session), session.phase]).toEqual([false, 'clue']);
  });

  it('hides the final answer by stepping back to the question', () => {
    const { game, session, a } = setup();
    applyScore(session, game, [a], 100, 'x');
    goToRound(session, game, 1);
    finalNext(session, game);
    expect(session.finalStep).toBe('question');
    toggleReveal(session);
    expect(session.finalStep).toBe('answer');
    toggleReveal(session);
    expect(session.finalStep).toBe('question');
  });

  it('names final score events after the renamed final round', () => {
    const { game, session, a } = setup();
    (game.rounds[1] as FinalRound).name = 'Final Brainrot';
    applyScore(session, game, [a], 100, 'x');
    goToRound(session, game, 1);
    session.final!.wagers[a] = 50;
    finalJudge(session, game, a, true);
    finalJudge(session, game, a, false);
    expect(score(session, a)).toBe(50);
    expect(session.scoreLog.filter((e) => !e.undone).at(-1)?.reason).toBe('Final Brainrot');
  });
});

describe('multi-round games', () => {
  it('plays through 3 rounds of different sizes, then Final', () => {
    const game = jeopardyGame();
    game.players.push({ id: 'a', name: 'A', color: '#111111' });
    const sizes: [number, number][] = [[6, 5], [4, 3], [8, 7]];
    game.rounds = [...sizes.map(([cats, rows], i) => newRound(`R${i + 1}`, cats, Array.from({ length: rows }, (_, k) => (k + 1) * 100))), newFinalRound()];
    const session = newSession(game);
    sizes.forEach(([cats, rows], i) => {
      expect(board(game, i).categories).toHaveLength(cats);
      expect(board(game, i).categories.every((c) => c.clues.length === rows)).toBe(true);
      board(game, i).categories.forEach((c, ci) =>
        c.clues.forEach((_, row) => {
          openClue(session, { round: i, cat: ci, row }, game);
          applyScore(session, game, ['a'], 1, 'x');
          backToBoard(session, game);
        }),
      );
      expect(roundComplete(session, game, i)).toBe(true);
      goToRound(session, game, i + 1);
    });
    expect(session.phase).toBe('final');
    expect(score(session, 'a')).toBe(6 * 5 + 4 * 3 + 8 * 7);
  });
});

describe('ops', () => {
  it('keeps clue counts in sync with row count', () => {
    const game = jeopardyGame();
    const round = board(game, 0);
    setRowCount(round, 7);
    addCategory(round);
    expect(round.values).toEqual([200, 400, 600, 800, 1000, 1200, 1400]);
    expect(round.categories.every((c) => c.clues.length === 7)).toBe(true);
    setRowCount(round, 3);
    expect(round.categories.every((c) => c.clues.length === 3)).toBe(true);
  });
});

describe('undo as one step', () => {
  it('undoes and redoes a whole multi-player award', () => {
    const { game, session, a, b, c } = setup();
    applyScore(session, game, [a], 50, 'earlier');
    applyScore(session, game, [a, b, c], 200, 'x');
    expect(undo(session).map((e) => e.playerId)).toEqual([a, b, c]);
    expect([score(session, a), score(session, b), score(session, c)]).toEqual([50, 0, 0]);
    // Back in the order they happened, as undo gave them.
    expect(redo(session).map((e) => e.playerId)).toEqual([a, b, c]);
    expect([score(session, a), score(session, b), score(session, c)]).toEqual([250, 200, 200]);
    // Two undos take back both steps; one redo brings back only the earlier one.
    undo(session);
    undo(session);
    expect(score(session, a)).toBe(0);
    expect(redo(session).map((e) => e.reason)).toEqual(['earlier']);
  });

  it('treats a swap as one step', () => {
    const { game, session, a, b } = setup();
    applyScore(session, game, [a], 300, 'x');
    applyAction(session, game, { kind: 'swapScores' }, [b], a, 'Wheel');
    expect([score(session, a), score(session, b)]).toEqual([0, 300]);
    undo(session);
    expect([score(session, a), score(session, b)]).toEqual([300, 0]);
  });

  it('skips events of removed players', () => {
    const { game, session, a, b } = setup();
    applyScore(session, game, [a], 100, 'x');
    applyScore(session, game, [b], 300, 'x');
    removePlayer(session, b);
    expect(undo(session).map((e) => e.playerId)).toEqual([a]);
    expect(score(session, a)).toBe(0);
    expect(undo(session)).toEqual([]);
  });

  it('describes an undone step with points, names and reason', () => {
    const { game, session, a, b } = setup();
    applyScore(session, game, [a, b], 200, 'Memes $200');
    expect(describeStep(session, undo(session), '$')).toBe('+$200 × 2 (P1 & P2) · Memes $200');
    applyScore(session, game, [a], -400, 'Wrong');
    removePlayer(session, a);
    expect(describeStep(session, session.scoreLog.slice(-1), '$')).toBe('−$400 (P1) · Wrong');
  });

  it('toggles a whole step from the log', () => {
    const { game, session, a, b } = setup();
    const [e] = applyScore(session, game, [a, b], 100, 'x');
    toggleStep(session, stepOf(e));
    expect([score(session, a), score(session, b)]).toEqual([0, 0]);
    toggleStep(session, stepOf(e));
    expect([score(session, a), score(session, b)]).toEqual([100, 100]);
  });
});

describe('players mid-game', () => {
  it('removes a player during Final cleanly, and restores their score', () => {
    const { game, session, a, b, c } = setup();
    applyScore(session, game, [a, b, c], 400, 'x');
    session.currentPickerId = c;
    goToRound(session, game, 1);
    session.final!.wagers[c] = 100;
    removePlayer(session, c);
    expect(session.players.map((p) => p.id)).toEqual([a, b]);
    expect(session.final!.players).not.toContain(c);
    expect(session.final!.order).not.toContain(c);
    expect(session.currentPickerId).toBeUndefined();
    expect(score(session, c)).toBe(400);
    restorePlayer(session, c);
    expect(session.players.map((p) => p.id)).toEqual([a, b, c]);
    expect(session.players[2]).not.toHaveProperty('inFinal');
    expect(session.removedPlayers).toEqual([]);
    expect(score(session, c)).toBe(400);
    // Back in the final round, wager and all.
    expect(session.final!.players).toContain(c);
    expect(session.final!.order).toContain(c);
    expect(session.final!.wagers[c]).toBe(100);
  });

  it('restores a player removed during the reveals at the end of the order, result kept', () => {
    const { game, session, a, b, c } = setup();
    applyScore(session, game, [a, b, c], 400, 'x');
    goToRound(session, game, 1);
    for (let i = 0; i < 3; i++) finalNext(session, game);
    const f = session.final!;
    const first = f.order[0];
    f.wagers[first] = 0;
    finalJudge(session, game, first, true);
    removePlayer(session, first);
    restorePlayer(session, first);
    expect(f.order[f.order.length - 1]).toBe(first);
    expect(f.results[first]).toBe('right');
  });

  it('leaves the final round alone when restoring a player who was never in it', () => {
    const { game, session, a, b, c } = setup();
    applyScore(session, game, [a, b], 400, 'x');
    goToRound(session, game, 1);
    expect(session.final!.players).toEqual([a, b]);
    removePlayer(session, c);
    restorePlayer(session, c);
    expect(session.final!.players).toEqual([a, b]);
  });
});

describe('the Players dialog in the history', () => {
  it('says what one change did', () => {
    const [ann, bob, cat] = [
      { id: 'a', name: 'Ann', color: '#f00', startScore: 0 },
      { id: 'b', name: 'Bob', color: '#0f0', startScore: 0 },
      { id: 'c', name: 'Cat', color: '#00f', startScore: 0 },
    ];
    const was = { players: [ann, bob] };
    expect(rosterChange(was, { players: [{ ...ann, name: 'Alice' }, bob] })).toBe('Renamed Ann to Alice');
    expect(rosterChange(was, { players: [ann, { ...bob, color: '#ff0' }] })).toBe('New color for Bob');
    expect(rosterChange(was, { players: [bob, ann] })).toBe('Swapped Bob and Ann');
    expect(rosterChange(was, { players: [ann, bob, cat] })).toBe('Added Cat');
    expect(rosterChange(was, { players: [bob], removed: [ann] })).toBe('Removed Ann');
    expect(rosterChange({ players: [bob], removed: [ann] }, { players: [bob, ann] })).toBe('Restored Ann');
    expect(rosterChange(was, { players: [{ ...ann, name: '' }, bob] })).toBe('Renamed Ann to a player');
    expect(rosterChange(was, was)).toBe('Changed the players');
  });
});

describe('host panel rules', () => {
  it('opens the award row everywhere but the Daily Double splash, a Final and the end screen', () => {
    const { game, session } = setup();
    expect(awardOpen(session)).toBe(true);
    const ref = { round: 0, cat: 0, row: 0 };
    board(game, 0).categories[0].clues[0].type = 'dailyDouble';
    openClue(session, ref, game);
    expect(awardOpen(session)).toBe(false);
    session.dd!.stage = 'question';
    expect(awardOpen(session)).toBe(true);
    session.phase = 'tiebreaker';
    expect(awardOpen(session)).toBe(true);
    session.phase = 'final';
    session.finalStep = 'wagers';
    expect(awardOpen(session)).toBe(false);
    session.finalStep = 'question';
    expect(awardOpen(session)).toBe(false);
    session.finalStep = 'reveal';
    expect(awardOpen(session)).toBe(false);
    session.phase = 'end';
    expect(awardOpen(session)).toBe(false);
  });

  it('knows when points were given for a clue', () => {
    const { game, session, a } = setup();
    const id = board(game, 0).categories[0].clues[0].id;
    expect(clueScored(session, id)).toBe(false);
    applyScore(session, game, [a], 200, 'x', id);
    expect(clueScored(session, id)).toBe(true);
    undo(session);
    expect(clueScored(session, id)).toBe(false);
  });

  it('gives tied players the same place', () => {
    const { game, session, a, b, c } = setup();
    applyScore(session, game, [a, b], 850, 'x');
    expect(places(session).map((r) => r.place)).toEqual([1, 1, 3]);
    applyScore(session, game, [c], 900, 'x');
    expect(places(session).map((r) => [r.player.id, r.place])).toEqual([[c, 1], [a, 2], [b, 2]]);
  });

  it('a tiebreaker winner who is no longer first shares their place again', () => {
    const { game, session, a, b, c } = setup();
    applyScore(session, game, [a, b], 1000, 'x');
    session.rollOffWinner = b;
    expect(places(session).map((r) => [r.player.id, r.place])).toEqual([[b, 1], [a, 2], [c, 3]]);
    // A score fixed later puts C ahead of both.
    applyScore(session, game, [c], 1200, 'x');
    expect(places(session).map((r) => [r.player.id, r.place])).toEqual([[c, 1], [a, 2], [b, 2]]);
  });

  it('names image-only categories for the host', () => {
    const { game } = setup();
    const cat = board(game, 0).categories[0];
    cat.title = '';
    cat.image = 'img1';
    expect(clueName(game, { round: 0, cat: 0, row: 1 })).toBe('🖼 Image category $400');
  });

  it('knows a wheel or dice tile with nothing to ask', () => {
    const { game } = setup();
    const clue = board(game, 0).categories[0].clues[0];
    expect(toolOnlyClue(clue)).toBe(false);
    clue.type = 'dice';
    expect(toolOnlyClue(clue)).toBe(true);
    clue.answerSlide.background.image = 'img1';
    expect(toolOnlyClue(clue)).toBe(false);
    clue.answerSlide.background.image = undefined;
    clue.questionSlide = textSlide('Roll, then answer this');
    expect([toolOnlyClue(clue), blankSlide(clue.questionSlide), blankSlide(clue.answerSlide)]).toEqual([false, false, true]);
  });

  it('writes tile values like every other amount the host sees', () => {
    const { game } = setup();
    board(game, 0).categories[0].title = 'Memes';
    expect(clueName(game, { round: 0, cat: 0, row: 4 })).toBe(`Memes $${(1000).toLocaleString()}`);
  });
});

describe('closing and reopening tiles', () => {
  it('can close a clue without using it, and put a used tile back', () => {
    const { game, session } = setup();
    const id = board(game, 0).categories[0].clues[0].id;
    openClue(session, { round: 0, cat: 0, row: 0 }, game);
    expect(backToBoard(session, game, { markUsed: false })).toBeNull();
    expect(session.used[id]).toBeUndefined();
    openClue(session, { round: 0, cat: 0, row: 0 }, game);
    expect(backToBoard(session, game)).toBe(id);
    expect([session.used[id], session.lastClosed]).toEqual([true, id]);
    expect(usedTiles(session, game).map((t) => t.id)).toEqual([id]);
    expect(toggleUsed(session, id)).toBe(false);
    expect([session.used[id], session.lastClosed]).toEqual([undefined, null]);
    expect(toggleUsed(session, id)).toBe(true);
    expect(findClueRef(game, id)).toEqual({ round: 0, cat: 0, row: 0 });
  });
});

describe('round navigation', () => {
  function twoRounds() {
    const s = setup();
    s.game.rounds.splice(1, 0, newRound('Double', 2, [400, 800]));
    startIntro(s.session, s.game);
    return s;
  }

  it('never replays an intro when going back or returning', () => {
    const { game, session } = twoRounds();
    expect(session.intro?.stage).toBe('title');
    goToRound(session, game, 1);
    expect(session.intro?.stage).toBe('title');
    goToRound(session, game, 0);
    expect(session.intro).toBeNull();
    goToRound(session, game, 1);
    expect(session.intro).toBeNull();
  });

  it('goes back from Final to the board and returns with the wagers kept', () => {
    const { game, session, a, b } = twoRounds();
    goToRound(session, game, 1);
    applyScore(session, game, [a, b], 500, 'x');
    goToRound(session, game, 2);
    session.final!.wagers[a] = 300;
    goToRound(session, game, 1); // the host's "◀ Back" from the Final: the round before it
    expect([session.phase, session.currentRound, session.intro]).toEqual(['board', 1, null]);
    expect(session.final!.wagers[a]).toBe(300);
    goToRound(session, game, 2);
    expect([session.phase, session.finalStep]).toEqual(['final', 'wagers']);
    expect(session.final!.wagers[a]).toBe(300);
    expect(session.final!.players).toEqual([a, b]);
  });
});

describe('final reveal with N', () => {
  it('shows wagers and moves the spotlight, but never ends the game', () => {
    const { game, session, a, b, c } = setup();
    applyScore(session, game, [a], 300, 'x');
    applyScore(session, game, [b], 200, 'x');
    applyScore(session, game, [c], 100, 'x');
    goToRound(session, game, 1);
    for (let i = 0; i < 3; i++) finalNext(session, game);
    const f = session.final!;
    for (const id of f.players) f.wagers[id] = 0;
    expect(f.current).toBe(c);
    expect(finalAdvance(session)).toBe('shown');
    expect(f.shown[c]).toBe(true);
    finalJudge(session, game, c, true);
    expect(finalAdvance(session)).toBe('next');
    expect(f.current).toBe(b);
    // Pressing on without judging skips ahead; the last player left waits to be judged.
    expect(finalAdvance(session)).toBe('shown');
    expect(finalAdvance(session)).toBe('next');
    expect(f.current).toBe(a);
    finalJudge(session, game, a, false);
    expect(finalUnjudged(session)).toEqual([b]);
    expect(finalAdvance(session)).toBe('next');
    expect(f.current).toBe(b);
    expect(finalAdvance(session)).toBe('waiting');
    finalJudge(session, game, b, true);
    expect(finalAdvance(session)).toBe('done');
    expect(session.phase).toBe('final');
  });

  it('goes back one player with Shift+N, their wager as it was', () => {
    const { game, session, a, b, c } = setup();
    applyScore(session, game, [a], 300, 'x');
    applyScore(session, game, [b], 200, 'x');
    applyScore(session, game, [c], 100, 'x');
    goToRound(session, game, 1);
    for (let i = 0; i < 3; i++) finalNext(session, game);
    const f = session.final!;
    expect(f.order).toEqual([c, b, a]);
    expect(finalBack(session)).toBe(false); // the first one has nobody before them
    finalAdvance(session);
    finalAdvance(session);
    expect(f.current).toBe(b);
    expect(finalBack(session)).toBe(true);
    expect([f.current, f.shown[c], f.shown[b]]).toEqual([c, true, undefined]);
  });

  it('goes back from the end screen to the reveals', () => {
    const { game, session, a } = setup();
    applyScore(session, game, [a], 300, 'x');
    goToRound(session, game, 1);
    for (let i = 0; i < 3; i++) finalNext(session, game);
    session.final!.wagers[a] = 0;
    finalJudge(session, game, a, true);
    finalNext(session, game);
    expect(session.phase).toBe('end');
    backToLastRound(session, game);
    expect([session.phase, session.finalStep, session.final?.results[a]]).toEqual(['final', 'reveal', 'right']);
  });

  it('keeps everyone in the reveals when going back, even players the Final took to $0', () => {
    const { game, session, a, b } = setup(2);
    applyScore(session, game, [a], 1000, 'x');
    applyScore(session, game, [b], 600, 'x');
    goToRound(session, game, 1);
    session.final!.wagers[a] = 1000;
    session.final!.wagers[b] = 0;
    for (let i = 0; i < 3; i++) finalNext(session, game);
    finalJudge(session, game, a, false);
    finalJudge(session, game, b, true);
    const { players, order, results } = structuredClone(session.final!);
    finalNext(session, game);
    expect([session.phase, score(session, a)]).toEqual(['end', 0]);
    backToLastRound(session, game);
    expect([session.finalStep, session.final!.players, session.final!.order, session.final!.results]).toEqual(['reveal', players, order, results]);
  });

  it('back from another round mid-reveals: the reveals again (not the wagers), every time', () => {
    const { game, session, a, b } = setup(2);
    applyScore(session, game, [a], 1000, 'x');
    applyScore(session, game, [b], 600, 'x');
    goToRound(session, game, 1);
    session.final!.wagers[a] = 1000;
    session.final!.wagers[b] = 0;
    for (let i = 0; i < 3; i++) finalNext(session, game);
    finalJudge(session, game, a, false);
    const { players, results } = structuredClone(session.final!);
    for (let trip = 0; trip < 2; trip++) {
      goToRound(session, game, 0);
      goToRound(session, game, 1);
      expect([session.finalStep, session.final!.players, session.final!.results]).toEqual(['reveal', players, results]);
    }
  });
});

describe('final wagers', () => {
  it('knows who is still missing a wager and who is over the max', () => {
    const { game, session, a, b } = setup();
    applyScore(session, game, [a], 1000, 'x');
    applyScore(session, game, [b], 400, 'x');
    goToRound(session, game, 1);
    session.final!.wagers[a] = 600;
    expect(finalWagerProblems(session)).toEqual({ missing: [b], over: [], whole: [] });
    expect(finalWagersOk(session)).toBe(false);
    session.final!.wagers[b] = 500;
    expect(finalWagerProblems(session)).toEqual({ missing: [], over: [b], whole: [] });
    expect([finalWagersOk(session), finalWagersOk(session, true)]).toEqual([false, true]);
    session.final!.wagers[b] = 0;
    expect(finalWagersOk(session)).toBe(true);
  });

  it('takes whole wagers only', () => {
    const { game, session, a, b } = setup();
    applyScore(session, game, [a, b], 1000, 'x');
    goToRound(session, game, 1);
    Object.assign(session.final!.wagers, { [a]: 100.5, [b]: 0 });
    expect(finalWagerProblems(session)).toEqual({ missing: [], over: [], whole: [a] });
    expect(finalWagersOk(session, true)).toBe(false);
    session.final!.wagers[a] = 100;
    expect(finalWagersOk(session)).toBe(true);
  });

  it('checks a wager typed during the reveals against the max, unless the limits are ignored', () => {
    const { game, session, a } = setup();
    applyScore(session, game, [a], 500, 'x');
    goToRound(session, game, 1);
    expect([500, 501, 2.5, -1].map((v) => finalWagerRefused(session, a, v))).toEqual(['', 'over', 'whole', 'whole']);
    expect(finalWagerRefused(session, a, 900, true)).toBe('');
  });

  it('keeps who the host sat out or let in when the Final is left and come back to', () => {
    const { game, session, a, b, c } = setup();
    applyScore(session, game, [a], 1000, 'x');
    applyScore(session, game, [b], 400, 'x');
    goToRound(session, game, 1);
    expect(session.final!.players).toEqual([a, b]);
    finalChoose(session, a, false);
    goToRound(session, game, 0);
    // c is new to the Final: they play now their score lets them.
    applyScore(session, game, [c], 200, 'x');
    goToRound(session, game, 1);
    expect(session.final!.players).toEqual([b, c]);
    expect(session.final!.order).toEqual([c, b]);
    // A player let in at $0 stays in too.
    applyScore(session, game, [c], -200, 'x');
    finalChoose(session, c, true);
    goToRound(session, game, 0);
    goToRound(session, game, 1);
    expect(session.final!.players).toEqual([b, c]);
  });

  it('a player ticked back in goes to their place in the reveal order', () => {
    const { game, session, a, b, c } = setup();
    applyScore(session, game, [a], 300, 'x');
    applyScore(session, game, [b], 200, 'x');
    applyScore(session, game, [c], 100, 'x');
    goToRound(session, game, 1);
    finalChoose(session, b, false);
    finalChoose(session, b, true);
    expect(session.final!.order).toEqual([c, b, a]);
  });

  it('goes straight on when nobody plays the Final', () => {
    const { game, session, a } = setup();
    applyScore(session, game, [a], 300, 'x');
    goToRound(session, game, 1);
    finalChoose(session, a, false);
    finalNext(session, game);
    expect(session.phase).toBe(game.rounds.length > 2 ? 'board' : 'end');
  });

  it('lets players with 0 or less play a Final that allows it (the default for a new one)', () => {
    const { game, session, a, b, c } = setup();
    for (const r of game.rounds) if (r.mode === 'final') r.allowNonPositive = newFinalRound().allowNonPositive;
    applyScore(session, game, [a], 1000, 'x');
    applyScore(session, game, [b], -200, 'x');
    goToRound(session, game, 1);
    expect([...session.final!.players].sort()).toEqual([a, b, c].sort());
  });

  it('fills in a wager of 0 for players who have nothing to wager', () => {
    const { game, session, a, b, c } = setup();
    for (const r of game.rounds) if (r.mode === 'final') r.allowNonPositive = true;
    applyScore(session, game, [a], 1000, 'x');
    applyScore(session, game, [b], -200, 'x');
    goToRound(session, game, 1);
    expect(session.final!.wagers).toEqual({ [b]: 0, [c]: 0 });
    expect(finalWagerProblems(session)).toEqual({ missing: [a], over: [], whole: [] });
    session.final!.wagers[a] = 1000;
    expect(finalWagersOk(session)).toBe(true);
    // Ignoring the limits, the host can still type more for them.
    session.final!.wagers[c] = 300;
    expect([finalWagersOk(session), finalWagersOk(session, true)]).toEqual([false, true]);
  });

  it('leaves a wager that is already in (typed before going back to the round before)', () => {
    const { game, session, a, b } = setup();
    for (const r of game.rounds) if (r.mode === 'final') r.allowNonPositive = true;
    applyScore(session, game, [a], 1000, 'x');
    goToRound(session, game, 1);
    session.final!.wagers[b] = 50;
    finalNext(session, game);
    expect(session.final!.wagers[b]).toBe(50);
  });

  it('drops a filled-in 0 when the player has something to wager after going back a round; keeps who sent a wager', () => {
    const { game, session, a, b, c } = setup();
    for (const r of game.rounds) if (r.mode === 'final') r.allowNonPositive = true;
    applyScore(session, game, [a], 1000, 'x');
    goToRound(session, game, 1);
    expect(session.final!.wagers[b]).toBe(0);
    finalSetWager(session, c, 0);
    finalSetWager(session, a, 300, 'phone', 'Al');
    // Back to the round before: b gets points, then the Final again.
    goToRound(session, game, 0);
    applyScore(session, game, [b], 400, 'x');
    goToRound(session, game, 1);
    expect(session.final!.wagers[b]).toBeUndefined();
    // (A 0 the host typed stays; so does who on the team sent theirs.)
    expect(session.final!.wagers[c]).toBe(0);
    expect(wagerSentBy(session.final, a)).toBe('Al');
  });

  it('takes the wagers as soon as the Final starts: no step before them', () => {
    const { game, session, a, b } = setup();
    applyScore(session, game, [a, b], 500, 'x');
    goToRound(session, game, 1);
    expect(session.finalStep).toBe('wagers');
    Object.assign(session.final!.wagers, { [a]: 100, [b]: 200 });
    finalNext(session, game);
    expect(session.finalStep).toBe('question');
  });

  it('fills in 0 for a player at $0 ticked in on the wager screen', () => {
    const { game, session, a, c } = setup();
    applyScore(session, game, [a], 500, 'x');
    goToRound(session, game, 1);
    expect(session.final!.players).toEqual([a]);
    finalChoose(session, c, true);
    expect(session.final!.wagers[c]).toBe(0);
  });

  it('reads a session saved on the old category step as the wager screen', () => {
    const { game, session, a, c } = setup();
    for (const r of game.rounds) if (r.mode === 'final') r.allowNonPositive = true;
    applyScore(session, game, [a], 500, 'x');
    goToRound(session, game, 1);
    session.final!.wagers = {};
    (session as { finalStep?: string }).finalStep = 'category';
    migrateSession(session, game);
    expect([session.finalStep, session.final!.wagers[c]]).toEqual(['wagers', 0]);
    // An undo that puts the old step back: N goes on from the wager screen, never into a step that's gone.
    (session as { finalStep?: string }).finalStep = 'category';
    session.final!.wagers[a] = 100;
    finalNext(session, game);
    expect(session.finalStep).toBe('question');
    (session as { finalStep?: string }).finalStep = 'category';
    finalStepFix(session);
    expect(session.finalStep).toBe('wagers');
  });

  it('marks a wager sent from a phone, and the host’s change makes it the host’s', () => {
    const { game, session, a, b } = setup();
    applyScore(session, game, [a, b], 500, 'x');
    goToRound(session, game, 1);
    finalSetWager(session, a, 300, 'phone');
    expect([session.final!.wagers[a], wagerFromPhone(session.final, a), wagerFromPhone(session.final, b)]).toEqual([300, true, false]);
    expect(finalWagerEditable(session, a)).toBe(true);
    finalSetWager(session, a, 250);
    expect([session.final!.wagers[a], wagerFromPhone(session.final, a)]).toEqual([250, false]);
    finalSetWager(session, b, undefined);
    expect(b in session.final!.wagers).toBe(false);
  });

  it('teams: says who sent a wager from their phone, until the host changes it', () => {
    const { game, session, a } = setup();
    applyScore(session, game, [a], 500, 'x');
    goToRound(session, game, 1);
    finalSetWager(session, a, 300, 'phone', 'Al');
    expect(wagerSentBy(session.final, a)).toBe('Al');
    finalSetWager(session, a, 200, 'phone');
    expect(wagerSentBy(session.final, a)).toBe('');
    finalSetWager(session, a, 250, 'phone', 'Al');
    finalSetWager(session, a, 250);
    expect([wagerSentBy(session.final, a), wagerFromPhone(session.final, a)]).toEqual(['', false]);
  });

  it('viewers get no wager that is not on screen yet', () => {
    const { game, session, a, b, c } = setup();
    applyScore(session, game, [a, b, c], 500, 'x');
    goToRound(session, game, 1);
    finalSetWager(session, a, 300, 'phone', 'Al');
    finalSetWager(session, b, 222);
    const v = forViewers(session);
    // In (a ✔ on the plate) but not how much.
    expect(v.final!.wagers).toEqual({ [a]: 0, [b]: 0 });
    expect(v.final!.wagerFrom).toBeUndefined();
    expect(v.final!.wagerBy).toBeUndefined();
    expect(session.final!.wagers[a]).toBe(300);
    finalNext(session, game);
    finalNext(session, game);
    finalNext(session, game);
    finalShow(session, a);
    expect(forViewers(session).final!.wagers).toEqual({ [a]: 300, [b]: 0 });
    // A Daily Double's wager: not the host's box, not the wager until it's shown.
    const dd = forViewers({ dd: { stage: 'question' as const, playerId: a, wager: 900, draft: 900, draftFrom: 'phone' as const, draftBy: 'Al' } }).dd;
    expect(dd).toEqual({ stage: 'question', playerId: a });
    expect(forViewers({ dd: { stage: 'question' as const, playerId: a, wager: 900, shown: true } }).dd).toEqual({ stage: 'question', playerId: a, wager: 900, shown: true });
  });

  it('keeps a wager editable until it is shown or judged', () => {
    const { game, session, a, b } = setup();
    applyScore(session, game, [a, b], 500, 'x');
    goToRound(session, game, 1);
    Object.assign(session.final!.wagers, { [a]: 100, [b]: 200 });
    finalNext(session, game); // question
    expect(finalWagerEditable(session, a)).toBe(false);
    finalNext(session, game); // answer
    finalNext(session, game); // reveals
    expect([finalWagerEditable(session, a), finalWagerEditable(session, b)]).toEqual([true, true]);
    finalShow(session, a);
    finalJudge(session, game, b, true);
    expect([finalWagerEditable(session, a), finalWagerEditable(session, b)]).toEqual([false, false]);
  });

  it('a player shown in the reveals with no wager yet (put back in late) can still have one typed', () => {
    const { game, session, a, b } = setup();
    applyScore(session, game, [a, b], 500, 'x');
    goToRound(session, game, 1);
    session.final!.wagers[b] = 200;
    for (let i = 0; i < 3; i++) finalNext(session, game);
    finalShow(session, a);
    expect(finalWagerEditable(session, a)).toBe(true);
    finalSetWager(session, a, 100);
    expect(finalWagerEditable(session, a)).toBe(false);
  });

  it('carries the old game setting over to each Final round', () => {
    const old = jeopardyGame();
    for (const r of old.rounds) if (r.mode === 'final') delete r.allowNonPositive;
    (old.settings as unknown as Record<string, unknown>).finalAllowNonPositive = true;
    const g = migrateGame(JSON.parse(JSON.stringify(old)));
    expect(g.rounds.filter((r) => r.mode === 'final').map((r) => (r as FinalRound).allowNonPositive)).toEqual([true]);
    expect('finalAllowNonPositive' in g.settings).toBe(false);
    delete (old.settings as unknown as Record<string, unknown>).finalAllowNonPositive;
    expect((migrateGame(JSON.parse(JSON.stringify(old))).rounds.find((r) => r.mode === 'final') as FinalRound).allowNonPositive).toBe(false);
  });
});

describe('undoing a final judgment', () => {
  function judged() {
    const { game, session, a } = setup(1);
    applyScore(session, game, [a], 500, 'x');
    goToRound(session, game, 1);
    for (let i = 0; i < 3; i++) finalNext(session, game);
    session.final!.wagers[a] = 300;
    return { game, session, a, f: session.final! };
  }

  it('takes the result off screen with its points, and Redo puts both back', () => {
    const { game, session, a, f } = judged();
    finalJudge(session, game, a, true);
    expect([score(session, a), f.results[a]]).toEqual([800, 'right']);
    undo(session);
    expect([score(session, a), f.results[a]]).toEqual([500, undefined]);
    expect(finalUnjudged(session)).toEqual([a]);
    redo(session);
    expect([score(session, a), f.results[a]]).toEqual([800, 'right']);
  });

  it('goes back to the earlier judgment after a re-judge, one step at a time', () => {
    const { game, session, a, f } = judged();
    finalJudge(session, game, a, true);
    finalJudge(session, game, a, false);
    expect([score(session, a), f.results[a]]).toEqual([200, 'wrong']);
    undo(session);
    expect([score(session, a), f.results[a]]).toEqual([800, 'right']);
    undo(session);
    expect([score(session, a), f.results[a]]).toEqual([500, undefined]);
    redo(session);
    redo(session);
    expect([score(session, a), f.results[a]]).toEqual([200, 'wrong']);
  });

  it('keeps one judgment per player when steps are toggled in the log', () => {
    const { game, session, a, f } = judged();
    finalJudge(session, game, a, true);
    const right = session.scoreLog.at(-1)!;
    finalJudge(session, game, a, false);
    const wrong = session.scoreLog.at(-1)!;
    // Restoring the first judgment takes the re-judge away.
    toggleStep(session, stepOf(right));
    expect([score(session, a), f.results[a], wrong.undone]).toEqual([800, 'right', true]);
    toggleStep(session, stepOf(right));
    expect([score(session, a), f.results[a]]).toEqual([500, undefined]);
    toggleEvent(session, wrong.id);
    expect([score(session, a), f.results[a]]).toEqual([200, 'wrong']);
  });

  it('follows the Final it belongs to after the game moved on', () => {
    const { game, session, a, f } = judged();
    finalJudge(session, game, a, false);
    finalNext(session, game);
    expect(session.phase).toBe('end');
    undo(session);
    expect([score(session, a), session.finals![f.roundId!].state.results[a]]).toEqual([500, undefined]);
  });

  it('undoes a judgment of a 0 wager too (a 0-point step that says right or wrong)', () => {
    const { game, session, a, f } = judged();
    f.wagers[a] = 0;
    finalJudge(session, game, a, true);
    const e = session.scoreLog.at(-1)!;
    expect([e.delta, e.right, describeStep(session, [e], '$')]).toEqual([0, true, '$0 (P1) · Final Jeopardy!']);
    expect([score(session, a), f.results[a]]).toEqual([500, 'right']);
    // A re-judge replaces it, and undoing that brings the first judgment back.
    finalJudge(session, game, a, false);
    expect(f.results[a]).toBe('wrong');
    undo(session);
    expect([score(session, a), f.results[a]]).toEqual([500, 'right']);
    undo(session);
    expect([score(session, a), f.results[a]]).toEqual([500, undefined]);
    redo(session);
    expect(f.results[a]).toBe('right');
  });

  it('logs a wrong answer that costs nothing (no points left to lose, negative scores off)', () => {
    const { game, session, a, f } = judged();
    game.settings.allowNegativeScores = false;
    setScore(session, a, 0);
    finalJudge(session, game, a, false);
    expect([score(session, a), f.results[a], session.scoreLog.at(-1)!.delta]).toEqual([0, 'wrong', 0]);
    undo(session);
    expect(f.results[a]).toBeUndefined();
  });
});

describe('resume with edits', () => {
  it('keeps used tiles and scores, and finds the open clue again by id', () => {
    const { game, session, a } = setup();
    const played = clone(game);
    openClue(session, { round: 0, cat: 1, row: 2 }, played);
    applyScore(session, game, [a], 600, 'x');
    const openId = board(played, 0).categories[1].clues[2].id;
    const edited = clone(played);
    const [moved] = board(edited, 0).categories.splice(1, 1);
    board(edited, 0).categories.push(moved);
    rebaseSession(session, played, edited);
    expect(session.currentClue).toEqual(findClueRef(edited, openId));
    expect(score(session, a)).toBe(600);
    const moreEdits = clone(edited);
    board(moreEdits, 0).categories.pop();
    rebaseSession(session, edited, moreEdits);
    expect([session.currentClue, session.phase]).toEqual([null, 'board']);
  });

  it('follows rounds by id when rounds are deleted or reordered', () => {
    const { game, session } = setup();
    game.rounds.splice(1, 0, newRound('Double', 2, [400, 800]), newRound('Triple', 2, [600, 1200]));
    const played = clone(game);
    session.introducedRounds = [0, 1];
    goToRound(session, played, 1);
    openClue(session, { round: 1, cat: 1, row: 0 }, played);
    const openId = board(played, 1).categories[1].clues[0].id;
    // Round 1 deleted: "Double" is now round 0.
    const edited = clone(played);
    edited.rounds.splice(0, 1);
    rebaseSession(session, played, edited);
    expect(session.currentRound).toBe(0);
    expect(session.currentClue).toEqual({ round: 0, cat: 1, row: 0 });
    expect(getClueId(edited, session.currentClue!)).toBe(openId);
    expect(session.introducedRounds).toEqual([0]);
    // On the board (no clue open), the round is still followed by id.
    backToBoard(session, edited);
    const reordered = clone(edited);
    reordered.rounds.reverse();
    rebaseSession(session, edited, reordered);
    expect(reordered.rounds[session.currentRound].name).toBe('Double');
  });
});

describe('resume with edits after deleting the round being played', () => {
  it('goes to the round now in its place (no intro), or the end with no rounds left', () => {
    const { game, session } = setup();
    goToRound(session, game, 1);
    expect(session.phase).toBe('final');
    // The Final was deleted: the board takes its place, straight to the board.
    const edited = clone(game);
    edited.rounds.splice(1, 1);
    rebaseSession(session, game, edited);
    expect([session.currentRound, session.phase, session.intro ?? null]).toEqual([0, 'board', null]);
    // The board is now an RPG round.
    const rpg = clone(edited);
    rpg.rounds = [newRpgRound(rpg)];
    rebaseSession(session, edited, rpg);
    expect([session.currentRound, session.phase]).toEqual([0, 'rpg']);
    const none = clone(rpg);
    none.rounds = [];
    rebaseSession(session, rpg, none);
    expect(session.phase).toBe('end');
  });

  it('enters a Final that took the place of a deleted board round', () => {
    const { game, session } = setup();
    startIntro(session, game);
    const edited = clone(game);
    edited.rounds.splice(0, 1);
    rebaseSession(session, game, edited);
    expect([session.currentRound, session.phase, session.finalStep]).toEqual([0, 'final', 'wagers']);
  });

  it('drops the deleted board’s intro when another board takes its place', () => {
    const { game, session } = setup();
    game.rounds.splice(1, 0, newRound('Double Jeopardy!'));
    startIntro(session, game);
    introNext(session, game);
    const edited = clone(game);
    edited.rounds.splice(0, 1);
    rebaseSession(session, game, edited);
    expect([session.currentRound, session.phase, session.intro ?? null]).toEqual([0, 'board', null]);
  });
});

function getClueId(game: ReturnType<typeof newGame>, ref: { round: number; cat: number; row: number }): string {
  return board(game, ref.round).categories[ref.cat].clues[ref.row].id;
}

describe('tiebreaker roll-off', () => {
  it('makes its winner the winner: first alone, the others they tied with share second', () => {
    const game = jeopardyGame();
    game.players = [
      { id: 'a', name: 'Ann', color: '#e6194b' },
      { id: 'b', name: 'Bob', color: '#3cb44b' },
      { id: 'c', name: 'Cat', color: '#4363d8' },
    ];
    const session = newSession(game);
    setScore(session, 'a', 500);
    setScore(session, 'b', 500);
    setScore(session, 'c', 100);
    expect(tiedLeaders(session).map((p) => p.id)).toEqual(['a', 'b']);
    session.rollOffWinner = 'b';
    expect(tiedLeaders(session)).toEqual([]);
    expect(standings(session).map((r) => r.player.id)).toEqual(['b', 'a', 'c']);
    expect(places(session).map((r) => [r.player.id, r.place])).toEqual([
      ['b', 1],
      ['a', 2],
      ['c', 3],
    ]);
    // Scores changed so the winner isn't tied for first any more: the roll-off no longer counts.
    setScore(session, 'b', 400);
    expect(standings(session)[0].player.id).toBe('a');
  });
});

describe('names', () => {
  it('lists players as one says them ("Ann, Bob & Cy")', () => {
    expect([[], ['Ann'], ['Ann', 'Bob'], ['Ann', 'Bob', 'Cy'], ['Ann', 'Bob', 'Cy', 'Dee']].map(nameList)).toEqual(['', 'Ann', 'Ann & Bob', 'Ann, Bob & Cy', 'Ann, Bob, Cy & Dee']);
  });

  it('names a group award that way in the history', () => {
    const { game, session, a, b, c } = setup();
    applyScore(session, game, [a, b, c], 200, 'Memes $200');
    expect(describeStep(session, session.scoreLog, '$')).toBe('+$200 × 3 (P1, P2 & P3) · Memes $200');
  });
});

describe('an award that made its player the picker', () => {
  it('gives the picker back when undone, and takes it again when redone', () => {
    const { game, session, a, b } = setup();
    session.currentPickerId = a;
    const events = applyScore(session, game, [b], 200, 'x');
    events[0].picker = { was: a, now: b };
    session.currentPickerId = b;
    undo(session);
    expect(session.currentPickerId).toBe(a);
    redo(session);
    expect(session.currentPickerId).toBe(b);
  });
});
