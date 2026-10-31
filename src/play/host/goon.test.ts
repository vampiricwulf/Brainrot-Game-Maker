// The blue button and the check before going on (goon.ts): the table of moments, what's left in each, and the keys in
// the check.
import { describe, expect, it } from 'vitest';
import { jeopardyGame } from '../../lib/testgame';
import { newSlidesRound, setSlideText, textSlide, type BoardRound, type FinalRound, type Game, type Session, type WheelSegment } from '../../lib/model';
import { applyScore, goToRound, newSession, openClue, startTiebreaker, undo } from '../../lib/session';
import { buzzArm, buzzClueOpened, buzzDone, buzzTake, newBuzz } from '../../lib/buzz';
import { newLive } from '../../lib/live';
import { draftPick, openDice, openWheel, quickDice, scoreCards, spinWheel, toggleScoreboard } from '../../lib/overlay';
import { newWheel } from '../../lib/tools';
import { newBoardGameRound } from '../../lib/boardgame';
import { HOP_MS } from '../../lib/boardgame';
import { moveNow, rollMover, runLanding, runSpace, sendNow } from '../boardgame/bgops';
import { undoAction } from '../../lib/toolset';
import {
  anywayLabel, asked, CHECK_GUARD_MS, ddWaits, doneSay, doneStep, enterQuick, escBounce, finalWaits, goOnDecision, headingOf, inside, leftNow, likelyVerdict, mainQuick, mainStep, mergeItems,
  quietKinds, ringOf, swallowSay, teachLine, todo, wagersLine, type BoardNow, type Check, type FinalNow, type GoActs, type GoCtx, type LeftItem, type PartnerNow, type Step,
} from './goon';
import { FLOW } from './verbs';

const REF = { round: 0, cat: 0, row: 1 };

/** What the fixes and steps did, in order. */
let did: string[] = [];
const act: GoActs = {
  intro: () => did.push('intro'),
  slide: () => did.push('slide'),
  nextRound: () => did.push('nextround'),
  reveal: () => did.push('reveal'),
  back: () => did.push('back'),
  award: (sign, ids, amount, keep) => did.push(`${sign > 0 ? '+' : '-'}${amount} ${ids.join()}${keep ? ' keep' : ''}`),
  openBuzzers: () => did.push('open'),
  rollTie: () => did.push('rolltie'),
  pick: (id) => did.push(`pick ${id}`),
  clock: (more) => did.push(more ? '+10' : 'clock'),
  judgeAll: () => did.push('judgeall'),
  wrongRest: (ids) => did.push(`wrong ${ids.join()}`),
  toRow: (id) => did.push(`row ${id}`),
  sendCard: (id) => did.push(`send ${id}`),
  partnerPicker: (id) => did.push(`picker ${id}`),
  partnerSpin: () => did.push('spin'),
  partnerChoose: (id) => did.push(`partner ${id}`),
  memberSpin: () => did.push('memberspin'),
  describer: (id) => did.push(`describer ${id}`),
  partnerSolo: () => did.push('solo'),
  putBack: () => did.push('putback'),
  partnerShow: () => did.push('show'),
  closeWheel: () => did.push('closewheel'),
  partnerClock: () => {
    did.push('handout');
  },
  copyCard: (id) => did.push(`copy ${id}`),
  partnerJudge: (got) => {
    did.push(got ? 'got' : 'missed');
  },
  closeTool: () => did.push('closetool'),
  spin: () => did.push('spin'),
  roll: () => did.push('roll'),
  revealPopup: () => did.push('revealpopup'),
  scoreCard: (key) => did.push(`score ${key}`),
  focusOn: (sel) => did.push(`focus ${sel}`),
  ddShow: () => did.push('ddshow'),
  finalShow: () => did.push('finalshow'),
  finalOn: () => did.push('finalon'),
  finalNext: () => did.push('finalnext'),
  judge: (id, right) => did.push(`judge ${id} ${right ? 'right' : 'wrong'}`),
  tbBack: () => did.push('tbback'),
  tbWin: (id) => did.push(`tbwin ${id}`),
  nextTurn: () => did.push('nextturn'),
  prevTurn: () => did.push('prevturn'),
  boardRoll: () => did.push('boardroll'),
  boardMove: (steps, way) => did.push(`move ${steps}${way ? ` ${way}` : ''}`),
  boardLanding: () => did.push('landing'),
};

/** Ann, Bob and Cat; a board, then the Final. */
function setup(): { g: Game; s: Session } {
  const g = jeopardyGame();
  g.players = ['Ann', 'Bob', 'Cat'].map((name, i) => ({ id: name[0].toLowerCase(), name, color: ['#e6194b', '#3cb44b', '#4363d8'][i] }));
  const s = newSession(g);
  s.intro = null;
  did = [];
  return { g, s };
}
const board = (g: Game) => g.rounds[0] as BoardRound;

function ctx(g: Game, s: Session, over: Partial<GoCtx> = {}): GoCtx {
  return {
    session: s,
    game: g,
    dual: false,
    live: newLive(),
    now: 0,
    selected: [],
    amount: null,
    marks: {},
    buzzing: false,
    buzz: null,
    tie: [],
    everyone: false,
    answers: null,
    phones: [],
    judgeAll: null,
    clockUp: false,
    cards: [],
    ddHidden: false,
    wagerLimitsOff: true,
    ddPhone: false,
    partner: null,
    final: { teams: false, wagerPhones: [] },
    board: null,
    act,
    ...over,
  };
}

/** The step's words, key and flags, as the blue button shows them. */
const said = (st: Step | null) =>
  st && [st.verb.label, st.key ?? '', ...(['clickOnly', 'enterIsNext', 'reveals'] as const).filter((f) => st[f])].join(' · ');
/** An item as the check says it: tone, must, its words, then each fix "label [key] then". */
const lines = (items: LeftItem[]) =>
  items.map((i) => [`${i.kind}${i.must ? ' must' : ''}: ${i.text}`, ...i.quick.map((q) => `${q.line ? `${q.line}: ` : ''}${q.label}${q.key ? ` [${q.key}]` : ''}${q.enter ? ' ⏎' : ''} · ${q.then}`)]);

const open = (step: Step, items: LeftItem[], at = 1000): Check => ({ step, items, openedBy: 'n', at });
const after = 1000 + CHECK_GUARD_MS + 1;

describe('the blue button in every moment (1.3)', () => {
  it('the round intro: its next step, Enter is Next, never asks', () => {
    const { g, s } = setup();
    s.intro = { stage: 'title', revealed: 0 };
    expect(said(mainStep(ctx(g, s)))).toBe('Show board ▶ · N · enterIsNext');
    s.intro = { stage: 'fill', revealed: 0 };
    expect(said(mainStep(ctx(g, s)))).toBe('Reveal categories ▶ · N · enterIsNext');
    s.intro = { stage: 'categories', revealed: 2 };
    const st = mainStep(ctx(g, s))!;
    expect(said(st)).toBe('Reveal category 3 of 6 ▶ · N · enterIsNext');
    expect(leftNow(ctx(g, s), st)).toEqual([]);
    st.run();
    expect(did).toEqual(['intro']);
    // (The Final's title card, an RPG's or a board game's: Start the round ▶.)
    s.currentRound = 1;
    s.phase = 'final';
    s.intro = { stage: 'title', revealed: 0 };
    expect(said(mainStep(ctx(g, s)))).toBe('Start the round ▶ · N · enterIsNext');
  });

  it('a board with tiles left has no blue button; played out, the next round by a click only (N says to click it)', () => {
    const { g, s } = setup();
    expect(mainStep(ctx(g, s))).toBeNull();
    for (const c of board(g).categories.flatMap((x) => x.clues)) s.used[c.id] = true;
    expect(said(mainStep(ctx(g, s)))).toBe('Final Jeopardy! ▶ ·  · clickOnly');
    g.rounds.splice(1, 1);
    expect(said(mainStep(ctx(g, s)))).toBe('End game ▶ ·  · clickOnly');
  });

  it('a slides round: Next slide ▶, then the next round on its last slide; Enter on the button is Next; never asks', () => {
    const { g, s } = setup();
    const r = newSlidesRound();
    r.extraSlides = [{ ...r.questionSlide, id: 'b' }];
    g.rounds.unshift(r);
    s.phase = 'slides';
    s.currentRound = 0;
    const st = mainStep(ctx(g, s))!;
    expect([said(st), st.verb.title, st.flow]).toEqual(['Next slide ▶ · N · enterIsNext', 'Slide 2 of 2 (Shift+N: the slide before) · or click the slide', 'pager']);
    s.slide = 1;
    expect(said(mainStep(ctx(g, s)))).toBe('Next round ▶ · N · enterIsNext');
    expect(leftNow(ctx(g, s), mainStep(ctx(g, s))!)).toEqual([]);
  });

  it('a clue: its slides, 👁 Reveal answer, then ▦ Done ▶ board, with N as its key', () => {
    const { g, s } = setup();
    const clue = board(g).categories[0].clues[1];
    clue.extraSlides = [{ ...clue.questionSlide, id: 'q2' }];
    openClue(s, REF, g);
    expect(said(mainStep(ctx(g, s)))).toBe('Next slide ▶ · N');
    s.slide = 1;
    const reveal = mainStep(ctx(g, s))!;
    expect([said(reveal), reveal.flow]).toEqual(['👁 Reveal answer · N · reveals', 'reveal']);
    s.revealed = true;
    expect([said(mainStep(ctx(g, s))), mainStep(ctx(g, s))!.flow]).toEqual(['▦ Done ▶ board · N', 'done']);
    // (▦ Done ▶ board as a skip, while the blue button is 👁 Reveal answer.)
    s.revealed = false;
    expect(said(doneStep(ctx(g, s)))).toBe('▦ Done ▶ board · N');
  });

  it('moments with no blue button, and the ones whose state isn’t given: no step', () => {
    const { g, s } = setup();
    // (The Final with none under way, the end screen, an RPG round, a board game without its turn's: none.)
    for (const phase of ['final', 'end', 'rpg', 'boardgame'] as const) {
      s.phase = phase;
      expect(mainStep(ctx(g, s)), phase).toBeNull();
    }
  });

  it('a Daily Double’s splash: Show question ▶, never greyed, Enter in the Wager box is Next; its question is a clue', () => {
    const { g, s } = setup();
    board(g).categories[0].clues[1].type = 'dailyDouble';
    openClue(s, REF, g);
    const st = mainStep(ctx(g, s))!;
    expect([said(st), st.busy, st.id]).toEqual(['Show question ▶ · N · enterIsNext', undefined, 'ddshow']);
    // (Who found it and the wager are typed: no check, ever. The flow row's Done as a skip isn't on the splash.)
    expect([leftNow(ctx(g, s), st), doneStep(ctx(g, s))]).toEqual([[], null]);
    st.run();
    expect(did).toEqual(['ddshow']);
    s.dd = { stage: 'question', playerId: 'a', wager: 300 };
    expect(said(mainStep(ctx(g, s)))).toBe('👁 Reveal answer · N · reveals');
  });

  it('only ever says words from FLOW', () => {
    const flow = new Set<string>(Object.values(FLOW).flatMap((v) => (typeof v === 'function' ? [] : [v.label])));
    const { g, s } = setup();
    openClue(s, REF, g);
    for (const st of [mainStep(ctx(g, s)), ((s.revealed = true), mainStep(ctx(g, s)))]) expect(flow.has(st!.verb.label), st!.verb.label).toBe(true);
  });
});

