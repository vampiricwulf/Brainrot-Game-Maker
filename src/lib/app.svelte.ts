// Global app state (Svelte 5 runes). Components mutate it directly; App.svelte autosaves it.
import { newGame, type Game, type Session } from './model';
import { newLive, type Live } from './live';
import type { SavedPlay } from './persist';
import type { PlayPart } from './historylabel';

export type Screen = 'editor' | 'play';

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
  /** Single window with the host controls hidden: the whole window is on stream, so toasts aren't shown. */
  onAir: boolean;
  /** IndexedDB autosave works in this browser. */
  storageOk: boolean;
  /** Set while the host edits the game being played (a screen live): the slide editors work on it instead. */
  editGame: Game | null;
  /** Desktop app: the last autosave file written (⚙ Settings → Autosave). */
  fileAutosave: { path: string; at: number } | null;
  /** An exported, player-only game file: no editor, and nothing it keeps outlasts a refresh but the game in progress. */
  playerOnly: boolean;
  /** The part of the pre-game screen to show when it opens (History's Go there), then cleared. */
  pregameAt: PlayPart | null;
}>({
  screen: 'editor',
  game: newGame(),
  playGame: null,
  session: null,
  resumable: null,
  pregame: false,
  live: newLive(),
  toast: '',
  onAir: false,
  storageOk: true,
  editGame: null,
  fileAutosave: null,
  playerOnly: false,
  pregameAt: null,
});

/** The game the editing components change: the one being played while it's edited live, else the editor's. */
export function editedGame(): Game {
  return app.editGame ?? app.game;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string, ms = 2500): void {
  app.toast = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (app.toast = ''), ms);
}
