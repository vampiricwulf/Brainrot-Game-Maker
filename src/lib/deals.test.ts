// 🎭 Deals (partner-clues spec §11, §12.2, §22): each player gets one part, at random (or as the host picked), in the
// numbers the deal says; a part's card can draw from a saved wheel (each their own slice, or one shared by all but the
// odd one out); nothing goes until the host sends it, then one card per player, each with its own id; Send again and
// Take back touch only the deal's cards; Who was who shows only names and parts, only once the host shows it, and Ctrl+Z
// takes it off; viewers never get who had which before that; a reload keeps it right.
import { describe, expect, it } from 'vitest';
import { jeopardyGame } from './testgame';
import { migrateGame, newImageEl, setSlideText, textSlide, type BoardRound, type CardTo, type DealPreset, type Game, type Session } from './model';
import { forViewers, migrateSession, newSession, openClue, removePlayer, restorePlayer } from './session';
import { cardsFullText, cardsLeftOff, dealFullText, hostCards, roomCardsAfter, roomCardsFull, sessionCards } from './buzz';
import { CARDS_MAX, type CardLate, type PhoneInfo, OLD_FILE_LIMITS } from './buzzproto';
import { listedCards, quickSlide, sendCard, sentCardId } from './sentcards';
import { phoneCard } from './phonecard';
import { undoAction, redoAction, whoWasWhoStep } from './toolset';
import { windowCards } from './cardwindow';
import { WHEEL_TEMPLATES, wheelFromTemplate } from './wheeltemplates';
import { addCard, sendCards, setPartner, setPartnerGame, toKey } from './partner';
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
  dealPhones,
  dealPhonesLate,
  dealProblem,
  dealReveal,
  dealSentLine,
  dealtHere,
  dealtIn,
  dealSetupProblems,
  dealTrial,
  DEAL_TEMPLATES,
  dropGonePhones,
  handSlide,
  repairDeal,
  sendDeal,
  sendDealAgain,
  startDeal,
  takeBackDeal,
} from './deals';

/** How big a file the buzzer server takes in these tests (one that doesn't say: 16 MB). */
const FILE_BYTES = OLD_FILE_LIMITS.fileBytes;

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

