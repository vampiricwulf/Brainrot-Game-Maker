import { describe, expect, it } from 'vitest';
import { newId, type Session } from '../lib/model';
import {
  applyScore, awardOpen, finalChoose, finalJudge, finalNext, goToRound, hasWager, logZero, newSession, score, tiedLeaders, undo, winnerKnown,
} from '../lib/session';
import { cuesAfter, MAX_CUES, type SoundCue } from '../lib/live';
import { finalNextStep, logged, revealStep, undoAction, redoAction } from '../lib/toolset';
import { jeopardyGame } from '../lib/testgame';
import { groupPops, plateCenter, plateScore, stopsTimer } from './flow';

function setup(players = 3) {
  const game = jeopardyGame();
  for (let i = 0; i < players; i++) game.players.push({ id: newId(), name: ['Ann', 'Bo', 'Cy', 'Di', 'Ed'][i], color: `#00000${i}` });
  const session = newSession(game);
  return { game, session, ids: session.players.map((p) => p.id) };
}

describe('the countdown', () => {
  it('stops for a right answer and for the answer going up, not for a wrong answer', () => {
    expect(stopsTimer('clue', 'right')).toBe(true);
    expect(stopsTimer('clue', 'reveal')).toBe(true);
    expect(stopsTimer('tiebreaker', 'right')).toBe(true);
    expect(stopsTimer('final', 'reveal')).toBe(true);
    expect(stopsTimer('clue', 'wrong')).toBe(false);
    // An adjustment on the board isn't an answer: the host's own countdown goes on.
    expect(stopsTimer('board', 'right')).toBe(false);
    expect(stopsTimer('rpg', 'right')).toBe(false);
  });
});

describe('score pops', () => {
  it('shows one pop for a group award, and one per player for a single award', () => {
    const { game, session, ids } = setup(3);
    const all = applyScore(session, game, ids, 200, 'x');
    expect(groupPops(all, session.players, '$', '#fc0')).toEqual([{ text: 'Everyone +$200', who: 'Everyone', amount: '+$200', color: '#fc0' }]);
    const two = applyScore(session, game, ids.slice(0, 2), 1000, 'x');
    expect(groupPops(two, session.players, '$', '#fc0')).toEqual([
      { text: `Ann & Bo +$${(1000).toLocaleString()}`, who: 'Ann & Bo', amount: `+$${(1000).toLocaleString()}`, color: '#fc0' },
    ]);
    const one = applyScore(session, game, [ids[2]], -400, 'x');
    expect(groupPops(one, session.players, '$', '#fc0')).toEqual([{ text: 'Cy −$400', who: 'Cy', amount: '−$400', color: '#000002', playerId: ids[2] }]);
  });

  it('names three players when not everyone scored, and splits a group whose amounts differ', () => {
    const { game, session, ids } = setup(5);
    const three = applyScore(session, game, ids.slice(0, 3), 200, 'x');
    expect(groupPops(three, session.players, '$', '#fc0').map((p) => p.text)).toEqual(['Ann, Bo & Cy +$200']);
    // No negative scores: a deduction stops at 0 for the player with less.
    game.settings.allowNegativeScores = false;
    applyScore(session, game, [ids[0]], 300, 'x');
    const ded = applyScore(session, game, ids.slice(0, 2), -500, 'x');
    expect(groupPops(ded, session.players, '$', '#fc0').map((p) => p.text)).toEqual(['Ann −$500', 'Bo −$200']);
  });

  it('sits a player’s pop over their plate, as the score bar lays them out', () => {
    // 3 players: 420px plates, centred.
    const w3 = 3 * 420 + 2 * 18;
    expect(plateCenter(3, 0)).toBe(24 + (1872 - w3) / 2 + 210);
    expect(plateCenter(3, 1)).toBe(960);
    // 8 players fill the width (narrower than 320px each).
    const p8 = (1872 - 7 * 18) / 8;
    expect(plateCenter(8, 0)).toBeCloseTo(24 + p8 / 2);
    expect(plateCenter(8, 7)).toBeCloseTo(1920 - 24 - p8 / 2);
    // Room kept for the join code at the right moves them left.
    expect(plateCenter(8, 7, 230)).toBeLessThan(plateCenter(8, 7));
  });

  it('a plate shows the whole score when it fits, else a short one (never cut in the middle)', () => {
    expect(plateScore(999_999_999, '$', 3)).toBe('$999,999,999');
    expect(plateScore(12_400, '$', 12)).toBe('$12,400');
    expect(plateScore(999_999_999, '$', 12)).toBe('$999.9M');
    expect(plateScore(-1_234_567_890, 'pts', 12)).toBe('−1.2B pts');
  });
});

describe('sound cues', () => {
  const cue = (n: string, cut = false): SoundCue => ({ media: 'builtin:right', nonce: n, ...(cut ? { cut } : {}) });

  it('lets short cues overlap, a few at most', () => {
    let playing: SoundCue[] = [];
    playing = cuesAfter(playing, cue('a'));
    playing = cuesAfter(playing, cue('b'));
    expect(playing.map((c) => c.nonce)).toEqual(['a', 'b']);
    // The same cue again (the live state sent twice) isn't a new one.
    expect(cuesAfter(playing, playing[1])).toBe(playing);
    for (const n of ['c', 'd']) playing = cuesAfter(playing, cue(n));
    expect(playing.map((c) => c.nonce)).toEqual(['b', 'c', 'd']);
    expect(playing.length).toBe(MAX_CUES);
  });

  it('stops the others for a cue that cuts in, and all of them when the sound is stopped', () => {
    const playing = [cue('think'), cue('x')];
    expect(cuesAfter(playing, cue('reveal', true)).map((c) => c.nonce)).toEqual(['reveal']);
    expect(cuesAfter(playing, null)).toEqual([]);
  });
});

