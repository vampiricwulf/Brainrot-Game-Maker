import { describe, expect, it } from 'vitest';
import { CLICK, stageClick, type ClickNow, type OverClick, type PartnerClick } from './stageclick';

const step = (id: string, label = 'Next ▶', left = false) => ({ id, label, left });
const now = (more: Partial<ClickNow>): ClickNow => ({
  on: 'reveal',
  phase: 'clue',
  step: null,
  armed: false,
  revealed: false,
  partner: null,
  ddWait: null,
  wagerWait: null,
  over: null,
  ...more,
});
const handing = (more: Partial<PartnerClick> = {}): PartnerClick => ({
  stage: 'distribute',
  judged: false,
  steal: null,
  soon: false,
  send: false,
  copyFor: [],
  copyCards: 0,
  clock: 'none',
  cards: true,
  ...more,
});
const over = (more: Partial<OverClick> = {}): OverClick => ({ busy: false, shop: false, popupHidden: false, wheel: null, diceFresh: false, mover: false, ...more });

describe('a click on the stage', () => {
  // Each row: the moment, then what the click does.
  const table: [string, Partial<ClickNow>, ReturnType<typeof stageClick>][] = [
    // Title cards and the intro.
    ['the round’s title card: the blue button’s step', { on: 'intro', phase: 'board', step: step('intro', 'Show board ▶') }, { do: 'go' }],
    ['an RPG title card (no blue button): it starts the round', { on: 'intro', phase: 'rpg' }, { do: 'act', act: 'intro' }],
    // A clue.
    ['a clue’s next question slide', { step: step('slide', 'Next slide ▶') }, { do: 'go' }],
    ['a clue’s question: 👁 Reveal answer, through the check', { step: step('reveal', '👁 Reveal answer', true) }, { do: 'go' }],
    ['a clue’s answer: ▦ Done ▶ board, through the check', { on: 'back', revealed: true, step: step('done', '▦ Done ▶ board', true) }, { do: 'go' }],
    ['a clue’s answer with no blue button: back to the board', { on: 'back', revealed: true }, { do: 'act', act: 'back' }],
    ['a question already answered: a click on it is the answer’s', { revealed: true, step: step('done') }, { do: 'none' }],
    ['a clue with no blue button: its next slide or the answer, as R', {}, { do: 'act', act: 'reveal' }],
    // A slides round.
    ['a slides round’s next slide', { phase: 'slides', step: step('slide', 'Next slide ▶') }, { do: 'go' }],
    ['a slides round’s last slide: it says so first', { phase: 'slides', step: step('nextround', 'Next round ▶') }, { do: 'say', say: CLICK.lastSlide('Next round ▶'), arm: true }],
    ['a slides round’s last slide, clicked again: on', { phase: 'slides', step: step('nextround', 'Final Jeopardy! ▶'), armed: true }, { do: 'go' }],
    // 🤝 A partner clue.
    ['PARTNER UP!: Show question ▶, through the check (who picked it, the partner)', { on: 'partnerup', step: step('question', 'Show question ▶', true) }, { do: 'go' }],
    ['handing out, cards for phones: the check (only 📤 or Enter sends)', { step: step('reveal', '👁 Reveal answer', true), partner: handing({ send: true }) }, { do: 'go' }],
    ['handing out, cards for phones, a moment after the question: the check too', { step: step('reveal'), partner: handing({ send: true, soon: true }) }, { do: 'go' }],
    ['handing out, nothing to send: the clock starts', { step: step('reveal', '👁 Reveal answer', true), partner: handing() }, { do: 'act', act: 'clock' }],
    ['handing out, a moment after the question: click again', { step: step('reveal'), partner: handing({ soon: true }) }, { do: 'say', say: CLICK.soon }],
    [
      'handing out, a card to copy by hand not copied: copy it first',
      { step: step('reveal'), partner: handing({ copyFor: ['Bob'], copyCards: 1 }) },
      { do: 'say', say: 'Copy the card to Bob first (📋 in the 🤝 box), then click again to start the clock', arm: true, flash: 'copy' },
    ],
    [
      'handing out, cards to copy for two',
      { step: step('reveal'), partner: handing({ copyFor: ['Bob', 'Cat'], copyCards: 2 }) },
      { do: 'say', say: 'Copy the cards to Bob & Cat first (📋 in the 🤝 box), then click again to start the clock', arm: true, flash: 'copy' },
    ],
    ['handing out, not copied, clicked again: the clock starts', { step: step('reveal'), armed: true, partner: handing({ copyFor: ['Bob'], copyCards: 1 }) }, { do: 'act', act: 'clock' }],
    ['handing out, the partner clue’s next question slide first', { step: step('slide', 'Next slide ▶'), partner: handing() }, { do: 'go' }],
    ['no cards, no clock yet: the clock starts', { step: step('reveal'), partner: handing({ stage: 'live', cards: false }) }, { do: 'act', act: 'clock' }],
    ['live, the clock running: the check (they’re still playing)', { step: step('reveal', '👁 Reveal answer', true), partner: handing({ stage: 'live', clock: 'up' }) }, { do: 'go' }],
    ['live, time’s up: the answer (it doesn’t ask)', { step: step('reveal'), partner: handing({ stage: 'live', clock: 'out' }) }, { do: 'go' }],
    ['judged: the answer', { step: step('reveal'), partner: handing({ stage: 'live', judged: true, clock: 'up' }) }, { do: 'go' }],
    ['a steal open: how it goes on', { step: step('reveal'), partner: handing({ stage: 'live', judged: true, steal: '🔔 A steal: …' }) }, { do: 'say', say: CLICK.steal('🔔 A steal: …') }],
    ['a partner clue with no blue button: nothing (never its answer)', { partner: handing({ stage: 'live', clock: 'up' }) }, { do: 'none' }],
    // ⭐ A Daily Double.
    ['a Daily Double’s splash, who found it missing: the keys stay in its box', { on: 'dd', step: step('ddshow', 'Show question ▶'), ddWait: 'Who found it? Click their name' }, { do: 'say', say: 'Who found it? Click their name', flash: 'dd' }],
    ['a Daily Double’s splash, a wager typed: its question', { on: 'dd', step: step('ddshow', 'Show question ▶') }, { do: 'go' }],
    // 🏆 The Final.
    ['the Final’s wagers, some missing: never the question', { on: 'wagers', phase: 'final', step: step('finalshow', 'Show question ▶'), wagerWait: 'Waiting on Bob’s phone' }, { do: 'say', say: 'Waiting on Bob’s phone', flash: 'wagers' }],
    ['the Final’s wagers, all in: it says so (the blue button shows the question)', { on: 'wagers', phase: 'final', step: step('finalshow', 'Show question ▶') }, { do: 'say', say: 'All wagers in: Show question ▶ (N)' }],
    ['the Final’s question: its answer, through the check', { phase: 'final', step: step('finalreveal', 'Reveal answer ▶', true) }, { do: 'go' }],
    ['the Final’s answer: Start player reveals ▶', { on: 'final-next', phase: 'final', step: step('reveals', 'Start player reveals ▶') }, { do: 'go' }],
    ['the spotlit player’s card: Show answer ▶ / Show wager ▶ / Next player ▶', { on: 'spotlight', phase: 'final', step: step('spot', 'Show wager ▶') }, { do: 'go' }],
    ['their verdict due: the check asks for it (a click never judges)', { on: 'spotlight', phase: 'final', step: step('spot', 'Next player ▶', true) }, { do: 'go' }],
    ['the last one’s verdict due: the check too', { on: 'spotlight', phase: 'final', step: step('finish', 'Finish game ▶', true) }, { do: 'go' }],
    ['everyone judged: finishing takes a second click', { on: 'spotlight', phase: 'final', step: step('finish', 'Finish game ▶') }, { do: 'say', say: CLICK.finish('Finish game ▶'), arm: true }],
    ['everyone judged, clicked again: on', { on: 'spotlight', phase: 'final', step: step('finish', 'Finish game ▶'), armed: true }, { do: 'go' }],
    ['the spotlight card on another step: nothing', { on: 'spotlight', phase: 'final', step: step('finalshow') }, { do: 'none' }],
    // What's over the stage.
    ['a wheel not spun: it spins', { on: 'overlay', over: over({ wheel: 'fresh' }), step: step('tool', 'Show question ▶', true) }, { do: 'act', act: 'spin' }],
    ['a wheel with every slice landed: it says so', { on: 'overlay', over: over({ wheel: 'spent' }) }, { do: 'say', say: CLICK.spent }],
    ['dice not rolled: they roll', { on: 'overlay', over: over({ diceFresh: true }) }, { do: 'act', act: 'roll' }],
    ['still turning: nothing', { on: 'overlay', over: over({ busy: true, wheel: null }), step: step('tool') }, { do: 'none' }],
    ['a shop: nothing (its wares are clicked)', { on: 'overlay', over: over({ shop: true }) }, { do: 'none' }],
    ['a pop-up’s question: its answer', { on: 'overlay', over: over({ popupHidden: true }), step: step('popreveal', '👁 Reveal answer') }, { do: 'act', act: 'popreveal' }],
    ['landed, the blue button puts it away: through the check', { on: 'overlay', over: over(), step: step('tool', 'Show question ▶', true) }, { do: 'go' }],
    ['the partner wheel landed: Next ▶', { on: 'overlay', over: over(), step: step('close', 'Next ▶') }, { do: 'go' }],
    ['a board game’s dice landed: the token moves', { on: 'overlay', phase: 'boardgame', over: over({ mover: true }), step: step('turn', 'Next turn ▶', true) }, { do: 'act', act: 'move' }],
    ['anything else landed: it closes', { on: 'overlay', over: over() }, { do: 'act', act: 'close' }],
    ['🎭 Who was who: it goes', { on: 'whowaswho', phase: 'board' }, { do: 'act', act: 'whowaswho' }],
  ];
  for (const [name, c, want] of table) it(name, () => expect(stageClick(now(c))).toEqual(want));

  it('never sends a card, judges or shows a partner clue’s answer early', () => {
    const partner = [handing(), handing({ send: true }), handing({ copyFor: ['Bob'], copyCards: 1 }), handing({ stage: 'live', clock: 'up' }), handing({ soon: true })];
    for (const p of partner) {
      const r = stageClick(now({ step: step('reveal', '👁 Reveal answer', true), partner: p }));
      expect(r.do === 'act' && r.act === 'reveal').toBe(false);
    }
  });

  it('says only names and counts (in one window the status line is on stream)', () => {
    const r = stageClick(now({ step: step('reveal'), partner: handing({ copyFor: ['Bob'], copyCards: 3 }) }));
    expect(r).toMatchObject({ say: 'Copy the cards to Bob first (📋 in the 🤝 box), then click again to start the clock' });
  });
});
