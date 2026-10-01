// What the parts of a game point at (a button's stat, item, shop, wheel, screen, space or zone; an object's item or
// shop) and whether it's still there. Deleting something can leave these pointing nowhere: the editor's checklist
// lists them, and running such a button says why it can't instead of misbehaving.
import { PLAYER_WHEEL, type Action, type BoardGameRound, type Game, type Screen, type SlideElement, type World, type WorldMap } from './model';

/** Why an action can't run as set up (what it points at was deleted, or nothing is chosen), or null. */
export function actionProblem(game: Game, a: Action, where: { world?: World; board?: BoardGameRound } = {}): string | null {
  switch (a.do) {
    case 'stat': {
      const f = game.statFields?.find((x) => x.id === a.field);
      if (!f) return a.field ? 'That stat no longer exists' : 'No stat chosen';
      return f.type === 'number' ? null : 'That stat isn’t a number';
    }
    case 'item':
      if (!a.item) return 'No item chosen';
      return game.items?.some((i) => i.id === a.item) ? null : 'That item no longer exists';
    case 'shop':
      if (!a.shop) return 'No shop chosen';
      return game.shops?.some((s) => s.id === a.shop) ? null : 'That shop no longer exists';
    case 'wheel':
      return a.wheel === PLAYER_WHEEL || game.wheels.some((w) => w.id === a.wheel) ? null : 'That wheel no longer exists';
    case 'move': {
      // Only an RPG round's own world can say (moves elsewhere are refused anyway).
      const m = where.world?.maps.find((x) => x.id === a.to.map);
      return !where.world || m?.screens.some((s) => s.id === a.to.screen) ? null : 'That screen no longer exists';
    }
    case 'goto':
      if (!where.board) return null;
      if (a.zone) return where.board.zones.some((z) => z.id === a.zone) ? null : 'That zone no longer exists';
      if (!a.space) return 'No space chosen';
      return where.board.spaces.some((s) => s.id === a.space) ? null : 'That space no longer exists';
    default:
      return null;
  }
}

/** Names for a checklist line: “Cave”, “Cave” and “Town”, or “Cave”, “Town” and 3 more (each once). */
export function nameList(names: readonly string[], max = 2): string {
  const list = [...new Set(names)].map((n) => `“${n}”`);
  if (list.length <= 1) return list[0] ?? '';
  if (list.length <= max) return `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
  return `${list.slice(0, max).join(', ')} and ${list.length - max} more`;
}

/** Every object on a world's screens with where it is: its map, its screen and the look it's in (none: the screen's own). */
export function objectsWhere(world: World): { el: SlideElement; map: WorldMap; screen: Screen; look?: string }[] {
  return world.maps.flatMap((map) =>
    map.screens.flatMap((screen) => [
      ...screen.slide.elements.map((el) => ({ el, map, screen })),
      ...(screen.variants ?? []).flatMap((v) => v.slide.elements.map((el) => ({ el, map, screen, look: v.id }))),
    ]),
  );
}

/** Every object on a world's screens, in every look. */
export function worldObjects(world: World): SlideElement[] {
  return world.maps.flatMap((m) => m.screens.flatMap((s) => [s.slide, ...(s.variants ?? []).map((v) => v.slide)].flatMap((sl) => sl.elements)));
}

/** Whether an RPG object points nowhere: its item, shop or currency, or one of its buttons'. */
export function objectPointsNowhere(game: Game, el: SlideElement, world: World): boolean {
  const r = el.role;
  if (!r) return false;
  if (r.class === 'item' && r.item && !game.items?.some((i) => i.id === r.item)) return true;
  if ((r.class === 'npc' || r.class === 'shop') && r.shop && !game.shops?.some((s) => s.id === r.shop)) return true;
  if (r.class === 'currency' && r.field && !game.statFields?.some((f) => f.id === r.field)) return true;
  return (r.actions ?? []).some((a) => actionProblem(game, a, { world }) !== null);
}

/** Every button in the game: objects' (every look), items' Use, wheel slices', dice faces' and board spaces'. */
export function allActions(game: Game): Action[] {
  const lists: (Action[] | undefined)[] = [];
  for (const w of game.worlds ?? []) for (const el of worldObjects(w)) lists.push(el.role?.actions);
  for (const it of game.items ?? []) lists.push(it.onUse);
  for (const w of game.wheels) for (const s of w.segments) lists.push(s.actions);
  for (const d of game.dice) {
    for (const die of d.dice) for (const f of die.customFaces ?? []) lists.push(f.actions);
    for (const t of d.totalOutcomes ?? []) lists.push(t.outcome.actions);
  }
  for (const r of game.rounds) if (r.mode === 'boardgame') for (const s of r.spaces) lists.push(s.onPass, s.onLand);
  return lists.flatMap((l) => l ?? []);
}
