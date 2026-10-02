// Ready-made pieces for RPG rounds (and the board-game spaces that use the same shops and stats): a new shop that
// sells the whole catalog, an enemy to fight, and the stats a fight needs. Pure functions over Game; the editor wraps
// them in a step.
import { newId, newTextEl, type Action, type Game, type ObjectRole, type Shop, type SlideElement, type StatField } from './model';
import { currencyFields, STAT_PRESETS, statFields } from './toolset';

/** A name no shop has yet: "Shop 2", or `base` ("Village shop", then "Village shop 2"). */
function shopName(game: Game, base?: string): string {
  const used = new Set((game.shops ?? []).map((s) => s.name));
  const first = base?.trim() || `Shop ${(game.shops?.length ?? 0) + 1}`;
  if (!used.has(first)) return first;
  for (let n = 2; ; n++) if (!used.has(`${first} ${n}`)) return `${first} ${n}`;
}

/**
 * A new shop in the game, selling every item in the catalog (no stock limit), charging the first currency. Its prices
 * and what it sells are changed in 📊 Stats & Items.
 */
export function newShop(game: Game, name?: string): Shop {
  const s: Shop = { id: newId(), name: shopName(game, name), currency: currencyFields(game)[0]?.id, stock: (game.items ?? []).map((it) => ({ item: it.id, qty: null })) };
  game.shops = [...(game.shops ?? []), s];
  return s;
}

/** The game's number stat called `name` (any case), if it has one. */
export function numberStat(game: Game, name: string): StatField | undefined {
  const n = name.toLowerCase();
  return statFields(game).find((f) => f.type === 'number' && f.name.trim().toLowerCase() === n);
}

/** The game's stat made from a preset (❤ HP, 🪙 Gold, 💪 Power), added when it has none of that name yet. */
export function presetStat(game: Game, which: 'HP' | 'Gold' | 'Power'): StatField {
  const have = numberStat(game, which);
  if (have) return have;
  const f = STAT_PRESETS.find((p) => p.label.includes(which))!.make();
  game.statFields = [...(game.statFields ?? []), f];
  return f;
}

/** How an enemy is fought, in its host notes (shown on its card in play). */
export const FIGHT_NOTES =
  'Fight: use Compare on its card (your Power vs its Power), or roll 🎲 for each side. A win: press − by its HP (at 0 it’s beaten: 🗑 Remove it). A loss: press the HP −1 button for whoever fought.';

/**
 * An enemy: a character with its own HP and Power (viewers see them), whose card compares them with a player's, and
 * buttons for the fight (roll, and the player losing 1 HP when the game has an HP stat).
 */
export function enemyRole(game: Game, hp = 5, power = 2): ObjectRole {
  const actions: Action[] = [{ id: newId(), do: 'dice', dice: 'd6' }];
  const hpStat = numberStat(game, 'HP');
  if (hpStat) actions.push({ id: newId(), do: 'stat', field: hpStat.id, op: 'add', amount: -1, who: 'ask' });
  return {
    class: 'npc',
    stats: [
      { name: 'HP', value: hp },
      { name: 'Power', value: power },
    ],
    statsShown: true,
    actions,
  };
}

/** An enemy to place on a screen: a big 👹 (swap it for a picture) with its fight set up. */
export function enemyObject(game: Game, name = 'Enemy', emoji = '👹', hp = 5, power = 2): SlideElement {
  const el: SlideElement = { ...newTextEl(emoji, { x: 1180, y: 600, w: 260, h: 300 }), size: 200, uppercase: false, shadow: undefined };
  el.name = name;
  el.role = enemyRole(game, hp, power);
  el.hostNotes = FIGHT_NOTES;
  return el;
}
