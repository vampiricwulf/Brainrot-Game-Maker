import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jeopardyGame } from './testgame';
import { newRound, type Game, type Session, type Shop } from './model';
import { applyScore, finalJudge, goToRound, newSession, redo, removePlayer, toggleStep, undo } from './session';
import { addStat, buy, logged, newStatField, redoAction, redoFrom, SCORE_CURRENCY, undoAction, type Undone } from './toolset';
import { nextUndo, stillUndone, timelineRows, undoOrder } from './timeline';

function setup(): { game: Game; session: Session } {
  const game = jeopardyGame();
  game.rounds.splice(1, 0, newRound('Double Jeopardy!'));
  game.players = [
    { id: 'a', name: 'Ann', color: '#e6194b' },
    { id: 'b', name: 'Bob', color: '#3cb44b' },
  ];
  game.statFields = [{ ...newStatField('HP'), id: 'hp', start: 10 }];
  game.items = [{ id: 'sword', name: 'Sword', stackable: false, price: 300 }];
  return { game, session: newSession(game) };
}

const shop: Shop = { id: 's', name: 'Market', currency: SCORE_CURRENCY, stock: [{ item: 'sword', price: 300, qty: null }] };

/** Ctrl+Z as Play does it. */
function undoOnce(session: Session, game: Game, undone: Undone[] = []): boolean {
  const next = nextUndo(session);
  if (!next) return false;
  if (next.log === 'action') undoAction(session, game);
  else undo(session);
  undone.push({ log: next.log, id: next.id });
  return true;
}

/** Ctrl+Shift+Z as Play does it. */
function redoOnce(session: Session, game: Game, undone: Undone[]): boolean {
  if (redoFrom(session, undone) === 'action' && redoAction(session, game)) return true;
  return redo(session).length > 0;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});
afterEach(() => vi.useRealTimers());
const later = () => vi.advanceTimersByTime(1000);

/** A show: points in round 1, a purchase paid in points, a roll, a step and more points in round 2. */
function play() {
  const { game, session } = setup();
  const hp = game.statFields![0];
  applyScore(session, game, ['a', 'b'], 400, 'Jeopardy! · Memes $400');
  later();
  applyScore(session, game, ['b'], 500, 'Adjustment');
  later();
  logged(session, 'Ann buys a Sword', () => buy(game, session, shop, 'a', 'sword'));
  later();
  session.rollLog = [{ id: 'r1', ts: Date.now(), source: 'dice', name: '2d6', result: 'Total: 7' }];
  later();
  session.currentRound = 1;
  logged(session, 'Bob hurt', () => addStat(game, session, 'b', hp, -2));
  later();
  applyScore(session, game, ['a'], -200, 'Double Jeopardy! · Memes $200');
  return { game, session };
}

describe('the play history', () => {
  it('lists score changes, steps and rolls newest first, a purchase once, each with its round', () => {
    const { game, session } = play();
    const rows = timelineRows(session, game, '$');
    expect(rows.map((r) => [r.kind, r.text, r.round])).toEqual([
      ['score', '−$200 (Ann) · Double Jeopardy! · Memes $200', 1],
      ['action', 'Bob hurt', 1],
      ['roll', '2d6: Total: 7', undefined],
      ['action', 'Ann buys a Sword', 0],
      ['score', '+$500 (Bob) · Adjustment', 0],
      ['score', '+$400 × 2 (Ann, Bob) · Jeopardy! · Memes $400', 0],
    ]);
    // Back to here: how many Undos each row is behind (the roll marks a moment).
    expect(rows.map((r) => r.steps)).toEqual([0, 1, 2, 2, 3, 4]);
  });

  it('puts undone steps on top, and a change undone in the Scores tab stays where it was', () => {
    const { game, session } = play();
    undoOnce(session, game);
    undoOnce(session, game);
    toggleStep(session, session.scoreLog[0].batchId!);
    const rows = timelineRows(session, game, '$');
    expect(rows.map((r) => [r.text, r.kind === 'roll' ? '' : r.state, r.steps])).toEqual([
      ['−$200 (Ann) · Double Jeopardy! · Memes $200', 'redo', 2],
      ['Bob hurt', 'redo', 1],
      ['2d6: Total: 7', '', 0],
      ['Ann buys a Sword', 'done', 0],
      ['+$500 (Bob) · Adjustment', 'done', 1],
      ['+$400 × 2 (Ann, Bob) · Jeopardy! · Memes $400', 'off', 2],
    ]);
  });

  it('goes back exactly as far as its count says, and forward again the same way', () => {
    const { game, session } = play();
    const undone: Undone[] = [];
    const target = timelineRows(session, game, '$').find((r) => r.text === 'Ann buys a Sword')!;
    for (let i = 0; i < target.steps; i++) undoOnce(session, game, undone);
    // The purchase is next: everything newer is undone, it still counts.
    expect(nextUndo(session)).toMatchObject({ log: 'action', id: target.id });
    expect(timelineRows(session, game, '$').filter((r) => r.kind !== 'roll' && r.state === 'redo')).toHaveLength(2);
    const top = timelineRows(session, game, '$')[0];
    for (let i = 0; i < 10 && stillUndone(session, top); i++) redoOnce(session, game, undone);
    expect(timelineRows(session, game, '$').some((r) => r.kind !== 'roll' && r.state === 'redo')).toBe(false);
  });

  it('says how each Final judgment went, a 0 wager too', () => {
    const { game, session } = setup();
    applyScore(session, game, ['a', 'b'], 400, 'x');
    goToRound(session, game, 2);
    Object.assign(session.final!.wagers, { a: 0, b: 100 });
    later();
    finalJudge(session, game, 'a', true);
    later();
    finalJudge(session, game, 'b', false);
    expect(timelineRows(session, game, '$').map((r) => r.text)).toEqual([
      '−$100 (Bob) · Final Jeopardy! ✘',
      '$0 (Ann) · Final Jeopardy! ✔',
      '+$400 × 2 (Ann, Bob) · x',
    ]);
  });

  it('orders Undo the way Ctrl+Z goes, and leaves out removed players’ changes', () => {
    const { game, session } = play();
    const order = undoOrder(session);
    const taken: string[] = [];
    while (nextUndo(session)) {
      taken.push(nextUndo(session)!.id);
      undoOnce(session, game);
    }
    expect(order.map((u) => u.id)).toEqual(taken);
    expect(order).toHaveLength(5); // the purchase's points go with it

    // Ann leaves: her −$200 stays on the log, Undo skips it.
    const { session: s2 } = play();
    removePlayer(s2, 'a');
    expect(undoOrder(s2).map((u) => u.log)).toEqual(['action', 'action', 'score', 'score']);
  });
});
