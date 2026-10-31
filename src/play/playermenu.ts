// The one right-click menu for a player, wherever they show up in the host's window: their avatar or token, their card
// on the stats strip, their score plate, their chip or card in the host panel, their button in any box there (who picked
// a partner clue, who found a Daily Double, who gets a 🤫 card or a 🎭 part, the Final's rows…), their chip in the turn
// order. Its heading is their name only (never a card's or a part's). Every change is one undoable step.
// One order everywhere: this moment's verbs for them (✔ Right / ✘ Wrong, who picked it, the partner, who found it…, the
// same list for every player, one that doesn't fit them greyed, so what follows starts at the same depth), a line, then
// Select · ★ Make the picker · ✎ Set the score…, the round's extras and 🗂 Open their card, their phone's seat while the
// room is up, and last, in red, ⛔ Kick from phone and 🗑 Remove player (both ask first; 👥 Players can restore them).
import { app, toast } from '../lib/app.svelte';
import { teamsOn } from '../lib/buzz';
import { menuItem, menuOf, type MenuEntry } from '../lib/menustate.svelte';
import { newId, type Game, type Session } from '../lib/model';
import { awardOpen, playerName, typedAnswer } from '../lib/session';
import { logged, setPicker } from '../lib/toolset';
import { buzzerOn } from '../lib/remote.svelte';
import { boardNow, sendNow, setTurn } from './boardgame/bgops';
import { joinPartyNow, rpgNow, splitOff } from './rpg/hostops';

/** What the menu needs from the host's screen. */
export interface PlayerMenuHost {
  game: Game;
  session: Session;
  selected: string[];
  /** Select or deselect them (as the 1–9 keys do). */
  toggle: (id: string) => void;
  /** Ask for their new score in the host panel. */
  setScore: (id: string) => void;
  /** Open the full map to send these players somewhere (`label`: who they are, for its buttons). */
  sendTo: (players: string[], label: string) => void;
  /** Unfold the players' cards at theirs. */
  openCard: (id: string) => void;
  /**
   * This moment's verbs for them, first in the menu: the boxes' own actions (✔ Right, ★ Ann picked it, ⭐ Bob found it,
   * 📤 Send to Bob only…), the same list for every player in a moment (one that doesn't fit them greyed).
   */
  verbs?: (id: string) => MenuEntry[];
  /** While a buzzer room is up: their seat's phone (null: no room). */
  phone?: (id: string) => SeatPhone | null;
  /** 🗑 Remove player… (team… with phone buzzer teams): it asks first, as the 👥 Players window does. */
  remove?: (id: string) => void;
}

/** A player's seat in the buzzer room, for their menu: what their phone can have done now. */
export interface SeatPhone {
  /** The room can't be reached right now: nothing said to it would get there (all three greyed). */
  down?: boolean;
  /** A phone has their seat. */
  on: boolean;
  /** The room can free a seat (its server knows how). */
  canFree: boolean;
  /** Their phone was kicked a moment ago: it can be let back before its 2 minutes are up. */
  letBack: boolean;
  /** 📱 Free seat (new phone): they can tap their name on another phone. */
  free: () => void;
  /** ↩ Let back: the phone kicked off their seat may take it again now. */
  letIn: () => void;
  /** ⛔ Kick from phone: it asks first. */
  kick: () => void;
}

