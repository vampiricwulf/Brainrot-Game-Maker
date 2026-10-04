// What a step in the undo history is called and where it happened ("Renamed category “Memes”" in Round 1 › Memes),
// worked out from its ops (historyops.ts), and the place in the editor that shows it. Pure: unit-tested in
// historylabel.test.ts.
import { opPath, type Json, type Op, type Seg } from './historyops';
import { LAYER_ICON, layerLabel, short } from './layerlabel';
import { categoryLabel, clueValue, formatPoints, roundName, type Action, type Game, type MediaKind, type Round, type Slide, type SlideElement } from './model';
import { describeAction } from './actions';
import { ROUND_MODES } from './modes';
import { OBJECT_CLASSES } from './rpg';
import { PRESETS, type ThemePreset } from './theme';
import { cueName, hasBuiltin, type CueKey } from './sounds';

export type Side = 'q' | 'a';

/** A place in the editor: the tab, and what's open or selected in it. */
export type Place =
  | { tab: 'title' }
  | { tab: 'sounds' }
  | { tab: 'theme' }
  | { tab: 'tools'; wheel?: string; dice?: string }
  | { tab: 'stats'; stat?: string; item?: string; shop?: string }
  | { tab: 'media'; media?: string }
  /** `slide`: a question slide after the first (its id). */
  | { tab: 'tiebreaker'; side?: Side; slide?: string; element?: string }
  | { tab: 'round'; round: string; part?: RoundPart }
  | { tab: 'world'; world: string; map?: string; screen?: string; look?: string; inSlide?: boolean; element?: string }
  | { tab: 'history' }
  /** The ▶ Play screen's pre-game settings (the players, the rules, the phone buzzers, on stream). */
  | { tab: 'play'; part: PlayPart };

export type PlayPart = 'players' | 'rules' | 'buzzers' | 'stream';
/** Each part of the pre-game screen: its name and icon. */
const PLAY_PARTS: Record<PlayPart, [string, string]> = {
  players: ['Players', '👤'],
  rules: ['Game rules', '⚖'],
  buzzers: ['Phone buzzers', '📱'],
  stream: ['On stream', '📺'],
};

export type RoundPart =
  | { kind: 'category'; category: string }
  /** `onBoard`: the tile on the board (moved, cleared, pasted), without opening the clue. */
  /** `slide`: one of the clue's extra question slides (its id; none: the first question slide). */
  | { kind: 'clue'; category: string; clue: string; side?: Side; slide?: string; element?: string; onBoard?: boolean }
  | { kind: 'decor'; element?: string }
  /** `slide`: a question slide after the first (its id). */
  | { kind: 'final'; side?: Side; slide?: string; element?: string }
  /** A slides round's slide: `slide`, one after the first (its id). */
  | { kind: 'slides'; slide?: string; element?: string }
  | { kind: 'space'; space: string }
  | { kind: 'backdrop'; element?: string }
  | { kind: 'zone'; zone: string; inSlide?: boolean; element?: string }
  | { kind: 'values' };

/** What a path in the game leads to. */
export interface At {
  place: Place | null;
  /** Where it is, for people: ['Round 1', 'Memes', '$400', 'Question']. */
  crumbs: string[];
  icon: string;
  /** The deepest thing the path reaches ('category'), its name, and how many segments lead to it. */
  noun: string;
  name: string;
  depth: number;
  /** A clue's, a Final's or the tiebreaker's main text box. */
  main?: 'question' | 'answer';
}

export interface Described {
  label: string;
  icon: string;
  where: string;
  /** Where the change shows once the step is applied, and once it's undone. */
  place: Place | null;
  undoPlace: Place | null;
}

const MEDIA_ICON: Record<MediaKind, string> = { image: '🖼', video: '🎬', audio: '🔊', font: '🔤' };
const SIDE_NAME = { q: 'Question', a: 'Answer' } as const;

type Obj = Record<string, unknown>;
const byId = <T>(list: unknown, id: Seg | undefined): T | undefined =>
  Array.isArray(list) && typeof id === 'string' ? list.find((x) => (x as Obj)?.id === id) : undefined;

function elementNoun(el: SlideElement): string {
  if (el.role) return 'object';
  if (el.kind === 'shape') return el.hotspot ? 'hotspot' : el.shape === 'path' ? 'drawing' : 'shape';
  return { text: 'text box', image: 'image', video: 'video', audio: 'audio clip', embed: 'link' }[el.kind] ?? 'item';
}

