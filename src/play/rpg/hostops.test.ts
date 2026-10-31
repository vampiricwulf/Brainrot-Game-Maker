import { describe, expect, it, vi } from 'vitest';
import { announce } from '../../lib/announce';
import { newGame, newImageEl, newShapeEl, textSlide, type Game, type Session, type SlideElement, type WorldState } from '../../lib/model';
import { addScreenBeside, ensureWorld, newRpgRound, splitParty } from '../../lib/rpg';
import { goToRound, newSession, score } from '../../lib/session';
import { currencyFields, inventory, newStatField, statNumber, undoAction } from '../../lib/toolset';
import {
  addLive, avatarRange, avatarSpot, bigObject, centredOn, droppedObject, dropEntry, everythingOn, fillsScreen, giveEntry, groupDelta, hiddenNames, joinPartyNow, liveText, moveChoices, moveGroup,
  moveObject, nameSecret, objectActs, objectMenu, objectRange, objectSay, partyOn, pickUp, regroupAll, removeObject, selectionWords, sendPartiesOn, sendPlayers, setObjectShown, shortList, splitOff, START_FIRST,
  staysWords, stepParty, wayOffEdge,
} from './hostops';
import { newLive } from '../../lib/live';
import type { MenuEntry } from '../../lib/menustate.svelte';
import { stepText } from '../../lib/toolset';

// (What screen readers are told.)
vi.mock('../../lib/announce', async (real) => ({ ...(await real<typeof import('../../lib/announce')>()), announce: vi.fn() }));

/** An RPG round with three players standing on its start screen. */
function setup(): { game: Game; session: Session; st: WorldState } {
  const game = newGame();
  game.players = ['Ann', 'Bob', 'Cat'].map((name, i) => ({ id: `p${i}`, name, color: '#e6194b' }));
  const round = newRpgRound(game);
  game.rounds = [round];
  const session = newSession(game);
  goToRound(session, game, 0);
  // Started (past its title card).
  session.intro = null;
  const st = ensureWorld(session, game, round)!;
  return { game, session, st };
}

/** The avatars' boxes (token and nameplate) on a screen. */
const avatars = (st: WorldState) => Object.values(st.positions).map((p) => ({ x: p.x - 60, y: p.y - 60, w: 120, h: 150 }));
const covers = (el: SlideElement, b: { x: number; y: number; w: number; h: number }) => el.x < b.x + b.w && b.x < el.x + el.w && el.y < b.y + b.h && b.y < el.y + el.h;

describe('improvising on the RPG stage', () => {
  it('puts typed text where no avatar stands', () => {
    const { game, session, st } = setup();
    const text = liveText(game, session, 'Toll situation');
    expect(avatars(st).some((b) => covers(text, b))).toBe(false);
    // The party near the top: the text goes lower down.
    for (const p of Object.values(st.positions)) p.y = 150;
    const low = liveText(game, session, 'Toll situation');
    expect(low.y).toBeGreaterThan(text.y);
    expect(avatars(st).some((b) => covers(low, b))).toBe(false);
  });

  it('drops an item next to the player, clear of everyone’s avatar', () => {
    const { game, st } = setup();
    const bob = st.positions.p1;
    const el = droppedObject(game, { id: 'e', item: null, name: 'Sword of a Thousand Truths', qty: 1 }, st, bob);
    expect(avatars(st).some((b) => covers(el, b))).toBe(false);
    expect(Math.abs(el.x + el.w / 2 - bob.x)).toBeLessThan(10);
    // Standing in a column (they came in from the side): not onto the player below either.
    Object.values(st.positions).forEach((p, i) => Object.assign(p, { x: 150, y: 370 + i * 170 }));
    const side = droppedObject(game, { id: 'e', item: null, name: 'Rock', qty: 1 }, st, st.positions.p1);
    expect(avatars(st).some((b) => covers(side, b))).toBe(false);
    expect(side.x + side.w <= 1920 && side.y + side.h <= 1080 && side.x >= 0).toBe(true);
  });

  it('keeps what is put where the host clicked on the stage, on the screen clicked (split view has several)', () => {
    const { game, session, st } = setup();
    expect(centredOn({ x: 960, y: 540 }, 1200, 200)).toEqual({ x: 360, y: 440 });
    expect(centredOn({ x: 154, y: 1060 }, 1200, 200)).toEqual({ x: 0, y: 880 });
    const map = game.worlds![0].maps[0];
    const beach = addScreenBeside(map, map.screens[0], 'e', 'Beach')!;
    const text = liveText(game, session, 'Beware of the goose');
    expect(addLive(game, session, text, 'Text', { map: map.id, screen: beach.id })).toBe(true);
    expect(st.added[beach.id]).toEqual([text]);
    // By default: the screen the audience follows.
    const other = liveText(game, session, 'Hello');
    addLive(game, session, other, 'Text');
    expect(st.added[map.screens[0].id]).toEqual([other]);
  });
});

