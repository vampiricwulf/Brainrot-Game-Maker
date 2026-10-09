// Dice, wheel and roll-off logic (spec §5.6, §6.6). Pure functions; the UI animates the precomputed results.
import {
  formatPoints, newId, PLAYER_WHEEL, type Clue, type DicePreset, type Game, type Id, type Outcome, type RollEvent, type ScoreAction,
  type Session, type WheelPreset, type WheelSegment,
} from './model';
import { applyScore, score } from './session';
import { numberFieldValue } from './numfield';

/** Uniform float in [0, 1) from the browser's crypto RNG. */
export function random(): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] / 2 ** 32;
  }
  return Math.random();
}

export function rollDie(sides: number, rand = random): number {
  return 1 + Math.floor(rand() * Math.max(1, Math.floor(sides)));
}

export function weightedIndex(weights: number[], rand = random): number {
  const total = weights.reduce((a, w) => a + Math.max(0, w), 0);
  if (total <= 0) return Math.floor(rand() * weights.length);
  let x = rand() * total;
  for (let i = 0; i < weights.length; i++) {
    x -= Math.max(0, weights[i]);
    if (x < 0) return i;
  }
  return weights.length - 1;
}

// ---------- Wheel ----------

export const WHEEL_COLORS = ['#e6194b', '#f58231', '#ffe119', '#3cb44b', '#42d4f4', '#4363d8', '#911eb4', '#f032e6', '#469990', '#9a6324'];

export function newSegment(label: string, i: number): WheelSegment {
  return { id: newId(), label, color: WHEEL_COLORS[i % WHEEL_COLORS.length], weight: 1 };
}

/** The smallest weight a saved wheel's slice can have (at 0 or below it would drop off the wheel without a word). */
export const MIN_WEIGHT = 0.1;

/**
 * A slice weight as typed in the wheel editor: a number of at least MIN_WEIGHT (rounded to 2 places). Blank or not a
 * number is 1 (an ordinary slice); 0 or less is MIN_WEIGHT: deleting the slice is how it leaves the wheel.
 */
export function sliceWeight(text: string): number {
  const n = Number(text);
  if (text.trim() === '' || !Number.isFinite(n)) return 1;
  return Math.max(MIN_WEIGHT, Math.round(n * 100) / 100);
}

/** A saved wheel's spin time as typed (seconds): 1–30, a blank or not-a-number box keeps `last`. */
export function spinSeconds(text: string, last: number): number {
  return Math.round(numberFieldValue(text, last, 1, 30) * 10) / 10;
}

/** How many of a die a saved dice set rolls, as typed: a whole 1–20, a blank or not-a-number box keeps `last`. */
export function diceCount(text: string, last: number): number {
  return Math.round(numberFieldValue(text, last, 1, 20));
}

/** A wheel slice in the host's edit box: `off` leaves it out of this run of the wheel. */
export type PoolSlice = WheelSegment & { off?: boolean };

/** The slices that go on the wheel: switched on, with a chance above zero. */
export function onSlices(pool: PoolSlice[]): WheelSegment[] {
  return pool.filter((s) => !s.off && s.weight > 0).map(({ off: _off, ...s }) => s);
}

/**
 * Quick wheel options, one per line. A line can end with a weight, like "Sing a song x3" (or ×3, *3), to
 * make it that many times as likely. An x at the end of a word isn't one ("Xbox 360", "Open box 3").
 */
export function parseQuickWheel(text: string): { label: string; weight: number }[] {
  return text
    .split('\n')
    .map((line) => {
      const m = /^(.*?)(?:\s+x|\s*[×*])\s*(\d+(?:\.\d+)?)\s*$/i.exec(line.trim());
      const label = (m ? m[1] : line).trim();
      return { label, weight: m && label ? Math.min(1000, +m[2]) : 1 };
    })
    .filter((o) => o.label && o.weight > 0);
}

export function newWheel(name = 'New wheel', labels = ['Option 1', 'Option 2', 'Option 3', 'Option 4']): WheelPreset {
  return { id: newId(), name, segments: labels.map(newSegment), spinDurationMs: 5000, removeAfterLanding: false };
}

