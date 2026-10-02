// Which theme a game's theme came from (a built-in preset or one of My themes), and whether it has been edited since:
// the 🎨 Theme page marks that one card, says "edited", and offers "Save changes to “…”" only for a saved theme of
// your own (a built-in preset is never overwritten). A game from before `theme.source` was kept is matched instead: a
// preset it looks exactly like, else a saved theme it looks exactly like, else none.
import type { MediaRef } from './model';
import { withMyTheme, type MyTheme } from './mytheme';
import { sameContent } from './roundcopy';
import { PRESETS, presetTheme, stageText, type Theme, type ThemePreset, type ThemeSource } from './theme';

export interface ThemeOrigin {
  kind: 'preset' | 'mine';
  /** The preset's key, or the saved theme's id. */
  id: string;
  /** "Classic", or the saved theme's name. */
  name: string;
  /** Changed since it was put on (a guessed origin never is: it was found by looking the same). */
  edited: boolean;
  /** The game's theme as that one would make it now (what "Reset" goes back to). */
  look: Theme;
  /** The saved theme, for one of My themes. */
  mine?: MyTheme;
}

/** A preset on a game's theme: its colors and fonts; the pictures, the layout and the clue text stay the game's. */
export function withPreset(current: Theme, p: ThemePreset): Theme {
  const { boardImage, banner, bannerHeight, bannerFit, scoreBar, clueFont, clueColor, stageBg, source } = current;
  return { ...presetTheme(p), boardImage, banner, bannerHeight, bannerFit, scoreBar, clueFont, clueColor, stageBg, source };
}

/** The same look (where they came from aside; colors in any case; an older game's slide text as it shows). */
export function sameLook(a: Theme, b: Theme): boolean {
  const norm = (t: Theme) =>
    Object.fromEntries(
      Object.entries({ ...t, stageText: stageText(t) })
        .filter(([k, v]) => k !== 'source' && v !== undefined)
        .map(([k, v]) => [k, typeof v === 'string' ? v.toLowerCase() : v]),
    );
  return sameContent(norm(a), norm(b));
}

/** A stored source, if it is one (a game file could hold anything). */
export function readSource(s: unknown): ThemeSource | null {
  if (!s || typeof s !== 'object') return null;
  const o = s as Record<string, unknown>;
  if (o.kind === 'preset' && typeof o.id === 'string' && o.id in PRESETS) return { kind: 'preset', id: o.id as ThemePreset };
  if (o.kind === 'mine' && typeof o.id === 'string' && o.id) return { kind: 'mine', id: o.id };
  return null;
}

function presetOrigin(t: Theme, p: ThemePreset, guessed: boolean): ThemeOrigin {
  const look = withPreset(t, p);
  return { kind: 'preset', id: p, name: PRESETS[p].label, edited: !guessed && !sameLook(t, look), look };
}

function mineOrigin(t: Theme, m: MyTheme, media: readonly MediaRef[] | undefined, guessed: boolean): ThemeOrigin {
  const look = withMyTheme(t, m.theme, media);
  return { kind: 'mine', id: m.id, name: m.name, edited: !guessed && !sameLook(t, look), look, mine: m };
}

/**
 * Where a game's theme came from (see the top of this file), or null: a theme of its own (imported, taken from another
 * game, or from a saved theme since deleted, and changed).
 */
export function themeOrigin(t: Theme, list: readonly MyTheme[], media?: readonly MediaRef[]): ThemeOrigin | null {
  const s = readSource(t.source);
  if (s?.kind === 'preset') return presetOrigin(t, s.id, false);
  const mine = s?.kind === 'mine' ? list.find((m) => m.id === s.id) : undefined;
  if (mine) return mineOrigin(t, mine, media, false);
  // No source (an older game), or a saved theme no longer here: one it looks exactly like.
  if (t.preset in PRESETS && sameLook(t, withPreset(t, t.preset))) return presetOrigin(t, t.preset, true);
  const like = list.find((m) => sameLook(t, withMyTheme(t, m.theme, media)));
  return like ? mineOrigin(t, like, media, true) : null;
}

/** What a setting goes back to: the origin's look, or (with none) the preset the theme started from. */
export function referenceLook(t: Theme, origin: ThemeOrigin | null): { look: Theme; name: string } {
  if (origin) return { look: origin.look, name: origin.name };
  const p = t.preset in PRESETS ? t.preset : 'classic';
  return { look: withPreset(t, p), name: PRESETS[p].label };
}
