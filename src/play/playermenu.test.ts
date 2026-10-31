import { describe, expect, it } from 'vitest';
import { newGame, newRound, type Game, type Session } from '../lib/model';
import { newBoardGameRound } from '../lib/boardgame';
import { newRpgRound, splitParty } from '../lib/rpg';
import { goToRound, newSession } from '../lib/session';
import type { MenuEntry } from '../lib/menustate.svelte';
import { partnerUpVerbs, playerMenu, revealVerbs, rosterMenu, verdictVerbs, type PlayerMenuHost, type SeatPhone } from './playermenu';

/** A game of three players on the round `make` makes, being played, and what the menu asked the host's screen to do. */
function playing(make: (game: Game) => Game['rounds'][number], selected: string[] = []) {
  const game = newGame();
  game.players = ['Ann', 'Bob', 'Cat'].map((name, i) => ({ id: 'abc'[i], name, color: '#e6194b' }));
  game.rounds = [make(game)];
  const session: Session = newSession(game);
  goToRound(session, game, 0);
  const asked: string[] = [];
  const host: PlayerMenuHost = {
    game,
    session,
    selected,
    toggle: (id) => asked.push(`toggle ${id}`),
    setScore: (id) => asked.push(`score ${id}`),
    sendTo: (players, label) => asked.push(`send ${players.join()} as ${label}`),
    openCard: (id) => asked.push(`card ${id}`),
  };
  return { game, session, host, asked };
}
const labels = (items: MenuEntry[]) => items.map((i) => ('label' in i ? i.label : 'heading' in i ? i.heading : '—'));
const click = (items: MenuEntry[], label: string | RegExp) => {
  const i = items.find((x) => 'label' in x && (typeof label === 'string' ? x.label === label : label.test(x.label)));
  if (!i || !('onclick' in i)) throw new Error(`no ${label}`);
  i.onclick();
};

describe('a player’s right-click menu', () => {
  it('on a Jeopardy board: select, make the picker, set the score', () => {
    const { host, session, asked } = playing(() => newRound('Jeopardy!'));
    const items = playerMenu(host, 'b');
    expect(labels(items)).toEqual(['Bob', 'Select', '★ Make the picker', '✎ Set the score…']);
    click(items, '★ Make the picker');
    click(items, '✎ Set the score…');
    expect(session.currentPickerId).toBe('b');
    expect(asked).toEqual(['score b']);
    expect(labels(playerMenu(host, 'b'))).toContain('★ No picker');
  });

  it('shows the keys that do the same: their number to select them, P then it for the picker', () => {
    const { host } = playing(() => newRound('Jeopardy!'));
    const keys = (items: MenuEntry[]) => items.map((i) => ('label' in i ? (i.keys ?? '') : ''));
    expect(keys(playerMenu(host, 'c'))).toEqual(['', '3', 'P, 3', '']);
  });

  it('in an RPG round: their avatar, their party, sending them, their card; several selected move together', () => {
    const { host, session, asked } = playing((game) => newRpgRound(game), ['a', 'b']);
    const st = Object.values(session.worlds!)[0];
    splitParty(st, ['c']);
    expect(labels(playerMenu(host, 'c'))).toEqual([
      'Cat', 'Select', '✎ Set the score…', '—', '📺 Show their sheet', '💫 Knocked out', '🫥 Hide their avatar', '—', '✂ Split off (own party)', '🗺 Send to…',
      '👥 Join Party 1', '🗂 Open their card',
    ]);
    // Cat's party is just her: splitting off does nothing more.
    expect(playerMenu(host, 'c').find((i) => 'label' in i && i.label.startsWith('✂'))).toMatchObject({ disabled: true });
    const ann = playerMenu(host, 'a');
    expect(labels(ann).slice(8)).toEqual(['✂ Split off the 2 selected', '🗺 Send the 2 selected to…', '👥 Join Party 2 (the 2 selected)', '🗂 Open their card']);
    click(ann, /^🗺/);
    click(ann, '🗂 Open their card');
    expect(asked).toEqual(['send a,b as the 2 selected', 'card a']);
    click(ann, /^👥/);
    expect(st.parties.map((p) => p.members)).toEqual([['c', 'a', 'b']]);
    click(playerMenu(host, 'a'), '🫥 Hide their avatar');
    expect(Object.values(session.worlds!)[0].positions.a.hidden).toBe(true);
    expect(labels(playerMenu(host, 'a'))).toContain('🫥 Show their avatar');
  });

  it('in a board game: their sheet, their turn, sending them away, then their card', () => {
    const round = newBoardGameRound('Board');
    round.zones.push({ id: 'shadow', name: 'Shadow Realm', slide: { background: {}, elements: [] } });
    const { host, session } = playing(() => round);
    const items = playerMenu(host, 'c');
    expect(labels(items)).toEqual([
      'Cat', 'Select', '✎ Set the score…', '—', '📺 Show their sheet', '🎲 Make it their turn', '🌀 Send to Shadow Realm', '🏁 Send to Start', '🗂 Open their card',
    ]);
    click(items, '🎲 Make it their turn');
    click(items, '🌀 Send to Shadow Realm');
    const bs = session.boardgames![round.id];
    expect(bs.order[bs.turn]).toBe('c');
    expect(bs.positions.c).toEqual({ zone: 'shadow' });
  });
});

