import { describe, expect, it } from 'vitest';
import { findAll, snippet } from './find';
import { newGame, textSlide } from './model';
import { addSampleGame } from './samples';

describe('Find', () => {
  const game = newGame();
  addSampleGame(game);

  it('finds clues by their question or answer, and says where', () => {
    const hits = findAll(game, 'minecraft');
    expect(hits).toHaveLength(1);
    expect(hits[0].where).toBe('Jeopardy! › Gaming › $400 › Answer');
    expect(hits[0].place).toMatchObject({ tab: 'round', part: { kind: 'clue', side: 'a' } });
    // Go there puts the focus in the Answer field.
    expect(hits[0].focus).toBe('[data-field="a"]');
  });

  it('says Category alike for boards and Finals, gives spaces their own icon, and the field to focus', () => {
    const cat = findAll(game, 'gaming').find((h) => h.place.tab === 'round' && h.place.part?.kind === 'category')!;
    expect(cat.where).toBe('Jeopardy! › Category');
    expect(cat.focus).toMatch(/^\[data-place="category:.+"\] textarea$/);
    const space = findAll(game, 'nap time')[0];
    expect(space.icon).toBe('⬤');
    expect(space.focus).toBe('main input[aria-label="Space name"]');
    expect(findAll(game, 'jeopardy!').find((h) => h.icon === '🏷')?.focus).toBe('main [data-round-name]');
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

  it('finds what a space’s buttons say, and names the space when it isn’t what matched', () => {
    const g = newGame();
    addSampleGame(g);
    const r = g.rounds.find((x) => x.mode === 'boardgame')!;
    if (r.mode !== 'boardgame') throw new Error('no board game');
    const s = r.spaces[1];
    s.hostNotes = 'Watch out for lava';
    s.onLand = [{ id: 'n1', do: 'note', text: 'Ask about the volcano' }];
    const notes = findAll(g, 'lava');
    expect(notes).toHaveLength(1);
    expect(notes[0].where).toBe(`${r.name} › Space “${s.name}”`);
    const button = findAll(g, 'volcano');
    expect(button).toHaveLength(1);
    expect(button[0].where).toBe(`${r.name} › Space “${s.name}” › Buttons`);
    expect(button[0].place).toMatchObject({ tab: 'round', part: { kind: 'space', space: s.id } });
  });

  it('opens a screen on the look that has the words, with what has them selected, and names a screen found by its notes', () => {
    const g = newGame();
    addSampleGame(g);
    const w = g.worlds![0];
    const m = w.maps[0];
    const cave = m.screens.find((s) => s.name === 'Cave')!;
    const cat = cave.slide.elements.find((e) => e.name === 'Riddle cat')!;
    const screen = { tab: 'world', world: w.id, map: m.id, screen: cave.id, inSlide: true };
    // By its name, and by what it says.
    expect(findAll(g, 'riddle').find((h) => h.icon === '🧩')?.place).toEqual({ ...screen, element: cat.id });
    expect(findAll(g, 'cave is yours').find((h) => h.icon === '🧩')?.place).toEqual({ ...screen, element: cat.id });
    cave.variants = [{ id: 'fire', name: 'On fire', slide: JSON.parse(JSON.stringify(cave.slide)) }];
    expect(findAll(g, 'riddle').filter((h) => h.icon === '🧩').map((h) => h.place)).toEqual([
      { ...screen, element: cat.id },
      { ...screen, look: 'fire', element: cat.id },
    ]);
    cave.hostNotes = 'Bring a torch';
    expect(findAll(g, 'torch')[0].where).toBe(`${w.name} › ${m.name} › Screen “Cave”`);
    expect(findAll(g, 'torch')[0].place).toEqual({ tab: 'world', world: w.id, map: m.id, screen: cave.id });
  });

  it('puts the focus in the field that has the words for a tiebreaker and a board game’s How to win', () => {
    const g = newGame();
    addSampleGame(g);
    const r = g.rounds.find((x) => x.mode === 'boardgame')!;
    if (r.mode !== 'boardgame') throw new Error('no board game');
    r.winNotes = 'Collect three flamingos';
    expect(findAll(g, 'flamingos')[0].focus).toBe('main [data-field="win-notes"]');
    g.tiebreaker = { questionSlide: textSlide('Zebrafish question'), answerSlide: textSlide('Zebrafish answer') };
    expect(findAll(g, 'zebrafish').map((h) => [h.where, h.focus])).toEqual([
      ['Tiebreaker › Question', 'main [data-field="q"]'],
      ['Tiebreaker › Answer', 'main [data-field="a"]'],
    ]);
  });

  it('shortens long text around the match', () => {
    const long = 'a '.repeat(100) + 'needle ' + 'b '.repeat(100);
    const s = snippet(long, 'needle', 40);
    expect(s).toContain('needle');
    expect(s.startsWith('…') && s.endsWith('…')).toBe(true);
  });
});
