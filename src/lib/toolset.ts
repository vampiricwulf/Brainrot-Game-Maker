// The shared toolset every game mode can use (games-maker spec §5.1): player stats, inventories, shops and the
// action log that makes all of it undoable. Pure functions over Game + Session, like session.ts.
import { answerShowing, applyScore, finalNext, score, stepOf, toggleReveal } from './session';
import {
  formatPoints, newId, type ActionEvent, type BoardSpace, type FinalState, type Game, type InventoryEntry, type ItemDef, type Screen, type Session, type Shop, type StatField,
  type StatValue, type Wearable, type WorldMap,
} from './model';
import type { Problem } from './validate';

// ---------- Stats ----------

export function statFields(game: Game): StatField[] {
  return game.statFields ?? [];
}

export function newStatField(name: string, type: StatField['type'] = 'number'): StatField {
  return { id: newId(), name, type, start: type === 'number' ? 0 : type === 'checkbox' ? false : type === 'tags' ? [] : '', audience: 'hud', display: 'counter' };
}

/** Ready-made fields offered when a game has none yet. */
export const STAT_PRESETS: { label: string; make: () => StatField }[] = [
  { label: '❤ HP (bar, 0–10)', make: () => ({ ...newStatField('HP'), start: 10, min: 0, max: 10, display: 'bar', color: '#e6194b' }) },
  { label: '🪙 Gold (currency)', make: () => ({ ...newStatField('Gold'), start: 10, min: 0, currency: true, symbol: '🪙', color: '#ffcc00' }) },
  { label: '💪 Power', make: () => ({ ...newStatField('Power'), start: 1 }) },
  { label: '🏷 Status (tags)', make: () => ({ ...newStatField('Status', 'tags'), audience: 'hud' }) },
  { label: '📝 Class (text)', make: () => ({ ...newStatField('Class', 'text'), audience: 'sheet' }) },
];

function defaultValue(f: StatField): StatValue {
  if (f.start !== undefined) return Array.isArray(f.start) ? [...f.start] : f.start;
  return f.type === 'number' ? 0 : f.type === 'checkbox' ? false : f.type === 'tags' ? [] : '';
}

/** A player's value for a field: set during the game, else the game's value for them, else the field's start. */
export function statValue(game: Game, session: Session, playerId: string, field: StatField): StatValue {
  const v = session.stats?.[playerId]?.[field.id];
  if (v !== undefined) return v;
  const t = game.players.find((p) => p.id === playerId)?.stats?.[field.id];
  return t !== undefined ? t : defaultValue(field);
}

export function statNumber(game: Game, session: Session, playerId: string, field: StatField): number {
  const v = statValue(game, session, playerId, field);
  return typeof v === 'number' ? v : Number(v) || 0;
}

function clampNum(field: StatField, n: number): number {
  if (field.min !== undefined) n = Math.max(field.min, n);
  if (field.max !== undefined) n = Math.min(field.max, n);
  return n;
}

/** The value a field keeps when set to `value` (a number within its min and max). */
export function clampStat(field: StatField, value: StatValue): StatValue {
  return field.type === 'number' ? clampNum(field, Number(value) || 0) : value;
}

export function setStat(session: Session, playerId: string, field: StatField, value: StatValue): void {
  const v = clampStat(field, value);
  // Assign first, then read back: with Svelte state proxies, `(x ??= {})[k] = v` would write into the raw object.
  session.stats ??= {};
  session.stats[playerId] ??= {};
  session.stats[playerId][field.id] = v;
}

/**
 * Add to a number stat (clamped to its min/max). One already past them (a shop's "Buy anyway" took it below its min,
 * a sale above its max) isn't pulled back by a change the other way: it moves by the change, just never further out.
 * Returns the change actually made.
 */
export function addStat(game: Game, session: Session, playerId: string, field: StatField, delta: number): number {
  const before = statNumber(game, session, playerId, field);
  if (field.type !== 'number') return 0;
  const lo = Math.min(field.min ?? -Infinity, before);
  const hi = Math.max(field.max ?? Infinity, before);
  const after = Math.min(hi, Math.max(lo, before + (Number(delta) || 0)));
  session.stats ??= {};
  session.stats[playerId] ??= {};
  session.stats[playerId][field.id] = after;
  return after - before;
}

