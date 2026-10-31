/**
 * The blue button and the check before going on (docs/SPEC.md §6.6). The blue button (the host panel's main button) is
 * the show's next step only, a Next or a Reveal (mainStep); a box's actions (a spin, the buzzers, points, a card) are
 * in their box. Pressing it (a click, N, Enter where Enter means Next, a click on the stage that would go on) with
 * something left that going on would skip or lose (leftNow) opens the check: what's left, a quick button per fix, a
 * quiet "… anyway" and Not yet. Pure: Play owns the check's state and gives this its own state and functions (GoCtx),
 * never a box's, so it works with the host panel hidden too.
 *
 * Moments whose part hasn't moved over yet give no step here (null): the panel's old main button does them, as before,
 * with no check (a 🤝 partner clue, a Daily Double's splash, a tool or pop-up over the stage, the Final, the tiebreaker,
 * the end screen, board games).
 */
import { buzzNeverOpened, type BuzzState } from '../../lib/buzz';
import { formatPoints, isBoard, isFinal, roundName, type Game, type Id, type Session } from '../../lib/model';
import { answerShowing, currentClueInfo, nameList, playerName, roundComplete, slidePosition, toolOnlyClue } from '../../lib/session';
import { CHECK_GUARD_MS } from './guard';
import type { FlowPlace } from './slots.svelte';
import { CHECK, FLOW, type FlowVerb } from './verbs';

/** Keys and clicks on the check are ignored this long after it opens (Esc isn't): a fast N, N or a double-click can't skip it. */
export { CHECK_GUARD_MS };

/** The kinds of item a host can tell the check not to ask about again this game. */
export type QuietKind = NonNullable<Session['goonQuiet']>[number];

/** A fix in the check: it does a box's action, then goes on (`go`), closes the check (`close`), or stays (`keep`). */
export type Quick = {
  /** "＋ Award Ann $200 ▶ board". */
  label: string;
  /** Its key cap, and the key that presses it in the check: '⇧⏎', 'U', 'O', 'T', '⇧T', '1'…'9'. */
  key?: string;
  /** Enter presses it too, and it shows ⏎ (only the first item's main one does). */
  enter?: boolean;
  then: 'go' | 'close' | 'keep';
  tone?: 'good' | 'bad';
  /** A Play function (never a box's). */
  run: () => void;
  /** What the status line says after a `close`: "Buzzers open… then 👁 Reveal answer (N)". */
  after?: string;
  /** Greyed, with why. */
  why?: string;
  /** Its whole meaning, for screen readers. */
  aria?: string;
  /** One of several players' lines (several picked): whose. */
  line?: string;
};

/** One thing left. */
export type LeftItem = {
  /** Stable: an item done elsewhere keeps its line (mergeItems). */
  id: string;
  /** 'first': the box's normal next step ("First:"); 'loss': going on would lose something ("Before you go on"). */
  kind: 'first' | 'loss';
  /** The show can't go on without it: no "anyway". */
  must?: boolean;
  text: string;
  quick: Quick[];
  /** The box button that does it (it wears the ring while it's due): 'buzzers', 'rolltie', 'judgeall', 'card:<id>'. */
  box?: string;
  /** It can be silenced for the game. */
  quiet?: QuietKind;
  /** What Not yet puts the keys on (and flashes): a selector. */
  focus?: string;
  /** What "… anyway" loses: "no points". */
  lost?: string;
  /** What Enter says when this item has no ⏎ button. */
  enterSay?: string;
  /** Set by mergeItems once it's done elsewhere: its ticked line. */
  done?: string;
};

export type StepId = 'intro' | 'slide' | 'nextround' | 'reveal' | 'done';

/** The blue button's step: its words (FLOW only), what it does, and how its keys go. */
export type Step = {
  id: StepId;
  verb: FlowVerb;
  run: () => void;
  /** Its key cap; none where N doesn't press it. */
  key?: 'N';
  /** N only says to click it (a played-out board's Next round ▶). */
  clickOnly?: boolean;
  /** Enter on the focused blue button is this step (the intro, a slides round). */
  enterIsNext?: boolean;
  /** It shows an answer: N never takes "anyway" (R does). */
  reveals?: boolean;
  /** Greyed while something plays out ("Still spinning"). */
  busy?: string;
  /** Its place in the clue's row of buttons (that row doesn't show it twice). */
  flow?: FlowPlace;
};