describe('what’s left (3.4)', () => {
  it('A: ▦ Done ▶ board with one player picked and no points', () => {
    const { g, s } = setup();
    openClue(s, REF, g);
    s.revealed = true;
    const c = ctx(g, s, { selected: ['a'], amount: 400 });
    const items = leftNow(c, mainStep(c)!);
    expect(lines(items)).toEqual([['loss: Ann is answering and has no points for this clue yet.', '＋ Award Ann $400 ▶ board ⏎ · go', '− Deduct Ann $400 ▶ board [⇧⏎] · go']]);
    items[0].quick[0].run();
    expect(did).toEqual(['+400 a']);
    // Points given: nothing left. Revealing with someone picked never asks (judging can follow).
    expect(leftNow(ctx(g, s, { selected: ['a'], marks: { a: { right: true, delta: 400 } } }), mainStep(c)!)).toEqual([]);
    s.revealed = false;
    expect(leftNow(c, mainStep(c)!)).toEqual([]);
    // A clue nobody answered.
    s.revealed = true;
    expect(leftNow(ctx(g, s), mainStep(c)!)).toEqual([]);
  });

  it('A: several picked: a line each, no ⏎ (Enter says how), and each keeps the others picked', () => {
    const { g, s } = setup();
    openClue(s, REF, g);
    s.revealed = true;
    const c = ctx(g, s, { selected: ['a', 'b'], marks: {} });
    const [item] = leftNow(c, mainStep(c)!);
    expect(lines([item])).toEqual([['loss: Ann & Bob are picked, with no points yet.', 'Ann: ＋ Award $400 · keep', 'Ann: − Deduct · keep', 'Bob: ＋ Award $400 · keep', 'Bob: − Deduct · keep']]);
    expect(enterQuick([item])).toBeNull();
    expect(inside({ key: 'Enter' }, open(mainStep(c)!, [item]), after)).toEqual({ do: 'flash', say: 'Several are picked: ＋ or − on each line (1–9 changes who)' });
    item.quick[2].run();
    expect(did).toEqual(['+400 b keep']);
  });

  it('A: a Daily Double’s player not judged; in one window a phone’s wager stays hidden', () => {
    const { g, s } = setup();
    openClue(s, REF, g);
    s.dd = { stage: 'question', playerId: 'b', wager: 300 };
    s.revealed = true;
    const c = ctx(g, s, { selected: ['b'], amount: 300 });
    expect(lines(leftNow(c, mainStep(c)!))).toEqual([['loss: Bob hasn’t been judged on this Daily Double.', '＋ Award Bob $300 ▶ board ⏎ · go', '− Deduct Bob $300 ▶ board [⇧⏎] · go']]);
    const hid = leftNow(ctx(g, s, { selected: ['b'], ddHidden: true }), mainStep(c)!);
    expect(hid[0].quick.map((q) => q.label)).toEqual(['＋ Award Bob (wager hidden) ▶ board', '− Deduct Bob (wager hidden) ▶ board']);
    expect(JSON.stringify(hid)).not.toContain('300');
  });

  it('B: phone buzzers never opened, at 👁 Reveal answer (not once opened and closed again)', () => {
    const { g, s } = setup();
    openClue(s, REF, g);
    const closed = buzzClueOpened(newBuzz(3), false);
    const c = ctx(g, s, { buzzing: true, buzz: closed });
    const items = leftNow(c, mainStep(c)!);
    expect(lines(items)).toEqual([['first: The buzzers were never opened: nobody could buzz in.', '🔔 Open the buzzers [U] ⏎ · close']]);
    expect([items[0].quiet, items[0].box, items[0].quick[0].after]).toEqual(['buzzers', 'buzzers', 'Buzzers open… then 👁 Reveal answer (N)']);
    expect(leftNow(ctx(g, s, { buzzing: true, buzz: buzzDone(buzzTake(buzzArm(closed, ['a', 'b', 'c']), 'a')!) }), mainStep(c)!)).toEqual([]);
    // Open, nobody buzzing ("nobody knew it"); someone picked by hand; silenced for the game.
    expect(leftNow(ctx(g, s, { buzzing: true, buzz: buzzArm(closed, ['a']) }), mainStep(c)!)).toEqual([]);
    expect(leftNow(ctx(g, s, { buzzing: true, buzz: closed, selected: ['a'] }), mainStep(c)!)).toEqual([]);
    s.goonQuiet = ['buzzers'];
    expect(leftNow(c, mainStep(c)!)).toEqual([]);
  });

  it('B: a buzzer tie: 🎲 Roll for it (O) or who answers, by their number', () => {
    const { g, s } = setup();
    openClue(s, REF, g);
    const c = ctx(g, s, { buzzing: true, buzz: buzzArm(newBuzz(), ['a', 'b', 'c']), tie: ['a', 'c'] });
    const items = leftNow(c, mainStep(c)!);
    expect(lines(items)).toEqual([['first: Ann & Cat buzzed at the same moment.', '🎲 Roll for it [O] ⏎ · close', 'Ann answers [1] · close', 'Cat answers [3] · close']]);
    expect(ringOf(items)).toBe('rolltie');
    expect(inside({ key: 'o' }, open(mainStep(c)!, items), after)).toMatchObject({ do: 'quick', quick: { label: '🎲 Roll for it' } });
    // (The numbers still pick, as outside.)
    expect(inside({ key: '3' }, open(mainStep(c)!, items), after)).toEqual({ do: 'pass' });
  });

  it('C: ✍ answers still coming in at the reveal; at Done, the ones not judged (names and counts, never the words)', () => {
    const { g, s } = setup();
    openClue(s, REF, g);
    const seats = { a: { text: 'Paris' }, b: { text: 'Lyon' } };
    const c = ctx(g, s, { everyone: true, answers: { seats, locked: false }, phones: ['a', 'b', 'c'], clockUp: true });
    const reveal = leftNow(c, mainStep(c)!);
    expect(lines(reveal)).toEqual([['first: 2 of 3 answers are in (Cat’s isn’t).', '⏱ 10 more seconds [⇧T] ⏎ · close']]);
    expect([reveal[0].quiet, anywayLabel(open(mainStep(c)!, reveal))]).toEqual(['answers', '👁 Reveal anyway: the answers lock']);
    s.revealed = true;
    const done = ctx(g, s, { everyone: true, answers: { seats, locked: true }, phones: ['a', 'b', 'c'] });
    expect(lines(leftNow(done, mainStep(done)!))).toEqual([['loss: Nobody’s answer is judged yet (2 are in).', '✍ Judge them ⏎ · close']]);
    s.scoreLog.push({ id: 'e', playerId: 'a', delta: 200, reason: 'x', clueId: board(g).categories[0].clues[1].id, ts: Date.now() });
    const some = leftNow(done, mainStep(done)!);
    expect(lines(some)).toEqual([['loss: Not judged yet: Bob.', '✍ Judge them ⏎ · close', '✘ The rest are wrong (Bob) ▶ board · go']]);
    expect([some[0].focus, anywayLabel(open(mainStep(done)!, some))]).toEqual(['.play .panel [data-answer-row="b"] button.good', '▦ Done anyway: Bob gets no points']);
    expect(JSON.stringify(some)).not.toMatch(/Paris|Lyon/);
    // Multiple choice: ✔ Judge all ▶ board, ringed.
    const mc = leftNow(ctx(g, s, { everyone: true, answers: { seats, locked: true }, judgeAll: { right: ['b'], wrong: [] } }), mainStep(done)!);
    expect([lines(mc), ringOf(mc)]).toEqual([[['loss: Not judged yet: Bob.', '✔ Judge all ▶ board ⏎ · go']], 'judgeall']);
  });

  it('D: a tile’s 🤫 card not sent, at the reveal: its name and who it’s for (greyed with why when the room is full)', () => {
    const { g, s } = setup();
    openClue(s, REF, g);
    const c = ctx(g, s, { cards: [{ id: 'k1', name: 'Card “Insider tip”', to: ['a'] }, { id: 'k2', name: 'Card 2', to: ['b', 'c'], full: 'The room is full' }] });
    const items = leftNow(c, mainStep(c)!);
    expect(lines(items)).toEqual([
      ['first: Card “Insider tip” hasn’t gone to Ann yet.', '📤 Send it ⏎ · close'],
      ['first: Card 2 hasn’t gone to Bob & Cat yet.', '📤 Send it ⏎ · close'],
    ]);
    expect([ringOf(items), items[1].quick[0].why]).toEqual(['card:k1', 'The room is full']);
  });
});

