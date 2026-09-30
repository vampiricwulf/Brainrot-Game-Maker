// The round modes a game can mix (spec: docs/GAMES-MAKER-SPEC.md §5.2).
import type { RoundMode } from './model';

export interface ModeInfo {
  label: string;
  icon: string;
  /** One line for the "Add round" menu. */
  hint: string;
}

export const ROUND_MODES: Record<RoundMode, ModeInfo> = {
  board: { label: 'Jeopardy board', icon: '🟦', hint: 'Categories of clues with values, Daily Doubles, wheel and dice tiles' },
  final: { label: 'Final Jeopardy', icon: '⭐', hint: 'One category, private wagers, one question, reveals player by player' },
  rpg: { label: 'RPG', icon: '🗺', hint: 'A world of screens on a map: move the players’ avatars, doorways, items, shops' },
  boardgame: { label: 'Board game', icon: '🎲', hint: 'Spaces in a loop or a path: take turns to spin or roll, step along, pass Start, get sent away' },
};