/** Where a path in `game` leads (as far as it exists there). */
export function placeAt(game: Game, path: readonly Seg[]): At {
  const at: At = { place: null, crumbs: [], icon: '✏️', noun: 'game', name: game.title ?? '', depth: 0 };
  /** Inside an object's role or a list of buttons, the place stays on their owner. */
  let owned = false;
  const reached = (depth: number, noun: string, name: string, icon?: string, crumb = true) => {
    at.depth = depth;
    at.noun = noun;
    at.name = name;
    if (icon) at.icon = icon;
    if (crumb) at.crumbs.push(name);
  };
  const go = (place: Place) => {
    if (!owned) at.place = place;
  };

  /** Into a slide's elements (i: the segment after the slide), then an object's dialogue and buttons. */
  function slide(s: Slide | undefined, i: number, placeFor: (element: string) => Place, main?: Side): void {
    if (!s || path[i] !== 'elements') return;
    const el = byId<SlideElement>(s.elements, path[i + 1]);
    if (!el) return;
    reached(i + 2, elementNoun(el), layerLabel(el, game) ?? '', LAYER_ICON[el.kind]);
    go(placeFor(el.id));
    if (main && el === s.elements.find((x) => x.kind === 'text')) at.main = main === 'q' ? 'question' : 'answer';
    if (path[i + 2] !== 'role' || !el.role) return;
    owned = true;
    if (path[i + 3] === 'dialogue') {
      at.crumbs.push('dialogue');
      slide(el.role.dialogue, i + 4, placeFor);
    } else if (path[i + 3] === 'actions') actions(el.role.actions, i + 4, placeFor);
  }

  /** Into a list of buttons (an object's, a space's, an item's, a wheel slice's). */
  function actions(list: Action[] | undefined, i: number, placeFor: (element: string) => Place): void {
    owned = true;
    const a = byId<Action>(list, path[i]);
    if (!a) return;
    reached(i + 1, 'button', describeAction(game, a), undefined, false);
    if (a.do === 'popup' && path[i + 1] === 'slide') {
      at.crumbs.push('pop-up');
      slide(a.slide, i + 2, placeFor);
    } else if (a.do === 'question' && (path[i + 1] === 'question' || path[i + 1] === 'answer')) {
      at.crumbs.push('question');
      slide(a[path[i + 1] as 'question' | 'answer'], i + 2, placeFor);
    }
  }

  function round(r: Round, index: number): void {
    const id = r.id;
    reached(2, 'round', roundName(r, index), ROUND_MODES[r.mode]?.icon);
    go({ tab: 'round', round: id });
    const part = (p: RoundPart) => go({ tab: 'round', round: id, part: p });
    if (r.mode === 'board') {
      if (path[2] === 'values') {
        reached(3, 'row values', 'Row values');
        part({ kind: 'values' });
      } else if (path[2] === 'decor') {
        at.crumbs.push('Board images');
        at.icon = '🖼';
        part({ kind: 'decor' });
        const el = byId<SlideElement>(r.decor, path[3]);
        if (!el) return;
        reached(4, 'board image', layerLabel(el, game) ?? '', LAYER_ICON[el.kind]);
        part({ kind: 'decor', element: el.id });
      } else if (path[2] === 'categories') {
        const cat = byId<(typeof r.categories)[number]>(r.categories, path[3]);
        if (!cat) return;
        reached(4, 'category', categoryLabel(cat));
        part({ kind: 'category', category: cat.id });
        const row = cat.clues.findIndex((c) => c.id === path[5]);
        if (path[4] !== 'clues' || row < 0) return;
        const clue = cat.clues[row];
        reached(6, 'clue', formatPoints(clueValue(r, row, clue), game.settings.currencySymbol));
        part({ kind: 'clue', category: cat.id, clue: clue.id });
        if (path[6] === 'extraSlides') {
          // One of the clue's extra question slides ("Question 2").
          at.crumbs.push(SIDE_NAME.q);
          part({ kind: 'clue', category: cat.id, clue: clue.id, side: 'q' });
          const n = clue.extraSlides?.findIndex((s) => s.id === path[7]) ?? -1;
          if (n < 0) return;
          const sl = clue.extraSlides![n];
          at.crumbs[at.crumbs.length - 1] = `${SIDE_NAME.q} ${n + 2}`;
          reached(8, 'slide', `question slide ${n + 2}`, undefined, false);
          const at8 = { kind: 'clue', category: cat.id, clue: clue.id, side: 'q', slide: sl.id } as const;
          part(at8);
          slide(sl, 8, (element) => ({ tab: 'round', round: id, part: { ...at8, element } }), 'q');
          return;
        }
        const side = path[6] === 'questionSlide' ? 'q' : path[6] === 'answerSlide' ? 'a' : null;
        if (!side) return;
        // (A clue with more question slides: "Question 1".)
        at.crumbs.push(side === 'q' && clue.extraSlides?.length ? `${SIDE_NAME.q} 1` : SIDE_NAME[side]);
        part({ kind: 'clue', category: cat.id, clue: clue.id, side });
        slide(clue[path[6] as 'questionSlide'], 7, (element) => ({ tab: 'round', round: id, part: { kind: 'clue', category: cat.id, clue: clue.id, side, element } }), side);
      }
    } else if (r.mode === 'final') {
      if (path[2] === 'extraSlides') {
        // One of its extra question slides ("Question 2").
        at.crumbs.push(SIDE_NAME.q);
        part({ kind: 'final', side: 'q' });
        const n = r.extraSlides?.findIndex((s) => s.id === path[3]) ?? -1;
        if (n < 0) return;
        const sl = r.extraSlides![n];
        at.crumbs[at.crumbs.length - 1] = `${SIDE_NAME.q} ${n + 2}`;
        reached(4, 'slide', `question slide ${n + 2}`, undefined, false);
        part({ kind: 'final', side: 'q', slide: sl.id });
        slide(sl, 4, (element) => ({ tab: 'round', round: id, part: { kind: 'final', side: 'q', slide: sl.id, element } }), 'q');
        return;
      }
      const side = path[2] === 'questionSlide' ? 'q' : path[2] === 'answerSlide' ? 'a' : null;
      if (!side) return;
      at.crumbs.push(side === 'q' && r.extraSlides?.length ? `${SIDE_NAME.q} 1` : SIDE_NAME[side]);
      part({ kind: 'final', side });
      slide(r[path[2] as 'questionSlide'], 3, (element) => ({ tab: 'round', round: id, part: { kind: 'final', side, element } }), side);
    } else if (r.mode === 'slides') {
      if (path[2] === 'extraSlides') {
        const n = r.extraSlides?.findIndex((s) => s.id === path[3]) ?? -1;
        if (n < 0) return;
        const sl = r.extraSlides![n];
        reached(4, 'slide', `Slide ${n + 2}`);
        part({ kind: 'slides', slide: sl.id });
        slide(sl, 4, (element) => ({ tab: 'round', round: id, part: { kind: 'slides', slide: sl.id, element } }));
        return;
      }
      if (path[2] !== 'questionSlide') return;
      reached(3, 'slide', 'Slide 1');
      part({ kind: 'slides' });
      slide(r.questionSlide, 3, (element) => ({ tab: 'round', round: id, part: { kind: 'slides', element } }));
    } else if (r.mode === 'boardgame') {
      if (path[2] === 'spaces') {
        at.crumbs.push('Spaces');
        const sp = byId<(typeof r.spaces)[number]>(r.spaces, path[3]);
        if (!sp) return;
        reached(4, 'space', sp.name, '⬤');
        part({ kind: 'space', space: sp.id });
        if (path[4] === 'onPass' || path[4] === 'onLand') actions(sp[path[4]], 5, () => ({ tab: 'round', round: id, part: { kind: 'space', space: sp.id } }));
      } else if (path[2] === 'zones') {
        at.crumbs.push('Zones');
        const z = byId<(typeof r.zones)[number]>(r.zones, path[3]);
        if (!z) return;
        reached(4, 'zone', z.name, '🌀');
        part({ kind: 'zone', zone: z.id });
        if (path[4] !== 'slide') return;
        part({ kind: 'zone', zone: z.id, inSlide: true });
        slide(z.slide, 5, (element) => ({ tab: 'round', round: id, part: { kind: 'zone', zone: z.id, inSlide: true, element } }));
      } else if (path[2] === 'slide') {
        at.crumbs.push('Backdrop');
        at.icon = '🖼';
        part({ kind: 'backdrop' });
        slide(r.slide, 3, (element) => ({ tab: 'round', round: id, part: { kind: 'backdrop', element } }));
      }
    }
  }

  function world(): void {
    const w = byId<NonNullable<Game['worlds']>[number]>(game.worlds, path[1]);
    if (!w) return;
    reached(2, 'world', w.name, '🗺');
    go({ tab: 'world', world: w.id });
    const m = path[2] === 'maps' ? byId<(typeof w.maps)[number]>(w.maps, path[3]) : undefined;
    if (!m) return;
    reached(4, 'map', m.name);
    go({ tab: 'world', world: w.id, map: m.id });
    const s = path[4] === 'screens' ? byId<(typeof m.screens)[number]>(m.screens, path[5]) : undefined;
    if (!s) return;
    reached(6, 'screen', s.name);
    const screen = { tab: 'world', world: w.id, map: m.id, screen: s.id } as const;
    go(screen);
    if (path[6] === 'slide') {
      go({ ...screen, inSlide: true });
      slide(s.slide, 7, (element) => ({ ...screen, inSlide: true, element }));
    } else if (path[6] === 'variants') {
      const v = byId<NonNullable<typeof s.variants>[number]>(s.variants, path[7]);
      if (!v) return;
      reached(8, 'look', v.name);
      go({ ...screen, look: v.id });
      if (path[8] !== 'slide') return;
      go({ ...screen, look: v.id, inSlide: true });
      slide(v.slide, 9, (element) => ({ ...screen, look: v.id, inSlide: true, element }));
    }
  }

  switch (path[0]) {
    case 'title':
      at.crumbs.push('Game title');
      go({ tab: 'title' });
      break;
    // The rules, the buzzers and the players are set on the ▶ Play screen (Go there opens it).
    case 'settings': {
      const part = path[1] === 'stream' ? 'stream' : BUZZ_SETTINGS.has(path[1]) ? 'buzzers' : 'rules';
      at.crumbs.push('Play', PLAY_PARTS[part][0]);
      at.icon = PLAY_PARTS[part][1];
      go({ tab: 'play', part });
      break;
    }
    case 'audio':
    case 'soundsOff':
    case 'soundVolume':
      at.crumbs.push('Sounds');
      at.icon = '🔊';
      go({ tab: 'sounds' });
      break;
    case 'players': {
      at.crumbs.push('Play', 'Players');
      at.icon = '👤';
      go({ tab: 'play', part: 'players' });
      const p = byId<Game['players'][number]>(game.players, path[1]);
      if (!p) break;
      reached(2, 'player', p.name);
      break;
    }
    case 'rounds': {
      const i = game.rounds.findIndex((r) => r.id === path[1]);
      if (i >= 0) round(game.rounds[i], i);
      break;
    }
    case 'worlds':
      world();
      break;
    case 'wheels':
    case 'dice': {
      at.crumbs.push('Wheels & Dice');
      at.icon = path[0] === 'wheels' ? '🎡' : '🎲';
      go({ tab: 'tools' });
      const tool = byId<{ id: string; name: string; segments?: Game['wheels'][number]['segments'] }>(game[path[0]], path[1]);
      if (!tool) break;
      reached(2, path[0] === 'wheels' ? 'wheel' : 'dice', tool.name);
      go({ tab: 'tools', [path[0] === 'wheels' ? 'wheel' : 'dice']: tool.id });
      const slice = path[2] === 'segments' ? byId<NonNullable<typeof tool.segments>[number]>(tool.segments, path[3]) : undefined;
      if (!slice) break;
      reached(4, 'slice', slice.label, undefined, false);
      if (path[4] === 'actions') actions(slice.actions, 5, () => ({ tab: 'tools', wheel: tool.id }));
      break;
    }
    case 'statFields':
    case 'items':
    case 'shops': {
      at.crumbs.push('Stats & Items');
      const kind = ({ statFields: ['stat', '📊'], items: ['item', '📦'], shops: ['shop', '🏪'] } as const)[path[0]];
      at.icon = kind[1];
      go({ tab: 'stats' });
      const x = byId<{ id: string; name: string; onUse?: Action[] }>(game[path[0]], path[1]);
      if (!x) break;
      reached(2, kind[0], x.name);
      go({ tab: 'stats', [kind[0]]: x.id });
      if (path[2] === 'onUse') actions(x.onUse, 3, () => ({ tab: 'stats', item: x.id }));
      break;
    }
    case 'media': {
      at.crumbs.push('Media');
      at.icon = '🖼';
      go({ tab: 'media' });
      const m = byId<Game['media'][number]>(game.media, path[1]);
      if (!m) break;
      reached(2, 'file', m.name, MEDIA_ICON[m.kind]);
      go({ tab: 'media', media: m.id });
      break;
    }
    case 'theme':
      at.crumbs.push('Theme');
      at.icon = '🎨';
      go({ tab: 'theme' });
      break;
    case 'tiebreaker': {
      at.crumbs.push('Tiebreaker');
      at.icon = '🏁';
      go({ tab: 'tiebreaker' });
      const tb = game.tiebreaker;
      if (path[1] === 'extraSlides' && tb) {
        // One of its extra question slides ("Question 2").
        at.crumbs.push(SIDE_NAME.q);
        go({ tab: 'tiebreaker', side: 'q' });
        const n = tb.extraSlides?.findIndex((s) => s.id === path[2]) ?? -1;
        if (n < 0) break;
        const sl = tb.extraSlides![n];
        at.crumbs[at.crumbs.length - 1] = `${SIDE_NAME.q} ${n + 2}`;
        reached(3, 'slide', `question slide ${n + 2}`, undefined, false);
        go({ tab: 'tiebreaker', side: 'q', slide: sl.id });
        slide(sl, 3, (element) => ({ tab: 'tiebreaker', side: 'q', slide: sl.id, element }), 'q');
        break;
      }
      const side = path[1] === 'questionSlide' ? 'q' : path[1] === 'answerSlide' ? 'a' : null;
      if (!side || !tb) break;
      at.crumbs.push(side === 'q' && tb.extraSlides?.length ? `${SIDE_NAME.q} 1` : SIDE_NAME[side]);
      go({ tab: 'tiebreaker', side });
      slide(tb[path[1] as 'questionSlide'], 2, (element) => ({ tab: 'tiebreaker', side, element }), side);
      break;
    }
  }
  return at;
}

