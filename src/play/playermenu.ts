// The one right-click menu for a player, wherever they show up in the host's window: their avatar or token, their card
// on the stats strip, their score plate, their chip or card in the host panel, their chip in the turn order. Every
// change is one undoable step.
import { app, toast } from '../lib/app.svelte';
import type { MenuEntry } from '../lib/menustate.svelte';
import { newId, type Game, type Session } from '../lib/model';
import { awardOpen } from '../lib/session';
import { logged } from '../lib/toolset';
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
}

export function playerMenu(h: PlayerMenuHost, id: string): MenuEntry[] {
  const { session } = h;
  const p = session.players.find((x) => x.id === id);
  if (!p) return [];
  const phase = session.phase;
  return [
    { heading: p.name },
    { label: h.selected.includes(id) ? 'Deselect' : 'Select', disabled: !awardOpen(session), onclick: () => h.toggle(id) },
    ...(phase === 'board' || phase === 'clue'
      ? [{ label: session.currentPickerId === id ? '★ No picker' : '★ Make the picker', onclick: () => (session.currentPickerId = session.currentPickerId === id ? undefined : id) }]
      : []),
    { label: '✎ Set the score…', onclick: () => h.setScore(id) },
    ...(phase === 'rpg' || phase === 'boardgame' ? [{ label: '📺 Show their sheet', onclick: () => (app.live.overlay = { kind: 'sheet', nonce: newId(), playerId: id }) }] : []),
    ...(phase === 'rpg' ? rpgItems(h, id, p.name) : phase === 'boardgame' ? boardItems(h, id) : []),
  ];
}

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

/** Board-game rounds: their turn, and sending them to a zone or back to Start. */
function boardItems(h: PlayerMenuHost, id: string): MenuEntry[] {
  const { game, session } = h;
  const { round, bs } = boardNow(game, session);
  if (!round || !bs) return [];
  return [
    { label: '🎲 Make it their turn', disabled: bs.order[bs.turn] === id, onclick: () => setTurn(game, session, id) },
    { label: '🗂 Open their card', onclick: () => h.openCard(id) },
    { sep: true },
    ...round.zones.map((z) => ({ label: `🌀 Send to ${z.name}`, onclick: () => sendNow(game, session, [id], { zone: z.id }) })),
    { label: '🏁 Send to Start', onclick: () => sendNow(game, session, [id], { space: round.start ?? round.spaces[0]?.id }) },
  ];
}