/** Start/end angle (degrees, clockwise from the top) of each slice, sized by weight. */
export function segmentAngles(segments: { weight: number }[]): { start: number; end: number }[] {
  const total = segments.reduce((a, s) => a + Math.max(0, s.weight), 0) || 1;
  let a = 0;
  return segments.map((s) => {
    const start = a;
    a += (Math.max(0, s.weight) / total) * 360;
    return { start, end: a };
  });
}

/**
 * Plan a spin that lands slice `index` under the pointer (at the top).
 * Returns the wheel's final rotation in degrees (always several full turns past `from`).
 */
export function spinTarget(segments: { weight: number }[], index: number, from: number, rand = random, turns = 6): number {
  const { start, end } = segmentAngles(segments)[index];
  const span = end - start;
  // Land somewhere inside the slice, away from its edges.
  const at = start + span * (0.15 + 0.7 * rand());
  // Rotating the wheel by R puts wheel-angle (360 - R mod 360) under the top pointer.
  const want = (360 - at) % 360;
  const base = from - (((from % 360) + 360) % 360);
  let to = base + turns * 360 + want;
  while (to < from + turns * 360) to += 360;
  return to;
}

/** Angle under the top pointer for a wheel rotated by `rotation`, and which slice that is. */
export function sliceAt(segments: { weight: number }[], rotation: number): number {
  const a = (((360 - rotation) % 360) + 360) % 360;
  return segmentAngles(segments).findIndex((s) => a >= s.start && a < s.end);
}

export const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 4);

// ---------- Dice ----------

export function newDice(name = 'New dice', sides = 6, count = 1): DicePreset {
  return { id: newId(), name, dice: [{ id: newId(), sides, count }], showTotal: true };
}

export const QUICK_DICE: { label: string; sides: number; count: number }[] = [
  { label: 'd4', sides: 4, count: 1 },
  { label: 'd6', sides: 6, count: 1 },
  { label: 'd8', sides: 8, count: 1 },
  { label: 'd10', sides: 10, count: 1 },
  { label: 'd12', sides: 12, count: 1 },
  { label: 'd20', sides: 20, count: 1 },
  { label: 'd100', sides: 100, count: 1 },
  { label: '2d6', sides: 6, count: 2 },
];

/** Parse "2d6", "d20", "3d37". */
export function parseDice(text: string): { sides: number; count: number } | null {
  const m = text.trim().toLowerCase().match(/^(\d*)\s*d\s*(\d+)$/);
  if (!m) return null;
  const count = m[1] ? +m[1] : 1;
  const sides = +m[2];
  if (count < 1 || count > 20 || sides < 2 || sides > 1000) return null;
  return { sides, count };
}

/** A dice tile's standard dice ("std:2d6"): no preset needed, like the host's quick dice. */
export const STD_DICE = 'std:';

/** The dice a dice tile rolls: a preset of the game, or standard dice ("std:d20"). */
export function tileDice(game: Pick<Game, 'dice'>, id: string | undefined): DicePreset | undefined {
  if (!id) return undefined;
  const preset = game.dice.find((d) => d.id === id);
  if (preset || !id.startsWith(STD_DICE)) return preset;
  const name = id.slice(STD_DICE.length);
  const d = parseDice(name);
  return d ? { id, name, showTotal: d.count > 1, dice: [{ id: 'std', sides: d.sides, count: d.count }] } : undefined;
}

/** A wheel or dice tile has its wheel or dice (one still in the game, or a built-in one); any other tile needs none. */
export const toolChosen = (game: Pick<Game, 'wheels' | 'dice'>, c: Clue): boolean =>
  c.type === 'wheel' ? c.wheelId === PLAYER_WHEEL || game.wheels.some((w) => w.id === c.wheelId) : c.type === 'dice' ? !!tileDice(game, c.diceId) : true;

export interface RolledDie {
  sides: number;
  value: number;
  /** Custom face for this value, if the die has custom faces. */
  face?: Outcome;
  color?: string;
}