describe('the check (3.1–3.10)', () => {
  /** Ann picked with no points, at Done. */
  function picked() {
    const { g, s } = setup();
    openClue(s, REF, g);
    s.revealed = true;
    const c = ctx(g, s, { selected: ['a'], amount: 200 });
    const step = mainStep(c)!;
    return { g, s, c, step, items: leftNow(c, step) };
  }

  it('asks only when something is left; Shift+click goes on but for must items; hidden controls in one window', () => {
    const { step, items } = picked();
    expect(goOnDecision('n', step, [], false, false)).toBe('run');
    expect(goOnDecision('n', step, items, false, false)).toBe('open');
    expect(goOnDecision('shift', step, items, false, false)).toBe('run');
    expect(goOnDecision('shift', step, [{ ...items[0], must: true }], false, false)).toBe('open');
    // Controls hidden, one window: points not given can be put right later (↶ Reopen): it goes on. An answer shown early,
    // or a must item, holds (nothing on stream changes). Two windows: the check opens (the controls come back).
    expect(goOnDecision('n', step, items, true, false)).toBe('run');
    const reveal: Step = { ...step, id: 'reveal', reveals: true };
    expect(goOnDecision('n', reveal, items, true, false)).toBe('hold');
    expect(goOnDecision('n', step, [{ ...items[0], must: true }], true, false)).toBe('hold');
    expect(goOnDecision('n', reveal, items, true, true)).toBe('open');
  });

  it('the stage menu’s first item, a click on the blue button, a stage click and the clue row’s Done ask as N does', () => {
    const { step, items } = picked();
    for (const src of ['menu', 'main', 'stage', 'flow', 'enter'] as const) {
      expect([src, goOnDecision(src, step, items, false, false)]).toEqual([src, 'open']);
      expect(asked(src, items)).toEqual(items);
    }
    // (Only Shift+click on the blue button skips: what must be done first still asks.)
    expect(asked('shift', items)).toEqual([]);
    expect(asked('shift', [{ ...items[0], must: true }])).toHaveLength(1);
  });

  it('its words: the heading, "… anyway", the teach line, the ticks', () => {
    const { step, items } = picked();
    const ck = open(step, items);
    expect([headingOf(items), anywayLabel(ck), teachLine(ck)]).toEqual(['loss', '▦ Done anyway: no points', 'Next time: Esc closes at once · Shift+click on the blue button skips this']);
    const buzz: LeftItem = { id: 'buzzers', kind: 'first', quiet: 'buzzers', text: '', quick: [] };
    const reveal: Step = { id: 'reveal', verb: FLOW.reveal, run: () => {}, reveals: true };
    expect([headingOf([buzz]), anywayLabel(open(reveal, [buzz])), teachLine(open(reveal, [buzz])), quietKinds([buzz])]).toEqual([
      'first',
      '👁 Reveal anyway',
      'Next time: R reveals at once · Shift+click on the blue button skips this',
      ['buzzers'],
    ]);
    expect(headingOf([{ ...buzz, done: '✓ Done' }])).toBe('nothing');
  });

  it('items keep their places: one done elsewhere stays, ticked; new ones join at the end; ✓ Nothing left waits', () => {
    const a: LeftItem = { id: 'a', kind: 'loss', text: 'A', quick: [] };
    const b: LeftItem = { id: 'b', kind: 'first', text: 'B', quick: [] };
    const c: LeftItem = { id: 'c', kind: 'first', text: 'C', quick: [] };
    const m = mergeItems([a, b], [{ ...b, text: 'B now' }, c]);
    expect(m.map((i) => `${i.id}:${i.text}${i.done ? ` ${i.done}` : ''}`)).toEqual(['a:A ✓ Done', 'b:B now', 'c:C']);
    expect(todo(m).map((i) => i.id)).toEqual(['b', 'c']);
    expect(mainQuick(m)).toBeNull();
    const none = mergeItems(m, []);
    expect([none.length, headingOf(none)]).toEqual([3, 'nothing']);
  });

  it('keys in it: Enter the ⏎ fix (never anyway or Not yet), N anyway (never into an answer: R), Esc Not yet', () => {
    const { step, items } = picked();
    const ck = open(step, items);
    expect(inside({ key: 'Enter' }, ck, after)).toMatchObject({ do: 'quick', quick: { label: '＋ Award Ann $200 ▶ board' } });
    expect(inside({ key: 'Enter', shift: true }, ck, after)).toMatchObject({ do: 'quick', quick: { label: '− Deduct Ann $200 ▶ board' } });
    expect(inside({ key: 'n' }, ck, after)).toEqual({ do: 'anyway' });
    expect(inside({ key: 'Escape' }, ck, after)).toEqual({ do: 'notyet' });
    expect(inside({ key: 'r' }, ck, after)).toMatchObject({ do: 'flash' });
    // At a reveal N only flashes; R takes "anyway".
    const reveal = open({ id: 'reveal', verb: FLOW.reveal, run: () => {}, reveals: true }, [{ id: 'buzzers', kind: 'first', text: '', quick: [{ label: '🔔 Open the buzzers', key: 'U', enter: true, then: 'close', run: () => {} }] }]);
    expect(inside({ key: 'n' }, reveal, after)).toEqual({ do: 'flash', say: 'Enter: 🔔 Open the buzzers · R: 👁 Reveal anyway' });
    expect(inside({ key: 'r' }, reveal, after)).toEqual({ do: 'anyway' });
    expect(inside({ key: 'u' }, reveal, after)).toMatchObject({ do: 'quick', quick: { label: '🔔 Open the buzzers' } });
    // Nothing left: Enter and N take the step.
    const nothing = open(step, mergeItems(items, []));
    expect([inside({ key: 'Enter' }, nothing, after), inside({ key: 'n' }, nothing, after)]).toEqual([{ do: 'step' }, { do: 'step' }]);
    // A must item: no anyway.
    const must = open(step, [{ ...items[0], must: true }]);
    expect(inside({ key: 'n' }, must, after)).toMatchObject({ do: 'flash' });
  });

  it('keys in it keep their meaning: numbers pick, the cover, sounds and full screen work; others close it first', () => {
    const { step, items } = picked();
    const ck = open(step, items);
    for (const key of ['1', '0', 'k', 'b', 'm', ' ', 'ArrowLeft', 'ArrowRight', 'f']) expect(inside({ key }, ck, after), key).toEqual({ do: 'pass' });
    for (const key of ['?', 'l', 'a', 'h']) expect(inside({ key }, ck, after), key).toEqual({ do: 'leave' });
    expect(inside({ key: 'z', ctrl: true }, ck, after)).toEqual({ do: 'leave' });
    expect(inside({ key: 'Tab' }, ck, after)).toEqual({ do: 'native' });
    // A stray key changes nothing under it; a held one never repeats.
    for (const key of ['q', 'w', 'd', 'p', 'Delete']) expect(inside({ key }, ck, after), key).toEqual({ do: 'ignore' });
    expect(inside({ key: 'Enter', repeat: true }, ck, after)).toEqual({ do: 'ignore' });
  });

  it('the guard: for 600 ms keys do nothing but say what they will do (Esc never waits); a second Esc bounces', () => {
    const { step, items } = picked();
    const ck = open(step, items);
    const n = inside({ key: 'n' }, ck, 1000 + CHECK_GUARD_MS - 1);
    expect(n).toEqual({ do: 'swallow', then: { do: 'anyway' } });
    expect(swallowSay({ key: 'n' }, n.do === 'swallow' ? n.then : n, ck)).toBe('N again: ▦ Done anyway: no points');
    expect(inside({ key: 'Enter' }, ck, 1200)).toMatchObject({ do: 'swallow', then: { do: 'quick' } });
    expect(inside({ key: 'Escape' }, ck, 1001)).toEqual({ do: 'notyet' });
    expect(inside({ key: '1' }, ck, 1001)).toEqual({ do: 'ignore' });
    expect([escBounce(5000, 5000 + CHECK_GUARD_MS - 1), escBounce(5000, 5000 + CHECK_GUARD_MS)]).toEqual([true, false]);
    // Another key or click since Not yet: the next Esc is the host's own, not a bounce (a click-away that was the Not yet
    // itself still counts as one).
    expect([escBounce(5000, 5100, 5050), escBounce(5000, 5100, 4990), escBounce(5000, 5100, 5000)]).toEqual([false, true, true]);
  });

  it('presses it takes (6.2): N, N closes a clue with no points as before; Shift+click once; U, O and Enter do the boxes’ jobs at once', () => {
    const { step, items } = picked();
    // N: the check opens; N again (after the guard) is "anyway": 2 presses, as N, N with the old toast.
    let presses = 1;
    expect(goOnDecision('n', step, items, false, false)).toBe('open');
    presses++;
    expect(inside({ key: 'n' }, open(step, items), after)).toEqual({ do: 'anyway' });
    expect(presses).toBe(2);
    // Shift+click: 1. A click, then "anyway": 2 (the button). Esc never goes through the check: 1.
    expect(goOnDecision('shift', step, items, false, false)).toBe('run');
    // N with the buzzers never opened: N, then Enter (2), or U at once (1, never the check).
    const reveal: Step = { id: 'reveal', verb: FLOW.reveal, run: () => {}, reveals: true };
    const buzz: LeftItem[] = [{ id: 'buzzers', kind: 'first', text: '', quick: [{ label: '🔔 Open the buzzers', key: 'U', enter: true, then: 'close', run: () => {} }] }];
    expect([goOnDecision('n', reveal, buzz, false, false), inside({ key: 'Enter' }, open(reveal, buzz), after).do]).toEqual(['open', 'quick']);
  });
});

