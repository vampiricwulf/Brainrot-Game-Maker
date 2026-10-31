// Host actions that open / drive the tool overlays (wheel, dice, roll-off, scoreboard).
import { categoryLabel, isBoard, newId, PLAYER_WHEEL, type DicePreset, type Game, type Id, type PartnerState, type ScoreAction, type Session, type TeamMember, type WheelPreset, type WheelSegment } from './model';
import { mixHex } from './colors';
import { overlayDoneAt, toolOverlay, type ExtraWheel, type Live, type Overlay, type ScoreDraft } from './live';
import {
  actionDeltas, activeSegments, applyAction, describeRoll, faceText, isRespin, logRoll, needsSource, newSegment, onSlices, outcomeText, planRollOff, rollOutcome, rollPreset, sliceLabel,
  spinTarget, weightedIndex, wheelUsedUp, type PoolSlice,
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

/** The built-in "Pick a player" wheel's name on screen ("Pick a team" when each player is a team). */
export const playerWheelName = (teams: boolean) => (teams ? 'Pick a team' : 'Pick a player');

/** The built-in "Pick a player" wheel: lands on one of the current players. `teams`: each player is a team. */
export function openPlayerWheel(live: Live, session: Session, teams = false): void {
  live.overlay = {
    kind: 'wheel',
    nonce: newId(),
    name: playerWheelName(teams),
    players: true,
    segments: playerSegments(session),
    rotation: 0,
    spin: null,
    result: null,
  };
}

/**
 * The 🤝 partner wheel: the 🎯 Pick a player wheel for the open partner clue, named "Partner for Ann". The picker's
 * slice is switched off (✎ Edit wheel lists it, to put them on for a spin) unless they can be on it, and left off the
 * wheel drawn from the first frame. `name`: the picker's name.
 */
export function openPartnerWheel(live: Live, session: Session, s: PartnerState, name: string): void {
  const pool = partnerPool(session, s);
  live.overlay = {
    kind: 'wheel',
    nonce: newId(),
    name: `Partner for ${name}`,
    players: true,
    pool,
    segments: onSlices(pool),
    rotation: 0,
    spin: null,
    result: null,
    partnerFor: s.clue,
  };
}

/**
 * The member wheel (partner-clues spec §10.2): the picker's own team plays the partner clue, and one person on it
 * describes to the rest. Its slices are the people on that team with a phone here (`people`: the buzzer room's member
 * ids and the names they joined with), in shades of the team's colour; `members`, so its landing never goes into a
 * picker or a roll's players. `name`: "Describer for Red Team".
 */
export function openMemberWheel(live: Live, s: PartnerState, name: string, color: string, people: TeamMember[]): void {
  const n = people.length;
  live.overlay = {
    kind: 'wheel',
    nonce: newId(),
    name,
    members: true,
    // (From the team's colour lighter and darker in turn, so neighbours differ.)
    segments: people.map((m, i) => ({ id: m.id, label: m.name, color: i % 2 ? mixHex(color, '#000000', 0.15 + (0.35 * i) / n) : mixHex(color, '#ffffff', (0.45 * i) / n), weight: 1 })),
    rotation: 0,
    spin: null,
    result: null,
    partnerFor: s.clue,
  };
}

/** The partner wheel's slices as it opens: every player, the picker switched off unless they can be on it. */
function partnerPool(session: Session, s: PartnerState): PoolSlice[] {
  return playerSegments(session).map((p) => (p.id === s.pickerId && !s.includePicker ? { ...p, off: true } : p));
}

/** The open partner clue whose partner this wheel picks (null: not a partner wheel, or its clue is closed). */
function partnerOf(o: WheelLike, session: Session): PartnerState | null {
  return 'partnerFor' in o && o.partnerFor && !o.members && session.partner?.clue === o.partnerFor ? session.partner : null;
}

/**
 * The host changed this run of the wheel (✎ Edit wheel says "(edited)"). A partner wheel's picker switched off isn't a
 * change: it opens that way.
 */
export function wheelEdited(o: WheelLike, session: Session): boolean {
  if (!o.pool) return false;
  const s = partnerOf(o, session);
  if (!s) return true;
  const opened = partnerPool(session, s);
  return o.pool.length !== opened.length || o.pool.some((x, i) => x.id !== opened[i].id || x.weight !== 1 || !!x.off !== !!opened[i].off);
}

/**
 * The rolls still going on screen at `now`: the wheels' (the main wheel's and each extra one's), the dice's or the
 * roll-off's. 📜 Log hides them until they land.
 */
export function spinningRolls(o: Overlay | null | undefined, now: number): Id[] {
  const w = o?.kind === 'scoreboard' ? o.under : o;
  if (w?.kind === 'dice' || w?.kind === 'rolloff') return w.rollId && now < overlayDoneAt(w) ? [w.rollId] : [];
  if (w?.kind !== 'wheel') return [];
  return [w, ...(w.extra ?? [])].flatMap((x) => (x.rollId && x.spin && x.spin.startedAt + x.spin.duration > now ? [x.rollId] : []));
}

/** This spin's or roll's score cards go by this key (another die's or wheel's: this, then which one). See cardsDone. */
export function cardsKey(o: Overlay): string {
  return `${o.nonce}-${o.kind === 'wheel' ? o.spin?.startedAt : o.kind === 'dice' ? o.startedAt : ''}`;
}

/**
 * A score card dealt with (kept on the overlay, see cardsDone): skipped, or the score step it applied, so an Undo of
 * that step brings the card back (the points went to the wrong player).
 */
export function cardDone(o: Overlay | null | undefined, session: Session, key: string): boolean {
  const d = o?.kind === 'wheel' || o?.kind === 'dice' ? o.cardsDone?.[key] : undefined;
  return d === true || (!!d && session.scoreLog.some((e) => e.batchId === d && !e.undone));
}

/** A score card of the wheel or dice on screen: its effect, what the score log calls it, and the dice total it counts. */
export type ScoreCard = { key: string; action: ScoreAction; reason: string; rollTotal: number; kind: 'wheel' | 'dice' };

/**
 * The score cards of the wheel or dice on screen once it has landed, dealt with or not: its result's (not a 🎯 player
 * wheel's), the other dice's faces' and the other wheels'.
 */
export function scoreCards(o: Overlay | null | undefined, now = Date.now()): ScoreCard[] {
  if ((o?.kind !== 'wheel' && o?.kind !== 'dice') || now < overlayDoneAt(o)) return [];
  const key = cardsKey(o);
  if (o.kind === 'dice') {
    if (!o.roll) return [];
    const r = o.roll;
    const { main, others } = rollOutcome(r);
    const card = (k: string, action: ScoreAction, reason: string): ScoreCard => ({ key: k, action, reason, rollTotal: r.total ?? 0, kind: 'dice' });
    return [
      ...(main?.scoreAction ? [card(key, main.scoreAction, `Dice: ${o.name} → ${outcomeText(r)}`)] : []),
      ...others.flatMap((f) => {
        const label = f.face.label.trim() || (r.dice[f.i] ? faceText(r.dice[f.i]) : `Die ${f.i + 1}`);
        return f.face.scoreAction ? [card(`${key}-die${f.i}`, f.face.scoreAction, `Dice: ${o.name} → ${label}`)] : [];
      }),
    ];
  }
  if (!o.spin) return [];
  const out: ScoreCard[] = [];
  const main = o.result !== null ? o.segments[o.result] : undefined;
  if (!o.players && !o.members && main?.scoreAction) out.push({ key, action: main.scoreAction, reason: `Wheel: ${o.name} → ${sliceLabel(main, o.result!)}`, rollTotal: 0, kind: 'wheel' });
  for (const w of o.extra ?? []) {
    const seg = w.spin && w.result !== null ? w.segments[w.result] : undefined;
    if (seg?.scoreAction) out.push({ key: `${key}-${w.key}`, action: seg.scoreAction, reason: `Wheel: ${w.name} → ${sliceLabel(seg, w.result!)}`, rollTotal: 0, kind: 'wheel' });
  }
  return out;
}

/**
 * The score cards of the wheel or dice on screen still waiting once it has landed (neither confirmed nor skipped).
 * Going on with one left asks first.
 */
export function scoreCardsLeft(o: Overlay | null | undefined, session: Session, now = Date.now()): string[] {
  return scoreCards(o, now)
    .map((c) => c.key)
    .filter((k) => !cardDone(o, session, k));
}

/**
 * Who this spin or roll was for: the player a 🎯 Pick a player wheel landed on, else the players tagged in "This was
 * for", else the one a 🎯 wheel spun with it landed on. Its score cards are for them until the host picks there.
 */
export function spinFor(o: Overlay | null | undefined, session: Session): Id[] {
  if (o?.kind !== 'wheel' && o?.kind !== 'dice') return [];
  const has = (id: Id | undefined) => !!id && session.players.some((p) => p.id === id);
  if (o.kind === 'wheel' && o.players && o.spin && o.result !== null) {
    const id = o.segments[o.result]?.id;
    return has(id) ? [id] : [];
  }
  // This spin's roll-log entries (one per wheel spun together: a spent one, or one added since, didn't spin).
  const log = session.rollLog ?? [];
  const extras = o.kind === 'wheel' && o.spin ? (o.extra ?? []).filter((w) => w.spin && w.spin.startedAt >= o.spin!.startedAt).length : 0;
  const rolls = extras ? log.slice(-(1 + extras)) : log.slice(-1);
  const tagged = ([...rolls].reverse().find((r) => !r.picked) ?? log.at(-1))?.playerIds ?? [];
  if (tagged.length) return tagged;
  const w = o.kind === 'wheel' ? o.extra?.find((x) => x.players && x.spin && x.result !== null) : undefined;
  const id = w && w.result !== null ? w.segments[w.result]?.id : undefined;
  return has(id) ? [id!] : [];
}

/**
 * Who a score card is for now: the host's choice once they made one, else who the spin was for, else the picker. A swap
 * is with one player.
 */
export function scoreDraft(live: Live, session: Session, card: ScoreCard): { targets: Id[]; source?: Id } {
  const one = card.action.kind === 'swapScores';
  const d = live.scoreDrafts?.[card.key];
  if (d?.touched) return { targets: d.targets, ...(d.source ? { source: d.source } : {}) };
  const by = spinFor(toolOverlay(live), session);
  const base = by.length ? by : session.currentPickerId ? [session.currentPickerId] : [];
  return { targets: base.slice(0, one ? 1 : undefined) };
}

/** The host picks who a score card is for (`id` on or off), or who it steals from or swaps with (`source`). */
export function draftPick(live: Live, session: Session, card: ScoreCard, id: Id, source = false): void {
  const one = card.action.kind === 'swapScores';
  const d = scoreDraft(live, session, card);
  const next: ScoreDraft = source
    ? // (The player stolen from, or swapped with, isn't one it's for.)
      { targets: d.targets.filter((x) => x !== id), source: id, touched: true }
    : { targets: d.targets.includes(id) ? d.targets.filter((x) => x !== id) : one ? [id] : [...d.targets, id], ...(d.source ? { source: d.source } : {}), touched: true };
  // (Only this spin's cards are kept: an older spin's go.)
  const o = toolOverlay(live);
  const keep = o ? cardsKey(o) : '';
  live.scoreDrafts = { ...Object.fromEntries(Object.entries(live.scoreDrafts ?? {}).filter(([k]) => keep && k.startsWith(keep))), [card.key]: next };
}

/** What a score card would change now (player → points), and whether it can be given (who it's for, and from whom). */
export function draftDeltas(live: Live, session: Session, card: ScoreCard): { deltas: Record<Id, number>; ready: boolean } {
  const d = scoreDraft(live, session, card);
  const deltas = actionDeltas(session, card.action, d.targets, d.source, card.rollTotal);
  return { deltas, ready: d.targets.length > 0 && (!needsSource(card.action) || !!d.source) && Object.keys(deltas).length > 0 };
}

/**
 * Give a score card of the wheel or dice on screen, to whom its draft says (one undo step: an Undo of it brings the
 * card back), or (`skip`) set it aside. The points of a wheel or dice tile's own tool go down as its tile's (`tile`):
 * ↩ Put back (keep tile) then waits for an Undo, as after an award. Returns the score step, or null (not ready, or
 * gone).
 */
export function applyScoreCard(game: Game, session: Session, live: Live, key: string, opts: { skip?: boolean; tile?: Id } = {}): string | null {
  const o = toolOverlay(live);
  const card = scoreCards(o).find((c) => c.key === key);
  if ((o?.kind !== 'wheel' && o?.kind !== 'dice') || !card || cardDone(o, session, key)) return null;
  const d = scoreDraft(live, session, card);
  if (!opts.skip && !draftDeltas(live, session, card).ready) return null;
  if (live.scoreDrafts?.[key]) live.scoreDrafts = Object.fromEntries(Object.entries(live.scoreDrafts).filter(([k]) => k !== key));
  if (opts.skip) {
    o.cardsDone = { ...o.cardsDone, [key]: true };
    return null;
  }
  const batch = applyAction(session, game, card.action, d.targets, d.source, card.reason, card.rollTotal);
  o.cardsDone = { ...o.cardsDone, [key]: batch };
  if (opts.tile) for (const e of session.scoreLog) if (!e.clueId && e.batchId === batch) e.toolTile = opts.tile;
  return batch;
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
  // (Slices that landed stay listed and switched on: the spin leaves them out until they're restored. Switched off,
  // Restore wouldn't bring them back, and Overwrite would delete them.)
  return copy(preset.segments);
}

/**
 * Change this run of the wheel only (the saved wheel stays as it is). Clears the last result. The wheel on screen
 * leaves out the slices that landed, as the spin does.
 */
export function editWheel(o: WheelLike, pool: PoolSlice[], session: Session, game: Game): void {
  if (!o.players && !o.wheelId && !o.pool) o.base = copy(o.segments);
  o.pool = copy(pool);
  o.segments = spinSegments(o, session, game);
  o.spin = null;
  o.result = null;
  if ('kind' in o) o.tagged = undefined;
}

/**
 * Back to the wheel as it was opened (players and saved wheels follow their current state). A partner wheel's picker is
 * off it again, unless they can be on it.
 */
export function resetWheelEdits(o: WheelLike, session: Session, game: Game): void {
  const s = partnerOf(o, session);
  o.pool = s ? partnerPool(session, s) : undefined;
  const preset = o.wheelId ? game.wheels.find((w) => w.id === o.wheelId) : undefined;
  if (o.pool) o.segments = onSlices(o.pool);
  else if (o.players) o.segments = playerSegments(session);
  else if (preset) o.segments = copy(activeSegments(session, preset));
  else if (o.base) o.segments = copy(o.base);
  o.spin = null;
  o.result = null;
  if ('kind' in o) o.tagged = undefined;
}

/**
 * The slices a wheel spins with now: this run's edits (players added or removed since still count), else the saved
 * wheel as it stands, else the current players. A "land once" wheel's used slices are out either way.
 */
export function spinSegments(o: WheelLike, session: Session, game: Game): WheelSegment[] {
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

/** Add another wheel to spin together with the one on screen (a saved wheel, or the player wheel: `teams` as above). */
export function addWheel(live: Live, session: Session, game: Game, wheelId: string, teams = false): void {
  const o = live.overlay;
  if (!o || o.kind !== 'wheel') return;
  const preset = game.wheels.find((w) => w.id === wheelId);
  const players = wheelId === PLAYER_WHEEL;
  if (!preset && !players) return;
  const w: ExtraWheel = {
    key: newId(),
    name: preset?.name ?? playerWheelName(teams),
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
  // Every slice of a "land once" wheel has landed: it stays put (as the main wheel does), not starting over, and has no
  // result this spin (its last one isn't counted again: no second score card, no tag on an older log line).
  if (wheelSpentUp(w, session, game)) {
    w.spin = null;
    w.result = null;
    delete w.rollId;
    return;
  }
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
  const logged = logRoll(session, 'wheel', w.name, sliceLabel(seg, index), w.players ? [seg.id] : undefined);
  if (w.players) logged.picked = true;
  w.rollId = logged.id;
  if (preset?.removeAfterLanding && !isRespin(seg)) {
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
  const logged = logRoll(session, 'wheel', o.name, sliceLabel(seg, index), o.players ? [seg.id] : undefined);
  if (o.players) logged.picked = true;
  o.rollId = logged.id;
  if (preset?.removeAfterLanding && !isRespin(seg)) {
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
  const logged = logRoll(session, 'dice', p.name, describeRoll(roll));
  live.overlay = { kind: 'dice', nonce: newId(), name: p.name, preset: p, roll, startedAt: Date.now(), duration: 1300, ...(mover ? { mover } : {}), rollId: logged.id };
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
  const overlay: Overlay = {
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
  const logged = logRoll(
    session,
    'rolloff',
    purpose === 'tiebreak' ? `Tiebreaker roll-off (d${sides})` : purpose === 'buzz' ? `Buzzer tie roll (d${sides})` : `Roll-off (d${sides})`,
    `${purpose === 'buzz' ? plan.ranking.map(name).join(' → ') : `${name(plan.winner)} ${purpose === 'tiebreak' ? 'wins' : 'goes first'}`} · ${first.players.map((p) => `${name(p)} ${first.rolls[p]}`).join(', ')}${plan.rounds.length > 1 ? ` (+${plan.rounds.length - 1} tiebreak)` : ''}`,
    [plan.winner],
  );
  live.overlay = { ...overlay, rollId: logged.id };
}

/** The scores on screen, over whatever is up (a wheel still to land, a result still to act on): S again puts it back. */
export function toggleScoreboard(live: Live): void {
  const o = live.overlay;
  live.overlay = o?.kind === 'scoreboard' ? (o.under ?? null) : { kind: 'scoreboard', nonce: newId(), ...(o ? { under: o } : {}) };
}
