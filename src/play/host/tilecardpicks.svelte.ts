// Who the host chose for an open tile's 🤫 cards (or the Final's), by card: kept here, not in the cards box, so the game
// screen's check before going on (goon.ts) knows them with the controls hidden too (the box isn't on screen then). A
// card not chosen for goes by its Goes to. For the tile or Final open now only: another one starts afresh.
import type { CardTo, ClueCard, Id, Session } from '../../lib/model';

const chosen = $state<{ holder: Id | null; by: Record<Id, Id[]> }>({ holder: null, by: {} });

/** The cards' choices are for `holder` (a tile's or a Final's id): another holder's are let go. */
function forHolder(holder: Id): Record<Id, Id[]> {
  if (chosen.holder !== holder) {
    chosen.holder = holder;
    chosen.by = {};
  }
  return chosen.by;
}

/** A card's players: the host's choice, else who it starts with (`starts`: its Goes to now). */
export function recipientsOf(session: Pick<Session, 'players'>, holder: Id, card: ClueCard, starts: () => CardTo[]): CardTo[] {
  const ids = (chosen.holder === holder ? chosen.by : {})[card.id];
  return ids ? session.players.filter((p) => ids.includes(p.id)).map((p) => ({ seat: p.id })) : starts();
}

/** A player in or out of a card's players (from those it has now). */
export function toggleRecipient(holder: Id, card: ClueCard, now: CardTo[], id: Id): void {
  const ids = now.map((t) => t.seat);
  forHolder(holder)[card.id] = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/** The tile (or the Final) is over: its choices go, so opening it again starts from its Goes to. */
export function forgetRecipients(): void {
  chosen.holder = null;
  chosen.by = {};
}
