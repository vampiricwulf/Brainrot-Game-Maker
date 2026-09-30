// This computer's preferences for the app (not saved with games): ⚙ Settings.
const KEY = 'jb.prefs';

export interface Prefs {
  /** Desktop app: save an autosave of the game in the editor every this many minutes (0: off). */
  autosaveMinutes: number;
  /** How many autosaves to keep per game (the oldest is replaced). */
  autosaveKeep: number;
  /** Save replaces the game's last save, instead of making "Game (2).brainrot"… */
  overwriteSave: boolean;
}

export const DEFAULT_PREFS: Prefs = { autosaveMinutes: 5, autosaveKeep: 3, overwriteSave: false };

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    const p = raw ? (JSON.parse(raw) as Partial<Prefs>) : {};
    return { ...DEFAULT_PREFS, ...p };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export const prefs = $state<Prefs>(load());

/** Keep the current preferences (the settings dialog calls this on every change). */
export function savePrefs(): void {
  prefs.autosaveMinutes = Math.max(0, Math.min(240, Math.round(Number(prefs.autosaveMinutes) || 0)));
  prefs.autosaveKeep = Math.max(1, Math.min(50, Math.round(Number(prefs.autosaveKeep) || 1)));
  try {
    localStorage.setItem(KEY, JSON.stringify($state.snapshot(prefs)));
  } catch {
    // Storage may be off (private mode): the settings last until the app closes.
  }
}