export interface DiceRoll {
  dice: RolledDie[];
  total: number;
  /** Outcome for the total, if the preset maps totals. */
  totalOutcome?: Outcome;
}

export function rollPreset(p: DicePreset, rand = random): DiceRoll {
  const dice: RolledDie[] = [];
  for (const d of p.dice)
    for (let i = 0; i < Math.max(1, d.count); i++) {
      const value = rollDie(d.sides, rand);
      dice.push({ sides: d.sides, value, face: d.customFaces?.[value - 1] });
    }
  const total = dice.reduce((a, d) => a + d.value, 0);
  const totalOutcome = p.totalOutcomes?.find((t) => total >= t.min && total <= t.max)?.outcome;
  return { dice, total, totalOutcome };
}

/** A custom face with something to show or do: details, a picture or sound, a score effect, a countdown or buttons. */
const faceHasMore = (f: Outcome | undefined): f is Outcome => !!f && !!(f.details || f.media || f.scoreAction || f.timerSeconds || f.actions?.length);

/**
 * What a roll comes to: its total's outcome, else the first die whose custom face has more than a label. Viewers see
 * it and the host's card acts on it (the same one in both); `others` are the other dice whose faces have effects.
 */
export function rollOutcome(r: DiceRoll): { main?: Outcome; others: { i: number; face: Outcome }[] } {
  const faces = r.dice.map((d, i) => ({ i, face: d.face })).filter((x): x is { i: number; face: Outcome } => faceHasMore(x.face));
  if (r.totalOutcome) return { main: r.totalOutcome, others: [] };
  const [first, ...rest] = faces;
  return { main: first?.face, others: rest.filter((x) => x.face.scoreAction || x.face.timerSeconds || x.face.actions?.length) };
}

/** A rolled die as shown and logged: its face's label, else its number (a face left blank, a picture face). */
export const faceText = (d: RolledDie): string => d.face?.label.trim() || String(d.value);

/** What a roll's outcome is called: its label, else (left blank) the total it's for, or the number of the die it came up on. */
export function outcomeText(r: DiceRoll): string {
  const main = rollOutcome(r).main;
  if (!main) return '';
  if (main.label.trim()) return main.label.trim();
  if (r.totalOutcome) return String(r.total);
  const die = r.dice.find((d) => d.face === main);
  return die ? faceText(die) : '';
}

export function describeRoll(r: DiceRoll): string {
  const faces = r.dice.map(faceText);
  const main = r.dice.length > 1 && r.dice.every((d) => !d.face) ? `${faces.join(' + ')} = ${r.total}` : faces.join(', ');
  // (A total's outcome left blank: just the dice, no "→" to nothing.)
  const t = r.totalOutcome?.label.trim();
  return t ? `${main} → ${t}` : main;
}

/**
 * The host's result line for a roll: the total first (with its outcome), then the dice, so a long list of dice is what
 * gets cut off, never the total. "17 → Take a sip (5 + 6 + 6)".
 */
export function rollResult(r: DiceRoll): string {
  if (r.dice.length < 2 || r.dice.some((d) => d.face)) return describeRoll(r);
  const t = r.totalOutcome?.label.trim();
  return `${r.total}${t ? ` → ${t}` : ''} (${r.dice.map((d) => d.value).join(' + ')})`;
}

// ---------- Roll-off ("who goes first") ----------

export interface RollOffRound {
  players: Id[];
  rolls: Record<Id, number>;
}

/**
 * Everyone rolls; if several players tie for the top, only they re-roll, until one winner remains.
 * Returns every round (for the animation) plus the final ranking. `full`: players level further down re-roll among
 * themselves too, so every place is settled (an answering order, not just a winner).
 */
