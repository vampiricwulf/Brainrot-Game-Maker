import { describe, expect, it } from 'vitest';
import { uploadedFamily } from './fonts';
import { defaultEdits } from './imageedit';
import { isBoard, isFinal, newImageEl, newVideoEl, textSlide, type Action, type MediaRef, type Slide } from './model';
import { jeopardyGame } from './testgame';
import { allCardSlides, allSlides, mediaUsage } from './usage';
import { cardUses } from './phonecopies';
import { newBoardGameRound, newBoardSpace } from './boardgame';
import { newDeal } from './deals';
import { newRpgRound } from './rpg';
import { newDice, newWheel } from './tools';

const font = (id: string): MediaRef => ({ id, name: `${id}.ttf`, mime: 'font/ttf', size: 1, kind: 'font' });
const css = (id: string) => `'${uploadedFamily(id)}', sans-serif`;

describe('media usage', () => {
  it('counts uploaded fonts the theme uses, so Remove unused keeps them', () => {
    const game = jeopardyGame();
    game.media.push(font('board0001'), font('value0001'), font('clue00001'), font('spare0001'));
    game.theme.boardFont = css('board0001');
    game.theme.valueFont = css('value0001');
    game.theme.clueFont = css('clue00001');
    const used = mediaUsage(game);
    expect([used.get('board0001'), used.get('value0001'), used.get('clue00001'), used.get('spare0001')]).toEqual([1, 1, 1, undefined]);
  });

  it('counts fonts of text drawn onto pictures', () => {
    const game = jeopardyGame();
    game.media.push(font('drawn0001'));
    const img = newImageEl('pic');
    const text = { id: 't', text: 'Hi', x: 0.5, y: 0.5, size: 0.1, color: '#fff', stroke: '#000', strokeWidth: 0, rotation: 0 };
    img.edits = { ...defaultEdits(), texts: [{ ...text, font: css('drawn0001') }] };
    const round = game.rounds[0];
    if (isBoard(round)) round.categories[0].clues[0].questionSlide.elements.push(img);
    expect(mediaUsage(game).get('drawn0001')).toBe(1);
  });
});

describe('🤫 cards', () => {
  it('are walked like a clue’s slides, so 🗑 Delete unused keeps their files', () => {
    const game = jeopardyGame();
    const round = game.rounds[0];
    if (!isBoard(round)) throw new Error('not a board');
    const clue = round.categories[0].clues[1];
    clue.type = 'partner';
    clue.cards = [{ id: 'c1', background: { image: 'bg' }, elements: [newImageEl('pic')], to: 'giver' }];
    expect([mediaUsage(game).get('pic'), mediaUsage(game).get('bg')]).toEqual([1, 1]);
    expect(allSlides(game).map((s) => s.where)).toContain('Jeopardy! · Category 1 #2 (card 1)');
    // Any tile's cards play (cards anywhere, P3), so a standard tile's are walked too.
    clue.type = 'standard';
    expect(mediaUsage(game).get('pic')).toBe(1);
    expect(allSlides(game).some((s) => s.where.includes('(card 1)'))).toBe(true);
    expect(allSlides(game, { empty: true }).some((s) => s.where.includes('(card 1)'))).toBe(true);
    // A named one says its name (🖼 Media's "where used").
    clue.cards[0].name = 'Clue tip';
    expect(allSlides(game).map((s) => s.where)).toContain('Jeopardy! · Category 1 #2 (card “Clue tip”)');
  });

  it('a Final’s are walked too, after its answer, by their place or name', () => {
    const game = jeopardyGame();
    const final = game.rounds[1];
    if (!isFinal(final)) throw new Error('not a Final');
    final.cards = [
      { id: 'f1', background: { image: 'bg' }, elements: [newImageEl('pic')], to: 'playing' },
      { id: 'f2', name: 'Leader hint', ...textSlide('Go big'), to: 'nobody' },
    ];
    expect([mediaUsage(game).get('pic'), mediaUsage(game).get('bg')]).toEqual([1, 1]);
    const where = allSlides(game).map((s) => s.where);
    expect(where.slice(where.indexOf('Final Jeopardy! (answer)'), where.indexOf('Final Jeopardy! (answer)') + 3)).toEqual([
      'Final Jeopardy! (answer)',
      'Final Jeopardy! (card 1)',
      'Final Jeopardy! (card “Leader hint”)',
    ]);
    delete final.cards;
    expect(mediaUsage(game).get('pic')).toBeUndefined();
  });
});