describe('a 🤝 partner clue (3.4 H)', () => {
  /** What Play says of the open partner clue, Bob describing to Ann. */
  const pnow = (over: Partial<PartnerNow> = {}): PartnerNow => ({
    wheel: null,
    teams: false,
    people: [],
    giverVerb: 'describes',
    cards: 1,
    send: [],
    copy: [],
    secs: 45,
    clock: null,
    judged: false,
    got: 'Bob +$400 · Ann +$200',
    missed: 'no points',
    stealOn: false,
    stealers: [],
    pair: ['b', 'a'],
    ...over,
  });
  /** A partner tile open on PARTNER UP!, nobody marked. */
  function partnerUp() {
    const { g, s } = setup();
    board(g).categories[0].clues[1].type = 'partner';
    openClue(s, REF, g);
    delete s.partner!.pickerId;
    return { g, s };
  }

  it('PARTNER UP!: the blue button is Show question ▶ (Enter too); with the partner wheel up, Next ▶ (greyed while it turns)', () => {
    const { g, s } = partnerUp();
    // (Without the partner clue's state, nothing to go on with.)
    expect(mainStep(ctx(g, s))).toBeNull();
    const st = mainStep(ctx(g, s, { partner: pnow() }))!;
    expect([said(st), st.id]).toEqual(['Show question ▶ · N · enterIsNext', 'question']);
    st.run();
    const up = mainStep(ctx(g, s, { partner: pnow({ wheel: 'landed' }) }))!;
    expect([said(up), up.busy]).toEqual(['Next ▶ · N · enterIsNext', undefined]);
    up.run();
    expect(did).toEqual(['show', 'closewheel']);
    expect(leftNow(ctx(g, s, { partner: pnow({ wheel: 'landed' }) }), up)).toEqual([]);
    expect(mainStep(ctx(g, s, { partner: pnow({ wheel: 'turning' }) }))!.busy).toBe('Still spinning: wait for it to land');
    // (No ▦ Done ▶ board as a skip before the question.)
    expect(doneStep(ctx(g, s, { partner: pnow() }))).toBeNull();
  });

  it('PARTNER UP!: who picked it, then the partner, are must items (no anyway); 1–9 pick, W spins, the spin ringed', () => {
    const { g, s } = partnerUp();
    const c = ctx(g, s, { partner: pnow() });
    const st = mainStep(c)!;
    const who = leftNow(c, st);
    expect(lines(who)).toEqual([['first must: Who picked it?', 'Ann [1] · keep', 'Bob [2] · keep', 'Cat [3] · keep']]);
    const ck = open(st, who);
    expect([anywayLabel(ck), teachLine(ck), enterQuick(who)]).toEqual(['Show question anyway', '', null]);
    expect(inside({ key: 'Enter' }, ck, after)).toEqual({ do: 'flash', say: 'Who picked it? Press their number, or click their name' });
    expect(inside({ key: 'n' }, ck, after)).toMatchObject({ do: 'flash' });
    expect(inside({ key: '2' }, ck, after)).toEqual({ do: 'pass' });
    expect(goOnDecision('shift', st, who, false, false)).toBe('open');
    expect(lines(leftNow(ctx(g, s, { partner: pnow({ teams: true }) }), st))[0][0]).toBe('first must: Which team picked it?');
    // Ann picked it: her partner next, the wheel first and ringed, then the others by hand.
    s.partner!.pickerId = 'a';
    const need = leftNow(c, st);
    expect(lines(need)).toEqual([['first must: Ann needs a partner first.', '🎡 Spin for a partner [W] ⏎ · close', 'Bob [2] · close', 'Cat [3] · close']]);
    expect([ringOf(need), need[0].quick[0].after, need[0].quick[2].after]).toEqual(['partnerspin', 'Spinning… then Next ▶ shows the pair', 'Cat partners Ann · Show question ▶ (N) next']);
    expect(inside({ key: 'w' }, open(st, need), after)).toMatchObject({ do: 'quick', quick: { label: '🎡 Spin for a partner' } });
    expect(inside({ key: 'Enter' }, open(st, need), after)).toMatchObject({ do: 'quick', quick: { label: '🎡 Spin for a partner' } });
    need[0].quick[0].run();
    need[0].quick[2].run();
    expect(did).toEqual(['spin', 'partner c']);
    // On the wheel too: Solo.
    s.partner!.includePicker = true;
    expect(lines(leftNow(c, st))[0][2]).toBe('Ann (Solo) [1] · close');
    // The pair set: nothing left, it goes on.
    s.partner!.partnerId = 'b';
    expect(leftNow(c, st)).toEqual([]);
    expect(goOnDecision('n', st, [], false, false)).toBe('run');
  });

  it('PARTNER UP!: teams, the picker’s own team plays it: who describes; nobody to partner with: Solo or ↩ Put back (⇧Esc)', () => {
    const { g, s } = partnerUp();
    s.partner!.pickerId = 'a';
    s.partner!.partnerId = 'a';
    const people = [
      { id: 'm1', name: 'Zoe' },
      { id: 'm2', name: 'Max' },
    ];
    const c = ctx(g, s, { partner: pnow({ teams: true, people }) });
    const st = mainStep(c)!;
    const items = leftNow(c, st);
    expect(lines(items)).toEqual([['first must: Who describes for Ann?', '🎡 Spin for the describer [W] ⏎ · close', 'Zoe · close', 'Max · close']]);
    expect(ringOf(items)).toBe('describerspin');
    items[0].quick[2].run();
    expect(did).toEqual(['describer m2']);
    s.partner!.member = { id: 'm2', name: 'Max' };
    expect(leftNow(c, st)).toEqual([]);
    // Ann alone in the game, not on the wheel.
    delete s.partner!.partnerId;
    delete s.partner!.member;
    s.players = s.players.slice(0, 1);
    const none = leftNow(ctx(g, s, { partner: pnow() }), st);
    expect(lines(none)).toEqual([['first must: Nobody else can be Ann’s partner.', 'Ann plays it alone (Solo) ⏎ · close', '↩ Put back (keep tile) [⇧Esc] · close']]);
    expect(inside({ key: 'Escape', shift: true }, open(st, none), after)).toMatchObject({ do: 'quick', quick: { label: '↩ Put back (keep tile)' } });
    expect(ringOf(none)).toBeNull();
  });

  /** The question up, Bob describing to Ann, at 👁 Reveal answer. */
  function question(stage: 'distribute' | 'live') {
    const { g, s } = partnerUp();
    Object.assign(s.partner!, { pickerId: 'a', partnerId: 'b', stage });
    return { g, s };
  }

  it('the hand-out at 👁 Reveal answer: 📤 Send and start (⏎), ringed; N never reveals (R does); card names, never words', () => {
    const { g, s } = question('distribute');
    const c = ctx(g, s, { partner: pnow({ send: [{ name: 'Card 1', to: ['c'] }] }) });
    const st = mainStep(c)!;
    expect(said(st)).toBe('👁 Reveal answer · N · reveals');
    const items = leftNow(c, st);
    expect(lines(items)).toEqual([['first: Card 1 hasn’t gone to Cat’s phone, and the clock hasn’t started: they haven’t played yet.', '📤 Send and start ⏎ · close']]);
    const ck = open(st, items);
    expect([ringOf(items), anywayLabel(ck), items[0].quick[0].after]).toEqual(['handout', '👁 Reveal anyway: they haven’t played', 'Card sent, clock running: ✔ Got it (Enter) or ✘ Missed (Shift+Enter) once they’ve played']);
    // N, N, N: never the answer. Enter sends; R reveals anyway.
    for (let i = 0; i < 3; i++) expect(inside({ key: 'n' }, ck, after + i * 700)).toEqual({ do: 'flash', say: 'Enter: 📤 Send and start · R: 👁 Reveal anyway: they haven’t played' });
    expect(inside({ key: 'Enter' }, ck, after)).toMatchObject({ do: 'quick', quick: { label: '📤 Send and start' } });
    expect(inside({ key: 'r' }, ck, after)).toEqual({ do: 'anyway' });
    // With the controls hidden in one window: it holds (nothing on stream changes).
    expect(goOnDecision('n', st, items, true, false)).toBe('hold');
    // The room full: greyed with why. The clock running (T): 📤 Send the cards (clock running).
    const full = leftNow(ctx(g, s, { partner: pnow({ send: [{ name: 'Card 1', to: ['c'] }], full: 'The room takes 8 cards' }) }), st);
    expect([full[0].quick[0].why, inside({ key: 'Enter' }, open(st, full), after)]).toEqual(['The room takes 8 cards', { do: 'flash', say: 'The room takes 8 cards' }]);
    const t = leftNow(ctx(g, s, { partner: pnow({ send: [{ name: 'Card 1', to: ['c'] }], clock: { left: 40, running: true } }) }), st);
    expect(lines(t)).toEqual([['first: Card 1 hasn’t gone to Cat’s phone yet, though the clock is running.', '📤 Send the cards (clock running) ⏎ · close']]);
    expect(JSON.stringify(items)).not.toMatch(/words|clue text/i);
  });

  it('the hand-out copied by hand: ⏱ Start the clock (⏎) and 📋 Copy; no cards to hand out: the clock', () => {
    const { g, s } = question('distribute');
    const copy = [{ id: 'k1', name: 'Card 1', to: ['c'], phoneless: true, what: 'words' as const }];
    const c = ctx(g, s, { partner: pnow({ copy }) });
    const items = leftNow(c, mainStep(c)!);
    expect(lines(items)).toEqual([['first: Card 1 is for Cat (no phone here): copy it to them, then start the clock.', '⏱ Start the clock (45 s) ⏎ · close', '📋 Copy Card 1’s words · keep']]);
    items[0].quick[1].run();
    expect(did).toEqual(['copy k1']);
    // Copied (for who gets it now): its quick button says so.
    const copied = leftNow(ctx(g, s, { partner: pnow({ copy: [{ ...copy[0], copied: true }] }) }), mainStep(c)!);
    expect(lines(copied)[0][2]).toBe('📋 Copy Card 1’s words ✓ · keep');
    // A card to a phone and one copied: both said, 📤 first.
    const both = leftNow(ctx(g, s, { partner: pnow({ send: [{ name: 'Card 2', to: ['a'] }], copy }) }), mainStep(c)!);
    expect(lines(both)).toEqual([
      ['first: Card 2 hasn’t gone to Ann’s phone, and the clock hasn’t started: they haven’t played yet. Card 1 is to copy by hand for Cat (no phone here).', '📤 Send and start ⏎ · close', '📋 Copy Card 1’s words · keep'],
    ]);
    expect(lines(leftNow(ctx(g, s, { partner: pnow() }), mainStep(c)!))).toEqual([['first: The clock hasn’t started: they haven’t played yet.', '⏱ Start the clock (45 s) ⏎ · close']]);
  });

  it('live: still playing (✔ Got it ⏎ / ✘ Missed ⇧⏎ then the answer); time up, revealing doesn’t ask; a steal', () => {
    const { g, s } = question('live');
    const c = ctx(g, s, { partner: pnow({ clock: { left: 23, running: true } }) });
    const st = mainStep(c)!;
    const items = leftNow(c, st);
    expect(lines(items)).toEqual([['first: Bob & Ann are still playing (23 s left).', '✔ Got it (Bob +$400 · Ann +$200) ▶ reveal ⏎ · go', '✘ Missed (no points) ▶ reveal [⇧⏎] · go']]);
    expect([ringOf(items), anywayLabel(open(st, items))]).toEqual([null, '👁 Reveal anyway']);
    expect(inside({ key: 'Enter', shift: true }, open(st, items), after)).toMatchObject({ do: 'quick', quick: { label: '✘ Missed (no points) ▶ reveal' } });
    expect(lines(leftNow(ctx(g, s, { partner: pnow({ clock: { left: 23, running: true }, stealOn: true }) }), st))[0][2]).toBe('✘ Missed: a steal opens [⇧⏎] · close');
    expect(leftNow(ctx(g, s, { partner: pnow({ clock: 'out' }) }), st)).toEqual([]);
    expect(lines(leftNow(ctx(g, s, { partner: pnow() }), st))[0][0]).toBe('first: Not judged yet: did Bob & Ann get it?');
    expect(lines(leftNow(ctx(g, s, { partner: pnow({ cards: 0 }) }), st))).toEqual([['first: The clock hasn’t started: they haven’t played yet.', '⏱ Start the clock (45 s) ⏎ · close']]);
    // Judged, a steal open: who steals it (their number); one picked: right or wrong.
    const steal = leftNow(ctx(g, s, { partner: pnow({ judged: true, stealers: ['c'] }) }), st);
    expect([lines(steal), anywayLabel(open(st, steal))]).toEqual([[['first: A steal is open: Cat can still steal it.', 'Cat steals it [3] · close']], '👁 Reveal anyway: nobody steals it']);
    const on = leftNow(ctx(g, s, { partner: pnow({ judged: true, stealers: ['c'] }), selected: ['c'], amount: 400 }), st);
    expect(lines(on)).toEqual([['first: Cat is stealing it: right or wrong?', '＋ Award Cat $400 ▶ reveal ⏎ · go', '− Deduct Cat $400 [⇧⏎] · keep']]);
    expect(leftNow(ctx(g, s, { partner: pnow({ judged: true }) }), st)).toEqual([]);
  });

  it('at ▦ Done ▶ board: not judged loses their points (✔ / ✘ ▶ board); judged, nothing', () => {
    const { g, s } = question('live');
    s.revealed = true;
    const c = ctx(g, s, { partner: pnow() });
    const st = mainStep(c)!;
    expect(said(st)).toBe('▦ Done ▶ board · N');
    const items = leftNow(c, st);
    expect(lines(items)).toEqual([['loss: Not judged yet: did Bob & Ann get it?', '✔ Got it ▶ board ⏎ · go', '✘ Missed ▶ board [⇧⏎] · go']]);
    expect([headingOf(items), anywayLabel(open(st, items))]).toEqual(['loss', '▦ Done anyway: no points']);
    items[0].quick[0].run();
    expect(did).toEqual(['got']);
    expect(leftNow(ctx(g, s, { partner: pnow({ judged: true }) }), st)).toEqual([]);
  });

  it('presses it takes (6.2): W spins at once, or N then W or Enter; Enter sends at once, or N then Enter', () => {
    const { g, s } = partnerUp();
    s.partner!.pickerId = 'a';
    const c = ctx(g, s, { partner: pnow() });
    const st = mainStep(c)!;
    const items = leftNow(c, st);
    expect([goOnDecision('n', st, items, false, false), inside({ key: 'Enter' }, open(st, items), after).do, inside({ key: 'w' }, open(st, items), after).do]).toEqual(['open', 'quick', 'quick']);
    Object.assign(s.partner!, { partnerId: 'b', stage: 'distribute' });
    const d = ctx(g, s, { partner: pnow({ send: [{ name: 'Card 1', to: ['c'] }] }) });
    const reveal = mainStep(d)!;
    const hand = leftNow(d, reveal);
    expect([goOnDecision('n', reveal, hand, false, false), inside({ key: 'Enter' }, open(reveal, hand), after).do]).toEqual(['open', 'quick']);
  });
});

