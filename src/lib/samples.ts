// The sample game (a small game of every mode, ready to play) and the starter templates under ＋ Add round.
// Everything here is made fresh each time (new ids), and uses no media files.
import { newBoardGameRound, newBoardSpace, setNameShown, SPACE_COLORS } from './boardgame';
import { PLAYER_PALETTE } from './colors';
import {
  newFinalRound,
  newId,
  newRound,
  newSlidesRound,
  newTextEl,
  setSlideText,
  textSlide,
  type Action,
  type BoardGameRound,
  type BoardRound,
  type BoardSpace,
  type Game,
  type ItemDef,
  type Round,
  type RoundMode,
  type RpgRound,
  type SlideElement,
  type StatField,
  type World,
} from './model';
import { newScreen, newWorldMap } from './rpg';
import { STAT_PRESETS, currencyFields } from './toolset';
import { enemyObject, newShop, presetStat } from './rpgpresets';

// ---------- Small helpers ----------

/** A board round with its clues written in: [category, [question, answer] per row]. */
function writtenBoard(name: string, values: number[], cats: [string, [string, string][]][]): BoardRound {
  const r = newRound(name, cats.length, values);
  cats.forEach(([title, clues], ci) => {
    const cat = r.categories[ci];
    cat.title = title;
    clues.forEach(([q, a], row) => {
      const clue = cat.clues[row];
      if (!clue) return;
      setSlideText(clue.questionSlide, q);
      setSlideText(clue.answerSlide, a);
    });
  });
  return r;
}

/** Big words on a screen or a slide (a title, a sign). */
function words(text: string, y: number, size = 90, color = '#ffffff'): SlideElement {
  return { ...newTextEl(text, { x: 160, y, w: 1600, h: size * 2 }), size, color };
}

/** A thing on an RPG screen: an emoji with a name, and what it is. */
function thing(emoji: string, name: string, x: number, y: number, role: SlideElement['role']): SlideElement {
  return { ...newTextEl(emoji, { x, y, w: 220, h: 220 }), size: 150, uppercase: false, shadow: undefined, name, role };
}

/** An action without its id (each kind's own fields). */
type NewAction = Action extends infer A ? (A extends Action ? Omit<A, 'id'> : never) : never;
const act = (a: NewAction): Action => ({ id: newId(), ...a }) as Action;

/** The game's Gold stat and Potion item, added once (the sample's RPG and board game use them). */
function gold(game: Game): StatField {
  let f = game.statFields?.find((x) => x.currency && x.name === 'Gold');
  if (!f) {
    f = STAT_PRESETS[1].make();
    game.statFields = [...(game.statFields ?? []), f];
  }
  return f;
}
function potion(game: Game): ItemDef {
  let it = game.items?.find((x) => x.name === 'Potion');
  if (!it) {
    it = { id: newId(), name: 'Potion', stackable: true, price: 5, description: 'Drink it for a second chance.' };
    game.items = [...(game.items ?? []), it];
  }
  return it;
}

// ---------- RPG ----------

/** A world of `cols` × `rows` screens, every cell filled, named by `name(col, row)`. */
function gridWorld(worldName: string, cols: number, rows: number, name: (c: number, r: number) => string, color: (c: number, r: number) => string): World {
  const map = newWorldMap('Map', cols, rows);
  map.screens = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const s = newScreen(c, r, name(c, r));
      s.slide.background = { color: color(c, r) };
      s.slide.elements = [words(s.name, 60, 80)];
      map.screens.push(s);
    }
  map.visibility = 'discovered';
  map.revealNeighbors = true;
  map.diagonals = false;
  return { id: newId(), name: worldName, maps: [map] };
}

/** A 3 × 3 dungeon: the entrance at the bottom middle, treasure at the top. */
export function dungeonRound(game: Game, name = 'Dungeon'): RpgRound {
  const names = [
    ['Spider nest', 'Treasure room', 'Crypt'],
    ['Dark hall', 'Great hall', 'Armory'],
    ['Cell', 'Entrance', 'Guard room'],
  ];
  const world = gridWorld(`${name} world`, 3, 3, (c, r) => names[r][c], (c, r) => (r === 0 && c === 1 ? '#5a4a12' : ['#23232e', '#2b2638', '#1f2a2e'][(c + r) % 3]));
  const map = world.maps[0];
  const at = (c: number, r: number) => map.screens.find((s) => s.col === c && s.row === r)!;
  at(1, 0).slide.elements.push(thing('💰', 'Treasure chest', 850, 520, { class: 'item', item: potion(game).id, qty: 1 }));
  at(0, 0).slide.elements.push(thing('🕷', 'Giant spider', 850, 480, { class: 'npc', stats: [{ name: 'HP', value: 5 }], statsShown: true }));
  game.worlds = [...(game.worlds ?? []), world];
  return { id: newId(), name, mode: 'rpg', world: world.id, start: { map: map.id, screen: at(1, 2).id } };
}

