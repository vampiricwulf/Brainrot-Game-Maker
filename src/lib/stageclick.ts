/**
 * A host's click on the stage (docs/SPEC.md §6.6, the plan's rule 3): what it does in the moment on screen. Pure: the
 * play screen works out the moment (ClickNow) and does what this says.
 * - 'go': the blue button's step (Next slide ▶, 👁 Reveal answer, ▦ Done ▶ board, Show question ▶…), through the check
 *   before going on, so a click never loses anything (it asks when something's left, as the blue button does).
 * - 'act': what the stage itself shows, at once: a title card starts the round, a wheel spins, dice roll, landed dice
 *   move the token, a question pop-up shows its answer, and a partner clue's hand-out with nothing to send starts the
 *   clock.
 * - 'say': nothing on stream; the status line says what to do (with the controls hidden, the moment's menu opens at
 *   the pointer under it). `arm`: it ends "click again", and this moment's next click goes on (never the rest of a
 *   double-click: CLICK_AGAIN_MS).
 * - 'none': nothing (a wheel still turning, a shop).
 * Its words are names and counts only: in one window the status line is on stream.
 */
import type { StageAction } from './live';
import { nameList } from './session';

/** A "click again" counts only this long after the click that asked for it: a double-click is one click. */
export const CLICK_AGAIN_MS = 600;

/** A 🤝 partner clue's question up (not PARTNER UP!), as a click reads it. */
export type PartnerClick = {
  stage: 'distribute' | 'live';
  /** Both of the two have their mark. */
  judged: boolean;
  /** A steal is open (the answer hidden, the clock not run out): how it goes on. */
  steal: string | null;
  /** The question went up a moment ago (a click then is the rest of the one that put it up). */
  soon: boolean;
  /** Cards still to go to phones (📤 Send and start): only 📤 or Enter sends them, so the click asks (the check). */
  send: boolean;
  /** Who has a card to copy by hand not 📋 copied yet, and how many cards those are. */
  copyFor: string[];
  copyCards: number;
  /** The countdown: none yet, up (running or paused), or run out. */
  clock: 'none' | 'up' | 'out';
  /** It has 🤫 cards. */
  cards: boolean;
};

/** What's over the stage, as a click reads it. */
export type OverClick = {
  /** Still spinning or rolling (or a roll-off): the click waits. */
  busy: boolean;
  /** A shop: it stays until 🚪 Leave shop (its wares are clicked). */
  shop: boolean;
  /** A question pop-up with its answer not up yet. */
  popupHidden: boolean;
  /** A wheel not spun yet ('spent': every slice has landed, it can't). */
  wheel: 'fresh' | 'spent' | null;
  /** Dice not rolled yet. */
  diceFresh: boolean;
  /** A board game's own dice or movement wheel, landed: the click moves the token, as Enter does. */
  mover: boolean;
};

/** The moment, as a click on the stage reads it. */
export type ClickNow = {
  /** What was clicked. */
  on: StageAction;
  phase: 'board' | 'clue' | 'final' | 'rpg' | 'boardgame' | 'slides' | 'tiebreaker' | 'end';
  /**
   * The blue button's step now (null: none): its id (goon.ts' StepId), its words, and whether going on by it would ask
   * first (something's left).
   */
  step: { id: string; label: string; left: boolean } | null;
  /** This moment's "click again" was said (CLICK_AGAIN_MS ago or more). */
  armed: boolean;
  /** The open clue's answer is up. */
  revealed: boolean;
  partner: PartnerClick | null;
  /** A Daily Double's splash: what's still to type before its question (goon.ts ddWaits), null: it can go. */
  ddWait: string | null;
  /** The Final's wagers: what's still to type (goon.ts finalWaits), null: all in. */
  wagerWait: string | null;
  over: OverClick | null;
};

export type ClickAct = 'intro' | 'reveal' | 'back' | 'clock' | 'whowaswho' | 'popreveal' | 'spin' | 'roll' | 'move' | 'close';
/** `flash`: what the status line points at flashes once (the 🤝 box's 📋, the Daily Double's box, the waiting wager's row). */
export type Click = { do: 'go' } | { do: 'act'; act: ClickAct } | { do: 'say'; say: string; arm?: true; flash?: 'copy' | 'dd' | 'wagers' } | { do: 'none' };

