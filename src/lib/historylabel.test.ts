import { describe, expect, it } from 'vitest';
import { diff } from './historyops';
import { describe as describeStep, placeAt, short } from './historylabel';
import { newImageEl, newTextEl, type BoardGameRound, type BoardRound, type FinalRound, type Game, type ImageEl, type TextEl } from './model';
import { jeopardyGame } from './testgame';
import { addSampleGame } from './samples';
import { newRpgRound, newScreen, newVariant } from './rpg';
import { newWheel } from './tools';
import { newBoardGameRound } from './boardgame';
import { newStatField } from './toolset';

function sample(): Game {
  const g = jeopardyGame();
  g.title = 'Brainrot Night';
  g.rounds.push(newRpgRound(g));
  const screens = g.worlds![0].maps[0].screens;
  screens.push(newScreen(1, 0, 'Town'), newScreen(2, 0, 'Cave'));
  screens[1].slide.elements.push(newTextEl('Welcome'));
  const npc = newImageEl('m1');
  npc.name = 'Old Man';
  npc.role = { class: 'npc', dialogue: { background: {}, elements: [newTextEl('Hello traveller')] } };
  screens[1].slide.elements.push(npc);
  g.wheels.push(newWheel('Punishments'));
  g.media.push({ id: 'm1', name: 'a.png', mime: 'image/png', size: 10, kind: 'image' });
  (g.rounds[1] as FinalRound).hostNotes = 'Read it slowly';
  return g;
}

/** Describe the step that `edit` makes to a copy of the sample game. */
function step(edit: (g: Game) => void, explicit?: string) {
  const before = sample();
  const after = structuredClone(before);
  edit(after);
  return { ...describeStep(diff(before, after), before, after, explicit), before, after };
}

const board = (g: Game) => g.rounds[0] as BoardRound;
const final = (g: Game) => g.rounds[1] as FinalRound;
const screens = (g: Game) => g.worlds![0].maps[0].screens;