/**
 * A mini quest: buy gear in the village shop, pick up gold in the forest, beat the boss in its lair for the treasure.
 * Adds the HP, Gold and Power stats it uses (when the game has none of those names), a Potion and a Sword, and the shop.
 */
export function miniQuestRound(game: Game, name = 'Mini quest'): RpgRound {
  presetStat(game, 'HP');
  const coin = presetStat(game, 'Gold');
  const power = presetStat(game, 'Power');
  const drink = potion(game);
  let sword = game.items?.find((x) => x.name === 'Sword');
  if (!sword) {
    sword = { id: newId(), name: 'Sword', stackable: false, price: 8, description: 'A trusty blade for the boss fight.' };
    game.items = [...(game.items ?? []), sword];
  }
  const shop = newShop(game, 'Village shop');
  shop.currency = coin.id;
  shop.stock = [
    { item: drink.id, qty: null },
    { item: sword.id, qty: 3 },
  ];
  const world = gridWorld(`${name} world`, 3, 1, (c) => ['Village', 'Forest', 'Boss lair'][c], (c) => ['#2f6b3a', '#1d4a26', '#3a1420'][c]);
  const [village, forest, lair] = world.maps[0].screens;
  village.slide.elements.push(
    thing('🧑‍🌾', 'Shopkeeper', 850, 480, { class: 'npc', shop: shop.id, dialogue: textSlide('“Gear up! The boss is to the east.”') }),
  );
  village.hostNotes = 'Everyone starts with 10 gold: click the Shopkeeper and press 🛒 Shop. Then walk east.';
  forest.slide.elements.push(thing('🪙', 'Gold coins', 850, 520, { class: 'currency', field: coin.id, amount: 5 }));
  const boss = enemyObject(game, 'Boss', '👹', 8, 4);
  // A win: the treasure (a secret until revealed) and points for whoever fought.
  const chest = thing('💰', 'Treasure', 1400, 560, { class: 'item', item: drink.id, qty: 3 });
  chest.secret = true;
  boss.role!.actions = [...(boss.role!.actions ?? []), act({ do: 'reveal', object: chest.id }), act({ do: 'score', amount: 500, who: 'ask' })];
  boss.x = 760;
  boss.y = 420;
  lair.slide.elements.push(boss, chest);
  lair.hostNotes = `Fight with Compare on the Boss's card (${power.name} vs its Power). Beaten: press Reveal for the treasure and +500.`;
  game.worlds = [...(game.worlds ?? []), world];
  return { id: newId(), name, mode: 'rpg', world: world.id, start: { map: world.maps[0].id, screen: village.id } };
}

/** The sample's little world: a village, a forest with a chest, and a cave with a talking cat. */
function sampleWorld(game: Game): RpgRound {
  const coin = gold(game);
  const world = gridWorld('Sample world', 3, 1, (c) => ['Village', 'Forest', 'Cave'][c], (c) => ['#2f6b3a', '#1d4a26', '#2b2b38'][c]);
  const [village, forest, cave] = world.maps[0].screens;
  village.slide.elements.push(words('Walk east with the arrows →', 820, 60, '#ffe119'));
  village.hostNotes = 'The arrow keys (or the pad) move the party. Click a thing on a screen for its card.';
  forest.slide.elements.push(thing('🧪', 'Potion', 600, 520, { class: 'item', item: potion(game).id, qty: 1 }));
  forest.slide.elements.push(thing('🪙', 'Gold coins', 1100, 520, { class: 'currency', field: coin.id, amount: 5 }));
  const dialogue = textSlide('“Answer my riddle and the cave is yours.”');
  cave.slide.elements.push(
    thing('🐱', 'Riddle cat', 850, 480, {
      class: 'npc',
      dialogue,
      actions: [act({ do: 'question', question: textSlide('What has keys but opens no locks?'), answer: textSlide('A piano (or a keyboard)'), value: 100 })],
    }),
  );
  game.worlds = [...(game.worlds ?? []), world];
  return { id: newId(), name: 'Adventure', mode: 'rpg', world: world.id };
}

// ---------- Board games ----------

/**
 * Board-game spaces' actions: go back 3, skip a turn, roll again, +100 (named without numbers: a space shows the number
 * in its name), each with an emoji in its circle.
 */
