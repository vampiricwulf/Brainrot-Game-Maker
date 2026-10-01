// This computer's preferences for the app (not saved with games): ⚙ Settings.
const KEY = 'jb.prefs';

export interface Prefs {
  /** Desktop app: save an autosave of the game in the editor every this many minutes (0: off). */
  autosaveMinutes: number;
  /** How many autosaves to keep per game (the oldest is replaced). */
  autosaveKeep: number;
  /**
   * Save replaces the game's last save, keeping the one it replaces as "Game.brainrot.bak" (and the one before as
   * .bak2). Off: every Save makes a new file, "Game (2).brainrot"…
   */
  overwriteSave: boolean;
  /** How many undo steps the editor remembers (the oldest are forgotten). */
  undoSteps: number;
  /** Viewers see no pop-ins, fly-ins or confetti (motion.svelte.ts). */
  reduceMotion: boolean;
  /** Phone buzzers: the buzzer server's address ('' for the one this copy was built with). */
  buzzerServer: string;
  /** Ask GitHub whether a newer version is out when the app starts (update.svelte.ts). */
  checkUpdates: boolean;
  /** Which defaults the stored settings were made with (2: Save replaces by default). */
  v?: number;
}

export const DEFAULT_PREFS: Prefs = { autosaveMinutes: 5, autosaveKeep: 3, overwriteSave: true, undoSteps: 300, reduceMotion: false, buzzerServer: '', checkUpdates: true, v: 2 };
/** The range ⚙ Settings allows for undoSteps. */
export const UNDO_STEPS = { min: 20, max: 2000 };

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    const p = raw ? (JSON.parse(raw) as Partial<Prefs>) : {};
    // Settings stored before Save replaced by default had it off only because that was the default then.
    if (p.v !== 2) Object.assign(p, { v: 2, overwriteSave: true });
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
  prefs.buzzerServer = String(prefs.buzzerServer ?? '').trim();
  prefs.undoSteps = Math.max(UNDO_STEPS.min, Math.min(UNDO_STEPS.max, Math.round(Number(prefs.undoSteps) || DEFAULT_PREFS.undoSteps)));
  try {
    localStorage.setItem(KEY, JSON.stringify($state.snapshot(prefs)));
  } catch {
    // Storage may be off (private mode): the settings last until the app closes.
  }
}