describe('step labels', () => {
  it('names renames, with where they happened', () => {
    expect(step((g) => (g.title = 'Brainrot Night 2'))).toMatchObject({ label: 'Renamed the game “Brainrot Night 2”', where: 'Game title', place: { tab: 'title' } });
    const r = step((g) => (g.rounds[0].name = 'Round of memes'));
    expect(r).toMatchObject({ label: 'Renamed round “Round of memes”', icon: '🟦', where: '' });
    expect(r.place).toEqual({ tab: 'round', round: r.after.rounds[0].id });
    // Where it happened doesn't say the name again.
    const c = step((g) => (board(g).categories[1].title = 'Memes'));
    expect(c).toMatchObject({ label: 'Renamed category “Memes”', where: 'Jeopardy!' });
    expect(c.place).toEqual({ tab: 'round', round: c.after.rounds[0].id, part: { kind: 'category', category: board(c.after).categories[1].id } });
  });

  it('calls the main text of a clue its question or answer', () => {
    const q = step((g) => ((board(g).categories[0].clues[1].questionSlide.elements[0] as TextEl).text = 'Who is Pepe?'));
    const cat = board(q.after).categories[0];
    expect(q).toMatchObject({ label: 'Edited question “Who is Pepe?”', icon: '🅣', where: 'Jeopardy! › Category 1 › $400 › Question' });
    expect(q.place).toEqual({
      tab: 'round',
      round: q.after.rounds[0].id,
      part: { kind: 'clue', category: cat.id, clue: cat.clues[1].id, side: 'q', element: cat.clues[1].questionSlide.elements[0].id },
    });
    expect(step((g) => ((board(g).categories[0].clues[0].answerSlide.elements[0] as TextEl).text = 'Pepe')).label).toBe('Edited answer “Pepe”');
    expect(step((g) => ((final(g).questionSlide.elements[0] as TextEl).text = 'Final?')).label).toBe('Edited question “Final?”');
    // Typing a question also makes its tile playable: still the question's edit.
    const typed = step((g) => {
      const clue = board(g).categories[0].clues[2];
      (clue.questionSlide.elements[0] as TextEl).text = 'Who?';
      clue.empty = false;
    });
    expect(typed.label).toBe('Edited question “Who?”');
    // A second text box is just text.
    const second = step((g) => board(g).categories[0].clues[0].questionSlide.elements.push(newTextEl('Hint')));
    expect(second.label).toBe('Added text box “Hint”');
  });

  it('cuts long text to 40 characters', () => {
    const long = 'This is the question text for a clue, fairly long, maybe two lines';
    expect(step((g) => ((board(g).categories[0].clues[0].questionSlide.elements[0] as TextEl).text = long)).label).toBe(
      `Edited question “${short(long)}”`,
    );
    expect(short(long)).toHaveLength(40);
    expect(short('Line one\nline two')).toBe('Line one');
  });

  it('names what was added, deleted and moved, and where each shows either way', () => {
    const add = step((g) => board(g).categories.push({ ...board(g).categories[0], id: 'new-cat', title: 'Brand new' }));
    expect(add.label).toBe('Added category “Brand new”');
    expect(add.undoPlace).toEqual({ tab: 'round', round: add.after.rounds[0].id });
    const del = step((g) => board(g).categories.splice(2, 1));
    expect(del).toMatchObject({ label: 'Deleted category “Category 3”', where: 'Jeopardy!' });
    expect(del.place).toEqual({ tab: 'round', round: del.after.rounds[0].id });
    expect(del.undoPlace).toMatchObject({ part: { kind: 'category', category: board(del.before).categories[2].id } });
    expect(step((g) => g.rounds.push(g.rounds.shift()!)).label).toBe('Moved round “Jeopardy!” later');
    expect(step((g) => g.rounds.unshift(g.rounds.pop()!)).label).toBe('Moved round “Adventure” earlier');
    expect(step((g) => board(g).categories.reverse()).label).toBe('Reordered categories');
    expect(step((g) => board(g).categories.splice(0, 2)).label).toBe('Deleted 2 categories');
  });

  it('names tile changes', () => {
    const cat = board(sample()).categories[0].title;
    expect(step((g) => (board(g).categories[0].clues[0].type = 'dailyDouble')).label).toBe(`Made ${cat} $200 a Daily Double`);
    expect(step((g) => (board(g).categories[0].clues[0].type = 'wheel')).label).toBe(`Made ${cat} $200 a wheel tile`);
    expect(step((g) => (board(g).categories[0].clues[0].empty = true)).label).toBe(`Left ${cat} $200 empty`);
    // A value changed: the tile as it was, and what it is now.
    const valued = step((g) => (board(g).categories[0].clues[1].value = 750));
    expect(valued.label).toBe(`Changed ${cat} $400 to $750`);
    expect(describeStep(diff(valued.after, valued.before), valued.after, valued.before).label).toBe(`Changed ${cat} $750 to the row's $400`);
    // A category's picture taken off.
    const pic = sample();
    board(pic).categories[1].image = 'm1';
    const off = structuredClone(pic);
    delete board(off).categories[1].image;
    expect(describeStep(diff(pic, off), pic, off).label).toBe(`Removed the image of category “${board(pic).categories[1].title}”`);
    expect(step((g) => (board(g).values[2] = 700)).label).toBe('Changed the row values');
  });

  it('names screens moved on the map, swapped, deleted and edited', () => {
    const moved = step((g) => (screens(g)[1].col = 3));
    expect(moved).toMatchObject({ label: 'Moved screen “Town” to D1', icon: '🗺', where: 'World 1 › Overworld' });
    const swapped = step((g) => {
      const [a, b] = [screens(g)[1], screens(g)[2]];
      [a.col, b.col] = [b.col, a.col];
    });
    expect(swapped.label).toBe('Swapped screens “Town” and “Cave”');
    const del = step((g) => screens(g).splice(2, 1));
    const [w, m] = [del.before.worlds![0], del.before.worlds![0].maps[0]];
    expect(del.label).toBe('Deleted screen “Cave”');
    expect(del.place).toEqual({ tab: 'world', world: w.id, map: m.id });
    expect(del.undoPlace).toEqual({ tab: 'world', world: w.id, map: m.id, screen: m.screens[2].id });
    const text = step((g) => ((screens(g)[1].slide.elements[0] as TextEl).text = 'Welcome to town'));
    const town = screens(text.before)[1];
    expect(text.label).toBe('Edited text “Welcome to town”');
    expect(text.place).toMatchObject({ screen: town.id, inSlide: true, element: town.slide.elements[0].id });
  });

  it("keeps an object's dialogue on the object", () => {
    const r = step((g) => ((screens(g)[1].slide.elements[1].role!.dialogue!.elements[0] as TextEl).text = 'Hello there'));
    const npc = r.before.worlds![0].maps[0].screens[1].slide.elements[1];
    expect(r.label).toBe('Edited text “Hello there”');
    expect(r.where).toBe('World 1 › Overworld › Town › Old Man › dialogue');
    expect(r.place).toMatchObject({ inSlide: true, element: npc.id });
  });

  it("names a slide's background and a text box's effects as the editor does", () => {
    const q = (g: Game) => board(g).categories[0].clues[1].questionSlide;
    const text = (g: Game) => q(g).elements[0] as TextEl;
    expect(step((g) => (q(g).background.color = '#333333')).label).toBe('Slide background color #333333');
    expect(step((g) => (q(g).background.image = 'm1')).label).toBe('Slide background picture');
    const coloured = (g: Game) => (q(g).background = { color: '#111111' });
    const before = sample();
    coloured(before);
    const after = structuredClone(before);
    q(after).background = {};
    expect(describeStep(diff(before, after), before, after).label).toBe('Removed the slide background color');
    expect(step((g) => (text(g).stroke = { color: '#000000', width: 6 })).label).toMatch(/^Added an outline to text box/);
    expect(step((g) => (text(g).shadow = undefined)).label).toMatch(/^Removed the drop shadow from text box/);
    expect(step((g) => (text(g).size = 80)).label).toMatch(/^Changed text size of text box/);
    const outlined = sample();
    text(outlined).stroke = { color: '#000000', width: 6 };
    const wider = structuredClone(outlined);
    text(wider).stroke!.width = 20;
    expect(describeStep(diff(outlined, wider), outlined, wider).label).toMatch(/^Changed outline width of text box/);
  });

  it('names moves, resizes and restacks of slide items', () => {
    const el = (g: Game) => screens(g)[1].slide.elements;
    expect(step((g) => ((el(g)[1].x += 10), (el(g)[1].y += 5))).label).toBe('Moved object “Old Man”');
    expect(step((g) => ((el(g)[1].w = 300), (el(g)[1].x = 0))).label).toBe('Resized object “Old Man”');
    expect(step((g) => ((el(g)[0].x += 10), (el(g)[1].x += 10))).label).toBe('Moved 2 items');
    expect(step((g) => ((el(g)[0].zIndex = 2), (el(g)[1].zIndex = 1))).label).toBe('Restacked items');
    expect(step((g) => ((el(g)[0].rotation = 15))).label).toBe('Rotated text box “Welcome”');
  });

  it('names rules, sounds, the theme, files, wheels and the tiebreaker', () => {
    expect(step((g) => (g.settings.allowNegativeScores = false))).toMatchObject({
      label: 'Rule: Negative scores off',
      where: 'Play › Game rules',
      icon: '📋',
      place: { tab: 'play', part: 'rules' },
    });
    // The ▶ Play screen's other parts: Go there opens it there.
    expect(step((g) => (g.settings.buzzArm = 'host'))).toMatchObject({ where: 'Play › Phone buzzers', icon: '📱', place: { tab: 'play', part: 'buzzers' } });
    expect(step((g) => (g.settings.stream = { soonText: 'Soon!' }))).toMatchObject({ where: 'Play › On stream', icon: '📺', place: { tab: 'play', part: 'stream' } });
    expect(step((g) => (g.settings.currencySymbol = 'pts')).label).toBe('Rule: Points symbol = pts');
    expect(step((g) => (g.settings.roundIntro.titleCard = false)).label).toBe('Rule: Round title card off');
    expect(step((g) => (g.audio.dailyDouble = 'm1')).label).toBe('Changed the Daily Double sound');
    expect(step((g) => (g.audio.wheelTick = '')).label).toBe('Turned off the wheel tick sound');
    expect(step((g) => (g.soundsOff = { wheelTick: true })).label).toBe('Turned off the wheel tick sound');
    expect(step((g) => (g.soundsOff = { right: true }), undefined)).toMatchObject({ where: 'Sounds' });
    const offs = (g: Game) => (g.soundsOff = { right: true, wrong: true });
    const both = step(offs).after;
    const on = structuredClone(both);
    delete on.soundsOff!.wrong;
    expect(describeStep(diff(both, on), both, on).label).toBe('Turned on the wrong sound');
    const own = sample();
    own.audio.dailyDouble = 'm1';
    const back = structuredClone(own);
    delete back.audio.dailyDouble;
    expect(describeStep(diff(own, back), own, back).label).toBe('Built-in Daily Double sound');
    expect(step((g) => (g.soundVolume = { buzz: 0.5 }))).toMatchObject({ label: 'Volume of the buzz in sound: 50%', where: 'Sounds' });
    const loud = step((g) => (g.soundVolume = { buzz: 0.5, right: 0.3 })).after;
    const louder = structuredClone(loud);
    louder.soundVolume!.right = 0.8;
    expect(describeStep(diff(loud, louder), loud, louder).label).toBe('Volume of the right sound: 80%');
    expect(step((g) => (g.settings.buzzer = true))).toMatchObject({ label: 'Rule: Buzzer mode on', where: 'Play › Phone buzzers' });
    expect(step((g) => (g.theme = { ...g.theme, preset: 'neon', tile: '#000' })).label).toBe('Theme preset: Brainrot Neon');
    expect(step((g) => (g.theme.tile = '#123456')).label).toBe('Theme: tile color #123456');
    expect(step((g) => ((g.theme.tile = '#123456'), (g.theme.boardText = '#abcdef'))).label).toBe('Theme: tile color, category name color');
    // The new value, in words.
    expect(step((g) => (g.theme.stageBg = 'green')).label).toBe('Theme: stage background chroma green');
    expect(step((g) => (g.theme.scoreBar = 'top')).label).toBe('Theme: score bar top');
    const file = step((g) => g.media.push({ id: 'm2', name: 'clip.mp4', mime: 'video/mp4', size: 1, kind: 'video' }));
    expect(file).toMatchObject({ label: 'Added file “clip.mp4”', icon: '🎬', place: { tab: 'media', media: 'm2' } });
    expect(step((g) => g.media.pop()).label).toBe('Removed file “a.png”');
    const slice = step((g) => g.wheels[0].segments.push({ ...g.wheels[0].segments[0], id: 's-new', label: 'Sing a song' }));
    expect(slice).toMatchObject({ label: 'Added slice “Sing a song”', where: 'Wheels & Dice › Punishments', icon: '🎡' });
    expect(step((g) => (g.wheels[0].segments[0].label = 'Dance')).label).toBe('Renamed slice “Dance”');
    // A slice's (an object's, an item's, a space's) buttons are called buttons, as the editor calls them.
    expect(step((g) => (g.wheels[0].segments[0].actions = [{ id: 'b1', do: 'note', text: 'Hi' }])).label).toBe('Added button “📝 Hi”');
    // (Named as the editor shows it.)
    expect(step((g) => (g.wheels[0].segments[0].actions = [{ id: 'b1', do: 'steps', steps: -3 }])).label).toBe('Added button “Back 3 spaces”');
    const two = (g: Game) => (g.wheels[0].segments[0].actions = [{ id: 'b1', do: 'note', text: 'Hi' }, { id: 'b2', do: 'score', amount: 5 }]);
    expect(step((g) => two(g)).label).toBe('Added 2 buttons');
    const tb = { questionSlide: { background: {}, elements: [] }, answerSlide: { background: {}, elements: [] } };
    expect(step((g) => (g.tiebreaker = tb))).toMatchObject({ label: 'Tiebreaker on', place: { tab: 'tiebreaker' } });
  });

  it('names cleared text, other fields, and changes to several things', () => {
    expect(step((g) => (board(g).categories[0].clues[0].hostNotes = 'Say it slowly')).label).toBe('Edited host notes “Say it slowly”');
    expect(step((g) => (final(g).category = 'Memes')).label).toBe('Edited category “Memes”');
    expect(step((g) => (final(g).hostNotes = '')).label).toBe('Cleared the host notes');
    expect(step((g) => (board(g).categories[0].clues[0].timerSeconds = 20)).label).toBe('Changed timer of clue “$200”');
    expect(step((g) => ((g.title = 'X'), (g.rounds[0].name = 'Y'))).label).toBe('2 changes');
  });

  it('names the first of a kind added as an add (the game had no list of them yet)', () => {
    const stat = step((g) => (g.statFields = [newStatField('HP')]));
    const id = stat.after.statFields![0].id;
    expect(stat).toMatchObject({ label: 'Added stat “HP”', where: 'Stats & Items', place: { tab: 'stats', stat: id }, undoPlace: { tab: 'stats' } });
    const items = step((g) => (g.items = ['Potion', 'Hat', 'Key'].map((name) => ({ id: name, name, stackable: true }))));
    expect(items).toMatchObject({ label: 'Added 3 items', where: 'Stats & Items', place: { tab: 'stats' } });
    const look = step((g) => (screens(g)[1].variants = [newVariant(undefined, screens(g)[1], 'Night')]));
    expect(look.label).toBe('Added look “Night”');
    expect(look.place).toMatchObject({ screen: screens(look.after)[1].id, look: screens(look.after)[1].variants![0].id });
    expect(step((g) => (screens(g)[1].slide.elements[1].role!.dialogue = undefined)).label).toBe('Changed dialogue of object “Old Man”');
  });

  it("names an object's class", () => {
    const el = (g: Game) => screens(g)[1].slide.elements;
    expect(step((g) => (el(g)[0].role = { class: 'doorway' })).label).toBe('Made “Welcome” a doorway');
    expect(step((g) => (el(g)[1].role!.class = 'interactable')).label).toBe('Made “Old Man” an interactable');
    expect(step((g) => (el(g)[1].role = undefined)).label).toBe('Made “Old Man” scenery');
    expect(step((g) => (el(g)[1].role!.to = { map: 'm', screen: 's' })).label).toBe('Changed destination of object “Old Man”');
  });

  it('shows a step that changed several separate things where they all are', () => {
    const dds = step((g) => {
      board(g).categories[0].clues[3].type = 'dailyDouble';
      board(g).categories[4].clues[2].type = 'dailyDouble';
    }, 'Placed Daily Doubles at random');
    expect(dds).toMatchObject({ where: 'Jeopardy!', place: { tab: 'round', round: dds.after.rounds[0].id } });
    const one = step((g) => {
      board(g).categories[1].clues[3].type = 'dailyDouble';
      board(g).categories[1].clues[4].type = 'dailyDouble';
    });
    expect(one.place).toEqual({ tab: 'round', round: one.after.rounds[0].id, part: { kind: 'category', category: board(one.after).categories[1].id } });
    // The sample game adds rounds and players: it shows at its rounds, not at Play › Players.
    const sampled = step((g) => {
      g.players = [];
      addSampleGame(g);
    }, 'Added the sample game');
    expect(sampled.where).not.toContain('Players');
    expect(sampled.place).toMatchObject({ tab: 'round' });
    const players = step((g) => (g.players = [1, 2].map((n) => ({ id: `p${n}`, name: `Player ${n}`, color: '#fff' }))), 'Saved the players from the show');
    expect(players).toMatchObject({ where: 'Play › Players', place: { tab: 'play', part: 'players' } });
    // Items on one slide are shown themselves (and selected together).
    const items = step((g) => ((screens(g)[1].slide.elements[0].x += 10), (screens(g)[1].slide.elements[1].x += 10)));
    expect(items.place).toMatchObject({ element: screens(items.after)[1].slide.elements[0].id });
  });

  it('shows a file added with the picture using it where the picture is', () => {
    const file = { id: 'm2', name: 'pepe-edited.png', mime: 'image/png', size: 1, kind: 'image' as const };
    const edited = step((g) => {
      g.media.push(file);
      (screens(g)[1].slide.elements[1] as ImageEl).editedMedia = 'm2';
    }, 'Edited image');
    const npc = screens(edited.after)[1].slide.elements[1];
    expect(edited).toMatchObject({ where: 'World 1 › Overworld › Town › Old Man', undoPlace: { element: npc.id } });
    const put = step((g) => {
      g.media.push(file);
      board(g).categories[0].clues[0].questionSlide.elements.push({ ...newImageEl('m2'), id: 'img' });
    });
    expect(put).toMatchObject({ label: 'Added image “pepe-edited.png”', place: { part: { kind: 'clue', element: 'img' } } });
    const two = step((g) => {
      g.media.push(file, { ...file, id: 'm3', name: 'b.png' });
      board(g).categories[0].clues[0].questionSlide.elements.push({ ...newImageEl('m2'), id: 'a' }, { ...newImageEl('m3'), id: 'b' });
    });
    expect(two).toMatchObject({ label: 'Added 2 images', where: 'Jeopardy! › Category 1 › $200 › Question' });
  });

  it('says switches turned on and off in words, not field names', () => {
    const el = (g: Game) => screens(g)[1].slide.elements;
    const door = (g: Game) => {
      el(g)[0].name = 'Doorway';
      el(g)[0].role = { class: 'doorway' };
    };
    const lock = (on: boolean) => {
      const before = sample();
      door(before);
      const after = structuredClone(before);
      el(after)[0].role!.locked = on;
      return describeStep(diff(before, after), before, after).label;
    };
    expect(lock(true)).toBe('Locked “Doorway”');
    expect(lock(false)).toBe('Unlocked “Doorway”');
    expect(step((g) => (el(g)[1].secret = true)).label).toBe('Made “Old Man” secret');
    expect(step((g) => (el(g)[1].role!.statsShown = true)).label).toBe('Showed the stats of “Old Man” to viewers');
    const withBoard = () => {
      const g = sample();
      g.rounds.push(newBoardGameRound('Race'));
      return g;
    };
    const before = withBoard();
    const after = structuredClone(before);
    (after.rounds.at(-1) as BoardGameRound).winPublic = true;
    expect(describeStep(diff(before, after), before, after).label).toBe('Showed how to win on the board of “Race”');
    const space = structuredClone(before);
    (space.rounds.at(-1) as BoardGameRound).spaces[2].secret = true;
    expect(describeStep(diff(before, space), before, space).label).toBe('Made “Space 3” secret');
    expect(step((g) => (board(g).dailyDoubleCount = 2)).label).toBe('Set round “Jeopardy!” to 2 Daily Doubles');
    expect(step((g) => (screens(g)[1].exits = { n: { kind: 'blocked' } })).label).toBe('Changed ways out of screen “Town”');
  });

  it('lets an editor name the step, keeping the places from the ops', () => {
    const r = step((g) => screens(g).splice(2, 1), 'Deleted screen “Cave” (and its exits)');
    expect(r.label).toBe('Deleted screen “Cave” (and its exits)');
    expect(r.undoPlace).toMatchObject({ screen: screens(r.before)[2].id });
  });
});

describe('placeAt', () => {
  it('goes as far as the game has the path', () => {
    const g = sample();
    const at = placeAt(g, ['rounds', g.rounds[0].id, 'categories', 'nope', 'clues']);
    expect(at).toMatchObject({ noun: 'round', crumbs: ['Jeopardy!'], place: { tab: 'round', round: g.rounds[0].id } });
    expect(placeAt(g, ['players'])).toMatchObject({ place: { tab: 'play', part: 'players' }, crumbs: ['Play', 'Players'] });
    expect(placeAt(g, ['audio', 'buzz'])).toMatchObject({ place: { tab: 'sounds' }, crumbs: ['Sounds'] });
  });
});
