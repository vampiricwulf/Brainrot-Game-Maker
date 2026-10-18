// How a 🤫 card stands on the phones, for the host panel's rows (a partner clue's Distribute list, a tile's cards, the
// list of cards out): what of it won't reach a phone, what of it is big for phones on mobile data (and which of those
// files 🗜 can make smaller copies of), and, for a card sent with 🤫 Send a card… or from a tile's panel, sent, ✓ seen,
// uploading, and a phone late for it. In one window the panel is on stream: these lines count a card's pictures and
// videos and name players, never what's on a card, an item's name or its size.
import { CARDS_MAX } from '../../lib/buzzproto';
import { cardFileCounts } from '../../lib/cardfiles.svelte';
import { nameList } from '../../lib/session';
import type { Game, Id, SentCard, Session } from '../../lib/model';
import { countItems } from '../../lib/partner';
import type { CardItem, LeftOut, PhoneItem } from '../../lib/phonecard';
import { remote } from '../../lib/remote.svelte';
import { sentCardId, sentSlide, sentState } from '../../lib/sentcards';

const WHY: Record<LeftOut, string> = {
  big: 'too big for the buzzer server',
  expired: 'its link has expired',
  kind: 'phones can’t show it',
  nofiles: 'this buzzer server isn’t taking files right now',
  failed: 'didn’t reach the buzzer server',
  full: 'the buzzer room holds all the files it can: ✖ take a card back, then ↻ Send again',
  lost: 'isn’t in the game any more',
  many: 'one card shows 6 at most',
};

/**
 * What of a card won't reach the phones, counted ("🖼 1 video won't reach the phones (too big for the buzzer server)"),
 * or ''.
 */
export function leftLine(left: { kind: CardItem['kind']; why: LeftOut }[]): string {
  if (!left.length) return '';
  const why = [...new Set(left.map((l) => WHY[l.why]))].join('; ');
  return `🖼 ${countItems(left.map((l) => l.kind))} won’t reach the phones (${why})`;
}

/** The kinds of a card's items that go but are big for phones on mobile data (phoneCard's `slow`), for slowLine. */
export const slowKinds = (items: PhoneItem[]): CardItem['kind'][] => items.flatMap((i) => (i.slow ? [i.kind] : []));

/**
 * What of a card goes but is big, counted, never named or sized ("📶 1 video is big: phones on mobile data may wait for
 * it (WiFi is fine)"), or ''.
 */
export function slowLine(kinds: CardItem['kind'][]): string {
  const n = kinds.length;
  if (!n) return '';
  return `📶 ${countItems(kinds)} ${n === 1 ? 'is' : 'are'} big: phones on mobile data may wait for ${n === 1 ? 'it' : 'them'} (WiFi is fine)`;
}

/**
 * The files of a card's items that 🗜 Make smaller offers smaller copies of for phones (each once): those that go but are
 * big ('slow'), or those too big for the buzzer server ('big'), going as themselves (not as a copy already), that `can`
 * says 🗜 makes copies of here.
 */
export function shrinkIds(items: PhoneItem[], which: 'slow' | 'big', can: (id: Id) => boolean): Id[] {
  const ids = items.flatMap((i) => ((which === 'slow' ? i.slow : i.why === 'big') && i.media && (!i.sends || i.sends === i.media) && can(i.media) ? [i.media] : []));
  return [...new Set(ids)];
}

/** " (34%)": how far the file going up now got, when it has said. */
export const pctText = (progress: number | undefined): string => (progress === undefined ? '' : ` (${Math.floor(progress * 100)}%)`);

/** The players whose phone showed a card (its send now), by seat. */
export function seenSeats(session: Pick<Session, 'players' | 'remote'>, c: Pick<SentCard, 'id' | 'at'>): Id[] {
  const seen = session.remote?.cardsSeen?.[sentCardId(c)];
  const seats = new Set((Array.isArray(seen) ? seen : []).map((w) => w.split('/')[0]));
  return session.players.map((p) => p.id).filter((id) => seats.has(id));
}

/**
 * A card sent with 🤫 Send a card… or from a tile's panel, as its row says it: "sent", "✓ seen" (by whom, when not by
 * everyone it went to), "uploading 1 of 2 (34%)…", a phone that came late for it ("Ann's new phone hasn't got it: ↻ Send
 * again"), a card made in the editor (a tile's or a 🤫 Card) changed there since, or one the phones never get.
 * `filesOn`: the room takes files. `off`: the buzzer room isn't told it (buzz.ts cardsLeftOff: a 🎭 deal handed out
 * before it took cards took them past what it holds); its row offers no ↻ Send again, as under a new id it would be
 * left off all the same. `phones`: phones get cards (a room that takes them). Without them the cards out offer no
 * ↻ Send again, so an edited card's row says to take it back and show it again, and no phone is named late for it
 * (remote.cardsLate keeps what a room that turned this window away last said).
 */
export function sentLine(game: Game, session: Session, c: SentCard, filesOn: boolean, off = false, phones = true): { text: string; warn: boolean } {
  if (off) return { text: `not on the phones: more than ${CARDS_MAX} cards are out (copy it: 📋, or ✖ Take it back)`, warn: true };
  if (sentState(game, c) === 'edited')
    return {
      text: phones
        ? 'changed in the editor: off the phones until ↻ Send again'
        : 'changed in the editor: out of the 🪟 card window until you ✖ Take it back and show it again (or copy it: 📋)',
      warn: true,
    };
  const name = (id: Id) => session.players.find((p) => p.id === id)?.name ?? '?';
  const seats = [...new Set(c.to.map((t) => t.seat))];
  const seen = seenSeats(session, c);
  const late: { seat: Id; by?: string }[] = [];
  if (phones) for (const l of remote.cardsLate) if (l.id === sentCardId(c) && !late.some((x) => x.seat === l.seatId && x.by === l.by)) late.push({ seat: l.seatId, by: l.by });
  const out = [seen.length ? `✓ seen${seen.length < seats.length ? ` by ${nameList(seen.map(name))}` : ''}` : 'sent'];
  const slide = sentSlide(game, c);
  const f = slide && filesOn ? cardFileCounts(game, session, slide) : null;
  if (f?.going) out.push(`uploading ${Math.min(f.files, f.up + 1)} of ${f.files - f.failed}${pctText(f.progress)}…`);
  if (late.length) {
    const whose = late.map((l) => (l.by ? `${l.by}’s phone (${name(l.seat)})` : `${name(l.seat)}’s new phone`));
    out.push(`${nameList(whose)} ${late.length > 1 ? 'haven’t' : 'hasn’t'} got it: ↻ Send again`);
  }
  // (A file of it that won't reach the phones turns the row orange too: the line under it says what.)
  return { text: out.join(' · '), warn: late.length > 0 || !!f?.failed };
}