const dealtOf = (r: ReturnType<typeof dealHands>) => {
  if ('problem' in r) throw new Error(r.problem);
  return r;
};
const hands = (r: ReturnType<typeof dealHands>) => dealtOf(r).hands;

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
    const r = dealtOf(dealHands(g, captain, [{ seat: 'a' }, { seat: 'b' }, { seat: 'c' }, { seat: 'b' }], { rand: seeded(2) }));
    const one = r.hands;
    expect(one).toHaveLength(1);
    expect(one[0].part).toBe('Captain');
    // (Only one got a part: it shows on their phone.)
    expect(one[0].role).toBe(true);
    // Everyone dealt in is kept, a part or not (one window lists them all: only the captain would say who).
    expect(r.dealtIn).toEqual([{ seat: 'a' }, { seat: 'b' }, { seat: 'c' }]);
  });

  it('one window: who got a part reads the same whoever got it, the list, the counts and the 📋 copies alike', () => {
    const { g, session, tpl } = setup(5);
    const captain: DealPreset = { ...tpl('captain'), perTeam: false };
    const pool = session.players.map((p) => ({ seat: p.id }));
    const look = (seed: number) => {
      const r = dealtOf(dealHands(g, captain, pool, { rand: seeded(seed) }));
      const d = startDeal(session, captain, r.hands, r.dealtIn, 100);
      const copies = dealtIn(d).map((t) => dealCopyText(g, session, d, t));
      return { who: d.hands[0].to.seat, list: dealtIn(d).map((t) => t.seat), counts: dealCounts(d), copies };
    };
    const a = look(1);
    let b = a;
    for (let seed = 2; seed < 40 && b.who === a.who; seed++) b = look(seed);
    expect(b.who).not.toBe(a.who);
    expect(b.list).toEqual(a.list);
    expect(b.list).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(b.counts).toBe(a.counts);
    // Each row copies something: the captain their brief, everyone else a note that they have no part.
    expect(b.copies.filter((c) => c.endsWith('no part for you this time'))).toHaveLength(4);
    expect(b.copies.find((c) => c.includes('You’re the Captain'))).toMatch(/^🤫 For \w+ only \(🎭 Team captain\): You’re the Captain/);
    // A player taken out (not the captain) goes from the list, but the counts stay as dealt.
    const gone = ['a', 'b', 'c', 'd', 'e'].find((x) => x !== session.deal!.hands[0].to.seat)!;
    removePlayer(session, gone);
    expect(dealtHere(session.deal!, session).map((t) => t.seat)).toEqual(['a', 'b', 'c', 'd', 'e'].filter((x) => x !== gone));
    expect(dealtIn(session.deal!)).toHaveLength(5);
    expect(dealCounts(session.deal!)).toBe(b.counts);
    // The captain taken out: the deal stays as it was (it going would say who was captain), and a restore lists them again.
    const captainSeat = session.deal!.hands[0].to.seat;
    removePlayer(session, captainSeat);
    expect(session.deal).not.toBeNull();
    expect([dealtIn(session.deal!).length, dealCounts(session.deal!)]).toEqual([5, b.counts]);
    restorePlayer(session, captainSeat);
    expect(dealtHere(session.deal!, session).map((t) => t.seat)).toContain(captainSeat);
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
      expect(phoneCard(g, rest[0].slide, { fileBytes: FILE_BYTES, files: {} })).toMatchObject({ title: 'The location:', text: rest[0].slice });
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
    expect(phoneCard(g, s, { fileBytes: FILE_BYTES, files: {} })).toMatchObject({ title: 'The location:', text: 'Beach\nSand, sea and sun', media: [{ kind: 'image', pending: true }] });
    setSlideText(card, 'changed');
    expect(phoneCard(g, s, { fileBytes: FILE_BYTES, files: {} }).title).toBe('The location:');
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
  const r = dealtOf(dealHands(s.g, deal, s.pool, { rand: seeded(seed) }));
  const h = r.hands;
  const d = startDeal(s.session, deal, h, r.dealtIn, 500);
  return { ...s, deal, d, h };
}

const words = (g: Game, session: Session) => JSON.stringify(hostCards(g, session, { fileBytes: FILE_BYTES, files: {} }));

describe('📤 sending a deal: only when the host confirms, one card per player, each its own id', () => {
  it('dealt but not sent: nothing reaches the room; the counts follow the deal’s order, not the players’', () => {
    const { g, session, d } = dealt();
    expect(d.stage).toBe('dealt');
    expect(session.cards).toBeUndefined();
    expect(hostCards(g, session, { fileBytes: FILE_BYTES, files: {} })).toBeNull();
    expect(dealCounts(d)).toBe('Spy ×1, Villager ×5');
    // (Whoever the spy is.)
    for (let seed = 1; seed <= 20; seed++) expect(dealCounts(dealt(seed).d)).toBe('Spy ×1, Villager ×5');
  });

  it('sent: one card per player, to them alone, with their part under Tap to see and never “shared”', () => {
    const { g, session, d, h } = dealt();
    const cards = sendDeal(g, session, 'round', 1000);
    expect(cards).toHaveLength(6);
    expect(d.stage).toBe('sent');
    const room = sessionCards(g, session, { fileBytes: FILE_BYTES, files: {} })!;
    expect(room).toHaveLength(6);
    expect(new Set(room.map((c) => c.id)).size).toBe(6);
    for (const [i, c] of room.entries()) {
      expect(c.to).toEqual([{ seat: h[i].to.seat }]);
      // (The part is the secret: the card's title, behind Tap to see, never the role line a phone shows over the cover.)
      expect(c.title).toBe(`You’re the ${h[i].part}`);
      expect(c.role).toBeUndefined();
      expect(c.shared).toBeUndefined();
    }
    const spy = room.find((c) => c.title === 'You’re the Spy')!;
    const where = h.find((x) => x.part === 'Villager')!.slice!;
    expect(JSON.stringify(spy)).not.toContain(where);
    expect(spy.text).toMatch(/^You’re the spy!/);
    expect(room.filter((c) => c.title === 'You’re the Villager').every((c) => c.text === `The location:\n${where}`)).toBe(true);
    // The list of cards out leaves them to the deal's own row.
    expect(listedCards(g, session)).toEqual([]);
    expect(dealOut(g, session)).toHaveLength(6);
  });

  it('↻ Send again gives every card of the deal a new id, and no other card’s', () => {
    const { g, session } = dealt();
    const other = sendCard(g, session, { to: [{ seat: 'a' }], content: { slide: quickSlide('x') }, until: 'host' }, 900)!;
    sendDeal(g, session, 'host', 1000);
    const before = sessionCards(g, session, { fileBytes: FILE_BYTES, files: {} })!.map((c) => c.id);
    expect(sendDealAgain(g, session, 1000)).toBe(6);
    const after = sessionCards(g, session, { fileBytes: FILE_BYTES, files: {} })!.map((c) => c.id);
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
    const r = dealtOf(dealHands(g, next, pool, { rand: seeded(1) }));
    startDeal(session, next, r.hands, r.dealtIn, 3000);
    expect(session.cards!.map((c) => c.id)).toEqual([other.id]);
    expect(session.deal?.stage).toBe('dealt');
    clearDeal(session);
    expect(session.deal).toBeNull();
  });

  it('the room takes CARDS_MAX cards: a deal that wouldn’t fit is refused whole', () => {
    const { g, session, d } = dealt();
    for (let i = 0; i < CARDS_MAX - 5; i++) sendCard(g, session, { to: [{ seat: 'a' }], content: { slide: quickSlide(`c${i}`) }, until: 'host' });
    expect(roomCardsAfter(g, session, dealTrial(g, d, 'host'))).toBe(CARDS_MAX + 1);
    expect(roomCardsFull(g, session, dealTrial(g, d, 'host'))).toBe(true);
    expect(sendDeal(g, session, 'host', 1000, roomCardsFull(g, session, dealTrial(g, d, 'host')))).toEqual([]);
    expect(dealOut(g, session)).toEqual([]);
    expect(d.stage).toBe('dealt');
    session.cards = session.cards!.slice(1);
    // (It fits, filling the phones: the deal's panel says so before 📤 Send.)
    expect(roomCardsAfter(g, session, dealTrial(g, d, 'host'))).toBe(CARDS_MAX);
    expect(roomCardsFull(g, session, dealTrial(g, d, 'host'))).toBe(false);
  });

  it('the room full with a deal’s cards out: the refusal says where they are, as the list of cards out leaves them off', () => {
    const { g, session } = dealt();
    expect(cardsFullText(g, session)).toBe(`${CARDS_MAX} cards are out on the phones: ✖ Take one back first`);
    sendDeal(g, session, 'host', 1000);
    for (let i = 0; i < CARDS_MAX - 6; i++) sendCard(g, session, { to: [{ seat: 'a' }], content: { slide: quickSlide(`c${i}`) }, until: 'host' });
    expect(roomCardsFull(g, session)).toBe(true);
    expect(cardsFullText(g, session)).toBe(`${CARDS_MAX} cards are out on the phones, 6 of them the 🎭 deal’s: ✖ Take them back in 🎭 Deal…, or take back another one`);
  });

  it('more cards out than the phones hold (shown in the 🪟 card window before the room took cards): one card’s refusal counts them all, and how many to take back', () => {
    const { g, session } = dealt();
    const quick = (n: number) => {
      for (let i = 0; i < n; i++) sendCard(g, session, { to: [{ seat: 'c' }], content: { slide: quickSlide(`w${i}`) }, until: 'host' });
    };
    quick(CARDS_MAX + 2);
    expect(roomCardsFull(g, session)).toBe(true);
    expect(cardsFullText(g, session)).toBe(`${CARDS_MAX + 2} cards are out on the phones: ✖ Take 3 back first`);
    session.cards = session.cards!.slice(1);
    expect(cardsFullText(g, session)).toBe(`${CARDS_MAX + 1} cards are out on the phones: ✖ Take 2 back first`);
    session.cards = session.cards!.slice(1);
    expect(cardsFullText(g, session)).toBe(`${CARDS_MAX} cards are out on the phones: ✖ Take one back first`);
    // With the deal's out too: taking those back, or as many others.
    session.cards = session.cards!.slice(4);
    sendDeal(g, session, 'host', 1000);
    expect(cardsFullText(g, session)).toBe(`${CARDS_MAX + 2} cards are out on the phones, 6 of them the 🎭 deal’s: ✖ Take them back in 🎭 Deal…, or take back 3 others`);
    // More to go than the deal's: they aren't enough by themselves.
    quick(4);
    expect(cardsFullText(g, session)).toBe(`${CARDS_MAX + 6} cards are out on the phones, 6 of them the 🎭 deal’s: ✖ Take 7 back first (the deal’s go together, in 🎭 Deal…)`);
  });

  it('a deal that wouldn’t fit: its refusal counts the cards out, what the deal adds, and how many to take back, sent or not', () => {
    const { g, session, d } = dealt();
    const quick = () => {
      for (let i = 0; i < 5; i++) sendCard(g, session, { to: [{ seat: 'a' }], content: { slide: quickSlide(`c${i}`) }, until: 'host' });
    };
    quick();
    expect(roomCardsFull(g, session, dealTrial(g, d, 'host'))).toBe(true);
    const text = `5 cards are out on the phones, and this deal adds 6: they hold ${CARDS_MAX} at once, all phones together, so ✖ Take 3 back first`;
    expect(dealFullText(g, session, dealTrial(g, d, 'host'))).toBe(text);
    // Sent, taken back, then the quick cards: the same (its cards out are none of the five).
    session.cards = [];
    sendDeal(g, session, 'host', 1000);
    takeBackDeal(g, session);
    quick();
    expect(d.stage).toBe('sent');
    expect(roomCardsFull(g, session, dealTrial(g, d, 'host'))).toBe(true);
    expect(dealFullText(g, session, dealTrial(g, d, 'host'))).toBe(text);
    session.cards = session.cards!.slice(3);
    expect(roomCardsFull(g, session, dealTrial(g, d, 'host'))).toBe(false);
  });

  it('a send of more than one card (a partner clue’s) that won’t fit: the refusal counts what’s out and whose, what it sends, and how many to take back', () => {
    const { g, session, pool, tpl } = setup(5);
    const deal = tpl('roles');
    const r = dealtOf(dealHands(g, deal, pool, { rand: seeded(3) }));
    startDeal(session, deal, r.hands, r.dealtIn, 500);
    sendDeal(g, session, 'host', 1000);
    sendCard(g, session, { to: pool, content: { slide: quickSlide('Wild') }, until: 'host' }, 1100);
    sendCard(g, session, { to: [{ seat: 'a' }], content: { slide: quickSlide('Tip') }, until: 'host' }, 1200);
    const pc = (g.rounds[0] as BoardRound).categories[1].clues[0];
    pc.type = 'partner';
    setPartnerGame(pc, 'describe');
    addCard(pc);
    addCard(pc);
    pc.cards!.forEach((c, i) => setSlideText(c, `Part${i + 1}`));
    openClue(session, { round: 0, cat: 1, row: 0 }, g);
    const s = session.partner!;
    setPartner(session, s, 'b', 'wheel');
    const all = (t: Session) => sendCards(t, t.partner!, pc.cards!, 2000);
    expect(roomCardsFull(g, session, all)).toBe(true);
    expect(cardsFullText(g, session, all)).toBe(
      `7 cards are out on the phones, 5 of them the 🎭 deal’s, and this sends 3: they hold ${CARDS_MAX} at once, all phones together, so ✖ Take 2 back first (the deal’s go together, in 🎭 Deal…)`,
    );
    // One goes (8 out): the next card's refusal names the partner clue's too.
    sendCards(session, s, [pc.cards![0]], 2000);
    const next = (t: Session) => sendCards(t, t.partner!, [pc.cards![1]], 3000);
    expect(roomCardsFull(g, session, next)).toBe(true);
    expect(cardsFullText(g, session, next)).toBe(`${CARDS_MAX} cards are out on the phones, 5 of them the 🎭 deal’s and 1 this partner clue’s: ✖ Take them back in 🎭 Deal…, or take back another one`);
    // The deal back, a second partner card out: the deal's refusal says where those are.
    takeBackDeal(g, session);
    sendCards(session, s, [pc.cards![1]], 3000);
    expect(roomCardsFull(g, session, dealTrial(g, session.deal!, 'host'))).toBe(true);
    expect(dealFullText(g, session, dealTrial(g, session.deal!, 'host'))).toBe(
      `4 cards are out on the phones, 2 of them this partner clue’s, and this deal adds 5: they hold ${CARDS_MAX} at once, all phones together, so ✖ Take 1 back first`,
    );
    // A send bigger than the phones hold: nothing taken back makes room.
    const many = (t: Session) => {
      for (let i = 0; i < CARDS_MAX + 1; i++) sendCard(g, t, { to: [{ seat: 'c' }], content: { slide: quickSlide(`m${i}`) }, until: 'host' }, 4000 + i);
    };
    expect(cardsFullText(g, session, many)).toBe(
      `4 cards are out on the phones, 2 of them this partner clue’s, and this sends ${CARDS_MAX + 1}: they hold ${CARDS_MAX} at once, all phones together, so send fewer at once`,
    );
  });

  it('a deal handed out to more players than the phones take (before the room took cards): which never reach them, and the refusal counts what they hold', () => {
    const g = jeopardyGame();
    g.players = Array.from({ length: CARDS_MAX + 2 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, color: '#e6194b' }));
    const session = newSession(g);
    const deal = dealFromTemplate(DEAL_TEMPLATES.find((t) => t.key === 'roles')!);
    const r = dealtOf(dealHands(g, deal, session.players.map((p) => ({ seat: p.id })), { rand: seeded(3) }));
    startDeal(session, deal, r.hands, r.dealtIn, 500);
    expect(cardsLeftOff(g, session)).toEqual([]);
    const sent = sendDeal(g, session, 'host', 1000);
    expect(sent).toHaveLength(CARDS_MAX + 2);
    // The room is told the newest CARDS_MAX: the first two never reach a phone.
    expect(hostCards(g, session, { fileBytes: FILE_BYTES, files: {} })!.map((c) => c.id)).toEqual(sent.slice(2).map(sentCardId));
    expect(cardsLeftOff(g, session)).toEqual(sent.slice(0, 2).map(sentCardId));
    expect(cardsFullText(g, session)).toBe(`${CARDS_MAX} cards are out on the phones, all of them the 🎭 deal’s: ✖ Take them back in 🎭 Deal…`);
    takeBackDeal(g, session);
    expect(cardsLeftOff(g, session)).toEqual([]);
  });

  it('such a deal leaves off the cards that went before it too; then the phones hold only the deal’s, and the refusal says so', () => {
    for (const n of [CARDS_MAX, CARDS_MAX + 2]) {
      const g = jeopardyGame();
      g.players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, color: '#e6194b' }));
      const session = newSession(g);
      // Quick cards first (to the 🪟 card window, say): the room counts them, so they're let through.
      const quick = (n === CARDS_MAX ? [0, 1] : [0]).map((i) => sendCard(g, session, { to: [{ seat: 'p0' }], content: { slide: quickSlide(`q${i}`) }, until: 'host' }, 100 + i, roomCardsFull(g, session))!);
      expect(quick.every(Boolean)).toBe(true);
      const deal = dealFromTemplate(DEAL_TEMPLATES.find((t) => t.key === 'roles')!);
      const r = dealtOf(dealHands(g, deal, session.players.map((p) => ({ seat: p.id })), { rand: seeded(3) }));
      startDeal(session, deal, r.hands, r.dealtIn, 500);
      const sent = sendDeal(g, session, 'host', 1000);
      expect(sent).toHaveLength(n);
      // The room is told the deal's newest CARDS_MAX: the quick cards (and the deal's first, past CARDS_MAX) never reach a phone.
      const off = [...quick, ...sent.slice(0, n - CARDS_MAX)].map(sentCardId);
      expect(hostCards(g, session, { fileBytes: FILE_BYTES, files: {} })!.map((c) => c.id)).toEqual(sent.slice(n - CARDS_MAX).map(sentCardId));
      expect(cardsLeftOff(g, session)).toEqual(off);
      // Taking back another card frees nothing on the phones: only the deal's, said as all of them.
      expect(cardsFullText(g, session)).toBe(`${CARDS_MAX} cards are out on the phones, all of them the 🎭 deal’s: ✖ Take them back in 🎭 Deal…`);
      takeBackDeal(g, session);
      expect(cardsLeftOff(g, session)).toEqual([]);
      expect(hostCards(g, session, { fileBytes: FILE_BYTES, files: {} })!.map((c) => c.id)).toEqual(quick.map(sentCardId));
    }
  });

  it('cards that last the round need a round; the card window and the 📋 copy say the part', () => {
    const { g, session, h } = dealt();
    session.phase = 'end';
    expect(dealCards(g, session, session.deal!, 'round')).toBeNull();
    session.phase = 'board';
    sendDeal(g, session, 'host', 1000);
    const spy = h.find((x) => x.part === 'Spy')!;
    expect(windowCards(g, session, spy.to.seat)[0]).toMatchObject({ role: 'Spy' });
    const text = dealCopyText(g, session, session.deal!, spy.to);
    expect(text).toMatch(/^🤫 For \w+ only \(🎭 Odd one out\): You’re the Spy\nYou’re the spy!/);
  });

  it('a player taken out: their card goes, their part stays; a restore brings it back, and ↻ Send again sends their card', () => {
    const { g, session, h } = dealt();
    sendDeal(g, session, 'host', 1000);
    const spy = h.find((x) => x.part === 'Spy')!;
    const before = dealCounts(session.deal!);
    removePlayer(session, spy.to.seat);
    expect(session.deal!.hands).toHaveLength(6);
    expect(dealCounts(session.deal!)).toBe(before);
    expect(dealOut(g, session)).toHaveLength(5);
    expect(dealOut(g, session).some((c) => c.to.some((t) => t.seat === spy.to.seat))).toBe(false);
    restorePlayer(session, spy.to.seat);
    expect(session.deal!.hands.find((x) => x.to.seat === spy.to.seat)?.part).toBe('Spy');
    // Their card was taken back with them: ↻ Send again gives it back (the others' go again too).
    expect(sendDealAgain(g, session, 2000)).toBe(6);
    expect(dealOut(g, session)).toHaveLength(6);
    expect(dealOut(g, session).find((c) => c.to.some((t) => t.seat === spy.to.seat))).toMatchObject({ role: 'Spy', until: 'host' });
  });
});

