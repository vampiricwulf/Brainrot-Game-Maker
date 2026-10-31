/**
 * The blue button and the check before going on (docs/SPEC.md §6.6). The blue button (the host panel's main button) is
 * the show's next step only, a Next or a Reveal (mainStep); a box's actions (a spin, the buzzers, points, a card) are
 * in their box. Pressing it (a click, N, Enter where Enter means Next, a click on the stage that would go on) with
 * something left that going on would skip or lose (leftNow) opens the check: what's left, a quick button per fix, a
 * quiet "… anyway" and Not yet. Pure: Play owns the check's state and gives this its own state and functions (GoCtx),
 * never a box's, so it works with the host panel hidden too.
 *
 * Moments whose part hasn't moved over yet give no step here (null): the panel's old main button does them, as before,
 * with no check (the Final, the tiebreaker, the end screen, board games and a board game's own roll).
 */
import { buzzNeverOpened, type BuzzState } from '../../lib/buzz';
import { overlayDoneAt, tileToolUp, type Live, type Overlay } from '../../lib/live';
import { formatPoints, isBoard, isBoardGame, isFinal, roundName, type Game, type Id, type Session } from '../../lib/model';
import { cardDone, draftDeltas, scoreCards, scoreDraft, wheelSpentUp, type ScoreCard } from '../../lib/overlay';
import { partnerCandidates, partnerPickStep } from '../../lib/partner';
import { answerShowing, currentClueInfo, ddCap, nameList, playerName, roundComplete, slidePosition, toolOnlyClue } from '../../lib/session';
import { describeAction, isRespin, needsSource, sliceLabel } from '../../lib/tools';
import { CHECK_GUARD_MS } from './guard';
import type { FlowPlace } from './slots.svelte';
import { CHECK, FLOW, VERBS, type FlowVerb } from './verbs';

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
  /** A Play function (never a box's). False: it waited, and said why (the check stays as it is). */
  run: () => void | false;
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
  /**
   * The box button that does it (it wears the ring while it's due): 'buzzers', 'rolltie', 'judgeall', 'card:<id>', the
   * 🤝 box's 'partnerspin', 'describerspin' and 'handout', a wheel's or dice's 'toolslot' (Spin! / Roll!).
   */
  box?: string;
  /** It can be silenced for the game. */
  quiet?: QuietKind;
  /** What Not yet puts the keys on (and flashes): a selector. */
  focus?: string;
  /** What "… anyway" loses: "no points". */
  lost?: string;
  /** "… anyway"'s whole words, where they aren't the step's ("Show question without it"). */
  anyway?: string;
  /** It can't be done once the step is taken (a score effect): with the controls hidden in one window it holds too. */
  hold?: boolean;
  /** What Enter says when this item has no ⏎ button. */
  enterSay?: string;
  /** Set by mergeItems once it's done elsewhere: its ticked line. */
  done?: string;
};

/**
 * 'close': the 🤝 partner wheel's Next ▶; 'tool': what's over the stage goes (a tile's own wheel or dice: its question,
 * or the board); 'popreveal': a question pop-up's answer; 'ddshow': a Daily Double's question.
 */
export type StepId = 'intro' | 'slide' | 'nextround' | 'reveal' | 'done' | 'question' | 'close' | 'tool' | 'popreveal' | 'ddshow';

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
  /** A tile's own wheel or dice not spun or rolled yet (Enter says so: "Spin the wheel first: W"). */
  tool?: 'spin' | 'roll';
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
  // A 🤝 partner clue: PARTNER UP!'s choices, then its question's.
  /** Who picked it (their number does the same). */
  partnerPicker: (id: Id) => void;
  /** 🎡 Spin for a partner (W). */
  partnerSpin: () => void;
  /** This player is the partner (their number does the same). */
  partnerChoose: (id: Id) => void;
  /** 🎡 Spin for the describer (W), and one of the team chosen to describe. */
  memberSpin: () => void;
  describer: (id: string) => void;
  /** Nobody else to partner with: the picker plays it alone (Solo). */
  partnerSolo: () => void;
  /** ↩ Put back (keep tile). */
  putBack: () => void;
  /** Show question ▶ on PARTNER UP!, and the partner wheel put away (its landing is the partner). */
  partnerShow: () => void;
  closeWheel: () => void;
  /** 📤 Send and start or ⏱ Start the clock (false: a moment after the question it waits, saying so). */
  partnerClock: () => void | false;
  /** 📋 Copy a card's words (or picture), to paste to its players: never on screen. */
  copyCard: (cardId: Id) => void;
  /** ✔ Got it or ✘ Missed (false: the keys' guards held it, saying so). */
  partnerJudge: (got: boolean) => void | false;
  // What's over the stage: a wheel, dice, the scores, a sheet, a roll-off, a pop-up.
  /** It goes, as the blue button's step (a tile's own wheel or dice: its question, or the board). */
  closeTool: () => void;
  /** Spin! / ↻ Spin again (W), Roll! / Roll again (D). */
  spin: () => void;
  roll: () => void;
  /** A question pop-up's answer goes on screen. */
  revealPopup: () => void;
  /** A score effect given, to whom its box says. */
  scoreCard: (key: string) => void;
  /** The keys to this (a selector), flashed: a score effect's row. */
  focusOn: (sel: string) => void;
  /** A Daily Double's question, with its wager; typed values missing, the keys stay in the Wager box (ddWaits). */
  ddShow: () => void;
};

