import { describe, expect, it } from 'vitest';
import { KICK_BLOCK_MS } from '../lib/buzzproto';
import { phoneWord, waitingFor, whoJoined } from './phonewords';

const players = [
  { id: 'a', name: 'Ann' },
  { id: 'b', name: 'Bob' },
  { id: 'c', name: '  ' },
];

describe('the ▶ Play bar’s room line', () => {
  it('counts who joined, and names who it’s waiting for (a blank name as it plays)', () => {
    const phones = [
      { seatId: 'a', connected: true },
      { seatId: 'b', connected: false },
      { seatId: null, connected: true },
    ];
    expect(whoJoined(players, phones)).toEqual({ joined: '1 of 3 joined', waiting: ['Bob', 'Player 3'] });
    expect(whoJoined(players, [])).toEqual({ joined: '0 of 3 joined', waiting: ['Ann', 'Bob', 'Player 3'] });
    expect(whoJoined(players, ['a', 'b', 'c'].map((seatId) => ({ seatId, connected: true })))).toEqual({ joined: '3 of 3 joined', waiting: [] });
  });

  it('with Teams on: the people on teams, and the teams nobody is on yet', () => {
    const phones = [
      { seatId: 'a', connected: true, member: 'm1' },
      { seatId: 'a', connected: true, member: 'm2' },
      { seatId: 'b', connected: false, member: 'm3' },
      // (On a team that isn't in the game any more: not counted.)
      { seatId: 'z', connected: true, member: 'm4' },
    ];
    expect(whoJoined(players, phones, true)).toEqual({ joined: '2 people on 1 of 3 teams', waiting: ['Bob', 'Team 3'] });
    expect(whoJoined(players.slice(0, 1), phones.slice(1, 2), true).joined).toBe('1 person on 1 of 1 teams');
  });

  it('says who it’s waiting for in a few names, then how many more', () => {
    expect(waitingFor([])).toBe('');
    expect(waitingFor(['Bob', 'Cat'])).toBe('waiting for Bob, Cat');
    expect(waitingFor(['Ann', 'Bob', 'Cat'])).toBe('waiting for Ann, Bob, Cat');
    expect(waitingFor(['Ann', 'Bob', 'Cat', 'Dee', 'Eve'])).toBe('waiting for Ann, Bob, Cat +2 more');
  });
});

describe('a 👥 row’s phone, in words', () => {
  const now = 1_000_000;
  const word = (s: Parameters<typeof phoneWord>[0]) => phoneWord(s, now).text;

  it('says in, waiting, lost and since when, or kicked and how long ago', () => {
    expect(word({ online: true, phone: 'in' })).toBe('📱 in');
    expect(phoneWord({ online: true, phone: 'in' }, now).tone).toBe('good');
    expect(word({ online: true, phone: null })).toBe('📱 waiting');
    expect(word({ online: true, phone: 'away', awaySince: now - 12_000 })).toBe('📵 lost 0:12');
    expect(word({ online: true, phone: 'away' })).toBe('📵 lost');
    expect(phoneWord({ online: true, phone: 'away', awaySince: now - 12_000 }, now).tone).toBe('warn');
    expect(word({ online: true, phone: null, kickedAt: now - 100_000 })).toBe('⛔ kicked 1:40');
    expect(phoneWord({ online: true, phone: null, kickedAt: now - 100_000 }, now).title).toContain('for another 0:20');
  });

  it('a kick is over after its block (their seat waits again), and a phone back in is in', () => {
    expect(word({ online: true, phone: null, kickedAt: now - KICK_BLOCK_MS })).toBe('📱 waiting');
    expect(word({ online: true, phone: 'in', kickedAt: now - 1000 })).toBe('📱 in');
  });

  it('with seats locked a seat no phone has is locked out; with the room out of reach it says so', () => {
    expect(word({ online: true, phone: null, locked: true })).toBe('🔒 locked out');
    expect(word({ online: true, phone: 'in', locked: true })).toBe('📱 in');
    expect(word({ online: false, phone: 'in' })).toBe('📱 out of reach');
  });
});