/** Where an item on a clue's, a Final's or the tiebreaker's slide is (a restyle starts there but changes other slides). */
export function itemPlace(game: Game, id: string): Place | null {
  const on = (s: Slide) => s.elements.some((e) => e.id === id);
  const sides = ['questionSlide', 'answerSlide'] as const;
  for (const r of game.rounds) {
    if (r.mode === 'board')
      for (const c of r.categories)
        for (const cl of c.clues) {
          const side = sides.find((k) => on(cl[k]));
          if (side) return placeAt(game, ['rounds', r.id, 'categories', c.id, 'clues', cl.id, side, 'elements', id]).place;
          const extra = cl.extraSlides?.find(on);
          if (extra) return placeAt(game, ['rounds', r.id, 'categories', c.id, 'clues', cl.id, 'extraSlides', extra.id, 'elements', id]).place;
        }
    if (r.mode === 'final') {
      const side = sides.find((k) => on(r[k]));
      if (side) return placeAt(game, ['rounds', r.id, side, 'elements', id]).place;
      const extra = r.extraSlides?.find(on);
      if (extra) return placeAt(game, ['rounds', r.id, 'extraSlides', extra.id, 'elements', id]).place;
    }
    if (r.mode === 'slides') {
      if (on(r.questionSlide)) return placeAt(game, ['rounds', r.id, 'questionSlide', 'elements', id]).place;
      const extra = r.extraSlides?.find(on);
      if (extra) return placeAt(game, ['rounds', r.id, 'extraSlides', extra.id, 'elements', id]).place;
    }
  }
  const tb = game.tiebreaker;
  const side = tb && sides.find((k) => on(tb[k]));
  if (side) return placeAt(game, ['tiebreaker', side, 'elements', id]).place;
  const extra = tb?.extraSlides?.find(on);
  return extra ? placeAt(game, ['tiebreaker', 'extraSlides', extra.id, 'elements', id]).place : null;
}

