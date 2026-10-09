// Board/stage themes (spec §5.7): presets plus per-game overrides, applied as CSS variables.
import { contrast, mixHex, textOn, toHex } from './colors';
import { cssUrl } from './links';
import type { Id } from './model';

export type ThemePreset = 'classic' | 'dark' | 'neon' | 'pastel';

/**
 * Which theme a game's theme was put on from: a built-in preset, or one of My themes (by its id on this computer).
 * Edits keep it, so the 🎨 Theme page can say "edited" and offer to save the changes to a saved theme (themesource.ts).
 */
export type ThemeSource = { kind: 'preset'; id: ThemePreset } | { kind: 'mine'; id: string };

export interface Theme {
  preset: ThemePreset;
  /** Tile / default slide background. */
  tile: string;
  tileUsed: string;
  /** Lines between tiles and the space around the board. */
  boardGap: string;
  /** Dollar values on tiles. */
  value: string;
  /** Category names. */
  boardText: string;
  /** Text on the tile color: clue and answer slides' white text, scores, Final's lines (older games: black or white by the tile). */
  stageText?: string;
  boardFont: string;
  valueFont: string;
  /** Glow around tiles (CSS color or 'none'). */
  glow: string;
  /** Image behind the board (shows through the gaps). */
  boardImage?: Id;
  /** Image banner across the top of the board screen (logo / show title). */
  banner?: Id;
  /** Banner height in stage pixels (of 1080). */
  bannerHeight?: number;
  bannerFit?: 'contain' | 'cover';
  scoreBar: 'bottom' | 'top' | 'hidden';
  scoreBarBg: string;
  /** The main text of question and answer slides, game-wide (see cluetext.ts). Unset: a new text box's look. */
  clueFont?: string;
  clueColor?: string;
  /** For OBS's chroma key: a flat green or magenta around the stage, behind the board and in the scores-only view. */
  stageBg?: 'green' | 'magenta';

  // ----- More looks (all optional: a game without them looks exactly as before) -----
  /** Alternating tiles: every other tile (checkerboard), every other row or column takes `tile2`. */
  tilePattern?: TilePattern;
  /** The alternating tiles' color. */
  tile2?: string;
  /** Tiles fade from their color to this one (at `tileAngle`). */
  tileGradient?: string;
  /** The tiles' (and the category headers') gradient direction, in degrees (180: top to bottom). */
  tileAngle?: number;
  /** The line inside each tile's edge (default a 35% black, 3px). */
  tileBorder?: string;
  tileBorderWidth?: number;
  /** Rounded tile corners (stage px; 0 by default). */
  tileRadius?: number;
  /** How far the tile glow spreads (stage px; 18 by default). */
  glowSize?: number;
  /** A soft drop shadow under each tile. */
  tileShadow?: boolean;
  /** The values' shadow: a hard offset one (the default), a soft blur, or none. */
  valueShadow?: 'soft' | 'none';
  /** Played tiles: in the used-tile color (the default), a darkened tile, or gone (the background shows). */
  usedLook?: 'dim' | 'hidden';
  /** Space between tiles and around the board (stage px; 10 by default). */
  tileGap?: number;
  /** Category headers' color (default: the tile color). */
  headerBg?: string;
  /** Every other category header takes this color. */
  header2?: string;
  /** Category headers fade to this color (at `tileAngle`). */
  headerGradient?: string;
  /** The line under the category headers (default black; 'none': no line). */
  headerLine?: string;
  /** Score plates' corners: rounded (the default), square or pill. */
  plateShape?: 'square' | 'pill';
  /** The plate of the player in the lead glows. */
  leaderGlow?: boolean;
  /** The board's background fades from the line color to this one (at `bgAngle`). */
  bgGradient?: string;
  bgAngle?: number;

  /** The theme this one came from (older games have none: see themeOrigin). Not part of the look. */
  source?: ThemeSource;
}

export type TilePattern = 'checker' | 'rows' | 'columns';

/** The optional looks above: a preset takes them all off, and a saved theme brings its own (or none). */
export const EXTRA_LOOKS = [
  'tilePattern',
  'tile2',
  'tileGradient',
  'tileAngle',
  'tileBorder',
  'tileBorderWidth',
  'tileRadius',
  'glowSize',
  'tileShadow',
  'valueShadow',
  'usedLook',
  'tileGap',
  'headerBg',
  'header2',
  'headerGradient',
  'headerLine',
  'plateShape',
  'leaderGlow',
  'bgGradient',
  'bgAngle',
] as const satisfies readonly (keyof Theme)[];