describe('one window: the phones that came after the cards went are counted blind to parts', () => {
  const phone = (seatId: string, connected = true, member?: string): PhoneInfo => ({ conn: `${seatId}${member ?? ''}`, seatId, connected, ...(member ? { member } : {}) });
  /** The room's late list: the phones here sent one of the deal's cards before they came. */
  const lateFor = (g: Game, session: Session, here: PhoneInfo[]): CardLate[] =>
    dealOut(g, session).flatMap((c) => here.filter((p) => p.connected && c.to.some((t) => t.seat === p.seatId && (!t.member || t.member.id === p.member))).map((p) => ({ id: sentCardId(c), seatId: p.seatId!, ...(p.member ? { member: p.member } : {}) })));
  /** Team captain, no teams, three players (Ann, Bob, Cat): one of them captain, the others no part (no card). */
  const captainDeal = (captain: string) => {
    const { g, session, pool, tpl } = setup(3);
    const deal = tpl('captain');
    const r = dealtOf(dealHands(g, deal, pool, { picks: { [deal.parts[0].id]: [{ seat: captain }] } }));
    const d = startDeal(session, deal, r.hands, r.dealtIn, 500);
    sendDeal(g, session, 'host', 1000);
    return { g, session, d };
  };

  it('the sent line: a deal that leaves some without a part never ticks “seen” as the captain opens theirs; a player taken out leaves it as dealt', () => {
    const { d } = captainDeal('a');
    expect(dealSentLine(d, 1, 0, false)).toBe('Sent to 1');
    expect(dealSentLine(d, 1, 1, false)).toBe('Sent to 1');
    // (Two windows: only the host sees it.)
    expect(dealSentLine(d, 1, 1, true)).toBe('✓ seen by 1 of 1');
    // Everyone with a part: one window counts who saw theirs, of the deal as dealt (Bob taken out took his card along).
    const { g, session } = dealt();
    sendDeal(g, session, 'host', 1000);
    removePlayer(session, 'b');
    expect(dealOut(g, session)).toHaveLength(5);
    expect(dealSentLine(session.deal!, 5, 0, false)).toBe('Sent to 6');
    expect(dealSentLine(session.deal!, 5, 2, false)).toBe('✓ seen by 2 of 6');
    expect(dealSentLine(session.deal!, 5, 2, true)).toBe('✓ seen by 2 of 5');
  });

  it('Team captain with no teams: Cat’s phone, coming after the send, counts the same whether she’s captain or not', () => {
    const counts = ['a', 'c'].map((captain) => {
      const { g, session, d } = captainDeal(captain);
      // Ann's and Bob's phones are in the room; Cat has none yet.
      d.phonesAt = dealPhones(d, [phone('a'), phone('b')]);
      expect(dealPhonesLate(d, [phone('a'), phone('b')])).toBe(0);
      // (Only a part has a card to be late for: the room's list would say whether Cat is captain. It isn't counted.)
      expect(lateFor(g, session, [phone('c')]).length).toBe(captain === 'c' ? 1 : 0);
      return dealPhonesLate(d, [phone('a'), phone('b'), phone('c')]);
    });
    expect(counts).toEqual([1, 1]);
  });

  it('a phone away when they went, back with its token, isn’t counted; Bob’s leaving the room and coming back is, captain or not; ↻ Send again clears it', () => {
    const counts = ['a', 'b'].map((captain) => {
      const { g, session, d } = captainDeal(captain);
      d.phonesAt = dealPhones(d, [phone('a'), phone('b'), phone('c', false)]);
      expect(d.phonesAt).toEqual(['a', 'b', 'c']);
      const all = [phone('a'), phone('b'), phone('c')];
      expect(dealPhonesLate(d, all)).toBe(0);
      // Bob's phone away keeps his place.
      expect(dropGonePhones(d, [phone('a'), phone('b', false), phone('c')])).toBe(false);
      // His seat freed (Change player on his phone, or the host freed it): the room lists it no more, so it goes.
      expect(dropGonePhones(d, [phone('a'), phone('c')])).toBe(true);
      expect(d.phonesAt).toEqual(['a', 'c']);
      expect(dealPhonesLate(d, [phone('a'), phone('c')])).toBe(0);
      // Back on it: new to the room. (Its late list would say whether Bob is captain.)
      expect(lateFor(g, session, [phone('b')]).length).toBe(captain === 'b' ? 1 : 0);
      expect(dropGonePhones(d, all)).toBe(false);
      const n = dealPhonesLate(d, all);
      sendDealAgain(g, session, 2000);
      d.phonesAt = dealPhones(d, all);
      expect(dealPhonesLate(d, all)).toBe(0);
      return n;
    });
    expect(counts).toEqual([1, 1]);
  });

  it('teams: a new person on a team dealt in counts, a part or not, and so does one moved off it and back; dealt to each team’s people, one not dealt in doesn’t', () => {
    const { g, session, pool, tpl } = setup(2);
    const deal = tpl('captain');
    const r = dealtOf(dealHands(g, deal, pool, { picks: { [deal.parts[0].id]: [{ seat: 'a' }] } }));
    const d = startDeal(session, deal, r.hands, r.dealtIn, 500);
    sendDeal(g, session, 'host', 1000);
    d.phonesAt = dealPhones(d, [phone('a', true, 'm1'), phone('b', true, 'm2')]);
    expect(d.phonesAt).toEqual(['a/m1', 'b/m2']);
    for (const seat of ['a', 'b']) expect(dealPhonesLate(d, [phone('a', true, 'm1'), phone('b', true, 'm2'), phone(seat, true, 'm3')])).toBe(1);
    // Mia moved to Bob's team: counted there; and back on Ann's, as she's new to it again.
    const moved = [phone('b', true, 'm1'), phone('b', true, 'm2')];
    expect(dropGonePhones(d, moved)).toBe(true);
    expect(d.phonesAt).toEqual(['b/m2']);
    expect(dealPhonesLate(d, moved)).toBe(1);
    expect(dealPhonesLate(d, [phone('a', true, 'm1'), phone('b', true, 'm2')])).toBe(1);
    // Each team's people dealt in: Mia and Max. Someone joining a team since isn't dealt in, and gets nothing.
    const per = setup(2);
    const people = [{ seat: 'a', member: { id: 'm1', name: 'Mia' } }, { seat: 'b', member: { id: 'm2', name: 'Max' } }];
    const pr = dealtOf(dealHands(per.g, deal, people, { perTeam: true }));
    const pd = startDeal(per.session, deal, pr.hands, pr.dealtIn, 500);
    sendDeal(per.g, per.session, 'host', 1000);
    pd.phonesAt = dealPhones(pd, [phone('a', true, 'm1'), phone('b', false, 'm2')]);
    expect(pd.phonesAt).toEqual(['a/m1', 'b/m2']);
    expect(dealPhonesLate(pd, [phone('a', true, 'm1'), phone('b', true, 'm2'), phone('a', true, 'm3')])).toBe(0);
  });

  it('a deal sent before the phones were kept: none counted (the phone says to ask the host), whoever has a part', () => {
    const { g, session, d } = dealt();
    sendDeal(g, session, 'host', 1000);
    expect(d.phonesAt).toBeUndefined();
    expect(dropGonePhones(d, [phone('a')])).toBe(false);
    expect(dealPhonesLate(d, [phone('a'), phone('b')])).toBe(0);
    expect(lateFor(g, session, [phone('b')]).length).toBe(1);
    expect(dealPhonesLate(d, [phone('a'), phone('b')])).toBe(0);
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
    const r = dealtOf(dealHands(g, deal, pool, { perTeam: true }));
    startDeal(session, deal, r.hands, r.dealtIn);
    sendDeal(g, session, 'host');
    whoWasWhoStep(session, true);
    expect(dealReveal(session)!.lines).toEqual([{ name: 'Mia', team: 'Ann', color: '#e6194b', part: 'Captain' }]);
  });

  it('everyone the same part, each with a slice (Everyone’s own prompt): the slice takes the part’s place', () => {
    const { g, session, pool, prompts, tpl } = setup(3);
    const deal = tpl('prompt', prompts.id);
    const r = dealtOf(dealHands(g, deal, pool, { rand: seeded(3) }));
    startDeal(session, deal, r.hands, r.dealtIn);
    sendDeal(g, session, 'host');
    whoWasWhoStep(session, true);
    const lines = dealReveal(session)!.lines;
    expect(lines.map((l) => l.part)).toEqual(r.hands.map((h) => h.slice));
    expect(lines.every((l) => l.slice === undefined)).toBe(true);
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
    expect(v.deal!.in).toBeUndefined();
  });
});

