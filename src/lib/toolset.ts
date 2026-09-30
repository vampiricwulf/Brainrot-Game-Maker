// The shared toolset every game mode can use (games-maker spec §5.1): player stats, inventories, shops and the
// action log that makes all of it undoable. Pure functions over Game + Session, like session.ts.
import { applyScore, score } from './session';
import { formatPoints, newId, type ActionEvent, type Game, type InventoryEntry, type ItemDef, type Session, type Shop, type StatField, type StatValue, type Wearable } from './model';

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
  { label: '🪙 Gold (currency)', make: () => ({ ...newStatField('Gold'), start: 0, min: 0, currency: true, symbol: '🪙', color: '#ffcc00' }) },
  { label: '💪 Power', make: () => ({ ...newStatField('Power'), start: 1 }) },
  { label: '🏷 Status (tags)', make: () => ({ ...newStatField('Status', 'tags'), audience: 'hud' }) },
  { label: '📝 Class (text)', make: () => ({ ...newStatField('Class', 'text'), audience: 'sheet' }) },
];

function defaultValue(f: StatField): StatValue {
  if (f.start !== undefined) return Array.isArray(f.start) ? [...f.start] : f.start;
  return f.type === 'number' ? 0 : f.type === 'checkbox' ? false : f.type === 'tags' ? [] : '';
}

/** A player's value for a field: set during the game, else their Setup value, else the field's start. */
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

export function setStat(session: Session, playerId: string, field: StatField, value: StatValue): void {
  const v = field.type === 'number' ? clampNum(field, Number(value) || 0) : value;
  // Assign first, then read back: with Svelte state proxies, `(x ??= {})[k] = v` would write into the raw object.
  session.stats ??= {};
  session.stats[playerId] ??= {};
  session.stats[playerId][field.id] = v;
}