export function playerMenu(h: PlayerMenuHost, id: string): MenuEntry[] {
  const { session } = h;
  const p = session.players.find((x) => x.id === id);
  if (!p) return [];
  const phase = session.phase;
  // (Their number key, as on their chip: the first nine.)
  const n = session.players.indexOf(p) + 1;
  const key = n <= 9 ? String(n) : undefined;
  const verbs = h.verbs?.(id) ?? [];
  const extras: MenuEntry[] = [
    ...(phase === 'rpg' || phase === 'boardgame' ? [{ label: '📺 Show their sheet', onclick: () => (app.live.overlay = { kind: 'sheet', nonce: newId(), playerId: id }) }] : []),
    ...(phase === 'rpg' ? rpgItems(h, id, p.name) : phase === 'boardgame' ? boardItems(h, id) : []),
  ];
  const phone = h.phone?.(id) ?? null;
  const noPhone = phone?.down ? 'The buzzer room isn’t reachable right now' : 'No phone has their seat';
  const danger: MenuEntry[] = [
    ...(phone ? [{ label: '⛔ Kick from phone (2 min)…', danger: true, disabled: !phone.on || !!phone.down, hint: phone.on && !phone.down ? 'Takes their seat back from their phone, which can’t take it again for 2 minutes (it asks first)' : noPhone, onclick: phone.kick }] : []),
    ...(h.remove ? [removeItem(h, id)] : []),
  ];
  return [
    { heading: p.name },
    ...(verbs.length ? [...verbs, { sep: true as const }] : []),
    { label: h.selected.includes(id) ? 'Deselect' : 'Select', disabled: !awardOpen(session), keys: key, onclick: () => h.toggle(id) },
    ...(phase === 'board' || phase === 'clue'
      ? [
          {
            label: session.currentPickerId === id ? '★ No picker' : '★ Make the picker',
            keys: key && session.currentPickerId !== id ? `P, ${key}` : undefined,
            onclick: () => setPicker(session, session.currentPickerId === id ? undefined : id),
          },
        ]
      : []),
    { label: '✎ Set the score…', onclick: () => h.setScore(id) },
    ...(extras.length ? [{ sep: true as const }, ...extras] : []),
    ...(phone
      ? [
          { sep: true as const },
          { label: '📱 Free seat (new phone)', disabled: !phone.on || !phone.canFree || !!phone.down, hint: phone.on && !phone.down ? 'They’re on a new phone or browser: free the seat so they can tap their name there. Blocks nobody.' : noPhone, onclick: phone.free },
          { label: '↩ Let back', disabled: !phone.letBack || !!phone.down, hint: phone.down ? noPhone : phone.letBack ? 'Let the phone you kicked take this seat again now' : 'For a phone kicked off their seat in the last 2 minutes', onclick: phone.letIn },
        ]
      : []),
    ...(danger.length ? [{ sep: true as const }, ...danger] : []),
  ];
}

/**
 * 🗑 Remove player… (🗑 Remove team… with phone buzzer teams): removed from this game, as 👥 Players does (their points
 * can be restored there). The last one left can't be: a running game keeps at least one (its turns, parties and
 * scoreboard need someone).
 */
function removeItem(h: PlayerMenuHost, id: string): MenuEntry {
  const team = buzzerOn(h.game.settings) && teamsOn(h.game.settings);
  const noun = team ? 'team' : 'player';
  const last = h.session.players.length <= 1;
  return {
    label: `🗑 Remove ${noun}…`,
    danger: true,
    disabled: last,
    hint: last ? `The game needs at least one ${noun}: add another first` : `${team ? 'Its' : 'Their'} points leave the scoreboard (it asks first; 👥 ${team ? 'Teams' : 'Players'} can restore ${team ? 'it' : 'them'})`,
    onclick: () => h.remove!(id),
  };
}

// ---------- This moment's verbs (each box's own actions, for one player) ----------

/** Their number key (the first nine), as on their chip. */
const numberOf = (session: Pick<Session, 'players'>, id: string): string | undefined => {
  const n = session.players.findIndex((p) => p.id === id) + 1;
  return n && n <= 9 ? String(n) : undefined;
};

/** A clue's verdict for one player, as their chip's ✔ / ✘ give it (the host panel works it out). */
export interface Verdict {
  /** The pair's words: a clue's ✔ Right / ✘ Wrong, a 🤝 partner clue's ✔ Got it / ✘ Missed, a steal's ✔ Stole it / ✘ Wrong. */
  kind: 'clue' | 'partner' | 'steal';
  /** What each gives them ("+$400", "−$200", "$0", "+ the wager"); null when this clue isn't theirs to judge. */
  gets: string | null;
  loses: string | null;
  /** Why it isn't theirs (with `gets` null): "Only Ann plays this Daily Double". */
  why?: string;
  /** How they're marked on this clue already (that verdict is greyed, as on their chip). */
  marked?: boolean;
  /** They're the one selected, so Enter (⏎) and Shift+Enter (⇧⏎) do these. */
  enter?: boolean;
  right: () => void;
  wrong: () => void;
}

