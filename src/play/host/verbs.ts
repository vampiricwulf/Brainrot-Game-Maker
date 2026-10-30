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
  putBack: { label: '↩ Cancel (keep tile)', key: '⇧Esc', title: 'Shift+Esc: back to the board without using up this tile' },

  // ---------- Phone buzzers ----------
  openBuzzers: { label: '🔔 Open the buzzers', key: 'U', title: "U: buzzers open for everyone who hasn't missed this clue" },
  resetBuzzers: { label: '↺ Reset buzzers', key: '0', title: '0: nobody is locked out any more, and the buzzers open for everyone' },
  rollForIt: { label: '🎲 Roll for it', title: 'The tied players roll: the order they roll in is the order they answer in' },

  // ---------- Wheels and dice ----------
  spin: { label: 'Spin!', key: 'W' },
  /** While it spins (again: once it lands). */
  spinning: { label: 'Spin again', key: 'W' },
  /** Landed on "Spin again". */
  spinAgain: { label: '↻ Spin again', key: 'W' },
  roll: { label: 'Roll!', key: 'D' },
  rollAgain: { label: 'Roll again', key: 'D' },
  /** A wheel or dice tile's own tool: its question comes next (or a tool opened any time). */
  closeTool: { label: 'Close', key: 'Esc' },
  /** A wheel or dice tile with nothing to ask: closing it ends the tile. */
  closeToolBoard: { label: 'Close ▶ board', key: 'Esc' },

  // ---------- A Daily Double, the Final ----------
  showQuestion: { label: 'Show question ▶' },

  // ---------- A 🤝 partner clue ----------
  partnerSpin: { label: '🎡 Spin for a partner', key: 'W', title: 'W, Enter or N: the wheel spins over the other players' },
  describerSpin: { label: '🎡 Spin for the describer', key: 'W' },
  /** The partner was the only one there could be: the wheel can spin all the same. */
  spinAnyway: { label: '🎡 Spin anyway', key: 'W' },
  /** Who picked it, another player (a menu). */
  pickerChange: { label: 'change ▾', title: 'Someone else picked it (click: the number keys choose the partner)' },
  /** The partner, another player (a menu), once the question is up. */
  partnerChange: { label: 'change partner ▾', title: 'Choose another partner (the cards that follow a part go with it)' },
  partnerShow: { label: '▶ Show question', key: '⏎', title: 'Enter or N: the question goes on screen (nothing is sent to anyone)' },
  /** The step after the question, its box's heading: who gets each card. */
  handOut: { label: '📤 Distribute' },
  sendAndStart: { label: '📤 Send and start', key: '⏎', title: 'Enter or N: the cards not sent yet go to their phones, and the countdown starts' },
  startClock: { label: '⏱ Start the clock', key: '⏎' },
  gotIt: { label: '✔ Got it', key: '⏎' },
  missed: { label: '✘ Missed', key: '⇧⏎' },

  // ---------- The Final's question and reveals ----------
  finalReveal: { label: 'Reveal answer ▶', key: 'N' },
  startReveals: (noun: string): Verb => ({ label: `Start ${noun} reveals ▶`, key: 'N' }),
  showAnswer: { label: 'Show answer ▶', key: 'N' },
  showWager: { label: 'Show wager ▶', key: 'N' },
  nextPlayer: (noun: string): Verb => ({ label: `Next ${noun} ▶`, key: 'N' }),
  /** The spotlit player's verdicts: the likely one on the main button, the other beside it. */
  right: (who: string): Verb => ({ label: `✔ ${who} right`, key: 'C', title: `C: ${who} is right` }),
  wrong: (who: string): Verb => ({ label: `✘ ${who} wrong`, key: 'X', title: `X: ${who} is wrong` }),
  rightBeside: (who: string): Verb => ({ label: '✔ Right', key: 'C', title: `C: ${who} is right` }),
  wrongBeside: (who: string): Verb => ({ label: '✘ Wrong', key: 'X', title: `X: ${who} is wrong` }),
  finishGame: { label: 'Finish game ▶' },
  /** The Final over, a round after it. */
  nextNamed: (round: string): Verb => ({ label: `Next: ${round} ▶` }),

  // ---------- A tie at the end ----------
  tiebreakerClue: { label: '❓ Tiebreaker clue' },
  rollOff: { label: '🎲 Tiebreaker roll-off', key: 'O' },
  coWinners: { label: '🤝 Declare co-winners' },
  backToResults: { label: '🏁 Back to results', key: 'N', title: 'N: back to the results' },

  // ---------- A board game's turn ----------
  boardRoll: { label: '🎲 Roll', key: 'D' },
  boardSpin: { label: '🎡 Spin', key: 'D' },
  move: (steps: number): Verb => ({ label: `${steps < 0 ? '◀ Back' : '▶ Move'} ${Math.abs(steps)}`, key: '⏎' }),
  /** One space a turn: the one way on. */
  stepTo: (space: string): Verb => ({ label: `→ ${space}`, key: '⏎' }),
  pickWay: { label: '🔀 Pick a way' },
  nextTurn: { label: 'Next turn ▶', key: 'N', title: 'N: the next player’s turn' },
  prevTurn: { label: '◀ Previous turn', key: '⇧N', title: 'Shift+N: back to the turn before' },
  doneEditing: { label: '✓ Done editing', key: 'Esc', title: 'Esc: back to playing (the changes stay in this game)' },
} as const satisfies Record<string, Verb | ((...args: never[]) => Verb)>;
