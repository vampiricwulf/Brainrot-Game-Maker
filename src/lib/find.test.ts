import { describe, expect, it } from 'vitest';
import { findAll, snippet } from './find';
import { newGame, textSlide } from './model';
import { addSampleGame } from './samples';
import { newWheel } from './tools';

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

  it('finds a ✍ clue’s multiple choices, going to the box of the one that matches', () => {
    const g = newGame();
    addSampleGame(g);
    const r = g.rounds.find((x) => x.mode === 'board')!;
    if (r.mode !== 'board') throw new Error('no board');
    const clue = r.categories[0].clues[0];
    clue.choices = [
      { id: 'a', text: 'Paris' },
      { id: 'b', text: 'Stockholmsyndrome' },
    ];
    // (Kept without ✍, unused: not found.)
    expect(findAll(g, 'stockholmsyndrome')).toEqual([]);
    clue.everyone = true;
    clue.type = 'standard';
    const [hit] = findAll(g, 'stockholmsyndrome');
    expect(hit).toMatchObject({ icon: '✍', text: 'Stockholmsyndrome', focus: '[data-field="choice-1"]', place: { part: { kind: 'clue', clue: r.categories[0].clues[0].id } } });
    expect(hit.where).toMatch(/ › Choices$/);
    // A Final's, while its players type their answers on their phones.
    const fin = g.rounds.find((x) => x.mode === 'final')!;
    if (fin.mode !== 'final') throw new Error('no final');
    fin.choices = [{ id: 'f', text: 'Oslofjordqz' }];
    expect(findAll(g, 'oslofjordqz')[0]).toMatchObject({ icon: '✍', focus: 'main [data-field="choice-0"]', place: { tab: 'round', round: fin.id } });
    fin.phoneAnswersOff = true;
    expect(findAll(g, 'oslofjordqz')).toEqual([]);
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

  it('finds what 🤫 card and other buttons say on objects, items, wheel slices and die faces', () => {
    const g = newGame();
    addSampleGame(g);
    const card = (id: string, words: string) => ({ id, do: 'card' as const, slide: textSlide(words) });
    const cave = g.worlds![0].maps[0].screens.find((s) => s.name === 'Cave')!;
    const cat = cave.slide.elements.find((e) => e.name === 'Riddle cat')!;
    cat.role!.actions = [card('b1', 'Bananaword chest secret')];
    g.items![0].onUse = [card('b2', 'Mangoword')];
    g.wheels.push({ ...newWheel('Prizes'), id: 'w9' });
    g.wheels.at(-1)!.segments[0].actions = [{ id: 'b3', do: 'note', text: 'Kiwiword' }];
    g.dice.push({ id: 'd9', name: 'Fate', showTotal: true, dice: [{ id: 'x', sides: 2, count: 1, customFaces: [{ label: 'Heads', actions: [card('b4', 'Limeword')] }, { label: 'Tails' }] }] });
    expect(findAll(g, 'bananaword').find((h) => h.icon === '🧩')?.place).toMatchObject({ tab: 'world', element: cat.id });
    expect(findAll(g, 'mangoword')[0].place).toEqual({ tab: 'stats', item: g.items![0].id });
    expect(findAll(g, 'kiwiword')[0].place).toEqual({ tab: 'tools', wheel: 'w9' });
    expect(findAll(g, 'limeword')[0].place).toEqual({ tab: 'tools', dice: 'd9' });
  });

  it('puts the focus in the field that has the words for a tiebreaker and a board game’s How to win', () => {
    const g = newGame();
    addSampleGame(g);
    const r = g.rounds.find((x) => x.mode === 'boardgame')!;
    if (r.mode !== 'boardgame') throw new Error('no board game');
    r.winNotes = 'Collect three flamingos';
    expect(findAll(g, 'flamingos')[0].focus).toBe('main [data-field="win-notes"]');
    g.tiebreaker = { questionSlide: textSlide('Zebrafish question'), answerSlide: textSlide('Zebrafish answer'), hostNotes: 'Closest zebrafish count wins' };
    expect(findAll(g, 'zebrafish').map((h) => [h.where, h.focus])).toEqual([
      ['Tiebreaker › Question', 'main [data-field="q"]'],
      ['Tiebreaker › Answer', 'main [data-field="a"]'],
      ['Tiebreaker › Notes', 'main [data-field="notes"]'],
    ]);
  });

  it('shortens long text around the match', () => {
    const long = 'a '.repeat(100) + 'needle ' + 'b '.repeat(100);
    const s = snippet(long, 'needle', 40);
    expect(s).toContain('needle');
    expect(s.startsWith('…') && s.endsWith('…')).toBe(true);
  });
});

