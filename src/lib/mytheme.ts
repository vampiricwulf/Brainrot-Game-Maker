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
export function withMyTheme(current: Theme, mine: SavedTheme, media?: readonly MediaRef[]): Theme {
  const t: Theme = {
    ...current,
    ...mine,
    clueFont: mine.clueFont,
    clueColor: mine.clueColor,
    stageText: mine.stageText,
    stageBg: mine.stageBg,
    boardImage: current.boardImage,
    banner: current.banner,
  };
  // A font uploaded to another game isn't in this one: that text keeps this game's font (it would show a fallback).
  if (media) for (const k of missingFonts(mine, media)) (t as unknown as Record<string, unknown>)[k] = current[k];
  return t;
}

const FONT_KEYS = ['boardFont', 'valueFont', 'clueFont'] as const;
/** Is `font` (a CSS font list) one uploaded to a game? */
const isUploaded = (font: string | undefined) => !!font && /(^|[\s,'"])jb-[0-9a-z]{1,8}\b/i.test(font);

/** The fonts of a saved theme that were uploaded to a game and aren't among `media` (this game's files). */
export function missingFonts(mine: SavedTheme, media: readonly MediaRef[]): (typeof FONT_KEYS)[number][] {
  return FONT_KEYS.filter((k) => isUploaded(mine[k]) && !media.some((m) => m.kind === 'font' && mine[k]!.includes(uploadedFamily(m.id))));
}

/** Does `theme` use fonts uploaded to its game (which "my theme" can't take to other games)? */
export function usesUploadedFonts(theme: Theme): boolean {
  return FONT_KEYS.some((k) => isUploaded(theme[k]));
}

/** The files a theme uses in its game: its board picture and banner, and uploaded fonts it uses (the clue text's too). */
export function themeMedia(game: Game): MediaRef[] {
  const t = game.theme;
  return game.media.filter(
    (m) => m.id === t.boardImage || m.id === t.banner || (m.kind === 'font' && [t.boardFont, t.valueFont, t.clueFont].some((f) => f?.includes(uploadedFamily(m.id)))),
  );
}
