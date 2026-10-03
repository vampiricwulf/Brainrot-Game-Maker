// Host actions that open / drive the tool overlays (wheel, dice, roll-off, scoreboard).
import { categoryLabel, isBoard, newId, PLAYER_WHEEL, type DicePreset, type Game, type Session, type WheelPreset, type WheelSegment } from './model';
import type { ExtraWheel, Live } from './live';
import {
  activeSegments, describeRoll, logRoll, newSegment, onSlices, planRollOff, rollPreset, sliceLabel, spinTarget, weightedIndex, wheelUsedUp,
  type PoolSlice,
} from './tools';
import { templateSegments, type WheelTemplate } from './wheeltemplates';

type WheelOverlay = Extract<NonNullable<Live['overlay']>, { kind: 'wheel' }>;
/** The main wheel on screen, or one spun together with it: both can be edited for the spin. */
export type WheelLike = WheelOverlay | ExtraWheel;
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export function openWheel(live: Live, session: Session, wheel: WheelPreset): void {
  live.overlay = {
    kind: 'wheel',
    nonce: newId(),
    name: wheel.name,
    wheelId: wheel.id,
    segments: JSON.parse(JSON.stringify(activeSegments(session, wheel))),
    rotation: 0,
    spin: null,
    result: null,
  };
}

/** One slice per player, in their colors. */
function playerSegments(session: Session): WheelSegment[] {
  return session.players.map((p) => ({ id: p.id, label: p.name, color: p.color, weight: 1 }));
}

/** The built-in "Pick a player" wheel: lands on one of the current players. */
export function openPlayerWheel(live: Live, session: Session): void {
  live.overlay = {
    kind: 'wheel',
    nonce: newId(),
    name: 'Pick a player',
    players: true,
    segments: playerSegments(session),
    rotation: 0,
    spin: null,
    result: null,
  };
}

/** A throwaway wheel from a plain list of options (with optional weights). */
export function openQuickWheel(live: Live, options: { label: string; weight?: number }[]): void {
  live.overlay = {
    kind: 'wheel',
    nonce: newId(),
    name: 'Quick wheel',
    segments: options.map((o, i) => ({ ...newSegment(o.label, i), weight: o.weight ?? 1 })),
    rotation: 0,
    spin: null,
    result: null,
  };
}

/** The categories of the board being played that still have a clue to play (named; a blank title is "Category N"). */
export function openCategories(game: Game, session: Session): { id: string; label: string; index: number }[] {
  const round = game.rounds[session.currentRound];
  if (!round || !isBoard(round)) return [];
  return round.categories.flatMap((c, i) =>
    c.clues.some((cl) => !cl.empty && !session.used[cl.id]) ? [{ id: c.id, label: c.title.trim() ? categoryLabel(c) : `Category ${i + 1}`, index: i }] : [],
  );
}

/** The built-in "Pick a category" wheel: one slice per category on the board with clues left (colors kept by column). */
export function openCategoryWheel(live: Live, game: Game, session: Session): void {
  live.overlay = {
    kind: 'wheel',
    nonce: newId(),
    name: 'Pick a category',
    segments: openCategories(game, session).map((c) => ({ ...newSegment(c.label, c.index), id: c.id })),
    rotation: 0,
    spin: null,
    result: null,
  };
}

/** A ready-made wheel (wheeltemplates.ts), spun as it is: ✎ Edit wheel's Save as keeps it in the game. */
export function openTemplateWheel(live: Live, t: WheelTemplate, sym: string): void {
  live.overlay = { kind: 'wheel', nonce: newId(), name: t.name, segments: templateSegments(t, sym), rotation: 0, spin: null, result: null };
}

/** Players added, renamed or removed since the edit: they keep their on/off and chance. */
function mergePlayers(pool: PoolSlice[], session: Session): PoolSlice[] {
  return playerSegments(session).map((p) => {
    const was = pool.find((s) => s.id === p.id);
    return was ? { ...p, weight: was.weight, off: was.off } : p;
  });
}

/** What the host's edit box starts from: this run's edits, else the wheel as it would spin now. */
export function wheelPool(o: WheelLike, session: Session, game: Game): PoolSlice[] {
  if (o.pool) return copy(o.players ? mergePlayers(o.pool, session) : o.pool);
  if (o.players) return playerSegments(session);
  const preset = o.wheelId ? game.wheels.find((w) => w.id === o.wheelId) : undefined;
  if (!preset) return copy(o.segments);
  // Slices already used ("remove after landing") start switched off.
  const active = new Set(activeSegments(session, preset).map((s) => s.id));
  return copy(preset.segments).map((s) => (active.has(s.id) ? s : { ...s, off: true }));
}