describe('the editor’s 🤫 Cards', () => {
  it('are walked as slides of their own, by name, so 🗑 Delete unused keeps their files', () => {
    const game = jeopardyGame();
    game.cards = [
      { id: 'sc1', name: 'Tip A', background: { image: 'bg' }, elements: [...textSlide('Hi').elements, newImageEl('pic')] },
      { id: 'sc2', name: ' ', ...textSlide('') },
    ];
    const where = allSlides(game).map((s) => s.where);
    expect(where).toContain('Card: Tip A');
    // One left blank is named by its place in the list.
    expect(where).toContain('Card: Untitled card 2');
    expect(allSlides(game).find((s) => s.where === 'Card: Tip A')?.slide).toBe(game.cards[0]);
    expect([mediaUsage(game).get('pic'), mediaUsage(game).get('bg')]).toEqual([1, 1]);
    delete game.cards;
    expect(mediaUsage(game).get('pic')).toBeUndefined();
  });
});

describe('every 🤫 card in the game (allCardSlides)', () => {
  it('finds a card in each place one is sent from, and none on an empty tile or a plain slide', () => {
    const game = jeopardyGame();
    const card = (n: string): Slide => ({ background: {}, elements: [{ ...newVideoEl(n), id: `v_${n}` }] });
    const send = (n: string): Action => ({ id: `a_${n}`, do: 'card', slide: card(n) });
    const board = game.rounds[0];
    const final = game.rounds[1];
    if (!isBoard(board) || !isFinal(final)) throw new Error('not a board and a Final');
    board.categories[0].clues[0].cards = [{ id: 'tc', ...card('tile'), to: 'giver' }];
    board.categories[0].clues[1].cards = [{ id: 'ec', ...card('empty'), to: 'giver' }];
    board.categories[0].clues[1].empty = true;
    board.categories[0].clues[2].questionSlide = card('slide');
    final.cards = [{ id: 'fc', ...card('final'), to: 'playing' }];
    game.cards = [{ id: 'sc', name: 'Tip', ...card('saved') }];
    game.items = [{ id: 'it', name: 'Map', stackable: false, onUse: [send('item')] }];
    const wheel = newWheel('Spin');
    wheel.segments[0].actions = [send('wheel')];
    const dice = newDice('Roll');
    dice.totalOutcomes = [{ id: 'to', min: 1, max: 6, outcome: { label: 'Any', actions: [send('dice')] } }];
    game.wheels = [wheel];
    game.dice = [dice];
    const deal = newDeal('Spies');
    deal.parts[0].card = card('deal');
    game.deals = [deal];
    const rpg = newRpgRound(game, 'Quest');
    const screen = game.worlds![0].maps[0].screens[0];
    screen.slide.elements.push({ ...newImageEl('door'), id: 'door', role: { class: 'npc', actions: [send('rpg')] } });
    screen.variants = [{ id: 'night', name: 'Night', slide: { background: {}, elements: [{ ...newImageEl('door'), id: 'door2', role: { class: 'npc', actions: [send('look')] } }] } }];
    const bg = newBoardGameRound('Race');
    const space = newBoardSpace(0, 0, 'Bonus');
    space.onLand = [send('space')];
    bg.spaces = [space];
    game.rounds.push(rpg, bg);
    const found = allCardSlides(game).flatMap((r) => r.slide.elements.flatMap((e) => (e.kind === 'video' ? [e.media] : [])));
    expect(found.sort()).toEqual(['deal', 'dice', 'final', 'item', 'look', 'rpg', 'saved', 'space', 'tile', 'wheel']);
    // (The deal's other part is a card too, with words only.)
    expect(allCardSlides(game).filter((r) => r.where.startsWith('Deal: Spies'))).toHaveLength(2);
    expect(allCardSlides(game).map((r) => r.where)).toContain('Card: Tip');
  });

  it('says where each of a file’s videos and sounds on cards starts and stops (not on other slides)', () => {
    const game = jeopardyGame();
    const board = game.rounds[0];
    if (!isBoard(board)) throw new Error('not a board');
    board.categories[0].clues[0].questionSlide.elements.push({ ...newVideoEl('clip'), startAt: 50 });
    game.cards = [
      { id: 'a', name: 'A', background: {}, elements: [{ ...newVideoEl('clip'), startAt: 12, endAt: 20 }, { ...newVideoEl('other'), startAt: 1 }] },
      { id: 'b', name: 'B', background: {}, elements: [newVideoEl('clip')] },
    ];
    expect(cardUses(game, 'clip')).toEqual([{ start: 12, end: 20 }, {}]);
  });
});
