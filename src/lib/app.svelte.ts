// Global app state (Svelte 5 runes). Components mutate it directly; App.svelte autosaves it.
import { announce } from './announce';
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
  /**
   * ▶ Test this round (the editor): the id of the round being tried out. The game in play is then a throwaway copy of
   * that round alone: never saved, never replacing the game kept to resume.
   */
  test: string | null;
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
  test: null,
});

/** The game the editing components change: the one being played while it's edited live, else the editor's. */
export function editedGame(): Game {
  return app.editGame ?? app.game;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

/** How long a toast stays: long enough to read it (2.5 s, plus 50 ms a word, at most 8 s). */
export function toastMs(msg: string): number {
  const words = msg.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(8000, Math.max(2500, 2500 + 50 * words));
}

/** Where the host is (the editor, the pre-game screen, the game): a toast belongs to the place it was said in. */
const place = (): string => `${app.screen}|${app.pregame}`;
/** The place the toast showing now was said in, and when. */
let toastPlace = '';
let toastAt = 0;

// Going somewhere else (into the game, back to the editor) puts away a toast said a while before it ("Added a sample
// game: press ▶ Play…" is about the editor). One said on the way there (Exit's "Game discarded") stays.
$effect.root(() => {
  $effect(() => {
    const now = place();
    if (app.toast && toastPlace && toastPlace !== now && Date.now() - toastAt > 500) {
      clearTimeout(toastTimer);
      app.toast = '';
    }
  });
});

/** A short message at the bottom (at the top while a window is open). `ms`: only where it must stay a set time. */
export function toast(msg: string, ms = toastMs(msg)): void {
  app.toast = msg;
  toastPlace = place();
  toastAt = Date.now();
  // Screen readers hear it from the page's live region (the toast itself comes and goes too fast to be read reliably).
  announce(msg);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (app.toast = ''), ms);
}