describe('a player’s menu starts with this moment’s verbs', () => {
  /** A clue's ✔ / ✘ as the host panel gives them: Ann answering (selected), Bob too, Cat's not hers to judge. */
  const verdicts = (asked: string[]) => (id: string) =>
    verdictVerbs(id === 'c' ? 'Cat' : id === 'a' ? 'Ann' : 'Bob', {
      kind: 'clue',
      gets: id === 'c' ? null : '+$400',
      loses: id === 'c' ? null : '−$400',
      why: id === 'c' ? 'Only Bob plays this Daily Double' : undefined,
      marked: id === 'b' ? true : undefined,
      enter: id === 'a',
      right: () => asked.push(`right ${id}`),
      wrong: () => asked.push(`wrong ${id}`),
    });

  it('the verbs first, a line, then Select · ★ Make the picker · ✎ Set the score… at the same depth for everyone', () => {
    const { host, asked } = playing(() => newRound('Jeopardy!'));
    const h = { ...host, verbs: verdicts(asked) };
    expect(labels(playerMenu(h, 'a'))).toEqual(['Ann', '✔ Right +$400', '✘ Wrong −$400', '—', 'Select', '★ Make the picker', '✎ Set the score…']);
    // (The keys: Enter and Shift+Enter for the one selected; their number to select them.)
    expect(playerMenu(h, 'a').slice(1, 3).map((i) => ('keys' in i ? i.keys : ''))).toEqual(['⏎', '⇧⏎']);
    // Bob's ✔ is greyed (he has it); Cat's pair is greyed, without points, saying why.
    const bob = playerMenu(h, 'b');
    expect([bob[1], bob[2]].map((i) => ('disabled' in i ? !!i.disabled : null))).toEqual([true, false]);
    const cat = playerMenu(h, 'c');
    expect(labels(cat).slice(1, 3)).toEqual(['✔ Right', '✘ Wrong']);
    expect(cat[1]).toMatchObject({ disabled: true, hint: 'Only Bob plays this Daily Double' });
    for (const id of ['a', 'b', 'c']) expect(labels(playerMenu(h, id)).indexOf('Select')).toBe(4);
    click(playerMenu(h, 'a'), '✔ Right +$400');
    click(playerMenu(h, 'b'), '✘ Wrong −$400');
    expect(asked).toEqual(['right a', 'wrong b']);
  });

  it('a partner clue’s pair reads ✔ Got it / ✘ Missed with their share; a steal’s ✔ Stole it', () => {
    const v = (kind: 'partner' | 'steal') => labels(verdictVerbs('Ann', { kind, gets: '+$200', loses: '$0', right: () => {}, wrong: () => {} }));
    expect(v('partner')).toEqual(['✔ Got it +$200', '✘ Missed $0']);
    expect(v('steal')).toEqual(['✔ Stole it +$200', '✘ Wrong $0']);
  });

  it('their phone’s seat while the room is up, then ⛔ Kick and 🗑 Delete player, red and last (both ask)', () => {
    const { host, asked } = playing(() => newRound('Jeopardy!'));
    const seat = (on: boolean, letBack = false): SeatPhone => ({
      on,
      canFree: true,
      letBack,
      free: () => asked.push('free'),
      letIn: () => asked.push('let back'),
      kick: () => asked.push('kick'),
    });
    const h = { ...host, verbs: verdicts(asked), phone: (id: string) => seat(id === 'a', id === 'b'), remove: (id: string) => asked.push(`delete ${id}`) };
    const ann = playerMenu(h, 'a');
    expect(labels(ann)).toEqual([
      'Ann', '✔ Right +$400', '✘ Wrong −$400', '—', 'Select', '★ Make the picker', '✎ Set the score…', '—', '📱 Free seat (new phone)', '↩ Let back', '—', '⛔ Kick from phone (2 min)…', '🗑 Delete player…',
    ]);
    expect(ann.slice(-2)).toMatchObject([{ danger: true }, { danger: true }]);
    // No phone on Bob's seat (kicked a moment ago): Free seat and Kick greyed, ↩ Let back offered. Same places.
    const bob = playerMenu(h, 'b');
    expect(labels(bob)).toEqual(labels(ann).map((l, i) => (i === 0 ? 'Bob' : l)));
    expect(bob.filter((i) => 'disabled' in i && i.disabled).map((i) => ('label' in i ? i.label : ''))).toEqual(['✔ Right +$400', '📱 Free seat (new phone)', '⛔ Kick from phone (2 min)…']);
    for (const l of ['📱 Free seat (new phone)', '⛔ Kick from phone (2 min)…', '🗑 Delete player…']) click(ann, l);
    click(bob, '↩ Let back');
    expect(asked).toEqual(['free', 'kick', 'delete a', 'let back']);
    // The room out of reach: all three greyed, saying so.
    const down = playerMenu({ ...h, phone: (id: string) => ({ ...seat(id === 'a'), down: true }) }, 'a').filter((i) => 'label' in i && /📱|↩|⛔/.test(i.label));
    expect(down.every((i) => 'disabled' in i && i.disabled && i.hint === 'The buzzer room isn’t reachable right now')).toBe(true);
    // No room: no phone group, the delete still last.
    expect(labels(playerMenu({ ...h, phone: () => null }, 'a')).slice(-3)).toEqual(['✎ Set the score…', '—', '🗑 Delete player…']);
  });

  it('PARTNER UP!: who picked it, then the partner, by their number; what can’t be greyed with why', () => {
    const { session, host } = playing(() => newRound('Jeopardy!'));
    const done: string[] = [];
    const act = { picked: (id: string) => done.push(`picked ${id}`), partner: (id: string) => done.push(`partner ${id}`), spinning: false };
    expect(partnerUpVerbs(session, 'a', act)).toEqual([]);
    session.phase = 'clue';
    session.partner = { clue: 'x', stage: 'pick' } as NonNullable<Session['partner']>;
    const before = partnerUpVerbs(session, 'b', act);
    expect(labels(before)).toEqual(['★ Bob picked it', '🤝 Make Bob the partner']);
    expect(before).toMatchObject([{ keys: '2' }, { disabled: true, hint: 'Who picked it comes first' }]);
    session.partner.pickerId = 'a';
    expect(partnerUpVerbs(session, 'a', act)).toMatchObject([{ disabled: true }, { disabled: true }]);
    const bob = partnerUpVerbs(session, 'b', act);
    expect(bob).toMatchObject([{ disabled: false }, { disabled: false, keys: '2' }]);
    click(bob, '🤝 Make Bob the partner');
    expect(done).toEqual(['partner b']);
    expect(partnerUpVerbs(session, 'c', { ...act, spinning: true })[1]).toMatchObject({ disabled: true, hint: 'Still spinning: wait for it to land' });
    // In the menu, the same two for everyone, then the line.
    const h = { ...host, verbs: (id: string) => partnerUpVerbs(session, id, act) };
    for (const id of ['a', 'b', 'c']) expect(labels(playerMenu(h, id)).indexOf('—')).toBe(3);
  });

  it('the Final’s reveals: Spotlight, Show wager, ✔ Right C / ✘ Wrong X; greyed for one who sits it out', () => {
    const { session } = playing(() => newRound('Jeopardy!'));
    const act = { spotlight: () => {}, showAnswer: () => {}, showWager: () => {}, judge: () => {} };
    session.phase = 'final';
    session.finalStep = 'reveal';
    session.final = { players: ['a', 'b'], order: ['a', 'b'], wagers: {}, shown: {}, current: 'a' } as unknown as NonNullable<Session['final']>;
    const ann = revealVerbs(session, 'a', act);
    expect(labels(ann)).toEqual(['🔦 Spotlight', 'Show wager', '✔ Right', '✘ Wrong']);
    expect(ann.map((i) => ('keys' in i ? (i.keys ?? '') : ''))).toEqual(['1', '', 'C', 'X']);
    const cat = revealVerbs(session, 'c', act);
    expect(labels(cat)).toEqual(labels(ann));
    expect(cat.every((i) => 'disabled' in i && i.disabled)).toBe(true);
    expect(cat[0]).toMatchObject({ hint: 'Cat sits out this Final' });
  });
});