/** The defaults of the numbers above (and what they may be). */
export const LOOK_RANGES = {
  tileAngle: { min: 0, max: 360, def: 180 },
  bgAngle: { min: 0, max: 360, def: 180 },
  tileBorderWidth: { min: 0, max: 20, def: 3 },
  tileRadius: { min: 0, max: 60, def: 0 },
  glowSize: { min: 0, max: 60, def: 18 },
  tileGap: { min: 0, max: 40, def: 10 },
} as const;
export type Ranged = keyof typeof LOOK_RANGES;

/** A theme number, within its range (its default when it's unset or not a number). */
export function lookNumber(t: Partial<Theme> | undefined, k: Ranged): number {
  const r = LOOK_RANGES[k];
  const v = t?.[k];
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(r.max, Math.max(r.min, Math.round(v))) : r.def;
}

/**
 * A color a theme may hold: #hex, rgb()/hsl() with plain numbers, or a color name. Anything else (it goes into a
 * style) isn't one.
 */
export function isThemeColor(c: unknown): c is string {
  return (
    typeof c === 'string' &&
    c.length <= 60 &&
    (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(c) || /^(?:rgba?|hsla?)\([\d\s.,%/-]+\)$/i.test(c) || /^[a-z]{3,24}$/i.test(c))
  );
}