/** How much a player's number stat can still go up before its max (Infinity with no max). */
export function statRoom(game: Game, session: Session, playerId: string, field: StatField): number {
  return field.max === undefined ? Infinity : Math.max(0, field.max - statNumber(game, session, playerId, field));
}

/** The currency stats (shops charge them). */
export function currencyFields(game: Game): StatField[] {
  return statFields(game).filter((f) => f.type === 'number' && f.currency);
}

export function formatStat(field: StatField, v: StatValue): string {
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'boolean') return v ? '✔' : '✘';
  if (field.type === 'number') return `${field.symbol ?? ''}${Number(v).toLocaleString()}${field.max !== undefined && field.display === 'bar' ? ` / ${field.max}` : ''}`;
  return String(v);
}

// ---------- Inventory ----------

export function itemDef(game: Game, id: string | null | undefined): ItemDef | undefined {
  return id ? game.items?.find((i) => i.id === id) : undefined;
}

export function entryName(game: Game, e: InventoryEntry): string {
  return itemDef(game, e.item)?.name ?? e.name ?? 'Mystery item';
}

export function inventory(session: Session, playerId: string): InventoryEntry[] {
  return session.inventories?.[playerId] ?? [];
}

function inv(session: Session, playerId: string): InventoryEntry[] {
  session.inventories ??= {};
  session.inventories[playerId] ??= [];
  return session.inventories[playerId];
}

/** Give a player `qty` of a catalog item (or a made-up one by name). Stackable items share one entry. */
/** The most of an item that doesn't stack given at once (each is its own entry: 20000 would take ages to show). */
export const MAX_UNSTACKED = 99;

/** A "How many" for an item as given: a whole number, at least 1, and at most MAX_UNSTACKED of one that doesn't stack. */
export function itemQty(game: Game, item: string | null | undefined, qty: number): number {
  const n = Math.max(1, Math.round(Number(qty) || 1));
  const def = itemDef(game, item);
  return def && !def.stackable ? Math.min(MAX_UNSTACKED, n) : n;
}

export function giveItem(game: Game, session: Session, playerId: string, item: string | null, qty = 1, name?: string): void {
  if (!(qty > 0)) return;
  qty = itemQty(game, item, qty);
  const list = inv(session, playerId);
  const def = itemDef(game, item);
  if (def?.stackable || (!def && !item)) {
    const have = list.find((e) => e.item === item && (item || e.name === name));
    if (have) {
      have.qty += qty;
      return;
    }
    list.push({ id: newId(), item, name: item ? undefined : name, qty });
    return;
  }
  for (let i = 0; i < qty; i++) list.push({ id: newId(), item, qty: 1 });
}

/** Take up to `qty` of an item from a player (one being worn last). Returns how many were taken. */
export function takeItem(session: Session, playerId: string, item: string | null, qty = 1, name?: string): number {
  const list = inv(session, playerId);
  let left = qty;
  // The copies not worn first, from the newest; the worn ones only when they're all that's left.
  const order = [...list].reverse().sort((a, b) => Number(!!a.equipped) - Number(!!b.equipped));
  const gone = new Set<(typeof list)[number]>();
  for (const e of order) {
    if (left <= 0) break;
    if (e.item !== item || (!item && e.name !== name)) continue;
    const n = Math.min(e.qty, left);
    e.qty -= n;
    left -= n;
    if (e.qty <= 0) gone.add(e);
  }
  for (let i = list.length - 1; i >= 0; i--) if (gone.has(list[i])) list.splice(i, 1);
  return qty - left;
}

/**
 * Move one inventory entry (or part of a stack) to another player. With the game, an item stacks with theirs as its
 * settings say (Stackable), as giveItem does; without it, as the stacks look.
 */