describe('Final wagers', () => {
  function inFinal() {
    const t = setup(3);
    applyScore(t.session, t.game, t.ids, 500, 'x');
    goToRound(t.session, t.game, 1);
    return t;
  }

  it('goes on to the question as a step: Ctrl+Z goes back to the wagers, the wagers kept', () => {
    const { game, session, ids } = inFinal();
    const f = session.final!;
    for (const [i, id] of ids.entries()) logged(session, `wager ${i}`, () => (f.wagers[id] = 100 * (i + 1)));
    finalNextStep(session, game);
    expect(session.finalStep).toBe('question');
    const e = undoAction(session, game);
    expect(e?.text).toBe('Wagers locked, question shown');
    expect(session.finalStep).toBe('wagers');
    expect(ids.map((id) => f.wagers[id])).toEqual([100, 200, 300]);
    redoAction(session, game);
    expect(session.finalStep).toBe('question');
    // Each step on is its own: Ctrl+Z goes back one at a time, the wagers kept all the way.
    finalNextStep(session, game);
    finalNextStep(session, game);
    expect(session.finalStep).toBe('reveal');
    expect(undoAction(session, game)?.text).toBe('Player reveals started');
    expect(session.finalStep).toBe('answer');
    expect(undoAction(session, game)?.text).toBe('Final answer shown');
    expect(session.finalStep).toBe('question');
    undoAction(session, game);
    expect([session.finalStep, f.wagers[ids[2]]]).toEqual(['wagers', 300]);
  });

  it('shows and hides the answer (R) as steps', () => {
    const { game, session, ids } = inFinal();
    for (const id of ids) session.final!.wagers[id] = 0;
    finalNextStep(session, game);
    revealStep(session);
    expect(session.finalStep).toBe('answer');
    revealStep(session);
    expect(session.finalStep).toBe('question');
    expect(undoAction(session, game)?.text).toBe('Final answer hidden');
    expect(session.finalStep).toBe('answer');
    expect(undoAction(session, game)?.text).toBe('Final answer shown');
    expect(session.finalStep).toBe('question');
  });

  it('undoes a player sitting out, their place in the reveal order and all', () => {
    const t = setup(3);
    const { game, session, ids } = t;
    for (const [i, id] of ids.entries()) applyScore(session, game, [id], 300 - i * 100, 'x');
    goToRound(session, game, 1);
    const order = [...session.final!.order];
    logged(session, 'out', () => finalChoose(session, ids[1], false));
    logged(session, 'in', () => finalChoose(session, ids[1], true));
    // Back in its place (lowest score first), not last.
    expect(session.final!.order).toEqual(order);
    undoAction(session, game);
    expect([session.final!.players.includes(ids[1]), session.final!.chosen]).toEqual([false, { [ids[1]]: false }]);
    undoAction(session, game);
    expect([session.final!.order, session.final!.chosen]).toEqual([order, undefined]);
  });

  it('never takes a missing wager as 0: that player isn’t judged until it’s in', () => {
    const { game, session, ids } = inFinal();
    const f = session.final!;
    f.wagers[ids[0]] = 200;
    f.wagers[ids[1]] = 0;
    for (let i = 0; i < 3; i++) finalNext(session, game); // question, answer, reveal
    expect([hasWager(f, ids[0]), hasWager(f, ids[1]), hasWager(f, ids[2])]).toEqual([true, true, false]);
    expect(finalJudge(session, game, ids[2], true)).toBe(false);
    expect([f.results[ids[2]], score(session, ids[2])]).toEqual([undefined, 500]);
    expect(finalJudge(session, game, ids[1], true)).toBe(true);
    f.wagers[ids[2]] = 300;
    expect(finalJudge(session, game, ids[2], false)).toBe(true);
    expect(score(session, ids[2])).toBe(200);
  });

  it('keeps the award row out of the Final', () => {
    const { session } = inFinal();
    expect(awardOpen(session)).toBe(false);
  });
});

describe('Daily Double wagered at 0', () => {
  it('is logged as a 0 result, which Undo takes back', () => {
    const { session, ids } = setup(2);
    const events = logZero(session, [ids[0]], 'Daily Double', 'clue1', true);
    expect(events.map((e) => [e.delta, e.right])).toEqual([[0, true]]);
    expect(session.scoreLog.length).toBe(1);
    expect(score(session, ids[0])).toBe(0);
    expect(undo(session).length).toBe(1);
  });
});

describe('the winner fanfare', () => {
  function ended(tie: boolean): { session: Session; ids: string[] } {
    const { game, session, ids } = setup(3);
    applyScore(session, game, [ids[0]], 500, 'x');
    applyScore(session, game, [ids[1]], tie ? 500 : 300, 'x');
    session.phase = 'end';
    return { session, ids };
  }

  it('waits while a tie for first is open, and plays once it’s settled', () => {
    expect(winnerKnown(ended(false).session)).toBe(true);
    const { session, ids } = ended(true);
    expect(winnerKnown(session)).toBe(false);
    // A roll-off (or the tiebreaker clue) settles it…
    session.rollOffWinner = ids[1];
    expect([tiedLeaders(session).length, winnerKnown(session)]).toEqual([0, true]);
    // …or co-winners.
    session.rollOffWinner = undefined;
    session.coWinners = true;
    expect(winnerKnown(session)).toBe(true);
  });
});