// ---------- Labels ----------

const RULES: Record<string, string> = {
  allowNegativeScores: 'Negative scores',
  deductOnWrong: 'Quick ✔/✘ buttons',
  defaultTimerSeconds: 'Clue countdown',
  finalTimerSeconds: 'Final countdown',
  currencySymbol: 'Points symbol',
  rollOffDie: 'Roll-off die',
  pickerFollowsAward: 'Scorer picks next',
  maxPlayers: 'Most players',
  timerAutoStart: 'Countdown starts itself',
  titleCard: 'Round title card',
  tileFill: 'Tile fill animation',
  categoryReveal: 'Category reveal',
  buzzer: 'Buzzer mode',
  buzzArm: 'When the buzzers open',
  phoneJoin: 'New players from their phone',
  earlyBuzzLock: 'Early buzz wait',
  buzzTeams: 'Teams',
};
/** Settings on the pre-game screen's 📱 Phone buzzers card (the rest are in ⚖ Game rules). */
const BUZZ_SETTINGS = new Set<unknown>(['buzzer', 'buzzArm', 'phoneJoin', 'earlyBuzzLock', 'buzzTeams']);
const FIELDS: Record<string, string> = {
  hostNotes: 'host notes',
  winNotes: 'win notes',
  timerSeconds: 'timer',
  allowNonPositive: 'who can play',
  tileFace: 'tile face',
  imageFit: 'image fit',
  showTitleOverImage: 'name over the image',
  editedMedia: 'edited image',
  wheelId: 'wheel',
  diceId: 'dice',
  to: 'destination',
  next: 'links',
  onUse: 'buttons',
  onLand: 'landing buttons',
  onPass: 'passing buttons',
  variants: 'looks',
  statFields: 'stats',
  stageBg: 'stage background',
  exits: 'ways out',
  winPublic: 'how to win on the board',
  dailyDoubleCount: 'Daily Doubles wanted',
};
/** Switches: what turning each on or off says (`who`: “Doorway”, or "the space" for one with no name). */
const TOGGLES: Record<string, (on: boolean, who: string) => string> = {
  winPublic: (on, who) => (on ? `Showed how to win on the board of ${who}` : `Took how to win off the board of ${who}`),
  locked: (on, who) => (on ? `Locked ${who}` : `Unlocked ${who}`),
  secret: (on, who) => (on ? `Made ${who} secret` : `Made ${who} not secret`),
  showName: (on, who) => (on ? `Showed the name of ${who}` : `Hid the name of ${who}`),
  statsShown: (on, who) => (on ? `Showed the stats of ${who} to viewers` : `Hid the stats of ${who} from viewers`),
};
/** Fields that are words people type: a change says what they say now. */
const TEXTS = new Set(['text', 'category', 'hostNotes', 'details', 'description', 'label', 'winNotes', 'notes']);
const TILE_TYPES: Record<string, (tile: string) => string> = {
  dailyDouble: (tile) => `Made ${tile} a Daily Double`,
  wheel: (tile) => `Made ${tile} a wheel tile`,
  dice: (tile) => `Made ${tile} a dice tile`,
  standard: (tile) => `Made ${tile} a standard tile`,
};

