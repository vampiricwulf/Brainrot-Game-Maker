// 🤝 Judging a partner clue (docs/PARTNER-CLUES-SPEC.md §6.6, §9, §15): ✔ Got it / ✘ Missed score the two in one undo
// step with the clue's shares, the partner never losing points by default, the guesser picking next, a player scored by
// hand left as they are, and the phones' line saying how it went.
import { describe, expect, it } from 'vitest';
import { jeopardyGame } from './testgame';
import { gameRules, setSlideText, type BoardRound, type PartnerRules, type PartnerState } from './model';
import {
  marksText,
  partnerPlayers,
  partnerReason,
  partnerShares,
  partnerVerdict,
  resultLine,
  setPartner,
  setPartnerGame,
  setPartnerPoints,
  sharesText,
  startPartner,
  swapParts,
} from './partner';
import { applyScore, backToBoard, clueMarks, migrateSession, newSession, openClue, redo, toggleUsed, undo, judgePartner, reveal } from './session';
import { phoneStatus } from './buzz';

const REF = { round: 0, cat: 0, row: 1 };

/** Ann (a), Bob (b), Cat (c), Dan (d), Ann picking; Movies $400 a partner clue; Bob is her partner, the question up. */
function setup(game: Parameters<typeof setPartnerGame>[1] = 'describe') {
  const g = jeopardyGame();
  g.players = ['Ann', 'Bob', 'Cat', 'Dan'].map((name, i) => ({ id: name[0].toLowerCase(), name, color: ['#e6194b', '#3cb44b', '#4363d8', '#f58231'][i] }));
  const r = g.rounds[0] as BoardRound;
  r.categories[0].title = 'Movies';
  const clue = r.categories[0].clues[1];
  clue.type = 'partner';
  setPartnerGame(clue, game);
  setSlideText(clue.answerSlide, 'Shrek');
  setSlideText(clue.cards![0], 'Shrek');
  const session = newSession(g);
  session.currentPickerId = 'a';
  openClue(session, REF, g);
  const s = session.partner!;
  setPartner(session, s, 'b', 'wheel');
  s.stage = 'live';
  return { g, clue, session, s };
}

const pair = (giver: PartnerState['giver'] = 'partner'): Pick<PartnerState, 'pickerId' | 'partnerId' | 'giver'> => ({ pickerId: 'a', partnerId: 'b', giver });
const pts = (shares: { id: string; points: number }[]) => Object.fromEntries(shares.map((x) => [x.id, x.points]));
const rulesOf = (game: Parameters<typeof gameRules>[0], more: Partial<PartnerRules> = {}): PartnerRules => ({ ...gameRules(game), ...more });

