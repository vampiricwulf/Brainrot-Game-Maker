// Running actions (games-maker spec §7.10): the host pressed an object's, item's or wheel slice's button. State
// changes go through toolset.logged() (undoable); show-only effects (wheels, pop-ups, sounds, timers) go to Live.
import { formatPoints, newId, PLAYER_WHEEL, type Action, type BoardGameRound, type BoardGameState, type Game, type Session, type Who, type World, type WorldState } from './model';
import { movePlayer, sendTo, skipTurns, spaceById } from './boardgame';
import { blip, playSound, startTimer, type Live } from './live';
import { addWheel, openPlayerWheel, openWheel, quickDice, rollDice } from './overlay';
import { parseDice } from './tools';
import { actionProblem } from './refs';
import { applyScore, nameList } from './session';
import { activeParty, moveTo, override, partyOn } from './rpg';
import { addStat, giveItem, itemDef, logged, setStat, statFields, takeItem } from './toolset';

export interface RunContext {
  game: Game;
  session: Session;
  live: Live;
  /** RPG rounds: the world and its state (moves, reveals). */
  world?: World;
  st?: WorldState;
  /** Board-game rounds: the round and its state (sending players to spaces and zones). */
  board?: BoardGameRound;
  bs?: BoardGameState;
  /** Players the host has selected (the 1–9 keys / chips). */
  selected: string[];
  /** Who "ask" means: the players the host picked on the card. In board games also who "party" means (the mover). */
  chosen?: string[];
  /** RPG rounds: the screen the object whose button it is stands on ("party" is the party standing there). */
  at?: string;
}

/** RPG rounds: the party a button's "party" means: the one standing on its object's screen, else the followed one. */
function partyOf(ctx: RunContext) {
  if (!ctx.st) return undefined;
  return (ctx.at ? partyOn(ctx.st, ctx.at) : undefined) ?? activeParty(ctx.st);
}

/** The players an action applies to. */
export function targets(ctx: RunContext, who: Who | undefined): string[] {
  const all = ctx.session.players.map((p) => p.id);
  switch (who ?? 'ask') {
    case 'all':
      return all;
    case 'party':
      if (ctx.bs) {
        // Board games: the player the button is for (who moved, the ones picked on a space's card), else whoever's turn it is.
        if (ctx.chosen?.length) return ctx.chosen;
        const cur = ctx.bs.order[ctx.bs.turn];
        return cur ? [cur] : [];
      }
      return ctx.st ? (partyOf(ctx)?.members ?? []) : ctx.selected.length ? ctx.selected : all;
    case 'selected':
      return ctx.selected;
    case 'picker':
      return ctx.session.currentPickerId ? [ctx.session.currentPickerId] : [];
    case 'ask':
      return ctx.chosen?.length ? ctx.chosen : ctx.selected;
  }
}

const names = (ctx: RunContext, ids: string[]) => nameList(ids.map((id) => ctx.session.players.find((p) => p.id === id)?.name ?? '?'));

/** Whether an action needs players to act on (so the card asks for them first). */
/**
 * A "Move ±N spaces" action's steps after typing `typed` in its Spaces box while it goes `steps` (negative: back). A
 * negative number turns it round ("-4" going forward is back 4); never 0.
 */
export function typedSteps(steps: number, typed: number): number {
  const n = Math.round(typed) || 0;
  return (steps < 0 ? -1 : 1) * (n < 0 ? -1 : 1) * Math.max(1, Math.abs(n));
}

export function needsPlayers(a: Action): boolean {
  if (a.do === 'steps' || a.do === 'skip' || a.do === 'again') return !!a.who && a.who !== 'party';
  return a.do === 'stat' || a.do === 'item' || a.do === 'score' || ((a.do === 'move' || a.do === 'goto') && a.who !== 'party');
}

