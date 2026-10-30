// The blue button and the check before going on (goon.ts): the table of moments, what's left in each, and the keys in
// the check.
import { describe, expect, it } from 'vitest';
import { jeopardyGame } from '../../lib/testgame';
import { newSlidesRound, setSlideText, type BoardRound, type Game, type Session } from '../../lib/model';
import { newSession, openClue } from '../../lib/session';
import { buzzArm, buzzClueOpened, buzzDone, buzzTake, newBuzz } from '../../lib/buzz';
import {
  anywayLabel, CHECK_GUARD_MS, doneStep, enterQuick, escBounce, goOnDecision, headingOf, inside, leftNow, mainQuick, mainStep, mergeItems, quietKinds, ringOf, swallowSay, teachLine,
  todo, type Check, type GoActs, type GoCtx, type LeftItem, type Step,
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
    toolUp: false,
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

  it('moments whose part hasn’t moved yet keep their own main button: no step', () => {
    const { g, s } = setup();
    const cats = board(g).categories;
    cats[0].clues[1].type = 'partner';
    openClue(s, REF, g);
    expect(mainStep(ctx(g, s))).toBeNull();
    expect(doneStep(ctx(g, s))).toBeNull();
    cats[0].clues[1].type = 'dailyDouble';
    openClue(s, REF, g);
    expect(s.dd?.stage).toBe('splash');
    expect(mainStep(ctx(g, s))).toBeNull();
    // A Daily Double's question is a clue.
    s.dd = { stage: 'question', playerId: 'a', wager: 300 };
    expect(said(mainStep(ctx(g, s)))).toBe('👁 Reveal answer · N · reveals');
    // A tool, the scores or a pop-up over the stage.
    expect(mainStep(ctx(g, s, { toolUp: true }))).toBeNull();
    for (const phase of ['final', 'tiebreaker', 'end', 'rpg', 'boardgame'] as const) {
      s.phase = phase;
      expect(mainStep(ctx(g, s)), phase).toBeNull();
    }
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