/** Change this run of the wheel only (the saved wheel stays as it is). Clears the last result. */
export function editWheel(o: WheelLike, pool: PoolSlice[]): void {
  if (!o.players && !o.wheelId && !o.pool) o.base = copy(o.segments);
  o.pool = copy(pool);
  o.segments = onSlices(pool);
  o.spin = null;
  o.result = null;
  if ('kind' in o) o.tagged = undefined;
}

/** Back to the wheel as it was opened (players and saved wheels follow their current state). */
export function resetWheelEdits(o: WheelLike, session: Session, game: Game): void {
  o.pool = undefined;
  const preset = o.wheelId ? game.wheels.find((w) => w.id === o.wheelId) : undefined;
  if (o.players) o.segments = playerSegments(session);
  else if (preset) o.segments = copy(activeSegments(session, preset));
  else if (o.base) o.segments = copy(o.base);
  o.spin = null;
  o.result = null;
  if ('kind' in o) o.tagged = undefined;
}

/**
 * The slices a wheel spins with now: this run's edits (players added or removed since still count), else the saved
 * wheel as it stands (used slices out), else the current players.
 */
function spinSegments(o: WheelLike, session: Session, game: Game): WheelSegment[] {
  const preset = o.wheelId ? game.wheels.find((w) => w.id === o.wheelId) : undefined;
  if (o.pool) {
    if (o.players) o.pool = mergePlayers(o.pool, session);
    let segs = onSlices(o.pool);
    if (preset?.removeAfterLanding) {
      const removed = new Set(session.removedSegments?.[preset.id] ?? []);
      const left = segs.filter((s) => !removed.has(s.id));
      if (left.length) segs = left;
    }
    return segs;
  }
  if (preset) return copy(activeSegments(session, preset));
  if (o.players) return playerSegments(session);
  return o.segments;
}

/**
 * A "land once" wheel on screen whose every slice (of this run's edits, else of the saved wheel) has landed: it
 * doesn't spin (it would start over without a word) until the host restores them.
 */
export function wheelSpentUp(o: WheelLike, session: Session, game: Game): boolean {
  const preset = o.wheelId ? game.wheels.find((w) => w.id === o.wheelId) : undefined;
  if (!preset) return false;
  return wheelUsedUp(session, preset, o.pool ? onSlices(o.pool).map((s) => s.id) : undefined);
}

/** Add another wheel to spin together with the one on screen (a saved wheel, or the player wheel). */
export function addWheel(live: Live, session: Session, game: Game, wheelId: string): void {
  const o = live.overlay;
  if (!o || o.kind !== 'wheel') return;
  const preset = game.wheels.find((w) => w.id === wheelId);
  const players = wheelId === PLAYER_WHEEL;
  if (!preset && !players) return;
  const w: ExtraWheel = {
    key: newId(),
    name: preset?.name ?? 'Pick a player',
    wheelId: preset?.id,
    players: players || undefined,
    segments: preset ? copy(activeSegments(session, preset)) : playerSegments(session),
    rotation: 0,
    spin: null,
    result: null,
  };
  o.extra = [...(o.extra ?? []), w];
}

export function removeWheel(live: Live, key: string): void {
  const o = live.overlay;
  if (o?.kind !== 'wheel') return;
  o.extra = (o.extra ?? []).filter((w) => w.key !== key);
  if (!o.extra.length) o.extra = undefined;
}

/** Spin one extra wheel (no per-run edits: those are for the main wheel). */
function spinExtra(w: ExtraWheel, session: Session, game: Game, startedAt: number): void {
  // Every slice of a "land once" wheel has landed: it stays put (as the main wheel does), not starting over.
  if (wheelSpentUp(w, session, game)) return;
  const preset = w.wheelId ? game.wheels.find((x) => x.id === w.wheelId) : undefined;
  w.segments = spinSegments(w, session, game);
  if (!w.segments.length) return;
  const index = weightedIndex(w.segments.map((s) => s.weight));
  const from = w.rotation;
  const to = spinTarget(w.segments, index, from);
  // A little later than the others each, so they land one after another.
  w.spin = { from, to, startedAt, duration: preset?.spinDurationMs ?? 5000 };
  w.rotation = to;
  w.result = index;
  const seg = w.segments[index];
  logRoll(session, 'wheel', w.name, sliceLabel(seg, index), w.players ? [seg.id] : undefined);
  if (preset?.removeAfterLanding) {
    session.removedSegments ??= {};
    session.removedSegments[preset.id] ??= [];
    const list = session.removedSegments[preset.id];
    if (!list.includes(seg.id)) list.push(seg.id);
  }
}

