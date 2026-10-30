import { describe, expect, it } from 'vitest';
import type { MenuEntry } from '../../lib/menustate.svelte';
import { menuKeys, stageMenuOf, stepItem, type StageItem } from './stagemenu';
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

  it('a clue: its steps in the main button’s order, the ways out, then Undo and Cover', () => {
    const m = stageMenuOf(
      {
        heading: 'Movies · $400',
        steps: [item('Next slide ▶', { id: 'slide+', keys: 'N' }), item('👁 Reveal answer', { id: 'reveal', keys: 'R' }), item('⏱ Start the countdown', { id: 'clock', keys: 'T' })],
        exits: [item('▦ Done ▶ board', { id: 'done', keys: 'Esc' }), item('↩ Put back (keep tile)', { id: 'putback', keys: 'Shift+Esc', disabled: true })],
      },
      [],
      [item('↶ Undo', { keys: 'Ctrl+Z' }), item('⏸ Cover the screen', { keys: 'K' })],
    );
    expect(lines(m)).toEqual([
      '# Movies · $400',
      'Next slide ▶ · N',
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

  it('a box’s item for a step takes its place, keeping its key; its other items go after the steps, or lead', () => {
    let ran = '';
    const m = stageMenuOf(
      {
        heading: '⭐ Daily Double',
        steps: [item('Show question ▶', { id: 'show', keys: 'Enter', disabled: true })],
        exits: [item('↩ Put back (keep tile)', { id: 'putback', keys: 'Esc' })],
      },
      [
        item('⭐ Ann found it', { lead: true, disabled: true }),
        item('⭐ Bob found it', { lead: true }),
        // (The box knows its own wager: it can show the question.)
        item('Show question ▶', { id: 'show', onclick: () => (ran = 'box') }),
        item('True Daily Double'),
      ],
      [item('⏸ Cover the screen', { keys: 'K' })],
    );
    expect(lines(m)).toEqual([
      '# ⭐ Daily Double',
      '⭐ Ann found it (off)',
      '⭐ Bob found it',
      '—',
      'Show question ▶ · Enter',
      '—',
      'True Daily Double',
      '—',
      '↩ Put back (keep tile) · Esc',
      '—',
      '⏸ Cover the screen · K',
    ]);
    const show = m.find((i) => 'label' in i && i.label === 'Show question ▶');
    if (show && 'onclick' in show) show.onclick();
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
});
