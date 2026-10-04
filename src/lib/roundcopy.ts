// Whole rounds between games: Copy round / Paste round, and Import rounds…. A round takes along what
// it uses from its game (an RPG round its world; any round the wheels, dice, stats, items and shops its tiles,
// objects and spaces point at, and the files it all shows), and the game it goes into adds the ones it hasn't got.
import { clipboard, mediaShownBy, type RoundBundle } from './clipboard.svelte';
import { uniqueMediaName } from './medianame';
import { uploadedFamily } from './fonts';
import { isRpg, newId, roundName, type Game, type MediaRef, type Round } from './model';
import { clone, reidRound } from './ops';

export type { RoundBundle };

const used = <T extends { id: string }>(list: readonly T[] | undefined, json: string): T[] => (list ?? []).filter((x) => json.includes(x.id));

/** A round of `game` with everything it uses, as copies. */
export function bundleRound(game: Game, round: Round): RoundBundle {
  const r = clone(round);
  const worlds = clone(isRpg(r) ? (game.worlds ?? []).filter((w) => w.id === r.world) : []);
  // Until nothing more comes in: shops point at items and stats, items' buttons at wheels, shops and other items,
  // wheels' slices at items and other wheels…
  const pick = (json: string) => ({
    wheels: used(game.wheels, json),
    dice: used(game.dice, json),
    shops: used(game.shops, json),
    items: used(game.items, json),
    statFields: used(game.statFields, json),
  });
  let found = pick(JSON.stringify([r, worlds]));
  const size = (f: typeof found) => Object.values(f).reduce((n, l) => n + l.length, 0);
  for (let more = pick(JSON.stringify([r, worlds, found])); size(more) > size(found); more = pick(JSON.stringify([r, worlds, found]))) found = more;
  const { wheels, dice, shops, items, statFields } = clone(found);
  const media = clone(mediaShownBy([r, worlds, wheels, dice, shops, items, statFields], game.media));
  return { round: r, from: game.title, label: roundName(round, game.rounds.indexOf(round)), worlds, wheels, dice, statFields, items, shops, media };
}

/** A bundled round's name for messages: as its game showed it. */
export const bundleName = (b: RoundBundle): string => b.label ?? roundName(b.round);

/** Copy round: to the in-app clipboard, with its files kept while it's there. */
export function copyRound(game: Game, round: Round): void {
  const b = bundleRound(game, round);
  clipboard.round = b;
  clipboard.media = [...clipboard.media, ...b.media.filter((m) => !clipboard.media.some((x) => x.id === m.id))];
}

/** The things a round takes along, by kind, with the word a message uses for each. */
const KINDS = [
  ['worlds', 'world'],
  ['wheels', 'wheel'],
  ['dice', 'dice'],
  ['statFields', 'stat'],
  ['items', 'item'],
  ['shops', 'shop'],
] as const;
type Kind = (typeof KINDS)[number][0];
type Named = { id: string; name: string };

/** The same content? (Key order aside: an edit can add a field after the others.) */
export function sameContent(a: unknown, b: unknown): boolean {
  const norm = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(norm) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).sort(([x], [y]) => (x < y ? -1 : 1)).map(([k, x]) => [k, norm(x)])) : v;
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

/** A name not in `names`: `base`, else "base (copy)", "base (copy 2)"… (or "base (2)"… with `copy` false). */
export function uniqueName(names: readonly string[], base: string, copy = true): string {
  if (!names.includes(base)) return base;
  for (let n = copy ? 1 : 2; ; n++) {
    const name = copy ? `${base} (copy${n > 1 ? ` ${n}` : ''})` : `${base} (${n})`;
    if (!names.includes(name)) return name;
  }
}

/** New ids given to things that came in as copies, by the id they had: the same copy is used for the next round. */
export type CopyIds = Map<string, string>;
/** The copies made for each copied round (pasting it again uses them). */
const pasted = new Map<string, CopyIds>();

/**
 * Where the bundle has a world, wheel, dice, stat, item or shop with the id of one in `game` but different content (from
 * another copy of the same game), give it a new id, and every reference to it in the bundle too. Returns the bundle so
 * changed, and which things got a new id.
 */
function settleIds(game: Game, b: RoundBundle, ids: CopyIds): { b: RoundBundle; changed: Set<string> } {
  let json = JSON.stringify(b);
  const changed = new Set<string>();
  for (let again = true; again; ) {
    again = false;
    const cur = JSON.parse(json) as RoundBundle;
    for (const [kind] of KINDS)
      for (const x of cur[kind] as Named[]) {
        const mine = (game[kind] as Named[] | undefined)?.find((y) => y.id === x.id);
        if (!mine || sameContent(mine, x)) continue;
        const id = (!changed.has(x.id) && ids.get(x.id)) || newId();
        ids.set(x.id, id);
        changed.delete(x.id);
        changed.add(id);
        // Ids are random (UUIDs): one appears in the JSON only where it is that id.
        json = json.split(JSON.stringify(x.id)).join(JSON.stringify(id));
        again = true;
        break;
      }
  }
  return { b: JSON.parse(json), changed };
}

