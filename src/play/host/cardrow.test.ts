// A 🤫 card's row in the host panel: a card changed in the editor since it went says how to put it out again, with the
// button that's there (↻ Send again with phones; without them, ✖ Take back and show it again).
import { describe, expect, it } from 'vitest';
import { jeopardyGame } from '../../lib/testgame';
import { setSlideText, type SavedCard } from '../../lib/model';
import { newSession } from '../../lib/session';
import { sendCard } from '../../lib/sentcards';
import { sentLine } from './cardrow';

/** Ann (a) and Bob (b); the editor's 🤫 Cards have the Wild card, out to Bob. */
function setup() {
  const g = jeopardyGame();
  g.players = ['Ann', 'Bob'].map((name, i) => ({ id: name[0].toLowerCase(), name, color: ['#e6194b', '#3cb44b'][i] }));
  const wild: SavedCard = { id: 'sc1', name: 'Wild card', background: {}, elements: [] };
  setSlideText(wild, 'WILD-plugh');
  g.cards = [wild];
  const session = newSession(g);
  const c = sendCard(g, session, { to: [{ seat: 'b' }], content: { saved: 'sc1' }, until: 'host' }, 1000)!;
  return { g, session, wild, c };
}

describe('an edited card’s row', () => {
  it('with phones, points at ↻ Send again; without them (the 🪟 card window), at ✖ Take back', () => {
    const { g, session, wild, c } = setup();
    expect(sentLine(g, session, c, false, false, false)).toEqual({ text: 'sent', warn: false });
    setSlideText(wild, 'WILD-changed');
    expect(sentLine(g, session, c, false)).toEqual({ text: 'changed in the editor: off the phones until ↻ Send again', warn: true });
    const none = sentLine(g, session, c, false, false, false);
    expect(none.warn).toBe(true);
    expect(none.text).toContain('✖ Take it back and show it again');
    expect(none.text).not.toContain('↻');
  });
});
