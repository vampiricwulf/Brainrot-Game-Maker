// ▶ Play's 📺 On stream fold, closed: what's set, on its line ("📺 On stream · “Starting soon” card · cover card ·
// captions on"). Pure: streamgist.test.ts.
import type { GameSettings } from '../lib/model';

/** Words the host typed, short enough for the line ("Back in a sec, cha…"). */
const short = (t: string, most = 24) => (t.length > most ? `${t.slice(0, most - 1).trimEnd()}…` : t);

/**
 * Each part of the On stream options as it's set: the two cards (their own words when typed), a countdown running, the
 * captions, the join code hidden (with phone buzzers on), Reduce motion. Only what isn't the default is named beyond
 * the two cards.
 */
export function streamGist(
  stream: NonNullable<GameSettings['stream']>,
  o: { countdown?: string; phones?: boolean; rpg?: boolean; reduceMotion?: boolean } = {},
): string {
  const soon = stream.soonText?.trim();
  const cover = stream.coverText?.trim();
  return [
    soon ? `“${short(soon)}”` : '“Starting soon” card',
    ...(o.countdown ? [`countdown ${o.countdown}`] : []),
    cover ? `cover “${short(cover)}”` : 'cover card',
    ...(stream.clueCaption || (o.rpg && stream.placeCaption) ? ['captions on'] : []),
    ...(o.phones && stream.hideJoinCode ? ['join code hidden'] : []),
    ...(o.reduceMotion ? ['reduce motion'] : []),
  ].join(' · ');
}