/** A CSS font list a theme may hold: font names, quotes, commas and spaces only. */
export function isThemeFont(f: unknown): f is string {
  return typeof f === 'string' && f.length > 0 && f.length <= 200 && /^[\p{L}\p{N}\s'",._-]+$/u.test(f);
}

/** Is a tile (row, column) one of the alternating ones? */
export function altTile(pattern: TilePattern | undefined, row: number, col: number): boolean {
  if (pattern === 'checker') return (row + col) % 2 === 1;
  if (pattern === 'rows') return row % 2 === 1;
  if (pattern === 'columns') return col % 2 === 1;
  return false;
}

/** Is a category header (by its column) one of the alternating ones? */
export const altHeader = (t: Partial<Theme> | undefined, col: number): boolean => !!t?.header2 && isThemeColor(t.header2) && col % 2 === 1;

/** A color, or a fade from it to `to` at `angle` degrees. */
const fill = (from: string, to: string | undefined, angle: number) => (to && isThemeColor(to) ? `linear-gradient(${angle}deg, ${from}, ${to})` : from);
const color = (c: string | undefined, def: string) => (c && isThemeColor(c) ? c : def);

/** A tile's background (row and column on its board): its color or the alternating one, faded when set. */
export function tileBackground(t: Theme, row: number, col: number): string {
  const base = altTile(t.tilePattern, row, col) ? color(t.tile2, t.tile) : t.tile;
  return fill(base, t.tileGradient, lookNumber(t, 'tileAngle'));
}

/** A category header's background (by its column). */
export function headerBackground(t: Theme, col: number): string {
  const base = altHeader(t, col) ? t.header2! : color(t.headerBg, t.tile);
  return fill(base, t.headerGradient, lookNumber(t, 'tileAngle'));
}

/**
 * How well the board's words read on what's behind them (WCAG contrast, 1 … 21; null where a color can't be read):
 * the values on every tile color (the tile, the alternating one, the gradient's end), and the category names on every
 * category color, the slides' text and scores on the tile color, and the clues in the Clue text color on it (null
 * without one). Under 3 is hard to read on a stream.
 */
export function themeReadability(t: Theme): { values: number | null; names: number | null; text: number | null; clue: number | null } {
  const worst = (text: string | undefined, on: (string | undefined)[]): number | null => {
    const fg = toHex(text);
    const bgs = on.map(toHex).filter((c): c is string => !!c);
    return fg && bgs.length ? Math.min(...bgs.map((c) => contrast(fg, c))) : null;
  };
  return {
    values: worst(t.value, [t.tile, t.tilePattern ? t.tile2 : undefined, t.tileGradient]),
    names: worst(t.boardText, [t.headerBg ?? t.tile, t.header2, t.headerGradient]),
    // The slides' text and the scores, on the tile color (the slides' and score plates' background).
    text: worst(stageText(t), [t.tile]),
    // The clues' main text in the Clue text color, kept when another theme is put on (plain white is drawn in the
    // slides' text color: TextBox).
    clue: worst(clueTextColor(t), [t.tile]),
  };
}

/**
 * The CSS variables of the optional looks. Without them each is what the board, the headers and the plates always
 * had (Board.svelte, ScoreBar.svelte and AudienceView.svelte read them), so an older game looks the same.
 */
export function lookVars(t: Theme): Record<string, string> {
  const angle = lookNumber(t, 'tileAngle');
  const tileBg = fill(t.tile, t.tileGradient, angle);
  const header = fill(color(t.headerBg, t.tile), t.headerGradient, angle);
  const value =
    t.valueShadow === 'none' ? 'none' : t.valueShadow === 'soft' ? '0 0 14px var(--tile-shadow, #000), 0 0 4px var(--tile-shadow, #000)' : '5px 5px 0 var(--tile-shadow, #000)';
  return {
    '--tile-bg': tileBg,
    '--tile-bg-2': t.tilePattern ? fill(color(t.tile2, t.tile), t.tileGradient, angle) : tileBg,
    '--tile-used-bg': t.usedLook === 'hidden' ? 'transparent' : t.tileUsed,
    '--tile-border-width': `${lookNumber(t, 'tileBorderWidth')}px`,
    '--tile-border-color': color(t.tileBorder, 'rgba(0, 0, 0, 0.35)'),
    '--tile-radius': `${lookNumber(t, 'tileRadius')}px`,
    '--tile-drop': t.tileShadow ? '0 10px 18px rgba(0, 0, 0, 0.6)' : '0 0 0 transparent',
    '--tile-gap': `${lookNumber(t, 'tileGap')}px`,
    '--value-shadow': value,
    '--header-bg': header,
    '--header-bg-2': t.header2 && isThemeColor(t.header2) ? fill(t.header2, t.headerGradient, angle) : header,
    '--header-line': t.headerLine === 'none' ? '0 solid transparent' : `6px solid ${color(t.headerLine, '#000')}`,
    '--plate-radius': t.plateShape === 'square' ? '0px' : t.plateShape === 'pill' ? '48px' : '14px',
    '--board-bg': fill(t.boardGap, t.bgGradient, lookNumber(t, 'bgAngle')),
  };
}

/** The chroma-key colors (OBS's Chroma Key filter's own presets). */
export const STAGE_KEYS = { green: '#00ff00', magenta: '#ff00ff' } as const;

export const PRESETS: Record<ThemePreset, { label: string; theme: Omit<Theme, 'preset'> }> = {
  classic: {
    label: 'Classic',
    theme: {
      tile: '#060ce9',
      tileUsed: '#030773',
      boardGap: '#000000',
      value: '#ffcc00',
      boardText: '#ffffff',
      stageText: '#ffffff',
      boardFont: "'Oswald', 'Arial Narrow', sans-serif",
      valueFont: "'Anton', Impact, sans-serif",
      glow: 'none',
      scoreBar: 'bottom',
      scoreBarBg: '#050835',
    },
  },
  dark: {
    label: 'Dark',
    theme: {
      tile: '#1d2030',
      tileUsed: '#12141d',
      boardGap: '#07080c',
      value: '#e6e9ff',
      boardText: '#ffffff',
      stageText: '#ffffff',
      boardFont: "'Inter', system-ui, sans-serif",
      valueFont: "'Bebas Neue', Impact, sans-serif",
      glow: 'none',
      scoreBar: 'bottom',
      scoreBarBg: '#0c0d14',
    },
  },
  neon: {
    label: 'Brainrot Neon',
    theme: {
      tile: '#16002e',
      tileUsed: '#0b0017',
      boardGap: '#000000',
      value: '#39ff14',
      boardText: '#00f0ff',
      stageText: '#ffffff',
      boardFont: "'Bangers', 'Comic Sans MS', cursive",
      valueFont: "'Bangers', 'Comic Sans MS', cursive",
      glow: '#ff00e6',
      scoreBar: 'bottom',
      scoreBarBg: '#0b0017',
    },
  },
  pastel: {
    label: 'Pastel',
    theme: {
      tile: '#ffd6e7',
      tileUsed: '#f5ecf1',
      boardGap: '#fff7fb',
      value: '#7a4cff',
      boardText: '#4a3b5c',
      stageText: '#4a3b5c',
      boardFont: "'Comic Neue', 'Comic Sans MS', cursive",
      valueFont: "'Comic Neue', 'Comic Sans MS', cursive",
      glow: 'none',
      scoreBar: 'bottom',
      scoreBarBg: '#fce4ef',
    },
  },
};

export function presetTheme(p: ThemePreset): Theme {
  return { preset: p, ...PRESETS[p].theme };
}

/** What a preset sets: its colors and fonts (applying one keeps the images and where the score bar goes). */
const PRESET_LOOK = ['tile', 'tileUsed', 'boardGap', 'value', 'boardText', 'stageText', 'boardFont', 'valueFont', 'glow', 'scoreBarBg'] as const;

/** Some of the theme's colors or fonts no longer match its preset, or it has looks no preset has. */
export function presetEdited(t: Theme): boolean {
  const p = PRESETS[t.preset]?.theme;
  if (p && EXTRA_LOOKS.some((k) => t[k] !== undefined)) return true;
  return !!p && PRESET_LOOK.some((k) => (k === 'stageText' ? stageText(t) : t[k]).toLowerCase() !== (p[k] ?? '').toLowerCase());
}

/** The Clue text color the clues are drawn in, or undefined: none, or plain white (drawn in the slides' text color). */
export function clueTextColor(t: Pick<Theme, 'clueColor'>): string | undefined {
  return t.clueColor && !/^#?(fff|ffffff)$/i.test(t.clueColor.trim()) ? t.clueColor : undefined;
}

/** The color of text on the tile color. A game from before it was a theme color gets its preset's while it keeps the
 * preset's tiles, else black or white, whichever reads better on them. */
export function stageText(t: Pick<Theme, 'preset' | 'tile' | 'stageText'>): string {
  if (t.stageText) return t.stageText;
  const p = PRESETS[t.preset]?.theme;
  if (p?.stageText && p.tile.toLowerCase() === t.tile.toLowerCase()) return p.stageText;
  return textOn(t.tile) === '#000' ? '#000000' : '#ffffff';
}

/** Whether `text` reads (3:1 or better) on the dark boxes laid over each of the colors `behind`. */
function onDarkBoxes(text: string, behind: string[]): boolean {
  const fg = toHex(text);
  if (!fg) return true;
  return behind.every((c) => [0.55, 0.72].every((dark) => contrast(fg, mixHex(toHex(c) ?? '#000000', '#000000', dark)) >= 3));
}

/** CSS custom properties for a theme (inherit into Board, ScoreBar, slides…). */
export function themeStyle(t: Theme | undefined, boardImageUrl?: string): string {
  const th = t ?? presetTheme('classic');
  const light = textOn(th.tile) === '#000';
  const vars: Record<string, string> = {
    '--tile': th.tile,
    '--tile-used': th.tileUsed,
    '--board-gap': th.boardGap,
    '--value': th.value,
    '--board-text': th.boardText,
    '--stage-text': stageText(th),
    // Negative scores: a light red on dark tiles, a dark one on light tiles.
    '--stage-bad': light ? '#b3261e' : '#ff6b6b',
    '--board-font': th.boardFont,
    '--value-font': th.valueFont,
    '--glow': th.glow === 'none' ? 'transparent' : th.glow,
    '--glow-size': th.glow === 'none' ? '0px' : `${lookNumber(th, 'glowSize')}px`,
    '--scorebar-bg': th.scoreBarBg,
    // The bar darkens a little towards the foot, never to black (a pastel bar stays pastel on a compressed stream).
    '--scorebar-end': `color-mix(in srgb, ${th.scoreBarBg} 72%, #000)`,
    // Hard drop shadows behind words on the tiles: black on dark tiles; a soft light one on light tiles, where a black
    // one smears dark words once the stream is compressed.
    '--tile-shadow': light ? 'rgba(255, 255, 255, 0.75)' : '#000',
    // The Daily Double splash is purple: the value color on it, unless that's too close (Pastel's purple), then white.
    '--dd-text': contrast(th.value, '#7a00ff') >= 3 ? th.value : '#ffffff',
    // The room code (and the wagers and places on stream) sit on dark boxes laid over the tiles or the score bar (55%
    // black on the Starting soon card, about 72% for the 📱 badge): the value color on them, unless it's too close to
    // those (Pastel's purple), then white.
    '--value-on-dark': onDarkBoxes(th.value, [th.tile, th.scoreBarBg]) ? th.value : '#ffffff',
    '--board-image': boardImageUrl ? cssUrl(boardImageUrl) : 'none',
    ...lookVars(th),
  };
  return Object.entries(vars)
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');
}

export const BANNER_DEFAULT = 170;
export const BANNER_MIN = 60;
export const BANNER_MAX = 400;
const SCORE_H = 230;

/** A horizontal band of the 1920×1080 board screen. */
export interface Band {
  top: number;
  height: number;
}

/**
 * Where the banner, board and score bar sit on the board screen. The banner always sits directly
 * above the board; `bg` is the area the board background (gap color / image) covers.
 */
export function boardLayout(t: Theme | undefined, hasBanner = !!t?.banner): { banner?: Band; board: Band; score?: Band; bg: Band } {
  const bar = t?.scoreBar ?? 'bottom';
  const b = hasBanner ? Math.min(BANNER_MAX, Math.max(BANNER_MIN, t?.bannerHeight ?? BANNER_DEFAULT)) : 0;
  const banner = (top: number) => (b ? { top, height: b } : undefined);
  if (bar === 'top')
    return { score: { top: 0, height: SCORE_H }, banner: banner(SCORE_H), board: { top: SCORE_H + b, height: 1080 - SCORE_H - b }, bg: { top: SCORE_H, height: 1080 - SCORE_H } };
  if (bar === 'hidden') return { banner: banner(0), board: { top: b, height: 1080 - b }, bg: { top: 0, height: 1080 } };
  return { banner: banner(0), board: { top: b, height: 1080 - SCORE_H - b }, score: { top: 1080 - SCORE_H, height: SCORE_H }, bg: { top: 0, height: 1080 - SCORE_H } };
}
