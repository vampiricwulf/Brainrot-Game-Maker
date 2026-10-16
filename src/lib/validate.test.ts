import { describe, expect, it, vi } from 'vitest';
import { jeopardyGame } from './testgame';
import { newImageEl, newTextEl, newVideoEl, questionSlides, setSlideText, textSlide, type Action, type BoardRound, type Game, type Slide } from './model';
import { newWheel } from './tools';
import { newBoardGameRound } from './boardgame';
import { newRpgRound } from './rpg';
import { addClueSlide, setClueType } from './ops';
import { setPartnerPoints } from './partner';
import { validate } from './validate';

describe('the checklist', () => {
  it('counts in words: "1 clue", "30 clues", "2 categories"', () => {
    const game = jeopardyGame();
    const round = game.rounds[0] as BoardRound;
    const texts = () => validate(game).map((p) => p.text);
    expect(texts()).toContain('Jeopardy!: 30 clues with no question');
    for (const c of round.categories) for (const cl of c.clues) setSlideText(cl.questionSlide, 'Q?');
    round.categories[0].clues[0].questionSlide.elements = [];
    round.categories[0].title = '';
    round.categories[1].title = ' ';
    expect(texts()).toContain('Jeopardy!: 1 clue with no question');
    expect(texts()).toContain('Jeopardy!: 2 categories with no name');
    expect(texts().some((t) => t.includes('(s)'))).toBe(false);
  });

  it("goes to a Final's side that has nothing on it", () => {
    const game = jeopardyGame();
    const final = game.rounds[1];
    const places = () => validate(game).filter((p) => p.tab === 1).map((p) => p.place);
    expect(places()).toEqual([
      { tab: 'round', round: final.id, part: { kind: 'final', side: 'q' } },
      { tab: 'round', round: final.id, part: { kind: 'final', side: 'a' } },
    ]);
  });

  it('warns of a tiebreaker ticked on but not written (a tie would put its blank slide on stream), and goes to that side', () => {
    const game = jeopardyGame();
    const mine = () => validate(game).filter((p) => p.tab === 'tiebreaker');
    expect(mine()).toEqual([]);
    game.tiebreaker = { questionSlide: textSlide(), answerSlide: textSlide() };
    expect(mine()).toEqual([
      { text: 'The tiebreaker has no question', tab: 'tiebreaker', level: 'warn', place: { tab: 'tiebreaker', side: 'q' } },
      { text: 'The tiebreaker has no answer', tab: 'tiebreaker', level: 'warn', place: { tab: 'tiebreaker', side: 'a' } },
    ]);
    // A question on any of its question slides will do.
    addClueSlide(game.tiebreaker, 0);
    setSlideText(questionSlides(game.tiebreaker)[1], 'Closest wins');
    setSlideText(game.tiebreaker.answerSlide, '42');
    expect(mine()).toEqual([]);
  });

  it('says when more Daily Doubles are placed than the ⭐ box says (not a warning: they all play)', () => {
    const game = jeopardyGame();
    const round = game.rounds[0] as BoardRound;
    round.dailyDoubleCount = 1;
    for (const c of round.categories.slice(0, 3)) c.clues[2].type = 'dailyDouble';
    expect(validate(game).find((p) => p.text.includes('Daily Doubles placed'))).toEqual({
      text: 'Jeopardy!: 3 Daily Doubles placed, but ⭐ Daily Doubles says 1 (all 3 play)',
      tab: 0,
      level: 'info',
    });
    round.dailyDoubleCount = 3;
    expect(validate(game).some((p) => p.text.includes('Daily Double'))).toBe(false);
  });

  it('sends a sound whose file is missing to 🔊 Sounds, other missing files to Media', () => {
    const game = jeopardyGame();
    game.audio.right = 'gone';
    game.audio.wrong = 'gone';
    expect(validate(game).filter((p) => p.text.includes('missing'))).toEqual([
      // (A player-only file has no 🔊 Sounds: its own words.)
      { text: '1 sound file missing: see 🔊 Sounds', tab: 'sounds', level: 'warn', player: '1 sound file missing from this game (the built-in sound plays instead)' },
    ]);
    game.media.push({ id: 'm2', name: 'pic.png', kind: 'image' } as never);
    expect(validate(game).find((p) => p.text === '1 media file missing')).toMatchObject({
      tab: 'media',
      player: '1 media file missing from this game: ask whoever made it for a new copy',
    });
    // One deleted but still on a tile too: its own words in a player-only file (not two identical lines).
    (game.rounds[0] as BoardRound).categories[0].clues[0].tileFace = { image: 'deleted1' };
    expect(validate(game).find((p) => p.text.includes('deleted file'))?.player).toBe('1 file used on slides but missing from this game: ask whoever made it for a new copy');
  });

  it('sends player problems to the Play screen, where players are set', () => {
    const game = jeopardyGame();
    game.players = [];
    expect(validate(game).find((p) => p.text.startsWith('No players yet'))).toMatchObject({ tab: 'play', level: 'info' });
    game.players = [
      { id: 'a', name: 'A', color: '#ff0000' },
      { id: 'b', name: 'B', color: '#FF0000' },
    ];
    expect(validate(game).find((p) => p.text === 'Two players share a color')).toMatchObject({ tab: 'play', level: 'warn' });
  });
});