const SPECIAL: Record<string, { name: string; color: string; mark: string; onLand: () => Action[] }> = {
  back: { name: 'Go back', color: '#e6194b', mark: '↩', onLand: () => [act({ do: 'steps', steps: -3, who: 'party' })] },
  skip: { name: 'Nap time', color: '#911eb4', mark: '😴', onLand: () => [act({ do: 'skip', turns: 1, who: 'party' })] },
  again: { name: 'Roll again', color: '#3cb44b', mark: '🎲', onLand: () => [act({ do: 'again', who: 'party' })] },
  bonus: { name: 'Bonus', color: '#ffcc00', mark: '⭐', onLand: () => [act({ do: 'score', amount: 100, who: 'party' })] },
};

/** A special space: its name shows on the board (viewers can tell what it does). */
function special(s: BoardSpace, kind: keyof typeof SPECIAL): void {
  const k = SPECIAL[kind];
  s.name = k.name;
  s.color = k.color;
  s.mark = k.mark;
  s.onLand = k.onLand();
  setNameShown(s, true);
}

/**
 * A loop of 20 spaces round the edge of the board, with some "go back 3", "skip a turn" and "roll again" spaces.
 * Passing Start scores 200, and gives 2 of the game's currency (gold) when it has one.
 */
export function loop20Round(name = 'Board game', game?: Game): BoardGameRound {
  const r = newBoardGameRound(name);
  const pts: [number, number][] = [];
  // 7 across the top and bottom, 3 down each side: 20 spaces.
  for (let i = 0; i < 7; i++) pts.push([300 + i * 220, 250]);
  for (let i = 1; i <= 3; i++) pts.push([1620, 250 + i * 145]);
  for (let i = 6; i >= 0; i--) pts.push([300 + i * 220, 830]);
  for (let i = 3; i >= 1; i--) pts.push([300, 250 + i * 145]);
  r.spaces = pts.map(([x, y], i) => newBoardSpace(x, y, i === 0 ? 'Start' : `Space ${i + 1}`, i === 0 ? '#ffcc00' : SPACE_COLORS[i % SPACE_COLORS.length]));
  r.spaces.forEach((s, i) => (s.next = [r.spaces[(i + 1) % r.spaces.length].id]));
  r.spaces[0].onPass = [act({ do: 'score', amount: 200, who: 'party' })];
  r.spaces[0].hostNotes = 'Passing Start: +200';
  const money = game && currencyFields(game)[0];
  if (money) {
    r.spaces[0].onPass.push(act({ do: 'stat', field: money.id, op: 'add', amount: 2, who: 'party' }));
    r.spaces[0].hostNotes = `Passing Start: +200 and +2 ${money.name}`;
  }
  [4, 11, 17].forEach((i) => special(r.spaces[i], 'back'));
  special(r.spaces[8], 'skip');
  special(r.spaces[14], 'again');
  special(r.spaces[6], 'bonus');
  special(r.spaces[16], 'bonus');
  r.winNotes = 'Most points after 3 laps wins';
  r.winPublic = true;
  return r;
}

/** A winding path from Start to Finish: first one there wins. */
export function raceRound(name = 'Race'): BoardGameRound {
  const r = newBoardGameRound(name);
  const pts: [number, number][] = [];
  for (let i = 0; i < 6; i++) pts.push([260 + i * 280, 260]);
  for (let i = 5; i >= 0; i--) pts.push([260 + i * 280, 540]);
  for (let i = 0; i < 6; i++) pts.push([260 + i * 280, 820]);
  r.spaces = pts.map(([x, y], i) => newBoardSpace(x, y, i === 0 ? 'Start' : i === pts.length - 1 ? 'Finish' : `Space ${i + 1}`, i === 0 || i === pts.length - 1 ? '#ffcc00' : SPACE_COLORS[i % SPACE_COLORS.length]));
  r.spaces.forEach((s, i) => (s.next = r.spaces[i + 1] ? [r.spaces[i + 1].id] : []));
  [5, 13].forEach((i) => special(r.spaces[i], 'back'));
  special(r.spaces[9], 'again');
  special(r.spaces[15], 'skip');
  r.winNotes = 'First to reach Finish wins';
  r.winPublic = true;
  return r;
}

/** The sample's board game: a loop of 12 with a bonus, a "go back 3", a nap and a roll again. */
function sampleBoardGame(game: Game): BoardGameRound {
  const r = newBoardGameRound('Board game');
  const coin = gold(game);
  r.spaces[0].onPass = [act({ do: 'score', amount: 100, who: 'party' }), act({ do: 'stat', field: coin.id, op: 'add', amount: 2, who: 'party' })];
  r.spaces[0].hostNotes = `Passing Start: +100 and +2 ${coin.name}`;
  special(r.spaces[3], 'bonus');
  special(r.spaces[5], 'back');
  special(r.spaces[8], 'skip');
  special(r.spaces[10], 'again');
  r.winNotes = 'Most points wins';
  r.winPublic = true;
  return r;
}