export function transferEntry(session: Session, from: string, to: string, entryId: string, qty?: number, game?: Game): void {
  const src = inv(session, from);
  const i = src.findIndex((e) => e.id === entryId);
  if (i < 0) return;
  const e = src[i];
  const n = Math.min(qty ?? e.qty, e.qty);
  const dest = inv(session, to);
  const same = dest.find((d) => d.item === e.item && (e.item || d.name === e.name) && !d.equipped);
  const stacks = !e.item || (game ? !!itemDef(game, e.item)?.stackable : e.qty > 1 || (same?.qty ?? 0) > 1);
  if (same && stacks) same.qty += n;
  else dest.push({ ...e, id: newId(), qty: n, equipped: false });
  e.qty -= n;
  if (e.qty <= 0) src.splice(i, 1);
}

// ---------- Shops ----------

/** Stock is kept per pool when shops share one, else per shop. */
function stockKey(shop: Shop): string {
  return shop.pool?.trim() ? `pool:${shop.pool.trim()}` : shop.id;
}

/**
 * How many of an item a shop has left (null = unlimited, 0 = sold out). Shops sharing a pool (`game` given) start from
 * the pool's stock: the first number any of them has for it (unlimited only when none has one), whichever is visited.
 */
export function stockLeft(session: Session, shop: Shop, itemId: string, game?: Game): number | null {
  const kept = session.stock?.[stockKey(shop)]?.[itemId];
  if (kept !== undefined) return kept;
  const entry = shop.stock.find((s) => s.item === itemId);
  if (!entry) return 0;
  const pool = shop.pool?.trim();
  if (pool && game) {
    const start = (game.shops ?? [])
      .filter((x) => x.pool?.trim() === pool)
      .map((x) => x.stock.find((e) => e.item === itemId)?.qty)
      .find((q): q is number => typeof q === 'number');
    if (start !== undefined) return start;
  }
  return entry.qty;
}

export function setStock(session: Session, shop: Shop, itemId: string, qty: number | null): void {
  const key = stockKey(shop);
  session.stock ??= {};
  session.stock[key] ??= {};
  session.stock[key][itemId] = qty;
}

export function shopPrice(game: Game, shop: Shop, itemId: string): number {
  return shop.stock.find((s) => s.item === itemId)?.price ?? itemDef(game, itemId)?.price ?? 0;
}

/**
 * A purchase: the currency goes down (it may go below 0 or the field's minimum only with `allowShort`), the item
 * is added and the stock goes down. Returns a line for the log, or an error message.
 */
/** A shop that charges the players' points instead of a currency stat. */
export const SCORE_CURRENCY = 'score';

/**
 * What a shop charges: its currency stat, or the players' points ('score'). A game with no currency stat charges
 * points.
 */
export function shopCurrency(game: Game, shop: Shop): StatField | 'score' {
  if (shop.currency === SCORE_CURRENCY) return 'score';
  // (A stat that's no longer a number can't be charged: as if it were gone.)
  return statFields(game).find((f) => f.id === shop.currency && f.type === 'number') ?? currencyFields(game)[0] ?? 'score';
}

/**
 * The shop charges a stat that was deleted since, or isn't a number any more (it then charges the first currency, or
 * points, until one is picked).
 */
export function shopCurrencyGone(game: Game, shop: Shop): boolean {
  return !!shop.currency && shop.currency !== SCORE_CURRENCY && !statFields(game).some((f) => f.id === shop.currency && f.type === 'number');
}

/** What's wrong with a number stat's Start, Min and Max ("Min is more than Max"), or null. */
export function statRangeProblem(f: StatField): string | null {
  if (f.type !== 'number') return null;
  if (f.min !== undefined && f.max !== undefined && f.min > f.max) return `Min (${f.min}) is more than Max (${f.max})`;
  const start = Number(f.start ?? 0);
  if (f.min !== undefined && start < f.min) return `Start (${start}) is below Min (${f.min}): players start at ${f.min}`;
  if (f.max !== undefined && start > f.max) return `Start (${start}) is above Max (${f.max}): players start at ${f.max}`;
  return null;
}