describe('buttons on items, wheels and dice', () => {
  it('says which one points at something deleted, and goes there', async () => {
    const { newWheel, newDice } = await import('./tools');
    const game = jeopardyGame();
    const potion = { id: 'potion', name: 'Potion', stackable: true, onUse: [{ id: 'a1', do: 'shop' as const, shop: 'gone' }] };
    game.items = [potion];
    const wheel = newWheel('Chaos');
    wheel.segments[1].actions = [{ id: 'a2', do: 'item', item: '', qty: 1, op: 'give' }];
    game.wheels = [wheel];
    const dice = newDice('Fate');
    dice.totalOutcomes = [{ id: 't1', min: 1, max: 6, outcome: { label: 'Spin', actions: [{ id: 'a3', do: 'wheel', wheel: 'nope' }] } }];
    game.dice = [dice];
    const ps = validate(game);
    expect(ps).toContainEqual({ text: 'Item “Potion”: a Use button points nowhere (its shop no longer exists)', tab: 'stats', level: 'warn', place: { tab: 'stats', item: 'potion' } });
    expect(ps).toContainEqual({ text: 'Wheel “Chaos”: a slice\'s button points nowhere (no item chosen)', tab: 'tools', level: 'warn', place: { tab: 'tools', wheel: wheel.id } });
    expect(ps).toContainEqual({ text: 'Dice “Fate”: a button points nowhere (its wheel no longer exists)', tab: 'tools', level: 'warn', place: { tab: 'tools', dice: dice.id } });
    potion.onUse = [];
    wheel.segments[1].actions = [];
    dice.totalOutcomes = [];
    expect(validate(game).some((p) => p.text.includes('points nowhere'))).toBe(false);
  });
});

