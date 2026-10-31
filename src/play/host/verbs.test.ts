import { describe, expect, it } from 'vitest';
import { CHECK, FLOW, VERBS, type Verb } from './verbs';

/** What the moment-dependent words are filled in with here (else a name). */
const SAMPLE: Record<string, unknown[]> = { revealCategory: [2, 5], nextSlideOf: [1, 3], move: [3], startClock: [45] };
/** Every step's words, the moment-dependent ones filled in. */
const all = (): [string, Verb][] =>
  Object.entries(VERBS).map(([name, v]) => [name, typeof v === 'function' ? (v as (...a: unknown[]) => Verb)(...(SAMPLE[name] ?? ['Ann'])) : v]);

describe('the host screen’s words for each step', () => {
  it('names each step as the host screen does today (a rename is a change here, on purpose)', () => {
    const words = Object.fromEntries(all().map(([name, v]) => [name, v.key ? `${v.label} [${v.key}]` : v.label]));
    expect(words).toMatchObject({
      nextSlide: 'Next slide ▶ [N]',
      prevSlide: '◀ Slide [⇧N]',
      reveal: '👁 Reveal answer [R]',
      hide: '🙈 Hide answer [R]',
      done: '▦ Done ▶ board [Esc]',
      putBack: '↩ Put back (keep tile) [⇧Esc]',
      openBuzzers: '🔔 Open the buzzers [U]',
      rollForIt: '🎲 Roll for it [O]',
      spin: 'Spin! [W]',
      spinning: 'Spin again [W]',
      spinAgain: '↻ Spin again [W]',
      roll: 'Roll! [D]',
      rollAgain: 'Roll again [D]',
      closeToolBox: '✕ Close [Esc]',
      showQuestion: 'Show question ▶',
      partnerSpin: '🎡 Spin for a partner [W]',
      describerSpin: '🎡 Spin for the describer [W]',
      spinAnyway: '🎡 Spin anyway [W]',
      pickerChange: 'change ▾',
      partnerChange: 'change partner ▾',
      handOut: '📤 Distribute',
      sendAndStart: '📤 Send and start [⏎]',
      sendCards: '📤 Send the cards (clock running) [⏎]',
      startClock: '⏱ Start the clock (45 s) [⏎]',
      finalReveal: 'Reveal answer ▶ [N]',
      tiebreakerClue: '❓ Tiebreaker clue',
      rollOff: '🎲 Tiebreaker roll-off [O]',
      backToResults: '🏁 Back to results [N]',
      keepPlaying: 'Keep playing',
      endGame: 'End game ▶',
      boardRoll: '🎲 Roll [D]',
      nextTurn: 'Next turn ▶ [N]',
    });
    expect(VERBS.revealCategory(2, 5).label).toBe('Reveal category 2 of 5 ▶');
    expect(VERBS.nextSlideOf(1, 3).title).toBe('N: slide 2 of 3 (Shift+N: the slide before) · or click the slide');
    expect([VERBS.right('Ann').label, VERBS.wrong('Ann').label, VERBS.wrong('Ann').title]).toEqual(['✔ Right', '✘ Wrong', 'X: Ann is wrong']);
    expect([VERBS.move(3).label, VERBS.move(-2).label, VERBS.stepTo('Bonus').label]).toEqual(['▶ Move 3', '◀ Back 2', '→ Bonus']);
    expect(VERBS.goToRound('Double Jeopardy!').label).toBe('Go to Double Jeopardy! ▶');
    // (Putting a tool away is the blue button's step: no Close of its own.)
    expect(['closeTool', 'closeToolBoard'].filter((k) => k in VERBS)).toEqual([]);
    // (A box's button says only its own key: N is the blue button's.)
    expect(all().filter(([, v]) => /\bor N\b/.test(v.title ?? '')).map(([name]) => name)).toEqual([]);
    expect([VERBS.partnerSpin.title, VERBS.sendAndStart.title]).toEqual(['W: the wheel spins over the other players', 'Enter: the cards not sent yet go to their phones, and the countdown starts']);
  });

  it('gives each step its own words, and a key cap a few signs long', () => {
    const fixed = all().filter(([name]) => typeof VERBS[name as keyof typeof VERBS] !== 'function');
    const labels = fixed.map(([, v]) => v.label);
    expect(labels.filter((l, i) => labels.indexOf(l) !== i)).toEqual([]);
    for (const [name, v] of all()) {
      expect(v.label.trim(), name).toBe(v.label);
      expect(v.label.length, name).toBeGreaterThan(0);
      if (v.key) expect(v.key.length, name).toBeLessThanOrEqual(4);
    }
  });

  it('the blue button’s words (FLOW) are a Next, a Reveal or the next screen, never a box’s action', () => {
    const fill: Record<string, unknown[]> = { revealCategory: [2, 5], nextSlide: [1, 3], toRound: ['Final Jeopardy!'], startReveals: ['player'], nextPlayer: ['team'], nextNamed: ['Double Jeopardy!'] };
    const flow = Object.entries(FLOW).map(([name, v]) => (typeof v === 'function' ? (v as (...a: unknown[]) => Verb)(...fill[name]) : v).label);
    expect(flow).toEqual([
      'Next ▶',
      'Show board ▶',
      'Start the round ▶',
      'Reveal categories ▶',
      'Reveal category 2 of 5 ▶',
      'Next slide ▶',
      '👁 Reveal answer',
      '▦ Done ▶ board',
      'Next round ▶',
      'Final Jeopardy! ▶',
      'End game ▶',
      'Show question ▶',
      'Start player reveals ▶',
      'Reveal answer ▶',
      'Show answer ▶',
      'Show wager ▶',
      'Next team ▶',
      'Finish game ▶',
      'Next: Double Jeopardy! ▶',
      '🏁 Back to results',
      'Next turn ▶',
    ]);
    // (Spec 1.2: never on the main button.)
    const never = /Spin|Roll|Move|Pick a way|Send|Start the clock|Open the buzzers|Award|Deduct|✔|✘|Close|Tiebreaker|co-winners|Done editing|→/;
    for (const l of flow) expect(l, l).not.toMatch(never);
    // The blue button's key cap is the step's (N where N presses it), never a box's key.
    for (const v of Object.values(FLOW)) if (typeof v !== 'function') expect('key' in v, v.label).toBe(false);
  });

  it('the check names what it asks about plainly', () => {
    expect([CHECK.first, CHECK.loss, CHECK.nothing, CHECK.notYet]).toEqual(['First:', 'Before you go on', '✓ Nothing left', 'Not yet']);
    expect(CHECK.dontAsk(CHECK.quiet.buzzers)).toBe('Don’t ask about opening the buzzers again this game');
  });
});