/** What the host's own functions do, for the steps and the fixes. */
export type GoActs = {
  intro: () => void;
  slide: () => void;
  nextRound: () => void;
  reveal: () => void;
  back: () => void;
  /** Points to `ids` (`keep`: the others picked stay picked). */
  award: (sign: 1 | -1, ids: Id[], amount: number, keep?: boolean) => void;
  openBuzzers: () => void;
  rollTie: () => void;
  /** This player answers (picked, as their number does). */
  pick: (id: Id) => void;
  /** 10 more seconds on the countdown (Shift+T), or (none up) start one (T). */
  clock: (more: boolean) => void;
  judgeAll: () => void;
  /** ✘ on each of these answers, as their rows' ✘ do, in one step. */
  wrongRest: (ids: Id[]) => void;
  /** The keys to this player's answer row, flashed. */
  toRow: (id: Id) => void;
  sendCard: (cardId: Id) => void;
};

/** What the check reads: Play's state and lib's, never a box's. */
export type GoCtx = {
  session: Session;
  game: Game;
  /** An audience window is open (this panel is off stream). */
  dual: boolean;
  /** Something is over the stage (a tool, the scores, a sheet, a pop-up): its part has its own main button still. */
  toolUp: boolean;
  selected: Id[];
  amount: number | null;
  /** The open clue's marks since it opened. */
  marks: Record<Id, { right: boolean; delta: number }>;
  /** Phone buzzers on this clue, and the room in reach. */
  buzzing: boolean;
  buzz: BuzzState | null;
  /** A buzzer tie the room left to the host. */
  tie: Id[];
  /** A ✍ clue: its answers from phones (the room's, for this clue), and who has a phone connected. */
  everyone: boolean;
  answers: { seats: Record<Id, { text: string; pick?: Id }>; locked: boolean } | null;
  phones: Id[];
  /** Who ✔ Judge all would mark now (a ✍ multiple-choice clue, locked), else null. */
  judgeAll: { right: Id[]; wrong: Id[] } | null;
  /** A countdown is up (Shift+T adds to it). */
  clockUp: boolean;
  /** The open tile's 🤫 cards not sent yet, to phones that get cards, with who each goes to; `full`: why it can't go now. */
  cards: { id: Id; name: string; to: Id[]; full?: string }[];
  /** One window: a Daily Double wager sent from a phone, not on screen yet. */
  ddHidden: boolean;
  act: GoActs;
};

/** Where going on was asked from. */
export type GoSource = 'main' | 'shift' | 'n' | 'enter' | 'stage' | 'menu' | 'flow';

/** The open check. */
export type Check = {
  step: Step;
  /** As shown: merged by id, a done item keeping its line. */
  items: LeftItem[];
  openedBy: GoSource;
  /** When it opened (the guard). */
  at: number;
  /** When "✓ Nothing left" came (its step button ignores clicks a moment). */
  nothingAt?: number;
  /** Opened with the controls hidden in one window: nothing on stream changed. */
  held?: boolean;
};

// ---------- The blue button ----------

const n = (verb: FlowVerb, id: StepId, run: () => void, more: Partial<Step> = {}): Step => ({ id, verb, run, key: 'N', ...more });

/** The next round's words: Next round ▶, a Final by its name, End game ▶. */
function nextRoundVerb(game: Game, at: number): FlowVerb {
  const r = game.rounds[at + 1];
  return !r ? FLOW.endGame : isFinal(r) ? FLOW.toRound(roundName(r, at + 1)) : FLOW.nextRound;
}

/** The blue button's step now (null: no blue button, or its moment's part still has its own). */
export function mainStep(c: GoCtx): Step | null {
  const s = c.session;
  if (c.toolUp) return null;
  if (s.intro) {
    const round = c.game.rounds[s.currentRound];
    const i = s.intro;
    const verb =
      i.stage === 'title'
        ? isBoard(round)
          ? FLOW.showBoard
          : FLOW.startRound
        : i.stage === 'fill'
          ? FLOW.revealCategories
          : FLOW.revealCategory(i.revealed + 1, isBoard(round) ? round.categories.length : 0);
    return n(verb, 'intro', c.act.intro, { enterIsNext: true });
  }
  if (s.phase === 'slides') {
    const pos = slidePosition(s, c.game);
    if (pos && pos.at < pos.of) return n(FLOW.nextSlide(pos.at, pos.of), 'slide', c.act.slide, { enterIsNext: true, flow: 'pager' });
    return n(nextRoundVerb(c.game, s.currentRound), 'nextround', c.act.nextRound, { enterIsNext: true });
  }
  // A board played out goes on only from a click (N mashed after the last clue mustn't jump on stream).
  if (s.phase === 'board') return roundComplete(s, c.game) ? { id: 'nextround', verb: nextRoundVerb(c.game, s.currentRound), run: c.act.nextRound, clickOnly: true } : null;
  if (s.phase === 'clue') return clueStep(c);
  return null;
}

