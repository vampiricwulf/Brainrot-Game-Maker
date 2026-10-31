/**
 * The host screen's words for each step of a show, in one list: the main button, the boxes' own buttons and the
 * stage's menu read them here, so a step has the same name, key and tooltip wherever it shows, and a rename is one line.
 * Each has its key as the main button's key cap shows it (⏎ Enter, ⇧ Shift), where it has one. Words that depend on the
 * moment (a player's name, how many) are functions.
 */
export type Verb = {
  label: string;
  /** Its key cap: N, R, W, Esc, ⏎, ⇧N… */
  key?: string;
  /** Its tooltip, where it's always the same. */
  title?: string;
};

const SHOW = 'N (or click the screen)';

/**
 * The blue button's words (the host panel's main button): only the show's next step, a Next, a Reveal or the next
 * screen, never a box's action (a spin, a send, points, a verdict: those are in VERBS, on the boxes' own buttons). Its
 * key cap is N wherever N presses it (the step adds it). `title`: what it puts on screen; `anyway`: the check's way to
 * take it with something left ("▦ Done anyway").
 */
export type FlowVerb = Verb & { anyway?: string };

export const FLOW = {
  /** What's over the stage goes (a tool, the scores, a sheet, the partner wheel landed, a pop-up after its answer). */
  next: { label: 'Next ▶', title: 'Puts it away: back to the moment under it', anyway: 'Next anyway' },
  // A round's intro.
  showBoard: { label: 'Show board ▶', title: 'The board goes on screen' },
  startRound: { label: 'Start the round ▶', title: 'The round starts' },
  revealCategories: { label: 'Reveal categories ▶', title: 'The categories come up' },
  revealCategory: (n: number, of: number): FlowVerb => ({ label: `Reveal category ${n} of ${of} ▶`, title: 'The next category comes up' }),
  // Slides: a clue's question slides, a slides round.
  nextSlide: (at: number, of: number): FlowVerb => ({ label: 'Next slide ▶', title: `Slide ${at + 1} of ${of} (Shift+N: the slide before) · or click the slide` }),
  // A clue.
  reveal: { label: '👁 Reveal answer', title: 'The answer goes on screen (R shows or hides it at once) · or click the slide', anyway: '👁 Reveal anyway' },
  done: { label: '▦ Done ▶ board', title: 'Back to the board, the tile used (Esc closes at once)', anyway: '▦ Done anyway' },
  // A round played out, or a slides round's last slide: where it goes (the next round, a Final by its name, the end).
  nextRound: { label: 'Next round ▶', title: 'The next round starts' },
  toRound: (name: string): FlowVerb => ({ label: `${name} ▶`, title: `${name} starts` }),
  endGame: { label: 'End game ▶', title: 'The results go on screen' },
  // A Daily Double, a 🤝 partner clue's PARTNER UP!, the Final, the tiebreaker, a board game (the rest move later).
  showQuestion: { label: 'Show question ▶', title: 'The question goes on screen', anyway: 'Show question anyway' },
  startReveals: (noun: string): FlowVerb => ({ label: `Start ${noun} reveals ▶`, title: 'The reveals start' }),
  finalReveal: { label: 'Reveal answer ▶', title: 'The answer goes on screen', anyway: 'Reveal anyway' },
  showAnswer: { label: 'Show answer ▶', title: 'Their answer goes on screen' },
  showWager: { label: 'Show wager ▶', title: 'Their wager goes on screen' },
  nextPlayer: (noun: string): FlowVerb => ({ label: `Next ${noun} ▶`, title: `The next ${noun} in the reveals` }),
  finishGame: { label: 'Finish game ▶', title: 'The results go on screen' },
  nextNamed: (round: string): FlowVerb => ({ label: `Next: ${round} ▶`, title: `${round} starts` }),
  backToResults: { label: '🏁 Back to results', title: 'Back to the results', anyway: '🏁 Back to results, still tied' },
  nextTurn: { label: 'Next turn ▶', title: 'The next player’s turn', anyway: 'Next turn anyway' },
} as const satisfies Record<string, FlowVerb | ((...args: never[]) => FlowVerb)>;