/** A theme setting's new value, as the label says it (" chroma green", " off"), or '' when it says nothing readable. */
function themeValue(k: Seg, v: unknown): string {
  if (k === 'stageBg') return v ? ` chroma ${String(v)}` : ': theme colors';
  if (typeof v === 'boolean') return v ? ' on' : ' off';
  if (v === undefined || v === null || v === '') return ' off';
  if (typeof v === 'number') return ` ${v}`;
  // (Not a file's id.)
  return typeof v === 'string' && v.length <= 30 && !/^[0-9a-f-]{20,}$/i.test(v) ? ` ${v}` : '';
}

const fieldName = (k: Seg) => (typeof k === 'number' ? 'item' : (FIELDS[k] ?? k.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()));
export { short };
const quoted = (name: string) => (name.trim() ? ` “${short(name)}”` : '');
const nounOf = (at: At) => (at.noun === 'game' ? 'the game' : at.noun);
const what = (at: At) => nounOf(at) + quoted(at.name);
function plural(noun: string): string {
  if (noun === 'dice' || noun === 'row values') return noun;
  if (/[^aeiou]y$/.test(noun)) return noun.slice(0, -1) + 'ies';
  return /(x|s)$/.test(noun) ? noun + 'es' : noun + 's';
}
const cell = (col: unknown, row: unknown) => `${String.fromCharCode(65 + (Number(col) % 26))}${Number(row) + 1}`;

/** Ids moved by a reorder: the ones outside the longest run that kept its order. */
function movedIds(b: string[], a: string[]): string[] {
  const pos = new Map(b.map((id, i) => [id, i]));
  const seq = a.map((id) => pos.get(id)!);
  const len = seq.map(() => 1);
  const prev = seq.map(() => -1);
  for (let i = 0; i < seq.length; i++)
    for (let j = 0; j < i; j++)
      if (seq[j] < seq[i] && len[j] + 1 > len[i]) {
        len[i] = len[j] + 1;
        prev[i] = j;
      }
  const kept = new Set<number>();
  for (let i = len.indexOf(Math.max(...len)); i >= 0; i = prev[i]) kept.add(i);
  return a.filter((_, i) => !kept.has(i));
}

/** The op that says what a step did: the first insert, delete or move nearest the top, else the first op. */
function primary(ops: readonly Op[]): Op {
  let best: Op | undefined;
  // (Rounds before players and the rest: the sample game adds both, and it's its rounds that show.)
  const rank = (o: Op) => o.p.length * 2 + (o.p[0] === 'rounds' ? 0 : 1);
  for (const op of ops) if (op.t !== 'set' && (!best || rank(op) < rank(best))) best = op;
  return best ?? ops[0];
}

const isList = (v: unknown): v is Obj[] => Array.isArray(v) && v.length > 0 && v.every((x) => typeof (x as Obj)?.id === 'string');
const none = (v: unknown) => v === undefined || (Array.isArray(v) && !v.length);

/**
 * A list given to something that had none (the first stat of a game, a screen's first look) as the insert of its first
 * element, with how many it has; a list taken away as the delete. Null for any other op.
 */
function asList(op: Op): { op: Op; n: number } | null {
  if (op.t !== 'set') return null;
  const p = [...op.p, op.k];
  if (isList(op.a) && none(op.b)) return { op: { t: 'ins', p, i: 0, id: op.a[0].id as string, v: op.a[0] as Json }, n: op.a.length };
  if (isList(op.b) && none(op.a)) return { op: { t: 'del', p, i: 0, id: op.b[0].id as string, v: op.b[0] as Json }, n: op.b.length };
  return null;
}

/** Every change is inside the thing `op` changes or around it (typing a question also makes its tile playable). */
function related(ops: readonly Op[], op: Op): boolean {
  const mine = op.p.join('/');
  const inside = (a: string, b: string) => a === b || (!!b && a.startsWith(b + '/'));
  return ops.every((o) => inside(o.p.join('/'), mine) || inside(mine, o.p.join('/')));
}

/** The path every op's change is under. */
function commonPath(ops: readonly Op[]): Seg[] {
  let common = opPath(ops[0]);
  for (const op of ops) {
    const path = opPath(op);
    let i = 0;
    while (i < common.length && i < path.length && common[i] === path[i]) i++;
    common = common.slice(0, i);
  }
  return common;
}

