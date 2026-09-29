// Global app state (Svelte 5 runes). Components mutate it directly; App.svelte autosaves it.
import { newGame, type Game, type Session } from './model';

export type Screen = 'editor' | 'play';

export const app = $state<{
  screen: Screen;
  game: Game;
  /** Snapshot of the game being played (edits in the editor don't affect a running game). */
  playGame: Game | null;
  session: Session | null;
  /** Pre-game setup is showing (players/confirm) before the board. */
  pregame: boolean;
  toast: string;
}>({
  screen: 'editor',
  game: newGame(),
  playGame: null,
  session: null,
  pregame: false,
  toast: '',
});

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string, ms = 2500): void {
  app.toast = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (app.toast = ''), ms);
}