// ---------- Templates ----------

export interface Template {
  mode: RoundMode;
  label: string;
  hint: string;
  /** The new round (an RPG template also adds its world to the game). */
  make: (game: Game) => Round;
}

export const TEMPLATES: Template[] = [
  { mode: 'board', label: 'Classic board, 6 × 5', hint: '$200 to $1,000', make: () => newRound('Jeopardy!', 6) },
  { mode: 'board', label: 'Double board, 6 × 5', hint: '$400 to $2,000', make: () => newRound('Double Jeopardy!', 6, [400, 800, 1200, 1600, 2000]) },
  { mode: 'board', label: 'Quick board, 4 × 3', hint: 'A short round: $100 to $300', make: () => newRound('Quick round', 4, [100, 200, 300]) },
  { mode: 'rpg', label: 'Mini quest', hint: 'A village shop, gold to find and a boss to fight: everything an adventure needs, ready to play', make: (g) => miniQuestRound(g) },
  { mode: 'rpg', label: '3 × 3 dungeon', hint: 'Nine rooms, a treasure chest and a spider', make: (g) => dungeonRound(g) },
  {
    mode: 'boardgame',
    label: '20-space loop',
    hint: 'Laps round the board, with “go back 3”, “skip a turn” and “roll again” spaces (passing Start: +200, and +2 gold if the game has gold)',
    make: (g) => loop20Round('Board game', g),
  },
  { mode: 'boardgame', label: 'Race to the finish', hint: 'A path from Start to Finish: first one there wins', make: () => raceRound() },
  { mode: 'slides', label: 'Welcome and rules', hint: 'Two slides to open the show: a welcome, then how it plays', make: () => introRound() },
];

/** An introduction: a welcome slide, then the rules (to change to the show's own). */
function introRound(welcome = 'Welcome to the show!'): Round {
  const r = newSlidesRound('Introduction');
  setSlideText(r.questionSlide, welcome);
  const rules = textSlide('How it plays: pick a clue, answer before the others, and the most points wins!');
  r.extraSlides = [{ ...rules, id: newId() }];
  return r;
}

// ---------- The sample game ----------

/**
 * Add the sample game to `game`: a board, an adventure, a board game and a Final, three players (when there are none)
 * and the Gold and Potion they use. Returns the index of its first round.
 */
export function addSampleGame(game: Game): number {
  const at = game.rounds.length;
  const board = writtenBoard('Jeopardy!', [200, 400, 600], [
    ['Memes', [['This Shiba Inu became the face of a cryptocurrency', 'Doge'], ['“Never gonna give you up” is the song of this prank', 'Rickrolling'], ['This frog says “feels good man”', 'Pepe']]],
    ['Gaming', [['A plumber in a red cap', 'Mario'], ['Blocks, creepers and diamonds', 'Minecraft'], ['“The cake is a lie” comes from this game', 'Portal']]],
    ['Internet', [['The site with the little blue bird, now called X', 'Twitter'], ['Short videos with a music note logo', 'TikTok'], ['Where streamers go live in purple', 'Twitch']]],
    ['Brainrot', [['A toilet with a head, singing', 'Skibidi Toilet'], ['Extra points of charm', 'Rizz'], ['A city in Ohio, or anything odd', 'Only in Ohio']]],
  ]);
  board.categories[3].clues[2].type = 'dailyDouble';
  const final = newFinalRound('Final Jeopardy!');
  final.category = 'Streaming';
  setSlideText(final.questionSlide, 'This word means talking to the chat while you play');
  setSlideText(final.answerSlide, 'Just chatting');
  const rpg = sampleWorld(game);
  const bg = sampleBoardGame(game);
  // (Its introduction only in a game of its own: added to a game with rounds, it would land in the middle.)
  game.rounds.push(...(at ? [] : [introRound('Welcome to the sample game!')]), board, rpg, bg, final);
  // Red, green and yellow: far apart in hue, so no two look alike (on the blue theme two blues did).
  if (!game.players.length)
    game.players = ['Ann', 'Bob', 'Cat'].map((name, i) => ({ id: newId(), name, color: PLAYER_PALETTE[[0, 6, 2][i]] }));
  if (!game.title.trim() || game.title === 'Untitled Game') game.title = 'Sample game';
  return at;
}