/** Checklist items for 📊 Stats & Items: stats whose range doesn't add up, shops that charge a deleted stat. */
export function statsProblems(game: Game): Problem[] {
  const out: Problem[] = [];
  for (const f of statFields(game)) {
    const why = statRangeProblem(f);
    if (why) out.push({ text: `Stat “${f.name}”: ${why}`, tab: 'stats', level: 'warn', place: { tab: 'stats', stat: f.id } });
  }
  for (const s of game.shops ?? [])
    if (shopCurrencyGone(game, s)) {
      const cur = shopCurrency(game, s);
      const now = cur === 'score' ? 'points' : cur.name;
      const was = statFields(game).find((f) => f.id === s.currency);
      const what = was ? `“${was.name}”, which isn't a number now` : 'a deleted stat';
      out.push({ text: `Shop “${s.name}” charged ${what} (it charges ${now} now): pick what it charges`, tab: 'stats', level: 'warn', place: { tab: 'stats', shop: s.id } });
    }
  return out;
}

/** A price or a balance in a shop's currency ("🪙12", "$300"). */
export function formatPrice(game: Game, shop: Shop, n: number): string {
  const cur = shopCurrency(game, shop);
  return cur === 'score' ? formatPoints(n, game.settings.currencySymbol) : formatStat(cur, n);
}

/** What a player has to spend in a shop. */
export function balance(game: Game, session: Session, shop: Shop, playerId: string): number {
  const cur = shopCurrency(game, shop);
  return cur === 'score' ? score(session, playerId) : statNumber(game, session, playerId, cur);
}

/** Pay (or, negative, get paid) in a shop's currency. Points go in the score log. */
function pay(game: Game, session: Session, shop: Shop, playerId: string, amount: number, reason: string): void {
  if (!amount) return;
  const cur = shopCurrency(game, shop);
  if (cur === 'score') applyScore(session, game, [playerId], -amount, reason, undefined, true);
  else {
    // Buying anyway may go below the field's minimum: set it directly.
    session.stats ??= {};
    session.stats[playerId] ??= {};
    session.stats[playerId][cur.id] = statNumber(game, session, playerId, cur) - amount;
  }
}

/**
 * A purchase: the currency (or points) goes down (below 0 only with `allowShort`), the item is added and the stock
 * goes down. Returns a line for the log, or an error message.
 */
export function buy(
  game: Game,
  session: Session,
  shop: Shop,
  playerId: string,
  itemId: string,
  { price, allowShort = false }: { price?: number; allowShort?: boolean } = {},
): { ok: true; text: string } | { ok: false; error: string } {
  const cost = price ?? shopPrice(game, shop, itemId);
  const left = stockLeft(session, shop, itemId, game);
  if (left !== null && left <= 0) return { ok: false, error: 'Sold out' };
  const name = itemDef(game, itemId)?.name ?? 'an item';
  if (cost) {
    const have = balance(game, session, shop, playerId);
    if (have < cost && !allowShort) return { ok: false, error: `Short by ${formatPrice(game, shop, cost - have)}` };
    pay(game, session, shop, playerId, cost, `Bought ${name} (${shop.name})`);
  }
  giveItem(game, session, playerId, itemId, 1);
  if (left !== null) setStock(session, shop, itemId, left - 1);
  const who = session.players.find((p) => p.id === playerId)?.name ?? 'Someone';
  return { ok: true, text: `${who} bought ${name}${cost ? ` for ${formatPrice(game, shop, cost)}` : ''}` };
}

/**
 * What a shop pays for an item it buys back (null = it doesn't): not things made up mid-show, secret items or ones
 * with no price.
 */
export function sellPrice(game: Game, shop: Shop, itemId: string | null): number | null {
  if (!shop.buysBack || !itemId) return null;
  const price = shopPrice(game, shop, itemId);
  if (!price || itemDef(game, itemId)?.secret) return null;
  return Math.floor(price * shop.buysBack.rate);
}