export function spinWheel(live: Live, session: Session, game: Game): void {
  const o = live.overlay;
  if (!o || o.kind !== 'wheel') return;
  const preset = o.wheelId ? game.wheels.find((w) => w.id === o.wheelId) : undefined;
  if (wheelSpentUp(o, session, game)) return;
  o.segments = spinSegments(o, session, game);
  if (!o.segments.length) return spinExtras(o, session, game);
  const index = weightedIndex(o.segments.map((s) => s.weight));
  const from = o.rotation;
  const to = spinTarget(o.segments, index, from);
  const duration = preset?.spinDurationMs ?? 5000;
  o.spin = { from, to, startedAt: Date.now(), duration };
  o.rotation = to;
  o.result = index;
  const seg = o.segments[index];
  // The player wheel's result is a player: the roll log says who it was for.
  o.tagged = o.players ? [seg.id] : undefined;
  logRoll(session, 'wheel', o.name, sliceLabel(seg, index), o.players ? [seg.id] : undefined);
  if (preset?.removeAfterLanding) {
    session.removedSegments ??= {};
    session.removedSegments[preset.id] ??= [];
    const list = session.removedSegments[preset.id];
    if (!list.includes(seg.id)) list.push(seg.id);
  }
  spinExtras(o, session, game);
}

/** The wheels spun together with the main one, each starting a moment after the last. */
function spinExtras(o: WheelOverlay, session: Session, game: Game): void {
  (o.extra ?? []).forEach((w, i) => spinExtra(w, session, game, Date.now() + (i + 1) * 400));
}

/** Show dice waiting to be rolled (used by dice clues so the host decides when). */
export function openDice(live: Live, preset: DicePreset): void {
  const p = JSON.parse(JSON.stringify(preset)) as DicePreset;
  live.overlay = { kind: 'dice', nonce: newId(), name: p.name, preset: p, roll: null, startedAt: 0, duration: 1300 };
}

/** mover: a board game's movement roll (see the overlay's mover). */
export function rollDice(live: Live, session: Session, preset: DicePreset, mover = false): void {
  const p = JSON.parse(JSON.stringify(preset)) as DicePreset;
  const roll = rollPreset(p);
  live.overlay = { kind: 'dice', nonce: newId(), name: p.name, preset: p, roll, startedAt: Date.now(), duration: 1300, ...(mover ? { mover } : {}) };
  logRoll(session, 'dice', p.name, describeRoll(roll));
}

/** Quick dice like "2d6" that aren't saved with the game. */
export function quickDice(sides: number, count: number, name = `${count > 1 ? count : ''}d${sides}`): DicePreset {
  return { id: 'quick', name, showTotal: count > 1, dice: [{ id: 'q', sides, count }] };
}

/** armId: for a buzzer tie ('buzz'), the opening it settles. */
export function startRollOff(live: Live, session: Session, playerIds: string[], sides: number, purpose: 'first' | 'tiebreak' | 'buzz' = 'first', armId?: number): void {
  if (!playerIds.length) return;
  // A blank die is a d20, and a die has at least 2 sides (a d1 would tie every round).
  sides = Math.min(1000, Math.max(2, Math.floor(sides) || 20));
  const plan = planRollOff(playerIds, sides, undefined, purpose === 'buzz');
  live.overlay = {
    kind: 'rolloff',
    nonce: newId(),
    purpose,
    sides,
    rounds: plan.rounds,
    ranking: plan.ranking,
    winner: plan.winner,
    startedAt: Date.now(),
    roundMs: 2600,
    ...(armId !== undefined ? { armId } : {}),
  };
  const name = (id: string) => session.players.find((p) => p.id === id)?.name ?? '?';
  const first = plan.rounds[0];
  logRoll(
    session,
    'rolloff',
    purpose === 'tiebreak' ? `Tiebreaker roll-off (d${sides})` : purpose === 'buzz' ? `Buzzer tie roll (d${sides})` : `Roll-off (d${sides})`,
    `${purpose === 'buzz' ? plan.ranking.map(name).join(' → ') : `${name(plan.winner)} ${purpose === 'tiebreak' ? 'wins' : 'goes first'}`} · ${first.players.map((p) => `${name(p)} ${first.rolls[p]}`).join(', ')}${plan.rounds.length > 1 ? ` (+${plan.rounds.length - 1} tiebreak)` : ''}`,
    [plan.winner],
  );
}

export function toggleScoreboard(live: Live): void {
  live.overlay = live.overlay?.kind === 'scoreboard' ? null : { kind: 'scoreboard', nonce: newId() };
}