/** ✔ Right +$400 ⏎ / ✘ Wrong −$400 ⇧⏎ (with their share in a partner clue), greyed where they don't fit `name`. */
export function verdictVerbs(name: string, v: Verdict): MenuEntry[] {
  const [yes, no] = v.kind === 'partner' ? ['✔ Got it', '✘ Missed'] : v.kind === 'steal' ? ['✔ Stole it', '✘ Wrong'] : ['✔ Right', '✘ Wrong'];
  if (v.gets === null || v.loses === null) {
    const hint = v.why ?? `${name} isn’t answering this clue`;
    return [
      { label: yes, disabled: true, hint, onclick: v.right },
      { label: no, disabled: true, hint, onclick: v.wrong },
    ];
  }
  return [
    {
      label: `${yes} ${v.gets}`,
      disabled: v.marked === true,
      ...(v.marked === true ? { hint: `${name} is marked right on this clue (＋ Award gives more)` } : {}),
      ...(v.enter ? { keys: '⏎' } : {}),
      onclick: v.right,
    },
    {
      label: `${no} ${v.loses}`,
      disabled: v.marked === false,
      ...(v.marked === false ? { hint: `${name} is marked wrong on this clue (− Deduct takes more)` } : {}),
      ...(v.enter ? { keys: '⇧⏎' } : {}),
      onclick: v.wrong,
    },
  ];
}

/**
 * PARTNER UP!: ★ Ann picked it · 🤝 Make Ann the partner, by their number (who picked it first, then the partner), the
 * one that can't be greyed with why. None in any other moment.
 */
export function partnerUpVerbs(session: Session, id: string, a: { picked: (id: string) => void; partner: (id: string) => void; spinning: boolean }): MenuEntry[] {
  const s = session.partner;
  if (session.phase !== 'clue' || !s || s.stage !== 'pick') return [];
  const name = playerName(session, id);
  const key = numberOf(session, id);
  const picker = s.pickerId;
  const why = !picker
    ? 'Who picked it comes first'
    : s.partnerId === id
      ? `${name} is the partner`
      : id === picker && !s.includePicker
        ? `${name} picked it (tick “${name} can be on the wheel” to make it Solo)`
        : a.spinning
          ? 'Still spinning: wait for it to land'
          : '';
  return [
    { label: `★ ${name} picked it`, disabled: picker === id, ...(!picker && key ? { keys: key } : {}), onclick: () => a.picked(id) },
    { label: `🤝 Make ${name} the partner`, disabled: !!why, ...(why ? { hint: why } : key ? { keys: key } : {}), onclick: () => a.partner(id) },
  ];
}

/**
 * The Final's reveals: 🔦 Spotlight (their number) · Show answer · Show wager · ✔ Right C · ✘ Wrong X (the keys while
 * they're spotlit). Greyed for one sitting this Final out, so their menu keeps the same places.
 */
export function revealVerbs(
  session: Session,
  id: string,
  a: { spotlight: (id: string) => void; showAnswer: (id: string) => void; showWager: (id: string) => void; judge: (id: string, right: boolean) => void },
): MenuEntry[] {
  const f = session.final;
  if (session.phase !== 'final' || session.finalStep !== 'reveal' || !f) return [];
  const plays = f.order.includes(id);
  const out = plays ? {} : { hint: `${playerName(session, id)} sits out this Final` };
  const now = f.current === id;
  return [
    { label: '🔦 Spotlight', disabled: !plays || now, ...out, ...(plays ? { keys: numberOf(session, id) } : {}), onclick: () => a.spotlight(id) },
    ...(f.answers ? [{ label: 'Show answer', disabled: !plays || !typedAnswer(f, id) || !!f.answerShown?.[id], ...out, onclick: () => a.showAnswer(id) }] : []),
    { label: 'Show wager', disabled: !plays || !!f.shown[id], ...out, onclick: () => a.showWager(id) },
    { label: '✔ Right', disabled: !plays, ...out, ...(now ? { keys: 'C' } : {}), onclick: () => a.judge(id, true) },
    { label: '✘ Wrong', disabled: !plays, ...out, ...(now ? { keys: 'X' } : {}), onclick: () => a.judge(id, false) },
  ];
}

