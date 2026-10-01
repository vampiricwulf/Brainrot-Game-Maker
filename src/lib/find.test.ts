import { describe, expect, it } from 'vitest';
import { findAll, snippet } from './find';
import { newGame } from './model';
import { addSampleGame } from './samples';

describe('Find', () => {
  const game = newGame();
  addSampleGame(game);

  it('finds clues by their question or answer, and says where', () => {
    const hits = findAll(game, 'minecraft');
    expect(hits).toHaveLength(1);
    expect(hits[0].where).toBe('Jeopardy! › Gaming › $400 › Answer');
    expect(hits[0].place).toMatchObject({ tab: 'round', part: { kind: 'clue', side: 'a' } });
  });

  it('needs every word, in any case', () => {
    expect(findAll(game, 'SHIBA crypto')).toHaveLength(1);
    expect(findAll(game, 'shiba piano')).toHaveLength(0);
    expect(findAll(game, '  ')).toEqual([]);
  });

  it('finds screens and what is on them, spaces and items (not players: they are set on the Play screen)', () => {
    expect(findAll(game, 'forest').map((h) => h.place.tab)).toContain('world');
    expect(findAll(game, 'riddle').some((h) => h.icon === '🧩')).toBe(true);
    expect(findAll(game, 'nap time')[0].place).toMatchObject({ tab: 'round', part: { kind: 'space' } });
    expect(findAll(game, 'potion').map((h) => h.place.tab)).toContain('stats');
    expect(findAll(game, 'ann').some((h) => h.icon === '👤')).toBe(false);
  });

  it('shortens long text around the match', () => {
    const long = 'a '.repeat(100) + 'needle ' + 'b '.repeat(100);
    const s = snippet(long, 'needle', 40);
    expect(s).toContain('needle');
    expect(s.startsWith('…') && s.endsWith('…')).toBe(true);
  });
});