/** The setup plus a screen to the east of the start screen ("Beach"). */
function withBeach() {
  const s = setup();
  const map = s.game.worlds![0].maps[0];
  const beach = addScreenBeside(map, map.screens[0], 'e', 'Beach')!;
  return { ...s, map, start: { map: map.id, screen: map.screens[0].id }, beach: { map: map.id, screen: beach.id } };
}

describe('dragging avatars on the RPG stage', () => {
  it('keeps a dropped avatar wholly on its screen, and clear of the stats strip', () => {
    expect(avatarSpot(960, 540)).toEqual({ x: 960, y: 540 });
    expect(avatarSpot(1920, -40)).toEqual({ x: 1845, y: 75 });
    // The strip along the bottom from y 930; along the top down to 150.
    expect(avatarSpot(400, 1000, 0, 930)).toEqual({ x: 400, y: 855 });
    expect(avatarSpot(400, 100, 150)).toEqual({ x: 400, y: 225 });
  });

  it('walks one off an edge only where the screen has a way out that side', () => {
    const { game, start, beach } = withBeach();
    const world = game.worlds![0];
    expect(wayOffEdge(world, start, 1990, 500)).toEqual({ to: beach, via: 'e' });
    // Nothing to the west or south, and still on the screen: no way.
    expect(wayOffEdge(world, start, -30, 500)).toBeNull();
    expect(wayOffEdge(world, start, 900, 1200)).toBeNull();
    expect(wayOffEdge(world, start, 1900, 500)).toBeNull();
    // A side sent somewhere else (a warp) goes there, without a side to come in from.
    world.maps[0].screens[0].exits = { s: { kind: 'warp', to: beach } };
    expect(wayOffEdge(world, start, 900, 1200)).toEqual({ to: beach, via: null });
  });

  it('sends players to another screen as one step (side by side where dropped), and undo brings them back', () => {
    const { game, session, st, beach, start } = withBeach();
    expect(sendPlayers(game, session, ['p0', 'p1'], beach, { at: { x: 900, y: 500 } })).toBe('Ann & Bob → Beach');
    expect([st.positions.p0.screen, st.positions.p1.screen, st.positions.p2.screen]).toEqual([beach.screen, beach.screen, start.screen]);
    expect([st.positions.p0.x, st.positions.p1.x, st.positions.p0.y]).toEqual([815, 985, 500]);
    // They're a party of their own, and viewers follow them.
    expect(st.parties.map((p) => p.members)).toEqual([['p2'], ['p0', 'p1']]);
    expect(st.active).toBe(st.parties[1].id);
    expect(session.actionLog?.at(-1)?.text).toBe('Ann & Bob → Beach');
    undoAction(session, game);
    expect(Object.values(session.worlds!)[0].positions.p0.screen).toBe(start.screen);
  });

  it('joins players to a party (where it stands), and finds the party on a screen', () => {
    const { game, session, st, beach } = withBeach();
    sendPlayers(game, session, ['p0'], beach);
    const [rest, ann] = st.parties;
    expect(partyOn(st, beach.screen)).toBe(ann);
    st.active = rest.id;
    expect(partyOn(st, beach.screen)).toBe(ann);
    expect(joinPartyNow(game, session, ['p1'], ann.id)).toBe('Bob joins Party 2');
    expect(st.positions.p1.screen).toBe(beach.screen);
    expect(joinPartyNow(game, session, ['p0'], ann.id)).toBeNull();
    // Regrouping with a party gathers everyone where it is.
    regroupAll(game, session, ann.id);
    expect(Object.values(st.positions).every((p) => p.screen === beach.screen)).toBe(true);
    expect(session.actionLog?.at(-1)?.text).toBe('Regroup with Party 2');
    // Screen readers hear where everyone is now.
    expect(announce).toHaveBeenLastCalledWith('Everyone is together in Beach');
  });

  it('says which party moved once there are several', () => {
    const { game, session, map } = withBeach();
    expect(stepParty(game, session, 'e')).toBeNull();
    expect(session.actionLog?.at(-1)?.text).toBe('Party east');
    // Screen readers hear where the party is now (it's on the stage, not in the status line).
    expect(announce).toHaveBeenLastCalledWith('Party moved to Beach');
    splitOff(game, session, ['p2']);
    expect(stepParty(game, session, 'w')).toBeNull();
    expect(session.actionLog?.at(-1)?.text).toBe('Party 2 west');
    expect(announce).toHaveBeenLastCalledWith(`Party 2 moved to ${map.screens[0].name}`);
    // No way that side: it says why instead (a toast), and nothing is heard as a move.
    vi.mocked(announce).mockClear();
    expect(stepParty(game, session, 'n')).toBeTruthy();
    expect(announce).not.toHaveBeenCalled();
  });

  it('moves every party on a map screen whose dots are dragged, not only one', () => {
    const { game, session, st, start, beach } = withBeach();
    // Cat walks to the Beach, then Bob on his own (a step doesn't merge parties): two parties there.
    splitOff(game, session, ['p2']);
    stepParty(game, session, 'e');
    splitOff(game, session, ['p1']);
    stepParty(game, session, 'e');
    expect(st.parties.filter((p) => p.members.every((m) => st.positions[m].screen === beach.screen))).toHaveLength(2);
    expect(sendPartiesOn(game, session, beach, start)).toMatch(/^Cat & Bob → /);
    expect(Object.values(st.positions).every((p) => p.screen === start.screen)).toBe(true);
    // One party: it goes by its name, as before.
    splitOff(game, session, ['p0']);
    stepParty(game, session, 'e');
    expect(sendPartiesOn(game, session, beach, start)).toBe(`Party 2 → ${game.worlds![0].maps[0].screens[0].name}`);
  });

  it('leaves a party whose avatars are all hidden where it is (it had no dot to drag)', () => {
    const { game, session, st, start, beach } = withBeach();
    // Cat walks to the Beach and hides; then Ann & Bob walk there too.
    splitOff(game, session, ['p2']);
    stepParty(game, session, 'e');
    st.positions.p2.hidden = true;
    const ab = st.parties.find((p) => p.members.includes('p0'))!;
    st.active = ab.id;
    stepParty(game, session, 'e');
    expect(Object.values(st.positions).every((p) => p.screen === beach.screen)).toBe(true);
    expect(sendPartiesOn(game, session, beach, start)).toMatch(new RegExp(`^${ab.name} → `));
    expect([st.positions.p0.screen, st.positions.p1.screen, st.positions.p2.screen]).toEqual([start.screen, start.screen, beach.screen]);
    // A party with a dot goes whole, a hidden member too.
    st.positions.p1.hidden = true;
    sendPartiesOn(game, session, start, beach);
    expect([st.positions.p0.screen, st.positions.p1.screen]).toEqual([beach.screen, beach.screen]);
  });

  it('doesn’t step under the round’s title card (nobody would see it)', () => {
    const { game, session, st, start, beach } = withBeach();
    session.intro = { stage: 'title', revealed: 0 };
    expect(stepParty(game, session, 'e')).toBe(START_FIRST);
    expect(sendPartiesOn(game, session, start, beach)).toBe(START_FIRST);
    expect(st.positions.p0.screen).toBe(start.screen);
    expect(session.actionLog ?? []).toHaveLength(0);
  });

  it('offers a map screen to the followed party, the selected, each other party and everyone', () => {
    const { session, st } = withBeach();
    splitParty(st, ['p2']);
    const moves: (string | undefined)[] = [];
    const items = moveChoices(session, st, ['p0'], (players, label) => moves.push(label ?? players?.join()));
    expect(items.map((i) => ('label' in i ? i.label : ''))).toEqual(['▶ Move Party 2 here', 'Only the selected (1)', 'Move Party 1 here', 'Everyone here']);
    for (const i of items) if ('onclick' in i) i.onclick();
    expect(moves).toEqual([undefined, '1 selected', 'Party 1', 'Everyone']);
  });
});

