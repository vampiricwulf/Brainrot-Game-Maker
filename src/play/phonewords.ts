// What the ▶ Play screen says about the players' phones while the buzzer room is up: the Start bar's line (who's in, who
// it's waiting for). Pure: unit-tested in phonewords.test.ts.

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
