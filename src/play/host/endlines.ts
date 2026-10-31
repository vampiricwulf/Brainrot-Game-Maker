/**
 * The status line's words at the end of the show and in the tiebreaker clue: where the show is and what to do next,
 * in click words with the key in brackets (the host panel's status line reads them; the tie box and the tiebreaker's
 * 🏆 row are the buttons).
 */
import { coWinnersHold, nameList, standings, tiebreakHolds, tiedForFirst, tiedLeaders } from '../../lib/session';
import type { Session } from '../../lib/model';
import { FLOW } from './verbs';

/**
 * The results screen: a tie for first still to settle says where; otherwise who won (co-winners too) and that the show
 * is over, with what's left to do: "🏆 Bob wins · the show is over: 📋 Copy standings for chat, or 🚪 Exit".
 */
export function endLine(session: Session): string {
  const ties = coWinnersHold(session) ? [] : tiedLeaders(session);
  if (ties.length) return 'Tie for first: settle it in the tie box below';
  const level = tiedForFirst(session);
  const top = standings(session)[0];
  const who = coWinnersHold(session) && level.length ? `🤝 ${nameList(level.map((p) => p.name))} win` : top ? `🏆 ${top.player.name} wins` : '';
  return `${who ? `${who} · the` : 'The'} show is over: 📋 Copy standings for chat, or 🚪 Exit`;
}

/**
 * The tiebreaker clue: who won it, by their 🏆 (or their number, then Enter), then back to the results; once won,
 * "🏆 Bob won · 🏁 Back to results (N)" (another 🏆 changes it). Points given there may settle it too.
 */
export function tiebreakLine(session: Session): string {
  const tied = tiedForFirst(session);
  const back = `${FLOW.backToResults.label} (N)`;
  const won = session.tiebreakClue && tiebreakHolds(session, tied.map((p) => p.id)) ? session.players.find((p) => p.id === session.rollOffWinner) : undefined;
  if (won) return `🏆 ${won.name} won · ${back}`;
  if (!tied.length) return `Nobody is tied for first any more: ${back}`;
  return 'Who won the tiebreaker? Click their 🏆, or press their number then Enter';
}