describe('wheels, dice, the scores and pop-ups over the stage (3.4 F, G, M)', () => {
  /** A wheel tile open with its own wheel up (`question`: a question after it), every slice `slice` (+$100 by default). */
  function wheelTile(question = true, slice: Partial<WheelSegment> = {}) {
    const { g, s } = setup();
    const w = newWheel('Bonus', ['A', 'B']);
    for (const seg of w.segments) Object.assign(seg, slice);
    g.wheels = [w];
    const clue = board(g).categories[0].clues[1];
    clue.type = 'wheel';
    clue.wheelId = w.id;
    if (question) setSlideText(clue.questionSlide, 'What spins?');
    openClue(s, REF, g);
    s.currentPickerId = 'a';
    const live = newLive();
    openWheel(live, s, w);
    live.toolTile = clue.id;
    const o = live.overlay!;
    if (o.kind !== 'wheel') throw new Error('no wheel');
    /** Spin it, landed (`at`: when it's read). */
    const spun = () => {
      spinWheel(live, s, g);
      return o.spin!.startedAt + o.spin!.duration + 1;
    };
    return { g, s, live, o, spun };
  }

  it('a tile’s own wheel: Show question ▶ (a tile with no question: ▦ Done ▶ board), greyed while it turns', () => {
    const { g, s, live, spun } = wheelTile();
    const st = mainStep(ctx(g, s, { live }))!;
    expect([said(st), st.id, st.tool, st.busy, st.flow]).toEqual(['Show question ▶ · N', 'tool', 'spin', undefined, undefined]);
    st.run();
    expect(did).toEqual(['closetool']);
    const at = spun();
    const turning = mainStep(ctx(g, s, { live, now: at - 2 }))!;
    expect([turning.busy, turning.tool]).toEqual(['Still spinning: wait for it to land', undefined]);
    expect([mainStep(ctx(g, s, { live, now: at }))!.busy, leftNow(ctx(g, s, { live, now: at - 2 }), turning)]).toEqual([undefined, []]);
    const none = wheelTile(false);
    const done = mainStep(ctx(none.g, none.s, { live: none.live }))!;
    expect([said(done), done.flow]).toEqual(['▦ Done ▶ board · N', 'done']);
    // Dice: 🎲 Roll! (D ⏎), greyed "Still rolling" while they roll; a roll-off from the tools row too.
    board(g).categories[0].clues[1].type = 'dice';
    openDice(live, quickDice(6, 1, 'd6'));
    const dc = ctx(g, s, { live });
    expect([mainStep(dc)!.tool, lines(leftNow(dc, mainStep(dc)!))]).toEqual(['roll', [['first: The dice haven’t been rolled yet: the question comes after.', '🎲 Roll! [D] ⏎ · close']]]);
    live.overlay = { kind: 'rolloff', nonce: 'r', sides: 20, rounds: [], ranking: ['a'], winner: 'a', startedAt: 10, roundMs: 1000 };
    expect([mainStep(ctx(g, s, { live, now: 11 }))!.busy, said(mainStep(ctx(g, s, { live, now: 99999 })))]).toEqual(['Still rolling: wait for it to land', 'Next ▶ · N']);
  });

  it('a tile’s own wheel not spun: "First:", 🎡 Spin! (W ⏎), ringed, silenced by its tick; no question: closing keeps the tile', () => {
    const { g, s, live } = wheelTile();
    const c = ctx(g, s, { live });
    const st = mainStep(c)!;
    const items = leftNow(c, st);
    expect(lines(items)).toEqual([['first: The wheel hasn’t spun yet: its question comes after.', '🎡 Spin! [W] ⏎ · close']]);
    const ck = open(st, items);
    expect([ringOf(items), quietKinds(items), items[0].quick[0].after, anywayLabel(ck), teachLine(ck)]).toEqual([
      'toolslot',
      ['tool'],
      'Spinning… then Show question ▶ (N)',
      'Show question anyway',
      'Next time: Esc closes at once · Shift+click on the blue button skips this',
    ]);
    // N, then Enter or W, spins (2); W spins at once (1, never the check). N again goes on without it.
    expect([goOnDecision('n', st, items, false, false), inside({ key: 'Enter' }, ck, after).do, inside({ key: 'w' }, ck, after).do, inside({ key: 'n' }, ck, after).do]).toEqual(['open', 'quick', 'quick', 'anyway']);
    items[0].quick[0].run();
    expect(did).toEqual(['spin']);
    // With the controls hidden in one window it goes on (the tile can be opened again).
    expect(goOnDecision('n', st, items, true, false)).toBe('run');
    s.goonQuiet = ['tool'];
    expect(leftNow(c, st)).toEqual([]);
    const none = wheelTile(false);
    const nc = ctx(none.g, none.s, { live: none.live });
    const ni = leftNow(nc, mainStep(nc)!);
    expect([lines(ni)[0][0], anywayLabel(open(mainStep(nc)!, ni))]).toEqual(['first: The wheel hasn’t spun yet.', 'Close without spinning (the tile stays on the board)']);
  });

  it('landed on “Spin again”: ↻ Spin again (W ⏎); a "land once" wheel used up never asks to spin', () => {
    const { g, s, live, spun } = wheelTile(true, { label: 'Spin again' });
    const at = spun();
    const c = ctx(g, s, { live, now: at });
    expect(lines(leftNow(c, mainStep(c)!))).toEqual([['first: It landed on “Spin again”.', '↻ Spin again [W] ⏎ · close']]);
    const used = wheelTile();
    g.wheels = used.g.wheels;
    used.g.wheels[0].removeAfterLanding = true;
    used.s.removedSegments = { [used.g.wheels[0].id]: used.g.wheels[0].segments.map((x) => x.id) };
    const uc = ctx(used.g, used.s, { live: used.live });
    expect([mainStep(uc)!.tool, leftNow(uc, mainStep(uc)!)]).toEqual([undefined, []]);
  });

  it('a score effect not given: ✔ Give Ann +$100 ▶ question (⏎, then the question), lost for good: it holds with the controls hidden', () => {
    const { g, s, live, o, spun } = wheelTile(true, { scoreAction: { kind: 'addPoints', amount: 100 } });
    const at = spun();
    const c = ctx(g, s, { live, now: at });
    const st = mainStep(c)!;
    const items = leftNow(c, st);
    const key = scoreCards(o, at)[0].key;
    expect(lines(items)).toEqual([['loss: The wheel’s “+$100” for Ann isn’t given yet.', '✔ Give Ann +$100 ▶ question ⏎ · go']]);
    const ck = open(st, items);
    expect([headingOf(items), anywayLabel(ck), teachLine(ck), ringOf(items)]).toEqual(['loss', 'Show question without it', 'Next time: Shift+click on the blue button skips this', null]);
    expect([goOnDecision('n', st, items, true, false), goOnDecision('n', st, items, true, true)]).toEqual(['hold', 'open']);
    items[0].quick[0].run();
    expect(did).toEqual([`score ${key}`]);
    // Tagged for Bob in "This was for": it's Bob's. Given (or skipped): nothing left.
    s.rollLog!.at(-1)!.playerIds = ['b'];
    expect(leftNow(c, st)[0].quick[0].label).toBe('✔ Give Bob +$100 ▶ question');
    o.cardsDone = { [key]: true };
    expect(leftNow(c, st)).toEqual([]);
  });

  it('a steal, a swap or nobody to give it to: Choose in the box (⏎ puts the keys on it); its tile has no question: ▶ board', () => {
    const { g, s, live, o, spun } = wheelTile(false, { scoreAction: { kind: 'steal', amount: 50 } });
    const at = spun();
    const c = ctx(g, s, { live, now: at });
    const st = mainStep(c)!;
    const items = leftNow(c, st);
    const key = scoreCards(o, at)[0].key;
    expect(lines(items)).toEqual([['loss: The wheel’s “Steal $50” for Ann isn’t given yet: choose who in the wheel’s box.', 'Choose in the box ⏎ · close']]);
    expect([anywayLabel(open(st, items)), items[0].focus]).toEqual(['▦ Done without it', `.play .panel [data-score-card="${key}"] button:not(:disabled)`]);
    items[0].quick[0].run();
    expect(did).toEqual([`focus ${items[0].focus}`]);
    // A plain one with nobody chosen (no picker): the same.
    const plain = wheelTile(true, { scoreAction: { kind: 'addPoints', amount: 100 } });
    delete plain.s.currentPickerId;
    const pc = ctx(plain.g, plain.s, { live: plain.live, now: plain.spun() });
    expect(lines(leftNow(pc, mainStep(pc)!))[0]).toEqual(['loss: The wheel’s “+$100” isn’t given yet: choose who in the wheel’s box.', 'Choose in the box ⏎ · close']);
    // Chosen in the box: one click gives it.
    draftPick(plain.live, plain.s, scoreCards(plain.o, pc.now)[0], 'c');
    expect(leftNow(pc, mainStep(pc)!)[0].quick[0].label).toBe('✔ Give Cat +$100 ▶ question');
  });

  it('a tool from the tools row, the scores, a sheet, a roll-off: Next ▶ only puts it away, and never asks about spinning', () => {
    const { g, s } = setup();
    const live = newLive();
    const w = newWheel('Bonus', ['A', 'B']);
    for (const seg of w.segments) seg.scoreAction = { kind: 'addPoints', amount: -50 };
    g.wheels = [w];
    openWheel(live, s, w);
    const c = ctx(g, s, { live });
    const st = mainStep(c)!;
    expect([said(st), st.id, st.tool]).toEqual(['Next ▶ · N', 'tool', undefined]);
    expect(leftNow(c, st)).toEqual([]);
    s.currentPickerId = 'b';
    spinWheel(live, s, g);
    const o = live.overlay!;
    const at = o.kind === 'wheel' ? o.spin!.startedAt + o.spin!.duration + 1 : 0;
    expect(mainStep(ctx(g, s, { live, now: at - 2 }))!.busy).toBe('Still spinning: wait for it to land');
    const left = leftNow(ctx(g, s, { live, now: at }), st);
    expect(lines(left)).toEqual([['loss: The wheel’s “−$50” for Bob isn’t given yet.', '✔ Give Bob −$50 and put it away ⏎ · go']]);
    expect(anywayLabel(open(st, left))).toBe('Next ▶ without it');
    // The scores over it: Next ▶ puts them away (the wheel comes back). A sheet: the same.
    toggleScoreboard(live);
    expect([said(mainStep(ctx(g, s, { live, now: at }))), leftNow(ctx(g, s, { live, now: at }), st)]).toEqual(['Next ▶ · N', []]);
    live.overlay = { kind: 'sheet', nonce: 'x', playerId: 'a' };
    expect(said(mainStep(ctx(g, s, { live })))).toBe('Next ▶ · N');
    // Dice from the tools row, not rolled: nothing to ask. A shop has its 🚪 Leave shop: no blue button.
    openDice(live, quickDice(6, 1, 'd6'));
    expect([said(mainStep(ctx(g, s, { live }))), leftNow(ctx(g, s, { live }), st)]).toEqual(['Next ▶ · N', []]);
    live.overlay = { kind: 'shop', nonce: 'y', shopId: 'z' };
    expect(mainStep(ctx(g, s, { live }))).toBeNull();
  });

  it('a question pop-up: 👁 Reveal answer (never asks), then Next ▶; asks when Ann is picked with no points for it', () => {
    const { g, s } = setup();
    s.phase = 'rpg';
    const live = newLive();
    live.overlay = { kind: 'popup', nonce: 'p', slide: board(g).categories[0].clues[1].questionSlide, answer: board(g).categories[0].clues[1].answerSlide, revealed: false, value: 200, at: 1000 };
    const reveal = mainStep(ctx(g, s, { live, selected: ['a'] }))!;
    expect([said(reveal), reveal.id, leftNow(ctx(g, s, { live, selected: ['a'] }), reveal)]).toEqual(['👁 Reveal answer · N · reveals', 'popreveal', []]);
    reveal.run();
    expect(did).toEqual(['revealpopup']);
    if (live.overlay.kind === 'popup') live.overlay.revealed = true;
    const c = ctx(g, s, { live, selected: ['a'], amount: 200 });
    const next = mainStep(c)!;
    const items = leftNow(c, next);
    expect([said(next), lines(items)]).toEqual(['Next ▶ · N', [['loss: Ann is picked and has no points for this question.', '＋ Award Ann $200 and close it ⏎ · go', '− Deduct Ann $200 and close it [⇧⏎] · go']]]);
    expect(anywayLabel(open(next, items))).toBe('Next anyway: no points');
    items[0].quick[1].run();
    expect(did).toEqual(['revealpopup', '-200 a']);
    // Points given since it came up: nothing left. Nobody picked, or a sign with no answer: nothing either.
    s.scoreLog.push({ id: 'e', playerId: 'a', delta: 200, reason: 'x', ts: 2000 });
    expect(leftNow(c, next)).toEqual([]);
    expect(leftNow(ctx(g, s, { live, selected: ['b', 'c'], amount: 200 }), next)[0].quick.map((q) => `${q.line}: ${q.label}`)).toEqual(['Bob: ＋ Award $200', 'Bob: − Deduct', 'Cat: ＋ Award $200', 'Cat: − Deduct']);
    live.overlay = { kind: 'popup', nonce: 'q', slide: board(g).categories[0].clues[1].questionSlide };
    expect([said(mainStep(ctx(g, s, { live, selected: ['b'] }))), leftNow(ctx(g, s, { live, selected: ['b'] }), next)]).toEqual(['Next ▶ · N', []]);
  });

  it('a Daily Double’s typed values: who found it, the wager, the max, a phone’s on its way (never its amount)', () => {
    const { g, s } = setup();
    board(g).categories[0].clues[1].type = 'dailyDouble';
    openClue(s, REF, g);
    s.dd!.playerId = undefined;
    expect(ddWaits(ctx(g, s))).toEqual({ say: 'Who found it? Click their name (the keys stay in the Wager box)', at: 'names' });
    s.dd!.playerId = 'a';
    expect(ddWaits(ctx(g, s))).toEqual({ say: 'Type a wager (Ann can wager up to $1,000), or True Daily Double', at: 'wager' });
    expect(ddWaits(ctx(g, s, { ddPhone: true }))!.say).toBe('Waiting on Ann’s phone: type their wager here if it doesn’t come');
    s.dd!.draft = -5;
    expect(ddWaits(ctx(g, s))!.say).toBe('A wager can’t be below 0: type 0 or more');
    s.dd!.draft = 5000;
    expect([ddWaits(ctx(g, s)), ddWaits(ctx(g, s, { wagerLimitsOff: false }))!.say]).toEqual([null, 'Over Ann’s max ($1,000): type less, or tick Ignore the limit']);
    // A phone's wager in: the words never say it.
    s.dd!.draftFrom = 'phone';
    expect(JSON.stringify(ddWaits(ctx(g, s, { wagerLimitsOff: false })))).not.toContain('5,000');
    s.dd!.draft = 400;
    expect(ddWaits(ctx(g, s, { wagerLimitsOff: false }))).toBeNull();
  });
});

