// "My themes": games' colors, fonts and layout kept on this computer under a name (browser storage / the desktop
// app's), to use in any game; and taking the theme of another game, with the pictures and uploaded fonts it uses.
//
// Saved themes keep no pictures: this storage is small (a few MB for everything the app keeps here) and a background
// picture alone could fill it. A game's own pictures stay when a saved theme is used; a theme file (themefile.ts)
// carries its pictures and uploaded fonts instead.
import { uploadedFamily } from './fonts';
import { newId, type Game, type MediaRef } from './model';
import { EXTRA_LOOKS, type Theme } from './theme';
import { sanitizeTheme, themeName } from './themefile';

/** The list of saved themes. */
const LIST_KEY = 'brainrot.myThemes';
/** The one "my theme" kept before there could be several (it becomes the first saved theme). */
const OLD_KEY = 'brainrot.myTheme';

/** What's kept: everything but the pictures (they belong to their game) and where the game's theme came from. */
export type SavedTheme = Omit<Theme, 'boardImage' | 'banner' | 'source'>;

export interface MyTheme {
  id: string;
  name: string;
  theme: SavedTheme;
  /** When it was saved or last updated (ms since 1970). */
  saved: number;
}

/** A theme without its pictures (or where it came from). */
export function toSaved(theme: Theme): SavedTheme {
  const { boardImage: _b, banner: _n, source: _s, ...rest } = theme;
  return JSON.parse(JSON.stringify(rest));
}

/** Read one stored entry (null: not one, or damaged). */
function readEntry(e: unknown): MyTheme | null {
  if (!e || typeof e !== 'object') return null;
  const o = e as Record<string, unknown>;
  const theme = sanitizeTheme(o.theme);
  if (!theme || typeof o.id !== 'string') return null;
  return { id: o.id, name: themeName(o.name) || 'My theme', theme: toSaved(theme), saved: typeof o.saved === 'number' ? o.saved : 0 };
}

/** The themes saved on this computer, in the order they were saved. The one "my theme" from before comes first. */
export function loadMyThemes(): MyTheme[] {
  try {
    const raw = localStorage.getItem(LIST_KEY);
    if (raw !== null) {
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list.map(readEntry).filter((x): x is MyTheme => !!x) : [];
    }
    const old = localStorage.getItem(OLD_KEY);
    const theme = old ? sanitizeTheme(JSON.parse(old)) : null;
    if (!theme) return [];
    const list = [{ id: newId(), name: 'My theme', theme: toSaved(theme), saved: Date.now() }];
    // Moved into the list (the old one goes once the list is stored: if it can't be, it's read again next time).
    if (storeMyThemes(list)) localStorage.removeItem(OLD_KEY);
    return list;
  } catch {
    return [];
  }
}

/** Keep the list. False when this browser won't store it (storage is blocked or full): nothing changed then. */
export function storeMyThemes(list: readonly MyTheme[]): boolean {
  try {
    localStorage.setItem(LIST_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** Save `theme` under `name` (a new entry at the end). The new list, or null when it couldn't be stored. */
export function addMyTheme(list: readonly MyTheme[], name: string, theme: Theme): MyTheme[] | null {
  const next = [...list, { id: newId(), name: themeName(name) || 'My theme', theme: toSaved(theme), saved: Date.now() }];
  return storeMyThemes(next) ? next : null;
}

/** Change one saved theme (its name or its look). The new list, or null when it couldn't be stored. */
export function changeMyTheme(list: readonly MyTheme[], id: string, change: { name?: string; theme?: Theme }): MyTheme[] | null {
  const next = list.map((m) =>
    m.id !== id
      ? m
      : {
          ...m,
          ...(change.name !== undefined ? { name: themeName(change.name) || m.name } : {}),
          ...(change.theme ? { theme: toSaved(change.theme), saved: Date.now() } : {}),
        },
  );
  return storeMyThemes(next) ? next : null;
}

/** Forget a saved theme. The new list, or null when it couldn't be stored. */
export function deleteMyTheme(list: readonly MyTheme[], id: string): MyTheme[] | null {
  const next = list.filter((m) => m.id !== id);
  return storeMyThemes(next) ? next : null;
}

/** A name for a new saved theme that none has yet: `base`, else "base 2", "base 3"… */
export function freshThemeName(list: readonly MyTheme[], base: string): string {
  const name = themeName(base) || 'My theme';
  const taken = new Set(list.map((m) => m.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  for (let n = 2; ; n++) if (!taken.has(`${name} ${n}`.toLowerCase())) return `${name} ${n}`;
}

/**
 * A saved theme on a game's theme: its colors, fonts and layout; the game's own pictures stay. The clue text look, the
 * text on slides & scores, the stage background and the other looks (alternating tiles, gradients…) are the saved
 * theme's too, even when it has none (they'd otherwise linger from the game's). The game's `source` stays as it was:
 * the caller says where the theme came from.
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
  for (const k of EXTRA_LOOKS) (t as unknown as Record<string, unknown>)[k] = mine[k];
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

/** Does `theme` use fonts uploaded to its game (which a saved theme can't take to other games)? */
export function usesUploadedFonts(theme: Theme): boolean {
  return FONT_KEYS.some((k) => isUploaded(theme[k]));
}

/** The files a theme uses among `media`: its board picture and banner, and uploaded fonts it uses (the clue text's too). */
export function themeFiles(t: Theme, media: readonly MediaRef[]): MediaRef[] {
  return media.filter(
    (m) =>
      ((m.id === t.boardImage || m.id === t.banner) && m.kind === 'image') ||
      (m.kind === 'font' && [t.boardFont, t.valueFont, t.clueFont].some((f) => f?.includes(uploadedFamily(m.id)))),
  );
}

/** The files a game's theme uses (see themeFiles). */
export function themeMedia(game: Game): MediaRef[] {
  return themeFiles(game.theme, game.media);
}
