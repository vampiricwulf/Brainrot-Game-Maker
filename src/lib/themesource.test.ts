import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addMyTheme, changeMyTheme, loadMyThemes, toSaved, withMyTheme, type MyTheme } from './mytheme';
import { migrateGame, newGame } from './model';
import { presetTheme, type Theme } from './theme';
import { compactTheme, themeFileText } from './themefile';
import { readSource, referenceLook, sameLook, themeOrigin, withPreset } from './themesource';

const mine = (id: string, name: string, theme: Theme): MyTheme => ({ id, name, theme: toSaved(theme), saved: 0 });
/** A theme saved from Classic with its values changed. */
const party = mine('m1', 'Party night', { ...presetTheme('classic'), value: '#ff0000', tileRadius: 20 });

describe('where a game’s theme came from', () => {
  it('a preset put on: that preset, until something changes', () => {
    const t: Theme = { ...withPreset(presetTheme('dark'), 'neon'), source: { kind: 'preset', id: 'neon' } };
    expect(themeOrigin(t, [party])).toMatchObject({ kind: 'preset', id: 'neon', name: 'Brainrot Neon', edited: false });
    // The pictures and the layout aren't part of a preset.
    expect(themeOrigin({ ...t, scoreBar: 'top', banner: 'img1' }, [])?.edited).toBe(false);
    // A color picker may write the same color in capitals.
    expect(themeOrigin({ ...t, tile: t.tile.toUpperCase() }, [])?.edited).toBe(false);
    expect(themeOrigin({ ...t, value: '#123456' }, [])).toMatchObject({ kind: 'preset', id: 'neon', edited: true });
    expect(themeOrigin({ ...t, tileShadow: true }, [])?.edited).toBe(true);
  });

  it('one of My themes put on: that one (not the preset it was made from), marked edited once changed', () => {
    const t: Theme = { ...withMyTheme(presetTheme('classic'), party.theme), source: { kind: 'mine', id: 'm1' } };
    const o = themeOrigin(t, [party]);
    expect(o).toMatchObject({ kind: 'mine', id: 'm1', name: 'Party night', edited: false });
    expect(o?.mine).toBe(party);
    const edited = { ...t, tile: '#000000' };
    expect(themeOrigin(edited, [party])).toMatchObject({ kind: 'mine', id: 'm1', edited: true });
    // Saved over (Save changes): the same again.
    const list = [mine('m1', 'Party night', edited)];
    expect(themeOrigin(edited, list)).toMatchObject({ kind: 'mine', id: 'm1', edited: false });
  });

  it('even when it looks exactly like a preset or another saved theme', () => {
    const plain = mine('m2', 'Plain', presetTheme('classic'));
    const t: Theme = { ...presetTheme('classic'), source: { kind: 'mine', id: 'm2' } };
    expect(themeOrigin(t, [plain])).toMatchObject({ kind: 'mine', id: 'm2' });
    const p: Theme = { ...presetTheme('classic'), source: { kind: 'preset', id: 'classic' } };
    expect(themeOrigin(p, [plain])).toMatchObject({ kind: 'preset', id: 'classic' });
  });

  it('an older game (no source): a preset it matches, else a saved theme it matches, else none', () => {
    expect(themeOrigin(presetTheme('pastel'), [party])).toMatchObject({ kind: 'preset', id: 'pastel', edited: false });
    // (An older game's theme has no slide text color of its own.)
    const { stageText: _s, ...old } = presetTheme('pastel');
    expect(themeOrigin(old as Theme, [])).toMatchObject({ kind: 'preset', id: 'pastel', edited: false });
    const used = withMyTheme(presetTheme('classic'), party.theme);
    expect(themeOrigin(used, [party])).toMatchObject({ kind: 'mine', id: 'm1', edited: false });
    expect(themeOrigin({ ...used, value: '#00ff00' }, [party])).toBeNull();
  });

  it('a saved theme since deleted: matched like an older game, else a theme of its own', () => {
    const t: Theme = { ...presetTheme('classic'), value: '#00ff00', source: { kind: 'mine', id: 'gone' } };
    expect(themeOrigin(t, [party])).toBeNull();
    expect(themeOrigin({ ...presetTheme('dark'), source: { kind: 'mine', id: 'gone' } }, [])).toMatchObject({ kind: 'preset', id: 'dark' });
  });

  it('a damaged source is ignored', () => {
    expect(readSource('classic')).toBeNull();
    expect(readSource({ kind: 'preset', id: 'nope' })).toBeNull();
    expect(readSource({ kind: 'mine', id: 7 })).toBeNull();
    expect(readSource({ kind: 'mine', id: 'm1' })).toEqual({ kind: 'mine', id: 'm1' });
    const t = { ...presetTheme('dark'), source: { kind: 'preset', id: 'nope' } } as unknown as Theme;
    expect(themeOrigin(t, [])).toMatchObject({ kind: 'preset', id: 'dark' });
  });

  it('what Reset goes back to: the origin, or the preset the theme started from', () => {
    const t: Theme = { ...presetTheme('neon'), value: '#000001' };
    expect(themeOrigin(t, [])).toBeNull();
    const ref = referenceLook(t, null);
    expect(ref.name).toBe('Brainrot Neon');
    expect(ref.look.value).toBe(presetTheme('neon').value);
    const t2: Theme = { ...withMyTheme(presetTheme('classic'), party.theme), tile: '#000000', source: { kind: 'mine', id: 'm1' } };
    const ref2 = referenceLook(t2, themeOrigin(t2, [party]));
    expect(ref2).toMatchObject({ name: 'Party night', look: { tile: presetTheme('classic').tile, value: '#ff0000', tileRadius: 20 } });
  });

  it('where it came from isn’t part of the look', () => {
    const a: Theme = { ...presetTheme('classic'), source: { kind: 'preset', id: 'classic' } };
    expect(sameLook(a, presetTheme('classic'))).toBe(true);
    expect(sameLook(a, { ...presetTheme('classic'), tileGap: 4 })).toBe(false);
  });
});