/**
 * Put a copy of a bundled round into `game` at `at` (fresh ids, so it never mixes with the original), adding the world,
 * wheels, dice, stats, items, shops and files it uses that the game hasn't got. One with the id of one here but other
 * content (from another copy of this game) comes in as a copy with its own id; `copied` hears what each is ("“Adventure”
 * world"). `ids` keeps those copies' ids, so more rounds from the same place share them (by default, one
 * set per copied round). Returns the new round.
 */
export function addBundledRound(game: Game, bundle: RoundBundle, at = game.rounds.length, copied?: string[], ids?: CopyIds): Round {
  const key = `${bundle.from}\n${bundle.round.id}`;
  if (!ids) pasted.set(key, (ids = pasted.get(key) ?? new Map()));
  const { b, changed } = settleIds(game, bundle, ids);
  for (const [kind, word] of KINDS) {
    const list = (game[kind] ?? []) as Named[];
    const extra = clone((b[kind] as Named[]).filter((x) => !list.some((y) => y.id === x.id)));
    if (!extra.length && kind !== 'wheels' && kind !== 'dice') continue;
    for (const x of extra)
      if (changed.has(x.id)) {
        copied?.push(`“${x.name}” ${word}`);
        // Two of one name (this game's and the copy) would be hard to tell apart in their list.
        x.name = uniqueName(list.map((y) => y.name), x.name);
      }
    (game as Record<Kind, Named[]>)[kind] = [...list, ...extra];
  }
  addMedia(game, b.media);
  const round = reidRound(clone(b.round));
  // A round of the same name (pasted twice, or into its own game) is told apart.
  const name = uniqueName(game.rounds.map((r, i) => roundName(r, i)), roundName(round));
  if (name !== roundName(round)) round.name = name;
  game.rounds.splice(at, 0, round);
  // (As the game holds it: a live game wraps what goes into it.)
  return game.rounds[at];
}

/** What to say about things that came in as copies ("Brought the file’s “Adventure” world as a copy…"), or ''. */
export function copiesMessage(copied: readonly string[], from: string): string {
  if (!copied.length) return '';
  const one = copied.length === 1;
  const list = one ? copied[0] : `${copied.slice(0, -1).join(', ')} and ${copied[copied.length - 1]}`;
  return `Brought ${from}’s ${list} as ${one ? 'a copy' : 'copies'} (this game’s ${one ? 'is' : 'are'} unchanged)`;
}

/** The same bytes? */
async function sameBytes(a: Blob, b: Blob): Promise<boolean> {
  if (a.size !== b.size) return false;
  const [x, y] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()]).then((v) => v.map((buf) => new Uint8Array(buf)));
  return x.every((v, i) => v === y[i]);
}

/**
 * Another game's files, read from its file (`held`, by id) and not stored yet, made ready to be stored: one with the id
 * of a file this browser already holds (`existing`: this game's, a recent game's…) but other bytes (from another copy of
 * the same game, changed since) gets a new id, and so does every reference to it in `other`, so storing it never changes
 * what another game shows. Returns the game so changed, the files to store (one already held with the same bytes isn't),
 * and the new ids (the copies).
 */
export async function settleFiles(
  other: Game,
  held: ReadonlyMap<string, Blob>,
  existing: (id: string) => Blob | undefined | Promise<Blob | undefined>,
): Promise<{ game: Game; store: [string, Blob][]; copies: Set<string> }> {
  let json = JSON.stringify(other);
  const store: [string, Blob][] = [];
  const copies = new Set<string>();
  for (const ref of other.media) {
    const blob = held.get(ref.id);
    if (!blob) continue;
    const ours = await existing(ref.id);
    // Not held yet (or lost, which these bytes bring back), or the very same file.
    if (!ours) {
      store.push([ref.id, blob]);
      continue;
    }
    if (await sameBytes(ours, blob)) continue;
    const id = newId();
    json = json.split(JSON.stringify(ref.id)).join(JSON.stringify(id));
    // An uploaded font is also named by its family in the CSS font lists that use it ('jb-…', sans-serif).
    if (ref.kind === 'font') json = json.split(uploadedFamily(ref.id)).join(uploadedFamily(id));
    store.push([id, blob]);
    copies.add(id);
  }
  return { game: JSON.parse(json), store, copies };
}

/** Add files of another game that this one hasn't got (a name already taken here gets another). */
export function addMedia(game: Game, refs: readonly MediaRef[]): void {
  for (const m of refs)
    if (!game.media.some((x) => x.id === m.id)) game.media.push({ ...clone(m), name: uniqueMediaName(game.media.map((x) => x.name), m.name) });
}

/** Where a new round goes: at the end, before any Final rounds there (so the Final stays last), unless it's a Final. */
export function placeFor(game: Game, round: Round): number {
  // The game's first slides round is its introduction: it goes first.
  if (round.mode === 'slides' && !game.rounds.some((r) => r.mode === 'slides')) return 0;
  let at = game.rounds.length;
  if (round.mode !== 'final') while (at > 0 && game.rounds[at - 1].mode === 'final') at--;
  return at;
}