describe('the shares (§9.3, a $400 tile, Ann picked it, Bob is her partner)', () => {
  it('Describe it: got → Bob +$400, Ann +$200; missed → Ann −$200, Bob 0', () => {
    expect(pts(partnerShares(400, rulesOf('describe'), pair(), true))).toEqual({ b: 400, a: 200 });
    expect(pts(partnerShares(400, rulesOf('describe'), pair(), false))).toEqual({ b: 0, a: -200 });
  });

  it('Points “No penalty” and “The guesser loses it all”', () => {
    const clue = setup().clue;
    setPartnerPoints(clue, 'none');
    expect(pts(partnerShares(400, clue.partner!, pair(), false))).toEqual({ b: 0, a: 0 });
    setPartnerPoints(clue, 'all');
    expect(pts(partnerShares(400, clue.partner!, pair(), false))).toEqual({ b: 0, a: -400 });
    expect(pts(partnerShares(400, clue.partner!, pair(), true))).toEqual({ b: 400, a: 200 });
  });

  it('after ⇄ Swap: Ann describes, Bob guesses, and a miss costs nobody (Bob is the partner)', () => {
    const s = { ...pair(), giver: 'partner' as const };
    swapParts(s as PartnerState);
    expect(pts(partnerShares(400, rulesOf('describe'), s, true))).toEqual({ a: 400, b: 200 });
    expect(pts(partnerShares(400, rulesOf('describe'), s, false))).toEqual({ a: 0, b: 0 });
    expect(partnerPlayers(s).map((p) => p.role)).toEqual(['giver', 'guesser']);
    expect(partnerPlayers(s)[0].id).toBe('a');
  });

  it('Help a friend and Split clue', () => {
    expect(pts(partnerShares(400, rulesOf('help'), pair(), true))).toEqual({ b: 200, a: 400 });
    expect(pts(partnerShares(400, rulesOf('help'), pair(), false))).toEqual({ b: 0, a: -200 });
    expect(pts(partnerShares(400, rulesOf('split'), pair(), true))).toEqual({ b: 400, a: 400 });
    expect(pts(partnerShares(400, rulesOf('split'), pair(), false))).toEqual({ b: 0, a: -200 });
  });

  it('Custom: 150% / 0% if got, −25% / −25% if missed; the partner loses points only with the tick off', () => {
    const custom = rulesOf('custom', { got: { giver: 150, guesser: 0 }, missed: { giver: -25, guesser: -25 } });
    expect(pts(partnerShares(400, { ...custom, partnerSafe: false }, pair(), true))).toEqual({ b: 600, a: 0 });
    expect(pts(partnerShares(400, { ...custom, partnerSafe: false }, pair(), false))).toEqual({ b: -100, a: -100 });
    expect(pts(partnerShares(400, custom, pair(), false))).toEqual({ b: 0, a: -100 });
    // (After ⇄ Swap the partner guesses: the tick keeps them at 0 all the same.)
    expect(pts(partnerShares(400, custom, pair('picker'), false))).toEqual({ a: -100, b: 0 });
  });

  it('Solo: the bigger “got” share, or the guesser’s “missed” share (the tick changes nothing)', () => {
    const solo = { pickerId: 'a', partnerId: 'a', giver: 'partner' as const };
    expect(partnerShares(400, rulesOf('describe'), solo, true)).toEqual([{ id: 'a', role: 'solo', points: 400 }]);
    expect(partnerShares(400, rulesOf('describe'), solo, false)).toEqual([{ id: 'a', role: 'solo', points: -200 }]);
    expect(pts(partnerShares(400, rulesOf('help'), solo, true))).toEqual({ a: 400 });
  });

  it('whole points, rounded', () => {
    expect(pts(partnerShares(250, rulesOf('describe'), pair(), true))).toEqual({ b: 250, a: 125 });
    expect(pts(partnerShares(333, rulesOf('describe'), pair(), true))).toEqual({ b: 333, a: 167 });
    expect(pts(partnerShares(0, rulesOf('describe'), pair(), false))).toEqual({ b: 0, a: 0 });
  });

  it('no partner yet: nobody to score; a player already scored is left out', () => {
    expect(partnerShares(400, rulesOf('describe'), { pickerId: 'a', giver: 'partner' }, true)).toEqual([]);
    expect(pts(partnerShares(400, rulesOf('describe'), pair(), true, { b: { right: false, delta: -200 } }))).toEqual({ a: 200 });
  });
});

