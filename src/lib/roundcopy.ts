// Whole rounds between games: Copy round / Paste round, and Import round from a .brainrot…. A round takes along what
// it uses from its game (an RPG round its world; any round the wheels, dice, stats, items and shops its tiles,
// objects and spaces point at, and the files it all shows), and the game it goes into adds the ones it hasn't got.
import { clipboard, mediaShownBy, type RoundBundle } from './clipboard.svelte';
import { uniqueMediaName } from './medianame';
import { isRpg, roundName, type Game, type MediaRef, type Round } from './model';
import { clone, reidRound } from './ops';

export type { RoundBundle };

const used = <T extends { id: string }>(list: readonly T[] | undefined, json: string): T[] => (list ?? []).filter((x) => json.includes(x.id));

/** A round of `game` with everything it uses, as copies. */
export function bundleRound(game: Game, round: Round): RoundBundle {
  const r = clone(round);
  const worlds = clone(isRpg(r) ? (game.worlds ?? []).filter((w) => w.id === r.world) : []);
  // Twice: shops point at items and stats, wheels' slices at items…
  let json = JSON.stringify([r, worlds]);
  const wheels = clone(used(game.wheels, json));
  const dice = clone(used(game.dice, json));
  json = JSON.stringify([r, worlds, wheels, dice]);
  const shops = clone(used(game.shops, json));
  json = JSON.stringify([r, worlds, wheels, dice, shops]);
  const items = clone(used(game.items, json));
  json = JSON.stringify([r, worlds, wheels, dice, shops, items]);
  const statFields = clone(used(game.statFields, json));
  const media = clone(mediaShownBy([r, worlds, wheels, dice, shops, items, statFields], game.media));
  return { round: r, from: game.title, worlds, wheels, dice, statFields, items, shops, media };
}

/** Copy round: to the in-app clipboard, with its files kept while it's there. */
export function copyRound(game: Game, round: Round): void {
  const b = bundleRound(game, round);
  clipboard.round = b;
  clipboard.media = [...clipboard.media, ...b.media.filter((m) => !clipboard.media.some((x) => x.id === m.id))];
}

/**
 * Put a copy of a bundled round into `game` at `at` (fresh ids, so it never mixes with the original), adding the world,
 * wheels, dice, stats, items, shops and files it uses that the game hasn't got. Returns the new round.
 */
export function addBundledRound(game: Game, b: RoundBundle, at = game.rounds.length): Round {
  const add = <T extends { id: string }>(list: T[] | undefined, extra: T[]): T[] => [...(list ?? []), ...clone(extra.filter((x) => !list?.some((y) => y.id === x.id)))];
  if (b.worlds.length) game.worlds = add(game.worlds, b.worlds);
  game.wheels = add(game.wheels, b.wheels);
  game.dice = add(game.dice, b.dice);
  if (b.statFields.length) game.statFields = add(game.statFields, b.statFields);
  if (b.items.length) game.items = add(game.items, b.items);
  if (b.shops.length) game.shops = add(game.shops, b.shops);
  addMedia(game, b.media);
  const round = reidRound(clone(b.round));
  // A round of the same name (pasted twice, or into its own game) is told apart.
  const names = game.rounds.map((r, i) => roundName(r, i));
  if (names.includes(roundName(round))) round.name = `${roundName(round)} (copy)`;
  game.rounds.splice(at, 0, round);
  // (As the game holds it: a live game wraps what goes into it.)
  return game.rounds[at];
}

/** Add files of another game that this one hasn't got (a name already taken here gets another). */
export function addMedia(game: Game, refs: readonly MediaRef[]): void {
  for (const m of refs)
    if (!game.media.some((x) => x.id === m.id)) game.media.push({ ...clone(m), name: uniqueMediaName(game.media.map((x) => x.name), m.name) });
}

/** Where a new round goes: at the end, before any Final rounds there (so the Final stays last), unless it's a Final. */
export function placeFor(game: Game, round: Round): number {
  let at = game.rounds.length;
  if (round.mode !== 'final') while (at > 0 && game.rounds[at - 1].mode === 'final') at--;
  return at;
}
