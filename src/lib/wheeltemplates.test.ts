import { describe, expect, it } from 'vitest';
import { templateSegments, WHEEL_TEMPLATES, wheelFromTemplate } from './wheeltemplates';

describe('ready-made wheels', () => {
  it('each has its own key and at least two named slices', () => {
    expect(new Set(WHEEL_TEMPLATES.map((t) => t.key)).size).toBe(WHEEL_TEMPLATES.length);
    for (const t of WHEEL_TEMPLATES) {
      const segs = templateSegments(t, '$');
      expect(segs.length, t.name).toBeGreaterThanOrEqual(2);
      for (const s of segs) {
        expect(s.label.trim(), t.name).not.toBe('');
        expect(s.weight).toBeGreaterThan(0);
        expect(s.color).toMatch(/^#[0-9a-f]{6}$/i);
      }
      expect(new Set(segs.map((s) => s.id)).size).toBe(segs.length);
    }
  });

  it("point labels use the game's currency, and points come with their score action", () => {
    const t = WHEEL_TEMPLATES.find((x) => x.key === 'points')!;
    const segs = templateSegments(t, '🪙');
    expect(segs[0]).toMatchObject({ label: '+🪙100', scoreAction: { kind: 'addPoints', amount: 100 } });
    expect(segs.find((s) => s.label === 'Bankrupt')?.scoreAction).toEqual({ kind: 'setScore', amount: 0 });
  });

  it('a time limit slice starts its countdown', () => {
    const segs = templateSegments(WHEEL_TEMPLATES.find((x) => x.key === 'time')!, '$');
    expect(segs.every((s) => s.timerSeconds && s.label === `${s.timerSeconds} seconds`)).toBe(true);
  });

  it('makes a saved wheel with fresh ids each time', () => {
    const t = WHEEL_TEMPLATES[0];
    const a = wheelFromTemplate(t, '$');
    const b = wheelFromTemplate(t, '$', 'Coin flip (2)');
    expect(a.name).toBe('Coin flip');
    expect(b.name).toBe('Coin flip (2)');
    expect(a.id).not.toBe(b.id);
    expect(a.segments[0].id).not.toBe(b.segments[0].id);
  });
});