describe('the Final, the tiebreaker and the end screen (3.4 I, J, K)', () => {
  const FIN: FinalNow = { teams: false, wagerPhones: [] };
  /** Into the Final (everyone plays it), at `step`: the wagers in (Ann $100, Bob $50, Cat $0) past the wagers. */
  function final(step: NonNullable<Session['finalStep']> = 'wagers') {
    const { g, s } = setup();
    goToRound(s, g, 1);
    s.intro = null;
    const f = s.final!;
    if (step !== 'wagers') Object.assign(f.wagers, { a: 100, b: 50, c: 0 });
    s.finalStep = step;
    if (step === 'reveal') f.current = f.order[0];
    return { g, s, f };
  }

  it('the Final’s blue button: Show question ▶ (Enter is Next), its slides, 👁 Reveal answer (a clue’s name), Start player reveals ▶, from FLOW only', () => {
    const { g, s, f } = final();
    const c = () => ctx(g, s, { final: FIN });
    expect([said(mainStep(c())), mainStep(c())!.id]).toEqual(['Show question ▶ · N · enterIsNext', 'finalshow']);
    // Nobody plays it: on past it.
    f.players = [];
    expect(said(mainStep(c()))).toBe('Finish game ▶ · N · enterIsNext');
    f.players = ['a', 'b', 'c'];
    s.finalStep = 'question';
    const fr = g.rounds[1] as FinalRound;
    fr.extraSlides = [{ ...fr.questionSlide, id: 'q2' }];
    expect(said(mainStep(c()))).toBe('Next slide ▶ · N');
    s.slide = 1;
    const reveal = mainStep(c())!;
    expect([said(reveal), reveal.id, reveal.flow]).toEqual(['👁 Reveal answer · N · reveals', 'finalreveal', 'reveal']);
    s.finalStep = 'answer';
    expect(said(mainStep(c()))).toBe('Start player reveals ▶ · N');
    expect(said(mainStep(ctx(g, s, { final: { ...FIN, teams: true } })))).toBe('Start team reveals ▶ · N');
    expect(leftNow(c(), mainStep(c())!)).toEqual([]);
    mainStep(c())!.run();
    expect(did).toEqual(['finalon']);
    const flow = new Set<string>([...Object.values(FLOW).flatMap((v) => (typeof v === 'function' ? [] : [v.label])), FLOW.nextPlayer('player').label]);
    for (const st of ['wagers', 'question', 'reveal'] as const) {
      s.finalStep = st;
      expect(flow.has(mainStep(c())!.verb.label), st).toBe(true);
    }
  });

  it('the wagers are typed: the keys go to the first box to fill, never a check; with them in, a 🤫 card not sent asks first', () => {
    const { g, s, f } = final();
    f.wagers = { a: 100 };
    const c = (over: Partial<GoCtx> = {}) => ctx(g, s, { final: { ...FIN, wagerPhones: ['b'] }, ...over });
    const cards = [{ id: 'k', name: 'Card “Hint”', to: ['a'] }];
    expect(finalWaits(c())).toEqual({
      say: 'Waiting on Bob’s phone & Cat: type their wagers, or Sits out',
      at: '.play .panel input[data-wager="b"]',
      row: '.play .panel .wrow[data-player="b"]',
    });
    // (The blue button is never greyed, and no check opens while a wager is missing, a card or not.)
    const st = mainStep(c({ cards }))!;
    expect([st.busy, leftNow(c({ cards }), st)]).toEqual([undefined, []]);
    f.phonesLocked = true;
    expect(finalWaits(c())!.say).toBe('Waiting on Bob & Cat: type their wagers, or Sits out');
    f.wagers = { a: 100, b: 50, c: 2.5 };
    expect(finalWaits(c())!.say).toBe('Not a whole number: Cat (type a whole number, 0 or more)');
    applyScore(s, g, ['a'], 300, 'x');
    f.wagers = { a: 5000, b: 0, c: 0 };
    expect([finalWaits(c()), finalWaits(c({ wagerLimitsOff: false }))!.say]).toEqual([null, 'Over Ann’s max ($300): type less, or tick Ignore the limits']);
    // All in: the Final's card not sent yet ("First:", ⏎ sends it), its name and who it's for, never its words.
    const items = leftNow(c({ cards }), st);
    expect(lines(items)).toEqual([['first: The Final’s card “Hint” hasn’t gone to Ann yet.', '📤 Send it ⏎ · close']]);
    expect([anywayLabel(open(st, items)), items[0].box, items[0].quick[0].after]).toEqual(['Show question anyway', 'card:k', 'Sent… then Show question ▶ (N)']);
  });

  it('the wager box’s first line: whose wager it waits on (a phone that can send it says so), then the blue button; names only', () => {
    const { g, s, f } = final();
    f.wagers = { a: 100 };
    expect(wagersLine(s, ['b'], true)).toEqual({ text: 'Waiting on Bob’s phone & Cat', ok: false });
    f.phonesLocked = true;
    expect(wagersLine(s, ['b'], true)!.text).toBe('Waiting on Bob & Cat');
    f.wagers = { a: 100, b: 50, c: 2.5 };
    expect(wagersLine(s, [], true)!.text).toBe('Not a whole number: Cat');
    applyScore(s, g, ['a'], 300, 'x');
    f.wagers = { a: 5000, b: 0, c: 0 };
    expect([wagersLine(s, [], false)!.text, wagersLine(s, [], true)]).toEqual(['Over the max: Ann', { text: '✓ All 3 wagers in: Show question ▶ (N)', ok: true }]);
    expect(JSON.stringify(wagersLine(s, [], false))).not.toContain('5000');
    f.players = ['a'];
    expect(wagersLine(s, [], true)!.text).toBe('✓ The wager is in: Show question ▶ (N)');
    // Nobody playing (the box says so itself), or past the wagers: none.
    f.players = [];
    expect(wagersLine(s, [], true)).toBeNull();
    f.players = ['a', 'b', 'c'];
    s.finalStep = 'question';
    expect(wagersLine(s, [], true)).toBeNull();
  });

  it('typed answers still coming at 👁 Reveal answer: ⏱ 10 more seconds (⇧T ⏎); R reveals anyway, never N; names and counts only', () => {
    const { g, s, f } = final('question');
    f.answers = { a: { text: 'Paris', n: 1 } };
    const c = ctx(g, s, { final: FIN, phones: ['a', 'b'], clockUp: true });
    const st = mainStep(c)!;
    const items = leftNow(c, st);
    expect(lines(items)).toEqual([['first: 1 of 2 answers are in (Bob’s isn’t).', '⏱ 10 more seconds [⇧T] ⏎ · close']]);
    expect(JSON.stringify(items)).not.toContain('Paris');
    const ck = open(st, items);
    expect([anywayLabel(ck), inside({ key: 'n' }, ck, after).do, inside({ key: 'r' }, ck, after).do, quietKinds(items), items[0].quick[0].after]).toEqual([
      '👁 Reveal anyway: the answers lock',
      'flash',
      'anyway',
      ['answers'],
      '10 more seconds… then 👁 Reveal answer (N)',
    ]);
    // In, or locked: nothing.
    f.answers.b = { text: 'Rome', n: 2 };
    expect(leftNow(c, st)).toEqual([]);
  });

  it('the reveals: Show answer ▶, Show wager ▶, Next player ▶; the spotlit player’s verdict is a must at Next player ▶ (✔ C / ✘ X close it, no ⏎)', () => {
    const { g, s, f } = final('reveal');
    const [first, second, third] = f.order;
    f.answers = { [first]: { text: 'Paris', n: 1 } };
    const c = (over: Partial<GoCtx> = {}) => ctx(g, s, { final: FIN, ...over });
    expect([said(mainStep(c())), mainStep(c())!.id, leftNow(c(), mainStep(c())!)]).toEqual(['Show answer ▶ · N', 'spot', []]);
    // Their answer up: the verdict is due, at Next player ▶. N opens the check (must: no anyway), C judges and closes it,
    // then N goes on: N, C, N.
    f.answerShown = { [first]: true };
    const st = mainStep(c())!;
    const items = leftNow(c(), st);
    const who = s.players.find((p) => p.id === first)!.name;
    expect(said(st)).toBe('Next player ▶ · N');
    expect(lines(items)).toEqual([[`first must: ${who} isn’t judged yet: judge them, then Next player ▶.`, '✔ Right [C] · close', '✘ Wrong [X] · close']]);
    expect(JSON.stringify(items)).not.toMatch(/Paris|\$100|\$50/);
    const ck = open(st, items);
    expect([goOnDecision('n', st, items, false, false), goOnDecision('shift', st, items, false, false), goOnDecision('n', st, items, true, false)]).toEqual(['open', 'open', 'hold']);
    expect([inside({ key: 'Enter' }, ck, after), inside({ key: 'n' }, ck, after).do, teachLine(ck), ringOf(items)]).toEqual([{ do: 'flash', say: 'C: right · X: wrong' }, 'flash', '', null]);
    const cKey = inside({ key: 'c' }, ck, after);
    expect(cKey).toMatchObject({ do: 'quick', quick: { label: '✔ Right', then: 'close' } });
    if (cKey.do === 'quick') cKey.quick.run();
    expect(did).toEqual([`judge ${first} right`]);
    f.results[first] = 'right';
    expect([said(mainStep(c())), leftNow(c(), mainStep(c())!)]).toEqual(['Next player ▶ · N', []]);
    mainStep(c())!.run();
    expect(did.at(-1)).toBe('finalnext');
    // The next one, no typed answer: Show wager ▶; none in yet, it's typed in their row (no check).
    f.current = second;
    expect([said(mainStep(c())), leftNow(c(), mainStep(c())!)]).toEqual(['Show wager ▶ · N', []]);
    expect(finalWaits(c())).toBeNull();
    delete f.wagers[second];
    expect(finalWaits(c())).toEqual({
      say: `${s.players.find((p) => p.id === second)!.name} has no wager yet: type it in their row (it’s never taken as 0)`,
      at: `.play .panel input[data-reveal-wager="${second}"]`,
      row: `.play .panel .pl[data-row="${second}"]`,
    });
    // Teams: Next team ▶.
    f.wagers[second] = 50;
    f.shown[second] = true;
    expect(said(mainStep(c({ final: { ...FIN, teams: true } })))).toBe('Next team ▶ · N');
    // The last one left to judge: their verdict at Finish game ▶ (a round after the Final: its name).
    f.results[third] = 'wrong';
    const last = mainStep(c())!;
    expect([said(last), last.id, leftNow(c(), last)[0].text]).toEqual(['Finish game ▶ · N', 'finish', `${s.players.find((p) => p.id === second)!.name} isn’t judged yet: judge them, then Finish game ▶.`]);
    g.rounds.push(newSlidesRound('Outro'));
    expect(said(mainStep(c()))).toBe('Next: Outro ▶ · N');
    f.results[second] = 'right';
    expect([said(mainStep(c())), leftNow(c(), mainStep(c())!)]).toEqual(['Next: Outro ▶ · N', []]);
  });

  it('a multiple choice’s likely verdict wears the ring, in the row and in the check; in one window only once the answer is up', () => {
    const { g, s, f } = final('reveal');
    const id = f.order[0];
    Object.assign(g.rounds[1], { choices: [{ id: 'x', text: 'Rome' }, { id: 'y', text: 'Paris', right: true }] });
    f.answers = { [id]: { text: 'Rome', n: 1, pick: 'x' } };
    expect([likelyVerdict(ctx(g, s), id), likelyVerdict(ctx(g, s, { dual: true }), id)]).toEqual([null, 'wrong']);
    f.answerShown = { [id]: true };
    const c = ctx(g, s, { final: FIN });
    const items = leftNow(c, mainStep(c)!);
    expect([ringOf(items), items[0].quick.map((q) => !!q.ring)]).toEqual(['verdict:wrong', [false, true]]);
    f.answers[id].pick = 'y';
    expect(ringOf(leftNow(c, mainStep(c)!))).toBe('verdict:right');
  });

  it('the tiebreaker: its slides, 👁 Reveal answer, then 🏁 Back to results, which asks while they’re still tied (🏆 each tied player, the one picked ⏎)', () => {
    const { g, s } = setup();
    g.tiebreaker = { questionSlide: textSlide('Q'), extraSlides: [{ ...textSlide('Q2'), id: 'q2' }], answerSlide: textSlide('A') };
    applyScore(s, g, ['a', 'b'], 500, 'x');
    startTiebreaker(s);
    const c = (over: Partial<GoCtx> = {}) => ctx(g, s, { final: FIN, ...over });
    expect(said(mainStep(c()))).toBe('Next slide ▶ · N');
    s.slide = 1;
    const reveal = mainStep(c())!;
    expect([said(reveal), reveal.id, leftNow(c(), reveal)]).toEqual(['👁 Reveal answer · N · reveals', 'reveal', []]);
    // (Its row's 🏁 Back to results, a skip while the blue button reveals: it asks as the blue one would.)
    expect(doneStep(c())!.id).toBe('results');
    s.tiebreakerRevealed = true;
    const back = mainStep(c())!;
    expect([said(back), back.id, back.flow]).toEqual(['🏁 Back to results · N', 'results', 'done']);
    const items = leftNow(c(), back);
    expect(lines(items)).toEqual([['loss: Nobody has won the tiebreaker: Ann & Bob are still tied.', '🏆 Ann won ▶ results · go', '🏆 Bob won ▶ results · go']]);
    const ck = open(back, items);
    expect([anywayLabel(ck), inside({ key: 'Enter' }, ck, after), inside({ key: 'n' }, ck, after)]).toEqual([
      '🏁 Back to results, still tied',
      { do: 'flash', say: 'Who won? Click their 🏆, or press their number then Enter' },
      { do: 'anyway' },
    ]);
    // Bob picked (2): his 🏆 takes Enter.
    const bob = leftNow(c({ selected: ['b'] }), back);
    expect(lines(bob)[0]).toEqual(['loss: Nobody has won the tiebreaker: Ann & Bob are still tied.', '🏆 Ann won ▶ results · go', '🏆 Bob won ▶ results ⏎ · go']);
    enterQuick(bob)!.run();
    expect(did).toEqual(['tbwin b']);
    // Settled (or no longer tied): nothing left.
    Object.assign(s, { rollOffWinner: 'b', tieAmong: ['a', 'b'], tiebreakClue: true });
    expect(leftNow(c(), back)).toEqual([]);
  });

  it('the end screen has no blue button, tie or not', () => {
    const { g, s } = setup();
    applyScore(s, g, ['a', 'b'], 500, 'x');
    s.phase = 'end';
    expect(mainStep(ctx(g, s, { final: FIN }))).toBeNull();
  });
});

