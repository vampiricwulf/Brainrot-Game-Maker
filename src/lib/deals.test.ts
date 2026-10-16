// 🎭 Deals (partner-clues spec §11, §12.2, §22): each player gets one part, at random (or as the host picked), in the
// numbers the deal says; a part's card can draw from a saved wheel (each their own slice, or one shared by all but the
// odd one out); nothing goes until the host sends it, then one card per player, each with its own id; Send again and
// Take back touch only the deal's cards; Who was who shows only names and parts, only once the host shows it, and Ctrl+Z
// takes it off; viewers never get who had which before that; a reload keeps it right.
import { describe, expect, it } from 'vitest';
import { jeopardyGame } from './testgame';
import { migrateGame, newImageEl, setSlideText, textSlide, type CardTo, type DealPreset, type Game, type Session } from './model';
import { forViewers, migrateSession, newSession, removePlayer } from './session';
import { hostCards, roomCardsFull, sessionCards } from './buzz';
import { CARDS_MAX } from './buzzproto';
import { listedCards, quickSlide, sendCard, sentCardId } from './sentcards';
import { phoneCard } from './phonecard';
import { undoAction, redoAction, whoWasWhoStep } from './toolset';
import { windowCards } from './cardwindow';
import { WHEEL_TEMPLATES, wheelFromTemplate } from './wheeltemplates';
import { toKey } from './partner';
import { validate } from './validate';
import { mediaUsage } from './usage';
import {
  clearDeal,
  dealCards,
  dealCopyText,
  dealCounts,
  dealFromTemplate,
  dealHands,
  dealOut,
  dealProblem,
  dealReveal,
  dealSetupProblems,
  dealTrial,
  DEAL_TEMPLATES,
  handSlide,
  repairDeal,
  sendDeal,
  sendDealAgain,
  startDeal,
  takeBackDeal,
} from './deals';