/** An open clue's step: its question slides, the answer, then back to the board. */
function clueStep(c: GoCtx, done = false): Step | null {
  const s = c.session;
  const info = currentClueInfo(s, c.game);
  if (!info || c.toolUp || (s.partner && s.partner.clue === info.clue.id) || s.dd?.stage === 'splash') return null;
  const doneStep = n(FLOW.done, 'done', c.act.back, { flow: 'done' });
  if (done) return doneStep;
  const pos = slidePosition(s, c.game);
  if (pos && !answerShowing(s) && pos.at < pos.of) return n(FLOW.nextSlide(pos.at, pos.of), 'slide', c.act.slide, { flow: 'pager' });
  if (!toolOnlyClue(info.clue) && !s.revealed) return n(FLOW.reveal, 'reveal', c.act.reveal, { reveals: true, flow: 'reveal' });
  return doneStep;
}

/** A step the check can ask before (the others never do: an intro, a slide, the next round). */
export const mayAsk = (st: Step): boolean => st.id === 'reveal' || st.id === 'done';

/** ▦ Done ▶ board as a skip (the clue's row, while the blue button is 👁 Reveal answer): it asks as the blue one would. */
export const doneStep = (c: GoCtx): Step | null => clueStep(c, true);

// ---------- What's left ----------

const sym = (c: GoCtx) => c.game.settings.currencySymbol;
const name = (c: GoCtx, id: Id) => playerName(c.session, id);
const named = (c: GoCtx, ids: Id[]) => nameList(ids.map((id) => name(c, id)));

/** How each player was judged on a clue (its score log, any play of it): 1 right, -1 wrong. The ✍ rows read it too. */
export function judgedOn(session: Pick<Session, 'scoreLog'>, clueId: string): Record<Id, 1 | -1> {
  const out: Record<Id, 1 | -1> = {};
  for (const e of session.scoreLog) if (!e.undone && e.clueId === clueId) out[e.playerId] = (e.right ?? e.delta > 0) ? 1 : -1;
  return out;
}

/** The selector of a ✍ clue's answer row's ✔ (where the keys go to judge it). */
export const answerRow = (id: Id): string => `.play .panel [data-answer-row="${id}"] button.good`;