/** A one-line description for buttons and the log ("HP −1", "Give 2 Potion"). */
export function describeAction(game: Game, a: Action): string {
  switch (a.do) {
    case 'stat': {
      const f = statFields(game).find((x) => x.id === a.field);
      return a.op === 'set' ? `${f?.name ?? 'Stat'} = ${a.amount}` : `${f?.name ?? 'Stat'} ${a.amount >= 0 ? '+' : '−'}${Math.abs(a.amount)}`;
    }
    case 'item':
      return `${a.op === 'give' ? 'Give' : 'Take'} ${a.qty} ${itemDef(game, a.item)?.name ?? 'item'}`;
    case 'score':
      return `${a.amount >= 0 ? '+' : '−'}${formatPoints(Math.abs(a.amount), game.settings.currencySymbol)}`;
    case 'wheel': {
      const name = (id: string) => (id === PLAYER_WHEEL ? 'Pick a player' : (game.wheels.find((w) => w.id === id)?.name ?? 'wheel'));
      return `Spin ${[a.wheel, ...(a.also ?? [])].map(name).join(' + ')}`;
    }
    case 'dice':
      return `Roll ${a.dice}`;
    case 'popup':
      return 'Show slide';
    case 'question':
      return 'Ask the question';
    case 'sound':
      return `Play ${game.media.find((m) => m.id === a.media)?.name ?? 'sound'}`;
    case 'move':
      return 'Go there';
    case 'reveal':
      return 'Reveal';
    case 'hide':
      return 'Hide';
    case 'shop':
      return `Open ${game.shops?.find((s) => s.id === a.shop)?.name ?? 'shop'}`;
    case 'timer':
      return `Timer ${a.seconds}s`;
    case 'note':
      return `📝 ${a.text}`;
    case 'goto': {
      const round = game.rounds.find((r) => r.mode === 'boardgame' && (a.zone ? r.zones.some((z) => z.id === a.zone) : r.spaces.some((s) => s.id === a.space)));
      const board = round?.mode === 'boardgame' ? round : undefined;
      return `Send to ${a.zone ? (board?.zones.find((z) => z.id === a.zone)?.name ?? 'a zone') : ((board && spaceById(board, a.space)?.name) ?? 'a space')}`;
    }
    case 'steps': {
      const n = Math.abs(a.steps);
      return `${a.steps < 0 ? 'Back' : 'Forward'} ${n} space${n === 1 ? '' : 's'}`;
    }
    case 'skip':
      return (a.turns ?? 1) > 1 ? `Skip ${a.turns} turns` : 'Skip next turn';
    case 'again':
      return 'Roll again';
  }
}