describe('judged, and the lines that say so', () => {
  const name = (id: string) => ({ a: 'Ann', b: 'Bob' })[id] ?? '?';

  it('is judged once each of the two has a mark; got by the guesser’s', () => {
    expect(partnerVerdict(pair(), {})).toEqual({ judged: false, got: false });
    expect(partnerVerdict(pair(), { b: { right: true, delta: 400 } })).toEqual({ judged: false, got: false });
    expect(partnerVerdict(pair(), { b: { right: true, delta: 400 }, a: { right: true, delta: 200 } })).toEqual({ judged: true, got: true });
    expect(partnerVerdict(pair(), { b: { right: false, delta: 0 }, a: { right: false, delta: -200 } })).toEqual({ judged: true, got: false });
    expect(partnerVerdict({ pickerId: 'a', giver: 'partner' }, {})).toEqual({ judged: false, got: false });
  });

  it('says what each button gives, the marks, the phones’ result and the log’s reason', () => {
    expect(sharesText([{ id: 'b', points: 400 }, { id: 'a', points: 200 }], name, '$')).toBe('Bob +$400 · Ann +$200');
    expect(sharesText([{ id: 'b', points: 0 }, { id: 'a', points: -200 }], name, '$')).toBe('Ann −$200');
    expect(sharesText([{ id: 'b', points: 0 }, { id: 'a', points: 0 }], name, '$')).toBe('no points');
    const got = { b: { right: true, delta: 400 }, a: { right: true, delta: 200 } };
    const missed = { a: { right: false, delta: -200 }, b: { right: false, delta: 0 } };
    expect(marksText(pair(), got, name, '$')).toBe('Bob ✔ +$400 · Ann ✔ +$200');
    expect(marksText(pair(), missed, name, '$')).toBe('Bob ✘ 0 · Ann ✘ −$200');
    expect(resultLine(pair(), got, name, '$')).toBe('✔ Got it! Bob +$400 · Ann +$200');
    expect(resultLine(pair(), missed, name, '$')).toBe('✘ Missed: Ann −$200');
    expect(resultLine(pair(), { a: { right: false, delta: 0 }, b: { right: false, delta: 0 } }, name, '$')).toBe('✘ Missed');
    expect(partnerReason(rulesOf('describe'), { giver: 'Bob', guesser: 'Ann' })).toBe('partner clue: Bob described, Ann guessed');
    expect(partnerReason(rulesOf('help'), { giver: 'Bob', guesser: 'Ann' })).toBe('partner clue: Bob helped, Ann answered');
    expect(partnerReason(rulesOf('describe'), { guesser: 'Ann', solo: true })).toBe('partner clue: Ann played it alone');
  });
});