/** Points not given before the tile closes: a Daily Double's player, the players picked (3.4 A). */
function scoreItems(c: GoCtx): LeftItem[] {
  const s = c.session;
  const info = currentClueInfo(s, c.game);
  if (!info || toolOnlyClue(info.clue)) return [];
  const out: LeftItem[] = [];
  const dd = s.dd?.stage === 'question' ? s.dd : null;
  const ddId = dd?.playerId;
  if (dd && ddId && !c.marks[ddId]) {
    const who = name(c, ddId);
    const w = dd.wager ?? 0;
    const pts = c.ddHidden ? '(wager hidden)' : formatPoints(w, sym(c));
    const said = c.ddHidden ? 'the wager' : formatPoints(w, sym(c));
    out.push({
      id: 'dd',
      kind: 'loss',
      text: `${who} hasn’t been judged on this Daily Double.`,
      lost: 'no points',
      quick: [
        { label: `＋ Award ${who} ${pts} ▶ board`, enter: true, then: 'go', tone: 'good', run: () => c.act.award(1, [ddId], w), aria: `Award ${who} ${said}, then back to the board` },
        { label: `− Deduct ${who} ${pts} ▶ board`, key: '⇧⏎', then: 'go', tone: 'bad', run: () => c.act.award(-1, [ddId], w), aria: `Deduct ${said} from ${who}, then back to the board` },
      ],
    });
  }
  const picked = c.selected.filter((id) => id !== ddId && !c.marks[id] && s.players.some((p) => p.id === id));
  if (!picked.length) return out;
  const a = c.amount != null && Number.isFinite(c.amount) ? Math.abs(c.amount) : info.value;
  const pts = formatPoints(a, sym(c));
  if (picked.length === 1) {
    const id = picked[0];
    const who = name(c, id);
    out.push({
      id: 'picked',
      kind: 'loss',
      text: `${who} is answering and has no points for this clue yet.`,
      lost: 'no points',
      quick: [
        { label: `＋ Award ${who} ${pts} ▶ board`, enter: true, then: 'go', tone: 'good', run: () => c.act.award(1, [id], a), aria: `Award ${who} ${pts}, then back to the board` },
        { label: `− Deduct ${who} ${pts} ▶ board`, key: '⇧⏎', then: 'go', tone: 'bad', run: () => c.act.award(-1, [id], a), aria: `Deduct ${pts} from ${who}, then back to the board` },
      ],
    });
  } else
    // (Several: one line each, no ⏎. Usually only one of them was right, so there's no ＋ for the group.)
    out.push({
      id: 'picked',
      kind: 'loss',
      text: `${named(c, picked)} are picked, with no points yet.`,
      lost: 'no points',
      enterSay: 'Several are picked: ＋ or − on each line (1–9 changes who)',
      quick: picked.flatMap((id): Quick[] => {
        const who = name(c, id);
        return [
          { line: who, label: `＋ Award ${pts}`, then: 'keep', tone: 'good', run: () => c.act.award(1, [id], a, true), aria: `Award ${who} ${pts}` },
          { line: who, label: '− Deduct', then: 'keep', tone: 'bad', run: () => c.act.award(-1, [id], a, true), aria: `Deduct ${pts} from ${who}` },
        ];
      }),
    });
  return out;
}

/** A ✍ clue's answers in and not judged, at ▦ Done ▶ board (3.4 C): names and counts, never the words. */
function judgeItems(c: GoCtx): LeftItem[] {
  const info = currentClueInfo(c.session, c.game);
  if (!c.everyone || !c.answers || !info) return [];
  const judged = judgedOn(c.session, info.clue.id);
  const inIds = c.session.players.filter((p) => c.answers?.seats[p.id]).map((p) => p.id);
  const left = inIds.filter((id) => !judged[id]);
  if (!left.length) return [];
  const some = inIds.length > left.length;
  const who = named(c, left);
  const all = c.judgeAll;
  const covers = !!all && left.every((id) => all.right.includes(id) || all.wrong.includes(id));
  const quick: Quick[] = [];
  if (all)
    quick.push({
      label: covers ? '✔ Judge all ▶ board' : '✔ Judge all',
      enter: true,
      then: covers ? 'go' : 'keep',
      tone: 'good',
      run: c.act.judgeAll,
      aria: covers ? 'Judge all by the right choice, then back to the board' : 'Judge all by the right choice',
    });
  if (!covers) quick.push({ label: '✍ Judge them', enter: !all, then: 'close', run: () => c.act.toRow(left[0]), aria: 'Judge them: the keys go to the first answer to judge' });
  // (Only once one is judged: it marks answers the host may not have read, so no key.)
  if (!all && some) quick.push({ label: `✘ The rest are wrong (${who}) ▶ board`, then: 'go', tone: 'bad', run: () => c.act.wrongRest(left), aria: `Mark ${who} wrong, then back to the board` });
  return [
    {
      id: 'judge',
      kind: 'loss',
      text: some ? `Not judged yet: ${who}.` : `Nobody’s answer is judged yet (${inIds.length} ${inIds.length === 1 ? 'is' : 'are'} in).`,
      lost: some ? `${who} ${left.length === 1 ? 'gets' : 'get'} no points` : 'nobody gets points',
      quick,
      ...(all ? { box: 'judgeall' } : {}),
      focus: answerRow(left[0]),
    },
  ];
}

/** A ✍ clue's answers still coming in, at 👁 Reveal answer (3.4 C). */
function answersItems(c: GoCtx): LeftItem[] {
  const ans = c.answers;
  if (!c.everyone || !ans || ans.locked || c.session.revealed) return [];
  const can = c.session.players.filter((p) => c.phones.includes(p.id) || ans.seats[p.id]);
  const missing = can.filter((p) => !ans.seats[p.id]);
  if (!missing.length) return [];
  const verb = c.clockUp ? '⏱ 10 more seconds' : '⏱ Start the countdown';
  return [
    {
      id: 'answers',
      kind: 'first',
      quiet: 'answers',
      text: `${can.length - missing.length} of ${can.length} answers are in (${nameList(missing.map((p) => `${p.name}’s`))} ${missing.length === 1 ? 'isn’t' : 'aren’t'}).`,
      lost: 'the answers lock',
      quick: [
        {
          label: verb,
          key: c.clockUp ? '⇧T' : 'T',
          enter: true,
          then: 'close',
          run: () => c.act.clock(c.clockUp),
          after: `${c.clockUp ? '10 more seconds' : 'The countdown is on'}… then ${FLOW.reveal.label} (N)`,
        },
      ],
    },
  ];
}

