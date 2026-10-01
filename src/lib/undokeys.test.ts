import { describe, expect, it } from 'vitest';
import { copyIsTheBrowsers, createFieldTracker, isTextField, undoKeyOf } from './undokeys';

const key = (k: string, mods: { ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean } = { ctrl: true }) => ({
  key: k,
  ctrlKey: !!mods.ctrl,
  metaKey: !!mods.meta,
  shiftKey: !!mods.shift,
  altKey: !!mods.alt,
});

describe('undo keys', () => {
  it('knows undo and redo on Windows and Mac', () => {
    expect(undoKeyOf(key('z'))).toBe('undo');
    expect(undoKeyOf(key('z', { meta: true }))).toBe('undo');
    expect(undoKeyOf(key('Z', { ctrl: true, shift: true }))).toBe('redo');
    expect(undoKeyOf(key('y'))).toBe('redo');
    expect(undoKeyOf(key('z', {}))).toBeNull();
    expect(undoKeyOf(key('z', { ctrl: true, alt: true }))).toBeNull();
    expect(undoKeyOf(key('s'))).toBeNull();
  });

  it('knows which fields are typed in', () => {
    expect(isTextField({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTextField({ tagName: 'INPUT', type: 'text' })).toBe(true);
    expect(isTextField({ tagName: 'INPUT', type: 'number' })).toBe(true);
    expect(isTextField({ tagName: 'INPUT', type: 'checkbox' })).toBe(false);
    expect(isTextField({ tagName: 'INPUT', type: 'range' })).toBe(false);
    expect(isTextField({ tagName: 'SELECT' })).toBe(false);
    expect(isTextField(null)).toBe(false);
  });
});

describe('field tracker', () => {
  const input = (value = '') => ({ tagName: 'INPUT', type: 'text', value }) as HTMLInputElement;
  const typed = (el: HTMLInputElement, value: string, inputType = 'insertText') => ({ el, value, inputType });

  function setup(value = 'Memes') {
    const t = createFieldTracker();
    const el = input(value);
    t.focusin({ target: el });
    const type = ({ el, value, inputType }: ReturnType<typeof typed>) => {
      el.value = value;
      t.input({ target: el, inputType });
    };
    return { t, el, type, press: (k: 'undo' | 'redo') => t.native({ target: el }, k) };
  }

  it('leaves Ctrl+Z to the history in a field not typed in', () => {
    const { press } = setup();
    expect(press('undo')).toBe(false);
    expect(press('redo')).toBe(false);
  });

  it("keeps Ctrl+Z the field's own while it has typing, then hands on", () => {
    const { el, type, press } = setup();
    type(typed(el, 'Memes!'));
    expect(press('undo')).toBe(true);
    type(typed(el, 'Memes', 'historyUndo'));
    // Back to how it was focused: the next Ctrl+Z goes on through the history.
    expect(press('undo')).toBe(false);
  });

  it("redoes natively only what the field's own undo took back", () => {
    const { el, type, press } = setup();
    expect(press('redo')).toBe(false);
    type(typed(el, 'Memes 2'));
    type(typed(el, 'Memes', 'historyUndo'));
    expect(press('redo')).toBe(true);
    type(typed(el, 'Memes 2', 'historyRedo'));
    expect(press('redo')).toBe(false);
    // New typing ends the field's redo.
    type(typed(el, 'Memes', 'historyUndo'));
    type(typed(el, 'Memes?'));
    expect(press('redo')).toBe(false);
  });

  it('starts afresh after the history changed things', () => {
    const { t, el, type, press } = setup();
    type(typed(el, 'Memes!'));
    type(typed(el, 'Memes', 'historyUndo'));
    t.afterGlobal();
    expect(press('redo')).toBe(false);
    // The history set the field's value: that's the new "as focused".
    el.value = 'Older name';
    t.afterGlobal();
    expect(press('undo')).toBe(false);
  });

  it('only answers for the focused field', () => {
    const { t, el, type } = setup();
    type(typed(el, 'Memes!'));
    expect(t.native({ target: input() }, 'undo')).toBe(false);
    t.focusin({ target: { tagName: 'BUTTON' } as unknown as EventTarget });
    expect(t.native({ target: el }, 'undo')).toBe(false);
  });
});

describe('Ctrl+C: the editor’s copy or the browser’s', () => {
  const node = (inside: unknown[] = []) => ({ contains: (n: unknown) => inside.includes(n) });
  const sel = (text: string, anchor: unknown, focus = anchor) => ({ isCollapsed: !text, anchorNode: anchor, focusNode: focus, toString: () => text });
  it('copies the focused thing, whatever text is selected elsewhere', () => {
    const word = {};
    const tile = node([word]);
    // (The round name selected when the round was added.)
    expect(copyIsTheBrowsers(tile, sel('Round 3', {}))).toBe(false);
    expect(copyIsTheBrowsers(tile, sel('', word))).toBe(false);
    expect(copyIsTheBrowsers(tile, null)).toBe(false);
    expect(copyIsTheBrowsers(null, sel('', {}))).toBe(false);
  });
  it('leaves it to the browser in a text field, or with text selected in the focused thing', () => {
    const word = {};
    expect(copyIsTheBrowsers(node([word]), sel('Memes', word))).toBe(true);
    expect(copyIsTheBrowsers(node([word]), sel('Memes', {}, word))).toBe(true);
    expect(copyIsTheBrowsers({ tagName: 'INPUT', type: 'text' }, null)).toBe(true);
    expect(copyIsTheBrowsers({ tagName: 'TEXTAREA' }, sel('', null))).toBe(true);
    expect(copyIsTheBrowsers({ ...node(), isContentEditable: true }, null)).toBe(true);
    // Text selected with the mouse, nothing in focus.
    expect(copyIsTheBrowsers(null, sel('Click a screen', {}))).toBe(true);
    expect(copyIsTheBrowsers({ tagName: 'BODY', contains: () => true }, sel('Click a screen', {}))).toBe(true);
    expect(copyIsTheBrowsers({ tagName: 'INPUT', type: 'checkbox', contains: () => false }, sel('x', {}))).toBe(false);
  });
});
