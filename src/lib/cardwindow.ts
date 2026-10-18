// 🪟 The card window (partner-clues spec §13.6): a window on the host's computer with one player's 🤫 cards, full
// size and with the host's own files, for a player with no phone: the host shares just that window with them (a
// Discord DM call), turns the laptop round, or puts it on a second screen. What it shows is built here, from what the
// host sent and nothing else: the open partner clue's sends and the cards out (Session.cards) to that player's whole
// seat, as they went. Its messages have their own types ('private-…'), which the host posts to that window alone
// (cardwindow.svelte.ts), never through sync's post(): the audience window, the BroadcastChannel and the scores window
// never get them. No Svelte state: tested in cardwindow.test.ts.
import type { CardMedia } from './buzzproto';
import { cardSlides, type CardTo, type Game, type Id, type Session, type Slide } from './model';
import { cardHash, cardId, cardLines, partnerRules } from './partner';
import { ANY_SERVER, phoneCard } from './phonecard';
import { cardsOut, sentCardId, sentSlide, sentState } from './sentcards';
import { currentClueInfo } from './session';

type Kind = 'image' | 'video' | 'audio';
type Times = { start?: number; end?: number };

/** One picture, video, sound or embed in the card window. */
export type WindowItem =
  /** A file from the host's computer: its bytes come in a 'private-files' message, by this media id. */
  | ({ kind: Kind; file: Id; name?: string } & Times)
  | ({ kind: Kind; url: string; name?: string } & Times)
  | Extract<CardMedia, { kind: 'embed' }>
  | { kind: Kind; missing: true };

/** A card as the card window shows it: its lines, words, then its items (as a phone shows it, with local files). */
export interface WindowCard {
  /** Its id on the wire, as the phones know it. */
  id: string;
  role?: string;
  hint?: string;
  title?: string;
  text?: string;
  media: WindowItem[];
  /** False once its tile's answer is on screen ("The answer's on screen"). */
  open: boolean;
}

/** Host → card window. */
export type CardWinMsg =
  /** The player's cards now, newest first (none: "Nothing private right now"). `name`: whose they are. */
  | { type: 'private-cards'; name: string; cards: WindowCard[] }
  /** Files from the host's computer the cards show, by media id. */
  | { type: 'private-files'; items: { id: Id; blob: Blob }[] }
  /** The host's page is going (a reload, or it closed). */
  | { type: 'private-bye' }
  /** The host closed it. */
  | { type: 'private-close' };

/** Card window → host: it has loaded (and wants what it shows). */
export type CardWinReply = { type: 'private-hello' };

/** Every type a card window message has: none is a message the audience or scores windows know. */
export const CARD_WIN_TYPES: readonly string[] = ['private-cards', 'private-files', 'private-bye', 'private-close'] satisfies CardWinMsg['type'][];

/** A card's words and items for the card window: as phoneCard builds them for a phone, with files from this computer as files. */
export function windowContent(game: Pick<Game, 'media'>, slide: Slide): Pick<WindowCard, 'title' | 'text' | 'media'> {
  const pc = phoneCard(game, slide, ANY_SERVER);
  const media: WindowItem[] = [];
  for (const it of pc.items) {
    // (One card shows 6 at most, as on a phone.)
    if (it.why === 'many') continue;
    const g = it.goes;
    if ('url' in g) {
      media.push(g);
      continue;
    }
    const kind: Kind = g.kind;
    // A file from this computer: shown as it is (a phone's size and type limits don't apply here).
    if (it.file && it.media && it.why !== 'lost') {
      const e = slide.elements.find((x) => x.id === it.el);
      const name = e?.name?.trim();
      const t = e && (e.kind === 'video' || e.kind === 'audio') ? { ...(e.startAt !== undefined ? { start: e.startAt } : {}), ...(e.endAt !== undefined ? { end: e.endAt } : {}) } : {};
      media.push({ kind, file: it.media, ...(name ? { name } : {}), ...t });
    } else media.push({ kind, missing: true });
  }
  return { ...(pc.title ? { title: pc.title } : {}), ...(pc.text ? { text: pc.text } : {}), media };
}

/** Sent to the whole seat (not to one person on its team, nor to the rest of the team but someone). */
const wholeSeat = (to: CardTo[], seat: Id): CardTo[] => to.filter((t) => t.seat === seat && !t.member && !t.except?.length);

/**
 * The cards the card window shows for one player, newest first (by when each went, whichever kind, as on a phone): the
 * open partner clue's sends to their seat and the cards out to it (🤫 Send a card…, a tile's panel, an action's), as
 * they went (a card edited in the editor since is left out until ↻ Send again, as on the phones). Never anything the
 * host didn't send to that player.
 */
export function windowCards(game: Game, session: Session, seat: Id): WindowCard[] {
  if (!session.players.some((p) => p.id === seat)) return [];
  const out: { at: number; card: WindowCard }[] = [];
  const s = session.partner;
  const clue = session.phase === 'clue' ? currentClueInfo(session, game)?.clue : undefined;
  if (s?.sent?.length && clue && clue.id === s.clue) {
    const rules = partnerRules(clue);
    const nameOf = (id: Id) => session.players.find((p) => p.id === id)?.name ?? '?';
    for (const send of s.sent) {
      const card = cardSlides(clue).find((c) => c.id === send.card);
      const to = wholeSeat(send.to, seat);
      if (!card || cardHash(card) !== send.hash || !to.length) continue;
      out.push({ at: send.at, card: { id: cardId(clue.id, send), ...cardLines(rules, s, card, to, nameOf), ...windowContent(game, card), open: !session.revealed } });
    }
  }
  for (const c of cardsOut(game, session)) {
    const slide = sentSlide(game, c);
    if (!slide || sentState(game, c) !== 'sent' || !wholeSeat(c.to, seat).length) continue;
    out.push({ at: c.at, card: { id: sentCardId(c), ...(c.role ? { role: c.role } : {}), ...windowContent(game, slide), open: c.until !== 'tile' || !session.revealed } });
  }
  return out
    .sort((a, b) => a.at - b.at)
    .reverse()
    .map((x) => x.card);
}

/** The files from this computer the cards show (media ids, each once): only these go to the card window. */
export function windowFiles(cards: readonly WindowCard[]): Id[] {
  return [...new Set(cards.flatMap((c) => c.media.flatMap((m) => ('file' in m ? [m.file] : []))))];
}