/** Phone buzzers at 👁 Reveal answer: never opened, or a tie left to the host (3.4 B). */
function buzzItems(c: GoCtx): LeftItem[] {
  if (!c.buzzing) return [];
  const then = `then ${FLOW.reveal.label} (N)`;
  if (c.tie.length >= 2)
    return [
      {
        id: 'tie',
        kind: 'first',
        box: 'rolltie',
        text: `${named(c, c.tie)} buzzed at the same moment.`,
        quick: [
          { label: '🎲 Roll for it', key: 'O', enter: true, then: 'close', run: c.act.rollTie, after: `Rolling for it… ${then}`, aria: 'Roll for it: the tied players roll for who answers' },
          ...c.tie.map((id): Quick => {
            const at = c.session.players.findIndex((p) => p.id === id) + 1;
            return { label: `${name(c, id)} answers`, ...(at && at <= 9 ? { key: String(at) } : {}), then: 'close', run: () => c.act.pick(id) };
          }),
        ],
      },
    ];
  if (buzzNeverOpened(c.buzz) && !c.selected.length && !Object.keys(c.marks).length)
    return [
      {
        id: 'buzzers',
        kind: 'first',
        quiet: 'buzzers',
        box: 'buzzers',
        text: 'The buzzers were never opened: nobody could buzz in.',
        quick: [{ label: '🔔 Open the buzzers', key: 'U', enter: true, then: 'close', run: c.act.openBuzzers, after: `Buzzers open… ${then}` }],
      },
    ];
  return [];
}

/** A tile's 🤫 cards not sent, at 👁 Reveal answer (3.4 D): the card's name and who it's for, never its words. */
function cardItems(c: GoCtx): LeftItem[] {
  return c.cards.map((k) => ({
    id: `card:${k.id}`,
    kind: 'first',
    box: `card:${k.id}`,
    text: `${k.name} hasn’t gone to ${named(c, k.to)} yet.`,
    quick: [{ label: '📤 Send it', enter: true, then: 'close', run: () => c.act.sendCard(k.id), after: `Sent… then ${FLOW.reveal.label} (N)`, ...(k.full ? { why: k.full } : {}), aria: `Send ${k.name} to ${named(c, k.to)}` }],
  }));
}

/** What going on by `step` would skip or lose now, but the kinds silenced this game. */
export function leftNow(c: GoCtx, step: Step): LeftItem[] {
  const all = step.id === 'reveal' ? [...buzzItems(c), ...answersItems(c), ...cardItems(c)] : step.id === 'done' ? [...scoreItems(c), ...judgeItems(c)] : [];
  const quiet = c.session.goonQuiet ?? [];
  return all.filter((i) => !i.quiet || !quiet.includes(i.quiet));
}

/** The box button that wears the ring now: the first item left with one (null: none). */
export const ringOf = (items: LeftItem[]): string | null => items.find((i) => !i.done && i.box)?.box ?? null;

// ---------- Going on ----------

/**
 * What pressing the blue button does: `run` the step, `open` the check, or `hold` (the controls hidden in one window:
 * nothing on stream changes, the pill pulses). Shift+click skips all but must items. With the controls hidden in one
 * window, what can be done later goes on (points not given: ↶ Reopen); an answer shown early or a must item holds.
 */
export function goOnDecision(source: GoSource, step: Step, items: LeftItem[], hidden: boolean, dual: boolean): 'run' | 'open' | 'hold' {
  const ask = asked(source, items);
  if (!ask.length) return 'run';
  if (hidden && !dual) return step.reveals || ask.some((i) => i.must) ? 'hold' : 'run';
  return 'open';
}

/** The items the check asks about for this press (Shift+click: the must ones only). */
export const asked = (source: GoSource, items: LeftItem[]): LeftItem[] => (source === 'shift' ? items.filter((i) => i.must) : items);

