// Host actions that open / drive the tool overlays (wheel, dice, roll-off, scoreboard).
import { newId, type DicePreset, type Game, type Session, type WheelPreset, type WheelSegment } from './model';
import type { Live } from './live';
import {
  activeSegments, describeRoll, logRoll, newSegment, planRollOff, rollPreset, spinTarget, weightedIndex,
} from './tools';

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

/** A throwaway wheel from a plain list of options. */
export function openQuickWheel(live: Live, labels: string[]): void {
  live.overlay = {
    kind: 'wheel',
    nonce: newId(),
    name: 'Quick wheel',
    segments: labels.map((l, i) => newSegment(l, i)),
    rotation: 0,
    spin: null,
    result: null,
  };
}

export function spinWheel(live: Live, session: Session, game: Game): void {
  const o = live.overlay;
  if (!o || o.kind !== 'wheel') return;
  const preset = o.wheelId ? game.wheels.find((w) => w.id === o.wheelId) : undefined;
  if (preset) o.segments = JSON.parse(JSON.stringify(activeSegments(session, preset))) as WheelSegment[];
  if (!o.segments.length) return;
  const index = weightedIndex(o.segments.map((s) => s.weight));
  const from = o.rotation;
  const to = spinTarget(o.segments, index, from);
  const duration = preset?.spinDurationMs ?? 5000;
  o.spin = { from, to, startedAt: Date.now(), duration };
  o.rotation = to;
  o.result = index;
  o.tagged = undefined;
  const seg = o.segments[index];
  logRoll(session, 'wheel', o.name, seg.label);
  if (preset?.removeAfterLanding) {
    session.removedSegments ??= {};
    session.removedSegments[preset.id] ??= [];
    const list = session.removedSegments[preset.id];
    if (!list.includes(seg.id)) list.push(seg.id);
  }
}

/** Show dice waiting to be rolled (used by dice clues so the host decides when). */
export function openDice(live: Live, preset: DicePreset): void {
  const p = JSON.parse(JSON.stringify(preset)) as DicePreset;
  live.overlay = { kind: 'dice', nonce: newId(), name: p.name, preset: p, roll: null, startedAt: 0, duration: 1300 };
}

export function rollDice(live: Live, session: Session, preset: DicePreset): void {
  const p = JSON.parse(JSON.stringify(preset)) as DicePreset;
  const roll = rollPreset(p);
  live.overlay = { kind: 'dice', nonce: newId(), name: p.name, preset: p, roll, startedAt: Date.now(), duration: 1300 };
  logRoll(session, 'dice', p.name, describeRoll(roll));
}

/** Quick dice like "2d6" that aren't saved with the game. */
export function quickDice(sides: number, count: number, name = `${count > 1 ? count : ''}d${sides}`): DicePreset {
  return { id: 'quick', name, showTotal: count > 1, dice: [{ id: 'q', sides, count }] };
}

export function startRollOff(live: Live, session: Session, playerIds: string[], sides: number): void {
  if (!playerIds.length) return;
  const plan = planRollOff(playerIds, sides);
  live.overlay = {
    kind: 'rolloff',
    nonce: newId(),
    sides,
    rounds: plan.rounds,
    ranking: plan.ranking,
    winner: plan.winner,
    startedAt: Date.now(),
    roundMs: 2600,
  };
  const name = (id: string) => session.players.find((p) => p.id === id)?.name ?? '?';
  const first = plan.rounds[0];
  logRoll(
    session,
    'rolloff',
    `Roll-off (d${sides})`,
    `${name(plan.winner)} goes first · ${first.players.map((p) => `${name(p)} ${first.rolls[p]}`).join(', ')}${plan.rounds.length > 1 ? ` (+${plan.rounds.length - 1} tiebreak)` : ''}`,
    [plan.winner],
  );
}

export function toggleScoreboard(live: Live): void {
  live.overlay = live.overlay?.kind === 'scoreboard' ? null : { kind: 'scoreboard', nonce: newId() };
}