export function planRollOff(players: Id[], sides: number, rand = random, full = false): { rounds: RollOffRound[]; ranking: Id[]; winner: Id } {
  const rounds: RollOffRound[] = [];
  let contenders = [...players];
  // Tiebreak keys: each player's rolls, round by round.
  const keys: Record<Id, number[]> = Object.fromEntries(players.map((p) => [p, []]));
  for (let guard = 0; guard < 50 && contenders.length > 0; guard++) {
    const rolls: Record<Id, number> = {};
    for (const p of contenders) {
      rolls[p] = rollDie(sides, rand);
      keys[p].push(rolls[p]);
    }
    rounds.push({ players: contenders, rolls });
    const top = Math.max(...contenders.map((p) => rolls[p]));
    const leaders = contenders.filter((p) => rolls[p] === top);
    if (leaders.length <= 1) break;
    contenders = leaders;
  }
  const cmp = (a: Id, b: Id) => {
    const ka = keys[a];
    const kb = keys[b];
    for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
      const d = (kb[i] ?? -1) - (ka[i] ?? -1);
      if (d) return d;
    }
    return 0;
  };
  let ranking = [...players].sort(cmp);
  for (let guard = 0; full && guard < 50; guard++) {
    const level = ranking.find((p, i) => i > 0 && cmp(ranking[i - 1], p) === 0);
    if (!level) break;
    const group = ranking.filter((p) => cmp(p, level) === 0);
    const rolls: Record<Id, number> = {};
    for (const p of group) {
      rolls[p] = rollDie(sides, rand);
      keys[p].push(rolls[p]);
    }
    rounds.push({ players: group, rolls });
    ranking = [...players].sort(cmp);
  }
  return { rounds, ranking, winner: ranking[0] };
}

// ---------- Score actions ----------

export function describeAction(a: ScoreAction, sym: string): string {
  switch (a.kind) {
    case 'addPoints':
      return `${a.amount >= 0 ? '+' : '−'}${formatPoints(Math.abs(a.amount), sym)}`;
    case 'addRollTimes':
      return `+ dice total × ${a.multiplier}`;
    case 'multiplyScore':
      return a.factor === 2 ? 'Double score' : a.factor === 0.5 ? 'Halve score' : `Score × ${a.factor}`;
    case 'setScore':
      return a.amount === 0 ? 'Bankrupt (score → 0)' : `Set score to ${formatPoints(a.amount, sym)}`;
    case 'steal':
      return a.amount === 'all' ? 'Steal all points' : `Steal ${formatPoints(a.amount, sym)}`;
    case 'swapScores':
      return 'Swap scores';
  }
}

/** Does this action need a second player (the one stolen from / swapped with)? */
export function needsSource(a: ScoreAction): boolean {
  return a.kind === 'steal' || a.kind === 'swapScores';
}

/**
 * Preview the score changes an action would make: playerId → delta.
 * `targets` are the players it's for; `source` is the victim for steal/swap; `rollTotal` feeds addRollTimes.
 */
export function actionDeltas(
  session: Session,
  a: ScoreAction,
  targets: Id[],
  source: Id | undefined,
  rollTotal = 0,
): Record<Id, number> {
  const d: Record<Id, number> = {};
  const add = (id: Id, n: number) => n && (d[id] = (d[id] ?? 0) + n);
  switch (a.kind) {
    case 'addPoints':
      targets.forEach((t) => add(t, a.amount));
      break;
    case 'addRollTimes':
      targets.forEach((t) => add(t, Math.round(rollTotal * a.multiplier)));
      break;
    case 'multiplyScore':
      targets.forEach((t) => {
        const s = score(session, t);
        add(t, Math.round(s * a.factor) - s);
      });
      break;
    case 'setScore':
      targets.forEach((t) => add(t, a.amount - score(session, t)));
      break;
    case 'steal': {
      if (!source) break;
      // Shared by the players it's for (never the victim): whole shares that add up to exactly what's taken.
      const takers = targets.filter((t) => t !== source);
      if (!takers.length) break;
      const pool = Math.round(a.amount === 'all' ? Math.max(0, score(session, source)) : a.amount);
      const each = Math.floor(pool / takers.length);
      const extra = pool - each * takers.length;
      takers.forEach((t, i) => add(t, each + (i < extra ? 1 : 0)));
      add(source, -pool);
      break;
    }
    case 'swapScores': {
      // With one player: the "For:" row picks one (a second one would be left out without a word).
      const t = targets.find((x) => x !== source);
      if (!source || !t) break;
      const st = score(session, t);
      const ss = score(session, source);
      add(t, ss - st);
      add(source, st - ss);
      break;
    }
  }
  return d;
}