/**
 * Where a step that changed several separate things shows: the place that has them all (the board, for Daily Doubles
 * placed across it; the players, for players added together). Null for a change to one thing, and for items on one
 * slide or screens on one map, which are shown (and selected) themselves.
 */
function widePath(ops: readonly Op[], op: Op, alike: number): Seg[] | null {
  const several = op.t === 'set' ? !related(ops, op) : op.t !== 'ord' && (alike > 1 || ops.filter((o) => o.t === op.t).length > 1);
  if (!several) return null;
  const path = commonPath(ops);
  const last = path[path.length - 1];
  return path.length && last !== 'elements' && last !== 'decor' && last !== 'screens' ? path : null;
}

/** Name and places of a step. An editor's own label wins; the places always come from the ops. */
export function describe(all: readonly Op[], before: Game, after: Game, explicit?: string | null): Described {
  // A file added with what shows it (a picture put on a slide, an image edited): that is what the step did, and where.
  const shown = all.filter((o) => opPath(o)[0] !== 'media');
  const ops = shown.length ? shown : all;
  const first = primary(ops);
  const list = asList(first);
  const op = list?.op ?? first;
  const moved = op.t === 'ord' ? movedIds(op.b, op.a) : [];
  const path = op.t === 'ord' && moved.length === 1 ? [...op.p, moved[0]] : opPath(op);
  const at = placeAt(op.t === 'del' ? before : after, path);
  const alike = list?.n ?? ops.filter((o) => o.t === op.t && o.p.join() === op.p.join()).length;
  let place = at.place;
  let undoPlace = at.place;
  let crumbs = at.crumbs;
  if (op.t === 'ins') undoPlace = placeAt(before, op.p).place;
  if (op.t === 'del') place = placeAt(after, op.p).place;
  const wide = widePath(ops, op, alike);
  if (wide) {
    const [a, b] = [placeAt(after, wide), placeAt(before, wide)];
    place = a.place ?? place;
    undoPlace = b.place ?? undoPlace;
    crumbs = (op.t === 'del' ? b : a).crumbs;
  } else if (alike > 1 && (op.t === 'ins' || op.t === 'del')) crumbs = crumbs.slice(0, -1); // (Not the first one's name: "Added 2 images".)
  const label = explicit || labelOf(ops, op, at, moved, alike, before, after);
  // Where it is doesn't say again what the label names ("Edited question “Who is Pepe?”" in Round 1 › Memes › $400 › Question).
  const last = crumbs[crumbs.length - 1];
  if (last?.trim() && label.includes(`“${short(last)}”`)) crumbs = crumbs.slice(0, -1);
  return { label, icon: at.icon, where: crumbs.join(' › '), place, undoPlace };
}

/** Theme settings as the 🎨 Theme tab calls them. */
const THEME_FIELDS: Record<string, string> = {
  tile: 'tile color',
  tileUsed: 'used tile color',
  boardGap: 'line color',
  value: 'value color',
  boardText: 'category name color',
  stageText: 'slide text color',
  scoreBarBg: 'score bar color',
  boardFont: 'category font',
  valueFont: 'value font',
  glow: 'tile glow',
  boardImage: 'background picture',
  bannerHeight: 'banner height',
  bannerFit: 'banner fit',
  clueFont: 'clue text font',
  clueColor: 'clue text color',
  tilePattern: 'alternating tiles',
  tile2: 'second tile color',
  tileGradient: 'tile gradient',
  tileAngle: 'gradient direction',
  tileBorder: 'tile border color',
  tileBorderWidth: 'tile border width',
  tileRadius: 'tile corners',
  glowSize: 'glow size',
  tileShadow: 'tile shadow',
  valueShadow: 'value shadow',
  usedLook: 'played tiles',
  tileGap: 'space between tiles',
  headerBg: 'category color',
  header2: 'second category color',
  headerGradient: 'category gradient',
  headerLine: 'line under categories',
  plateShape: 'score plate shape',
  leaderGlow: 'leader glow',
  bgGradient: 'background gradient',
  bgAngle: 'background gradient direction',
  source: 'saved theme',
};
const themeField = (k: Seg | undefined) => (k === undefined ? 'theme' : (THEME_FIELDS[k] ?? fieldName(k)));

/** Keys that hold a slide. */
const SLIDE_KEYS = new Set<Seg>(['questionSlide', 'answerSlide', 'slide', 'dialogue']);
/** Does the path up to `p[i]` lead to a slide (a key that holds one, or one of a clue's extra slides)? */
const isSlide = (p: readonly Seg[], i: number) => SLIDE_KEYS.has(p[i]) || p[i - 1] === 'extraSlides';
/**
 * Is the op about a slide's own background (not a text box's background box)? 'whole' when it's set all at once
 * (↺ BG resets it), else which of its settings.
 */
function slideBackground(op: Op): Seg | 'whole' | null {
  if (op.t !== 'set') return null;
  const p = op.p;
  if (op.k === 'background' && isSlide(p, p.length - 1)) return 'whole';
  if (p[p.length - 1] === 'background' && isSlide(p, p.length - 2)) return op.k;
  return null;
}

/** A text box's settings as the Inspector calls them. */
const TEXT_FIELDS: Record<string, string> = {
  stroke: 'outline',
  shadow: 'drop shadow',
  glow: 'glow',
  background: 'background box',
  autoFit: 'shrink to fit',
  size: 'text size',
  weight: 'bold',
  vAlign: 'vertical position',
  align: 'alignment',
};
const EFFECT_PARTS: Record<string, string> = { width: 'width', color: 'color', blur: 'blur', x: 'X', y: 'Y', padding: 'padding', radius: 'corners' };
const EFFECTS = new Set(['stroke', 'shadow', 'glow', 'background']);