/**
 * The check's items as they are now: the shown ones keep their places (one done elsewhere stays, ticked, its buttons
 * inert), changed ones are redrawn in place, new ones join at the end.
 */
export function mergeItems(shown: LeftItem[], now: LeftItem[]): LeftItem[] {
  const fresh = new Map(now.map((i) => [i.id, i]));
  const out = shown.map((i) => fresh.get(i.id) ?? (i.done ? i : { ...i, done: CHECK.done }));
  for (const i of now) if (!shown.some((x) => x.id === i.id)) out.push(i);
  return out;
}

/** The items still to do. */
export const todo = (items: LeftItem[]): LeftItem[] => items.filter((i) => !i.done);

/** Its heading: "First:", "Before you go on" (any loss left), or "✓ Nothing left". */
export function headingOf(items: LeftItem[]): 'first' | 'loss' | 'nothing' {
  const t = todo(items);
  return !t.length ? 'nothing' : t.some((i) => i.kind === 'loss') ? 'loss' : 'first';
}

/** The fix Enter presses: the first item still to do's ⏎ button (at most one shows ⏎). */
export function enterQuick(items: LeftItem[]): Quick | null {
  const first = todo(items)[0];
  return first?.quick.find((q) => q.enter && !q.why) ?? null;
}

/** The check's strongest button: the first item still to do's first fix. */
export const mainQuick = (items: LeftItem[]): Quick | null => todo(items)[0]?.quick[0] ?? null;

/** "… anyway": the step's words and what it loses ("▦ Done anyway: no points"). */
export function anywayLabel(check: Pick<Check, 'step' | 'items'>): string {
  const lost = todo(check.items).find((i) => !i.must && i.lost)?.lost;
  const word = check.step.verb.anyway ?? `${check.step.verb.label.replace(/ ▶$/, '')} anyway`;
  return lost ? `${word}: ${lost}` : word;
}

/** The quiet kinds the check can be told not to ask about again, among what's left. */
export const quietKinds = (items: LeftItem[]): QuietKind[] => [...new Set(todo(items).flatMap((i) => (i.quiet ? [i.quiet] : [])))];

/** The teach line: the direct keys that skip this next time. */
export function teachLine(check: Pick<Check, 'step' | 'items'>): string {
  const parts: string[] = [];
  if (check.step.reveals) parts.push('R reveals at once');
  if (check.step.id === 'done') parts.push('Esc closes at once');
  if (!todo(check.items).every((i) => i.must)) parts.push('Shift+click on the blue button skips this');
  return parts.length ? `Next time: ${parts.join(' · ')}` : '';
}

/** A key pressed while the check is open. */
export type KeyIn = { key: string; shift?: boolean; ctrl?: boolean; repeat?: boolean };

/** What a key does in the open check (3.6). */
export type Inside =
  | { do: 'quick'; quick: Quick }
  | { do: 'anyway' }
  | { do: 'step' }
  | { do: 'notyet' }
  | { do: 'flash'; say?: string }
  /** Within the guard: nothing, but what it would do after lights up (`then`). */
  | { do: 'swallow'; then: Inside }
  /** As outside, the check staying open (1–9, K, B, M, Space, ←/→, F). */
  | { do: 'pass' }
  /** The browser's own (Tab moves through its buttons). */
  | { do: 'native' }
  /** Close it as Not yet, then as outside (?, L, A, H, Ctrl+Z…). */
  | { do: 'leave' }
  | { do: 'ignore' };

/** The fix showing `cap` among what's still to do. */
const byKey = (items: LeftItem[], cap: string): Quick | null => todo(items).flatMap((i) => i.quick).find((q) => q.key === cap && !q.why) ?? null;