/** Returns the score step it made (its batchId): undone, the score log says so. */
export function applyAction(
  session: Session,
  game: Game,
  a: ScoreAction,
  targets: Id[],
  source: Id | undefined,
  reason: string,
  rollTotal = 0,
): string {
  const deltas = actionDeltas(session, a, targets, source, rollTotal);
  // One undo step for the whole effect (a swap or steal changes two scores).
  const batchId = newId();
  for (const [id, delta] of Object.entries(deltas)) applyScore(session, game, [id], delta, reason, undefined, true, batchId);
  return batchId;
}

// ---------- Roll log ----------

export function logRoll(session: Session, source: RollEvent['source'], name: string, result: string, playerIds?: Id[]): RollEvent {
  const e: RollEvent = { id: newId(), ts: Date.now(), source, name, result, playerIds };
  // Assign first, then read back: with Svelte state proxies, `(x.list ??= []).push()` would push into the raw array.
  session.rollLog ??= [];
  session.rollLog.push(e);
  return e;
}

/** Wheel slices still in play (respecting "remove after landing"). */
export function activeSegments(session: Session, wheel: WheelPreset): WheelSegment[] {
  // (A wheel no longer "land once": the slices that landed are back on it.)
  if (!wheel.removeAfterLanding) return wheel.segments;
  const removed = new Set(session.removedSegments?.[wheel.id] ?? []);
  const left = wheel.segments.filter((s) => !removed.has(s.id));
  return left.length ? left : wheel.segments;
}

/** A "land once" wheel whose every slice has landed: it can't spin until the host restores them. */
export function wheelUsedUp(session: Session, wheel: WheelPreset, ids: Id[] = wheel.segments.map((s) => s.id)): boolean {
  const removed = new Set(session.removedSegments?.[wheel.id] ?? []);
  // (Spin again slices never land for good: only the rest count. A wheel left with nothing else would spin forever.)
  const again = new Set(wheel.segments.filter(isRespin).map((s) => s.id));
  const left = ids.filter((id) => !again.has(id));
  return !!wheel.removeAfterLanding && left.length > 0 && left.every((id) => removed.has(id));
}

/** A slice that means "spin again": marked so, or named "Spin again" / "Respin" (and not marked otherwise). */
export function isRespin(seg: Pick<WheelSegment, 'label' | 'respin'> | undefined): boolean {
  if (!seg) return false;
  return seg.respin ?? /^\W*(spin\s*again|re-?\s*spin)\b/i.test(seg.label.trim());
}

/** A slice's name on screen and in the log: "Slice 3" for one left blank. */
export function sliceLabel(seg: WheelSegment | undefined, i: number): string {
  return seg?.label.trim() || `Slice ${i + 1}`;
}

/**
 * A player's name made short for a narrow slice: initials of up to three words, plus a number it ends with
 * ("Bartholomew The Magnificent 3" → "BTM3"); one long word → its first letters.
 */
export function initials(name: string): string {
  const words = name.split(/[\s_.-]+/).filter(Boolean);
  // (A name that fits, "Al", stays whole: no "…" for nothing cut.)
  if (words.length < 2) return Array.from(name).length > 5 ? Array.from(name).slice(0, 5).join('') + '…' : name;
  const last = words.at(-1)!;
  const num = /\d/.test(last) ? last : '';
  return words.slice(0, num ? -1 : undefined).slice(0, 3).map((w) => Array.from(w)[0].toUpperCase()).join('') + num;
}

/** Labels made unique where they'd read the same ("BT", "BT" → "BT", "BT 2"); different ones are left alone. */
export function uniqueLabels(labels: string[]): string[] {
  const seen = new Map<string, number>();
  return labels.map((l) => {
    const n = (seen.get(l) ?? 0) + 1;
    seen.set(l, n);
    return n === 1 ? l : `${l} ${n}`;
  });
}