describe('✔ Got it / ✘ Missed (judgePartner)', () => {
  it('scores both in one step, with the log’s reason; one undo takes both back, and redo brings them again', () => {
    const { g, session } = setup();
    const events = judgePartner(session, g, true, 400);
    expect(events.map((e) => [e.playerId, e.delta])).toEqual([
      ['b', 400],
      ['a', 200],
    ]);
    expect(new Set(events.map((e) => e.batchId)).size).toBe(1);
    expect(events[0].reason).toBe('Jeopardy! · Movies $400 (partner clue: Bob described, Ann guessed)');
    // Ann was the picker and guessed: the board stays with her, nothing is recorded.
    expect(session.currentPickerId).toBe('a');
    expect(events.some((e) => e.picker)).toBe(false);
    expect(undo(session)).toHaveLength(2);
    expect(clueMarks(session, session.partner!.clue)).toEqual({});
    expect(redo(session)).toHaveLength(2);
    expect(Object.keys(clueMarks(session, session.partner!.clue)).sort()).toEqual(['a', 'b']);
  });

  it('after ⇄ Swap the guesser (the partner) picks next, and an undo gives the board back', () => {
    const { g, session, s } = setup();
    swapParts(s);
    const events = judgePartner(session, g, true, 400);
    expect(events.map((e) => [e.playerId, e.delta])).toEqual([
      ['a', 400],
      ['b', 200],
    ]);
    expect(session.currentPickerId).toBe('b');
    expect(events[0].picker).toEqual({ was: 'a', now: 'b' });
    undo(session);
    expect(session.currentPickerId).toBe('a');
    redo(session);
    expect(session.currentPickerId).toBe('b');
  });

  it('the guesser picks next only after ✔ Got it, and only while “Player who gets points picks next” is on', () => {
    const missed = setup();
    swapParts(missed.s);
    judgePartner(missed.session, missed.g, false, 400);
    expect(missed.session.currentPickerId).toBe('a');
    const off = setup();
    off.g.settings.pickerFollowsAward = false;
    swapParts(off.s);
    judgePartner(off.session, off.g, true, 400);
    expect(off.session.currentPickerId).toBe('a');
  });

  it('✘ Missed costs the guesser half and marks the partner with a 0', () => {
    const { g, session } = setup();
    const events = judgePartner(session, g, false, 400);
    expect(events.map((e) => [e.playerId, e.delta, e.right])).toEqual([
      ['b', 0, false],
      ['a', -200, undefined],
    ]);
    expect(clueMarks(session, session.partner!.clue)).toEqual({ b: { right: false, delta: 0 }, a: { right: false, delta: -200 } });
  });

  it('with negative scores off, a guesser on $0 still gets a ✘ mark (nothing to take)', () => {
    const { g, session, s } = setup();
    g.settings.allowNegativeScores = false;
    const events = judgePartner(session, g, false, 400);
    expect(events.map((e) => [e.playerId, e.delta, e.right])).toEqual([
      ['b', 0, false],
      ['a', 0, false],
    ]);
    expect(partnerVerdict(s, clueMarks(session, s.clue, s.at)).judged).toBe(true);
  });

  it('a player scored by hand first is left as they are; once both are marked there’s nothing more to judge', () => {
    const { g, session, s } = setup();
    applyScore(session, g, ['b'], -200, 'Bob said the word', s.clue);
    const events = judgePartner(session, g, true, 400);
    expect(events.map((e) => [e.playerId, e.delta])).toEqual([['a', 200]]);
    expect(judgePartner(session, g, true, 400)).toEqual([]);
    expect(partnerVerdict(s, clueMarks(session, s.clue, s.at))).toEqual({ judged: true, got: true });
    undo(session);
    expect(partnerVerdict(s, clueMarks(session, s.clue, s.at)).judged).toBe(false);
  });

  it('the shares are of the value given (the Amount box)', () => {
    const { g, session } = setup();
    expect(judgePartner(session, g, true, 1000).map((e) => e.delta)).toEqual([1000, 500]);
  });

  it('Solo: the picker alone', () => {
    const { g, session, s } = setup();
    s.includePicker = true;
    setPartner(session, s, 'a', 'wheel');
    expect(judgePartner(session, g, false, 400).map((e) => [e.playerId, e.delta])).toEqual([['a', -200]]);
  });

  it('nothing before the question shows, nor off the clue', () => {
    const { g, session, s } = setup();
    s.stage = 'pick';
    expect(judgePartner(session, g, true, 400)).toEqual([]);
    s.stage = 'distribute';
    expect(judgePartner(session, g, true, 400)).toHaveLength(2);
    backToBoard(session, g);
    expect(judgePartner(session, g, true, 400)).toEqual([]);
  });

  it('a tile played again starts afresh: the marks from before it opened don’t count', () => {
    const { g, session, clue } = setup();
    judgePartner(session, g, true, 400);
    backToBoard(session, g);
    toggleUsed(session, clue.id);
    session.currentPickerId = 'a';
    openClue(session, REF, g);
    const s = session.partner!;
    // (The same millisecond as the first play: opened later.)
    s.at = Date.now() + 1;
    setPartner(session, s, 'c', 'host');
    s.stage = 'live';
    expect(partnerVerdict(s, clueMarks(session, s.clue, s.at)).judged).toBe(false);
    s.at = 0;
    expect(partnerVerdict({ ...s, partnerId: 'b' }, clueMarks(session, s.clue, s.at)).judged).toBe(true);
  });
});

describe('the phones once it’s judged', () => {
  it('say how it went, then (the answer up) who played which part', () => {
    const { g, session } = setup();
    expect(phoneStatus(g, session)).toMatchObject({ text: '🤝 Bob describes → Ann guesses' });
    judgePartner(session, g, true, 400);
    expect(phoneStatus(g, session)).toEqual({ text: '✔ Got it! Bob +$400 · Ann +$200' });
    undo(session);
    judgePartner(session, g, false, 400);
    expect(phoneStatus(g, session)).toEqual({ text: '✘ Missed: Ann −$200' });
    reveal(session);
    expect(phoneStatus(g, session)).toEqual({ text: '🤝 Bob described → Ann guessed' });
    expect(JSON.stringify(phoneStatus(g, session))).not.toMatch(/Shrek/);
  });
});

describe('saved and read back', () => {
  it('a partner clue notes when it opened; a saved one with a bad time keeps the rest', () => {
    const { g, clue, session } = setup();
    expect(startPartner(session, clue, 1234).at).toBe(1234);
    session.partner = { clue: clue.id, at: 'soon' as unknown as number, stage: 'live', giver: 'partner', pickerId: 'a', partnerId: 'b' };
    migrateSession(session, g);
    expect(session.partner).toEqual({ clue: clue.id, stage: 'live', giver: 'partner', pickerId: 'a', partnerId: 'b' });
  });
});