/** A player sells one of an inventory entry back to a shop: they get paid, the shop's stock goes up. */
export function sell(game: Game, session: Session, shop: Shop, playerId: string, entryId: string): { ok: true; text: string } | { ok: false; error: string } {
  const e = inventory(session, playerId).find((x) => x.id === entryId);
  if (!e) return { ok: false, error: 'They don’t have that any more' };
  const price = sellPrice(game, shop, e.item);
  if (price === null) return { ok: false, error: shop.buysBack ? `${shop.name} doesn’t buy ${entryName(game, e)}` : `${shop.name} doesn’t buy things back` };
  // That very one (not another of the same item, which may be the one they wear).
  const list = inv(session, playerId);
  e.qty -= 1;
  if (e.qty <= 0) list.splice(list.indexOf(e), 1);
  if (price) pay(game, session, shop, playerId, -price, `Sold ${entryName(game, e)} (${shop.name})`);
  const left = stockLeft(session, shop, e.item!, game);
  if (left !== null && shop.stock.some((x) => x.item === e.item)) setStock(session, shop, e.item!, left + 1);
  const who = session.players.find((p) => p.id === playerId)?.name ?? 'Someone';
  return { ok: true, text: `${who} sold ${entryName(game, e)}${price ? ` for ${formatPrice(game, shop, price)}` : ''}` };
}

// ---------- Action log (undo for everything that isn't score) ----------

/** The parts of a session the action log can put back. */
const PARTS = ['stats', 'inventories', 'worlds', 'boardgames', 'stock'] as const;

/** The host's own choices a step can put back as they were: the picker, how a tie for first was settled, the players. */
const HOST = ['currentPickerId', 'coWinners', 'rollOffWinner', 'tiebreakClue', 'players', 'removedPlayers'] as const;

/** Every Final round's state (the one being played, and the ones put away), one per round. */
function finalStates(session: Session): FinalState[] {
  const all = [session.final, ...Object.values(session.finals ?? {}).map((s) => s.state)];
  return all.filter((f, i): f is FinalState => !!f?.roundId && all.findIndex((x) => x?.roundId === f.roundId) === i);
}

/**
 * What a step can change, part by part as JSON: the session's parts and the host's choices, and with `game` each map
 * and screen of the game being played (improvising changes those: a new screen, a new look, renaming an object on a
 * screen). Tiles go one by one: closing a clue marks its tile played outside any step, so a step only puts back the
 * tiles it changed itself. A Final keeps who plays, the reveal order and the wagers (its results follow the score log).
 */
function capture(session: Session, game?: Game): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of PARTS) out[k] = JSON.stringify(session[k] ?? {});
  for (const k of HOST) out[k] = JSON.stringify(session[k] ?? null);
  for (const id in session.used) out[`used:${id}`] = 'true';
  for (const f of finalStates(session))
    out[`final:${f.roundId}`] = JSON.stringify({ players: f.players, order: f.order, wagers: f.wagers, chosen: f.chosen ?? {}, wagerFrom: f.wagerFrom ?? {}, wagerBy: f.wagerBy ?? {} });
  // The Final being played: its step (each step on from the wagers is an undoable step, so Undo goes back one).
  if (session.phase === 'final' && session.final?.roundId) out[`step:${session.final.roundId}`] = JSON.stringify(session.finalStep ?? null);
  for (const w of game?.worlds ?? [])
    for (const m of w.maps) {
      out[`map:${w.id}/${m.id}`] = JSON.stringify({ cols: m.cols, rows: m.rows });
      for (const s of m.screens) out[`screen:${w.id}/${m.id}/${s.id}`] = JSON.stringify(s);
    }
  // Board-game boards edited during play (✎ Edit board): their spaces and Start.
  for (const r of game?.rounds ?? []) if (r.mode === 'boardgame') out[`board:${r.id}`] = JSON.stringify({ spaces: r.spaces, start: r.start ?? null });
  return out;
}

/** Some parts as one JSON object (null: the part isn't there, like a screen added later). */
const partsOf = (parts: Record<string, string>, keys: string[]) => `{${keys.map((k) => `${JSON.stringify(k)}:${parts[k] ?? 'null'}`).join(',')}}`;

/** What viewers are shown, switched outside any step (the map on screen, split view, a zone on screen): Undo and Redo leave it as it is. */
const SHOWN: Record<string, string[]> = { worlds: ['mapShown', 'split'], boardgames: ['zoneShown'] };