describe('a board game’s turn (3.4 L)', () => {
  /** Ann, Bob and Cat on a looped board of 12 (Start, Space 2…), playing: Ann's turn. */
  function playing(mover: 'dice' | 'step' = 'dice') {
    const { g, s } = setup();
    const round = newBoardGameRound('Board');
    if (mover === 'step') round.mover = { kind: 'step' };
    round.zones.push({ id: 'shadow', name: 'Shadow Realm', slide: { background: {}, elements: [] } });
    g.rounds.push(round);
    goToRound(s, g, g.rounds.length - 1);
    s.intro = null;
    const bs = () => s.boardgames![round.id];
    const live = newLive();
    let steps: number | null = null;
    let question: BoardNow['question'] = null;
    const board = (over: Partial<BoardNow> = {}): BoardNow => ({ editing: false, steps, noNumber: null, question, ...over });
    /** The context at `now` (default: long after anything on stream has played out). */
    const at = (over: Partial<GoCtx> = {}, b: Partial<BoardNow> = {}) => ctx(g, s, { live, now: Date.now() + 60_000, board: board(b), ...over });
    return { g, s, round, bs, live, at, setSteps: (n: number | null) => (steps = n), setQuestion: (q: BoardNow['question']) => (question = q) };
  }
  const turn = (c: GoCtx) => {
    const st = mainStep(c)!;
    return { st, items: leftNow(c, st) };
  };

  it('the blue button is Next turn ▶, ◀ Previous turn quiet beside it, greyed while the dice roll; none while ✎ Edit board is open or under the title card', () => {
    const { g, s, live, at } = playing();
    const { st } = turn(at());
    expect([said(st), st.id, st.also?.map((a) => `${a.verb.label} [${a.verb.key}]`), st.nothing]).toEqual(['Next turn ▶ · N', 'turn', ['◀ Previous turn [⇧N]'], '✓ Ann’s turn is played']);
    st.run();
    st.also![0].run();
    expect(did).toEqual(['nextturn', 'prevturn']);
    // The round's own dice rolling: greyed (the dice aren't a tool over the moment: they're the turn's).
    rollMover(g, s, live);
    expect(mainStep(at({ now: 0 }))!.busy).toBe('Still rolling: wait for it to land');
    expect(mainStep(at())!.busy).toBeUndefined();
    expect(mainStep(at({}, { editing: true }))).toBeNull();
    s.intro = { stage: 'title', revealed: 0 };
    expect(said(mainStep(at()))).toBe('Start the round ▶ · N · enterIsNext');
  });

  it('one check walks the turn: 🎲 Roll (D ⏎), Rolling…, ▶ Move (⏎), the landing, then ✓ Ann’s turn is played', () => {
    const { g, s, round, bs, live, at, setSteps } = playing();
    const lucky = Object.assign(round.spaces[3], { name: 'Lucky' });
    lucky.onLand = [{ id: 'x', do: 'score', amount: 100, who: 'ask' }];
    let { st, items } = turn(at());
    expect(lines(items)).toEqual([['first: Ann’s turn: 🎲 roll, then ▶ move.', '🎲 Roll d6 [D] ⏎ · keep']]);
    expect([ringOf(items), items[0].quiet, anywayLabel(open(st, items)), teachLine(open(st, items))]).toEqual([
      'turnslot',
      'roll',
      'Next turn anyway: Ann stops here',
      'Next time: D rolls and Enter moves at once · Shift+click on the blue button skips this',
    ]);
    const ck = open(st, items);
    expect([inside({ key: 'Enter' }, ck, after), inside({ key: 'd' }, ck, after), inside({ key: 'n' }, ck, after)]).toMatchObject([
      { do: 'quick', quick: { label: '🎲 Roll d6', then: 'keep' } },
      { do: 'quick', quick: { label: '🎲 Roll d6' } },
      { do: 'anyway' },
    ]);
    // D: rolling. The line says so (never the number before the dice land on stream), its button greyed.
    rollMover(g, s, live);
    const o = live.overlay!;
    if (o.kind !== 'dice' || !o.roll) throw new Error('no roll');
    o.roll.dice[0].value = 3;
    let shown = mergeItems(items, leftNow(at({ now: 0 }), st));
    expect([lines(shown), enterQuick(shown)]).toEqual([[['first: Rolling…', '🎲 Roll d6 [D] ⏎ · keep']], null]);
    expect(inside({ key: 'Enter' }, open(st, shown), after)).toEqual({ do: 'flash', say: 'Still rolling: Enter moves them once they land' });
    // Landed (the Steps box filled): that line ticks, saying the roll, and the move joins.
    setSteps(3);
    const c = at();
    shown = mergeItems(shown, leftNow(c, st), (id) => doneSay(c, id));
    expect(shown.map((i) => `${i.done ?? ''}${i.done ? ' ' : ''}${i.text}`)).toEqual(['✓ Ann rolled 3', 'Ann rolled 3: ▶ move them.']);
    expect(lines(todo(shown))).toEqual([['first: Ann rolled 3: ▶ move them.', '▶ Move Ann: 3 ⏎ · keep']]);
    expect(ringOf(todo(shown))).toBe('turnslot');
    // ▶ Move: the token on its way, the landing waits (“Moving…”), then says what's left.
    moveNow(g, s, 3);
    live.overlay = null;
    setSteps(null);
    const hop = bs().hop!;
    ({ items } = turn(at({ now: hop.at })));
    expect(lines(items)).toEqual([['first: Moving…', '▶ Run Lucky’s actions ▶ next turn ⏎ · go']]);
    expect(items[0].quick[0].why).toBe('Still moving');
    const later = at({ now: hop.at + HOP_MS * hop.path.length });
    shown = mergeItems(shown, leftNow(later, st), (id) => doneSay(later, id));
    expect(shown.map((i) => `${i.done ?? ''}${i.done ? ' ' : ''}${i.text}`)).toEqual([
      '✓ Ann rolled 3',
      '✓ Ann moved',
      'Ann landed on Lucky: its actions haven’t run (+$100 to Ann).',
    ]);
    expect([items[0].quiet, anywayLabel(open(st, todo(shown)))]).toEqual(['landing', 'Next turn anyway: Lucky’s actions don’t run']);
    // Run: they ran (one step, the mark with it), so nothing's left: ✓ Ann's turn is played, Next turn ▶ (N or Enter).
    runSpace(g, s, live, lucky, ['a']);
    shown = mergeItems(shown, leftNow(at(), st), (id) => doneSay(at(), id));
    expect([headingOf(shown), shown.at(-1)?.text, st.nothing]).toEqual(['nothing', 'Lucky’s actions ran', '✓ Ann’s turn is played']);
    expect([inside({ key: 'n' }, open(st, shown), after), inside({ key: 'Enter' }, open(st, shown), after)]).toEqual([{ do: 'step' }, { do: 'step' }]);
    // An Undo of them: they're left again.
    undoAction(s, g);
    expect(turn(at()).items.map((i) => i.id)).toEqual(['landing']);
  });

  it('landings: all instant run and go on (▶ next turn); a deciding one starts; one that puts something up or asks who runs and closes', () => {
    const { g, s, round, bs, at } = playing();
    const sp = Object.assign(round.spaces[2], { name: 'Lucky' });
    const land = (onLand: NonNullable<typeof sp.onLand>) => {
      sp.onLand = onLand;
      bs().positions.a = { space: round.spaces[0].id };
      bs().last = undefined;
      moveNow(g, s, 2);
      return turn(at()).items;
    };
    let items = land([
      { id: '1', do: 'score', amount: 100, who: 'ask' },
      { id: '2', do: 'skip', who: 'ask' },
      { id: '3', do: 'note', text: 'Ask them a riddle' },
    ]);
    expect(lines(items)).toEqual([['first: Ann landed on Lucky: its actions haven’t run (+$100 to Ann, Skip next turn).', '▶ Run Lucky’s actions ▶ next turn ⏎ · go']]);
    items[0].quick[0].run();
    expect(did).toEqual(['landing']);
    // A roll first, its outcomes after: ▶ Start, closing (the host presses the outcome).
    items = land([
      { id: 'd', do: 'dice', dice: '1d6' },
      { id: 'w', do: 'score', amount: 200, who: 'ask' },
    ]);
    expect(lines(items)).toEqual([['first: Ann landed on Lucky: its roll hasn’t happened.', '▶ Start Lucky ⏎ · close']]);
    expect(items[0].quick[0].after).toBe('Lucky’s roll… press the outcome, then Next turn ▶ (N)');
    items = land([
      { id: 'q', do: 'question', question: textSlide('Q'), answer: textSlide('A'), value: 200 },
      { id: 'w', do: 'score', amount: 200, who: 'ask' },
    ]);
    expect(items[0].text).toBe('Ann landed on Lucky: its question hasn’t been asked.');
    // A wheel on its own, a 🤫 card, a points action for the selected: they put something up or ask who.
    for (const a of [{ id: 'w', do: 'wheel', wheel: 'x' }, { id: 'k', do: 'card', slide: textSlide('Tip') }, { id: 's', do: 'score', amount: 50, who: 'selected' }] as const) {
      items = land([a]);
      expect(lines(items), a.do).toEqual([['first: Ann landed on Lucky: its actions haven’t run.', '▶ Run Lucky’s actions ⏎ · close']]);
    }
    expect(items[0].quick[0].after).toBe('Lucky’s actions are on… then Next turn ▶ (N) when it’s played out');
    // (For the players picked, with nobody picked: greyed, and Enter says to pick first.)
    expect([items[0].quick[0].why, items[0].enterSay, turn(at({ selected: ['b'] })).items[0].quick[0].why]).toEqual(['Pick who it’s for first (1–9)', 'Pick who it’s for first: their number, then Enter', undefined]);
    // One window: a secret space not revealed yet is “?”, its actions said without its name.
    Object.assign(sp, { secret: true });
    items = land([{ id: '1', do: 'score', amount: 100, who: 'ask' }]);
    expect(lines(items)).toEqual([['first: Ann landed on ?: its actions haven’t run (+$100 to Ann).', '▶ Run its actions ▶ next turn ⏎ · go']]);
    expect(lines(turn(at({ dual: true })).items)[0][0]).toBe('first: Ann landed on Lucky: its actions haven’t run (+$100 to Ann).');
    // Silenced for the game: it doesn't ask.
    s.goonQuiet = ['landing'];
    expect(turn(at()).items).toEqual([]);
  });

  it('every way of running the landing counts: its row’s button, its card’s, ▶ Run all, the stage’s menu', () => {
    const { g, s, round, at, live } = playing();
    const sp = round.spaces[2];
    sp.onLand = [{ id: '1', do: 'score', amount: 100, who: 'ask' }];
    moveNow(g, s, 2);
    expect(turn(at()).items.map((i) => i.id)).toEqual(['landing']);
    // (Its row's button and its card's: one action, by runLanding; ▶ Run all and the menu's: runSpace.)
    runLanding(g, s, sp, () => applyScore(s, g, ['a'], 100, 'Space 3: +$100'));
    expect(turn(at()).items).toEqual([]);
    // (Undoing its points: left again.)
    undo(s);
    expect(turn(at()).items.map((i) => i.id)).toEqual(['landing']);
    runSpace(g, s, live, sp, ['a']);
    expect(turn(at()).items).toEqual([]);
  });

  it('a one-space board: its ways (the only one ⏎, ringed); at a fork the ways, no keys, and it holds with the controls hidden', () => {
    const { g, s, round, bs, at } = playing('step');
    let { st, items } = turn(at());
    expect(lines(items)).toEqual([['first: Ann hasn’t moved: → Space 2.', '→ Space 2 ⏎ · keep']]);
    expect(ringOf(items)).toBe('turnslot');
    items[0].quick[0].run();
    expect(did).toEqual([`move 1 ${round.spaces[1].id}`]);
    // Two ways on: which way? (no ⏎: click or Tab; the numbers still pick players).
    round.spaces[0].next.push(round.spaces[5].id);
    items = turn(at()).items;
    expect([lines(items), ringOf(items), enterQuick(items)]).toEqual([[['first: Ann hasn’t moved: which way?', '→ Space 2 · keep', '→ Space 6 · keep']], null, null]);
    // A dice board's fork: the steps left.
    round.mover = { kind: 'dice', dice: 'd6' };
    round.spaces[2].next.push(round.spaces[7].id);
    round.spaces[0].next = [round.spaces[1].id];
    moveNow(g, s, 5);
    ({ st, items } = turn(at()));
    expect(lines(items)).toEqual([['first: Ann has 3 steps left: which way?', '→ Space 4 · keep', '→ Space 8 · keep']]);
    expect(inside({ key: 'Enter' }, open(st, items), after)).toEqual({ do: 'flash', say: 'Which way? Click it (or Tab to it): the numbers still pick players' });
    expect([goOnDecision('n', st, items, true, false), goOnDecision('n', st, items, false, false)]).toEqual(['hold', 'open']);
    // A secret way, in one window: “?”.
    Object.assign(round.spaces[7], { name: 'Trap', secret: true });
    expect(lines(turn(at()).items)[0][2]).toBe('→ ? · keep');
    expect(bs().fork?.stepsLeft).toBe(3);
  });

  it('no item for a turn that ends without a move: off the board or in a zone, a slice with no number, nowhere to go; nor silenced rolling', () => {
    const { g, s, round, bs, at, setSteps } = playing();
    sendNow(g, s, ['a'], { zone: 'shadow' });
    expect(turn(at()).items).toEqual([]);
    setSteps(4);
    expect(turn(at()).items).toEqual([]);
    setSteps(null);
    sendNow(g, s, ['a'], { space: round.spaces[0].id });
    expect(turn(at({}, { noNumber: 'Lose a turn' })).items).toEqual([]);
    expect(doneSay(at({}, { noNumber: 'Lose a turn' }), 'roll')).toBe('Ann’s spin landed on “Lose a turn”');
    round.spaces[0].next = [];
    expect(turn(at()).items).toEqual([]);
    round.spaces[0].next = [round.spaces[1].id];
    // A count typed, not rolled; going back.
    setSteps(-2);
    expect(lines(turn(at()).items)).toEqual([['first: Ann goes back 2: ◀ move them back.', '◀ Back Ann: 2 ⏎ · keep']]);
    setSteps(2);
    expect(turn(at()).items[0].text).toBe('Ann has 2 to go: ▶ move them.');
    setSteps(null);
    s.goonQuiet = ['roll'];
    expect(turn(at()).items).toEqual([]);
    // Moved, landing on a space with no actions: nothing left.
    s.goonQuiet = [];
    moveNow(g, s, 1);
    expect([bs().last?.landed, turn(at()).items]).toEqual([round.spaces[1].id, []]);
  });

  it('a question worth points that came up this turn, nobody given any: ＋ Award Ann $200 ▶ next turn (several picked: a line each)', () => {
    const { g, s, round, at, setQuestion } = playing();
    const sp = Object.assign(round.spaces[2], { name: 'Quiz' });
    sp.onLand = [{ id: 'q', do: 'question', question: textSlide('Q'), answer: textSlide('A'), value: 200 }];
    moveNow(g, s, 2);
    runSpace(g, s, newLive(), sp, ['a']);
    const t0 = Date.now();
    setQuestion({ value: 200, at: t0 });
    let { st, items } = turn(at());
    expect(lines(items)).toEqual([['loss: The question on Quiz is worth $200, and nobody got points.', '＋ Award Ann $200 ▶ next turn ⏎ · go', '− Deduct Ann $200 ▶ next turn [⇧⏎] · go']]);
    expect([headingOf(items), anywayLabel(open(st, items))]).toEqual(['loss', 'Next turn anyway: no points']);
    items[0].quick[0].run();
    expect(did).toEqual(['+200 a']);
    items = turn(at({ selected: ['b', 'c'] })).items;
    expect(lines(items)[0].slice(1)).toEqual(['Bob: ＋ Award $200 · keep', 'Bob: − Deduct · keep', 'Cat: ＋ Award $200 · keep', 'Cat: − Deduct · keep']);
    // Points given since: nothing left. (Not while the question's still up: its own Next ▶ asks then.)
    applyScore(s, g, ['b'], 200, 'Quiz');
    expect(turn(at()).items).toEqual([]);
    ({ st } = turn(at()));
    expect(st.id).toBe('turn');
  });

  it('presses it takes (6.2): D, Enter, N as before; following the blue button N, Enter, Enter, N; N, N skips the turn; Shift+click once', () => {
    const { g, s, live, at, setSteps } = playing();
    const { st, items } = turn(at());
    // D and Enter never go through the check; with the turn played, N goes on (3).
    expect(goOnDecision('n', st, [], false, false)).toBe('run');
    // Following the blue button: N opens it, Enter rolls, Enter moves, N (or Enter) takes the step (4).
    expect(goOnDecision('n', st, items, false, false)).toBe('open');
    expect(inside({ key: 'Enter' }, open(st, items), after)).toMatchObject({ do: 'quick', quick: { then: 'keep' } });
    rollMover(g, s, live);
    setSteps(3);
    expect(inside({ key: 'Enter' }, open(st, leftNow(at(), st)), after)).toMatchObject({ do: 'quick', quick: { label: '▶ Move Ann: 3' } });
    // Skipping on purpose: N, N (after the guard), or Shift+click at once, or the tick.
    expect(inside({ key: 'n' }, open(st, leftNow(at(), st)), after)).toEqual({ do: 'anyway' });
    expect(goOnDecision('shift', st, leftNow(at(), st), false, false)).toBe('run');
    // With the controls hidden in one window, a turn not rolled goes on, as N did.
    expect(goOnDecision('n', st, items, true, false)).toBe('run');
  });
});