describe('the source stays with the game', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('kept through saving and loading a game', () => {
    const g = newGame();
    g.theme = { ...g.theme, source: { kind: 'mine', id: 'm1' } };
    expect(migrateGame(JSON.parse(JSON.stringify(g))).theme.source).toEqual({ kind: 'mine', id: 'm1' });
  });

  it('a new game starts from Classic; an older game gets no source (it is matched instead)', () => {
    const g = newGame();
    expect(g.theme.source).toEqual({ kind: 'preset', id: 'classic' });
    const { source: _s, ...theme } = { ...presetTheme('neon'), value: '#010203' };
    const old = migrateGame(JSON.parse(JSON.stringify({ ...g, theme })));
    expect(old.theme.source).toBeUndefined();
    expect(themeOrigin(old.theme, [])).toBeNull();
    const { source: _t, ...neon } = presetTheme('neon');
    expect(themeOrigin(migrateGame(JSON.parse(JSON.stringify({ ...g, theme: neon }))).theme, [])).toMatchObject({ kind: 'preset', id: 'neon' });
  });

  it('not kept in a saved theme, a theme file or a code', async () => {
    const t: Theme = { ...presetTheme('classic'), source: { kind: 'preset', id: 'classic' } };
    const list = addMyTheme([], 'Mine', t)!;
    expect('source' in list[0].theme).toBe(false);
    expect('source' in loadMyThemes()[0].theme).toBe(false);
    expect('source' in compactTheme(t)).toBe(false);
    const { text } = await themeFileText('Mine', t, []);
    expect(JSON.parse(text).theme.source).toBeUndefined();
  });

  it('Save changes overwrites the saved theme in place (same id and name), a preset never', () => {
    const list = addMyTheme([], 'Party night', presetTheme('classic'))!;
    const id = list[0].id;
    const changed: Theme = { ...presetTheme('classic'), value: '#ff0000', source: { kind: 'mine', id } };
    expect(themeOrigin(changed, list)).toMatchObject({ kind: 'mine', id, edited: true });
    const next = changeMyTheme(list, id, { theme: changed })!;
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ id, name: 'Party night', theme: { value: '#ff0000' } });
    expect(loadMyThemes()[0].theme.value).toBe('#ff0000');
    expect(themeOrigin(changed, next)?.edited).toBe(false);
    // The built-in preset is as it was.
    expect(presetTheme('classic').value).toBe('#ffcc00');
  });
});