/**
 * A 🤝 partner clue that's open, as the check reads it: Play's and lib's state, never the 🤝 box's (H hides the box).
 * The rest (who picked it, the partner, the stage) is the session's.
 */
export type PartnerNow = {
  /** The partner (or describer) wheel over the stage: 'turning' until it lands. */
  wheel: 'turning' | 'landed' | null;
  /** Phone buzzer teams: "Which team picked it?". */
  teams: boolean;
  /** Teams, the picker's own team playing it: the people on it with a phone here, one of them to describe. */
  people: { id: string; name: string }[];
  /** What the giver does, in the clue's game's words ("describes"). */
  giverVerb: string;
  /** How many 🤫 cards the clue has. */
  cards: number;
  /** Handing them out: those still to send to phones, with who they go to ("Card 1", never what's on it). */
  send: { name: string; to: Id[] }[];
  /** Those to copy by hand (no phone gets cards, or one of their players has none here: `phoneless`), and what of them copies. */
  copy: { id: Id; name: string; to: Id[]; phoneless: boolean; what: 'words' | 'picture' | null }[];
  /** 📤 Send and start won't fit in the buzzer room: why. */
  full?: string;
  /** What ⏱ Start the clock counts down from. */
  secs: number;
  /** The countdown: up (running or paused, its seconds left), run out, or none. */
  clock: { left: number; running: boolean } | 'out' | null;
  /** Both of the two have their mark. */
  judged: boolean;
  /** What ✔ Got it and ✘ Missed give, in words ("Cat +$200 · Ann +$100"). */
  got: string;
  missed: string;
  /** ✘ Missed lets the others steal it. */
  stealOn: boolean;
  /** A steal open, the answer hidden and the clock not run out: who can still steal it. */
  stealers: Id[];
  /** Who plays it, the giver first (Solo: the one). */
  pair: Id[];
};

