// What the ▶ Play screen says about the players' phones while the buzzer room is up: the Start bar's line (who's in, who
// it's waiting for), each 👥 row's phone in words, and the 📱 card's folded buzzer options. Pure: unit-tested in
// phonewords.test.ts.
import { KICK_BLOCK_MS } from '../lib/buzzproto';
import type { GameSettings } from '../lib/model';

/** A player (a team, with Teams on) as the room line needs them. */
export interface LinePlayer {
  id: string;
  name: string;
}
/** A phone in the room, as the room last listed it. */
export interface LinePhone {
  seatId: string | null;
  connected: boolean;
  /** Teams: the person on this phone. */
  member?: string;
}

/**
 * Who has joined, in the 📱 card's words ("1 of 3 joined", teams "3 people on 2 of 3 teams"), and the players (teams)
 * no phone is in for yet, by name ("Player 2" for a blank one, as it plays).
 */
export function whoJoined(players: readonly LinePlayer[], phones: readonly LinePhone[], teams = false): { joined: string; waiting: string[] } {
  const inNow = (id: string) => phones.some((ph) => ph.seatId === id && ph.connected);
  const k = players.filter((p) => inNow(p.id)).length;
  const waiting = players.flatMap((p, i) => (inNow(p.id) ? [] : [p.name.trim() || `${teams ? 'Team' : 'Player'} ${i + 1}`]));
  if (!teams) return { joined: `${k} of ${players.length} joined`, waiting };
  const people = phones.filter((ph) => ph.member && ph.connected && players.some((p) => p.id === ph.seatId)).length;
  return { joined: `${people} ${people === 1 ? 'person' : 'people'} on ${k} of ${players.length} teams`, waiting };
}

/** "waiting for Bob, Cat", the first `most` names, then "+2 more" (the bar's line keeps to one line). */
export function waitingFor(names: readonly string[], most = 3): string {
  if (!names.length) return '';
  const shown = names.slice(0, most).join(', ');
  return `waiting for ${shown}${names.length > most ? ` +${names.length - most} more` : ''}`;
}

/** How a 👥 row's phone is: its words, their tone, and a tooltip saying what it means. */
export interface PhoneWord {
  text: string;
  tone: 'good' | 'warn' | 'plain';
  title: string;
}
/** What the room says about one player's seat. */
export interface SeatSeen {
  /** The room can be reached (its list of phones is the room's now). */
  online: boolean;
  /** Their phone: in the room now, holding the seat but gone quiet, or none. */
  phone: 'in' | 'away' | null;
  /** When it went quiet (ms), when known. */
  awaySince?: number | null;
  /** When the host kicked its phone (ms), if they did. */
  kickedAt?: number;
  /** 🔒 Lock seats is on. */
  locked?: boolean;
}

/** "1:40": minutes and seconds. */
const clock = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** A 👥 row's phone in words, at `now`: 📱 in, 📱 waiting, 📵 lost 0:12, ⛔ kicked 1:40 (how long ago), 🔒 locked out. */
export function phoneWord(s: SeatSeen, now: number): PhoneWord {
  if (!s.online) return { text: '📱 out of reach', tone: 'plain', title: 'The buzzer room isn’t reachable right now' };
  if (s.phone === 'in') return { text: '📱 in', tone: 'good', title: 'Their phone is in the room' };
  if (s.phone === 'away') {
    const t = s.awaySince != null ? clock(now - s.awaySince) : '';
    return { text: `📵 lost${t ? ` ${t}` : ''}`, tone: 'warn', title: `Their phone dropped out${t ? ` ${t} ago` : ''}: it comes back by itself (on a new phone: Free seat in 📱 Phone buzzers)` };
  }
  if (s.kickedAt !== undefined && now - s.kickedAt < KICK_BLOCK_MS) {
    return {
      text: `⛔ kicked ${clock(now - s.kickedAt)}`,
      tone: 'warn',
      title: `Kicked: that phone can't take this seat for another ${clock(KICK_BLOCK_MS - (now - s.kickedAt))} (↩ Let back in 📱 Phone buzzers lets it now)`,
    };
  }
  if (s.locked) return { text: '🔒 locked out', tone: 'plain', title: 'Lock seats keeps new phones out: untick 🔒 Lock seats to let their phone in' };
  return { text: '📱 waiting', tone: 'plain', title: 'No phone has their seat yet: they open the link and tap their name' };
}

/**
 * The 📱 card's ▸ Buzzer options fold, closed: each option as it's set ("Buzzers open with the clue · new players: no ·
 * colors on phones · 1 s early wait"). With Teams on, the two options teams leave out aren't named.
 */
export function buzzerGist(s: Pick<GameSettings, 'buzzArm' | 'phoneJoin' | 'phoneColorsOff' | 'earlyBuzzLock' | 'buzzTeams'>): string {
  const wait = s.earlyBuzzLock ?? 1;
  return [
    s.buzzArm === 'host' ? 'Buzzers open on U' : 'Buzzers open with the clue',
    ...(s.buzzTeams ? [] : [s.phoneJoin ? 'new players: yes' : 'new players: no', s.phoneColorsOff ? 'no colors on phones' : 'colors on phones']),
    wait ? `${wait} s early wait` : 'no early wait',
  ].join(' · ');
}
