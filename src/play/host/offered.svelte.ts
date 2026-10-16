// 🤫 Cards that actions offered (partner-clues spec §12.1, §12.2): an RPG object's, an item's, a wheel slice's, a die
// face's or a board space's 🤫 Send a card button ran, and the host panel asks who gets the card. Nothing goes to a phone
// until the host presses 📤 Send on the offer. Kept here, on the host's computer only: never in the session or the live
// state, which the audience and scores windows get.
import type { CardOffer } from '../../lib/actions';
import type { Session } from '../../lib/model';

export interface OpenOffer extends CardOffer {
  key: number;
  /** The round it was offered in: it's dropped when the round changes. */
  round: number;
}

/** At most this many wait at once (the oldest goes). */
const MAX_OFFERS = 4;
let next = 1;

export const cardOffers = $state<{ list: OpenOffer[] }>({ list: [] });

/** An action's card, offered in the host panel (RunContext.offerCard). */
export function offerCard(offer: CardOffer, round: number): void {
  cardOffers.list = [...cardOffers.list, { ...offer, key: next++, round }].slice(-MAX_OFFERS);
}

/** RunContext.offerCard for a button run now: its card is offered in the round being played. */
export const offerIn =
  (session: Pick<Session, 'currentRound'>) =>
  (offer: CardOffer): void =>
    offerCard(offer, session.currentRound);

/** Sent or skipped: the offer goes. */
export function dropOffer(key: number): void {
  cardOffers.list = cardOffers.list.filter((o) => o.key !== key);
}

/** Offers made in another round go (the round changed); none at all with no round (play ended). */
export function dropOffersBut(round: number | null): void {
  if (cardOffers.list.some((o) => o.round !== round)) cardOffers.list = cardOffers.list.filter((o) => o.round === round);
}
