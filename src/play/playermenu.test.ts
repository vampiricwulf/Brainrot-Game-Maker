import { describe, expect, it } from 'vitest';
import { newGame, newRound, type Game, type Session } from '../lib/model';
import { newBoardGameRound } from '../lib/boardgame';
import { newRpgRound, splitParty } from '../lib/rpg';
import { goToRound, newSession } from '../lib/session';
import type { MenuEntry } from '../lib/menustate.svelte';
import { playerMenu, type PlayerMenuHost } from './playermenu';

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

  it('in an RPG round: their avatar, their party, sending them, their card; several selected move together', () => {
    const { host, session, asked } = playing((game) => newRpgRound(game), ['a', 'b']);
    const st = Object.values(session.worlds!)[0];
    splitParty(st, ['c']);
    expect(labels(playerMenu(host, 'c'))).toEqual([
      'Cat', 'Select', '✎ Set the score…', '📺 Show their sheet', '💫 Knocked out', '🫥 Hide their avatar', '—', '✂ Split off (own party)', '🗺 Send to…',
      '👥 Join Party 1', '🗂 Open their card',
    ]);
    // Cat's party is just her: splitting off does nothing more.
    expect(playerMenu(host, 'c').find((i) => 'label' in i && i.label.startsWith('✂'))).toMatchObject({ disabled: true });
    const ann = playerMenu(host, 'a');
    expect(labels(ann).slice(7)).toEqual(['✂ Split off the 2 selected', '🗺 Send the 2 selected to…', '👥 Join Party 2 (the 2 selected)', '🗂 Open their card']);
    click(ann, /^🗺/);
    click(ann, '🗂 Open their card');
    expect(asked).toEqual(['send a,b as the 2 selected', 'card a']);
    click(ann, /^👥/);
    expect(st.parties.map((p) => p.members)).toEqual([['c', 'a', 'b']]);
    click(playerMenu(host, 'a'), '🫥 Hide their avatar');
    expect(Object.values(session.worlds!)[0].positions.a.hidden).toBe(true);
    expect(labels(playerMenu(host, 'a'))).toContain('🫥 Show their avatar');
  });

  it('in a board game: their turn, their card, and sending them away', () => {
    const round = newBoardGameRound('Board');
    round.zones.push({ id: 'shadow', name: 'Shadow Realm', slide: { background: {}, elements: [] } });
    const { host, session } = playing(() => round);
    const items = playerMenu(host, 'c');
    expect(labels(items)).toEqual([
      'Cat', 'Select', '✎ Set the score…', '📺 Show their sheet', '🎲 Make it their turn', '🗂 Open their card', '—', '🌀 Send to Shadow Realm', '🏁 Send to Start',
    ]);
    click(items, '🎲 Make it their turn');
    click(items, '🌀 Send to Shadow Realm');
    const bs = session.boardgames![round.id];
    expect(bs.order[bs.turn]).toBe('c');
    expect(bs.positions.c).toEqual({ zone: 'shadow' });
  });
});