describe('objects and items on the RPG stage', () => {
  /** A Potion lying on the start screen, and a pile of 5 gold. */
  function withLoot() {
    const s = setup();
    const screen = s.game.worlds![0].maps[0].screens[0];
    s.game.items = [{ id: 'potion', name: 'Potion', stackable: true }];
    s.game.statFields = [{ ...newStatField('Gold'), currency: true }];
    const potion = { ...newShapeEl('rect'), name: 'Potion', role: { class: 'item' as const, item: 'potion', qty: 1 } };
    const gold = { ...newShapeEl('rect'), name: 'Gold', role: { class: 'currency' as const, field: s.game.statFields[0].id, amount: 5 } };
    screen.slide.elements.push(potion, gold);
    return { ...s, potion, gold };
  }

  it('removes an object as one step (its menu, the Delete key), and says how to bring it back', () => {
    const { game, session, st, potion } = withLoot();
    const said: string[] = [];
    const items = objectMenu(game, session, potion.id, { open: () => said.push('open'), removed: (t) => said.push(t) });
    expect(items.map((i) => ('label' in i ? i.label : 'heading' in i ? i.heading : '—'))).toEqual(['Potion', '🗂 Open its card', '—', '🙈 Hide from viewers', '—', '🗑 Remove']);
    for (const i of items) if ('onclick' in i) i.onclick();
    expect(said).toEqual(['open', 'Removed Potion · Ctrl+Z brings it back']);
    expect(st.objects[potion.id]).toEqual({ shown: false, taken: true });
    undoAction(session, game);
    expect(Object.values(session.worlds!)[0].objects[potion.id]).toEqual({ shown: false });
    expect(removeObject(game, session, 'nothing')).toBeNull();
  });

  /** A menu's lines, as the host reads them ("—" for a line between groups). */
  const lines = (items: MenuEntry[]) => items.map((i) => ('label' in i ? i.label : 'heading' in i ? i.heading : '—'));

  it('lists its card’s buttons first in its menu, in the card’s words and order, then its card, ✎ Edit, Hide and Remove', () => {
    const { game, session, st, potion } = withLoot();
    const run = { live: newLive(), selected: [] };
    expect(objectActs(game, session, potion.id, run, null).map((a) => a.label)).toEqual(['✋ Ann picks up Potion']);
    const closed: string[] = [];
    const items = objectMenu(game, session, potion.id, { run, open: () => closed.push('open'), edit: () => closed.push('edit'), closed: () => closed.push('closed'), removed: () => {} });
    expect(lines(items)).toEqual(['Potion', '✋ Ann picks up Potion', '—', '🗂 Open its card', '✎ Edit', '—', '🙈 Hide from viewers', '—', '🗑 Remove']);
    // (The Delete key takes off only the object whose card is open: its key shows then, not from the stage or list.)
    expect(items.at(-1)).toMatchObject({ danger: true });
    expect(items.at(-1)).not.toHaveProperty('keys');
    const fromCard = objectMenu(game, session, potion.id, { run, open: () => {}, removed: () => {}, cardOpen: true });
    expect(fromCard.at(-1)).toMatchObject({ label: '🗑 Remove', keys: 'Delete', danger: true });
    // Pressed from the menu: as from its card (she picks it up, and its card closes).
    (items[1] as { onclick: () => void }).onclick();
    expect(inventory(session, 'p0').map((e) => e.item)).toEqual(['potion']);
    expect([st.objects[potion.id]?.taken, closed]).toEqual([true, ['closed']]);
    // Bob selected: it's his.
    expect(objectActs(game, session, potion.id, { ...run, selected: ['p1'] }, ['p1'])[0].label).toBe('✋ Bob picks up Potion');
  });

  it('a character’s buttons: 💬 Talk, 🛒 Shop and its actions, ▶ Run all; one that needs someone with nobody here opens its card', () => {
    const { game, session, st } = setup();
    const screen = game.worlds![0].maps[0].screens[0];
    game.statFields = [{ ...newStatField('HP'), id: 'hp' }];
    game.shops = [{ id: 'shop1', name: 'Shop 1', currency: 'gold', stock: [] }];
    const cat = {
      ...newShapeEl('rect'),
      name: 'Old Man',
      role: {
        class: 'npc' as const,
        dialogue: textSlide('Hello'),
        shop: 'shop1',
        actions: [{ id: 'h', do: 'stat' as const, field: 'hp', op: 'add' as const, amount: -1, who: 'ask' as const }, { id: 's', do: 'score' as const, amount: 500, who: 'ask' as const }],
      },
    };
    screen.slide.elements.push(cat);
    const live = newLive();
    const acts = objectActs(game, session, cat.id, { live, selected: [] }, null);
    expect(acts.map((a) => a.label)).toEqual(['💬 Talk', '🛒 Shop', 'HP −1', '+$500', '▶ Run all']);
    expect(acts.some((a) => a.asks)).toBe(false);
    acts[0].run();
    expect(live.overlay).toMatchObject({ kind: 'popup', title: 'Old Man' });
    // Everyone gone from its screen and nobody picked: its actions ask who first (the menu opens its card).
    for (const p of Object.values(st.positions)) p.screen = 'elsewhere';
    const away = objectActs(game, session, cat.id, { live, selected: [] }, null);
    expect(away.filter((a) => a.asks === 'who').map((a) => a.label)).toEqual(['HP −1', '+$500', '▶ Run all']);
    const opened: string[] = [];
    const menu = objectMenu(game, session, cat.id, { run: { live, selected: [] }, open: () => opened.push('card'), removed: () => {} });
    (menu.find((i) => 'label' in i && i.label === 'HP −1') as { onclick: () => void }).onclick();
    expect(opened).toEqual(['card']);
  });

  it('a locked doorway’s Go through asks first (its menu opens its card); its Lock is a small button', () => {
    const { game, session } = setup();
    const map = game.worlds![0].maps[0];
    const door = { ...newShapeEl('rect'), name: 'Gate', role: { class: 'doorway' as const, to: { map: map.id, screen: map.screens[0].id }, locked: true } };
    map.screens[0].slide.elements.push(door);
    const acts = objectActs(game, session, door.id, { live: newLive(), selected: [] }, null);
    expect(acts.map((a) => [a.label, a.asks ?? '', !!a.small])).toEqual([
      ['🚪 Go through (party)', 'locked', false],
      ['🔓 Unlock', '', true],
    ]);
    acts[1].run();
    expect(objectActs(game, session, door.id, { live: newLive(), selected: [] }, null)[0].asks).toBeUndefined();
  });

  it('a secret object’s steps never name it in one window, whichever window they were taken in; its menu there waits on its card', () => {
    const { game, session, st } = setup();
    const screen = game.worlds![0].maps[0].screens[0];
    game.statFields = [{ ...newStatField('HP'), id: 'hp' }];
    const trap = { ...newShapeEl('rect'), name: 'Trap', secret: true, role: { class: 'hazard' as const, actions: [{ id: 'h', do: 'stat' as const, field: 'hp', op: 'add' as const, amount: -1, who: 'all' as const }] } };
    screen.slide.elements.push(trap);
    expect(nameSecret(st, screen, trap)).toBe(true);
    expect(objectSay(trap, true, (n) => `${n}: Zone`)).toEqual(['Trap: Zone', 'A hidden object: Zone']);
    expect(objectSay(trap, false, (n) => `${n}: Zone`)).toEqual(['Trap: Zone', undefined]);
    // What the host made during the show keeps its name (it was made in front of viewers).
    const drawn = { ...newShapeEl('rect'), name: 'Drawing', secret: true };
    addLive(game, session, drawn, 'Add a drawing');
    expect(nameSecret(st, screen, drawn)).toBe(false);
    objectActs(game, session, trap.id, { live: newLive(), selected: [] }, null)[0].run();
    expect([stepText(session.actionLog!.at(-1)!, false), stepText(session.actionLog!.at(-1)!, true)]).toEqual(['Trap: HP −1 (Ann, Bob & Cat)', 'A hidden object: HP −1 (Ann, Bob & Cat)']);
    setObjectShown(game, session, trap.id, true);
    expect(stepText(session.actionLog!.at(-1)!, true)).toBe('Reveal a hidden object');
    expect(st.objects[trap.id]?.shown).toBe(true);
    // Hidden again: it was seen when hidden, so that step may name it.
    setObjectShown(game, session, trap.id, false);
    expect(stepText(session.actionLog!.at(-1)!, true)).toBe('Hide Trap');
    // One window, its card masked: its menu has no buttons of its card's (they're behind its card's 👁 Show).
    // Nor ✎ Edit: the live editor lists it by name, on stream (as on its card, it waits behind 👁 Show).
    const menu = objectMenu(game, session, trap.id, { run: { live: newLive(), selected: [] }, oneWindow: true, alias: '🙈 Hidden object 1', edit: () => {}, open: () => {}, removed: () => {} });
    expect(lines(menu)).toEqual(['🙈 Hidden object 1', '🗂 Open its card', '—', '👁 Reveal to viewers', '—', '🗑 Remove']);
    // (Two windows: viewers don't see the menu.)
    expect(lines(objectMenu(game, session, trap.id, { oneWindow: false, alias: '🙈 Hidden object 1', edit: () => {}, open: () => {}, removed: () => {} }))).toContain('✎ Edit');
  });

  it('in one window, a visible object’s Reveal of a secret one never names it: its card, its menu, the toast, the Log and Redo', () => {
    const { game, session, st } = setup();
    const screen = game.worlds![0].maps[0].screens[0];
    game.media.push({ id: 'm1', name: 'spoiler-final-boss.png', mime: 'image/png', size: 1, kind: 'image' });
    const idol = { ...newShapeEl('rect'), name: 'Golden Idol', secret: true, role: { class: 'item' as const } };
    const boss = { ...newImageEl('m1', 100, 100), secret: true };
    const lever = {
      ...newShapeEl('rect'),
      name: 'Lever',
      role: { class: 'hazard' as const, actions: [{ id: 'r1', do: 'reveal' as const, object: idol.id }, { id: 'r2', do: 'reveal' as const, object: boss.id }] },
    };
    screen.slide.elements.push(idol, boss, lever);
    expect([...hiddenNames(st, screen).values()]).toEqual(['🙈 Hidden object 1']);
    const run = { live: newLive(), selected: [] };
    // Two windows (viewers don't see the panel): named, as before.
    expect(objectActs(game, session, lever.id, run, null).map((a) => a.label)).toEqual(['Reveal Golden Idol (Start)', 'Reveal spoiler-final-boss.png (Start)', '▶ Run all']);
    // One window: what the panel calls it, else "a hidden object", on its card and in its menu.
    const acts = objectActs(game, session, lever.id, run, null, true);
    expect(acts.map((a) => a.label)).toEqual(['Reveal 🙈 Hidden object 1 (Start)', 'Reveal a hidden object (Start)', '▶ Run all']);
    const menu = objectMenu(game, session, lever.id, { run, oneWindow: true, open: () => {}, removed: () => {} });
    expect(lines(menu).slice(0, 4)).toEqual(['Lever', 'Reveal 🙈 Hidden object 1 (Start)', 'Reveal a hidden object (Start)', '▶ Run all']);
    expect(acts[0].run().text).toBe('Lever: Reveal a hidden object (Start)');
    expect(st.objects[idol.id]?.shown).toBe(true);
    const step = session.actionLog!.at(-1)!;
    expect([stepText(step, false), stepText(step, true)]).toEqual(['Lever: Reveal Golden Idol (Start)', 'Lever: Reveal a hidden object (Start)']);
    // Hidden again with Ctrl+Z: Redo never names it in one window either.
    undoAction(session);
    expect(session.worlds![game.worlds![0].id].objects[idol.id]?.shown).toBeFalsy();
    expect(stepText(session.actionRedo!.at(-1)!, true)).toBe('Lever: Reveal a hidden object (Start)');
    // ▶ Run all: one step, quiet for both.
    objectActs(game, session, lever.id, run, null, true)[2].run();
    expect(stepText(session.actionLog!.at(-1)!, true)).toBe('Lever: Reveal a hidden object (Start), Reveal a hidden object (Start)');
    expect(stepText(session.actionLog!.at(-1)!, false)).toBe('Lever: Reveal Golden Idol (Start), Reveal spoiler-final-boss.png (Start)');
    // Revealed: no secret any more, so it's named.
    expect(objectActs(game, session, lever.id, run, null, true)[0].label).toBe('Reveal Golden Idol (Start)');
  });

  it('offers no Reveal for what viewers never see (a no-go area, an arrival point, a hotspot)', () => {
    const { game, session } = withLoot();
    const wall = { ...newShapeEl('rect'), name: 'Wall', role: { class: 'blocker' as const } };
    game.worlds![0].maps[0].screens[0].slide.elements.push(wall);
    const items = objectMenu(game, session, wall.id, { open: () => {}, removed: () => {} });
    expect(items.map((i) => ('label' in i ? i.label : 'heading' in i ? i.heading : '—'))).toEqual(['Wall', '🗂 Open its card', '—', '🗑 Remove']);
  });

  it('lets a player pick up an item or a pile of currency dropped on them', () => {
    const { game, session, st, potion, gold } = withLoot();
    expect(pickUp(game, session, st, potion, 'p1')).toBe('Bob picks up Potion');
    expect(inventory(session, 'p1').map((e) => [e.item, e.qty])).toEqual([['potion', 1]]);
    // It says what they got, and the object's name when that's something else.
    const chest = { ...potion, id: 'chest', name: 'Treasure', role: { ...potion.role, qty: 3 } };
    expect(pickUp(game, session, st, chest, 'p1')).toBe('Bob picks up 3 × Potion (Treasure)');
    game.statFields![0].symbol = '🪙';
    expect(pickUp(game, session, st, gold, 'p1')).toBe('Bob picks up 🪙5 (Gold)');
    expect(statNumber(game, session, 'p1', currencyFields(game)[0])).toBe(5);
    expect(st.objects[gold.id].taken).toBe(true);
    undoAction(session, game);
    expect(statNumber(game, session, 'p1', currencyFields(game)[0])).toBe(0);
  });

  it('picks up only the currency that fits under the max, and leaves the rest', () => {
    const { game, session, st, gold } = withLoot();
    const f = currencyFields(game)[0];
    f.max = 3;
    expect(pickUp(game, session, st, gold, 'p1')).toContain('the most they can carry');
    expect(statNumber(game, session, 'p1', f)).toBe(3);
    expect(st.objects[gold.id]).toEqual({ amount: 2 });
    expect(pickUp(game, session, st, gold, 'p1')).toContain('can’t carry any more');
    expect(st.objects[gold.id]).toEqual({ amount: 2 });
    pickUp(game, session, st, gold, 'p0');
    expect(statNumber(game, session, 'p0', f)).toBe(2);
    expect(st.objects[gold.id].taken).toBe(true);
  });

  it('leaves a pile of currency where it is when the game has no currency to give', () => {
    const { game, session, st, gold } = withLoot();
    game.statFields = [];
    gold.role.field = undefined as never;
    expect(pickUp(game, session, st, gold, 'p1')).toBe('Gold gives no currency: add one in 📊 Stats & Items');
    expect(st.objects[gold.id]).toBeUndefined();
  });

  it('gives an item to another player, or drops it where it was dragged on the stage', () => {
    const { game, session, st, potion } = withLoot();
    pickUp(game, session, st, potion, 'p0');
    pickUp(game, session, st, { ...potion, id: 'potion2' }, 'p0');
    const entry = inventory(session, 'p0')[0];
    expect(entry.qty).toBe(2);
    expect(giveEntry(game, session, 'p0', 'p1', entry.id, 1)).toBe('Ann gives Potion to Bob');
    expect(giveEntry(game, session, 'p0', 'p0', entry.id, 1)).toBeNull();
    expect(dropEntry(game, session, 'p0', entry.id, 1, { x: 200, y: 200 })).toBe('Ann drops Potion');
    expect(inventory(session, 'p0')).toEqual([]);
    const dropped = st.added[st.positions.p0.screen].at(-1)!;
    // Centred where it was dropped, as an item that can be picked up again.
    expect([dropped.x + dropped.w / 2, dropped.y + dropped.h / 2]).toEqual([200, 200]);
    expect(dropped.role).toEqual({ class: 'item', item: 'potion', qty: 1 });
    expect(score(session, 'p0')).toBe(0);
  });
});