/** A seeded random (mulberry32): the same deals every run. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = ['Ann', 'Bob', 'Cat', 'Dan', 'Eve', 'Fay'];

/** Six players (a…f), a Locations wheel and a Prompts wheel. */
function setup(n = 6) {
  const g = jeopardyGame();
  g.players = NAMES.slice(0, n).map((name, i) => ({ id: name[0].toLowerCase(), name, color: ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4'][i] }));
  const places = wheelFromTemplate(WHEEL_TEMPLATES.find((t) => t.key === 'locations')!, '$');
  const prompts = wheelFromTemplate(WHEEL_TEMPLATES.find((t) => t.key === 'prompts')!, '$');
  g.wheels.push(places, prompts);
  const session = newSession(g);
  const pool: CardTo[] = session.players.map((p) => ({ seat: p.id }));
  const tpl = (key: string, wheel?: string) => dealFromTemplate(DEAL_TEMPLATES.find((t) => t.key === key)!, undefined, wheel);
  return { g, session, pool, places, prompts, tpl };
}

const hands = (r: ReturnType<typeof dealHands>) => {
  if ('problem' in r) throw new Error(r.problem);
  return r.hands;
};

describe('🎭 dealing: random, in the deal’s numbers, never two parts for one player', () => {
  it('Secret roles: one wolf, one seer, the rest villagers, every player exactly once', () => {
    const { g, pool, tpl } = setup();
    const deal = tpl('roles');
    for (let seed = 1; seed <= 200; seed++) {
      const h = hands(dealHands(g, deal, pool, { rand: seeded(seed) }));
      expect(h.map((x) => x.to.seat)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
      expect(new Set(h.map((x) => toKey(x.to))).size).toBe(6);
      expect(h.filter((x) => x.part === 'Wolf')).toHaveLength(1);
      expect(h.filter((x) => x.part === 'Seer')).toHaveLength(1);
      expect(h.filter((x) => x.part === 'Villager')).toHaveLength(4);
      // (Everyone's part shows on their phone: there's more than one.)
      expect(h.every((x) => x.role)).toBe(true);
    }
  });

  it('is random: over many deals every player is the wolf sometimes, about as often as each other', () => {
    const { g, pool, tpl } = setup();
    const deal = tpl('roles');
    const wolf: Record<string, number> = {};
    const rand = seeded(7);
    for (let i = 0; i < 1200; i++) {
      const w = hands(dealHands(g, deal, pool, { rand })).find((x) => x.part === 'Wolf')!;
      wolf[w.to.seat] = (wolf[w.to.seat] ?? 0) + 1;
    }
    expect(Object.keys(wolf).sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    for (const n of Object.values(wolf)) expect(n).toBeGreaterThan(120);
  });

  it('the host’s pick per part: that player gets it, nobody else does, and the rest are dealt around them', () => {
    const { g, pool, tpl } = setup();
    const deal = tpl('roles');
    const [wolf, seer] = deal.parts;
    for (let seed = 1; seed <= 50; seed++) {
      const h = hands(dealHands(g, deal, pool, { picks: { [wolf.id]: [{ seat: 'b' }] }, rand: seeded(seed) }));
      expect(h.filter((x) => x.part === 'Wolf').map((x) => x.to.seat)).toEqual(['b']);
      expect(h.find((x) => x.to.seat === 'b')!.part).toBe('Wolf');
      expect(h.filter((x) => x.part === 'Seer')).toHaveLength(1);
    }
    // Two wolves picked: both, and only them.
    const two = hands(dealHands(g, deal, pool, { picks: { [wolf.id]: [{ seat: 'a' }, { seat: 'c' }] }, rand: seeded(3) }));
    expect(two.filter((x) => x.part === 'Wolf').map((x) => x.to.seat)).toEqual(['a', 'c']);
    // Picked for two parts: the first one only (never two parts for one player).
    const both = hands(dealHands(g, deal, pool, { picks: { [wolf.id]: [{ seat: 'd' }], [seer.id]: [{ seat: 'd' }] }, rand: seeded(4) }));
    expect(both.filter((x) => x.to.seat === 'd').map((x) => x.part)).toEqual(['Wolf']);
    expect(both.filter((x) => x.part === 'Seer')).toHaveLength(1);
    expect(new Set(both.map((x) => x.to.seat)).size).toBe(6);
  });

  it('only those dealt in get a part; with no part for “the rest”, those left over get nothing', () => {
    const { g, tpl } = setup();
    const h = hands(dealHands(g, tpl('roles'), [{ seat: 'f' }, { seat: 'a' }, { seat: 'c' }, { seat: 'a' }], { rand: seeded(1) }));
    expect(h.map((x) => x.to.seat)).toEqual(['f', 'a', 'c']);
    const captain: DealPreset = { ...tpl('captain'), perTeam: false };
    const one = hands(dealHands(g, captain, [{ seat: 'a' }, { seat: 'b' }, { seat: 'c' }], { rand: seeded(2) }));
    expect(one).toHaveLength(1);
    expect(one[0].part).toBe('Captain');
    // (Only one got a part: it shows on their phone.)
    expect(one[0].role).toBe(true);
  });

  it('says why it can’t deal: too few players, two parts for the rest, nobody, no wheel to draw from', () => {
    const { g, pool, tpl } = setup();
    expect(dealProblem(g, tpl('roles'), pool.slice(0, 1))).toBe('The parts need 2 players: 1 is dealt in');
    expect('problem' in dealHands(g, tpl('roles'), pool.slice(0, 1))).toBe(true);
    expect(dealProblem(g, tpl('roles'), [])).toBe('Choose who’s dealt in first');
    const two = tpl('roles');
    two.parts[0].count = 'rest';
    expect(dealProblem(g, two, pool)).toBe('Only one part can go to “the rest”');
    expect(dealProblem(g, { ...two, parts: [] }, pool)).toBe('Add a part first');
    expect(dealProblem(g, tpl('spy'), pool)).toBe('Choose a wheel for Villager’s cards to draw from');
    // Picks count: two picked for "the rest" leave too few for a wolf and a seer.
    const roles = tpl('roles');
    expect(dealProblem(g, roles, pool.slice(0, 3), { picks: { [roles.parts[2].id]: [{ seat: 'a' }, { seat: 'b' }] } })).toBe('The parts need 4 players: 3 are dealt in');
  });
});

describe('🎡 cards drawn from a saved wheel', () => {
  it('Odd one out: everyone but the spy gets the same location; the spy gets none', () => {
    const { g, pool, places, tpl } = setup();
    const deal = tpl('spy', places.id);
    const seen = new Set<string>();
    for (let seed = 1; seed <= 100; seed++) {
      const h = hands(dealHands(g, deal, pool, { rand: seeded(seed) }));
      const spy = h.filter((x) => x.part === 'Spy');
      expect(spy).toHaveLength(1);
      expect(spy[0].slice).toBeUndefined();
      const rest = h.filter((x) => x.part === 'Villager');
      expect(rest).toHaveLength(5);
      expect(new Set(rest.map((x) => x.slice)).size).toBe(1);
      expect(places.segments.map((s) => s.label)).toContain(rest[0].slice);
      seen.add(rest[0].slice!);
      // The card says the location; the spy's card never does.
      expect(phoneCard(g, rest[0].slide, { files: {} })).toMatchObject({ title: 'The location:', text: rest[0].slice });
      expect(JSON.stringify(spy[0].slide)).not.toContain(rest[0].slice!);
    }
    // (Drawn at random: many locations come up.)
    expect(seen.size).toBeGreaterThan(8);
  });

  it('Everyone’s own prompt: each player their own slice, none twice while there are enough; no part on the phones', () => {
    const { g, pool, prompts, tpl } = setup();
    const deal = tpl('prompt', prompts.id);
    for (let seed = 1; seed <= 100; seed++) {
      const h = hands(dealHands(g, deal, pool, { rand: seeded(seed) }));
      expect(h).toHaveLength(6);
      expect(new Set(h.map((x) => x.slice)).size).toBe(6);
      // (Everyone got the same part: "You're the Player" would say nothing.)
      expect(h.some((x) => x.role)).toBe(false);
    }
  });

  it('more players than slices: each slice once before any comes again; Spin again is never drawn', () => {
    const { g, pool, tpl } = setup();
    const w = wheelFromTemplate(WHEEL_TEMPLATES.find((t) => t.key === 'coin')!, '$');
    w.segments.push({ id: 'again', label: 'Spin again', color: '#000000', weight: 5 });
    g.wheels.push(w);
    const deal = tpl('prompt', w.id);
    for (let seed = 1; seed <= 50; seed++) {
      const h = hands(dealHands(g, deal, pool, { rand: seeded(seed) }));
      const labels = h.map((x) => x.slice);
      expect(labels.filter((l) => l === 'Heads')).toHaveLength(3);
      expect(labels.filter((l) => l === 'Tails')).toHaveLength(3);
      expect(labels).not.toContain('Spin again');
    }
  });

  it('a part that shares the slice and one that draws its own: the own ones never repeat the shared one', () => {
    const { g, pool, places, tpl } = setup();
    const deal = tpl('spy', places.id);
    deal.parts[0].draw = 'own';
    for (let seed = 1; seed <= 50; seed++) {
      const h = hands(dealHands(g, deal, pool, { rand: seeded(seed) }));
      const shared = h.find((x) => x.part === 'Villager')!.slice;
      expect(h.find((x) => x.part === 'Spy')!.slice).not.toBe(shared);
    }
  });

  it('a slice’s details and picture go on the card, under the part’s words; the part’s card is copied, not shared', () => {
    const { g } = setup();
    g.media.push({ id: 'pic', name: 'beach.png', mime: 'image/png', size: 100, kind: 'image' });
    const card = textSlide('The location:');
    const s = handSlide(g, card, { label: 'Beach', details: 'Sand, sea and sun', media: 'pic' });
    expect(phoneCard(g, s, { files: {} })).toMatchObject({ title: 'The location:', text: 'Beach\nSand, sea and sun', media: [{ kind: 'image', pending: true }] });
    setSlideText(card, 'changed');
    expect(phoneCard(g, s, { files: {} }).title).toBe('The location:');
  });

  it('Team captain, per team: one captain on each team, among the people on it (or the host’s pick there)', () => {
    const { g, tpl } = setup(2);
    const red = ['r1', 'r2', 'r3'].map((id) => ({ seat: 'a', member: { id, name: id.toUpperCase() } }));
    const blue = ['b1', 'b2'].map((id) => ({ seat: 'b', member: { id, name: id.toUpperCase() } }));
    const deal = tpl('captain');
    for (let seed = 1; seed <= 30; seed++) {
      const h = hands(dealHands(g, deal, [...red, ...blue], { perTeam: true, rand: seeded(seed) }));
      expect(h.filter((x) => x.to.seat === 'a')).toHaveLength(1);
      expect(h.filter((x) => x.to.seat === 'b')).toHaveLength(1);
      expect(h.every((x) => x.to.member && x.part === 'Captain' && x.role)).toBe(true);
    }
    const picked = hands(dealHands(g, deal, [...red, ...blue], { perTeam: true, picks: { [deal.parts[0].id]: [red[2]] }, rand: seeded(1) }));
    expect(picked.find((x) => x.to.seat === 'a')!.to.member!.id).toBe('r3');
    expect(picked.find((x) => x.to.seat === 'b')).toBeTruthy();
    expect(dealProblem(g, { ...deal, parts: [{ ...deal.parts[0], count: 3 }] }, [...red, ...blue], { perTeam: true })).toBe('The parts need 3 players on each team: 2 are dealt in');
  });
});

/** Ann (a) to Eve (e) and Fay (f) dealt Odd one out with a Locations wheel; nothing sent. */
function dealt(seed = 5) {
  const s = setup();
  const deal = s.tpl('spy', s.places.id);
  const h = hands(dealHands(s.g, deal, s.pool, { rand: seeded(seed) }));
  const d = startDeal(s.session, deal, h, 500);
  return { ...s, deal, d, h };
}

const words = (g: Game, session: Session) => JSON.stringify(hostCards(g, session, { files: {} }));

describe('📤 sending a deal: only when the host confirms, one card per player, each its own id', () => {
  it('dealt but not sent: nothing reaches the room; the counts follow the deal’s order, not the players’', () => {
    const { g, session, d } = dealt();
    expect(d.stage).toBe('dealt');
    expect(session.cards).toBeUndefined();
    expect(hostCards(g, session, { files: {} })).toBeNull();
    expect(dealCounts(d)).toBe('Spy ×1, Villager ×5');
    // (Whoever the spy is.)
    for (let seed = 1; seed <= 20; seed++) expect(dealCounts(dealt(seed).d)).toBe('Spy ×1, Villager ×5');
  });

  it('sent: one card per player, to them alone, with their part as the role line and never “shared”', () => {
    const { g, session, d, h } = dealt();
    const cards = sendDeal(g, session, 'round', 1000);
    expect(cards).toHaveLength(6);
    expect(d.stage).toBe('sent');
    const room = sessionCards(g, session, { files: {} })!;
    expect(room).toHaveLength(6);
    expect(new Set(room.map((c) => c.id)).size).toBe(6);
    for (const [i, c] of room.entries()) {
      expect(c.to).toEqual([{ seat: h[i].to.seat }]);
      expect(c.role).toBe(h[i].part);
      expect(c.shared).toBeUndefined();
    }
    const spy = room.find((c) => c.role === 'Spy')!;
    const where = h.find((x) => x.part === 'Villager')!.slice!;
    expect(JSON.stringify(spy)).not.toContain(where);
    expect(room.filter((c) => c.role === 'Villager').every((c) => c.text === where)).toBe(true);
    // The list of cards out leaves them to the deal's own row.
    expect(listedCards(g, session)).toEqual([]);
    expect(dealOut(g, session)).toHaveLength(6);
  });

  it('↻ Send again gives every card of the deal a new id, and no other card’s', () => {
    const { g, session } = dealt();
    const other = sendCard(g, session, { to: [{ seat: 'a' }], content: { slide: quickSlide('x') }, until: 'host' }, 900)!;
    sendDeal(g, session, 'host', 1000);
    const before = sessionCards(g, session, { files: {} })!.map((c) => c.id);
    expect(sendDealAgain(g, session, 1000)).toBe(6);
    const after = sessionCards(g, session, { files: {} })!.map((c) => c.id);
    expect(after[0]).toBe(sentCardId(other));
    expect(after.slice(1).every((id) => !before.includes(id))).toBe(true);
  });

  it('✖ Take back takes only the deal’s cards; the deal stays for Who was who; a new deal takes back the old one’s', () => {
    const { g, session, tpl, pool } = dealt();
    const other = sendCard(g, session, { to: [{ seat: 'a' }], content: { slide: quickSlide('x') }, until: 'host' }, 900)!;
    sendDeal(g, session, 'host', 1000);
    expect(takeBackDeal(g, session)).toHaveLength(6);
    expect(session.cards!.map((c) => c.id)).toEqual([other.id]);
    expect(session.deal?.stage).toBe('sent');
    // Sent again from the hands, then a new deal: the old deal's cards go.
    sendDeal(g, session, 'host', 2000);
    const next = tpl('roles');
    startDeal(session, next, hands(dealHands(g, next, pool, { rand: seeded(1) })), 3000);
    expect(session.cards!.map((c) => c.id)).toEqual([other.id]);
    expect(session.deal?.stage).toBe('dealt');
    clearDeal(session);
    expect(session.deal).toBeNull();
  });

  it('the room takes CARDS_MAX cards: a deal that wouldn’t fit is refused whole', () => {
    const { g, session, d } = dealt();
    for (let i = 0; i < CARDS_MAX - 5; i++) sendCard(g, session, { to: [{ seat: 'a' }], content: { slide: quickSlide(`c${i}`) }, until: 'host' });
    expect(roomCardsFull(g, session, dealTrial(g, d, 'host'))).toBe(true);
    expect(sendDeal(g, session, 'host', 1000, roomCardsFull(g, session, dealTrial(g, d, 'host')))).toEqual([]);
    expect(dealOut(g, session)).toEqual([]);
    expect(d.stage).toBe('dealt');
    session.cards = session.cards!.slice(1);
    expect(roomCardsFull(g, session, dealTrial(g, d, 'host'))).toBe(false);
  });

  it('cards that last the round need a round; the card window and the 📋 copy say the part', () => {
    const { g, session, h } = dealt();
    session.phase = 'end';
    expect(dealCards(g, session, session.deal!, 'round')).toBeNull();
    session.phase = 'board';
    sendDeal(g, session, 'host', 1000);
    const spy = h.find((x) => x.part === 'Spy')!;
    expect(windowCards(g, session, spy.to.seat)[0]).toMatchObject({ role: 'Spy' });
    const text = dealCopyText(g, session, session.deal!, spy);
    expect(text).toMatch(/^🤫 For \w+ only \(🎭 Odd one out\): You’re the Spy\nYou’re the spy!/);
  });

  it('a player taken out: their card and their part go; the others stay', () => {
    const { g, session, h } = dealt();
    sendDeal(g, session, 'host', 1000);
    removePlayer(session, h[0].to.seat);
    expect(session.deal!.hands).toHaveLength(5);
    expect(dealOut(g, session)).toHaveLength(5);
  });
});

describe('🎭 Who was who', () => {
  it('nothing until the host shows it (and only once sent); then names and parts; Ctrl+Z takes it off', () => {
    const { g, session, h } = dealt();
    expect(dealReveal(session)).toBeNull();
    // Not before it was sent.
    expect(whoWasWhoStep(session, true)).toBe(false);
    expect(dealReveal(session)).toBeNull();
    sendDeal(g, session, 'host', 1000);
    expect(dealReveal(session)).toBeNull();
    expect(whoWasWhoStep(session, true)).toBe(true);
    const r = dealReveal(session)!;
    expect(r.name).toBe('Odd one out');
    expect(r.lines.map((l) => [l.name, l.part, l.slice])).toEqual(h.map((x) => [NAMES[x.to.seat.charCodeAt(0) - 97], x.part, x.slice]));
    expect(r.lines[0].color).toMatch(/^#/);
    undoAction(session, g);
    expect(dealReveal(session)).toBeNull();
    redoAction(session, g);
    expect(dealReveal(session)).not.toBeNull();
    expect(whoWasWhoStep(session, false)).toBe(true);
    expect(dealReveal(session)).toBeNull();
  });

  it('a person on a team is named with their team', () => {
    const { g, session, tpl } = setup(2);
    const deal = tpl('captain');
    const pool = [{ seat: 'a', member: { id: 'm1', name: 'Mia' } }];
    startDeal(session, deal, hands(dealHands(g, deal, pool, { perTeam: true })));
    sendDeal(g, session, 'host');
    whoWasWhoStep(session, true);
    expect(dealReveal(session)!.lines).toEqual([{ name: 'Mia', team: 'Ann', color: '#e6194b', part: 'Captain' }]);
  });

  it('viewers get nothing of the deal until it’s shown, then only names, parts and slices: never a card', () => {
    const { g, session } = dealt();
    session.deal!.hands.forEach((x) => x.slide.elements.push({ ...newImageEl('secret-media'), name: 'card-file.png' }));
    expect(forViewers(session).deal).toBeUndefined();
    sendDeal(g, session, 'host', 1000);
    expect(forViewers(session).deal).toBeUndefined();
    whoWasWhoStep(session, true);
    const v = forViewers(session);
    const json = JSON.stringify(v);
    expect(json).not.toMatch(/You’re the spy|The location|secret-media|card-file/);
    expect(dealReveal(v)).toEqual(dealReveal(session));
    expect(v.cards).toBeUndefined();
  });
});

describe('a reload, and a damaged save', () => {
  it('a deal and its cards come back as they were', () => {
    const { g, session } = dealt();
    sendDeal(g, session, 'host', 1000);
    whoWasWhoStep(session, true);
    const back = migrateSession(JSON.parse(JSON.stringify(session)), g);
    expect(back.deal).toEqual(session.deal);
    expect(sessionCards(g, back, { files: {} })).toEqual(sessionCards(g, session, { files: {} }));
  });

  it('a damaged deal is put away, and a deal’s cards without their deal are taken back', () => {
    const { g, session } = dealt();
    sendDeal(g, session, 'host', 1000);
    const bad = JSON.parse(JSON.stringify(session));
    bad.deal.stage = 'oops';
    const back = migrateSession(bad, g);
    expect(back.deal).toBeNull();
    expect(back.cards).toBeUndefined();
    // A hand that isn't well-formed goes; the rest stay.
    const some = JSON.parse(JSON.stringify(session));
    some.deal.hands[0].to = 7;
    repairDeal(some);
    expect(some.deal.hands).toHaveLength(5);
  });

  it('the editor’s checks: a part that draws with no wheel, two parts for the rest; media on a part’s card is in use', () => {
    const { g, tpl, places } = setup();
    const spy = tpl('spy');
    g.deals = [spy];
    expect(dealSetupProblems(g, spy)).toEqual(['Villager draws from a wheel, but none is chosen']);
    expect(validate(g).map((p) => p.text)).toContain('Deal “Odd one out”: Villager draws from a wheel, but none is chosen');
    spy.wheel = places.id;
    expect(dealSetupProblems(g, spy)).toEqual([]);
    spy.parts[0].count = 'rest';
    expect(dealSetupProblems(g, spy)).toEqual(['only one part can go to “the rest”']);
    spy.parts[0].card.elements.push(newImageEl('only-on-a-card'));
    expect(mediaUsage(g).get('only-on-a-card')).toBe(1);
  });

  it('a game’s deals are repaired: counts whole, unknown draws gone, every part with a card', () => {
    const g = migrateGame({
      ...jeopardyGame(),
      deals: [{ id: 'd', name: 'X', parts: [{ id: 'p', name: 'A'.repeat(40), count: 2.6, draw: 'all', card: null }, { name: 'B', count: 'rest' }, 'junk'] }],
    } as unknown as Game);
    const [a, b] = g.deals![0].parts;
    expect(g.deals![0].parts).toHaveLength(2);
    expect(a).toMatchObject({ name: 'A'.repeat(24), count: 3 });
    expect(a.draw).toBeUndefined();
    expect(Array.isArray(a.card.elements)).toBe(true);
    expect(b.id).toBeTruthy();
    expect(b.count).toBe('rest');
  });
});
