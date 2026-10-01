import { describe, expect, it } from 'vitest';
import { keptRoster } from './roster';

const t = (id: string, extra: object = {}) => ({ id, name: id.toUpperCase(), color: '#111', ...extra });

describe('the game players the pre-game screen keeps', () => {
  it('takes the list’s order, names and colors, keeping stats only the game has', () => {
    const old = [t('a', { stats: { hp: 5 } }), t('b')];
    const next = keptRoster(old, [
      { id: 'b', name: 'Bo', color: '#222' },
      { id: 'a', name: 'Al', color: '#333' },
      { id: 'c', name: 'Cy', color: '#444' },
    ]);
    expect(next).toEqual([
      { id: 'b', name: 'Bo', color: '#222' },
      { id: 'a', name: 'Al', color: '#333', stats: { hp: 5 } },
      { id: 'c', name: 'Cy', color: '#444' },
    ]);
  });

  it('keeps a picture the list has no word on (a rematch from an older copy)', () => {
    const next = keptRoster([t('a', { avatar: 'm1' })], [{ id: 'a', name: 'Al', color: '#111' }]);
    expect(next[0].avatar).toBe('m1');
  });

  it('takes off a picture taken off on the list, and sets a new one', () => {
    const before = [
      { id: 'a', name: 'A', color: '#111', avatar: 'm1' },
      { id: 'b', name: 'B', color: '#111' },
    ];
    const next = keptRoster(
      [t('a', { avatar: 'm1' }), t('b')],
      [
        { id: 'a', name: 'A', color: '#111' },
        { id: 'b', name: 'B', color: '#111', avatar: 'm2' },
      ],
      before,
    );
    expect('avatar' in next[0]).toBe(false);
    expect(next[1].avatar).toBe('m2');
  });

  it('never changes the game’s own copy', () => {
    const old = [t('a', { stats: { hp: 5 } })];
    const next = keptRoster(old, [{ id: 'a', name: 'Al', color: '#111' }]);
    (next[0].stats as Record<string, number>).hp = 9;
    expect((old[0] as { stats?: Record<string, number> }).stats?.hp).toBe(5);
  });
});
