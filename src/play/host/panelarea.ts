// One window: a window opened from inside the host panel (the RPG's ⤢ Full map, ✎ Edit board's ⚙ Buttons…) goes over
// the panel only, never over the stage viewers see. Play hands the panel's box down by context, as it does for ?, 📜 Log
// and 👥 Players.

export type PanelArea = { top: number; left: number; width: number; height: number };

/**
 * The context key: its value says where such a window goes. `dual` (an audience window is open): anywhere, as before.
 * Else over `box`, the host panel; null while it's being measured (the window waits for it).
 */
export const PANEL_AREA = Symbol('panel-area');
export type PanelPlace = () => { dual: boolean; box: PanelArea | null };
