import { describe, expect, it } from 'vitest';
import type { MenuEntry } from '../../lib/menustate.svelte';
import { menuKeys, selectItems, stageMenuOf, stepItem, type StageItem } from './stagemenu';
import { step } from './slots.svelte';
import { VERBS } from './verbs';

const item = (label: string, more: Partial<StageItem> = {}): StageItem => ({ label, onclick: () => {}, ...more });
/** Each line as it reads: "# heading", "words · key", " (off)" when greyed, "—" for a line. */
const lines = (m: MenuEntry[]) =>
  m.map((i) => ('sep' in i ? '—' : 'heading' in i ? `# ${i.heading}` : `${i.label}${i.keys ? ` · ${i.keys}` : ''}${i.disabled ? ' (off)' : ''}`));

describe('the stage’s menu', () => {
  it('says a key cap in a menu’s words', () => {
    expect(['⏎', '⇧⏎', '⇧N', 'Esc', '⇧Esc', 'W', undefined].map(menuKeys)).toEqual(['Enter', 'Shift+Enter', 'Shift+N', 'Esc', 'Shift+Esc', 'W', undefined]);
    expect(stepItem(step(VERBS.reveal, () => {}), 'reveal')).toMatchObject({ id: 'reveal', label: '👁 Reveal answer', keys: 'R', hint: VERBS.reveal.title });
  });

  it('a clue: the blue button’s step first (N, on its own), the clue’s own actions, the ways out, then Undo and Cover', () => {
    const m = stageMenuOf(
      {
        heading: 'Movies · $400',
        main: item('Next slide ▶', { id: 'main', keys: 'N' }),
        steps: [item('◀ Slide', { id: 'slide-', keys: 'Shift+N', disabled: true }), item('👁 Reveal answer', { id: 'reveal', keys: 'R' }), item('⏱ Start the countdown', { id: 'clock', keys: 'T' })],
        exits: [item('▦ Done ▶ board', { id: 'done', keys: 'Esc' }), item('↩ Put back (keep tile)', { id: 'putback', keys: 'Shift+Esc', disabled: true })],
      },
      [],
      [item('↶ Undo', { keys: 'Ctrl+Z' }), item('⏸ Cover the screen', { keys: 'K' })],
    );
    expect(lines(m)).toEqual([
      '# Movies · $400',
      'Next slide ▶ · N',
      '—',
      '◀ Slide · Shift+N (off)',
      '👁 Reveal answer · R',
      '⏱ Start the countdown · T',
      '—',
      '▦ Done ▶ board · Esc',
      '↩ Put back (keep tile) · Shift+Esc (off)',
      '—',
      '↶ Undo · Ctrl+Z',
      '⏸ Cover the screen · K',
    ]);
  });

  it('the blue button’s step shows once: an item with its words, the moment’s or a box’s, is that step and goes', () => {
    let ran = '';
    const m = stageMenuOf(
      {
        heading: 'Movies · $400',
        main: item('👁 Reveal answer', { id: 'main', keys: 'N', onclick: () => (ran = 'main') }),
        // (R's at once: while it's the blue button's step, that's the one.)
        steps: [item('👁 Reveal answer', { id: 'reveal', keys: 'R' }), item('⏱ Start the countdown', { id: 'clock', keys: 'T' })],
        exits: [item('▦ Done ▶ board', { id: 'done', keys: 'Esc' })],
      },
      [item('👁 Reveal answer', { id: 'popreveal', keys: 'R' }), item('± Adjust score')],
      [],
    );
    expect(lines(m)).toEqual(['# Movies · $400', '👁 Reveal answer · N', '—', '⏱ Start the countdown · T', '—', '± Adjust score', '—', '▦ Done ▶ board · Esc']);
    const first = m.find((i) => 'label' in i);
    if (first && 'onclick' in first) first.onclick();
    expect(ran).toBe('main');
    // At ▦ Done ▶ board, the way out with its words goes too.
    const done = stageMenuOf({ main: item('▦ Done ▶ board', { keys: 'N' }), steps: [], exits: [item('▦ Done ▶ board', { id: 'done', keys: 'Esc' }), item('↩ Put back (keep tile)', { id: 'putback' })] }, [], []);
    expect(lines(done)).toEqual(['▦ Done ▶ board · N', '—', '↩ Put back (keep tile)']);
  });

  it('a Daily Double: Show question ▶ first, then who found it (the box’s leading items), its other items, the way out', () => {
    const m = stageMenuOf(
      { heading: '⭐ Daily Double', main: item('Show question ▶', { id: 'main', keys: 'N' }), steps: [], exits: [item('↩ Put back (keep tile)', { id: 'putback', keys: 'Esc' })] },
      [item('⭐ Ann found it', { lead: true, disabled: true }), item('⭐ Bob found it', { lead: true }), item('True Daily Double')],
      [item('⏸ Cover the screen', { keys: 'K' })],
    );
    expect(lines(m)).toEqual([
      '# ⭐ Daily Double',
      'Show question ▶ · N',
      '—',
      '⭐ Ann found it (off)',
      '⭐ Bob found it',
      '—',
      'True Daily Double',
      '—',
      '↩ Put back (keep tile) · Esc',
      '—',
      '⏸ Cover the screen · K',
    ]);
  });

  it('a box’s item for one of the moment’s actions takes its place, keeping its key; no blue button, no first item', () => {
    let ran = '';
    const m = stageMenuOf(
      {
        heading: '🤝 Partner clue',
        steps: [item('🎡 Spin for a partner', { id: 'spin', keys: 'W' }), item('Make Bob the partner', { id: 'partner:b', keys: '2' })],
        exits: [item('↩ Put back (keep tile)', { id: 'putback', keys: 'Esc' })],
      },
      // (The box knows its own state: the wheel landed, ↻ Spin again in its place.)
      [item('↻ Spin again', { id: 'spin', onclick: () => (ran = 'box') }), item('Make Bob the partner', { id: 'partner:b', disabled: true }), item('⇄ Swap')],
      [],
    );
    expect(lines(m)).toEqual(['# 🤝 Partner clue', '↻ Spin again · W', 'Make Bob the partner · 2 (off)', '—', '⇄ Swap', '—', '↩ Put back (keep tile) · Esc']);
    const spin = m.find((i) => 'label' in i && i.label === '↻ Spin again');
    if (spin && 'onclick' in spin) spin.onclick();
    expect(ran).toBe('box');
  });

  it('the same words from two places are one item, and an empty group leaves no line', () => {
    const m = stageMenuOf(
      { steps: [item('🎡 Spin for a partner', { keys: 'W' })] },
      [item('🎡 Spin for a partner', { keys: 'W' }), item('⇄ Swap'), item('⇄ Swap')],
      [],
    );
    expect(lines(m)).toEqual(['🎡 Spin for a partner · W', '—', '⇄ Swap']);
  });

  it('an RPG stage: ▭ Select in a box and Select everything here, first among the round’s own items', () => {
    let ran = '';
    const sel = selectItems({ players: 2, objects: 1 }, () => (ran = 'box'), () => (ran = 'all'));
    const m = stageMenuOf(
      { heading: 'Adventure', steps: [...sel, item('＋ Text here…'), item('🗺 Full map (jump anywhere)', { keys: 'J' }), item('🤝 Regroup', { keys: 'G' })] },
      [],
      [item('↶ Undo', { keys: 'Ctrl+Z' })],
    );
    expect(lines(m)).toEqual(['# Adventure', '▭ Select in a box · Alt+drag', 'Select everything here', '＋ Text here…', '🗺 Full map (jump anywhere) · J', '🤝 Regroup · G', '—', '↶ Undo · Ctrl+Z']);
    expect(sel[1].hint).toBe('2 players and 1 thing on this screen (with Shift held, added to what’s selected)');
    sel[0].onclick();
    expect(ran).toBe('box');
    sel[1].onclick();
    expect(ran).toBe('all');
    // Nobody and nothing here: greyed, in its place.
    const none = selectItems({ players: 0, objects: 0 }, () => {}, () => {});
    expect(none.map((i) => [i.label, !!i.disabled])).toEqual([['▭ Select in a box', false], ['Select everything here', true]]);
  });
});
