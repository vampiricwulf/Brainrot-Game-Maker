// Ready-made wheels: added to the game in the editor's 🎡 tab, or spun as they are from the host's 🎡 Wheel menu.
import { formatPoints, newId, type ScoreAction, type WheelPreset, type WheelSegment } from './model';
import { WHEEL_COLORS } from './tools';

interface TemplateSlice {
  label: string;
  color?: string;
  weight?: number;
  scoreAction?: ScoreAction;
  /** A countdown that starts when it lands. */
  timerSeconds?: number;
}

export interface WheelTemplate {
  key: string;
  icon: string;
  name: string;
  /** What it's for, in the menus. */
  hint: string;
  /** The slices, with the game's currency symbol in the point labels. */
  slices: (sym: string) => TemplateSlice[];
  removeAfterLanding?: boolean;
}

const GREEN = '#3cb44b';
const RED = '#e6194b';
const pts = (n: number, sym: string) => `${n < 0 ? '−' : '+'}${formatPoints(Math.abs(n), sym)}`;
const add = (n: number, sym: string): TemplateSlice => ({ label: pts(n, sym), scoreAction: { kind: 'addPoints', amount: n } });

export const WHEEL_TEMPLATES: WheelTemplate[] = [
  {
    key: 'coin',
    icon: '🪙',
    name: 'Coin flip',
    hint: 'Heads or tails',
    slices: () => [
      { label: 'Heads', color: '#f5c518' },
      { label: 'Tails', color: '#a9b1bc' },
    ],
  },
  {
    key: 'yesno',
    icon: '👍',
    name: 'Yes or no',
    hint: 'Settle it',
    slices: () => [
      { label: 'Yes', color: GREEN },
      { label: 'No', color: RED },
    ],
  },
  {
    key: 'maybe',
    icon: '🎱',
    name: 'Yes, no or maybe',
    hint: 'A magic 8-ball',
    slices: () => [
      { label: 'Yes', color: GREEN },
      { label: 'No', color: RED },
      { label: 'Maybe', color: '#f58231' },
      { label: 'Ask again', color: '#4363d8' },
    ],
  },
  {
    key: 'numbers',
    icon: '🔢',
    name: '1 to 10',
    hint: 'A number from 1 to 10',
    slices: () => Array.from({ length: 10 }, (_, i) => ({ label: String(i + 1) })),
  },
  {
    key: 'points',
    icon: '🎰',
    name: 'Point wheel',
    hint: 'Points, a Double, a Bankrupt',
    slices: (sym) => [
      add(100, sym),
      add(200, sym),
      add(300, sym),
      { ...add(500, sym), weight: 0.7 },
      { ...add(1000, sym), weight: 0.4 },
      { label: 'Double!', color: '#f5c518', weight: 0.5, scoreAction: { kind: 'multiplyScore', factor: 2 } },
      { label: 'Bankrupt', color: '#222222', weight: 0.5, scoreAction: { kind: 'setScore', amount: 0 } },
      { label: 'Lose a turn', color: '#888888', weight: 0.6 },
    ],
  },
  {
    key: 'double',
    icon: '💰',
    name: 'Double or nothing',
    hint: 'Double it or lose it all',
    slices: () => [
      { label: 'Double!', color: GREEN, scoreAction: { kind: 'multiplyScore', factor: 2 } },
      { label: 'Nothing', color: RED, scoreAction: { kind: 'setScore', amount: 0 } },
    ],
  },
  {
    key: 'chaos',
    icon: '🌀',
    name: 'Chaos',
    hint: 'Steal, swap, double or halve',
    slices: (sym) => [
      add(500, sym),
      add(-500, sym),
      { label: `Steal ${formatPoints(300, sym)}`, scoreAction: { kind: 'steal', amount: 300 } },
      { label: 'Swap scores', scoreAction: { kind: 'swapScores' } },
      { label: 'Double score', scoreAction: { kind: 'multiplyScore', factor: 2 } },
      { label: 'Halve score', scoreAction: { kind: 'multiplyScore', factor: 0.5 } },
    ],
  },
  {
    key: 'rewards',
    icon: '🎁',
    name: 'Rewards',
    hint: 'Good stuff for the spinner',
    slices: (sym) => [
      add(200, sym),
      add(500, sym),
      { label: `Steal ${formatPoints(200, sym)}`, scoreAction: { kind: 'steal', amount: 200 } },
      { label: 'Pick the next category' },
      { label: 'Skip a question' },
      { label: 'Double your next clue' },
    ],
  },
  {
    key: 'punish',
    icon: '😈',
    name: 'Punishments',
    hint: 'Dares for a wrong answer',
    slices: () => [
      { label: 'Do 10 push-ups' },
      { label: 'Sing a chorus' },
      { label: 'Talk like a pirate', timerSeconds: 60 },
      { label: 'Do an impression' },
      { label: 'Only questions', timerSeconds: 60 },
      { label: 'Chat picks your category' },
      { label: 'Tell an embarrassing story' },
      { label: 'Silence until your turn' },
    ],
  },
  {
    key: 'truthdare',
    icon: '🃏',
    name: 'Truth or dare',
    hint: 'The classic',
    slices: () => [
      { label: 'Truth', color: '#4363d8' },
      { label: 'Dare', color: RED },
    ],
  },
  {
    key: 'letters',
    icon: '🔤',
    name: 'A to Z',
    hint: 'A letter to name things by',
    // (The hard letters come up less.)
    slices: () =>
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => ({ label: l, weight: 'QXZJ'.includes(l) ? 0.3 : 1 })),
  },
  {
    key: 'time',
    icon: '⏱',
    name: 'Time limit',
    hint: 'A countdown when it lands',
    slices: () => [10, 15, 20, 30, 45, 60].map((s) => ({ label: `${s} seconds`, timerSeconds: s })),
  },
];

/** The template's slices, ready for a wheel: ids, colors and weights filled in. */
export function templateSegments(t: WheelTemplate, sym: string): WheelSegment[] {
  return t.slices(sym).map((s, i) => ({
    id: newId(),
    label: s.label,
    color: s.color ?? WHEEL_COLORS[i % WHEEL_COLORS.length],
    weight: s.weight ?? 1,
    ...(s.scoreAction ? { scoreAction: s.scoreAction } : {}),
    ...(s.timerSeconds ? { timerSeconds: s.timerSeconds } : {}),
  }));
}

/** A saved wheel made from the template. */
export function wheelFromTemplate(t: WheelTemplate, sym: string, name = t.name): WheelPreset {
  return { id: newId(), name, segments: templateSegments(t, sym), spinDurationMs: 5000, removeAfterLanding: !!t.removeAfterLanding };
}