describe('splitting off', () => {
  it('won’t make one party of everyone, or of players standing in different places', () => {
    const { game, session, beach } = withBeach();
    expect(splitOff(game, session, ['p0', 'p1', 'p2'])).toBe('That’s everyone: select only the ones who split off');
    sendPlayers(game, session, ['p0'], beach);
    const st = Object.values(session.worlds!)[0];
    expect(st.parties).toHaveLength(2);
    expect(splitOff(game, session, ['p0', 'p1', 'p2'])).toBe('That’s everyone: 🤝 Regroup (G) brings everyone together');
    expect(splitOff(game, session, ['p0', 'p1'])).toBe('They aren’t all in one place: split off players standing together (or move them together first)');
    expect(st.parties).toHaveLength(2);
    expect(splitOff(game, session, ['p1'])).toBeNull();
    expect(st.parties.map((p) => p.members)).toEqual([['p2'], ['p0'], ['p1']]);
  });
});

describe('dragging a selection together on the RPG stage', () => {
  it('moves everything by the same amount, no further than keeps all of it on the screen', () => {
    const ann = avatarRange(300, 500);
    const chest = objectRange(1500, 600, 200, 150);
    expect(groupDelta([ann, chest], 100, -50)).toEqual({ dx: 100, dy: -50 });
    // Right: the chest reaches the edge first (1920 − 200 − 1500 = 220), and Ann stops with it.
    expect(groupDelta([ann, chest], 400, 0)).toEqual({ dx: 220, dy: 0 });
    // Left and up: Ann reaches the edge first (75 from it).
    expect(groupDelta([ann, chest], -1000, -1000)).toEqual({ dx: -225, dy: -425 });
    // Down, with the stats strip from y 900: Ann stays clear of it (900 − 75 − 500 = 325), the chest could go 330.
    expect(groupDelta([avatarRange(300, 500, 0, 900), chest], 0, 600)).toEqual({ dx: 0, dy: 325 });
    // One already past an edge isn't pulled back, and only can't go further out.
    const off = objectRange(-50, 100, 200, 100);
    expect(groupDelta([off, ann], -30, 0)).toEqual({ dx: 0, dy: 0 });
    expect(groupDelta([off, ann], 40, 0)).toEqual({ dx: 40, dy: 0 });
  });

  it('moves players and objects as one step, named after them all', () => {
    const { game, session, st } = setup();
    const chest = { ...newShapeEl('rect'), name: 'Chest', x: 800, y: 300 };
    addLive(game, session, chest, 'Chest');
    const before = { ann: { ...st.positions.p0 }, bob: { ...st.positions.p1 } };
    const steps = session.actionLog?.length ?? 0;
    expect(moveGroup(game, session, { p0: { x: 400, y: 600 }, p1: { x: 500, y: 650 } }, { [chest.id]: { x: 900, y: 350 } })).toBe('Move Ann, Bob & Chest');
    expect(session.actionLog).toHaveLength(steps + 1);
    expect(session.actionLog?.at(-1)?.text).toBe('Move Ann, Bob & Chest');
    expect([st.positions.p0.x, st.positions.p0.y, st.positions.p1.x, st.positions.p1.y]).toEqual([400, 600, 500, 650]);
    expect([st.objects[chest.id].x, st.objects[chest.id].y]).toEqual([900, 350]);
    undoAction(session, game);
    const back = Object.values(session.worlds!)[0];
    expect([back.positions.p0.x, back.positions.p0.y, back.positions.p1.x, back.positions.p1.y]).toEqual([before.ann.x, before.ann.y, before.bob.x, before.bob.y]);
    expect(back.objects[chest.id]?.x).toBeUndefined();
    // Nothing that's there: no step.
    expect(moveGroup(game, session, { nobody: { x: 1, y: 1 } }, {})).toBeNull();
  });

  it('records no step for a move that moved nothing, and names only what moved', () => {
    const { game, session, st } = setup();
    const chest = { ...newShapeEl('rect'), name: 'Chest', x: 800, y: 300 };
    addLive(game, session, chest, 'Chest');
    const steps = session.actionLog?.length ?? 0;
    const ann = st.positions.p0;
    // A group held at an edge (dropped where it stood), and an object dropped where it was: nothing to undo.
    expect(moveGroup(game, session, { p0: { x: ann.x, y: ann.y } }, { [chest.id]: { x: 800, y: 300 } })).toBeNull();
    expect(moveObject(game, session, chest.id, { x: 800, y: 300 })).toBe(false);
    expect(session.actionLog).toHaveLength(steps);
    expect(st.objects[chest.id]).toBeUndefined();
    expect(moveObject(game, session, chest.id, { x: 860, y: 300 })).toBe(true);
    expect(session.actionLog?.at(-1)?.text).toBe('Move Chest');
    expect(moveGroup(game, session, { p0: { x: ann.x, y: ann.y }, p1: { x: 100, y: 500 } }, { [chest.id]: { x: 860, y: 300 } })).toBe('Move Bob');
  });

  it('keeps a long label short, and never names a hidden object in one window’s words', () => {
    expect(shortList(['Ann', 'Bob', 'Cy', 'Dee'])).toBe('Ann, Bob, Cy & Dee');
    expect(shortList(['Ann', 'Bob', 'Cy', 'Dee', 'Eve', 'Fay', 'Gus', 'Hal'])).toBe('Ann, Bob, Cy & 5 more');
    const { game, session, st } = setup();
    // (Added live: hidden until revealed.)
    const chest = { ...newShapeEl('rect'), name: 'Chest', x: 800, y: 300 };
    const sword = { ...newShapeEl('rect'), name: 'Sword', x: 400, y: 300 };
    addLive(game, session, chest, 'Chest');
    addLive(game, session, sword, 'Sword');
    st.objects[sword.id] = { shown: true };
    expect(moveGroup(game, session, { p0: { x: 300, y: 600 } }, { [chest.id]: { x: 900, y: 300 }, [sword.id]: { x: 500, y: 300 } })).toBe('Move Ann, Chest & Sword');
    const step = session.actionLog!.at(-1)!;
    expect([stepText(step, false), stepText(step, true)]).toEqual(['Move Ann, Chest & Sword', 'Move Ann, Sword & a hidden object']);
    moveObject(game, session, chest.id, { x: 950, y: 300 });
    expect(stepText(session.actionLog!.at(-1)!, true)).toBe('Move a hidden object');
    expect(removeObject(game, session, chest.id, true)).toBe('Removed a hidden object · Ctrl+Z brings it back');
    expect(stepText(session.actionLog!.at(-1)!, true)).toBe('Remove a hidden object');
    undoAction(session, game);
    expect(removeObject(game, session, chest.id)).toBe('Removed Chest · Ctrl+Z brings it back');
  });

  it('says what is selected, one window counting the hidden ones; a hidden object’s menu says its alias there', () => {
    const { game, session, st } = setup();
    const screen = game.worlds![0].maps[0].screens[0];
    const chest = { ...newShapeEl('rect'), name: 'Chest', role: { class: 'item' as const } };
    const gold = { ...newShapeEl('rect'), name: 'Gold pile', role: { class: 'currency' as const } };
    const arrival = { ...newShapeEl('rect'), name: 'Arrival point', role: { class: 'spawn' as const } };
    addLive(game, session, chest, 'Chest');
    screen.slide.elements.push(gold, arrival);
    expect(selectionWords(game, session, ['p0', 'p1'], [gold.id, chest.id], false)).toBe('Ann, Bob · Gold pile, Chest');
    expect(selectionWords(game, session, ['p0'], [gold.id, chest.id], true)).toBe('Ann · Gold pile, 1 hidden object');
    expect(selectionWords(game, session, [], [], true)).toBe('');
    // Players sent elsewhere go without the objects: the toast says what stays (one window: not a hidden one's name).
    const start = screen.name;
    expect(staysWords(game, session, [gold.id], false)).toBe(`Gold pile stays on ${start}`);
    expect(staysWords(game, session, [gold.id, chest.id], true)).toBe(`Gold pile & a hidden object stay on ${start}`);
    expect(staysWords(game, session, [], true)).toBe('');
    // The secret ones are numbered; what viewers never see anyway, or the host added during the show, keeps its name.
    const ring = { ...newShapeEl('rect'), name: 'Ring', secret: true, role: { class: 'item' as const } };
    screen.slide.elements.push(ring);
    expect([...hiddenNames(st, screen).entries()]).toEqual([[ring.id, '🙈 Hidden object 1']]);
    const heading = (oneWindow: boolean) => objectMenu(game, session, ring.id, { open: () => {}, removed: () => {}, oneWindow, alias: '🙈 Hidden object 1' })[0];
    expect([heading(false), heading(true)]).toEqual([{ heading: 'Ring' }, { heading: '🙈 Hidden object 1' }]);
  });

  it('selects everything here a box would catch, and knows the objects a press draws a box on', () => {
    const { game, session } = setup();
    const screen = game.worlds![0].maps[0].screens[0];
    const ref = { map: game.worlds![0].maps[0].id, screen: screen.id };
    const sword = { ...newShapeEl('rect'), name: 'Sword', role: { class: 'item' as const } };
    const rug = { ...newShapeEl('rect'), name: 'Rug', locked: true, role: { class: 'item' as const } };
    const door = { ...newShapeEl('rect'), name: 'Door', role: { class: 'doorway' as const } };
    const chest = { ...newShapeEl('rect'), name: 'Chest', secret: true, role: { class: 'item' as const } };
    screen.slide.elements.push(sword, rug, door, chest);
    expect(everythingOn(game, session, ref, false)).toEqual({ players: ['p0', 'p1', 'p2'], objects: [sword.id, chest.id] });
    // One window: the secret Chest isn't on the stage.
    expect(everythingOn(game, session, ref, true).objects).toEqual([sword.id]);
    expect(fillsScreen({ x: 0, y: 0, w: 1920, h: 1080, rotation: 0 })).toBe(true);
    expect(fillsScreen({ x: 10, y: 0, w: 1920, h: 1080, rotation: 0 })).toBe(false);
    expect([bigObject({ w: 960, h: 540 }), bigObject({ w: 900, h: 300 })]).toEqual([true, false]);
  });
});