/** The check before going on (pressing the blue button with something left): its own words. */
export const CHECK = {
  /** Its heading when what's left is the box's normal next step. */
  first: 'First:',
  /** When going on would lose something (points not given, answers not judged). */
  loss: 'Before you go on',
  /** Everything done meanwhile: it waits for the step. */
  nothing: '✓ Nothing left',
  notYet: 'Not yet',
  /** Under the blue button's step, where the blue button was. */
  waits: 'waits for this',
  comesOnce: 'comes once this is done',
  /** An item done elsewhere keeps its line. */
  done: '✓ Done',
  /** "Don't ask about opening the buzzers again this game", by kind. */
  quiet: {
    landing: 'landings',
    roll: 'rolling',
    buzzers: 'opening the buzzers',
    tool: 'spinning a tile’s wheel',
    answers: 'typed answers still coming',
  },
  dontAsk: (what: string) => `Don’t ask about ${what} again this game`,
  /** The blue button's tooltip: how to skip asking. */
  shiftClick: 'Shift+click: go on without asking',
  /** A stage click that opened it, in two windows: a note at the pointer. */
  seePanel: 'See the panel ↘ first',
  /** With the controls hidden in one window: the only note on stream (it never says what). */
  hiddenNote: 'H: something’s left first',
  /** A click on the stage while it's open. */
  answerFirst: 'Answer it in the panel first, or Esc',
} as const;

