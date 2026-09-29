// Board/stage themes (spec §5.7): presets plus per-game overrides, applied as CSS variables.
import { cssUrl } from './links';
import type { Id } from './model';

export type ThemePreset = 'classic' | 'dark' | 'neon' | 'pastel';

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
}

export const PRESETS: Record<ThemePreset, { label: string; theme: Omit<Theme, 'preset'> }> = {
  classic: {
    label: 'Classic',
    theme: {
      tile: '#060ce9',
      tileUsed: '#030773',
      boardGap: '#000000',
      value: '#ffcc00',
      boardText: '#ffffff',
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

/** CSS custom properties for a theme (inherit into Board, ScoreBar, slides…). */
export function themeStyle(t: Theme | undefined, boardImageUrl?: string): string {
  const th = t ?? presetTheme('classic');
  const vars: Record<string, string> = {
    '--tile': th.tile,
    '--tile-used': th.tileUsed,
    '--board-gap': th.boardGap,
    '--value': th.value,
    '--board-text': th.boardText,
    '--board-font': th.boardFont,
    '--value-font': th.valueFont,
    '--glow': th.glow === 'none' ? 'transparent' : th.glow,
    '--glow-size': th.glow === 'none' ? '0px' : '18px',
    '--scorebar-bg': th.scoreBarBg,
    '--board-image': boardImageUrl ? cssUrl(boardImageUrl) : 'none',
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