function restore(session: Session, json: string, game?: Game): void {
  const followed = Object.fromEntries(Object.entries(session.worlds ?? {}).map(([id, st]) => [id, st.active]));
  const partiesWere = Object.fromEntries(Object.entries(session.worlds ?? {}).map(([id, st]) => [id, st.parties.map((p) => p.id).join()]));
  // Older saves kept the whole score log here too: it's left alone (a step's own points are in its `score`).
  for (const [k, v] of Object.entries(JSON.parse(json))) {
    if ((PARTS as readonly string[]).includes(k)) {
      const part = (v ?? {}) as Record<string, Record<string, unknown>>;
      const now = session[k as (typeof PARTS)[number]] as Record<string, Record<string, unknown>> | undefined;
      for (const f of SHOWN[k] ?? []) for (const id in part) if (now?.[id]) part[id][f] = now[id][f];
      Object.assign(session, { [k]: part });
    } else if ((HOST as readonly string[]).includes(k)) Object.assign(session, { [k]: v ?? undefined });
    else if (k.startsWith('used:')) putTile(session, k.slice(5), !!v);
    else if (k.startsWith('final:')) putFinal(session, k.slice(6), v as Pick<FinalState, 'players' | 'order' | 'wagers' | 'wagerFrom' | 'wagerBy'> | null);
    else if (k.startsWith('step:')) putStep(session, k.slice(5), v as Session['finalStep'] | null);
    else if (k.startsWith('map:') || k.startsWith('screen:')) putBack(game, k, v as WorldMap | Screen | null);
    else if (k.startsWith('board:')) putBoard(game, k.slice(6), v as { spaces: BoardSpace[]; start: string | null } | null);
  }
  // Viewers keep following the party they were (switched outside any step) while it's still there, and with one party
  // left there's no split view.
  // A step that merged or split parties switched the follow itself: undoing (or redoing) it switches it back too.
  for (const [id, st] of Object.entries(session.worlds ?? {})) {
    const sameParties = st.parties.map((p) => p.id).join() === partiesWere[id];
    const ownsFollow = !sameParties && st.parties.some((p) => p.id === st.active);
    if (!ownsFollow && st.parties.some((p) => p.id === followed[id])) st.active = followed[id];
    if (st.parties.length < 2) st.split = false;
  }
}

/** Mark a tile played again, or put it back on the board. */
function putTile(session: Session, clueId: string, used: boolean): void {
  if (used) session.used[clueId] = true;
  else {
    delete session.used[clueId];
    if (session.lastClosed === clueId) session.lastClosed = null;
  }
}

/** Put back who plays a Final, its reveal order and its wagers. The spotlight moves on if its player is out. */
function putFinal(session: Session, roundId: string, v: Pick<FinalState, 'players' | 'order' | 'wagers' | 'chosen' | 'wagerFrom' | 'wagerBy'> | null): void {
  if (!v) return;
  for (const f of [session.final, ...Object.values(session.finals ?? {}).map((s) => s.state)]) {
    if (f?.roundId !== roundId) continue;
    Object.assign(f, { players: v.players, order: v.order, wagers: v.wagers });
    // (Steps from before the host's ticks were kept have none; nor do those from before phones sent wagers.)
    if (v.chosen) f.chosen = Object.keys(v.chosen).length ? v.chosen : undefined;
    if (v.wagerFrom) f.wagerFrom = Object.keys(v.wagerFrom).length ? v.wagerFrom : undefined;
    if (v.wagerBy) f.wagerBy = Object.keys(v.wagerBy).length ? v.wagerBy : undefined;
    if (f.current && !f.order.includes(f.current)) f.current = f.order.find((id) => !f.results[id]);
  }
}

/** Put a Final's step back: the one being played at once, one put away for when it's played again. */
function putStep(session: Session, roundId: string, step: Session['finalStep'] | null): void {
  if (!step) return;
  if (session.phase === 'final' && session.final?.roundId === roundId) session.finalStep = step;
  else if (session.finals?.[roundId]) session.finals[roundId].step = step;
}