// ---------- The round's extras ----------

/** RPG rounds: their avatar, their party, sending them somewhere. With several selected (them among them), all of those move. */
function rpgItems(h: PlayerMenuHost, id: string, name: string): MenuEntry[] {
  const { game, session, selected } = h;
  const { st } = rpgNow(game, session);
  const pos = st?.positions[id];
  if (!st || !pos) return [];
  const group = selected.includes(id) && selected.length > 1 ? selected : [id];
  const them = group.length > 1 ? `the ${group.length} selected` : name;
  const own = st.parties.find((pt) => pt.members.includes(id));
  const ownAlready = !!own && own.members.length === group.length && group.every((m) => own.members.includes(m));
  const say = (text: string | null) => text && toast(text);
  return [
    { label: pos.down ? '💫 Gets up' : '💫 Knocked out', onclick: () => logged(session, `${name} ${pos.down ? 'gets up' : 'is knocked out'}`, () => (st.positions[id].down = !pos.down)) },
    { label: pos.hidden ? '🫥 Show their avatar' : '🫥 Hide their avatar', onclick: () => logged(session, `${name} ${pos.hidden ? 'shown' : 'hidden'}`, () => (st.positions[id].hidden = !pos.hidden)) },
    { sep: true },
    { label: group.length > 1 ? `✂ Split off ${them}` : '✂ Split off (own party)', disabled: ownAlready, onclick: () => say(splitOff(game, session, group)) },
    { label: group.length > 1 ? `🗺 Send ${them} to…` : '🗺 Send to…', onclick: () => h.sendTo(group, them) },
    ...st.parties
      .filter((pt) => !group.every((m) => pt.members.includes(m)))
      .map((pt) => ({ label: `👥 Join ${pt.name}${group.length > 1 ? ` (${them})` : ''}`, onclick: () => say(joinPartyNow(game, session, group, pt.id)) })),
    { label: '🗂 Open their card', onclick: () => h.openCard(id) },
  ];
}

/** Board-game rounds: their turn, sending them to a zone or back to Start, and their card. */
function boardItems(h: PlayerMenuHost, id: string): MenuEntry[] {
  const { game, session } = h;
  const { round, bs } = boardNow(game, session);
  if (!round || !bs) return [];
  return [
    { label: '🎲 Make it their turn', disabled: bs.order[bs.turn] === id, onclick: () => setTurn(game, session, id) },
    ...round.zones.map((z) => ({ label: `🌀 Send to ${z.name}`, onclick: () => sendNow(game, session, [id], { zone: z.id }) })),
    { label: '🏁 Send to Start', onclick: () => sendNow(game, session, [id], { space: round.start ?? round.spaces[0]?.id }) },
    { label: '🗂 Open their card', onclick: () => h.openCard(id) },
  ];
}

/** What a ▶ Play row's menu can do (the pre-game list of players, or teams). Left out: not on this list. */
export interface RosterActs {
  rename: () => void;
  color: () => void;
  picture?: () => void;
  startScore?: () => void;
  move: (d: -1 | 1) => void;
  remove: () => void;
}

/**
 * A ▶ Play row's menu (its 👥 row or its 📱 row), in the editors' one order: what it's set to (its color, picture and
 * start score), ✎ Rename, the moves, then 🗑 Delete. `at`: the row's place in `count`; `noun`: "player", or "team"
 * with Teams on.
 */
export function rosterMenu(name: string, at: number, count: number, noun: 'player' | 'team', acts: RosterActs): MenuEntry[] {
  return menuOf({
    heading: name,
    verbs: [
      { label: '🎨 Color…', onclick: acts.color },
      ...(acts.picture ? [{ label: '🖼 Picture…', onclick: acts.picture }] : []),
      ...(acts.startScore ? [{ label: '± Start score…', onclick: acts.startScore }] : []),
    ],
    rename: menuItem.rename(acts.rename),
    move: [menuItem.up(() => acts.move(-1), { disabled: at === 0 }), menuItem.down(() => acts.move(1), { disabled: at === count - 1 })],
    delete: menuItem.delete(noun, acts.remove, { keys: false }),
  });
}
