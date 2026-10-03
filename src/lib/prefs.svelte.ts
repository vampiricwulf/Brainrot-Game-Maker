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
  /** How the last game was shown (the pre-game screen's 🖥 Display): one window, or a separate audience window. */
  display: 'single' | 'audience';
  /** The pre-game screen's short "Going live?" checklist shows (✕ hides it). */
  liveChecklist: boolean;
  /** Which defaults the stored settings were made with (2: Save replaces by default). */
  v?: number;
}

export const DEFAULT_PREFS: Prefs = { autosaveMinutes: 5, autosaveKeep: 3, overwriteSave: true, undoSteps: 300, reduceMotion: false, buzzerServer: '', checkUpdates: true, display: 'single', liveChecklist: true, v: 2 };
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

/** The numbers last kept: a box emptied (to type another) keeps its number instead of saving 0 or 1. */
const numberOr = (v: unknown, was: number) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? was : Number(v));
let kept = {
  autosaveMinutes: numberOr(prefs.autosaveMinutes, DEFAULT_PREFS.autosaveMinutes),
  autosaveKeep: numberOr(prefs.autosaveKeep, DEFAULT_PREFS.autosaveKeep),
  undoSteps: numberOr(prefs.undoSteps, DEFAULT_PREFS.undoSteps),
};

/** Keep the current preferences (the settings dialog calls this on every change). */
export function savePrefs(): void {
  prefs.autosaveMinutes = Math.max(0, Math.min(240, Math.round(numberOr(prefs.autosaveMinutes, kept.autosaveMinutes))));
  prefs.autosaveKeep = Math.max(1, Math.min(50, Math.round(numberOr(prefs.autosaveKeep, kept.autosaveKeep))));
  if (prefs.display !== 'audience') prefs.display = 'single';
  prefs.buzzerServer = String(prefs.buzzerServer ?? '').trim();
  prefs.undoSteps = Math.max(UNDO_STEPS.min, Math.min(UNDO_STEPS.max, Math.round(numberOr(prefs.undoSteps, kept.undoSteps) || DEFAULT_PREFS.undoSteps)));
  kept = { autosaveMinutes: prefs.autosaveMinutes, autosaveKeep: prefs.autosaveKeep, undoSteps: prefs.undoSteps };
  try {
    localStorage.setItem(KEY, JSON.stringify($state.snapshot(prefs)));
  } catch {
    // Storage may be off (private mode): the settings last until the app closes.
  }
}