describe('a reload, and a damaged save', () => {
  it('a deal and its cards come back as they were', () => {
    const { g, session } = dealt();
    sendDeal(g, session, 'host', 1000);
    whoWasWhoStep(session, true);
    const back = migrateSession(JSON.parse(JSON.stringify(session)), g);
    expect(back.deal).toEqual(session.deal);
    expect(sessionCards(g, back, { fileBytes: FILE_BYTES, files: {} })).toEqual(sessionCards(g, session, { fileBytes: FILE_BYTES, files: {} }));
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
    // Everyone dealt in is kept only whole (else the list is those with a part, as in a save from before it was kept).
    expect(some.deal.in).toHaveLength(6);
    const odd = JSON.parse(JSON.stringify(session));
    odd.deal.in[2] = { seat: 4 };
    repairDeal(odd);
    expect(odd.deal.in).toBeUndefined();
    expect(dealtIn(odd.deal)).toEqual(odd.deal.hands.map((h: { to: CardTo }) => h.to));
    const short = JSON.parse(JSON.stringify(session));
    short.deal.in = short.deal.in.slice(1);
    repairDeal(short);
    expect(short.deal.in).toBeUndefined();
    // The phones in the room when the cards went: kept only as a list of places (else as in a save from before).
    const phones = JSON.parse(JSON.stringify(session));
    phones.deal.phonesAt = ['a', 'b/m1'];
    repairDeal(phones);
    expect(phones.deal.phonesAt).toEqual(['a', 'b/m1']);
    phones.deal.phonesAt = ['a', 3];
    repairDeal(phones);
    expect(phones.deal.phonesAt).toBeUndefined();
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