/** Run one action. Returns a message for the host (what happened, or why not). */
export function runAction(ctx: RunContext, a: Action, label?: string): string {
  const { game, session, live } = ctx;
  const text = label ?? describeAction(game, a);
  // What it points at was deleted (or never chosen): say so instead of doing something odd.
  const gone = actionProblem(game, a, ctx);
  if (gone) return gone;
  switch (a.do) {
    case 'stat': {
      const f = statFields(game).find((x) => x.id === a.field);
      const who = targets(ctx, a.who);
      if (!f) return 'That stat no longer exists';
      if (!who.length) return 'Pick who it’s for first';
      logged(session, `${text} (${names(ctx, who)})`, () => {
        for (const id of who) a.op === 'set' ? setStat(session, id, f, a.amount) : addStat(game, session, id, f, a.amount);
      });
      // Damage (HP down…), not money spent.
      if (a.op === 'add' && a.amount < 0 && !f.currency) blip(live, 'hurt');
      return `${text}: ${names(ctx, who)}`;
    }
    case 'item': {
      const who = targets(ctx, a.who);
      if (!who.length) return 'Pick who it’s for first';
      logged(session, `${text} (${names(ctx, who)})`, () => {
        for (const id of who) a.op === 'give' ? giveItem(game, session, id, a.item, a.qty) : takeItem(session, id, a.item, a.qty);
      });
      return `${text}: ${names(ctx, who)}`;
    }
    case 'score': {
      const who = targets(ctx, a.who);
      if (!who.length) return 'Pick who it’s for first';
      applyScore(session, game, who, a.amount, label ?? 'Adventure');
      return `${text}: ${names(ctx, who)}`;
    }
    case 'wheel': {
      if (a.wheel === PLAYER_WHEEL) openPlayerWheel(live, session);
      else {
        const w = game.wheels.find((x) => x.id === a.wheel);
        if (!w) return 'That wheel no longer exists';
        openWheel(live, session, w);
      }
      for (const id of a.also ?? []) addWheel(live, session, game, id);
      return text;
    }
    case 'dice': {
      const preset = game.dice.find((d) => d.id === a.dice || d.name === a.dice);
      if (preset) rollDice(live, session, preset);
      else {
        const d = parseDice(a.dice);
        if (!d) return `“${a.dice}” isn’t dice (try d20 or 2d6)`;
        rollDice(live, session, quickDice(d.sides, d.count, a.dice));
      }
      return text;
    }
    case 'popup':
      live.overlay = { kind: 'popup', nonce: newId(), slide: JSON.parse(JSON.stringify(a.slide)) };
      return text;
    case 'question':
      live.overlay = {
        kind: 'popup',
        nonce: newId(),
        slide: JSON.parse(JSON.stringify(a.question)),
        answer: JSON.parse(JSON.stringify(a.answer)),
        revealed: false,
        value: a.value,
      };
      return text;
    case 'sound':
      if (!a.media) return 'No sound chosen';
      playSound(live, a.media);
      return text;
    case 'move': {
      if (!ctx.world || !ctx.st) return 'Moves only work in RPG rounds';
      // The party: the one standing where the object is (only another one than the followed party needs naming).
      const party = partyOf(ctx);
      const other = party && party !== activeParty(ctx.st) ? party.members : undefined;
      const who = a.who === 'party' || !a.who ? other : targets(ctx, a.who);
      const st = ctx.st;
      const world = ctx.world;
      logged(session, `${text} (${who ? names(ctx, who) : 'party'})`, () => moveTo(game, st, world, a.to, { players: who }));
      return text;
    }
    case 'reveal':
    case 'hide': {
      if (!ctx.st || !a.object) return 'Nothing to reveal';
      const st = ctx.st;
      const id = a.object;
      logged(session, a.do === 'reveal' ? 'Reveal an object' : 'Hide an object', () => (override(st, id).shown = a.do === 'reveal'));
      return text;
    }
    case 'shop':
      if (!game.shops?.some((s) => s.id === a.shop)) return 'That shop no longer exists';
      // The player it's for does the buying (the host can switch the buyer in the shop).
      live.overlay = { kind: 'shop', nonce: newId(), shopId: a.shop, buyer: targets(ctx, 'ask')[0] ?? targets(ctx, 'party')[0] };
      return text;
    case 'timer':
      startTimer(live, a.seconds);
      return text;
    case 'note':
      return a.text;
    case 'goto': {
      if (!ctx.board || !ctx.bs) return 'Sending works only in board-game rounds';
      const who = targets(ctx, a.who);
      if (!who.length) return 'Pick who it’s for first';
      const bs = ctx.bs;
      logged(session, `${text} (${names(ctx, who)})`, () => sendTo(bs, who, { space: a.space, zone: a.zone }));
      return `${text}: ${names(ctx, who)}`;
    }
    case 'steps':
    case 'skip':
    case 'again': {
      if (!ctx.board || !ctx.bs) return 'This works only in board-game rounds';
      // (Unset: whoever's turn it is, as on a space.)
      const who = targets(ctx, a.who ?? 'party');
      if (!who.length) return 'Pick who it’s for first';
      const { board, bs } = ctx;
      let said = '';
      logged(session, `${text} (${names(ctx, who)})`, () => {
        if (a.do === 'steps') said = who.map((id) => movePlayer(board, bs, id, Math.round(a.steps) || 0)).at(-1) ?? '';
        else if (a.do === 'skip') skipTurns(bs, who, a.turns ?? 1);
        else bs.again = who[0];
      });
      return `${text}: ${names(ctx, who)}${said ? ` · ${said}` : ''}`;
    }
  }
}
