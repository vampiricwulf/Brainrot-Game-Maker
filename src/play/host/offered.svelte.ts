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
  /**
   * What offered it, as a place in the panel (a board game's landing box 'land', a space's card 'space:<id>', an RPG
   * object's card 'object:<id>', the tool on the stage 'tool'): it shows under that while it's on screen, else at the
   * top of the panel with the rest.
   */
  at?: string;
}

/** At most this many wait at once (the oldest goes). */
const MAX_OFFERS = 4;
let next = 1;

export const cardOffers = $state<{ list: OpenOffer[] }>({ list: [] });

/** An action's card, offered in the host panel (RunContext.offerCard), under `at` (see OpenOffer). */
export function offerCard(offer: CardOffer, round: number, at?: string): void {
  cardOffers.list = [...cardOffers.list, { ...offer, key: next++, round, ...(at ? { at } : {}) }].slice(-MAX_OFFERS);
}

/** RunContext.offerCard for a button run now: its card is offered in the round being played, under `at`. */
export const offerIn =
  (session: Pick<Session, 'currentRound'>, at?: string) =>
  (offer: CardOffer): void =>
    offerCard(offer, session.currentRound, at);

/** The places in the panel showing their own offers now (how many of each: a CardOffers with `at` is on screen). */
export const offerPlaces = $state<Record<string, number>>({});

/** A place shows its own offers (from a CardOffers with `at`): returns what takes it away again. */
export function showPlace(at: string): () => void {
  offerPlaces[at] = (offerPlaces[at] ?? 0) + 1;
  return () => {
    offerPlaces[at] = (offerPlaces[at] ?? 1) - 1;
    if (offerPlaces[at] <= 0) delete offerPlaces[at];
  };
}

/** Where an offer shows: under its place while that's on screen ('placed'), else with the rest ('top'). */
export const offerShownAt = (o: Pick<OpenOffer, 'at'>, places: Record<string, number> = offerPlaces): 'placed' | 'top' => (o.at && (places[o.at] ?? 0) > 0 ? 'placed' : 'top');

/** Offers that have come into view once (a new one takes the keys; one moving to another place doesn't). */
export const arrived = new Set<number>();

/** Sent or skipped: the offer goes. */
export function dropOffer(key: number): void {
  cardOffers.list = cardOffers.list.filter((o) => o.key !== key);
}

/** Offers made in another round go (the round changed); none at all with no round (play ended). */
export function dropOffersBut(round: number | null): void {
  if (cardOffers.list.some((o) => o.round !== round)) cardOffers.list = cardOffers.list.filter((o) => o.round === round);
}
