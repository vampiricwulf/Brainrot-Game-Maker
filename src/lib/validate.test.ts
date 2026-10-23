import { describe, expect, it, vi } from 'vitest';
import { jeopardyGame } from './testgame';
import { newImageEl, newSlidesRound, newTextEl, newVideoEl, questionSlides, setSlideText, textSlide, type Action, type BoardRound, type FinalRound, type Game, type SavedCard, type Slide } from './model';
import { newWheel } from './tools';
import { newBoardGameRound } from './boardgame';
import { newRpgRound, newVariant } from './rpg';
import { addClueSlide, setClueType } from './ops';
import { addCard } from './partner';
import { nameGivesAway, savedCardProblems, validate } from './validate';
import { OLD_FILE_LIMITS } from './buzzproto';
import type { Verdict } from './shrink/playable';

/** How big a file the buzzer server takes in these tests (one that doesn't say: 16 MB). */
const OLD = { fileBytes: OLD_FILE_LIMITS.fileBytes };

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

  it('names where a deleted file is still used, and its line goes there', () => {
    const game = jeopardyGame();
    const intro = newSlidesRound();
    game.rounds.unshift(intro);
    const pic = newImageEl('gone1', 100, 100);
    intro.questionSlide.elements.push(pic);
    expect(validate(game).find((p) => p.text.includes('deleted file'))).toMatchObject({
      text: '1 deleted file still used on Introduction › Slide 1 › Image: not saved with the game. Undo the delete in History, or take it off there',
      tab: 'media',
      place: { tab: 'round', round: intro.id, part: { kind: 'slides', element: pic.id } },
    });
    (game.rounds[1] as BoardRound).categories[0].clues[0].tileFace = { image: 'gone1' };
    expect(validate(game).find((p) => p.text.includes('deleted file'))?.text).toMatch(/^1 deleted file still used on Introduction › Slide 1 › Image and 1 more place: .* off those slides$/);
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

describe('✍ multiple choice', () => {
  it('warns of an empty choice, only one, or two the same, and notes none marked ✔ Right; only on ✍ standard tiles', () => {
    const game = jeopardyGame();
    // (With phone buzzers: without them there's a line of its own, below.)
    game.settings.buzzer = true;
    const round = game.rounds[0] as BoardRound;
    const [a, b, c, d] = round.categories[0].clues;
    for (const cl of [a, b, c, d]) cl.everyone = true;
    a.choices = [{ id: '1', text: 'Paris', right: true }, { id: '2', text: '' }, { id: '3', text: 'Oslo' }];
    b.choices = [{ id: '1', text: 'Paris' }];
    c.choices = [{ id: '1', text: 'Oslo', right: true }, { id: '2', text: ' oslo ' }];
    d.choices = [{ id: '1', text: 'Paris' }, { id: '2', text: 'Oslo' }];
    const mine = () => validate(game).filter((p) => p.text.includes('choice'));
    const at = (cl: typeof a) => ({ tab: 'round', round: round.id, part: { kind: 'clue', category: round.categories[0].id, clue: cl.id } });
    expect(mine()).toEqual([
      { text: 'Jeopardy!: 1 ✍ clue with an empty choice', tab: 0, level: 'warn', place: at(a) },
      { text: 'Jeopardy!: 1 ✍ clue with only one choice (add another, or take it off)', tab: 0, level: 'warn', place: at(b) },
      { text: 'Jeopardy!: 1 ✍ clue with two choices the same', tab: 0, level: 'warn', place: at(c) },
      { text: 'Jeopardy!: 1 ✍ clue with choices but none marked ✔ Right (you judge each answer)', tab: 0, level: 'info', place: at(d) },
    ]);
    // Counted per tile; ✍ unticked (kept, unused), or another type: not counted.
    b.choices = [{ id: '1', text: '' }, { id: '2', text: 'Oslo' }];
    delete c.everyone;
    d.type = 'dailyDouble';
    expect(mine().map((p) => p.text)).toEqual(['Jeopardy!: 2 ✍ clues with an empty choice']);
  });

  it('a Final’s too, while its players type their answers on their phones', () => {
    const game = jeopardyGame();
    game.settings.buzzer = true;
    const i = game.rounds.findIndex((r) => r.mode === 'final');
    const fin = game.rounds[i] as FinalRound;
    fin.choices = [{ id: '1', text: 'Paris' }, { id: '2', text: '' }, { id: '3', text: 'paris' }];
    const mine = () => validate(game).filter((p) => p.text.includes('choice'));
    const place = { tab: 'round', round: fin.id };
    expect(mine()).toEqual([
      { text: 'Final Jeopardy! has an empty choice', tab: i, level: 'warn', place },
      { text: 'Final Jeopardy! has two choices the same', tab: i, level: 'warn', place },
      { text: 'Final Jeopardy! has choices but none marked ✔ Right (the reveals won’t say whose pick is right)', tab: i, level: 'info', place },
    ]);
    fin.choices = [{ id: '1', text: 'Paris', right: true }];
    expect(mine().map((p) => p.text)).toEqual(['Final Jeopardy! has only one choice (add another, or take it off)']);
    // Answers on paper: kept, unused.
    fin.phoneAnswersOff = true;
    expect(mine()).toEqual([]);
  });

  it('notes that without phone buzzers the choices show on stream and players say the letter', () => {
    const game = jeopardyGame();
    const line = () => validate(game).find((p) => p.text.startsWith('Multiple choice:'));
    const clue = (game.rounds[0] as BoardRound).categories[0].clues[0];
    clue.choices = [{ id: '1', text: 'Paris' }, { id: '2', text: 'Oslo' }];
    expect(line()).toBeUndefined();
    clue.everyone = true;
    expect(line()).toEqual({ text: 'Multiple choice: without phone buzzers, the choices show on stream and players say the letter', tab: 'play', level: 'info' });
    game.settings.buzzer = true;
    expect(line()).toBeUndefined();
    // A Final's too (while its players would type their answers).
    game.settings.buzzer = false;
    delete clue.everyone;
    const fin = game.rounds.find((r) => r.mode === 'final') as FinalRound;
    fin.choices = clue.choices;
    expect(line()?.tab).toBe('play');
    fin.phoneAnswersOff = true;
    expect(line()).toBeUndefined();
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
  const mine = (game: Game, room = OLD) => validate(game, room).filter((p) => /card|partner/i.test(p.text) && !p.text.includes('Older copies'));

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

  it('says a named card by its name; notes a name that repeats what’s on it, the question or the answer, and two cards called alike', () => {
    const { game, round, clue } = partnerGame();
    game.settings.buzzer = true;
    setSlideText(clue.answerSlide, 'Shrek');
    const card = clue.cards![0];
    const at = (id: string) => ({ tab: 'round', round: round.id, part: { kind: 'clue', category: round.categories[0].id, clue: clue.id, side: 'card', slide: id } });
    card.name = 'Tip';
    expect(mine(game).map((p) => p.text)).toEqual(["Movies $400: card “Tip” is empty: there's nothing on it to send"]);
    setSlideText(card, 'Ogre');
    expect(mine(game)).toEqual([]);
    // The answer is what viewers mustn't read in the panel while the tile is open.
    card.name = 'Shrek tip';
    expect(nameGivesAway(game, card)).toBe(false);
    expect(nameGivesAway(game, card, [clue.answerSlide])).toBe(true);
    expect(mine(game)).toEqual([
      {
        text: 'Movies $400: the name of card “Shrek tip” repeats what’s on it, the question or the answer, and in one window viewers can read a card’s name in the host panel',
        tab: 0,
        level: 'info',
        place: at(card.id),
      },
    ]);
    // (Its own words too.)
    card.name = 'Ogre hint';
    expect(mine(game).map((p) => p.text)).toEqual(['Movies $400: the name of card “Ogre hint” repeats what’s on it, the question or the answer, and in one window viewers can read a card’s name in the host panel']);
    // (The question too: a Daily Double's cards are in the panel during its wager, before the question is shown.)
    setSlideText(clue.questionSlide, 'Swamp');
    card.name = 'Swamp tip';
    expect(mine(game).map((p) => p.text)).toEqual(['Movies $400: the name of card “Swamp tip” repeats what’s on it, the question or the answer, and in one window viewers can read a card’s name in the host panel']);
    card.name = 'Clue tip';
    expect(mine(game)).toEqual([]);
    // Card 1 called "Card 2" beside an unnamed card 2: said once, going to the second.
    card.name = 'card 2';
    const second = addCard(clue)!;
    setSlideText(second, 'More');
    expect(mine(game)).toEqual([{ text: 'Movies $400 has two cards called “Card 2”: in the host panel you can’t tell them apart', tab: 0, level: 'info', place: at(second.id) }]);
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
      'Movies $400: card 1 has a video too big to send to phones (40.0 MB; this buzzer server takes files up to 16.0 MB): add it from a link instead',
      "Movies $400: card 1 has a video phones can't play: add it as MP4, WebM, MP3, OGG, WAV or M4A, or from a link",
    ]);
    // The buzzer server's own limit: too big says its number, and with a server that takes it, it's only a note (over
    // 16 MB, phones on mobile data may wait for it).
    expect(mine(game, { fileBytes: 24 * 1024 * 1024 }).map((p) => p.text)[0]).toBe('Movies $400: card 1 has a video too big to send to phones (40.0 MB; this buzzer server takes files up to 24.0 MB): add it from a link instead');
    expect(mine(game, { fileBytes: 40 * 1024 * 1024 }).map((p) => [p.level, p.text])).toEqual([
      ['info', 'Movies $400: card 1 has a video of 40.0 MB: phones on mobile data may wait a while for it (WiFi is fine)'],
      ['warn', "Movies $400: card 1 has a video phones can't play: add it as MP4, WebM, MP3, OGG, WAV or M4A, or from a link"],
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
    // (A screen's looks have copies of its objects: said once, going to the screen's own.)
    const start = world.maps[0].screens[0];
    start.variants = [newVariant(undefined, start, 'Night'), newVariant(undefined, start, 'Open')];
    game.rounds.push(rpg);
    const big = 'has a video too big to send to phones (40.0 MB; this buzzer server takes files up to 16.0 MB)';
    const too = `${big}: add it from a link instead`;
    // (A player-only file can't add one from a link.)
    const shown = `${big}: the host shows it on stream instead`;
    expect(validate(game, OLD).filter((p) => p.text.includes('too big'))).toEqual([
      {
        text: `Race: a 🤫 card on “${board.spaces[1].name}” ${too}`,
        tab: 2,
        level: 'warn',
        place: { tab: 'round', round: board.id, part: { kind: 'space', space: board.spaces[1].id } },
        player: `Race: a 🤫 card on “${board.spaces[1].name}” ${shown}`,
      },
      {
        text: `Quest: a 🤫 card on “Chest” on “Start” ${too}`,
        tab: 3,
        level: 'warn',
        place: { tab: 'world', world: world.id, map: world.maps[0].id, screen: world.maps[0].screens[0].id, look: undefined, inSlide: true, element: chest.id },
        player: `Quest: a 🤫 card on “Chest” on “Start” ${shown}`,
      },
      { text: `Item “Map”: a Use button’s 🤫 card ${too}`, tab: 'stats', level: 'warn', place: { tab: 'stats', item: 'i1' }, player: `Item “Map”: a Use button’s 🤫 card ${shown}` },
      { text: `Wheel “Prizes”: a slice’s 🤫 card ${too}`, tab: 'tools', level: 'warn', place: { tab: 'tools', wheel: 'w1' }, player: `Wheel “Prizes”: a slice’s 🤫 card ${shown}` },
      { text: `Deal “Mafia”: Boss’s card ${too}`, tab: 'tools', level: 'warn', place: { tab: 'tools', deal: 'd1' }, player: `Deal “Mafia”: Boss’s card ${shown}` },
    ]);
    vi.unstubAllGlobals();
  });

  it('says nothing new with ⚖ Show quick ✔/✘ buttons off: it only hides the buttons, and a miss still costs points', () => {
    const { game, clue } = partnerGame();
    game.settings.buzzer = true;
    setSlideText(clue.cards![0], 'Shrek');
    const before = validate(game);
    game.settings.deductOnWrong = false;
    expect(validate(game)).toEqual(before);
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

describe('a Final’s 🤫 cards', () => {
  /** A game whose Final has its question and answer ("Shrek"), and a card "Leader hint" with words on it. */
  function finalGame() {
    const game = jeopardyGame();
    const final = game.rounds[1] as FinalRound;
    setSlideText(final.questionSlide, 'Q?');
    setSlideText(final.answerSlide, 'Shrek');
    const card = addCard(final, 'playing')!;
    setSlideText(card, 'Go big');
    card.name = 'Leader hint';
    return { game, final, card };
  }
  const mine = (game: Game, filesOff = false) => validate(game, { ...OLD, filesOff }).filter((p) => p.tab === 1);
  const at = (final: FinalRound, id: string) => ({ tab: 'round', round: final.id, part: { kind: 'final', side: 'card', slide: id } });

  it('says nothing of one with something on it', () => {
    expect(mine(finalGame().game)).toEqual([]);
  });

  it('warns of an empty one by its name or its place, going to that card', () => {
    const { game, final, card } = finalGame();
    const empty = addCard(final, 'playing')!;
    expect(mine(game)).toEqual([{ text: "Final Jeopardy!: card 2 is empty: there's nothing on it to send", tab: 1, level: 'warn', place: at(final, empty.id) }]);
    setSlideText(card, '');
    expect(mine(game).map((p) => p.text)).toEqual(["Final Jeopardy!: card “Leader hint” is empty: there's nothing on it to send", "Final Jeopardy!: card 2 is empty: there's nothing on it to send"]);
  });

  it('warns of more than six, going to the seventh', () => {
    const { game, final } = finalGame();
    for (let i = 0; i < 5; i++) setSlideText(addCard(final, 'playing')!, `More ${i}`);
    expect(mine(game)).toEqual([]);
    const seventh = { ...final.cards![0], id: 'c7', name: undefined };
    final.cards!.push(seventh);
    expect(mine(game)).toEqual([{ text: 'Final Jeopardy! has 7 cards: a Final holds 6 (＋ Card adds no more)', tab: 1, level: 'warn', place: at(final, 'c7') }]);
  });

  it('warns of what won’t reach a phone, as a tile’s card', () => {
    vi.stubGlobal('document', { createElement: () => ({ canPlayType: () => 'maybe' }) });
    const { game, final, card } = finalGame();
    card.elements.push({ ...newVideoEl('big'), y: 10 }, { ...newImageEl('pic'), y: 20 });
    game.media.push(
      { id: 'big', name: 'zfnqj.mp4', mime: 'video/mp4', size: 40 * 1024 * 1024, kind: 'video' },
      { id: 'pic', name: 'ogre.png', mime: 'image/png', size: 1000, kind: 'image' },
    );
    expect(mine(game)).toEqual([
      {
        text: 'Final Jeopardy!: card “Leader hint” has a video too big to send to phones (40.0 MB; this buzzer server takes files up to 16.0 MB): add it from a link instead',
        tab: 1,
        level: 'warn',
        place: at(final, card.id),
        player: 'Final Jeopardy!: card “Leader hint” has a video too big to send to phones (40.0 MB; this buzzer server takes files up to 16.0 MB): the host shows it on stream instead',
      },
    ]);
    expect(mine(game, true).map((p) => p.text)).toContain(
      "Final Jeopardy!: card “Leader hint” has a picture that's a file on this computer, and this buzzer server isn't taking files: phones get the words and links only (📋 Copy picture)",
    );
    expect(mine(game, true).map((p) => p.text).join()).not.toMatch(/zfnqj|ogre/);
    vi.unstubAllGlobals();
  });

  it('notes a name that repeats what’s on it, the Final’s question or its answer, and two cards called alike', () => {
    const { game, final, card } = finalGame();
    card.name = 'Shrek hint';
    expect(mine(game)).toEqual([
      {
        text: 'Final Jeopardy!: the name of card “Shrek hint” repeats what’s on it, the question or the answer, and in one window viewers can read a card’s name in the host panel',
        tab: 1,
        level: 'info',
        place: at(final, card.id),
      },
    ]);
    // Its question: in the panel from the wagers on, while the question is still hidden.
    setSlideText(final.questionSlide, 'Bald eagle');
    card.name = 'Bald eagle hint';
    expect(mine(game).map((p) => p.text)).toEqual(['Final Jeopardy!: the name of card “Bald eagle hint” repeats what’s on it, the question or the answer, and in one window viewers can read a card’s name in the host panel']);
    card.name = 'Card 2';
    const second = addCard(final, 'nobody')!;
    setSlideText(second, 'Side bet');
    expect(mine(game)).toEqual([{ text: 'Final Jeopardy! has two cards called “Card 2”: in the host panel you can’t tell them apart', tab: 1, level: 'info', place: at(final, second.id) }]);
  });

  it('counts a file used only on one as used only on cards (an older copy’s Delete unused would delete it)', () => {
    const { game, card } = finalGame();
    card.elements.push(newImageEl('pic'));
    game.media.push({ id: 'pic', name: 'hint.png', mime: 'image/png', size: 10, kind: 'image' });
    expect(validate(game).filter((p) => p.text.includes('Older copies')).map((p) => p.text)).toEqual([expect.stringMatching(/^1 file is used only on 🤫 cards/)]);
  });
});

describe('🤫 Cards (the editor’s tab)', () => {
  const card = (id: string, name: string, ...els: Slide['elements']): SavedCard => ({ id, name, background: {}, elements: els });
  const mine = (game: Game, filesOff = false) => validate(game, { ...OLD, filesOff }).filter((p) => p.tab === 'cards');

  it('warns of an empty card, going to it', () => {
    const game = jeopardyGame();
    game.cards = [card('sc1', 'Tip A', newTextEl(' ')), card('sc2', '', newTextEl('Bring a spoon'))];
    expect(mine(game)).toEqual([{ text: "🤫 Card “Tip A” is empty: there's nothing on it to send", tab: 'cards', level: 'warn', place: { tab: 'cards', card: 'sc1' } }]);
    // One left blank is named by its place in the list.
    game.cards[1].elements = [];
    expect(mine(game).map((p) => p.text)).toContain("🤫 Card “Untitled card 2” is empty: there's nothing on it to send");
    delete game.cards;
    expect(mine(game)).toEqual([]);
  });

  it('warns of what of one won’t reach a phone: a file too big, a file from this computer with a server that takes none', () => {
    vi.stubGlobal('document', { createElement: () => ({ canPlayType: () => 'maybe' }) });
    const game = jeopardyGame();
    game.media.push(
      { id: 'big', name: 'clip.mp4', mime: 'video/mp4', size: 40 * 1024 * 1024, kind: 'video' },
      { id: 'pic', name: 'ogre.png', mime: 'image/png', size: 1000, kind: 'image' },
    );
    game.cards = [card('sc1', 'Tip A', newTextEl('A secret'), { ...newVideoEl('big'), y: 10 })];
    expect(mine(game)).toEqual([
      {
        text: '🤫 Card “Tip A” has a video too big to send to phones (40.0 MB; this buzzer server takes files up to 16.0 MB): add it from a link instead',
        tab: 'cards',
        level: 'warn',
        place: { tab: 'cards', card: 'sc1' },
        player: '🤫 Card “Tip A” has a video too big to send to phones (40.0 MB; this buzzer server takes files up to 16.0 MB): the host shows it on stream instead',
      },
    ]);
    game.cards[0].elements = [newTextEl('A secret'), { ...newImageEl('pic'), y: 10 }];
    expect(mine(game)).toEqual([]);
    expect(mine(game, true).map((p) => p.text)).toEqual([
      "🤫 Card “Tip A” has a picture that's a file on this computer, and this buzzer server isn't taking files: phones get the words and links only (📋 Copy picture)",
    ]);
    // (The same lines on their own, for the checklist.)
    expect(savedCardProblems(game, { ...OLD, filesOff: true })).toEqual(mine(game, true));
    vi.unstubAllGlobals();
  });

  it('a file over 16 MB that the server takes is a note (the editor’s only: the pre-game list keeps warnings); one over its limit, a warning', () => {
    vi.stubGlobal('document', { createElement: () => ({ canPlayType: () => 'maybe' }) });
    const MB = 1024 * 1024;
    const game = jeopardyGame();
    game.media.push(
      { id: 'mid', name: 'zfnqj-mid.mp4', mime: 'video/mp4', size: 17 * MB, kind: 'video' },
      { id: 'big', name: 'zfnqj-big.mp4', mime: 'video/mp4', size: 25 * MB, kind: 'video' },
      { id: 'gif', name: 'zfnqj.gif', mime: 'image/gif', size: 20 * MB, kind: 'image' },
      // (A picture is shrunk before it goes: never a note.)
      { id: 'pic', name: 'zfnqj.png', mime: 'image/png', size: 30 * MB, kind: 'image' },
    );
    game.cards = [card('sc1', 'Tip', newTextEl('A secret'), { ...newVideoEl('mid'), y: 10 }, { ...newVideoEl('big'), y: 20 }, { ...newImageEl('gif'), y: 30 }, { ...newImageEl('pic'), y: 40 })];
    const lines = validate(game, { fileBytes: 24 * MB }).filter((p) => p.tab === 'cards');
    expect(lines.map((p) => [p.level, p.text, p.player])).toEqual([
      ['info', '🤫 Card “Tip” has a video of 17.0 MB: phones on mobile data may wait a while for it (WiFi is fine)', undefined],
      [
        'warn',
        '🤫 Card “Tip” has a video too big to send to phones (25.0 MB; this buzzer server takes files up to 24.0 MB): add it from a link instead',
        '🤫 Card “Tip” has a video too big to send to phones (25.0 MB; this buzzer server takes files up to 24.0 MB): the host shows it on stream instead',
      ],
      ['info', '🤫 Card “Tip” has a GIF of 20.0 MB: phones on mobile data may wait a while for it (WiFi is fine)', undefined],
    ]);
    // The pre-game screen keeps the warnings only (Play.svelte's gameChecks): the one too big.
    expect(lines.filter((p) => p.level === 'warn').map((p) => p.text)).toEqual([
      '🤫 Card “Tip” has a video too big to send to phones (25.0 MB; this buzzer server takes files up to 24.0 MB): add it from a link instead',
    ]);
    // (Never a file's name: the checklist can be on stream.)
    expect(JSON.stringify(lines)).not.toContain('zfnqj');
    // An older server's 16 MB: both videos and the GIF are too big, nothing is a note.
    expect(validate(game, OLD).filter((p) => p.tab === 'cards').map((p) => p.level)).toEqual(['warn', 'warn', 'warn']);
    vi.unstubAllGlobals();
  });

  it('a GIF 🗜 can make a smaller copy of says so, with the file to copy (never named); one with a copy goes by the copy', () => {
    vi.stubGlobal('document', { createElement: () => ({ canPlayType: () => 'maybe' }) });
    const MB = 1024 * 1024;
    const game = jeopardyGame();
    game.media.push(
      { id: 'gif', name: 'zfnqj.gif', mime: 'image/gif', size: 20 * MB, kind: 'image' },
      { id: 'big', name: 'zfnqj-big.gif', mime: 'image/gif', size: 30 * MB, kind: 'image' },
    );
    game.cards = [card('sc1', 'Tip', newTextEl('A secret'), { ...newImageEl('gif'), y: 30 }, { ...newImageEl('big'), y: 40 })];
    const canShrink = (m: { kind: string }) => m.kind === 'image';
    const lines = validate(game, { fileBytes: 24 * MB, canShrink }).filter((p) => p.tab === 'cards');
    expect(lines.map((p) => [p.level, p.text, p.shrink])).toEqual([
      ['info', '🤫 Card “Tip” has a GIF of 20.0 MB: phones on mobile data may wait a while for it (WiFi is fine)', 'gif'],
      ['warn', '🤫 Card “Tip” has a GIF too big to send to phones (30.0 MB; this buzzer server takes files up to 24.0 MB): make a smaller copy for phones (🗜) or add it from a link', 'big'],
    ]);
    expect(JSON.stringify(lines.map((p) => [p.text, p.player]))).not.toContain('zfnqj');
    // The pre-game screen (no 🗜 there): as before.
    expect(validate(game, { fileBytes: 24 * MB }).filter((p) => p.tab === 'cards').map((p) => p.text)[1]).toMatch(/: add it from a link instead$/);
    // A copy of the big one, here: it goes, small enough, so no line; its bytes not here: the GIF itself again.
    game.media.push({ id: 'bigc', name: 'zfnqj-big (phones).webm', mime: 'video/webm', size: 1 * MB, kind: 'video', phoneCopy: { of: 'big' } });
    expect(validate(game, { fileBytes: 24 * MB, canShrink }).filter((p) => p.tab === 'cards').map((p) => p.shrink)).toEqual(['gif']);
    expect(validate(game, { fileBytes: 24 * MB, canShrink, stored: (id) => id !== 'bigc' }).filter((p) => p.tab === 'cards').map((p) => p.shrink)).toEqual(['gif', 'big']);
    vi.unstubAllGlobals();
  });

  it('a video phones can’t play that 🗜 can make a copy of says so, with the file to copy; its copy clears the line', () => {
    vi.stubGlobal('document', { createElement: () => ({ canPlayType: () => 'maybe' }) });
    const game = jeopardyGame();
    game.media.push({ id: 'mov', name: 'zfnqj.mov', mime: 'video/quicktime', size: 5000, kind: 'video' });
    game.cards = [card('sc1', 'Tip', newTextEl('A secret'), { ...newVideoEl('mov'), y: 30 })];
    const canShrink = (m: { kind: string }) => m.kind === 'video';
    const said = (room = {}) => validate(game, room).filter((p) => p.tab === 'cards');
    expect(said({ canShrink }).map((p) => [p.level, p.text, p.shrink])).toEqual([
      ['warn', "🤫 Card “Tip” has a video phones can't play: make a copy they can play (🗜), or add it as MP4, WebM, MP3, OGG, WAV or M4A, or from a link", 'mov'],
    ]);
    // Where 🗜 can't: as before.
    expect(said().map((p) => [p.text, p.shrink])).toEqual([["🤫 Card “Tip” has a video phones can't play: add it as MP4, WebM, MP3, OGG, WAV or M4A, or from a link", undefined]]);
    game.media.push({ id: 'movc', name: 'zfnqj (phones).webm', mime: 'video/webm', size: 4000, kind: 'video', phoneCopy: { of: 'mov' } });
    expect(said({ canShrink })).toEqual([]);
    vi.unstubAllGlobals();
  });

  it('one phones can’t open that plays here, the same video and sound fitting a type they take: ↻, with the file to repackage', () => {
    vi.stubGlobal('document', { createElement: () => ({ canPlayType: () => 'maybe' }) });
    const game = jeopardyGame();
    game.media.push({ id: 'mkv', name: 'zfnqj.mkv', mime: 'video/x-matroska', size: 5000, kind: 'video' });
    game.cards = [card('sc1', 'Tip', newTextEl('A secret'), { ...newVideoEl('mkv'), y: 30 })];
    const canShrink = (m: { kind: string }) => m.kind === 'video';
    const plays = (): Verdict => ({ is: 'plays', repack: { video: 'keep', audio: 'keep', box: 'webm' } });
    const lines = validate(game, { canShrink, plays }).filter((p) => p.tab === 'cards');
    expect(lines.map((p) => [p.level, p.text, p.shrink, p.convert])).toEqual([
      ['warn', "🤫 Card “Tip” has a video phones can't open: repackage it as a WebM (↻, nothing lost), or add it as MP4, WebM, MP3, OGG, WAV or M4A, or from a link", undefined, ['mkv']],
    ]);
    // Not worked out yet, or nothing to repackage it as: 🗜, as before.
    expect(validate(game, { canShrink }).filter((p) => p.tab === 'cards').map((p) => [p.shrink, p.convert])).toEqual([['mkv', undefined]]);
    expect(validate(game, { canShrink, plays: () => ({ is: 'plays', repack: null }) }).filter((p) => p.tab === 'cards').map((p) => p.shrink)).toEqual(['mkv']);
    // Before the game (no ↻ there): 🗜's words and button, though ↻ could repackage it.
    expect(validate(game, { canShrink, plays, repack: false }).filter((p) => p.tab === 'cards').map((p) => [p.text, p.shrink, p.convert])).toEqual([
      ["🤫 Card “Tip” has a video phones can't play: make a copy they can play (🗜), or add it as MP4, WebM, MP3, OGG, WAV or M4A, or from a link", 'mkv', undefined],
    ]);
    vi.unstubAllGlobals();
  });

  it('notes a name that repeats what’s on the card: its words, its phone title or a file’s name (at least 3 letters)', () => {
    const game = jeopardyGame();
    game.media.push({ id: 'pic', name: 'spoon.png', mime: 'image/png', size: 10, kind: 'image' });
    expect(nameGivesAway(game, card('a', 'Spoon run', newTextEl('Spoon')))).toBe(true);
    // Its title on a phone: the largest short line, with other words under it.
    const title = { ...newTextEl('Spoon'), size: 160 };
    const rest = { ...newTextEl('Take it to the kitchen and hide it'), y: 400, size: 60 };
    expect(nameGivesAway(game, card('b', 'Spoon hunt', title, rest))).toBe(true);
    expect(nameGivesAway(game, card('c', 'spoon', newTextEl('Hide it'), { ...newImageEl('pic'), y: 300 }))).toBe(true);
    expect(nameGivesAway(game, card('d', 'Mission 1', newTextEl('Your mission: find the key')))).toBe(false);
    expect(nameGivesAway(game, card('e', 'Go 2', newTextEl('Go')))).toBe(false);
    expect(nameGivesAway(game, card('f', '  ', newTextEl('Spoon')))).toBe(false);
    game.cards = [card('sc1', 'Spoon run', newTextEl('Spoon'))];
    expect(mine(game)).toEqual([
      {
        text: '🤫 Card “Spoon run”: its name repeats what’s on it, and in one window viewers read a card’s name in 🤫 Send a card…',
        tab: 'cards',
        level: 'info',
        place: { tab: 'cards', card: 'sc1' },
      },
    ]);
  });

  it('notes two cards with one name once, going to the second', () => {
    const game = jeopardyGame();
    game.cards = [card('sc1', 'Tip A', newTextEl('One')), card('sc2', 'tip a ', newTextEl('Two')), card('sc3', 'Tip A', newTextEl('Three'))];
    expect(mine(game)).toEqual([{ text: 'Two 🤫 cards are called “tip a”: in 🤫 Send a card… you can’t tell them apart', tab: 'cards', level: 'info', place: { tab: 'cards', card: 'sc2' } }]);
  });

  it('counts a file used only on one of them as used only on cards (an older copy’s Delete unused would delete it)', () => {
    const game = jeopardyGame();
    game.media.push({ id: 'pic', name: 'spoon.png', mime: 'image/png', size: 10, kind: 'image' });
    game.cards = [card('sc1', 'Tip A', newTextEl('Hide it'), newImageEl('pic'))];
    const older = () => validate(game).filter((p) => p.text.includes('Older copies'));
    expect(older().map((p) => p.text)).toEqual([expect.stringMatching(/^1 file is used only on 🤫 cards/)]);
    (game.rounds[0] as BoardRound).categories[0].clues[0].answerSlide.elements.push(newImageEl('pic'));
    expect(older()).toEqual([]);
  });
});

describe('videos and sounds this browser won’t play', () => {
  const ref = (id: string, kind: 'video' | 'audio' = 'video', more: Partial<Game['media'][number]> = {}) => ({ id, name: `${id}.mkv`, mime: 'video/x-matroska', size: 10, kind, ...more });
  const playLines = (game: Game, plays?: NonNullable<Parameters<typeof validate>[1]>['plays']) => validate(game, { plays }).filter((p) => p.text.includes('browser')).map((p) => [p.level, p.tab, p.text]);

  it('as worked out from what’s inside them: won’t play, plays without its sound, or (not worked out yet) as their type says', () => {
    // (Its type alone says none of these play here.)
    vi.stubGlobal('document', { createElement: () => ({ canPlayType: () => '' }) });
    const game = jeopardyGame();
    game.media.push(ref('a'), ref('b'), ref('c', 'audio'), ref('d'), ref('e'), ref('f'), ref('g'));
    const said: Record<string, Verdict> = {
      a: { is: 'fails', fix: null, why: { kind: 'video', video: 'hevc', cant: 'undecodable' } },
      b: { is: 'silent', fix: { video: 'keep', audio: 'drop', box: 'webm' }, why: { kind: 'video', sound: 'ac3' } },
      c: { is: 'fails', fix: { audio: 'keep', box: 'mp3' }, why: { kind: 'audio', box: 'ts' } },
      d: { is: 'plays', repack: { video: 'keep', audio: 'keep', box: 'webm' } },
      e: { is: 'unknown' },
    };
    expect(playLines(game, (m) => said[m.id])).toEqual([
      // (c can be converted, a can't.)
      ['warn', 'media', '1 video/audio file won’t play in this browser: 🔄 Convert it in 🖼 Media'],
      ['warn', 'media', '1 video/audio file won’t play in this browser, and it can’t convert it: 🖼 Media says why'],
      ['warn', 'media', '1 video plays without its sound in this browser (🖼 Media says why)'],
      // (e: the app can't read it; f and g: not worked out yet.)
      ['warn', 'media', '3 video/audio files this browser may not play'],
    ]);
    // The one 🔄 can fix is the line's to convert (its button opens 🔄 Convert with it).
    expect(validate(game, { plays: (m) => said[m.id] }).find((p) => p.text.includes('🔄'))?.convert).toEqual(['c']);
    said.f = { ...said.b };
    said.g = { ...said.c };
    expect(playLines(game, (m) => said[m.id])[0]).toEqual(['warn', 'media', '2 video/audio files won’t play in this browser: 🔄 Convert them in 🖼 Media']);
    expect(playLines(game, (m) => said[m.id])[2]).toEqual(['warn', 'media', '2 videos play without their sound in this browser (🖼 Media says why)']);
    // With none worked out, as before.
    expect(playLines(game)).toEqual([['warn', 'media', '7 video/audio files this browser may not play']]);
    vi.unstubAllGlobals();
  });

  it('a file that plays says nothing, whatever its type says; links and 🗜 copies for phones aren’t counted', () => {
    vi.stubGlobal('document', { createElement: () => ({ canPlayType: () => '' }) });
    const game = jeopardyGame();
    game.media.push(ref('a'), ref('link', 'video', { url: 'https://example.com/a.mkv' }), ref('copy', 'video', { phoneCopy: { of: 'a' } }));
    const fails: Verdict = { is: 'fails', fix: null, why: { kind: 'video', video: 'hevc' } };
    expect(playLines(game, (m) => (m.id === 'a' ? { is: 'plays', repack: null } : fails))).toEqual([]);
    vi.unstubAllGlobals();
  });
});