export const VERBS = {
  // ---------- A round's intro ----------
  showBoard: { label: 'Show board ▶', key: 'N', title: SHOW },
  startRound: { label: 'Start the round ▶', key: 'N', title: SHOW },
  revealCategories: { label: 'Reveal categories ▶', key: 'N', title: SHOW },
  revealCategory: (n: number, of: number): Verb => ({ label: `Reveal category ${n} of ${of} ▶`, key: 'N', title: SHOW }),
  skipIntro: { label: 'Skip intro' },

  // ---------- A clue's row: its slides, its answer, the way out ----------
  nextSlide: { label: 'Next slide ▶', key: 'N', title: 'N: the next slide' },
  /** (On the main button: where it is.) */
  nextSlideOf: (at: number, of: number): Verb => ({
    label: 'Next slide ▶',
    key: 'N',
    title: `N: slide ${at + 1} of ${of} (Shift+N: the slide before) · or click the slide`,
  }),
  prevSlide: { label: '◀ Slide', key: '⇧N', title: 'Shift+N: the slide before' },
  reveal: { label: '👁 Reveal answer', key: 'R', title: 'R (press again to hide)' },
  hide: { label: '🙈 Hide answer', key: 'R', title: 'R (press again to hide)' },
  done: { label: '▦ Done ▶ board', key: 'Esc', title: 'Esc: back to the board (marks the tile used)' },
  putBack: { label: '↩ Put back (keep tile)', key: '⇧Esc', title: 'Shift+Esc: back to the board without using up this tile' },

  // ---------- Phone buzzers ----------
  openBuzzers: { label: '🔔 Open the buzzers', key: 'U', title: "U: buzzers open for everyone who hasn't missed this clue" },
  resetBuzzers: { label: '↺ Reset buzzers', key: '0', title: '0: nobody is locked out any more, and the buzzers open for everyone' },
  rollForIt: { label: '🎲 Roll for it', key: 'O', title: 'The tied players roll: the order they roll in is the order they answer in' },

  // ---------- Wheels and dice ----------
  spin: { label: '🎡 Spin!', key: 'W' },
  /** Once it's spun, in the same place (greyed while it turns; ringed when it landed on "Spin again"). */
  spinAgain: { label: '↻ Spin again', key: 'W' },
  roll: { label: '🎲 Roll!', key: 'D' },
  rollAgain: { label: '↻ Roll again', key: 'D' },
  /**
   * A question pop-up's own way out before its answer (it goes unseen; the blue button reveals it), and Esc's in the
   * stage's menu. (Putting a tool away is the blue button's: Show question ▶, ▦ Done ▶ board, Next ▶.)
   */
  closeToolBox: { label: '✕ Close', key: 'Esc' },

  // ---------- A Daily Double, the Final ----------
  showQuestion: { label: 'Show question ▶' },

  // ---------- A 🤝 partner clue ----------
  partnerSpin: { label: '🎡 Spin for a partner', key: 'W', title: 'W: the wheel spins over the other players' },
  describerSpin: { label: '🎡 Spin for the describer', key: 'W' },
  /** The partner was the only one there could be: the wheel can spin all the same. */
  spinAnyway: { label: '🎡 Spin anyway', key: 'W' },
  /** Who picked it, another player (a menu). */
  pickerChange: { label: 'Someone else picked it ▾', title: 'Choose who picked it instead (the number keys choose the partner now)' },
  /** The partner, another player (a menu), once the question is up. */
  partnerChange: { label: 'Another partner ▾', title: 'Choose another partner (the cards that follow a part go with it)' },
  /** The step after the question, its box's heading: who gets each card. */
  handOut: { label: '📤 Hand out the cards' },
  sendAndStart: { label: '📤 Send and start', key: '⏎', title: 'Enter: the cards not sent yet go to their phones, and the countdown starts' },
  /** The clock started already (T) with cards still to send: Enter sends them, the clock going on. */
  sendCards: { label: '📤 Send the cards (clock running)', key: '⏎', title: 'Enter: the cards not sent yet go to their phones (the countdown goes on)' },
  /** (Its seconds: what the countdown starts from.) */
  startClock: (secs: number): Verb => ({ label: `⏱ Start the clock (${secs} s)`, key: '⏎' }),
  gotIt: { label: '✔ Got it', key: '⏎' },
  missed: { label: '✘ Missed', key: '⇧⏎' },

  // ---------- The Final's reveals (its steps are the blue button's: FLOW) ----------
  /** The spotlit player's verdicts, in their row (and in the check), ✔ then ✘: the likely one ringed, never moved. */
  right: (who: string): Verb => ({ label: '✔ Right', key: 'C', title: `C: ${who} is right` }),
  wrong: (who: string): Verb => ({ label: '✘ Wrong', key: 'X', title: `X: ${who} is wrong` }),

  // ---------- A tie at the end (its box; 🏁 Back to results from the tiebreaker is FLOW's) ----------
  tiebreakerClue: { label: '❓ Tiebreaker clue' },
  rollOff: { label: '🎲 Tiebreaker roll-off', key: 'O' },
  coWinners: { label: '🤝 Declare co-winners' },

  // ---------- Leaving a round: its question's answers ----------
  keepPlaying: { label: 'Keep playing' },
  goToRound: (round: string): Verb => ({ label: `Go to ${round} ▶` }),
  endGame: { label: 'End game ▶' },

  // ---------- A board game's turn (its box's: Next turn ▶ is the blue button's, FLOW) ----------
  boardRoll: { label: '🎲 Roll', key: 'D' },
  boardSpin: { label: '🎡 Spin', key: 'D' },
  move: (steps: number): Verb => ({ label: `${steps < 0 ? '◀ Back' : '▶ Move'} ${Math.abs(steps)}`, key: '⏎' }),
  /** One space a turn: the one way on. */
  stepTo: (space: string): Verb => ({ label: `→ ${space}`, key: '⏎' }),
  nextTurn: { label: 'Next turn ▶', key: 'N', title: 'N: the next player’s turn' },
  prevTurn: { label: '◀ Previous turn', key: '⇧N', title: 'Shift+N: back to the turn before' },
  doneEditing: { label: '✓ Done editing', key: 'Esc', title: 'Esc: back to playing (the changes stay in this game)' },
} as const satisfies Record<string, Verb | ((...args: never[]) => Verb)>;