/** Put a map's size or a screen back into the game being played (a screen that wasn't there is taken out). */
function putBack(game: Game | undefined, key: string, v: Pick<WorldMap, 'cols' | 'rows'> | Screen | null): void {
  const [worldId, mapId, screenId] = key.slice(key.indexOf(':') + 1).split('/');
  const map = game?.worlds?.find((w) => w.id === worldId)?.maps.find((m) => m.id === mapId);
  if (!map) return;
  if (!screenId) return void Object.assign(map, v);
  const i = map.screens.findIndex((s) => s.id === screenId);
  if (v && i >= 0) map.screens[i] = v as Screen;
  else if (v) map.screens.push(v as Screen);
  else if (i >= 0) map.screens.splice(i, 1);
}

/** A board-game board as it was (its spaces and Start). */
function putBoard(game: Game | undefined, roundId: string, v: { spaces: BoardSpace[]; start: string | null } | null): void {
  const r = game?.rounds.find((x) => x.id === roundId);
  if (!v || r?.mode !== 'boardgame') return;
  r.spaces = v.spaces;
  r.start = v.start ?? undefined;
}

/** Only the newest steps keep their snapshots (a long show must not grow without bound). */
const LOG_LIMIT = 300;

/** Steps under way: a step inside a step (an item's "Use" running its actions) is part of the outer one. */
let depth = 0;

/**
 * Run `change` as one undoable step called `text`. Pass the game being played when the step changes its screens
 * (improvising), so the undo puts them back too.
 */
export function logged(session: Session, text: string, change: () => void, game?: Game): void {
  if (depth) return change();
  const done = startStep(session, game);
  depth++;
  try {
    change();
  } finally {
    depth--;
  }
  done(text);
}

/**
 * Start a step that takes a while (the live screen editor): everything changed until `done(text)` is one undoable
 * step. Nothing is logged if nothing changed. Only the parts that changed are kept.
 */
export function startStep(session: Session, game?: Game): (text: string) => void {
  const before = capture(session, game);
  const scored = session.scoreLog.length;
  return (text) => {
    const now = capture(session, game);
    const keys = [...new Set([...Object.keys(before), ...Object.keys(now)])].filter((k) => before[k] !== now[k]);
    // Points spent or earned inside the step (a purchase in a shop that charges points) undo with it.
    const score = session.scoreLog.slice(scored).map((e) => ({ ...e }));
    if (!keys.length && !score.length) return;
    session.actionLog ??= [];
    session.actionLog.push({ id: newId(), ts: Date.now(), text, round: session.currentRound, before: partsOf(before, keys), ...(score.length ? { score } : {}) });
    if (session.actionLog.length > LOG_LIMIT) session.actionLog.splice(0, session.actionLog.length - LOG_LIMIT);
    session.actionRedo = [];
  };
}

/** The newest step (with `round`: only if it was taken in that round, as "Last:" shows it). */
export function lastAction(session: Session, round?: number): ActionEvent | undefined {
  const e = session.actionLog?.at(-1);
  return round === undefined || e?.round === round ? e : undefined;
}

/** Undo the newest step. Pass the game being played, so screens changed while improvising are put back too. */
export function undoAction(session: Session, game?: Game): ActionEvent | null {
  const e = session.actionLog?.pop();
  if (!e) return null;
  const after = partsOf(capture(session, game), Object.keys(JSON.parse(e.before)));
  restore(session, e.before, game);
  // Its points come off the score log (as they are now, for a redo).
  const ids = new Set(e.score?.map((x) => x.id));
  const score = session.scoreLog.filter((x) => ids.has(x.id)).map((x) => ({ ...x }));
  if (ids.size) {
    session.scoreLog = session.scoreLog.filter((x) => !ids.has(x.id));
    session.redoStack = session.redoStack.filter((id) => !ids.has(id));
  }
  session.actionRedo ??= [];
  session.actionRedo.push({ ...e, after, score: score.length ? score : undefined });
  return e;
}

export function redoAction(session: Session, game?: Game): ActionEvent | null {
  const e = session.actionRedo?.pop();
  if (!e?.after) return null;
  const before = partsOf(capture(session, game), Object.keys(JSON.parse(e.after)));
  restore(session, e.after, game);
  if (e.score?.length) session.scoreLog.push(...e.score.map((x) => ({ ...x })));
  session.actionLog ??= [];
  session.actionLog.push({ ...e, before, after: undefined });
  return e;
}