/** A change to a text box's setting or effect ("Added an outline to text box “Hi”", "Changed outline width of …"). */
function textBoxChange(op: Op & { t: 'set' }, at: At): string | null {
  if (at.noun !== 'text box') return null;
  const sub = opPath(op).slice(at.depth);
  const field = sub[0];
  if (typeof field !== 'string' || !TEXT_FIELDS[field]) return null;
  const name = TEXT_FIELDS[field];
  if (sub.length === 1 && EFFECTS.has(field)) {
    if (op.a === undefined) return `Removed the ${name} from ${what(at)}`;
    if (op.b === undefined) return `Added ${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name} to ${what(at)}`;
  }
  const part = sub.length > 1 && typeof sub[1] === 'string' ? ` ${EFFECT_PARTS[sub[1]] ?? fieldName(sub[1])}` : '';
  return `Changed ${name}${part} of ${what(at)}`;
}

function labelOf(ops: readonly Op[], op: Op, at: At, moved: string[], alike: number, before: Game, after: Game): string {
  if (op.t === 'ins' || op.t === 'del') {
    const verb = op.t === 'ins' ? 'Added' : at.noun === 'file' ? 'Removed' : 'Deleted';
    return alike > 1 ? `${verb} ${alike} ${plural(at.noun)}` : `${verb} ${what(at)}`;
  }
  if (op.t === 'ord') {
    if (moved.length !== 1) return `Reordered ${plural(placeAt(after, [...op.p, op.a[0]]).noun)}`;
    if (at.noun !== 'round') return `Moved ${what(at)}`;
    return `Moved ${what(at)} ${op.a.indexOf(moved[0]) < op.b.indexOf(moved[0]) ? 'earlier' : 'later'}`;
  }
  const sets = ops as (Op & { t: 'set' })[];
  const k = op.k;
  const v = (op as Op & { t: 'set' }).a;
  const keys = new Set(sets.map((o) => o.k));
  const things = new Set(sets.map((o) => o.p.join('/')));
  const only = (...allowed: Seg[]) => [...keys].every((x) => allowed.includes(x));
  const top = opPath(op)[0];

  if (top === 'settings') {
    const rule = RULES[k] ?? fieldName(k);
    return typeof v === 'boolean' ? `Rule: ${rule} ${v ? 'on' : 'off'}` : `Rule: ${rule} = ${v ?? 'off'}`;
  }
  if (top === 'soundsOff') {
    // (The game's first sound switched off brings the whole list.)
    const key = op.p.length ? k : Object.keys((v ?? (op as Op & { t: 'set' }).b ?? {}) as Obj)[0];
    const name = cueName(String(key)) ?? fieldName(key ?? k);
    const on = op.p.length ? !v : !v || !(v as Obj)[key];
    return `Turned ${on ? 'on' : 'off'} the ${name} sound`;
  }
  if (top === 'soundVolume') {
    // (The game's first volume set brings the whole list.)
    const key = op.p.length ? k : Object.keys((v ?? (op as Op & { t: 'set' }).b ?? {}) as Obj)[0];
    const n = op.p.length ? v : (v as Obj | undefined)?.[key];
    return `Volume of the ${cueName(String(key)) ?? fieldName(key ?? k)} sound: ${typeof n === 'number' ? Math.round(n * 100) : 100}%`;
  }
  if (top === 'audio') {
    const name = cueName(String(k)) ?? fieldName(k);
    if (v === '') return `Turned off the ${name} sound`;
    if (v === undefined) return hasBuiltin(k as CueKey) ? `Built-in ${name} sound` : `Removed the ${name} sound`;
    return `Changed the ${name} sound`;
  }
  if (top === 'theme') {
    const preset = sets.find((o) => o.k === 'preset' && o.p.length === 1);
    if (preset) return `Theme preset: ${PRESETS[preset.a as ThemePreset]?.label ?? preset.a}`;
    if (ops.length === 1 && op.p.length === 1) return `Theme: ${themeField(k)}${themeValue(k, v)}`;
    // Several theme settings at once: which ones (the first three).
    const names = [...new Set(sets.filter((o) => o.p[0] === 'theme').map((o) => themeField(o.p.length === 1 ? o.k : o.p[1])))];
    return names.length && names.length <= 3 ? `Theme: ${names.join(', ')}` : 'Changed the theme';
  }
  // A slide's background (not a text box's background box): its colour, its picture, or all of it reset.
  const bg = slideBackground(op);
  if (bg === 'whole') return 'Reset the slide background';
  if (bg === 'color') return v ? `Slide background color ${String(v)}` : 'Removed the slide background color';
  if (bg === 'image') return v ? 'Slide background picture' : 'Removed the slide background picture';
  if (bg) return 'Changed the slide background';
  if (!op.p.length && k === 'tiebreaker') return v === undefined ? 'Tiebreaker off' : 'Tiebreaker on';

  if (at.noun === 'screen' && only('col', 'row')) {
    const ids = [...things].map((t) => t.split('/').pop()!);
    const find = (g: Game, id: string) => (g.worlds ?? []).flatMap((w) => w.maps).flatMap((m) => m.screens).find((s) => s.id === id);
    if (ids.length === 1) {
      const s = find(after, ids[0]);
      return `Moved ${what(at)} to ${cell(s?.col, s?.row)}`;
    }
    if (ids.length === 2) {
      const [a0, b0, a1, b1] = [find(before, ids[0]), find(before, ids[1]), find(after, ids[0]), find(after, ids[1])];
      if (a0 && b0 && a1 && b1 && a1.col === b0.col && a1.row === b0.row && b1.col === a0.col && b1.row === a0.row)
        return `Swapped screens${quoted(a1.name)} and${quoted(b1.name)}`;
    }
    return `Moved ${ids.length} screens`;
  }
  const several = things.size > 1;
  if (only('x', 'y')) return several ? `Moved ${things.size} items` : `Moved ${what(at)}`;
  if (only('x', 'y', 'w', 'h')) return several ? `Resized ${things.size} items` : `Resized ${what(at)}`;
  if (only('rotation')) return several ? `Rotated ${things.size} items` : `Rotated ${what(at)}`;
  if (only('zIndex')) return 'Restacked items';
  // (Changes inside one thing and around it are one thing's change.)
  if (several && !related(ops, op)) return `${ops.length} changes`;
  // An object made a doorway, a character… (or scenery again).
  const role = sets.find((o) => (o.k === 'role' && o.p.length === at.depth) || (o.k === 'class' && o.p[o.p.length - 1] === 'role'));
  if (role) {
    const cls = role.k === 'role' ? ((role.a as Obj | undefined)?.class ?? '') : role.a;
    const kind = (OBJECT_CLASSES.find(([c]) => c === cls)?.[1] ?? String(cls)).replace(/^\S+\s/, '').toLowerCase();
    const who = at.name.trim() ? `“${short(at.name)}”` : `the ${nounOf(at)}`;
    return cls ? `Made ${who} ${/^[aeiou]/.test(kind) ? 'an' : 'a'} ${kind}` : `Made ${who} ${kind}`;
  }

  if (typeof k === 'string' && TOGGLES[k] && (typeof v === 'boolean' || v === undefined) && !several) {
    const who = at.name.trim() ? `“${short(at.name)}”` : `the ${nounOf(at)}`;
    return TOGGLES[k](!!v, who);
  }
  if (k === 'dailyDoubleCount' && typeof v === 'number') return `Set ${what(at)} to ${v} Daily Double${v === 1 ? '' : 's'}`;
  if (at.noun === 'row values') return 'Changed the row values';
  const own = op.p.length === at.depth;
  // A tile is named as the board shows it ("Memes $400"); a value changed, by the one it had.
  const tile = `${at.crumbs[at.crumbs.length - 2] ?? ''} ${at.name}`.trim();
  // A board game's Start, and a space's ways on (said as ✎ Edit board in play says them).
  const spaceName = (id: unknown) => {
    const r = byId<Round>(after.rounds, op.p[1]) ?? byId<Round>(before.rounds, op.p[1]);
    return (r?.mode === 'boardgame' && r.spaces.find((s) => s.id === id)?.name) || '?';
  };
  if (own && at.noun === 'round' && k === 'start') {
    const r = byId<Round>(after.rounds, op.p[1]) ?? byId<Round>(before.rounds, op.p[1]);
    // (An RPG round's start is a screen, not a space.)
    if (r?.mode === 'rpg') return v ? `Changed where the party starts in ${what(at)}` : `The party starts on the first screen in ${what(at)}`;
    return v ? `Made “${spaceName(v)}” Start` : 'Made the first space Start';
  }
  if (own && at.noun === 'space' && k === 'next' && Array.isArray(v) && Array.isArray((op as Op & { t: 'set' }).b)) {
    const was = (op as Op & { t: 'set' }).b as Json[];
    const added = v.filter((x) => !was.includes(x));
    const gone = was.filter((x) => !v.includes(x));
    if (added.length === 1 && !gone.length) return `Connected ${at.name} → ${spaceName(added[0])}`;
    if (gone.length === 1 && !added.length) return `Disconnected ${at.name} → ${spaceName(gone[0])}`;
  }
  if (own && at.noun === 'clue' && k === 'type')return TILE_TYPES[v as string]?.(tile) ?? `Changed the type of ${tile}`;
  if (own && at.noun === 'clue' && k === 'empty') return v ? `Left ${tile} empty` : `Made ${tile} playable again`;
  if (own && at.noun === 'clue' && k === 'value') {
    const sym = after.settings.currencySymbol;
    const r = byId<Round>(after.rounds, op.p[1]);
    const cat = r?.mode === 'board' ? byId<(typeof r.categories)[number]>(r.categories, op.p[3]) : undefined;
    const row = cat?.clues.findIndex((c) => c.id === op.p[5]) ?? -1;
    const rowValue = r?.mode === 'board' ? r.values[row] : undefined;
    const was = typeof op.b === 'number' ? op.b : (rowValue ?? 0);
    const now = typeof v === 'number' ? formatPoints(v, sym) : `the row's ${formatPoints(rowValue ?? 0, sym)}`;
    return `Changed ${`${cat ? categoryLabel(cat) : ''} ${formatPoints(was, sym)}`.trim()} to ${now}`;
  }
  // (A picture taken off: not a change to it.)
  if (own && k === 'image' && v === undefined && (op as Op & { t: 'set' }).b !== undefined) return `Removed the image of ${what(at)}`;
  if (own && (k === 'name' || k === 'title' || (k === 'label' && at.noun === 'slice')))
    return `Renamed ${nounOf(at)}${quoted(typeof v === 'string' ? v : '')}`;
  if (typeof k === 'string' && TEXTS.has(k)) {
    const field = k === 'text' ? (at.main ?? 'text') : fieldName(k);
    return typeof v === 'string' && v.trim() ? `Edited ${field}${quoted(v)}` : `Cleared the ${field}`;
  }
  const textChange = op.t === 'set' ? textBoxChange(op, at) : null;
  if (textChange) return textChange;
  return `Changed ${fieldName(typeof k === 'number' ? (op.p[op.p.length - 1] ?? k) : k)} of ${what(at)}`;
}