describe('Find: 🤫 cards', () => {
  it('finds a tile’s cards, says which, and goes to its tab (a partner clue’s, and any other tile’s)', () => {
    const game = newGame();
    addSampleGame(game);
    const round = game.rounds.find((r) => r.mode === 'board')!;
    if (round.mode !== 'board') throw new Error('no board');
    const cat = round.categories[0];
    const clue = cat.clues[0];
    clue.type = 'partner';
    clue.cards = [
      { id: 'c1', ...textSlide('nothing here'), to: 'giver' },
      { id: 'c2', ...textSlide('Zorblax the ogre'), to: 'guesser' },
    ];
    const hits = findAll(game, 'zorblax');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ icon: '🤫', where: `Jeopardy! › ${cat.title} › $200 › Card 2`, focus: '[data-field="card"]' });
    expect(hits[0].place).toEqual({ tab: 'round', round: round.id, part: { kind: 'clue', category: cat.id, clue: clue.id, side: 'card', slide: 'c2' } });
    // (Since cards anywhere, P3: a standard tile's cards play too, so they're found.)
    clue.type = 'standard';
    expect(findAll(game, 'zorblax')).toHaveLength(1);
  });

  it('finds a tile’s card by its name, says it by its name, and puts the focus in the box that has the words', () => {
    const game = newGame();
    addSampleGame(game);
    const round = game.rounds.find((r) => r.mode === 'board')!;
    if (round.mode !== 'board') throw new Error('no board');
    const cat = round.categories[0];
    const clue = cat.clues[0];
    clue.cards = [{ id: 'c1', name: 'Clue tip', ...textSlide('Zorblax the ogre'), to: 'picker' }];
    const place = { tab: 'round', round: round.id, part: { kind: 'clue', category: cat.id, clue: clue.id, side: 'card', slide: 'c1' } };
    const byName = findAll(game, 'clue tip');
    expect(byName).toHaveLength(1);
    expect(byName[0]).toMatchObject({ icon: '🤫', where: `Jeopardy! › ${cat.title} › $200 › Clue tip`, place, focus: '[data-field="card-name"]' });
    expect(findAll(game, 'zorblax')[0]).toMatchObject({ where: `Jeopardy! › ${cat.title} › $200 › Clue tip`, place, focus: '[data-field="card"]' });
  });

  it('finds a Final’s card by its words or its name, before its answer, and puts the focus in the box that has them', () => {
    const game = newGame();
    addSampleGame(game);
    const final = game.rounds.find((r) => r.mode === 'final')!;
    if (final.mode !== 'final') throw new Error('no Final');
    final.cards = [
      { id: 'f1', name: 'Leader hint', ...textSlide('Quuxly big'), to: 'playing' },
      { id: 'f2', ...textSlide('Quuxly small'), to: 'nobody' },
    ];
    const name = final.name || 'Final Jeopardy!';
    const place = (slide: string) => ({ tab: 'round', round: final.id, part: { kind: 'final', side: 'card', slide } });
    const byWords = findAll(game, 'quuxly');
    expect(byWords).toEqual([
      { icon: '🤫', text: 'Quuxly big', where: `${name} › Leader hint`, place: place('f1'), focus: 'main [data-field="card"]' },
      { icon: '🤫', text: 'Quuxly small', where: `${name} › Card 2`, place: place('f2'), focus: 'main [data-field="card"]' },
    ]);
    expect(findAll(game, 'leader')).toEqual([{ icon: '🤫', text: 'Leader hint', where: `${name} › Leader hint`, place: place('f1'), focus: 'main [data-field="card-name"]' }]);
  });
});

describe('Find: 🎭 deals', () => {
  it('finds a deal by its name, a part’s name or its card’s words, and goes to it in 🎡 Wheels, Dice & Deals', () => {
    const game = newGame();
    game.deals = [{ id: 'd1', name: 'Mystery night', parts: [{ id: 'p1', name: 'Spy', count: 1, card: textSlide('Blend in, quietly') }, { id: 'p2', name: 'Guest', count: 'rest', card: textSlide('') }] }];
    for (const q of ['mystery', 'spy', 'quietly']) {
      const hits = findAll(game, q);
      expect(hits).toHaveLength(1);
      expect(hits[0]).toMatchObject({ icon: '🎭', where: 'Wheels, Dice & Deals › Deal', place: { tab: 'tools', deal: 'd1' } });
    }
  });
});

describe('Find: the editor’s 🤫 Cards', () => {
  it('finds a card by its name or its words, says which, and puts the focus in the box that has them', () => {
    const game = newGame();
    game.cards = [
      { id: 'sc1', name: 'Tip A', ...textSlide('Bring a spoon') },
      { id: 'sc2', name: '', ...textSlide('Hide the zorblax') },
    ];
    const byName = findAll(game, 'tip a');
    expect(byName).toHaveLength(1);
    expect(byName[0]).toMatchObject({ icon: '🤫', where: 'Cards › Tip A', place: { tab: 'cards', card: 'sc1' }, focus: 'main [data-field="card-name"]' });
    const byWords = findAll(game, 'spoon');
    expect(byWords[0]).toMatchObject({ where: 'Cards › Tip A', place: { tab: 'cards', card: 'sc1' }, focus: 'main [data-field="card"]' });
    // One left blank is named by its place in the list, as the list names it.
    expect(findAll(game, 'zorblax')[0]).toMatchObject({ where: 'Cards › Untitled card 2', place: { tab: 'cards', card: 'sc2' }, focus: 'main [data-field="card"]' });
  });
});
