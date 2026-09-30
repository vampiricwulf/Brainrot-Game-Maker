// Running actions (games-maker spec §7.10): the host pressed an object's, item's or wheel slice's button. State
// changes go through toolset.logged() (undoable); show-only effects (wheels, pop-ups, sounds, timers) go to Live.
import { newId, PLAYER_WHEEL, type Action, type BoardGameRound, type BoardGameState, type Game, type Session, type Who, type World, type WorldState } from './model';
import { sendTo, spaceById } from './boardgame';
import { playSound, startTimer, type Live } from './live';
import { openPlayerWheel, openWheel, quickDice, rollDice } from './overlay';
import { parseDice } from './tools';
import { applyScore } from './session';
import { activeParty, moveTo, override } from './rpg';
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
  /** Who "ask" means: the players the host picked on the card. */
  chosen?: string[];
}

/** The players an action applies to. */
export function targets(ctx: RunContext, who: Who | undefined): string[] {
  const all = ctx.session.players.map((p) => p.id);
  switch (who ?? 'ask') {
    case 'all':
      return all;
    case 'party':
      if (ctx.bs) {
        // Board games: whoever's turn it is.
        const cur = ctx.bs.order[ctx.bs.turn];
        return cur ? [cur] : [];
      }
      return ctx.st ? (activeParty(ctx.st)?.members ?? []) : ctx.selected.length ? ctx.selected : all;
    case 'selected':
      return ctx.selected;
    case 'picker':
      return ctx.session.currentPickerId ? [ctx.session.currentPickerId] : [];
    case 'ask':
      return ctx.chosen?.length ? ctx.chosen : ctx.selected;
  }
}

const names = (ctx: RunContext, ids: string[]) => ids.map((id) => ctx.session.players.find((p) => p.id === id)?.name ?? '?').join(', ');

/** Whether an action needs players to act on (so the card asks for them first). */
export function needsPlayers(a: Action): boolean {
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
      return `${a.amount >= 0 ? '+' : '−'}${game.settings.currencySymbol}${Math.abs(a.amount)}`;
    case 'wheel':
      return a.wheel === PLAYER_WHEEL ? 'Spin: Pick a player' : `Spin ${game.wheels.find((w) => w.id === a.wheel)?.name ?? 'wheel'}`;
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
  }
}

/** Run one action. Returns a message for the host (what happened, or why not). */
export function runAction(ctx: RunContext, a: Action, label?: string): string {
  const { game, session, live } = ctx;
  const text = label ?? describeAction(game, a);
  switch (a.do) {
    case 'stat': {
      const f = statFields(game).find((x) => x.id === a.field);
      const who = targets(ctx, a.who);
      if (!f) return 'That stat no longer exists';
      if (!who.length) return 'Pick who it’s for first';
      logged(session, `${text} (${names(ctx, who)})`, () => {
        for (const id of who) a.op === 'set' ? setStat(session, id, f, a.amount) : addStat(game, session, id, f, a.amount);
      });
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
      const who = a.who === 'party' || !a.who ? undefined : targets(ctx, a.who);
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
      live.overlay = { kind: 'shop', nonce: newId(), shopId: a.shop };
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
  }
}