/** What a click says, in click words with the key in brackets. */
export const CLICK = {
  lastSlide: (next: string) => `Last slide: click again (or ${next}) to go on`,
  finish: (next: string) => `Everyone is judged: click again (or ${next}) to go on`,
  soon: 'The question just went up: click again to start the clock',
  copy: (names: string, cards: number) => `Copy ${cards === 1 ? 'the card' : 'the cards'} to ${names} first (📋 in the 🤝 box), then click again to start the clock`,
  allIn: (step: string) => `All wagers in: ${step} (N)`,
  steal: (how: string) => `${how} · R shows the answer anyway`,
  spent: 'Every slice has landed: Restore them to spin again',
  clockOn: 'Clock started',
} as const;

const GO: Click = { do: 'go' };
const NONE: Click = { do: 'none' };
const act = (a: ClickAct): Click => ({ do: 'act', act: a });

/** What a click on the stage does now. */
export function stageClick(c: ClickNow): Click {
  const st = c.step;
  switch (c.on) {
    case 'intro':
      return st?.id === 'intro' ? GO : act('intro');
    case 'whowaswho':
      // (🎭 Who was who over the stage: a click takes it off, as 🙈 Hide does.)
      return act('whowaswho');
    case 'overlay':
      return overClick(c);
    case 'back':
      if (c.phase !== 'clue') return NONE;
      return st?.id === 'done' ? GO : act('back');
    case 'final-next':
    case 'partnerup':
      // (The Final's answer up: Start player reveals ▶. PARTNER UP!: Show question ▶, asking first for who picked it and
      // the partner.)
      return st ? GO : NONE;
    case 'dd':
      // Who found it and the wager are typed: the keys stay in its box, which says what's missing.
      if (c.ddWait) return { do: 'say', say: c.ddWait, flash: 'dd' };
      return st ? GO : NONE;
    case 'wagers':
      // A click never shows the Final's question: it says who it waits on, or that it can go.
      if (c.wagerWait) return { do: 'say', say: c.wagerWait, flash: 'wagers' };
      return st ? { do: 'say', say: CLICK.allIn(st.label) } : NONE;
    case 'spotlight':
      // The spotlit player's card: Show answer ▶, Show wager ▶, Next player ▶ (a verdict due: the check asks for it).
      // Never judges. With everyone judged, finishing takes a second click, as N takes a second N.
      if (st?.id === 'finish' && !st.left && !c.armed) return { do: 'say', say: CLICK.finish(st.label), arm: true };
      return st?.id === 'spot' || st?.id === 'finish' ? GO : NONE;
    case 'reveal':
      return revealClick(c);
  }
}

/** A click on a question (a clue's, the Final's, the tiebreaker's) or a slides round's slide. */
function revealClick(c: ClickNow): Click {
  const st = c.step;
  if (c.phase === 'slides') {
    if (!st) return NONE;
    // Leaving the last slide takes a second click (N and the blue button go at once).
    if (st.id === 'nextround' && !c.armed) return { do: 'say', say: CLICK.lastSlide(st.label), arm: true };
    return GO;
  }
  if (c.revealed) return NONE;
  // A clue's next question slide first.
  if (st?.id === 'slide') return GO;
  const p = c.partner;
  if (p?.steal) return { do: 'say', say: CLICK.steal(p.steal) };
  // A 🤝 partner clue's hand-out (or no cards and no clock yet): cards waiting for phones ask first (only 📤 or Enter
  // sends them); cards to copy by hand say to copy them first; otherwise the click starts the clock.
  if (p && !p.judged && (p.stage === 'distribute' || (p.clock === 'none' && !p.cards))) {
    if (p.send) return GO;
    if (p.soon) return { do: 'say', say: CLICK.soon };
    if (p.copyFor.length && !c.armed) return { do: 'say', say: CLICK.copy(nameList(p.copyFor), p.copyCards), arm: true, flash: 'copy' };
    return act('clock');
  }
  // The answer, through the check (a partner clue still playing: it asks, never shows it early).
  if (st?.id === 'reveal' || st?.id === 'finalreveal') return GO;
  // (No blue button here: the next question slide, or the answer, as R does. Never a partner clue's.)
  return p ? NONE : act('reveal');
}

/** A click on what's over the stage: spin or roll it first, a pop-up's answer, then the blue button's step. */
function overClick(c: ClickNow): Click {
  const o = c.over;
  if (!o || o.busy || o.shop) return NONE;
  if (o.popupHidden) return act('popreveal');
  if (o.wheel === 'spent') return { do: 'say', say: CLICK.spent };
  if (o.wheel === 'fresh') return act('spin');
  if (o.diceFresh) return act('roll');
  // (Next ▶, Show question ▶ or ▦ Done ▶ board, through the check: a score effect not given, a wheel on "Spin again".)
  if (c.step?.id === 'close' || c.step?.id === 'tool') return GO;
  if (o.mover) return act('move');
  return act('close');
}