describe('a ▶ Play row’s menu (before the game)', () => {
  const asked: string[] = [];
  const acts = {
    rename: () => asked.push('rename'),
    color: () => asked.push('color'),
    picture: () => asked.push('picture'),
    startScore: () => asked.push('score'),
    move: (d: -1 | 1) => asked.push(`move ${d}`),
    remove: () => asked.push('remove'),
  };
  const keys = (items: MenuEntry[]) => items.map((i) => ('label' in i ? (i.keys ?? '') : ''));

  it('renames (F2), colors, picture, start score, moves (Alt+↑/↓), then deletes, last and red', () => {
    const items = rosterMenu('Bob', 1, 3, 'player', acts);
    expect(labels(items)).toEqual(['Bob', '✎ Rename', '🎨 Color…', '🖼 Picture…', '± Start score…', '▲ Move up', '▼ Move down', '—', '🗑 Delete player']);
    expect(keys(items)).toEqual(['', 'F2', '', '', '', 'Alt+↑', 'Alt+↓', '', '']);
    expect(items.at(-1)).toMatchObject({ danger: true });
    for (const l of ['✎ Rename', '🎨 Color…', '🖼 Picture…', '± Start score…', '▲ Move up', '▼ Move down', '🗑 Delete player']) click(items, l);
    expect(asked).toEqual(['rename', 'color', 'picture', 'score', 'move -1', 'move 1', 'remove']);
  });

  it('greys the way it can’t move at an end, and leaves out what this list has none of', () => {
    const top = rosterMenu('Ann', 0, 2, 'team', { ...acts, picture: undefined, startScore: undefined });
    expect(labels(top)).toEqual(['Ann', '✎ Rename', '🎨 Color…', '▲ Move up', '▼ Move down', '—', '🗑 Delete team']);
    expect(top.find((i) => 'label' in i && i.label === '▲ Move up')).toMatchObject({ disabled: true });
    expect(top.find((i) => 'label' in i && i.label === '▼ Move down')).toMatchObject({ disabled: false });
    expect(rosterMenu('Cat', 1, 2, 'player', acts).find((i) => 'label' in i && i.label === '▼ Move down')).toMatchObject({ disabled: true });
  });
});
