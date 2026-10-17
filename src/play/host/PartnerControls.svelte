<!--
  🤝 A partner clue's part of the host panel (partner-clues spec §6.10): PARTNER UP! (who picked it, the partner by the
  wheel or by hand, ⇄ Swap), then 📤 Distribute (who gets each card: 📤 Send to their phones, ✓ seen, ↻ Send again,
  📤 Send changes, ✖ Take back, ⇡ Get it ready, or 📋 copying it to them, or 🪟 showing it in the card window open for
  one of them when no phone gets cards), and ✔ Got it / ✘ Missed with what each gives (then, with steal on a miss, who
  steals it: the others buzz in, or the host picks one). Nothing goes to a phone or the buzzer server but by those
  presses, and never more cards than the room takes (✖ Take one back first). In one window this panel is on stream: it
  names a card (its name is the host's, "Card 2" when it has none) and counts what's on it, never says it, nor names a
  card's pictures (a file name is often the answer), uploads included. The cards themselves are in the editor's 🤫 Card tabs, and the two-window host column.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { app, toast } from '../../lib/app.svelte';
  import { textOn } from '../../lib/colors';
  import { overlayDoneAt, toolOverlay } from '../../lib/live';
  import { cardSlides, clueCardName, clueCardWords, formatPoints, PARTNER_GAMES, type CardTo, type Clue, type ClueCard, type Game, type Id, type PartnerState, type Session } from '../../lib/model';
  import {
    cardCopyText, cardId, cardRecipients, cardSends, cardSummary, countItems, describer, goesToLabel, lowerWord, markReady, marksText, pairOnly, partnerCandidates, partnerPickStep,
    partnerRoles, partnerRules, partnerShares, partnerVerdict, partWho, partWordOf, partWords, recipientsText, resetRecipients, sameTeam, sendAgain, sendCards, sendChanges, sendState, sentSeats,
    sentTo, setDescriber, setPartner, setPartnerPicker, setRecipients, sharesText, swapParts, toKey, toName,
  } from '../../lib/partner';
  import { cardItems, cardLinks, cardWords, phoneCard } from '../../lib/phonecard';
  import { clueName, nameList, partnerSteal, stealersLeft } from '../../lib/session';
  import { buzzerOn, remote, roomHasCards, roomHasFiles, roomMembers } from '../../lib/remote.svelte';
  import { cardFileCounts, filesCounted, phoneCan, retryFiles, unputGone } from '../../lib/cardfiles.svelte';
  import { ask } from '../../lib/ask.svelte';
  import { cardsFullText, partnerAnswerId, roomCardsFull, sendOf, teamsOn } from '../../lib/buzz';
  import { cardWindow } from '../../lib/cardwindow.svelte';
  import { cardsOut, sendCard } from '../../lib/sentcards';
  import { dropMenu } from '../../lib/menustate.svelte';
  import { announce } from '../../lib/announce';
  import { copyText } from '../standings';
  import { canCopyPicture, copyCardPicture } from './cardcopy';
  import { leftLine } from './cardrow';
  import { offerNext } from './slots.svelte';

  let {
    game,
    session,
    clue,
    dual = false,
    value,
    marks,
    onspin,
    onshow,
    onclock,
    onjudge,
    ontakeback,
    oncardtakeback = () => {},
    onmemberspin,
    selected = [],
    onpick = () => {},
  }: {
    game: Game;
    session: Session;
    /** The partner clue that's open. */
    clue: Clue;
    /** An audience window is open: viewers don't see this window. */
    dual?: boolean;
    /** 🎡 Spin for a partner (W): the partner wheel, spun. */
    onspin: () => void;
    /** ▶ Show question: the question on stream, the cards to hand out. */
    onshow: () => void;
    /** ⏱ Start the clock: the countdown starts. */
    onclock: () => void;
    /** What the shares are of: the Amount box (the tile's value, unless the host changed it). */
    value: number;
    /** Each player's mark on the clue since it opened (clueMarks): who's scored already. */
    marks: Record<Id, { right: boolean; delta: number }>;
    /** ✔ Got it (true) or ✘ Missed: both of the two in one step. */
    onjudge: (got: boolean) => void;
    /** ✖ Take back: the card goes from every phone it was sent to. */
    ontakeback: (card: Id) => void;
    /** ✖ Take back a card shown in the 🪟 card window (no phone gets cards): it's one of the cards out. */
    oncardtakeback?: (id: Id) => void;
    /** 🎡 Spin for the describer (teams, the picker's own team playing it): the member wheel, spun. */
    onmemberspin: () => void;
    /** The players picked by hand (1–9, a click): in a steal, who's answering it. */
    selected?: Id[];
    /** A steal's chip: that player answers it (picked, as with their number). */
    onpick?: (id: Id) => void;
  } = $props();

  // (Mounted only while there's one; a stand-in for the moment it goes, before this part does.)
  const s = $derived<PartnerState>(session.partner ?? { clue: clue.id, stage: 'pick', giver: 'partner' });
  const rules = $derived(partnerRules(clue));
  const words = $derived(partWords(rules));
  const roles = $derived(partnerRoles(s));
  const cards = $derived(cardSlides(clue));
  /** With no cards, ▶ Show question starts the countdown: when it starts by itself (⚖ Game rules) and the clue has one. */
  const autoClock = $derived(game.settings.timerAutoStart && (clue.timerSeconds ?? game.settings.defaultTimerSeconds ?? 0) > 0);
  const byId = $derived(Object.fromEntries(session.players.map((p) => [p.id, p])));
  const picker = $derived(s.pickerId ? byId[s.pickerId] : undefined);
  const partner = $derived(s.partnerId ? byId[s.partnerId] : undefined);
  const candidates = $derived(partnerCandidates(session, s));
  /** Phone buzzer teams: each row is a team, and the words say so ("Which team picked it?"). */
  const noun = $derived(buzzerOn(game.settings) && teamsOn(game.settings) ? 'team' : 'player');
  const where = $derived(session.currentClue ? clueName(game, session.currentClue) : '');
  const name = (id: Id | undefined) => (id ? (byId[id]?.name ?? '?') : '?');

  // The partner wheel on screen (under the scores too), and whether it's still spinning: the chips wait for it to land,
  // so they never show the partner before the wheel does.
  let now = $state(Date.now());
  onMount(() => {
    const t = setInterval(() => (now = Date.now()), 200);
    return () => clearInterval(t);
  });
  const wheel = $derived.by(() => {
    const o = toolOverlay(app.live);
    return o?.kind === 'wheel' && o.partnerFor === s.clue ? o : null;
  });
  const spinning = $derived(!!wheel && now < overlayDoneAt(wheel));

  /** How the partner was chosen, after their name. */
  const HOW = { wheel: ' (the wheel)', host: ' (your choice)', only: ' (the only one)' } as const;

  function choosePicker(id: Id): void {
    setPartnerPicker(session, s, id);
    announce(`${name(id)} picked it`);
  }
  function choosePartner(id: Id): void {
    if (spinning) return toast('Still spinning: wait for it to land');
    const old = s.partnerId;
    // (Sent cards that follow the partner's part: they don't move by themselves.)
    const was = sentCards().filter(({ card }) => sendState(session, s, card) === 'sent');
    if (!setPartner(session, s, id, 'host')) return toast(`${name(id)} picked it: tick “${name(id)} can be on the wheel” to make it Solo`);
    announce(id === s.pickerId ? `${name(id)} plays it alone` : `${name(id)} is ${name(s.pickerId)}’s partner`);
    const moved = was.filter(({ card }) => old && sentSeats(session, s, card.id).includes(old) && sendState(session, s, card) === 'changed');
    if (!moved.length || !old) return;
    const which = moved.map(({ card, n }) => clueCardWords(card, n - 1)).join(' and ');
    void ask(`${name(old)} already has ${which}: take it back and send it to ${name(id)}?`, { ok: '📤 Send changes', cancel: `Leave it with ${name(old)}` }).then((yes) => {
      if (!yes || session.partner !== s) return;
      // (Never more cards than the buzzer room takes.)
      const go = (t: Session) => moved.forEach(({ card }) => sendChanges(t, t.partner!, card));
      if (roomCardsFull(game, session, go)) return toast(cardsFullText(game, session, go), 4000);
      for (const { card } of moved) sendChanges(session, s, card);
      announce(`${moved.map(({ card, n }) => clueCardWords(card, n - 1, true)).join(' and ')} sent to ${name(id)}`);
    });
  }
  function pickerMenu(e: MouseEvent): void {
    dropMenu(e, [
      { heading: noun === 'team' ? 'Which team picked it?' : 'Who picked it?' },
      ...session.players.map((p) => ({ label: p.name, disabled: p.id === s.pickerId, onclick: () => choosePicker(p.id) })),
    ]);
  }
  function partnerMenu(e: MouseEvent): void {
    dropMenu(e, [
      { heading: `${name(s.pickerId)}’s partner` },
      ...candidates.map((p) => ({ label: p.id === s.pickerId ? `${p.name} (Solo)` : p.name, disabled: p.id === s.partnerId, onclick: () => choosePartner(p.id) })),
    ]);
  }
  function includePicker(on: boolean): void {
    if (on) s.includePicker = true;
    else {
      delete s.includePicker;
      // (Solo needs them on it.)
      if (s.partnerId && s.partnerId === s.pickerId) {
        delete s.partnerId;
        delete s.how;
        delete s.member;
      }
    }
    pairOnly(session, s);
  }
  /** The game's icon and verbs ("🗣", "describes", "guesses"). */
  const G = $derived(PARTNER_GAMES[rules.game]);
  /**
   * Who plays which part, in words: "Bob describes · Ann guesses". Before the pair is known, who plays it then: "The
   * partner describes · Ann guesses", "The partner describes · the picker guesses" (⇄ Swap: "the picker describes…").
   */
  const partsSaid = $derived.by(() => {
    const m = noun === 'team' ? describer(s) : undefined;
    if (m) return `${m.name} ${G.verb} · ${name(s.pickerId)} ${G.guessVerb}`;
    // (Teams, the picker's own team: who on it describes is still to choose.)
    if (roles.solo && sameTeamOn && people.length > 1) return `Someone on ${name(s.pickerId)} ${G.verb} · the rest of ${name(s.pickerId)} ${G.guessVerb}`;
    if (roles.solo) return `${name(roles.guesser)} plays it alone (Solo)`;
    const who = (role: 'giver' | 'guesser') => partWho({ ...rules, giver: s.giver }, role);
    const giver = roles.giver ? name(roles.giver) : who('giver') === 'the partner' ? 'The partner' : 'The picker';
    return `${giver} ${G.verb} · ${roles.guesser ? name(roles.guesser) : who('guesser')} ${G.guessVerb}`;
  });
  async function swap(): Promise<void> {
    if (verdict.judged) return;
    // A card that follows a part went out already: they keep what they saw, and nothing moves until 📤 Send changes.
    const sent = sentCards().filter(({ card }) => !s.deal?.[card.id] && (card.to === 'giver' || card.to === 'guesser') && sendState(session, s, card) === 'sent');
    if (sent.length) {
      const { card, n } = sent[0];
      // (Saw: their phone showed it. Has: it went to them, unopened as far as the room knows.)
      const seen = seenBy(card);
      const sentNow = sentSeats(session, s, card.id);
      const who = nameList(sentNow.map(name));
      const part = `the ${lowerWord(words[card.to as 'giver' | 'guesser'])}’s`;
      const did = seen.length && seen.length === sentNow.length ? 'already saw' : seen.length ? `already ${sentNow.length > 1 ? 'have' : 'has'} (${nameList(seen.map(name))} saw it)` : sentNow.length > 1 ? 'already have' : 'already has';
      const yes = await ask(`${who} ${did} ${clueCardWords(card, n - 1)} (${part}). Swap anyway? They keep it; 📤 Send changes gives it to whoever plays that part now.`, { ok: '⇄ Swap', cancel: 'Don’t swap' });
      if (!yes || session.partner !== s || verdict.judged) return;
    }
    swapParts(s);
    announce(partsSaid);
  }

  // ---------- Judging ----------

  const sym = $derived(game.settings.currencySymbol);
  /** Both of the two have a mark on the clue: judged (an Undo opens it all again). */
  const verdict = $derived(partnerVerdict(s, marks));
  /** Enter and Shift+Enter judge (nobody picked) once the clock runs: the buttons show their keys then. */
  const judgeKeys = $derived(s.stage === 'live' && !verdict.judged);
  /** What ✔ Got it and ✘ Missed give now: to whoever of the two isn't scored yet. */
  const gotShares = $derived(partnerShares(value, rules, s, true, marks));
  const missShares = $derived(partnerShares(value, rules, s, false, marks));
  /**
   * Steal on a miss (partner-clues spec §8.3): ✘ Missed let the others answer it, the two locked out. Who can still steal
   * it (not one of the two, nor one who missed the steal), and who did.
   */
  const steal = $derived(partnerSteal(session));
  const stealers = $derived(steal ? session.players.filter((p) => !steal.out.includes(p.id)) : []);
  /** Who can still steal it: the others, but not one who missed the steal (none left: only 👁 Reveal answer goes on). */
  const stealLeft = $derived(steal ? stealersLeft(session.players, steal, marks) : []);
  /** " · Bob already scored": one of the two scored by hand first (the buttons leave them as they are). */
  const already = $derived(
    s.partnerId && !verdict.judged
      ? [...new Set([s.pickerId, s.partnerId])]
          .filter((id): id is Id => !!id && !!marks[id])
          .map((id) => ` · ${name(id)} already scored`)
          .join('')
      : '',
  );

  // ---------- The cards ----------

  const recipients = (card: ClueCard): CardTo[] => cardRecipients(session, s, card);
  /** Teams, while one person on the picker's team describes to the rest of it (spec §10.2): that person. */
  const member = $derived(noun === 'team' ? describer(s) : undefined);
  /** A player's chip as a recipient: the whole seat, or (the picker's team, while one of them describes) the rest of it. */
  const seatTo = (id: Id): CardTo => (member && id === s.pickerId ? { seat: id, except: [member.id] } : { seat: id });
  /** The describer's own chip. */
  const memberTo = $derived<CardTo | null>(member && s.pickerId ? { seat: s.pickerId, member } : null);
  const has = (to: CardTo[], t: CardTo) => to.some((x) => toKey(x) === toKey(t));
  /** Every player but the two. */
  const others = $derived(session.players.map((p) => p.id).filter((id) => id !== s.pickerId && id !== s.partnerId));
  /** A part's word for a player's chip ("describer"), while they play it. */
  const partOf = (id: Id): string => (s.partnerId ? partWordOf(rules, s, seatTo(id)) : '');
  function toggle(card: ClueCard, t: CardTo): void {
    const to = recipients(card);
    setRecipients(session, s, card, has(to, t) ? to.filter((x) => toKey(x) !== toKey(t)) : [...to, t]);
  }
  function everyoneElse(card: ClueCard): void {
    const to = recipients(card);
    const rest = others.map(seatTo);
    const all = rest.length > 0 && rest.every((t) => has(to, t));
    setRecipients(session, s, card, all ? to.filter((t) => !has(rest, t)) : [...to, ...rest.filter((t) => !has(to, t))]);
  }

  // ---------- Phones (partner-clues spec §6.5, §13) ----------

  /** A buzzer room is open for this game. */
  const room = $derived(buzzerOn(game.settings) && !!remote.code && remote.status !== 'off' && remote.status !== 'error');
  /** Its phones get the cards the host sends (else the host copies them: 📋). */
  const cardsOn = $derived(room && roomHasCards());
  /** It takes card files from this computer now. */
  const filesOn = $derived(cardsOn && roomHasFiles());
  /** An older buzzer server: no cards on phones, the host copies them. */
  const older = $derived(room && remote.status === 'online' && !roomHasCards());

  // ---------- One person describing to their own team (spec §10.2) ----------

  /**
   * Teams, a room that takes cards, and the picker's own team plays it (the wheel landed on it, or ☑ Partner from the
   * same team): one person on it describes to the rest, chosen by the member wheel (or a chip).
   */
  const sameTeamOn = $derived(noun === 'team' && cardsOn && !!s.pickerId && s.partnerId === s.pickerId);
  /** The people on the picker's team with a phone here. */
  const people = $derived(s.pickerId && noun === 'team' && cardsOn ? roomMembers(s.pickerId) : []);
  /** The describer is still on the team in this room (a new room, a kick or a move: their id means nobody now). */
  const memberHere = $derived(!member || remote.phones.some((p) => p.member === member.id && p.seatId === s.pickerId));
  /** "nobody to describe to" (the other games: "nobody to play it with"). */
  const nobodyTo = $derived(rules.game === 'describe' ? 'nobody to describe to' : 'nobody to play it with');
  function chooseMember(id: string): void {
    if (spinning) return toast('Still spinning: wait for it to land');
    const m = people.find((x) => x.id === id);
    if (!m) return;
    setDescriber(s, m);
    announce(`${m.name} is the ${lowerWord(words.giver)} for ${name(s.pickerId)}`);
  }
  function setSameTeam(on: boolean): void {
    sameTeam(s, on);
    announce(on ? `${name(s.pickerId)} plays it: one of them is the ${lowerWord(words.giver)}` : `${name(s.pickerId)} needs a partner team`);
  }

  /** The players (teams) with a phone in the room now. */
  const phones = $derived(new Set(app.live.phones ?? []));
  const hasPhone = (id: Id) => phones.has(id);
  /** The cards with what's out of them, numbered. */
  const sentCards = (): { card: ClueCard; n: number }[] => cards.flatMap((card, i) => (cardSends(s, card.id).length ? [{ card, n: i + 1 }] : []));
  /** What a phone gets for each card, and how far its files are. */
  const can = $derived(phoneCan(session));
  const lefts = (card: ClueCard) => (cardsOn ? phoneCard(game, card, filesOn ? can : { files: null }).left : []);
  /** The phones here now that a card was sent to but that are late for it (a new phone for the seat), by seat. */
  function lateFor(card: ClueCard): { seat: Id; by?: string }[] {
    const ids = new Set(cardSends(s, card.id).map((x) => cardId(s.clue, x)));
    const out: { seat: Id; by?: string }[] = [];
    for (const l of remote.cardsLate) if (ids.has(sendOf(l.id)) && !l.id.endsWith('~t') && !out.some((x) => x.seat === l.seatId && x.by === l.by)) out.push({ seat: l.seatId, by: l.by });
    return out;
  }
  /** The players who saw a card (its sends still out), by seat: not one whose phone now is late for it. */
  function seenBy(card: ClueCard): Id[] {
    const seen = session.remote?.cardsSeen ?? {};
    const late = new Set(lateFor(card).map((l) => l.seat));
    const seats = new Set(cardSends(s, card.id).flatMap((x) => (Array.isArray(seen[cardId(s.clue, x)]) ? seen[cardId(s.clue, x)] : []).map((w) => w.split('/')[0])));
    return session.players.map((p) => p.id).filter((id) => seats.has(id) && !late.has(id));
  }
  /** Who a card shown in the card window went to (names only). */
  const sentToTextOf = (to: CardTo[]) => to.map((t) => name(t.seat)).join(', ');
  /** "Card 1 sent to Bob", or "Card “Clue tip” sent to Bob" (names only, never what's on it). */
  const sentText = (card: ClueCard, n: number) => `${clueCardWords(card, n - 1, true)} sent to ${recipientsText(session, s, rules, card)}`;

  /** 📤 Send for this card, made on a copy of the session (roomCardsFull's `go`: a send can be one card per part). */
  const sendGo = (card: ClueCard) => (t: Session) => sendCards(t, t.partner!, [card]);
  /** Sending this card now would take the buzzer room past the cards it takes. */
  const sendFull = (card: ClueCard): boolean => roomCardsFull(game, session, sendGo(card));
  /** 📤 Send: this card to its players' phones now (the countdown doesn't start). */
  function sendOne(card: ClueCard, n: number): void {
    if (!cardsOn) return;
    if (sendFull(card)) return toast(cardsFullText(game, session, sendGo(card)), 4000);
    if (!sendCards(session, s, [card]).length) return toast(`Choose who gets ${clueCardWords(card, n - 1)} first`);
    announce(sentText(card, n));
  }
  /**
   * No phone gets cards, and the 🪟 card window is open for one of a card's players (their whole seat): what of the
   * card is in it (a card out, until the tile closes), or the seat 🪟 Show would put it there for.
   */
  const inWindow = (card: ClueCard) => cardsOut(game, session).find((c) => 'clue' in c.content && c.content.clue === clue.id && c.content.card === card.id);
  const windowSeat = (to: CardTo[]): Id | null => (!cardsOn && cardWindow.open && cardWindow.seat && to.some((t) => t.seat === cardWindow.seat) ? cardWindow.seat : null);
  /**
   * 🪟 Show: the card in the card window, for its player alone, until the tile closes (the same path as a tile's card).
   * No phone gets cards then, so the buzzer room's limit doesn't apply.
   */
  function showInWindow(card: ClueCard, n: number, seat: Id): void {
    const c = sendCard(game, session, { to: [{ seat }], content: { clue: clue.id, card: card.id }, until: 'tile' });
    if (!c) return toast(`${clueCardWords(card, n - 1, true)} can’t be shown now`);
    announce(`${clueCardWords(card, n - 1, true)} shown in the 🪟 card window to ${name(seat)}`);
  }
  /** ↻ Send again: under a new id, so a phone that came late (a new phone for the seat) gets it too. */
  function again(card: ClueCard, n: number): void {
    retryFiles(game, session, [card]);
    if (sendAgain(session, s, card)) announce(`${clueCardWords(card, n - 1, true)} sent again to ${sentTo(session, s, card.id).map((t) => toName(session, t)).join(', ')}`);
  }
  /** 📤 Send changes for this card, made on a copy of the session. */
  const changesGo = (card: ClueCard) => (t: Session) => sendChanges(t, t.partner!, card);
  /** 📤 Send changes would take the buzzer room past the cards it takes. */
  const changesFull = (card: ClueCard): boolean => roomCardsFull(game, session, changesGo(card));
  /** 📤 Send changes: to whoever was added, and taken back from whoever was taken off. */
  function changes(card: ClueCard, n: number): void {
    if (changesFull(card)) return toast(cardsFullText(game, session, changesGo(card)), 4000);
    sendChanges(session, s, card);
    announce(cardSends(s, card.id).length ? sentText(card, n) : `${clueCardWords(card, n - 1, true)} taken back`);
  }
  /** The cards not sent yet: their files are what ⇡ Get it ready puts in the room. */
  const unsent = $derived(cards.filter((c) => !cardSends(s, c.id).length));
  /** ⇡ Get it ready now: the files of the cards not sent yet go up to the buzzer room (no phone gets them until they're sent). */
  function getReady(): void {
    retryFiles(game, session, unsent);
    // (One the room let go of since it went up, after a ✖ Take back or 10 unused minutes, goes up again.)
    unputGone(game, session, unsent);
    markReady(s, unsent.map((c) => c.id));
    announce('Getting the cards’ files ready');
  }

  /** The files from this computer of the cards not sent yet, counted: what goes up, what's up, what's on its way. */
  const files = $derived(cardsOn ? filesCounted(game, session, unsent) : { files: 0, up: 0, going: 0, failed: 0 });
  /** Items counted by kind: "1 picture", "2 pictures and 1 video". */
  const fileKinds = (pick: (c: ClueCard) => ReturnType<typeof phoneCard>['items']) => countItems(unsent.flatMap((c) => pick(c).map((i) => i.kind)));
  /**
   * The line about those files (counted, never named), and whether ⇡ is offered. (A card's row says how its own go, and
   * what of it won't reach the phones.) A server not taking files: said here before the question, on the rows after.
   */
  const filesLine = $derived.by((): { text: string; ready: boolean } | null => {
    if (!cardsOn) return null;
    if (!filesOn) {
      const off = s.stage === 'pick' ? unsent.flatMap((c) => lefts(c).filter((l) => l.why === 'nofiles')) : [];
      return off.length ? { text: `🖼 ${countItems(off.map((l) => l.kind))} from this computer won’t reach the phones: this buzzer server isn’t taking files right now (📋 Copy picture)`, ready: false } : null;
    }
    if (!files.files) return null;
    const items = (c: ClueCard) => phoneCard(game, c, can).items.filter((i) => i.file);
    if (files.up >= files.files - files.failed) return files.up ? { text: `🖼 ${fileKinds((c) => items(c).filter((i) => 'file' in i.goes))} ready in the buzzer room (no phone gets ${files.up === 1 ? 'it' : 'them'} until you send)`, ready: false } : null;
    if (files.going) return { text: `⇡ getting ${Math.min(files.files, files.up + 1)} of ${files.files - files.failed} ready…`, ready: false };
    const waiting = (c: ClueCard) => items(c).filter((i) => !i.why && 'pending' in i.goes);
    // (Named by the cards they're on: "its card" when one card has them all.)
    const withFiles = unsent.filter((c) => waiting(c).length > 0);
    const left = files.files - files.up - files.failed;
    const whose = withFiles.length === 1 ? (left === 1 ? 'its card' : 'their card') : 'their cards';
    return { text: `🖼 ${fileKinds(waiting)} ${left === 1 ? 'goes' : 'go'} up when you send ${whose}`, ready: true };
  });

  /**
   * How the cards reach their players (never what's on them): "📱 Bob: phone here", "📵 Cat has no phone here: you'll
   * copy the card to them (📋)", or how this buzzer server stands.
   */
  const readiness = $derived.by((): string => {
    if (!room) return '📋 You’ll copy the cards to them (no phone buzzers in this game).';
    if (older) return 'This buzzer server is older: copy the cards to them (📋).';
    if (!cardsOn) return '📋 You’ll copy the cards to them.';
    if (!s.partnerId) return '📱 Phones get the cards when you send them.';
    const to = session.players.map((p) => p.id).filter((id) => cards.some((c) => cardRecipients(session, s, c).some((t) => t.seat === id)));
    if (!to.length) return '📱 Phones get the cards when you send them.';
    return to.map((id) => (hasPhone(id) ? `📱 ${name(id)}: phone here` : `📵 ${name(id)} has no phone here: you’ll copy the card to them (📋)`)).join(' · ');
  });

  /**
   * A card's row, after the chips: how it stands on the phones (sent, seen, uploading), and a recipient whose phone now
   * is late for it (a new phone for the seat: "Bob's new phone hasn't got it: ↻ Send again").
   */
  function rowState(card: ClueCard): { text: string; warn?: boolean } | null {
    const st = sendState(session, s, card);
    if (st === 'unsent') return null;
    if (st === 'edited') return { text: 'changed in the editor: off the phones until ↻ Send again', warn: true };
    const seen = seenBy(card);
    const late = lateFor(card);
    const f = cardFileCounts(game, session, card);
    const out = [st === 'changed' ? 'changed:' : seen.length ? `✓ seen${seen.length < sentSeats(session, s, card.id).length ? ` by ${seen.map(name).join(', ')}` : ''}` : 'sent'];
    if (filesOn && f.going) out.push(`uploading ${Math.min(f.files, f.up + 1)} of ${f.files - f.failed}…`);
    if (late.length) {
      const whose = late.map((l) => (l.by ? `${l.by}’s phone (${name(l.seat)})` : `${name(l.seat)}’s new phone`));
      out.push(`${nameList(whose)} ${late.length > 1 ? 'haven’t' : 'hasn’t'} got it: ↻ Send again`);
    }
    return { text: out.join(' · '), ...(late.length ? { warn: true } : {}) };
  }
  /** What of a card won't reach the phones, counted ("🖼 1 picture won't reach the phones (too big for phones)"). */
  const leftOf = (card: ClueCard): string => leftLine(lefts(card));

  /**
   * The guess the guesser typed on their phone (PartnerRules.typeGuess): the guesser's now (after ⇄ Swap, not the old
   * guesser's), from this play of the tile.
   */
  const guess = $derived.by(() => {
    const a = session.remote?.answers;
    const seat = roles.guesser;
    if (!rules.typeGuess || s.stage === 'pick' || !seat || a?.id !== partnerAnswerId(s)) return null;
    const g = a.seats[seat];
    return g && typeof g.text === 'string' ? { seat, text: g.text, by: g.by } : null;
  });

  /** 📋 Copy words: the card's words and links, named for who they're for. Nothing of it shows on screen. */
  function copyWords(card: ClueCard, n: number): void {
    const to = recipients(card).map((t) => toName(session, t));
    void copyText(cardCopyText(game, card, n, where, to), `${clueCardWords(card, n - 1, true)}’s words copied: paste them to ${to.join(', ') || 'them'}`);
  }

  /** 📋 Copy picture: the card's first picture (or GIF, as a still), to paste into a DM. */
  function copyPicture(card: ClueCard, n: number): Promise<void> {
    return copyCardPicture(game, card, clueCardWords(card, n - 1, true), recipients(card).map((t) => toName(session, t)).join(', ') || 'them');
  }

  // The main button, in the panel's main cell: spin, then show the question, then start the clock (then the clue's own).
  offerNext('partner', () => {
    const st = session.partner;
    if (!st) return null;
    if (st.stage === 'pick') {
      // (Teams, the picker's own team playing it: who on it describes comes first, when there's anyone to describe to.
      // The status line goes by the same step.)
      const step = partnerPickStep(session, st, people.length);
      if (step === 'describer')
        return { label: '🎡 Spin for the describer', key: 'W', title: `W, Enter or N: the wheel spins over the people on ${name(st.pickerId)} with a phone here`, disabled: spinning, run: onmemberspin };
      if (step === 'show') return { label: '▶ Show question', key: '⏎', title: 'Enter or N: the question goes on screen (nothing is sent to anyone)', run: onshow };
      const who = st.pickerId ? (session.players.find((p) => p.id === st.pickerId)?.name ?? '') : '';
      const why =
        step === 'picker'
          ? `${noun === 'team' ? 'Which team' : 'Who'} picked it? Press their number first (1–${Math.min(9, session.players.length) || 9})`
          : step === 'nobody'
            ? `Nobody to partner with: tick “${who} can be on the wheel” to play it Solo, or press Esc`
            : '';
      return { label: '🎡 Spin for a partner', key: 'W', title: why || 'W, Enter or N: the wheel spins over the other players', disabled: !!why, run: onspin };
    }
    // (Judged meanwhile, by a click: the clue's own next, the answer. The answer shown meanwhile (R): no countdown over
    // it, the clue's own next, ▦ Done.)
    if (st.stage === 'distribute' && !verdict.judged && !session.revealed) {
      const unsentNow = cardsOn ? cards.filter((c) => !cardSends(st, c.id).length && cardRecipients(session, st, c).length) : [];
      if (unsentNow.length) {
        // (Never more cards than the buzzer room takes: ✖ Take one back first.)
        const go = (t: Session) => sendCards(t, t.partner!, unsentNow);
        const full = roomCardsFull(game, session, go);
        return { label: '📤 Send and start', key: '⏎', title: full ? cardsFullText(game, session, go) : 'Enter or N: the cards not sent yet go to their phones, and the countdown starts', disabled: full, run: onclock };
      }
      return { label: '⏱ Start the clock', key: '⏎', title: cardsOn ? 'Enter or N: the countdown starts' : 'Enter or N: the countdown starts (copy the cards to their players first)', run: onclock };
    }
    return null;
  });
</script>

{#snippet chip(id: Id, on: boolean, label: string, onclick: () => void, disabled = false, title = '', key = 0, nophone = false)}
  {@const p = byId[id]}
  <button
    class="chip"
    style:border-color={p?.color}
    style:background={on ? p?.color : undefined}
    style:color={on ? textOn(p?.color ?? '#888') : undefined}
    aria-pressed={on}
    aria-label={label}
    {disabled}
    title={title || undefined}
    {onclick}
  >
    {#if key && key <= 9}<span class="key">{key}</span>{/if}{p?.name}{#if on}&nbsp;✓{/if}{#if partOf(id)}<span class="part">{partOf(id)}</span>{/if}{#if nophone}<span class="part" aria-hidden="true">📵</span>{/if}
  </button>
{/snippet}

<!-- Teams: one person on the picker's team (the describer, spec §10.2), in the team's colour. -->
{#snippet personChip(text: string, on: boolean, label: string, onclick: () => void, disabled = false, part = '', title = '')}
  {@const c = picker?.color ?? '#888'}
  <button
    class="chip"
    style:border-color={c}
    style:background={on ? c : undefined}
    style:color={on ? textOn(c) : undefined}
    aria-pressed={on}
    aria-label={label}
    {disabled}
    title={title || undefined}
    {onclick}
  >
    {text}{#if on}&nbsp;✓{/if}{#if part}<span class="part">{part}</span>{/if}
  </button>
{/snippet}

{#snippet filesRow()}
  {#if filesLine}
    <div class="row small" data-partner-files>
      <span class:warn={!filesOn}>{filesLine.text}</span>
      {#if filesLine.ready}
        <button class="small" onclick={getReady} title="Puts the cards’ pictures and videos in the buzzer room now, so sending is instant. No phone gets them until you send their card.">⇡ Get it ready now</button>
      {/if}
    </div>
  {/if}
{/snippet}

{#snippet parts()}
  <span class="parts" data-partner-parts>{roles.solo && !(sameTeamOn && (member || people.length > 1)) ? '🎯' : G.icon} {partsSaid.replace(' · ', ' · 🎯 ')}</span>
  <button
    class="small ghost"
    onclick={swap}
    disabled={roles.solo || verdict.judged}
    title={roles.solo
      ? 'Solo: one player plays both parts'
      : verdict.judged
        ? 'It’s judged: undo that first (Ctrl+Z) to change the parts'
        : `Turn the parts round: the ${lowerWord(words.giver)} becomes the ${lowerWord(words.guesser)} (the cards that follow a part go with it, and so do the points)`}>⇄ Swap</button
  >
{/snippet}

<div class="partner" data-partner-panel>
  {#if s.stage === 'pick'}
    <div class="row">
      <b>🤝 Partner clue!</b>
      {#if picker}
        <span>{picker.name} picked it.</span>
        <button class="ghost small" aria-haspopup="menu" onclick={pickerMenu} disabled={!!wheel} title={wheel ? 'Close the wheel first' : `Someone else picked it (click: the number keys choose the partner)`}>change ▾</button>
      {:else}
        <span class="warn">{noun === 'team' ? 'Which team' : 'Who'} picked it?</span>
      {/if}
    </div>
    {#if !picker}
      <div class="row">
        {#each session.players as p, i (p.id)}
          {@render chip(p.id, false, `${p.name} picked it`, () => choosePicker(p.id), false, i < 9 ? `Key ${i + 1}` : '', i + 1)}
        {/each}
      </div>
    {:else}
      <div class="row">
        <span class="muted"
          >{partner
            ? `🤝 ${picker.name}${partner.id !== picker.id ? ` + ${partner.name}` : sameTeamOn ? (member ? ` · ${member.name} ${G.verb}` : ' · its own team') : ' · Solo'}${s.how ? HOW[s.how] : ''}`
            : 'Partner: spin the wheel, or choose →'}</span
        >
        {#each session.players as p, i (p.id)}
          {@const off = p.id === picker.id && !s.includePicker}
          {@render chip(
            p.id,
            s.partnerId === p.id,
            `${p.name} is the partner`,
            () => choosePartner(p.id),
            spinning || off,
            off ? `${p.name} picked it: tick “${p.name} can be on the wheel” to make it Solo` : spinning ? 'Still spinning' : i < 9 ? `Key ${i + 1}: overrule the wheel` : '',
            i + 1,
          )}
        {/each}
        <label class="check small" title={wheel ? 'Close the wheel first (✎ Edit wheel puts them on it for one spin)' : 'Put the player who picked it on the partner wheel too: if it lands on them, they play it alone (Solo)'}>
          <input type="checkbox" checked={!!s.includePicker} disabled={!!wheel} onchange={(e) => includePicker(e.currentTarget.checked)} />
          {picker.name} can be on the wheel
        </label>
        {#if s.partnerId && candidates.length}
          <button class="small" onclick={onspin} disabled={spinning} title="W: the wheel spins again (its landing replaces your choice)">{s.how === 'only' ? '🎡 Spin anyway' : '↻ Spin again'} <kbd aria-hidden="true">W</kbd></button>
        {/if}
      </div>
      {#if !candidates.length}
        <span class="warn small">Nobody to partner with: tick “{picker.name} can be on the wheel” to play it Solo, or press Esc.</span>
      {/if}
      {#if noun === 'team' && cardsOn}
        <!-- Teams: the picker's own team plays it, one of them describing to the rest (spec §10.2). -->
        <div class="row" data-partner-same>
          <label class="check small" title={wheel ? 'Close the wheel first' : `${picker.name} plays it: one person on it is the ${lowerWord(words.giver)} for the rest, chosen by a wheel of the people on it (one award to the team)`}>
            <input type="checkbox" checked={sameTeamOn} disabled={!!wheel} onchange={(e) => setSameTeam(e.currentTarget.checked)} />
            Partner from the same team
          </label>
          {#if sameTeamOn && people.length > 1}
            <span class="muted small">{lowerWord(words.giver)}:</span>
            {#each people as m (m.id)}
              {@render personChip(m.name, member?.id === m.id, `${m.name} is the ${lowerWord(words.giver)}`, () => chooseMember(m.id), spinning, '', spinning ? 'Still spinning' : `${m.name} is the ${lowerWord(words.giver)} for the rest of ${picker.name}`)}
            {/each}
            {#if member}
              <button class="small" onclick={onmemberspin} disabled={spinning} title="The wheel of the people on {picker.name} spins again (its landing replaces your choice)">↻ Spin again</button>
              {#if !memberHere}<span class="warn small">{member.name} isn’t on {picker.name} here any more: choose again</span>{/if}
            {/if}
          {:else if sameTeamOn}
            <span class="warn small" data-partner-nobody>{picker.name} has {people.length ? 'one phone' : 'no phone'} here: {nobodyTo} (it plays Solo; untick to play team against team)</span>
          {/if}
        </div>
      {/if}
    {/if}
    <div class="row">{@render parts()}</div>
    <div class="row small" data-partner-cards>
      {#if cards.length}
        🤫 {cards.length} card{cards.length === 1 ? '' : 's'}: {#each cards as card, i (card.id)}{i ? ' · ' : ''}{clueCardName(card, i)} → {recipientsText(session, s, rules, card)}{/each}
      {:else}
        <span class="muted">🤫 No cards on this clue: {autoClock ? 'the question starts the clock' : 'start the clock yourself (T) once the question is up'}.</span>
      {/if}
    </div>
    {#if cards.length}
      <span class="muted small" data-partner-readiness>{readiness}</span>
      {@render filesRow()}
    {/if}
  {:else}
    <div class="row">
      {#if cards.length && !verdict.judged}
        <!-- (How to hand them out is its tooltip: in one window, a row less keeps the judge row in view with six cards.) -->
        <b
          title={cardsOn
            ? `📤 Send each card to its ${noun}s’ phones (📋 copy it to anyone without one). The points follow the parts, not the cards.`
            : `📋 Copy each card to its ${noun}s (paste it in a DM): phones only show who plays. The points follow the parts, not the cards.`}>📤 Distribute</b
        >
      {:else}
        <b>🤝 Partner clue</b>
      {/if}
      {@render parts()}
      <button
        class="ghost small"
        aria-haspopup="menu"
        onclick={partnerMenu}
        disabled={verdict.judged}
        title={verdict.judged ? 'It’s judged: undo that first (Ctrl+Z) to choose another partner' : 'Choose another partner (the cards that follow a part go with it)'}>change partner ▾</button
      >
    </div>
    {#if verdict.judged}
      <!-- Judged: the list closes to one line a card (who it went to, and seen). An Undo opens it again. -->
      {#each cards as card, i (card.id)}
        {@const out = cardSends(s, card.id).length > 0}
        <div class="row small" data-card={i + 1}>
          {clueCardName(card, i)} → {out ? sentTo(session, s, card.id).map((t) => toName(session, t)).join(', ') : recipientsText(session, s, rules, card)}{#if out && seenBy(card).length}{' '}✓ seen{/if}
          {#if out}<button class="ghost small" onclick={() => ontakeback(card.id)} aria-label="Take {clueCardWords(card, i)} back" title="Takes it off the phones it went to">✖ Take back</button>{/if}
        </div>
      {/each}
    {:else if cards.length}
      <!-- (Three rows show; more scroll, so the judge row stays in view with up to six cards.) -->
      <div class="cardlist">
        {#each cards as card, i (card.id)}
          {@const n = i + 1}
          {@const w = clueCardWords(card, i)}
          {@const W = clueCardWords(card, i, true)}
          {@const nm = clueCardName(card, i)}
          {@const to = recipients(card)}
          {@const changed = !!s.deal?.[card.id]}
          {@const pics = cardItems(game, card).some((it) => it.kind === 'picture' || it.kind === 'gif')}
          {@const copyable = !!cardWords(card) || cardLinks(game, card).length > 0}
          {@const st = cardsOn ? sendState(session, s, card) : 'unsent'}
          {@const state = cardsOn ? rowState(card) : null}
          {@const left = cardsOn ? leftOf(card) : ''}
          <!-- (📋 when a player it goes to has no phone here, or the room can't put cards on phones.) -->
          {@const copying = !cardsOn || to.some((t) => !hasPhone(t.seat))}
          {@const sentNow = st === 'unsent' ? [] : sentSeats(session, s, card.id)}
          {@const seenNow = st === 'unsent' ? [] : seenBy(card)}
          <!-- One row a card: what's on it (counted), who gets it, how it stands on their phones, and its buttons. Its
               state is in its name, and each chip's, for a screen reader. -->
          <div class="row card" data-card={n} role="group" aria-label={`${W}: ${state ? state.text : cardsOn ? 'not sent' : recipientsText(session, s, rules, card)}`}>
            <b class="cname" title={nm}>{nm}</b>
            <span class="muted small">· {cardSummary(game, card)}</span>
            <span aria-hidden="true">→</span>
            {#if memberTo && member}
              {@render personChip(member.name, has(to, memberTo), `${W} to ${member.name}${seenNow.includes(memberTo.seat) && sentTo(session, s, card.id).some((t) => t.member?.id === member.id) ? ', seen' : sentTo(session, s, card.id).some((t) => t.member?.id === member.id) ? ', sent' : ''}`, () => toggle(card, memberTo), false, lowerWord(words.giver), `Only ${member.name}’s phone gets it`)}
            {/if}
            {#each session.players as p (p.id)}
              {@const nophone = cardsOn && !hasPhone(p.id)}
              {@const t = seatTo(p.id)}
              {@const how = seenNow.includes(p.id) ? ', seen' : sentNow.includes(p.id) ? ', sent' : ''}
              {@render chip(
                p.id,
                has(to, t),
                `${W} to ${t.except ? `the rest of ${p.name}` : p.name}${nophone ? ' (no phone here)' : ''}${how}`,
                () => toggle(card, t),
                false,
                nophone
                  ? `${p.name} has no phone here: copy the card to ${noun === 'team' ? 'the team' : 'them'} (📋), or show it in the 🪟 card window`
                  : t.except
                    ? `Every phone on ${p.name} but ${member?.name ?? 'the describer'}’s gets it`
                    : noun === 'team'
                      ? `Every phone on ${p.name} gets it (everyone on the team sees it)`
                      : '',
                0,
                nophone,
              )}
            {/each}
            {#if others.length}
              <button class="chip ghost" aria-pressed={others.every((id) => has(to, seatTo(id)))} onclick={() => everyoneElse(card)} aria-label="{W} to everyone else">Everyone else</button>
            {/if}
            <button class="chip ghost" aria-pressed={!to.length} onclick={() => setRecipients(session, s, card, [])} aria-label="{W} to nobody">Nobody</button>
            {#if !to.length}<span class="muted small">nobody yet</span>{/if}
            {#if changed}
              <span class="muted small">(changed)</span>
              <button class="ghost small" onclick={() => resetRecipients(s, card.id)} title="Back to who it goes to by default: {goesToLabel(rules, card.to, false)}" aria-label="{W}: back to {goesToLabel(rules, card.to, false)}">↺</button>
            {/if}
            {#if state}<span class="small" class:warn={state.warn} data-card-state>{state.text}</span>{/if}
            <span class="spacer"></span>
            {#if cardsOn}
              {#if st === 'unsent'}
                {@const full = to.length > 0 && sendFull(card)}
                <button class="small" onclick={() => sendOne(card, n)} disabled={!to.length || full} aria-label="Send {w}" title={full ? cardsFullText(game, session, sendGo(card)) : to.length ? `Sends it to ${to.map((t) => toName(session, t)).join(', ')} now (the countdown doesn’t start)` : 'Choose who gets it first'}>📤 Send</button>
              {:else}
                {#if st === 'changed'}
                  {@const full = changesFull(card)}
                  <button class="small" onclick={() => changes(card, n)} disabled={full} aria-label="Send {w}’s changes" title={full ? cardsFullText(game, session, changesGo(card)) : 'Sends it to whoever you added, and takes it back from whoever you took off'}>📤 Send changes</button>
                {:else}
                  <button class="small" onclick={() => again(card, n)} aria-label="Send {w} again" title="Sends it again under a new id: a phone that came late (a player on a new phone) gets it too, with what’s on the card now">↻ Send again</button>
                {/if}
                <button class="ghost small" onclick={() => ontakeback(card.id)} aria-label="Take {w} back" title="Takes it off every phone it went to">✖ Take back</button>
              {/if}
            {:else if inWindow(card)}
              {@const shown = inWindow(card)!}
              <span class="small" data-card-state>· in the 🪟 card window ({sentToTextOf(shown.to)})</span>
              <button class="ghost small" onclick={() => oncardtakeback(shown.id)} aria-label="Take {w} back" title="Takes it out of the 🪟 card window">✖ Take back</button>
            {:else if windowSeat(to)}
              {@const seat = windowSeat(to)!}
              <button class="small" onclick={() => showInWindow(card, n, seat)} aria-label="Show {w} to {name(seat)}" title="Shows it in the 🪟 card window, to {name(seat)} alone, until the tile closes">🪟 Show {name(seat)}</button>
            {/if}
            {#if copying}
              <button class="small" onclick={() => copyWords(card, n)} disabled={!to.length || !copyable}
                title={!to.length ? 'Choose who gets it first' : copyable ? `Copies “For ${to.map((t) => toName(session, t)).join(', ')} only…” with the card’s words and links, to paste in a DM` : 'This card has no words or links: 📋 Copy picture'}
                >📋 Copy words</button
              >
            {/if}
            {#if pics && canCopyPicture && (copying || !!left)}
              <button class="small" onclick={() => copyPicture(card, n)} disabled={!to.length} title={to.length ? 'Copies the card’s picture, to paste in a DM' : 'Choose who gets it first'}>📋 Copy picture</button>
            {/if}
          </div>
          {#if left}<div class="small warn left" data-card-left={n}>{left}</div>{/if}
        {/each}
      </div>
    {/if}
    {#if cards.length && !verdict.judged}
      {#if older}<span class="muted small" data-partner-readiness>{readiness}</span>{/if}
      {@render filesRow()}
    {/if}
    {#if guess}
      <div class="row small" data-partner-guess>
        ✍ {name(guess.seat)}{guess.by ? ` (${guess.by})` : ''}
        {#if dual || session.revealed}guessed: <b dir="auto">“{guess.text}”</b>{:else}sent a guess (viewers can see this window: it shows here once the answer is up){/if}
      </div>
    {/if}
    <!-- ✔ Got it / ✘ Missed: what each gives, from the question on (a click judges while handing out the cards too; the
         keys wait for the clock). Judged, the line reads the marks; an Undo brings the buttons back. (Clicked, they go
         off: Play's partnerJudge gives the keys to the main button.) A steal's row takes its place, its marks first:
         the players list above keeps its room, the stealers' quick buttons in view. -->
    {#if !steal}
      <div class="row judge" data-partner-judge>
        <button class="good" onclick={() => onjudge(true)} disabled={verdict.judged} title={verdict.judged ? 'Judged: Ctrl+Z takes it back' : judgeKeys ? 'Enter (nobody picked)' : 'Scores both now (Enter starts the clock first)'}
          >✔ Got it{#if judgeKeys}{' '}<kbd aria-hidden="true">⏎</kbd>{/if}</button
        >
        {#if !verdict.judged}<span class="small shares" data-judge-got>{sharesText(gotShares, name, sym)}{already}</span>{/if}
        <button class="bad" onclick={() => onjudge(false)} disabled={verdict.judged} title={verdict.judged ? 'Judged: Ctrl+Z takes it back' : judgeKeys ? 'Shift+Enter (nobody picked)' : 'Scores both now'}
          >✘ Missed{#if judgeKeys}{' '}<kbd aria-hidden="true">⇧⏎</kbd>{/if}</button
        >
        {#if verdict.judged}
          <span class="small" data-judged>Judged: {marksText(s, marks, name, sym)}</span>
        {:else}
          <span class="small shares" data-judge-missed>{sharesText(missShares, name, sym)}{already}</span>
        {/if}
      </div>
    {:else}
      <!-- Steal on a miss: the others answer it as any clue (the buzzers open for them; the host can pick who). Each
           steal is its own step, as any award; an Undo of ✘ Missed closes the steal. -->
      <div class="row small steal" data-partner-steal>
        <span data-judged>Judged: {marksText(s, marks, name, sym)} ·</span>
        {#if steal.by}
          <b>🔔 {name(steal.by)} stole it</b>
        {:else if session.revealed}
          <span class="muted">🔔 Nobody stole it</span>
        {:else if !stealLeft.length}
          <span class="muted">🔔 Nobody stole it: everyone missed (👁 Reveal answer)</span>
        {:else}
          <b>🔔 Steal!</b>
          <span>{buzzerOn(game.settings) ? 'The others can buzz in, or choose who:' : 'Who steals it?'}</span>
          {#each stealers as p (p.id)}
            {@const missed = !!marks[p.id] && !marks[p.id].right}
            {@const i = session.players.indexOf(p)}
            {@render chip(
              p.id,
              selected.includes(p.id),
              `${p.name} steals it`,
              () => onpick(p.id),
              missed,
              missed ? `${p.name} missed the steal` : i < 9 ? `Key ${i + 1}: ${p.name} answers it` : `${p.name} answers it`,
              i + 1,
            )}
          {/each}
          <span class="muted">Enter: right +{formatPoints(value, sym)} · Shift+Enter: wrong −{formatPoints(value, sym)}</span>
        {/if}
      </div>
    {/if}
  {/if}
  {#if !dual}
    <span class="exposed">⚠ Viewers can see this window: they can read a card’s name here, never what’s on it (check the cards in the editor’s 🤫 Card tabs).</span>
  {/if}
</div>

<style>
  .partner {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    border: 1px solid #2bb673;
    border-radius: 8px;
    background: rgba(43, 182, 115, 0.1);
  }
  .cardlist {
    display: flex;
    flex-direction: column;
    gap: 6px;
    /* (Three rows, and a sliver of the next to show there are more.) */
    max-height: 100px;
    overflow-y: auto;
  }
  .card {
    padding-top: 4px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
  /* (A long name is cut: the tooltip has it whole.) */
  .cname {
    max-width: 22ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chip {
    border-width: 2px;
    padding: 2px 8px;
    font-size: 12px;
  }
  .chip.ghost {
    border-style: dashed;
  }
  .key {
    font-size: 12px;
    opacity: 0.7;
    margin-right: 4px;
  }
  .part {
    margin-left: 4px;
    font-size: 12px;
    opacity: 0.8;
  }
  .small {
    font-size: 12px;
  }
  .warn {
    color: var(--warn);
  }
  .exposed {
    color: var(--warn);
    font-size: 12px;
  }
  .judge {
    padding-top: 4px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
  .steal {
    padding-top: 4px;
  }
  .shares {
    margin-right: 8px;
  }
</style>
