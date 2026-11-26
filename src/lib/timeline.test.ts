import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jeopardyGame } from './testgame';
import { newFinalRound, newGame, newRound, type Game, type Session, type Shop } from './model';
import {
  applyScore,
  finalAdjustWager,
  finalJudge,
  finalNext,
  finalSetWager,
  goToRound,
  newSession,
  redo,
  redoStep,
  removePlayer,
  score,
  toggleEvent,
  toggleStep,
  undo,
} from './session';
import { addStat, buy, logged, newStatField, redoAction, redoFrom, redoOrder, SCORE_CURRENCY, startStep, undoAction, type Undone } from './toolset';
import { nextUndo, redoStepBlocker, stillUndone, timelineRows, undoOrder } from './timeline';

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
      ['score', '+$400 × 2 (Ann & Bob) · Jeopardy! · Memes $400', 0],
    ]);
    // Undo to here: how many Undos each row is behind (the roll marks a moment).
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
      ['+$400 × 2 (Ann & Bob) · Jeopardy! · Memes $400', 'off', 2],
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
      '+$400 × 2 (Ann & Bob) · x',
    ]);
  });

  it('a single window says a step’s quiet text (a secret space as “? (secret)”), with an audience window its words', () => {
    const { game, session } = setup();
    logged(session, 'Connected Trap door → Start', () => (session.currentPickerId = 'a'), game, 'Connected ? (secret) → Start');
    const said = (hide: boolean) => timelineRows(session, game, '$', hide).find((r) => r.kind === 'action')?.text;
    expect([said(false), said(true)]).toEqual(['Connected Trap door → Start', 'Connected ? (secret) → Start']);
    // Undone, it waits to be redone with both.
    undoAction(session, game);
    expect(said(true)).toBe('Connected ? (secret) → Start');
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

describe('Undo after Undo and Redo', () => {
  /** Ctrl+Z twice, Ctrl+Shift+Z twice: the next Ctrl+Z is the one History lists first, the newest change. */
  function backAndForth(session: Session, game: Game): void {
    const undone: Undone[] = [];
    undoOnce(session, game, undone);
    undoOnce(session, game, undone);
    redoOnce(session, game, undone);
    redoOnce(session, game, undone);
    // The step's points went back where they were, not after the newer score.
    const ts = session.scoreLog.map((e) => e.ts);
    expect(ts).toEqual([...ts].sort((x, y) => x - y));
    const next = nextUndo(session);
    expect(next?.log).toBe('score');
    expect(next).toEqual(undoOrder(session)[0]);
  }

  it('takes back a score given after a Final wager halved before the halving', () => {
    const game = newGame();
    game.rounds = [newRound('Round'), newFinalRound()];
    game.players = [
      { id: 'a', name: 'Ann', color: '#e6194b' },
      { id: 'b', name: 'Bob', color: '#3cb44b' },
    ];
    const session = newSession(game);
    applyScore(session, game, ['a'], 1000, 'Start');
    applyScore(session, game, ['b'], 1000, 'Start');
    goToRound(session, game, 1);
    session.intro = null;
    finalSetWager(session, 'a', 800);
    finalSetWager(session, 'b', 600);
    for (let i = 0; i < 3; i++) finalNext(session, game);
    later();
    finalJudge(session, game, 'a', true);
    later();
    // As the Final's ½ Halve does it (FinalControls): a step with Ann's judgment given again inside it.
    logged(session, 'Ann’s wager halved', () => void finalAdjustWager(session, game, 'a', 'half'), game);
    later();
    finalJudge(session, game, 'b', true);
    expect([score(session, 'a'), score(session, 'b')]).toEqual([1400, 1600]);
    backAndForth(session, game);
    expect([score(session, 'a'), score(session, 'b')]).toEqual([1400, 1600]);
    undoOnce(session, game);
    // Bob's ✔ is taken back; Ann's wager stays halved.
    expect([score(session, 'a'), score(session, 'b')]).toEqual([1400, 1000]);
    expect(session.final!.wagers.a).toBe(400);
    expect(session.final!.results.b).toBeUndefined();
  });

  it('takes back a score given after a purchase paid in points before the purchase', () => {
    const { game, session } = setup();
    applyScore(session, game, ['a'], 500, 'Start');
    later();
    logged(session, 'Ann buys a Sword', () => buy(game, session, shop, 'a', 'sword'));
    later();
    applyScore(session, game, ['b'], 200, 'Bob right');
    backAndForth(session, game);
    undoOnce(session, game);
    expect([score(session, 'a'), score(session, 'b')]).toEqual([200, 0]);
    // A score Undo never takes the purchase's points apart from it: it takes Ann's $500 instead.
    undo(session);
    expect(score(session, 'a')).toBe(-300);
    expect(session.actionLog).toHaveLength(1);
  });

  it('keeps a step under way (an editor open) from taking in an older score when a step is redone meanwhile', () => {
    const { game, session } = setup();
    applyScore(session, game, ['a'], 500, 'Start');
    later();
    logged(session, 'Ann buys a Sword', () => buy(game, session, shop, 'a', 'sword'));
    later();
    applyScore(session, game, ['b'], 200, 'Bob right');
    const undone: Undone[] = [];
    undoOnce(session, game, undone);
    undoOnce(session, game, undone);
    const done = startStep(session, game);
    redoOnce(session, game, undone);
    done('Players changed');
    // The step under way takes in neither Bob's score (waiting for Redo, last but one once the purchase is back) nor the
    // purchase's points (its own step's). (It does see the Sword come back: a step's before is taken when it begins.)
    expect(session.actionLog!.at(-1)!.text).toBe('Players changed');
    expect(session.actionLog!.at(-1)!.score).toBeUndefined();
    redoOnce(session, game, undone);
    expect([score(session, 'a'), score(session, 'b')]).toEqual([200, 200]);
  });
});

describe('the undone rows', () => {
  /** Three score changes a second apart: A, B, C. */
  function three() {
    const { game, session } = setup();
    for (const [who, d] of [
      ['a', 100],
      ['b', 200],
      ['a', 300],
    ] as const) {
      later();
      applyScore(session, game, [who], d, `+${d}`);
    }
    return { game, session };
  }
  const redoRows = (session: Session, game: Game, undone: Undone[]) =>
    timelineRows(session, game, '$', false, undone)
      .filter((r) => r.kind !== 'roll' && r.state === 'redo')
      .map((r) => [r.text, r.steps]);

  it('list the steps in the order ↷ Redo brings them back, the next one at the bottom, with its count', () => {
    const { game, session } = three();
    const undone: Undone[] = [];
    undoOnce(session, game, undone); // C
    undoOnce(session, game, undone); // B
    // C restored in Scores, then undone again: Ctrl+Y brings back C first, then B.
    toggleStep(session, session.scoreLog[2].batchId!);
    undoOnce(session, game, undone);
    expect(redoRows(session, game, undone)).toEqual([
      ['+$200 (Bob) · +200', 2],
      ['+$300 (Ann) · +300', 1],
    ]);
    // …as Ctrl+Y does.
    redoOnce(session, game, undone);
    expect(score(session, 'a')).toBe(400);
    expect(redoRows(session, game, undone)).toEqual([['+$200 (Bob) · +200', 1]]);
  });

  it('a step and score changes: redoOrder is what Ctrl+Y does again and again, and leaves what it reads as it was', () => {
    const { game, session } = play();
    const undone: Undone[] = [];
    for (let i = 0; i < 4; i++) undoOnce(session, game, undone);
    const copy = JSON.stringify([undone, session.redoStack, session.actionRedo]);
    const order = redoOrder(session, undone);
    expect(JSON.stringify([undone, session.redoStack, session.actionRedo])).toBe(copy);
    const taken: string[] = [];
    for (let i = 0; i < 10; i++) {
      const from = redoFrom(session, [...undone]);
      if (!from) break;
      taken.push(from === 'action' ? session.actionRedo!.at(-1)!.id : stepOfTop(session));
      redoOnce(session, game, undone);
    }
    expect(order.map((u) => u.id)).toEqual(taken);
    expect(order).toHaveLength(4);
  });
});

describe('↷ Redo just this (an undone score)', () => {
  /** Score steps a second apart, each its own Undo. */
  function scores(list: [string, number, string?][]) {
    const { game, session } = setup();
    const ids = list.map(([who, d, clue]) => {
      later();
      return applyScore(session, game, [who], d, `+${d}`, clue)[0].batchId!;
    });
    return { game, session, ids };
  }
  /** Play's ↷ Redo just this: the step, and its Undo off play's list. */
  function redoJust(session: Session, undone: Undone[], id: string) {
    const events = redoStep(session, id);
    undone.splice(
      undone.findIndex((u) => u.id === id),
      1,
    );
    return events;
  }

  it('brings back only that step; Redo goes on with the others, Ctrl+Z then Ctrl+Y take and bring back the same one', () => {
    const { game, session, ids } = scores([
      ['a', 100],
      ['b', 200],
      ['a', 300],
    ]);
    const undone: Undone[] = [];
    for (let i = 0; i < 3; i++) undoOnce(session, game, undone);
    expect(redoStepBlocker(session, ids[0], undone, '$')).toBe('It’s next: ↷ Redo brings it back');
    expect(redoStepBlocker(session, ids[1], undone, '$')).toBeNull();
    expect(redoJust(session, undone, ids[1]).map((e) => e.delta)).toEqual([200]);
    expect([score(session, 'a'), score(session, 'b')]).toEqual([0, 200]);
    const rows = () => timelineRows(session, game, '$', false, undone).map((r) => [r.text, r.kind === 'roll' ? '' : r.state, r.steps]);
    expect(rows()).toEqual([
      ['+$300 (Ann) · +300', 'redo', 2],
      ['+$100 (Ann) · +100', 'redo', 1],
      ['+$200 (Bob) · +200', 'done', 0],
    ]);
    // Ctrl+Z takes it back, Ctrl+Y brings back that same one.
    undoOnce(session, game, undone);
    expect(rows()[2]).toEqual(['+$200 (Bob) · +200', 'redo', 1]);
    redoOnce(session, game, undone);
    expect([score(session, 'a'), score(session, 'b')]).toEqual([0, 200]);
    // Then the oldest, then the newest.
    redoOnce(session, game, undone);
    expect(score(session, 'a')).toBe(100);
    redoOnce(session, game, undone);
    expect([score(session, 'a'), score(session, 'b')]).toEqual([400, 200]);
  });

  it('leaves a part turned off in 📜 Log › Scores off', () => {
    const { game, session } = setup();
    later();
    const both = applyScore(session, game, ['a', 'b'], 100, 'Both');
    toggleEvent(session, both[1].id);
    later();
    applyScore(session, game, ['a'], 50, 'Later');
    const undone: Undone[] = [];
    undoOnce(session, game, undone);
    undoOnce(session, game, undone);
    redoJust(session, undone, both[0].batchId!);
    expect([score(session, 'a'), score(session, 'b')]).toEqual([100, 0]);
  });

  it('is refused, naming the step, when it depends on one Redo brings back before it', () => {
    // A mark on the same clue (a verdict switched, the buzzers…).
    let { game, session, ids } = scores([
      ['a', 100, 'clue1'],
      ['b', -100, 'clue1'],
      ['a', 300],
    ]);
    let undone: Undone[] = [];
    for (let i = 0; i < 3; i++) undoOnce(session, game, undone);
    expect(redoStepBlocker(session, ids[1], undone, '$')).toBe('It depends on “+$100 (Ann) · +100”, undone before it: use ↷ Redo to here');
    expect(redoStepBlocker(session, ids[2], undone, '$')).toBeNull();

    // Its player, added by a step undone before it.
    ({ game, session } = setup());
    undone = [];
    later();
    logged(session, 'Added Cy', () => session.players.push({ id: 'c', name: 'Cy', color: '#000', startScore: 0 }));
    later();
    const cy = applyScore(session, game, ['c'], 100, 'Cy')[0].batchId!;
    later();
    applyScore(session, game, ['a'], 100, 'Ann');
    for (let i = 0; i < 3; i++) undoOnce(session, game, undone);
    expect(redoStepBlocker(session, cy, undone, '$')).toBe('It depends on “Added Cy”, undone before it: use ↷ Redo to here');

    // An award that made its player the picker, after a step that set the picker.
    ({ game, session } = setup());
    undone = [];
    later();
    logged(session, 'Bob picks next', () => (session.currentPickerId = 'b'));
    later();
    const award = applyScore(session, game, ['a'], 100, 'Ann right');
    award[0].picker = { was: 'b', now: 'a' };
    session.currentPickerId = 'a';
    later();
    applyScore(session, game, ['b'], 100, 'Bob');
    for (let i = 0; i < 3; i++) undoOnce(session, game, undone);
    expect(redoStepBlocker(session, award[0].batchId!, undone, '$')).toBe('It depends on “Bob picks next”, undone before it: use ↷ Redo to here');

    // Two awards that each made their player the picker, on different clues: the newer after the older (redone on its
    // own, the picker would end with the older's).
    ({ game, session } = setup());
    undone = [];
    session.currentPickerId = 'x';
    later();
    applyScore(session, game, ['a'], 100, 'Ann right', 'clue1')[0].picker = { was: 'x', now: 'a' };
    session.currentPickerId = 'a';
    later();
    const bob = applyScore(session, game, ['b'], 100, 'Bob right', 'clue2')[0];
    bob.picker = { was: 'a', now: 'b' };
    session.currentPickerId = 'b';
    for (let i = 0; i < 2; i++) undoOnce(session, game, undone);
    expect(session.currentPickerId).toBe('x');
    expect(redoStepBlocker(session, bob.batchId!, undone, '$')).toBe('It depends on “+$100 (Ann) · Ann right”, undone before it: use ↷ Redo to here');
  });

  it('names the step it depends on as the list does: in one window, by its quiet text', () => {
    const { game, session } = setup();
    const undone: Undone[] = [];
    later();
    logged(session, 'Ann lands on Trap door', () => (session.currentPickerId = 'a'), game, 'Ann lands on ? (secret)');
    later();
    applyScore(session, game, ['b'], 100, 'Bob right')[0].picker = { was: 'a', now: 'b' };
    session.currentPickerId = 'b';
    later();
    const id = applyScore(session, game, ['a'], 50, 'Ann')[0].batchId!;
    for (let i = 0; i < 3; i++) undoOnce(session, game, undone);
    const bob = session.scoreLog[0].batchId!;
    expect(id).not.toBe(bob);
    expect(redoStepBlocker(session, bob, undone, '$', true)).toBe('It depends on “Ann lands on ? (secret)”, undone before it: use ↷ Redo to here');
    expect(redoStepBlocker(session, bob, undone, '$', false)).toBe('It depends on “Ann lands on Trap door”, undone before it: use ↷ Redo to here');
  });
});

const stepOfTop = (session: Session) => {
  const e = session.scoreLog.find((x) => x.id === session.redoStack.at(-1))!;
  return e.batchId ?? e.id;
};
