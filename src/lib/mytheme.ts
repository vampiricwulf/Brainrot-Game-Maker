// "My theme": a game's colors, fonts and layout kept on this computer (browser storage / the desktop app's), to use
// in any game; and taking the theme of another game, with the pictures and uploaded fonts it uses.
import { uploadedFamily } from './fonts';
import type { Game, MediaRef } from './model';
import type { Theme } from './theme';

const KEY = 'brainrot.myTheme';

/** What's kept: everything but the pictures (they belong to their game). */
export type SavedTheme = Omit<Theme, 'boardImage' | 'banner'>;

export function loadMyTheme(): SavedTheme | null {
  try {
    const raw = localStorage.getItem(KEY);
    const t = raw ? (JSON.parse(raw) as SavedTheme) : null;
    return t && typeof t.tile === 'string' ? t : null;
  } catch {
    return null;
  }
}

/** Keep `theme` as my theme. False when this browser won't store it. */
export function saveMyTheme(theme: Theme): boolean {
  const { boardImage: _b, banner: _n, ...rest } = theme;
  try {
    localStorage.setItem(KEY, JSON.stringify(rest));
    return true;
  } catch {
    return false;
  }
}

/**
 * A saved theme on a game's theme: its colors, fonts and layout; the game's own pictures stay. The clue text look, the
 * text on slides & scores and the stage background are the saved theme's too, even when it has none (they'd otherwise
 * linger from the game's).
 */
export function withMyTheme(current: Theme, mine: SavedTheme): Theme {
  return {
    ...current,
    ...mine,
    clueFont: mine.clueFont,
    clueColor: mine.clueColor,
    stageText: mine.stageText,
    stageBg: mine.stageBg,
    boardImage: current.boardImage,
    banner: current.banner,
  };
}

/** The files a theme uses in its game: its board picture and banner, and uploaded fonts it uses (the clue text's too). */
export function themeMedia(game: Game): MediaRef[] {
  const t = game.theme;
  return game.media.filter(
    (m) => m.id === t.boardImage || m.id === t.banner || (m.kind === 'font' && [t.boardFont, t.valueFont, t.clueFont].some((f) => f?.includes(uploadedFamily(m.id)))),
  );
}
