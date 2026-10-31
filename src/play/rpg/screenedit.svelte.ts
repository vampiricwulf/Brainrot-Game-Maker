// The RPG screen open in the live editor (✎ Edit screen, an object's ✎ Edit on its card or in its menu): the host
// panel's RPG box shows the editor while it's set. Kept here so the stage's menu can open it too.
import type { Screen, Slide, WorldState } from '../../lib/model';

export const screenEdit = $state<{ open: { screen: Screen; slide: Slide; title: string } | null }>({ open: null });

/** Open a screen in the live editor, in the look it has on now. */
export function editScreen(st: WorldState | undefined, screen: Screen): void {
  const v = screen.variants?.find((x) => x.id === st?.variant?.[screen.id]);
  screenEdit.open = { screen, slide: v?.slide ?? screen.slide, title: `${screen.name}${v ? ` (${v.name})` : ''}` };
}