/** What the check reads: Play's state and lib's, never a box's. */
export type GoCtx = {
  session: Session;
  game: Game;
  /** An audience window is open (this panel is off stream). */
  dual: boolean;
  /** What's on stage over the moment (a tool, the scores, a sheet, a pop-up), and the time it's read at (a spin landing). */
  live: Live;
  now: number;
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
  /** "Ignore the limit" is ticked: a Daily Double's wager may be over the max. */
  wagerLimitsOff: boolean;
  /** Who found the Daily Double has a phone here that can send their wager. */
  ddPhone: boolean;
  /** The open 🤝 partner clue (null: none). */
  partner: PartnerNow | null;
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

/**
 * What's over the stage as the blue button sees it: the overlay up (the scores, if they're over a wheel), and whether
 * it's the open tile's own wheel or dice. None for a shop (its 🚪 Leave shop), the open 🤝 partner clue's wheel (its
 * own Next ▶) or a board game's own roll (its turn box's, until board games move over).
 */
export function toolOf(c: GoCtx): { o: Overlay; own: boolean; question: boolean; busy: boolean } | null {
  const o = c.live.overlay;
  const s = c.session;
  if (!o || o.kind === 'shop') return null;
  if (o.kind === 'wheel' && o.partnerFor && s.partner?.clue === o.partnerFor) return null;
  const round = c.game.rounds[s.currentRound];
  if ((o.kind === 'dice' && o.mover) || (o.kind === 'wheel' && s.phase === 'boardgame' && isBoardGame(round) && round.mover.kind === 'wheel' && o.wheelId === round.mover.wheel)) return null;
  const info = s.phase === 'clue' ? currentClueInfo(s, c.game) : undefined;
  const own = o.kind !== 'scoreboard' && !!info && tileToolUp(c.live, info.clue);
  const turns = o.kind === 'wheel' || o.kind === 'dice' || o.kind === 'rolloff';
  return { o, own, question: own && !!info && !toolOnlyClue(info.clue), busy: turns && c.now < overlayDoneAt(o) };
}

/**
 * The blue button over what's over the stage: a tile's own wheel or dice, Show question ▶ (a tile with no question:
 * ▦ Done ▶ board); a question pop-up, 👁 Reveal answer, then Next ▶; anything else (a tool from the tools row, the
 * scores, a sheet, a roll-off), Next ▶, which only puts it away. Greyed while it turns.
 */
function toolStep(c: GoCtx, t: NonNullable<ReturnType<typeof toolOf>>): Step {
  const { o } = t;
  if (o.kind === 'popup' && o.answer && !o.revealed) return n({ ...FLOW.reveal, title: 'Its answer goes on screen (R shows or hides it at once) · or click it' }, 'popreveal', c.act.revealPopup, { reveals: true });
  const dice = o.kind === 'dice';
  const busy = t.busy ? { busy: `Still ${dice || o.kind === 'rolloff' ? 'rolling' : 'spinning'}: wait for it to land` } : {};
  if (!t.own) return n(FLOW.next, 'tool', c.act.closeTool, busy);
  const fresh = (o.kind === 'wheel' && !o.spin && !wheelSpentUp(o, c.session, c.game)) || (o.kind === 'dice' && !o.roll);
  const word = dice ? 'dice go' : 'wheel goes';
  const verb = t.question ? { ...FLOW.showQuestion, title: `The ${word}, and the question goes on screen` } : { ...FLOW.done, title: `The ${word}: back to the board, the tile used` };
  return n(verb, 'tool', c.act.closeTool, { ...busy, ...(t.question ? {} : { flow: 'done' as const }), ...(fresh && !t.busy ? { tool: dice ? ('roll' as const) : ('spin' as const) } : {}) });
}

/** A Daily Double's splash: Show question ▶, never greyed (who found it and the wager are typed: see ddWaits). */
const ddStep = (c: GoCtx): Step => n({ ...FLOW.showQuestion, title: 'The question goes on screen, for their wager' }, 'ddshow', c.act.ddShow, { enterIsNext: true });

/** The blue button's step now (null: no blue button, or its moment's part still has its own). */
export function mainStep(c: GoCtx): Step | null {
  const s = c.session;
  const tool = toolOf(c);
  if (tool) return toolStep(c, tool);
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

/** An open clue's step: PARTNER UP!'s, its question slides, the answer, then back to the board. */
function clueStep(c: GoCtx, done = false): Step | null {
  const s = c.session;
  const info = currentClueInfo(s, c.game);
  if (!info || toolOf(c)) return null;
  if (s.dd?.stage === 'splash') return done ? null : ddStep(c);
  const pt = s.partner?.clue === info.clue.id ? s.partner : null;
  if (pt && !c.partner) return null;
  // PARTNER UP!: the question (Enter too), or, while the partner wheel is up, Next ▶: it goes and the pair shows.
  if (pt?.stage === 'pick') {
    if (done) return null;
    const w = c.partner?.wheel;
    if (w) return n({ ...FLOW.next, title: 'The wheel goes, and the pair shows on PARTNER UP!' }, 'close', c.act.closeWheel, { enterIsNext: true, ...(w === 'turning' ? { busy: 'Still spinning: wait for it to land' } : {}) });
    return n({ ...FLOW.showQuestion, title: 'The question goes on screen (nothing is sent to anyone)' }, 'question', c.act.partnerShow, { enterIsNext: true });
  }
  const doneStep = n(FLOW.done, 'done', c.act.back, { flow: 'done' });
  if (done) return doneStep;
  const pos = slidePosition(s, c.game);
  if (pos && !answerShowing(s) && pos.at < pos.of) return n(FLOW.nextSlide(pos.at, pos.of), 'slide', c.act.slide, { flow: 'pager' });
  if (!toolOnlyClue(info.clue) && !s.revealed) return n(FLOW.reveal, 'reveal', c.act.reveal, { reveals: true, flow: 'reveal' });
  return doneStep;
}

/** A step the check can ask before (the others never do: an intro, a slide, the next round, a Daily Double's question). */
export const mayAsk = (st: Step): boolean => st.id === 'reveal' || st.id === 'done' || st.id === 'tool';

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

/** A player's number key, as a key cap (1–9 only). */
function numKey(c: GoCtx, id: Id): { key?: string } {
  const at = c.session.players.findIndex((p) => p.id === id) + 1;
  return at && at <= 9 ? { key: String(at) } : {};
}

/** "Cat’s phone", "Cat & Dan’s phones". */
const phonesOf = (c: GoCtx, ids: Id[]) => `${named(c, ids)}’s phone${ids.length === 1 ? '' : 's'}`;

/** The open partner clue (its state, and Play's for it), if any. */
function partnerOf(c: GoCtx) {
  const s = c.session.partner;
  const info = currentClueInfo(c.session, c.game);
  return s && c.partner && info && s.clue === info.clue.id ? { s, p: c.partner } : null;
}

/** What follows a send or the clock, said in the status line. */
const PLAYING = '✔ Got it (Enter) or ✘ Missed (Shift+Enter) once they’ve played';

/**
 * PARTNER UP!, at Show question ▶ (3.4 H): who picked it, the partner (or who describes), and with nobody to partner
 * with, Solo or ↩ Put back. Each must be done first: no "anyway". Names and parts only.
 */
function pickItems(c: GoCtx): LeftItem[] {
  const x = partnerOf(c);
  if (!x || x.s.stage !== 'pick') return [];
  const { s, p } = x;
  const step = partnerPickStep(c.session, s, p.people.length);
  if (step === 'picker') {
    const who = p.teams ? 'Which team' : 'Who';
    return [
      {
        id: 'picker',
        kind: 'first',
        must: true,
        text: `${who} picked it?`,
        enterSay: `${who} picked it? Press their number, or click their name`,
        quick: c.session.players.map((pl): Quick => ({ label: pl.name, ...numKey(c, pl.id), then: 'keep', run: () => c.act.partnerPicker(pl.id), aria: `${pl.name} picked it` })),
      },
    ];
  }
  const picker = name(c, s.pickerId ?? '');
  const next = `${FLOW.showQuestion.label} (N) next`;
  if (step === 'spin')
    return [
      {
        id: 'partner',
        kind: 'first',
        must: true,
        box: 'partnerspin',
        text: `${picker} needs a partner first.`,
        quick: [
          { label: VERBS.partnerSpin.label, key: 'W', enter: true, then: 'close', run: c.act.partnerSpin, after: `Spinning… then ${FLOW.next.label} shows the pair`, aria: 'Spin for a partner: the wheel spins over the other players' },
          ...partnerCandidates(c.session, s).map((pl): Quick => {
            const solo = pl.id === s.pickerId;
            return {
              label: solo ? `${pl.name} (Solo)` : pl.name,
              ...numKey(c, pl.id),
              then: 'close',
              run: () => c.act.partnerChoose(pl.id),
              after: solo ? `${pl.name} plays it alone · ${next}` : `${pl.name} partners ${picker} · ${next}`,
              aria: solo ? `${pl.name} plays it alone` : `${pl.name} is ${picker}’s partner`,
            };
          }),
        ],
      },
    ];
  if (step === 'describer')
    return [
      {
        id: 'describer',
        kind: 'first',
        must: true,
        box: 'describerspin',
        text: `Who ${p.giverVerb} for ${picker}?`,
        quick: [
          { label: VERBS.describerSpin.label, key: 'W', enter: true, then: 'close', run: c.act.memberSpin, after: `Spinning… then ${FLOW.next.label} shows who ${p.giverVerb}`, aria: `Spin for who ${p.giverVerb}: the wheel spins over the people on ${picker}` },
          ...p.people.map((m): Quick => ({ label: m.name, then: 'close', run: () => c.act.describer(m.id), after: `${m.name} ${p.giverVerb} for ${picker} · ${next}`, aria: `${m.name} ${p.giverVerb} for ${picker}` })),
        ],
      },
    ];
  if (step === 'nobody')
    return [
      {
        id: 'nobody',
        kind: 'first',
        must: true,
        text: `Nobody else can be ${picker}’s partner.`,
        quick: [
          { label: `${picker} plays it alone (Solo)`, enter: true, then: 'close', run: c.act.partnerSolo, after: `${picker} plays it alone · ${next}` },
          { label: VERBS.putBack.label, key: '⇧Esc', then: 'close', run: c.act.putBack, aria: 'Put back: the tile goes back on the board, unused' },
        ],
      },
    ];
  return [];
}

/**
 * A partner clue's question up, at 👁 Reveal answer (3.4 H): the cards not handed out or the clock not started, the
 * pair still playing, or a steal open. They haven't had their go: R or a click reveals anyway, never N. Card names and
 * who they're for, never their words.
 */
function partnerPlayItems(c: GoCtx): LeftItem[] {
  const x = partnerOf(c);
  if (!x || x.s.stage === 'pick' || c.session.revealed) return [];
  const { s, p } = x;
  const pair = named(c, p.pair);
  if (p.judged) {
    if (!p.stealers.length) return [];
    const info = currentClueInfo(c.session, c.game);
    const a = c.amount != null && Number.isFinite(c.amount) ? Math.abs(c.amount) : (info?.value ?? 0);
    const on = c.selected.find((id) => p.stealers.includes(id));
    // (One picked to steal it, with their number: right or wrong next.)
    if (on) {
      const who = name(c, on);
      const pts = formatPoints(a, sym(c));
      return [
        {
          id: 'steal',
          kind: 'first',
          text: `${who} is stealing it: right or wrong?`,
          lost: 'nobody steals it',
          quick: [
            { label: `＋ Award ${who} ${pts} ▶ reveal`, enter: true, then: 'go', tone: 'good', run: () => c.act.award(1, [on], a), aria: `Award ${who} ${pts}, then the answer` },
            { label: `− Deduct ${who} ${pts}`, key: '⇧⏎', then: 'keep', tone: 'bad', run: () => c.act.award(-1, [on], a), aria: `Deduct ${pts} from ${who}` },
          ],
        },
      ];
    }
    return [
      {
        id: 'steal',
        kind: 'first',
        text: `A steal is open: ${named(c, p.stealers)} can still steal it.`,
        lost: 'nobody steals it',
        quick: p.stealers.map((id): Quick => ({ label: `${name(c, id)} steals it`, ...numKey(c, id), then: 'close', run: () => c.act.pick(id), after: `${name(c, id)} steals it: Enter if right, Shift+Enter if wrong` })),
      },
    ];
  }
  const clockQ = (): Quick => ({ label: VERBS.startClock(p.secs).label, enter: true, then: 'close', run: c.act.partnerClock, after: `Clock running: ${PLAYING}` });
  const copyQ = p.copy.flatMap((k): Quick[] => (k.what ? [{ label: `📋 Copy ${k.name}’s ${k.what}`, then: 'keep', run: () => c.act.copyCard(k.id), aria: `Copy ${k.name}’s ${k.what}, to paste to ${named(c, k.to)}` }] : []));
  const hand = { id: 'handout', kind: 'first', box: 'handout', lost: 'they haven’t played' } as const;
  if (s.stage === 'distribute') {
    const running = typeof p.clock === 'object' && !!p.clock?.running;
    if (p.send.length) {
      const to = [...new Set(p.send.flatMap((k) => k.to))];
      const many = p.send.length > 1;
      const cards = nameList(p.send.map((k) => k.name));
      const copied = p.copy.length ? ` ${nameList(p.copy.map((k) => k.name))} ${p.copy.length > 1 ? 'are' : 'is'} to copy by hand for ${named(c, [...new Set(p.copy.flatMap((k) => k.to))])} (no phone here).` : '';
      const verb = running ? VERBS.sendCards : VERBS.sendAndStart;
      return [
        {
          ...hand,
          // (The room full: Enter says why, as the greyed 📤 does.)
          ...(p.full ? { enterSay: p.full } : {}),
          text: `${cards} ${many ? 'haven’t' : 'hasn’t'} gone to ${phonesOf(c, to)}${running ? ' yet, though the clock is running' : ', and the clock hasn’t started: they haven’t played yet'}.${copied}`,
          quick: [
            {
              label: verb.label,
              enter: true,
              then: 'close',
              run: c.act.partnerClock,
              after: `${many ? 'Cards' : 'Card'} sent, clock running: ${PLAYING}`,
              ...(p.full ? { why: p.full } : {}),
              aria: running ? `Send ${cards} to their phones (the clock goes on)` : `Send ${cards} to their phones and start the clock`,
            },
            ...copyQ,
          ],
        },
      ];
    }
    if (p.copy.length) {
      const many = p.copy.length > 1;
      const to = [...new Set(p.copy.flatMap((k) => k.to))];
      const none = p.copy.some((k) => k.phoneless) ? ' (no phone here)' : '';
      return [{ ...hand, text: `${nameList(p.copy.map((k) => k.name))} ${many ? 'are' : 'is'} for ${named(c, to)}${none}: copy ${many ? 'each to its player' : 'it to them'}, then start the clock.`, quick: [clockQ(), ...copyQ] }];
    }
    return [{ ...hand, text: 'The clock hasn’t started: they haven’t played yet.', quick: [clockQ()] }];
  }
  // Live: the pair still playing. (Time's up: revealing doesn't ask, they can still be judged after.)
  if (p.clock === 'out') return [];
  if (!p.clock && !p.cards) return [{ ...hand, text: 'The clock hasn’t started: they haven’t played yet.', quick: [clockQ()] }];
  const one = p.pair.length === 1;
  return [
    {
      id: 'playing',
      kind: 'first',
      text: p.clock ? `${pair} ${one ? 'is' : 'are'} still playing (${p.clock.left} s left).` : `Not judged yet: did ${pair} get it?`,
      quick: [
        { label: `✔ Got it (${p.got}) ▶ reveal`, enter: true, then: 'go', tone: 'good', run: () => c.act.partnerJudge(true), aria: `Got it: ${p.got}, then the answer` },
        p.stealOn
          ? { label: '✘ Missed: a steal opens', key: '⇧⏎', then: 'close', tone: 'bad', run: () => c.act.partnerJudge(false), after: 'A steal: the others can answer it', aria: `Missed: ${p.missed}, and the others can steal it` }
          : { label: `✘ Missed (${p.missed}) ▶ reveal`, key: '⇧⏎', then: 'go', tone: 'bad', run: () => c.act.partnerJudge(false), aria: `Missed: ${p.missed}, then the answer` },
      ],
    },
  ];
}

/** A partner clue not judged, at ▦ Done ▶ board (3.4 H): going on gives the pair no points. */
function partnerJudgeItems(c: GoCtx): LeftItem[] {
  const x = partnerOf(c);
  if (!x || x.s.stage === 'pick' || x.p.judged) return [];
  const { p } = x;
  return [
    {
      id: 'judged',
      kind: 'loss',
      text: `Not judged yet: did ${named(c, p.pair)} get it?`,
      lost: 'no points',
      quick: [
        { label: '✔ Got it ▶ board', enter: true, then: 'go', tone: 'good', run: () => c.act.partnerJudge(true), aria: `Got it: ${p.got}, then back to the board` },
        { label: '✘ Missed ▶ board', key: '⇧⏎', then: 'go', tone: 'bad', run: () => c.act.partnerJudge(false), aria: `Missed: ${p.missed}, then back to the board` },
      ],
    },
  ];
}

/**
 * What's over the stage, at the blue button's step that puts it away (3.4 F, G, M): a tile's own wheel or dice not spun
 * or rolled, or landed on "Spin again"; a score effect not given; a question pop-up's player picked with no points.
 * Whether a tool from the tools row spun never asks: a host who opened one to look just wants it gone.
 */
function toolItems(c: GoCtx): LeftItem[] {
  const t = toolOf(c);
  if (!t || t.busy) return [];
  const { o } = t;
  if (o.kind === 'popup') return popupItems(c, o);
  const out: LeftItem[] = [];
  const then = t.own ? (t.question ? `then ${FLOW.showQuestion.label} (N)` : `then ${FLOW.done.label} (N)`) : `then ${FLOW.next.label} (N)`;
  if (t.own && o.kind === 'wheel' && !wheelSpentUp(o, c.session, c.game)) {
    const spin = (label: string): Quick => ({ label, key: 'W', enter: true, then: 'close', run: c.act.spin, after: `Spinning… ${then}` });
    if (!o.spin)
      out.push({
        id: 'tool',
        kind: 'first',
        quiet: 'tool',
        box: 'toolslot',
        text: t.question ? 'The wheel hasn’t spun yet: its question comes after.' : 'The wheel hasn’t spun yet.',
        ...(t.question ? {} : { anyway: 'Close without spinning (the tile stays on the board)' }),
        quick: [spin(VERBS.spin.label)],
      });
    else if (o.result !== null && isRespin(o.segments[o.result]))
      out.push({ id: 'again', kind: 'first', box: 'toolslot', text: `It landed on “${sliceLabel(o.segments[o.result], o.result)}”.`, quick: [spin(VERBS.spinAgain.label)] });
  }
  if (t.own && o.kind === 'dice' && !o.roll)
    out.push({
      id: 'tool',
      kind: 'first',
      quiet: 'tool',
      box: 'toolslot',
      text: t.question ? 'The dice haven’t been rolled yet: the question comes after.' : 'The dice haven’t been rolled yet.',
      ...(t.question ? {} : { anyway: 'Close without rolling (the tile stays on the board)' }),
      quick: [{ label: VERBS.roll.label, key: 'D', enter: true, then: 'close', run: c.act.roll, after: `Rolling… ${then}` }],
    });
  // A score effect that landed, neither given nor skipped (its box's Confirm and Skip): lost once it goes.
  const to = t.own ? (t.question ? '▶ question' : '▶ board') : 'and put it away';
  const without = t.own ? (t.question ? `${FLOW.showQuestion.label.replace(/ ▶$/, '')} without it` : `${FLOW.done.label.replace(/ ▶ board$/, '')} without it`) : `${FLOW.next.label} without it`;
  for (const card of scoreCards(o, c.now)) if (!cardDone(o, c.session, card.key)) out.push(scoreItem(c, card, to, without));
  return out;
}

/** A score effect not given: give it to whom its box says (a steal, a swap or nobody chosen yet: choose in the box). */
function scoreItem(c: GoCtx, card: ScoreCard, to: string, without: string): LeftItem {
  const noun = card.kind === 'dice' ? 'roll' : 'wheel';
  const what = `“${describeAction(card.action, sym(c))}”`;
  const d = scoreDraft(c.live, c.session, card);
  const { deltas, ready } = draftDeltas(c.live, c.session, card);
  const sel = `.play .panel [data-score-card="${card.key}"] button:not(:disabled)`;
  const base = { id: `score:${card.key}`, kind: 'loss' as const, hold: true, anyway: without, focus: sel };
  const box = `the ${card.kind === 'dice' ? 'dice' : 'wheel'}’s box`;
  if (needsSource(card.action) || !ready)
    return {
      ...base,
      text: d.targets.length ? `The ${noun}’s ${what} for ${named(c, d.targets)} isn’t given yet: choose who in ${box}.` : `The ${noun}’s ${what} isn’t given yet: choose who in ${box}.`,
      quick: [{ label: 'Choose in the box', enter: true, then: 'close', run: () => c.act.focusOn(sel), aria: `Choose who in ${box}: the keys go to its score effect` }],
    };
  const gives = Object.entries(deltas)
    .map(([id, v]) => `${name(c, id)} ${v > 0 ? '+' : '−'}${formatPoints(Math.abs(v), sym(c))}`)
    .join(' · ');
  return {
    ...base,
    text: `The ${noun}’s ${what} for ${named(c, d.targets)} isn’t given yet.`,
    quick: [{ label: `✔ Give ${gives} ${to}`, enter: true, then: 'go', tone: 'good', run: () => c.act.scoreCard(card.key), aria: `Give ${gives}, then ${t2(to)}` }],
  };
}
/** "▶ question" → "the question", for screen readers. */
const t2 = (to: string) => (to === '▶ question' ? 'the question' : to === '▶ board' ? 'back to the board' : 'put it away');

/** A question pop-up's answer up, at Next ▶ (3.4 M): who's picked and has no points for it since it came up. */
function popupItems(c: GoCtx, o: Extract<Overlay, { kind: 'popup' }>): LeftItem[] {
  if (!o.answer || !o.revealed || o.at === undefined) return [];
  const since = o.at;
  const has = (id: Id) => c.session.scoreLog.some((e) => !e.undone && e.playerId === id && e.ts >= since);
  const picked = c.selected.filter((id) => !has(id) && c.session.players.some((p) => p.id === id));
  const a = c.amount != null && Number.isFinite(c.amount) ? Math.abs(c.amount) : (o.value ?? 0);
  if (!picked.length || !a) return [];
  const pts = formatPoints(a, sym(c));
  if (picked.length === 1) {
    const id = picked[0];
    const who = name(c, id);
    return [
      {
        id: 'popup',
        kind: 'loss',
        text: `${who} is picked and has no points for this question.`,
        lost: 'no points',
        quick: [
          { label: `＋ Award ${who} ${pts} and close it`, enter: true, then: 'go', tone: 'good', run: () => c.act.award(1, [id], a), aria: `Award ${who} ${pts}, then the question goes` },
          { label: `− Deduct ${who} ${pts} and close it`, key: '⇧⏎', then: 'go', tone: 'bad', run: () => c.act.award(-1, [id], a), aria: `Deduct ${pts} from ${who}, then the question goes` },
        ],
      },
    ];
  }
  return [
    {
      id: 'popup',
      kind: 'loss',
      text: `${named(c, picked)} are picked, with no points for this question yet.`,
      lost: 'no points',
      enterSay: 'Several are picked: ＋ or − on each line (1–9 changes who)',
      quick: picked.flatMap((id): Quick[] => {
        const who = name(c, id);
        return [
          { line: who, label: `＋ Award ${pts}`, then: 'keep', tone: 'good', run: () => c.act.award(1, [id], a, true), aria: `Award ${who} ${pts}` },
          { line: who, label: '− Deduct', then: 'keep', tone: 'bad', run: () => c.act.award(-1, [id], a, true), aria: `Deduct ${pts} from ${who}` },
        ];
      }),
    },
  ];
}

/**
 * A Daily Double's splash, at Show question ▶ (3.4 E): who found it and their wager are typed, so no check opens: the
 * keys stay in the Wager box, the names (or the box) flash, and the status line says what's missing. Null: it can go.
 * In one window a wager sent from a phone is never said.
 */
export function ddWaits(c: GoCtx): { say: string; at: 'names' | 'wager' } | null {
  const dd = c.session.dd;
  if (dd?.stage !== 'splash') return null;
  const id = dd.playerId && c.session.players.some((p) => p.id === dd.playerId) ? dd.playerId : undefined;
  if (!id) return { say: 'Who found it? Click their name (the keys stay in the Wager box)', at: 'names' };
  const who = name(c, id);
  const cap = formatPoints(ddCap(c.session, c.game, id), sym(c));
  const w = dd.draft;
  if (typeof w !== 'number') return { say: c.ddPhone ? `Waiting on ${who}’s phone: type their wager here if it doesn’t come` : `Type a wager (${who} can wager up to ${cap}), or True Daily Double`, at: 'wager' };
  if (w < 0) return { say: 'A wager can’t be below 0: type 0 or more', at: 'wager' };
  if (!c.wagerLimitsOff && w > ddCap(c.session, c.game, id)) return { say: `Over ${who}’s max (${cap}): type less, or tick Ignore the limit`, at: 'wager' };
  return null;
}

/** What going on by `step` would skip or lose now, but the kinds silenced this game. */
export function leftNow(c: GoCtx, step: Step): LeftItem[] {
  const all =
    step.id === 'reveal'
      ? [...partnerPlayItems(c), ...buzzItems(c), ...answersItems(c), ...cardItems(c)]
      : step.id === 'done'
        ? [...partnerJudgeItems(c), ...scoreItems(c), ...judgeItems(c)]
        : step.id === 'question'
          ? pickItems(c)
          : step.id === 'tool'
            ? toolItems(c)
            : [];
  const quiet = c.session.goonQuiet ?? [];
  return all.filter((i) => !i.quiet || !quiet.includes(i.quiet));
}

/** The box button that wears the ring now: the first item left with one (null: none). */
export const ringOf = (items: LeftItem[]): string | null => items.find((i) => !i.done && i.box)?.box ?? null;

// ---------- Going on ----------

/**
 * What pressing the blue button does: `run` the step, `open` the check, or `hold` (the controls hidden in one window:
 * nothing on stream changes, the pill pulses). Shift+click skips all but must items. With the controls hidden in one
 * window, what can be done later goes on (points not given: ↶ Reopen; a tile's wheel not spun); an answer shown early, a
 * must item or one lost for good (a score effect) holds.
 */
export function goOnDecision(source: GoSource, step: Step, items: LeftItem[], hidden: boolean, dual: boolean): 'run' | 'open' | 'hold' {
  const ask = asked(source, items);
  if (!ask.length) return 'run';
  if (hidden && !dual) return step.reveals || ask.some((i) => i.must || i.hold) ? 'hold' : 'run';
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
  // (The first item's own words, where it has them: "Show question without it".)
  const own = todo(check.items).find((i) => !i.must)?.anyway;
  if (own) return own;
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
  // (Not with a score effect left: Esc asks once about it too.)
  if (check.step.id === 'done' || (check.step.id === 'tool' && !todo(check.items).some((i) => i.hold))) parts.push('Esc closes at once');
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
  /** The blue button clicked (`shift`: with Shift, going on without asking), or Enter where it's Next (a wager box). */
  main: (source: 'main' | 'shift' | 'enter') => void;
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
