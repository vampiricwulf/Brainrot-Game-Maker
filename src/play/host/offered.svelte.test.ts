import { describe, expect, it } from 'vitest';
import { cardOffers, offerCard, offerIn, offerPlaces, offerShownAt, showPlace } from './offered.svelte';
import { textSlide } from '../../lib/model';

const offer = (from: string) => ({ from, slide: textSlide('Psst'), to: [], until: 'round' as const });

describe('a 🤫 card an action offers', () => {
  it('shows under what offered it while that place is on screen, else with the rest at the top', () => {
    cardOffers.list = [];
    offerIn({ currentRound: 2 }, 'land')(offer('Lucky: 🤫 Card for whoever landed there'));
    offerCard(offer('Ann uses Map: 🤫 Card for whoever uses it'), 2);
    const [land, item] = cardOffers.list;
    expect([land.at, land.round, item.at]).toEqual(['land', 2, undefined]);
    // The landing box isn't on screen yet: both at the top.
    expect([offerShownAt(land), offerShownAt(item)]).toEqual(['top', 'top']);
    const gone = showPlace('land');
    expect([offerShownAt(land), offerShownAt(item)]).toEqual(['placed', 'top']);
    // Two places showing it (one going) still show it there.
    const again = showPlace('land');
    gone();
    expect(offerShownAt(land)).toBe('placed');
    again();
    expect(offerShownAt(land)).toBe('top');
    expect(offerPlaces).toEqual({});
  });
});