/** Add to a number stat (clamped to its min/max). Returns the change actually made. */
export function addStat(game: Game, session: Session, playerId: string, field: StatField, delta: number): number {
  const before = statNumber(game, session, playerId, field);
  setStat(session, playerId, field, before + delta);
  return statNumber(game, session, playerId, field) - before;
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
export function giveItem(game: Game, session: Session, playerId: string, item: string | null, qty = 1, name?: string): void {
  if (qty <= 0) return;
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

/** Take up to `qty` of an item from a player. Returns how many were taken. */
export function takeItem(session: Session, playerId: string, item: string | null, qty = 1, name?: string): number {
  const list = inv(session, playerId);
  let left = qty;
  for (let i = list.length - 1; i >= 0 && left > 0; i--) {
    const e = list[i];
    if (e.item !== item || (!item && e.name !== name)) continue;
    const n = Math.min(e.qty, left);
    e.qty -= n;
    left -= n;
    if (e.qty <= 0) list.splice(i, 1);
  }
  return qty - left;
}

export function countItem(session: Session, playerId: string, item: string): number {
  return inventory(session, playerId)
    .filter((e) => e.item === item)
    .reduce((n, e) => n + e.qty, 0);
}

/** Move one inventory entry (or part of a stack) to another player. */
export function transferEntry(session: Session, from: string, to: string, entryId: string, qty?: number): void {
  const src = inv(session, from);
  const i = src.findIndex((e) => e.id === entryId);
  if (i < 0) return;
  const e = src[i];
  const n = Math.min(qty ?? e.qty, e.qty);
  const dest = inv(session, to);
  const same = dest.find((d) => d.item === e.item && (e.item || d.name === e.name) && !d.equipped);
  if (same && (e.qty > 1 || same.qty > 1 || !e.item)) same.qty += n;
  else dest.push({ ...e, id: newId(), qty: n, equipped: false });
  e.qty -= n;
  if (e.qty <= 0) src.splice(i, 1);
}

// ---------- Shops ----------

/** Stock is kept per pool when shops share one, else per shop. */
function stockKey(shop: Shop): string {
  return shop.pool?.trim() ? `pool:${shop.pool.trim()}` : shop.id;
}

/** How many of an item a shop has left (null = unlimited, 0 = sold out). */
export function stockLeft(session: Session, shop: Shop, itemId: string): number | null {
  const kept = session.stock?.[stockKey(shop)]?.[itemId];
  if (kept !== undefined) return kept;
  const entry = shop.stock.find((s) => s.item === itemId);
  return entry ? entry.qty : 0;
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
  return statFields(game).find((f) => f.id === shop.currency) ?? currencyFields(game)[0] ?? 'score';
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
  const left = stockLeft(session, shop, itemId);
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

/** What a shop pays for an item it buys back (null = it doesn't). */
export function sellPrice(game: Game, shop: Shop, itemId: string | null): number | null {
  if (!shop.buysBack || !itemId) return null;
  return Math.floor(shopPrice(game, shop, itemId) * shop.buysBack.rate);
}

/** A player sells one of an inventory entry back to a shop: they get paid, the shop's stock goes up. */
export function sell(game: Game, session: Session, shop: Shop, playerId: string, entryId: string): { ok: true; text: string } | { ok: false; error: string } {
  const e = inventory(session, playerId).find((x) => x.id === entryId);
  if (!e) return { ok: false, error: 'They don’t have that any more' };
  const price = sellPrice(game, shop, e.item);
  if (price === null) return { ok: false, error: `${shop.name} doesn’t buy things back` };
  takeItem(session, playerId, e.item, 1);
  if (price) pay(game, session, shop, playerId, -price, `Sold ${entryName(game, e)} (${shop.name})`);
  const left = stockLeft(session, shop, e.item!);
  if (left !== null && shop.stock.some((x) => x.item === e.item)) setStock(session, shop, e.item!, left + 1);
  const who = session.players.find((p) => p.id === playerId)?.name ?? 'Someone';
  return { ok: true, text: `${who} sold ${entryName(game, e)}${price ? ` for ${formatPrice(game, shop, price)}` : ''}` };
}

// ---------- Action log (undo for everything that isn't score) ----------

/** The part of a session the action log can put back. */
function rpgState(session: Session): string {
  return JSON.stringify({
    stats: session.stats ?? {},
    inventories: session.inventories ?? {},
    worlds: session.worlds ?? {},
    boardgames: session.boardgames ?? {},
    stock: session.stock ?? {},
    // Points spent or earned inside a step (a purchase in a shop that charges points) undo with it.
    scoreLog: session.scoreLog,
    redoStack: session.redoStack,
  });
}

function restore(session: Session, json: string): void {
  const s = JSON.parse(json);
  session.stats = s.stats;
  session.inventories = s.inventories;
  session.worlds = s.worlds;
  session.boardgames = s.boardgames ?? {};
  if (s.scoreLog) session.scoreLog = s.scoreLog;
  if (s.redoStack) session.redoStack = s.redoStack;
  session.stock = s.stock;
}

/** Only the newest steps keep their snapshots (a long show must not grow without bound). */
const LOG_LIMIT = 300;

/** Run `change` as one undoable step called `text`. */
export function logged(session: Session, text: string, change: () => void): void {
  const before = rpgState(session);
  change();
  if (rpgState(session) === before) return;
  session.actionLog ??= [];
  session.actionLog.push({ id: newId(), ts: Date.now(), text, before });
  if (session.actionLog.length > LOG_LIMIT) session.actionLog.splice(0, session.actionLog.length - LOG_LIMIT);
  session.actionRedo = [];
}

export function lastAction(session: Session): ActionEvent | undefined {
  return session.actionLog?.at(-1);
}

export function undoAction(session: Session): ActionEvent | null {
  const e = session.actionLog?.pop();
  if (!e) return null;
  const after = rpgState(session);
  restore(session, e.before);
  session.actionRedo ??= [];
  session.actionRedo.push({ ...e, after });
  return e;
}

export function redoAction(session: Session): ActionEvent | null {
  const e = session.actionRedo?.pop();
  if (!e?.after) return null;
  const before = rpgState(session);
  restore(session, e.after);
  session.actionLog ??= [];
  session.actionLog.push({ ...e, before, after: undefined });
  return e;
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