/** What `k` does in `check` at `now`. */
export function inside(k: KeyIn, check: Pick<Check, 'step' | 'items' | 'at'>, now: number): Inside {
  if (k.repeat) return { do: 'ignore' };
  const key = k.key.length === 1 ? k.key.toLowerCase() : k.key;
  if (k.ctrl) return key === 'z' || key === 'y' ? { do: 'leave' } : { do: 'ignore' };
  // Esc is harmless: never held back.
  if (key === 'Escape' && !k.shift) return { do: 'notyet' };
  if (key === 'Tab') return { do: 'native' };
  if (now - check.at < CHECK_GUARD_MS) {
    const then = inside(k, check, check.at + CHECK_GUARD_MS);
    return then.do === 'quick' || then.do === 'anyway' || then.do === 'step' ? { do: 'swallow', then } : { do: 'ignore' };
  }
  const left = todo(check.items);
  const nothing = !left.length;
  const must = left.some((i) => i.must);
  const enter = enterQuick(check.items);
  switch (key) {
    case 'Enter': {
      if (k.shift) return pressed(byKey(check.items, '⇧⏎')) ?? { do: 'flash', say: left[0]?.enterSay ?? 'Shift+Enter: nothing to take here' };
      if (nothing) return { do: 'step' };
      if (enter) return { do: 'quick', quick: enter };
      return { do: 'flash', say: left[0]?.enterSay ?? `Click a button in the check, or Esc` };
    }
    case 'n':
      if (k.shift) return { do: 'ignore' };
      if (nothing) return { do: 'step' };
      if (must) return { do: 'flash', say: 'This must be done first: use a button in the check, or Esc' };
      if (check.step.reveals) return { do: 'flash', say: `${enter ? `Enter: ${enter.label} · ` : ''}R: ${anywayLabel(check)}` };
      return { do: 'anyway' };
    case 'r':
      if (!check.step.reveals || must) return { do: 'flash', say: 'R: answer the check first, or Esc' };
      return nothing ? { do: 'step' } : { do: 'anyway' };
    case 'Escape':
      // (Shift+Esc: ↩ Put back where the check offers it, else as outside.)
      return pressed(byKey(check.items, '⇧Esc')) ?? { do: 'leave' };
    case 't':
      return pressed(byKey(check.items, k.shift ? '⇧T' : 'T')) ?? { do: 'ignore' };
    case 'w':
    case 'd':
    case 'u':
    case 'o':
    case 'c':
    case 'x':
      return pressed(byKey(check.items, key.toUpperCase())) ?? { do: 'ignore' };
    case 'k':
    case 'b':
    case 'm':
    case 'f':
    case ' ':
    case 'ArrowLeft':
    case 'ArrowRight':
      return { do: 'pass' };
    case '?':
    case 'l':
    case 'a':
    case 'h':
      return { do: 'leave' };
  }
  if (/^[0-9]$/.test(key)) return { do: 'pass' };
  return { do: 'ignore' };
}

/** A fix to press, if any. */
const pressed = (q: Quick | null): Inside | null => (q ? { do: 'quick', quick: q } : null);

/** Esc right after Not yet (or another Esc) does nothing: a bounced Esc never closes the clue. */
export const escBounce = (notYetAt: number, now: number): boolean => now - notYetAt < CHECK_GUARD_MS;

/** What the swallowed press would have done, in the status line's words ("N again: ▦ Done anyway: no points"). */
export function swallowSay(k: KeyIn, then: Inside, check: Pick<Check, 'step' | 'items'>): string {
  const what = then.do === 'quick' ? then.quick.label : then.do === 'anyway' ? anywayLabel(check) : check.step.verb.label;
  const key = k.key === 'Enter' ? (k.shift ? 'Shift+Enter' : 'Enter') : k.key.length === 1 ? k.key.toUpperCase() : k.key;
  return `${key} again: ${what}`;
}

/** What the host panel gets from Play: the blue button's step, the open check, and what its buttons do. */
export type GoPanel = {
  /** The blue button's step (null: its moment's part has its own main button still). */
  step: Step | null;
  check: Check | null;
  /** What's left first, for the blue button's tooltip ("first: Ann has no points…"). */
  first: string | null;
  /** The box button that wears the ring (none while the check is open: its strongest button has it). */
  ring: string | null;
  /** A press the guard held back: the words of what it will press. */
  lit: string | null;
  /** Goes up to flash the check. */
  flash: number;
  /** The blue button clicked (`shift`: with Shift, going on without asking). */
  main: (source: 'main' | 'shift') => void;
  /** The clue's row's ▦ Done ▶ board (a skip, while the blue button is 👁 Reveal answer). */
  flowDone: () => void;
  quick: (q: Quick) => void;
  anyway: () => void;
  /** "✓ Nothing left": its step. */
  takeStep: () => void;
  notYet: () => void;
  quiet: (kind: QuietKind) => void;
  /** A press in the panel outside the check: it closes as Not yet first. */
  away: () => void;
  /** A click on its empty parts: it only flashes. */
  flashIt: () => void;
};