/** What one Undo in play (Ctrl+Z: a score change or a step, whichever came last) took back, by its step id. */
export interface Undone {
  log: 'score' | 'action';
  id: string;
}

/**
 * Which log the next Redo in play takes from, going back the way the Undos went (`undone`, newest last): it's taken
 * off `undone`, with any newer ones that can't be redone any more (a new change since, the score log's own Undo or
 * Restore). With nothing to go by (after a reload), the action log goes first.
 */
export function redoFrom(session: Session, undone: Undone[]): 'score' | 'action' | undefined {
  const top = session.scoreLog.find((x) => x.id === session.redoStack.at(-1));
  for (let u = undone.pop(); u; u = undone.pop()) {
    if (u.log === 'action' ? session.actionRedo?.at(-1)?.id === u.id : !!top && stepOf(top) === u.id) return u.log;
  }
  return session.actionRedo?.length ? 'action' : session.redoStack.length ? 'score' : undefined;
}

/** What going on from each of the Final's steps is called in the history (the steps that are undoable). */
const FINAL_STEPS: Partial<Record<NonNullable<Session['finalStep']>, string>> = {
  wagers: 'Wagers locked, question shown',
  question: 'Final answer shown',
  answer: 'Player reveals started',
};

/**
 * The Final's next step. Going on from the wagers to the question, the question to the answer and the answer to the
 * reveals are undoable steps: each Ctrl+Z goes back one (to the wagers as they were, not into them, so a wager is never
 * lost once the question is up).
 */
export function finalNextStep(session: Session, game: Game): void {
  // Nobody plays: the wager screen goes straight on to the next round (not a step, like any round change).
  const skip = session.finalStep === 'wagers' && !session.final?.players.length;
  const text = session.phase === 'final' && session.finalStep && !skip ? FINAL_STEPS[session.finalStep] : undefined;
  if (text) logged(session, text, () => finalNext(session, game));
  else finalNext(session, game);
}

/** Show or hide the answer (R): in a Final, as a step (Ctrl+Z hides or shows it again). */
export function revealStep(session: Session): void {
  if (session.phase !== 'final') return toggleReveal(session);
  logged(session, answerShowing(session) ? 'Final answer hidden' : 'Final answer shown', () => toggleReveal(session));
}

/** Make a player the one who picks the next clue (undefined: nobody), as a step. `how` goes after it: " (roll-off)". */
export function setPicker(session: Session, playerId: string | undefined, how = ''): void {
  if (session.currentPickerId === playerId) return;
  const who = session.players.find((p) => p.id === playerId)?.name;
  logged(session, who ? `${who} picks next${how}` : 'No picker', () => (session.currentPickerId = playerId));
}

// ---------- Worn items ----------

/** Where each slot's items go on the avatar by default (avatar sizes from its center). */
export const SLOT_PLACE: Record<Wearable['slot'], { x: number; y: number; w: number }> = {
  head: { x: 0, y: -0.52, w: 0.7 },
  hand: { x: 0.55, y: 0.2, w: 0.45 },
  body: { x: 0, y: 0.38, w: 0.8 },
  badge: { x: 0.42, y: -0.38, w: 0.3 },
};

/** A worn item's placement, with the slot's defaults filled in. */
export function wornPlace(w: Wearable): { x: number; y: number; w: number; rotate: number; behind: boolean } {
  const d = SLOT_PLACE[w.slot];
  return { x: w.x ?? d.x, y: w.y ?? d.y, w: w.w ?? d.w, rotate: w.rotate ?? 0, behind: !!w.behind };
}

/** The worn items a player has equipped (their catalog entries). */
export function wornItems(game: Game, session: Session, playerId: string): ItemDef[] {
  return inventory(session, playerId)
    .filter((e) => e.equipped)
    .map((e) => itemDef(game, e.item))
    .filter((d): d is ItemDef => !!d?.wearable);
}

