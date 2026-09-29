// Global app state (Svelte 5 runes). Components mutate it directly; App.svelte autosaves it.
import { newGame, type Game, type Session } from './model';
import { newLive, type Live } from './live';
import type { SavedPlay } from './persist';

export type Screen = 'editor' | 'play';

/** A button shown in the toast (e.g. "Redo" after an undo). */
export interface ToastAction {
  label: string;
  run: () => void;
}

export const app = $state<{
  screen: Screen;
  game: Game;
  /** Snapshot of the game being played (edits in the editor don't affect a running game). */
  playGame: Game | null;
  session: Session | null;
  /** A saved game in progress the host can resume from the editor (kept after Exit and across reloads). */
  resumable: SavedPlay | null;
  /** Pre-game setup is showing (players/confirm) before the board. */
  pregame: boolean;
  /** On-screen transient state mirrored to the audience window. */
  live: Live;
  toast: string;
  toastAction: ToastAction | null;
  /** IndexedDB autosave works in this browser. */
  storageOk: boolean;
}>({
  screen: 'editor',
  game: newGame(),
  playGame: null,
  session: null,
  resumable: null,
  pregame: false,
  live: newLive(),
  toast: '',
  toastAction: null,
  storageOk: true,
});

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string, ms = 2500, action: ToastAction | null = null): void {
  app.toast = msg;
  app.toastAction = action;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    app.toast = '';
    app.toastAction = null;
  }, ms);
}