describe('🤝 partner clues', () => {
  /** A board with every tile written, and its first tile a Describe it partner clue. */
  function partnerGame() {
    const game = jeopardyGame();
    game.title = 'Night';
    const round = game.rounds[0] as BoardRound;
    for (const c of round.categories) for (const cl of c.clues) (setSlideText(cl.questionSlide, 'Q?'), setSlideText(cl.answerSlide, 'A'));
    round.categories[0].title = 'Movies';
    const clue = round.categories[0].clues[1];
    setClueType(round, clue, 'partner');
    return { game, round, clue };
  }
  const mine = (game: Game) => validate(game).filter((p) => /card|partner/i.test(p.text) && !p.text.includes('Older copies'));

  it('warns of an empty card and of a ready-made game with no card, going to the card', () => {
    const { game, round, clue } = partnerGame();
    const card = clue.cards![0];
    expect(mine(game)).toEqual([
      {
        text: "Movies $400: card 1 is empty: there's nothing on it to send",
        tab: 0,
        level: 'warn',
        place: { tab: 'round', round: round.id, part: { kind: 'clue', category: round.categories[0].id, clue: clue.id, side: 'card', slide: card.id } },
      },
      { text: 'Partner clues: without phone buzzers you copy the cards to the players yourself', tab: 'play', level: 'info' },
    ]);
    setSlideText(card, 'Shrek');
    game.settings.buzzer = true;
    expect(mine(game)).toEqual([]);
    delete clue.cards;
    expect(mine(game).map((p) => p.text)).toEqual(['Movies $400 is a Describe it partner clue with no card: the describer has nothing to describe']);
    clue.partner!.game = 'act';
    expect(mine(game).map((p) => p.text)).toEqual(['Movies $400 is an Act it out partner clue with no card: the actor has nothing to act out']);
    clue.partner!.game = 'describe';
    // A Custom game's cards are up to the host; a tile that isn't a partner clue (any more) has none to check.
    clue.partner!.game = 'custom';
    expect(mine(game)).toEqual([]);
    clue.partner!.game = 'describe';
    clue.type = 'standard';
    expect(mine(game)).toEqual([]);
  });

  it('warns of a card’s online link that has expired or soon will', () => {
    const { game, clue } = partnerGame();
    game.settings.buzzer = true;
    const pic = newImageEl('link1');
    clue.cards![0].elements.push(pic);
    game.media.push({ id: 'link1', name: 'shrek.png', mime: 'image/png', size: 0, kind: 'image', url: 'https://cdn.example.com/shrek.png', expiresAt: Date.now() - 1000 });
    expect(mine(game).map((p) => p.text)).toEqual(['Movies $400: card 1 has an online link that has expired: add that file again']);
    game.media[0].expiresAt = Date.now() + 60_000;
    expect(mine(game).map((p) => p.text)).toEqual(['Movies $400: card 1 has an online link that stops working soon: save a copy or add the file']);
  });

  it('warns of what won’t reach a phone: a file too big or of a kind phones can’t play, words past 1000', () => {
    // (Whether this browser plays the videos is another check's: here it does.)
    vi.stubGlobal('document', { createElement: () => ({ canPlayType: () => 'maybe' }) });
    const { game, clue } = partnerGame();
    game.settings.buzzer = true;
    const card = clue.cards![0];
    setSlideText(card, 'Shrek');
    card.elements.push({ ...newVideoEl('big'), y: 10 }, { ...newVideoEl('mov'), y: 20 }, { ...newImageEl('huge'), y: 30 });
    game.media.push(
      { id: 'big', name: 'clip.mp4', mime: 'video/mp4', size: 40 * 1024 * 1024, kind: 'video' },
      { id: 'mov', name: 'clip.mov', mime: 'video/quicktime', size: 1000, kind: 'video' },
      // (A picture is shrunk before it goes: any size will do.)
      { id: 'huge', name: 'huge.png', mime: 'image/png', size: 40 * 1024 * 1024, kind: 'image' },
    );
    expect(mine(game).map((p) => p.text)).toEqual([
      'Movies $400: card 1 has a video too big for phones (40.0 MB; phones get files up to 4.0 MB)',
      "Movies $400: card 1 has a video phones can't play: add it as MP4, WebM, MP3, OGG, WAV or M4A, or from a link",
    ]);
    card.elements = card.elements.filter((e) => e.kind !== 'video');
    setSlideText(card, 'x'.repeat(1001));
    expect(mine(game).map((p) => p.text)).toEqual(['Movies $400: card 1 has more than 1000 characters of words: phones get the first 1000']);
    vi.unstubAllGlobals();
  });

  it('with a buzzer server that takes no files: a card’s file from this computer won’t reach a phone (only then)', () => {
    const { game, clue } = partnerGame();
    game.settings.buzzer = true;
    const card = clue.cards![0];
    setSlideText(card, 'Shrek');
    card.elements.push({ ...newImageEl('pic'), y: 30 });
    game.media.push({ id: 'pic', name: 'ogre.png', mime: 'image/png', size: 1000, kind: 'image' });
    const warned = (filesOff: boolean) => validate(game, { filesOff }).filter((p) => p.text.startsWith('Movies $400: card 1')).map((p) => p.text);
    expect(warned(false)).toEqual([]);
    expect(warned(true)).toEqual([
      "Movies $400: card 1 has a picture that's a file on this computer, and this buzzer server isn't taking files: phones get the words and links only (📋 Copy picture)",
    ]);
    // (Never the file's name: the checklist can be on stream.)
    expect(warned(true).join()).not.toContain('ogre');
  });

  it('warns of the same on a 🎭 deal’s parts’ cards and on 🤫 Send a card buttons, going to each', () => {
    vi.stubGlobal('document', { createElement: () => ({ canPlayType: () => 'maybe' }) });
    const game = jeopardyGame();
    game.media.push({ id: 'big', name: 'huge-clip.mp4', mime: 'video/mp4', size: 40 * 1024 * 1024, kind: 'video' });
    const card = (): Slide => ({ background: {}, elements: [newTextEl('A secret'), { ...newVideoEl('big'), y: 10 }] });
    const send = (id: string): Action => ({ id, do: 'card', slide: card() });
    game.deals = [{ id: 'd1', name: 'Mafia', parts: [{ id: 'p1', name: 'Boss', count: 1, card: card() }, { id: 'p2', name: 'Town', count: 'rest', card: textSlide('Fine') }] }];
    game.items = [{ id: 'i1', name: 'Map', stackable: false, onUse: [send('b1')] }];
    game.wheels = [{ ...newWheel('Prizes'), id: 'w1' }];
    // (Two slices with the same trouble: said once.)
    game.wheels[0].segments[0].actions = [send('b2')];
    game.wheels[0].segments[1].actions = [send('b3')];
    const board = newBoardGameRound('Race');
    board.spaces[1].onLand = [send('b4')];
    game.rounds.push(board);
    const rpg = newRpgRound(game, 'Quest');
    const chest = { ...newImageEl('m0'), name: 'Chest' };
    chest.role = { class: 'interactable', actions: [send('b5')] };
    const world = game.worlds![0];
    world.maps[0].screens[0].slide.elements.push(chest);
    game.rounds.push(rpg);
    const too = 'has a video too big for phones (40.0 MB; phones get files up to 4.0 MB)';
    expect(validate(game).filter((p) => p.text.includes('too big'))).toEqual([
      { text: `Race: a 🤫 card on “${board.spaces[1].name}” ${too}`, tab: 2, level: 'warn', place: { tab: 'round', round: board.id, part: { kind: 'space', space: board.spaces[1].id } } },
      {
        text: `Quest: a 🤫 card on “Chest” on “Start” ${too}`,
        tab: 3,
        level: 'warn',
        place: { tab: 'world', world: world.id, map: world.maps[0].id, screen: world.maps[0].screens[0].id, look: undefined, inSlide: true, element: chest.id },
      },
      { text: `Item “Map”: a Use button’s 🤫 card ${too}`, tab: 'stats', level: 'warn', place: { tab: 'stats', item: 'i1' } },
      { text: `Wheel “Prizes”: a slice’s 🤫 card ${too}`, tab: 'tools', level: 'warn', place: { tab: 'tools', wheel: 'w1' } },
      { text: `Deal “Mafia”: Boss’s card ${too}`, tab: 'tools', level: 'warn', place: { tab: 'tools', deal: 'd1' } },
    ]);
    vi.unstubAllGlobals();
  });

  it('says where a miss still costs points with ⚖ Deduct on wrong off (a partner clue’s points are its own)', () => {
    const { game, round, clue } = partnerGame();
    game.settings.buzzer = true;
    setSlideText(clue.cards![0], 'Shrek');
    const deduct = () => validate(game).filter((p) => p.text.startsWith('Deduct on wrong is off'));
    expect(deduct()).toEqual([]);
    game.settings.deductOnWrong = false;
    expect(deduct()).toEqual([{ text: 'Deduct on wrong is off, but 1 partner clue takes points on a miss: its own Points say so', tab: 'play', level: 'info' }]);
    const other = round.categories[1].clues[2];
    setClueType(round, other, 'partner');
    expect(deduct().map((p) => p.text)).toEqual(['Deduct on wrong is off, but 2 partner clues take points on a miss: their own Points say so']);
    // Points “No penalty”: a miss costs nobody, so there's nothing to say about that clue.
    setPartnerPoints(other, 'none');
    expect(deduct().map((p) => p.text)).toEqual(['Deduct on wrong is off, but 1 partner clue takes points on a miss: its own Points say so']);
    setPartnerPoints(clue, 'none');
    expect(deduct()).toEqual([]);
  });

  it('says when files are used only on cards (an older copy’s Delete unused would delete them)', () => {
    const { game, clue } = partnerGame();
    game.settings.buzzer = true;
    setSlideText(clue.cards![0], 'Shrek');
    clue.cards![0].elements.push(newImageEl('pic'));
    game.media.push({ id: 'pic', name: 'shrek.png', mime: 'image/png', size: 10, kind: 'image' });
    const older = () => validate(game).filter((p) => p.text.includes('Older copies'));
    expect(older()).toHaveLength(1);
    expect(older()[0]).toMatchObject({ tab: 'media', level: 'info' });
    expect(older()[0].text).toMatch(/^1 file is used only on 🤫 cards/);
    // Used on the answer too: an older copy keeps it.
    clue.answerSlide.elements.push(newImageEl('pic'));
    expect(older()).toHaveLength(0);
  });
});
