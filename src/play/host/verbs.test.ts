import { describe, expect, it } from 'vitest';
import { VERBS, type Verb } from './verbs';

/** What the moment-dependent words are filled in with here (else a name). */
const SAMPLE: Record<string, unknown[]> = { revealCategory: [2, 5], nextSlideOf: [1, 3], move: [3] };
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
      putBack: '↩ Cancel (keep tile) [⇧Esc]',
      openBuzzers: '🔔 Open the buzzers [U]',
      rollForIt: '🎲 Roll for it',
      spin: 'Spin! [W]',
      spinning: 'Spin again [W]',
      spinAgain: '↻ Spin again [W]',
      roll: 'Roll! [D]',
      rollAgain: 'Roll again [D]',
      closeTool: 'Close [Esc]',
      closeToolBoard: 'Close ▶ board [Esc]',
      showQuestion: 'Show question ▶',
      partnerSpin: '🎡 Spin for a partner [W]',
      describerSpin: '🎡 Spin for the describer [W]',
      partnerShow: '▶ Show question [⏎]',
      sendAndStart: '📤 Send and start [⏎]',
      startClock: '⏱ Start the clock [⏎]',
      finalReveal: 'Reveal answer ▶ [N]',
      tiebreakerClue: '❓ Tiebreaker clue',
      rollOff: '🎲 Tiebreaker roll-off [O]',
      backToResults: '🏁 Back to results [N]',
      boardRoll: '🎲 Roll [D]',
      nextTurn: 'Next turn ▶ [N]',
    });
    expect(VERBS.revealCategory(2, 5).label).toBe('Reveal category 2 of 5 ▶');
    expect(VERBS.nextSlideOf(1, 3).title).toBe('N: slide 2 of 3 (Shift+N: the slide before) · or click the slide');
    expect([VERBS.right('Ann').label, VERBS.wrong('Ann').label, VERBS.rightBeside('Ann').label]).toEqual(['✔ Ann right', '✘ Ann wrong', '✔ Right']);
    expect([VERBS.move(3).label, VERBS.move(-2).label, VERBS.stepTo('Bonus').label]).toEqual(['▶ Move 3', '◀ Back 2', '→ Bonus']);
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
});
