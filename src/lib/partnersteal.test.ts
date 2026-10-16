// 🤝 Steal on a miss (docs/PARTNER-CLUES-SPEC.md §8.3, §15.1): with it on (the clue's own say, else ⚖ Game rules'),
// ✘ Missed lets everyone else answer the partner clue, the two locked out. The steal is open while that miss stands, so
// an Undo of the miss closes it and a Redo opens it again; each steal is an ordinary award, its own step.
import { describe, expect, it } from 'vitest';
import { jeopardyGame } from './testgame';
import { migrateGame, setSlideText, type BoardRound, type Game } from './model';
import { setPartner, setPartnerGame, stealOn } from './partner';
import { applyScore, awardOpen, backToBoard, clueMarks, judgePartner, logZero, migrateSession, newSession, openClue, ownPlayers, partnerSteal, redo, removePlayer, stealersLeft, toggleUsed, undo } from './session';
import { phoneStatus } from './buzz';

const REF = { round: 0, cat: 0, row: 1 };

/** Ann (a), Bob (b), Cat (c), Dan (d), Ann picking; Movies $400 a partner clue; Bob is her partner, the clock running. */
function setup({ steal, game, players = ['Ann', 'Bob', 'Cat', 'Dan'] }: { steal?: boolean; game?: boolean; players?: string[] } = {}) {
  const g = jeopardyGame();
  g.players = players.map((name, i) => ({ id: name[0].toLowerCase(), name, color: ['#e6194b', '#3cb44b', '#4363d8', '#f58231'][i] }));
  if (game !== undefined) g.settings.partnerSteal = game;
  const r = g.rounds[0] as BoardRound;
  r.categories[0].title = 'Movies';
  const clue = r.categories[0].clues[1];
  clue.type = 'partner';
  setPartnerGame(clue, 'describe');
  if (steal !== undefined) clue.partner!.steal = steal;
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

/** A steal answered as any clue: the award row's ＋ Award / − Deduct with the Amount (the tile's value). */
const stealAward = (g: Game, session: ReturnType<typeof setup>['session'], id: string, right: boolean) =>
  applyScore(session, g, [id], right ? 400 : -400, 'Jeopardy! · Movies $400 (a steal)', session.partner!.clue);

describe('whether a miss opens a steal', () => {
  it('the clue’s own say wins; else ⚖ Game rules’; left out everywhere, no steal', () => {
    expect(stealOn({}, {})).toBe(false);
    expect(stealOn({}, { partnerSteal: true })).toBe(true);
    expect(stealOn({ steal: false }, { partnerSteal: true })).toBe(false);
    expect(stealOn({ steal: true }, {})).toBe(true);
  });

  it('✘ Missed with steals on opens it: the two are out, nobody has stolen it yet', () => {
    const { g, session } = setup({ game: true });
    expect(partnerSteal(session)).toBeNull();
    const events = judgePartner(session, g, false, 400);
    expect(events.every((e) => e.steal)).toBe(true);
    // (The giver first, as the parts are listed.)
    expect(partnerSteal(session)).toEqual({ out: ['b', 'a'] });
  });

  it('never after ✔ Got it, never with steals off, and never with nobody else to steal it', () => {
    const got = setup({ steal: true });
    judgePartner(got.session, got.g, true, 400);
    expect(partnerSteal(got.session)).toBeNull();
    const off = setup({ game: true, steal: false });
    expect(judgePartner(off.session, off.g, false, 400).some((e) => e.steal)).toBe(false);
    expect(partnerSteal(off.session)).toBeNull();
    const two = setup({ steal: true, players: ['Ann', 'Bob'] });
    expect(judgePartner(two.session, two.g, false, 400).some((e) => e.steal)).toBe(false);
    expect(partnerSteal(two.session)).toBeNull();
  });

  it('a miss scored by hand (not ✘ Missed) opens none', () => {
    const { g, session, s } = setup({ steal: true });
    logZero(session, ['b'], 'by hand', s.clue, false);
    applyScore(session, g, ['a'], -200, 'by hand', s.clue);
    expect(partnerSteal(session)).toBeNull();
  });

  it('Solo: only the picker is out', () => {
    const { g, session, s } = setup({ steal: true });
    s.includePicker = true;
    setPartner(session, s, 'a', 'wheel');
    judgePartner(session, g, false, 400);
    expect(partnerSteal(session)).toEqual({ out: ['a'] });
  });
});

describe('while the steal is open', () => {
  it('the clue is everyone else’s to answer, as any clue: nobody plays it as their own, the award row is up', () => {
    const { g, session } = setup({ steal: true });
    expect(ownPlayers(session)).toMatchObject({ kind: 'partner', setup: false });
    judgePartner(session, g, false, 400);
    expect(ownPlayers(session)).toBeNull();
    expect(awardOpen(session)).toBe(true);
  });

  it('a right steal says who stole it; a wrong one doesn’t; each is its own step', () => {
    const { g, session, s } = setup({ steal: true });
    judgePartner(session, g, false, 400);
    stealAward(g, session, 'c', false);
    expect(partnerSteal(session)).toEqual({ out: ['b', 'a'] });
    stealAward(g, session, 'd', true);
    expect(partnerSteal(session)).toEqual({ out: ['b', 'a'], by: 'd' });
    expect(clueMarks(session, s.clue, s.at)).toMatchObject({ c: { right: false, delta: -400 }, d: { right: true, delta: 400 } });
    // Undo: Dan's steal goes (still open), then Cat's, then the miss (the steal closes with it).
    undo(session);
    expect(partnerSteal(session)).toEqual({ out: ['b', 'a'] });
    undo(session);
    expect(partnerSteal(session)).toEqual({ out: ['b', 'a'] });
    undo(session);
    expect(partnerSteal(session)).toBeNull();
    expect(ownPlayers(session)).toMatchObject({ kind: 'partner' });
    // Redo: the miss opens it again, then the steals come back in order.
    redo(session);
    expect(partnerSteal(session)).toEqual({ out: ['b', 'a'] });
    redo(session);
    redo(session);
    expect(partnerSteal(session)).toEqual({ out: ['b', 'a'], by: 'd' });
  });

  it('who can still steal it: the others, until each has missed (an Undo of a miss gives them back)', () => {
    const { g, session, s } = setup({ steal: true });
    judgePartner(session, g, false, 400);
    const left = () => stealersLeft(session.players, partnerSteal(session)!, clueMarks(session, s.clue, s.at));
    expect(left()).toEqual(['c', 'd']);
    stealAward(g, session, 'c', false);
    expect(left()).toEqual(['d']);
    stealAward(g, session, 'd', false);
    // (Nobody stole it: only the answer goes on.)
    expect(left()).toEqual([]);
    expect(partnerSteal(session)).toEqual({ out: ['b', 'a'] });
    undo(session);
    expect(left()).toEqual(['d']);
  });

  it('one of the two taken out sends it back to choosing: no steal then', () => {
    const { g, session } = setup({ steal: true });
    judgePartner(session, g, false, 400);
    removePlayer(session, 'b');
    expect(partnerSteal(session)).toBeNull();
  });

  it('closes with the tile; a tile played again starts with none', () => {
    const { g, session, clue } = setup({ steal: true });
    judgePartner(session, g, false, 400);
    backToBoard(session, g);
    expect(partnerSteal(session)).toBeNull();
    toggleUsed(session, clue.id);
    session.currentPickerId = 'a';
    openClue(session, REF, g);
    const s = session.partner!;
    s.at = Date.now() + 1;
    setPartner(session, s, 'c', 'host');
    s.stage = 'live';
    expect(partnerSteal(session)).toBeNull();
  });

  it('the phones: a steal line, nothing greyed (they buzz as on any clue)', () => {
    const { g, session } = setup({ steal: true });
    expect(phoneStatus(g, session, false, { cards: true })).toMatchObject({ off: true });
    judgePartner(session, g, false, 400);
    expect(phoneStatus(g, session, false, { cards: true })).toEqual({ text: '🔔 Steal! Bob & Ann missed it' });
    expect(phoneStatus(g, session)).toEqual({ text: '🔔 Steal! Bob & Ann missed it' });
    // Stolen: back to how the partner clue went (the phones say who got it from the buzzers).
    stealAward(g, session, 'c', true);
    expect(phoneStatus(g, session)?.text).toBe('✘ Missed: Ann −$200');
  });
});

describe('saved and read back', () => {
  it('a steal survives a reload (the miss is in the log); a damaged mark isn’t one', () => {
    const { g, session } = setup({ steal: true });
    judgePartner(session, g, false, 400);
    const back = migrateSession(JSON.parse(JSON.stringify(session)), g);
    expect(partnerSteal(back)).toEqual({ out: ['b', 'a'] });
    const bad = JSON.parse(JSON.stringify(session));
    for (const e of bad.scoreLog) e.steal = 'yes';
    expect(partnerSteal(migrateSession(bad, g))).toBeNull();
  });

  it('the game’s rule and a clue’s say are kept; anything else goes', () => {
    const { g } = setup({ steal: false, game: true });
    const back = migrateGame(JSON.parse(JSON.stringify(g)));
    expect(back.settings.partnerSteal).toBe(true);
    expect((back.rounds[0] as BoardRound).categories[0].clues[1].partner?.steal).toBe(false);
    const bad = JSON.parse(JSON.stringify(g));
    bad.settings.partnerSteal = 'yes';
    bad.rounds[0].categories[0].clues[1].partner.steal = 1;
    const fixed = migrateGame(bad);
    expect(fixed.settings.partnerSteal).toBeUndefined();
    expect((fixed.rounds[0] as BoardRound).categories[0].clues[1].partner?.steal).toBeUndefined();
  });

  it('choosing another game keeps the clue’s steal', () => {
    const { clue } = setup({ steal: true });
    setPartnerGame(clue, 'draw');
    expect(clue.partner?.steal).toBe(true);
    setPartnerGame(clue, 'custom');
    expect(clue.partner?.steal).toBe(true);
  });
});
