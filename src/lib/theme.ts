// Board/stage themes (spec §5.7): presets plus per-game overrides, applied as CSS variables.
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
    '--board-image': boardImageUrl ? `url("${boardImageUrl}")` : 'none',
  };
  return Object.entries(vars)
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');
}
