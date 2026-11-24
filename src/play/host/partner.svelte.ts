/**
 * 🤝 Partner clues, the host screen's part (docs/PARTNER-CLUES-SPEC.md §6, §7; moved out of Play.svelte, which calls
 * createPartner once, where this code was): PARTNER UP!, the wheels that pick the partner and the describer, the
 * cards handed out and taken back, the clock, the steal, and judging; and leaving a clue (↩ Put back, ◀ Back). Play's
 * own state comes in through `host`, as getters, setters and functions.
 */
import { app, hint, toast } from '../../lib/app.svelte';
import { clueCardWords, formatPoints, newId } from '../../lib/model';
import {
  backToBoard,
  clueName,
  clueScored,
  currentClueInfo,
  nameList,
  playerName,
  score,
  ownPlayers,
  clueMarks,
  judgePartner,
  partnerSteal,
  stealersLeft,
} from '../../lib/session';
import {
  cardCopyText,
  cardId,
  cardRecipients,
  cardSends,
  cardSlides,
  lowerWord,
  markCopied,
  marksText,
  sentSeats,
  partnerCandidates,
  partnerRoles,
  partnerRules,
  partnerShares,
  partnerVerdict,
  partWords,
  recipientsText,
  sendCards,
  setDescriber,
  setPartner,
  setPartnerPicker,
  takeBack,
  toName,
} from '../../lib/partner';
import { cardLinks, cardWords, phoneCard } from '../../lib/phonecard';
import { copyCardPicture } from './cardcopy';
import { copyText } from '../standings';
import { phoneCan } from '../../lib/cardfiles.svelte';
import { cardsOut, sentSlide, takeBackCard } from '../../lib/sentcards';
import { type GoSource, type Step } from './goon';
import { overlayDoneAt, startTimer, tileToolUp, timerRemaining, toggleTimer, toolOverlay, type TimerState } from '../../lib/live';
import { cardsFullText, roomCardsFull, teamsOn } from '../../lib/buzz';
import { type HostState } from '../../lib/buzzproto';
import { forgetCardFiles, remote, roomHasCards, roomMembers, sendHostState } from '../../lib/remote.svelte';
import { openMemberWheel, openPartnerWheel, scoreCardsLeft, spinWheel } from '../../lib/overlay';
import { announce } from '../../lib/announce';
import type { HostAsk } from './slots.svelte';
import { VERBS } from './verbs';
import { KEY_GUARD_MS } from './guard';
import { focusMain } from './focus';
import { playCue } from '../cues';
import { groupPops } from '../flow';
import type { Game, SentCard, Session } from '../../lib/model';
import type { Pop } from '../../lib/live';
import { tick, untrack } from 'svelte';

/** What the partner clues' part reads from (and does through) the rest of the host screen: Play's own, live. */
export interface PartnerHost {
  readonly game: Game;
  readonly session: Session;
  readonly info: ReturnType<typeof currentClueInfo>;
  readonly phonesOn: boolean;
  readonly pregameTeams: boolean;
  /** The currency symbol. */
  readonly sym: string;
  /** The blue button's step now. */
  readonly mainNow: Step | null;
  readonly timerSeconds: number | null;
  /** Who's selected, and the Amount box (Play keeps them). */
  selected: string[];
  amount: number | null;
  /** Whether the blue button's ring is off (Play keeps it). */
  ringOff: boolean;
  /** The score cards' question last asked about (a plain value: read it from `host` each time). */
  cardsAsked: string;
  /** The key that's pressing the blue button now, if a key is (a plain value: read it from `host` each time). */
  readonly quickKey: KeyboardEvent | null;
  readonly timerSteps: Map<string, { clue: string | undefined; timer: TimerState; at: number }>;
  toolBusy(): boolean;
  roomState(): HostState;
  goOn(source: GoSource, st?: Step | null): void;
  award(sign: 1 | -1, ids?: string[], amt?: number | null, picker?: boolean, verdict?: boolean): void;
  stopTimer(what: 'right' | 'wrong' | 'reveal', ownPlayer?: boolean): void;
  pop(p: Omit<Pop, 'id'>): void;
  clueTimer(): number | null;
  clockKey(more: boolean): void;
  autoTimer(): void;
}

export type Partners = ReturnType<typeof createPartner>;

/** Call once, from Play's script (its effects belong to Play). */
export function createPartner(host: PartnerHost) {
  const game = $derived(host.game);
  const session = $derived(host.session);
  const info = $derived(host.info);
  const phonesOn = $derived(host.phonesOn);
  const pregameTeams = $derived(host.pregameTeams);
  const sym = $derived(host.sym);
  const mainNow = $derived(host.mainNow);
  const timerSeconds = $derived(host.timerSeconds);
  const selected = $derived(host.selected);
  const amount = $derived(host.amount);
  const { timerSteps, toolBusy, roomState, goOn, award, stopTimer, pop, clueTimer, clockKey, autoTimer } = host;
  // ---------- 🤝 Partner clues (docs/PARTNER-CLUES-SPEC.md §6, §7) ----------

  /** The partner clue that's open (its state, for the clue on screen). */
  const partner = $derived(session.phase === 'clue' && info && session.partner?.clue === info.clue.id ? session.partner : null);
  /**
   * When the partner clue's question went up, when its clock started, and whether the cards went out with it (here only,
   * not saved: a reload acts at once).
   */
  let partnerShownAt = 0;
  let partnerClockAt = 0;
  let partnerSentWithClock = false;
  /** T (or the status line's ⏱ Start) made it live, with nothing to send: its first Enter only says so. */
  let partnerLiveByT = false;
  /**
   * The open partner clue's cards go to phones (a room that takes them), not only by 📋 copying. Not while the room has
   * turned this window away (it ended, or another window took it): a send then would reach no phone.
   */
  const phoneCards = $derived(phonesOn && !!remote.code && remote.status !== 'off' && remote.status !== 'error' && roomHasCards());
  /** The open partner clue's cards that 📤 Send and start would send: not sent yet, with someone to go to. */
  const unsentCards = (): ReturnType<typeof cardSlides> =>
    partner && info && phoneCards
      ? cardSlides(info.clue).filter((c) => !cardSends(partner, c.id).length && cardRecipients(session, partner, c).length > 0)
      : [];

  /** The partner wheel is up on stage (not the member wheel): the picker's phone says it's spinning for their partner. */
  function partnerWheelUp(): boolean {
    const o = toolOverlay(app.live);
    return !!session.partner && o?.kind === 'wheel' && o.partnerFor === session.partner.clue && !o.members;
  }

  /** A wheel, dice or a roll-off still going on stage (no word said, unlike toolBusy). */
  function toolGoing(): boolean {
    const o = toolOverlay(app.live);
    return !!o && (o.kind === 'dice' || o.kind === 'wheel' || o.kind === 'rolloff') && Date.now() < overlayDoneAt(o);
  }

  /**
   * 🎡 Spin for a partner (W): the partner wheel, over the other players (the picker is off it unless they can be on it),
   * spun at once; W again while it's up spins it again. Its landing makes the partner (partnerLanded).
   */
  function partnerSpin(): void {
    const s = partner;
    if (!s || s.stage !== 'pick') return;
    if (!s.pickerId) return hint(`${pregameTeams ? 'Which team' : 'Who'} picked it? Press their number first (1–${Math.min(9, session.players.length) || 9})`);
    if (!partnerCandidates(session, s).length)
      return hint(`Nobody to partner with: tick “${playerName(session, s.pickerId)} can be on the wheel” to play it Solo, or ${VERBS.putBack.label} · ⇧Esc`);
    if (toolBusy()) return;
    // (The scores over it: the wheel comes back first.)
    if (app.live.overlay?.kind === 'scoreboard') app.live.overlay = app.live.overlay.under ?? null;
    const o = app.live.overlay;
    if (o?.kind !== 'wheel' || o.partnerFor !== s.clue || o.members) openPartnerWheel(app.live, session, s, playerName(session, s.pickerId));
    spinWheel(app.live, session, game);
  }

  /**
   * Teams, the picker's own team playing it with a room that takes cards: who on it describes to the rest is still to
   * choose, and there's someone to describe to (spec §10.2). W spins the member wheel then.
   */
  function describerWanted(): boolean {
    const s = partner;
    return (
      !!s &&
      s.stage === 'pick' &&
      teamsOn(game.settings) &&
      phoneCards &&
      !!s.pickerId &&
      s.partnerId === s.pickerId &&
      !s.member &&
      roomMembers(s.pickerId).length > 1
    );
  }

  /**
   * 🎡 Spin for the describer (W): the member wheel over the people on the picker's team with a phone here, spun at
   * once. Its landing is who describes (partnerLanded); never a picker, never a roll's players.
   */
  function memberSpin(): void {
    const s = partner;
    if (!s || s.stage !== 'pick' || !s.pickerId || s.partnerId !== s.pickerId) return;
    const people = roomMembers(s.pickerId);
    if (people.length < 2) return hint(`${playerName(session, s.pickerId)} has ${people.length ? 'one phone' : 'no phone'} here: nobody to play it with`);
    if (toolBusy()) return;
    if (app.live.overlay?.kind === 'scoreboard') app.live.overlay = app.live.overlay.under ?? null;
    const o = app.live.overlay;
    // (A new wheel when someone joined or left the team since it opened, unless the host edited this one.)
    const same =
      o?.kind === 'wheel' && o.partnerFor === s.clue && !!o.members && (!!o.pool || o.segments.map((x) => x.id).join() === people.map((m) => m.id).join());
    if (!same) {
      const team = session.players.find((p) => p.id === s.pickerId);
      openMemberWheel(app.live, s, `${partWords(partnerRules(info!.clue)).giver} for ${team?.name ?? '?'}`, team?.color ?? '#888888', people);
    }
    spinWheel(app.live, session, game);
  }

  /**
   * The partner wheel landed (or was closed early): who it landed on is the partner, once per spin, and only while the
   * partner is still being chosen. Not before: the panel, the phones and the stream name nobody until the wheel does.
   * The wheel notes the spin it applied (partnerLanded, kept through a reload), so a partner the host chose after the
   * landing stays, and a spin still going when the page reloaded applies when it lands.
   */
  function partnerLanded(o: {
    nonce: string;
    partnerFor?: string;
    members?: true;
    spin: { startedAt: number } | null;
    result: number | null;
    segments: { id: string; label: string }[];
  }): void {
    if (!o.partnerFor || !o.spin || o.result === null) return;
    const live = toolOverlay(app.live);
    // (Closed or replaced meanwhile: closing it applied its landing already.)
    if (live?.kind !== 'wheel' || live.nonce !== o.nonce || live.partnerLanded === o.spin.startedAt) return;
    live.partnerLanded = o.spin.startedAt;
    const s = session.partner;
    // The member wheel: who on the picker's team describes (the picker's team still plays it).
    if (o.members) {
      const seg = o.segments[o.result];
      if (!s || s.clue !== o.partnerFor || s.stage !== 'pick' || !seg || !s.pickerId || s.partnerId !== s.pickerId) return;
      setDescriber(s, { id: seg.id, name: seg.label });
      return announce(`${seg.label} is the ${info ? lowerWord(partWords(partnerRules(info.clue)).giver) : 'describer'} for ${playerName(session, s.pickerId)}`);
    }
    const id = o.segments[o.result]?.id;
    if (!s || s.clue !== o.partnerFor || s.stage !== 'pick' || !id || !setPartner(session, s, id, 'wheel')) return;
    announce(
      id === s.pickerId ? `${playerName(session, id)} plays it alone` : `${playerName(session, id)} is ${playerName(session, s.pickerId ?? '')}’s partner`,
    );
  }
  // Each spin of the partner wheel, wherever it was started (W, Spin!, a click on the stage): its landing, when it lands.
  $effect(() => {
    const o = toolOverlay(app.live);
    if (o?.kind !== 'wheel' || !o.partnerFor || !o.spin || o.result === null) return;
    const landing = {
      nonce: o.nonce,
      partnerFor: o.partnerFor,
      members: o.members,
      spin: { startedAt: o.spin.startedAt },
      result: o.result,
      segments: $state.snapshot(o.segments),
    };
    const wait = overlayDoneAt(o) - Date.now();
    if (wait <= 0) return void untrack(() => partnerLanded(landing));
    const t = setTimeout(() => partnerLanded(landing), wait);
    return () => clearTimeout(t);
  });

  /** 1–9 on PARTNER UP!: who picked it (nobody marked yet), else the partner, overruling the wheel. */
  function partnerNumber(n: number): void {
    const p = session.players[n - 1];
    if (!partner || !p) return;
    if (!partner.pickerId) partnerPicker(p.id);
    else partnerChoose(p.id);
  }
  /** Who picked it, on PARTNER UP! (their number, or the check before going on). */
  function partnerPicker(id: string): void {
    const s = partner;
    if (!s || s.stage !== 'pick') return;
    setPartnerPicker(session, s, id);
    announce(`${playerName(session, id)} picked it`);
  }
  /** The partner by hand, overruling the wheel (their number, or the check). */
  function partnerChoose(id: string): void {
    const s = partner;
    if (!s || s.stage !== 'pick' || !s.pickerId) return;
    const name = playerName(session, id);
    if (toolGoing()) return hint('Still spinning: wait for it to land');
    if (!setPartner(session, s, id, 'host')) return hint(`${name} picked it: tick “${name} can be on the wheel” to make it Solo`);
    announce(id === s.pickerId ? `${name} plays it alone` : `${name} is ${playerName(session, s.pickerId)}’s partner`);
  }
  /** Teams, the picker's own team playing it: who on it describes (the check's choice; the 🤝 box has its own). */
  function partnerDescriber(id: string): void {
    const s = partner;
    if (!s?.pickerId || s.stage !== 'pick' || !info) return;
    if (toolGoing()) return hint('Still spinning: wait for it to land');
    const m = roomMembers(s.pickerId).find((x) => x.id === id);
    if (!m) return;
    setDescriber(s, m);
    announce(`${m.name} is the ${lowerWord(partWords(partnerRules(info.clue)).giver)} for ${playerName(session, s.pickerId)}`);
  }
  /** Nobody else to partner with: the picker plays it alone (Solo), as ticking them onto the wheel and choosing them. */
  function partnerSolo(): void {
    const s = partner;
    if (!s?.pickerId || s.stage !== 'pick') return;
    s.includePicker = true;
    if (setPartner(session, s, s.pickerId, 'host')) announce(`${playerName(session, s.pickerId)} plays it alone`);
  }

  /**
   * Show question ▶ (PARTNER UP!'s blue button): the question on stream, and the 📤 list of who gets each card (nothing
   * goes anywhere by itself). A clue with no cards has nothing to hand out: its countdown starts now, as on a Daily Double.
   */
  function partnerShow(): void {
    const s = partner;
    if (!s || s.stage !== 'pick' || !info) return;
    if (!s.partnerId) return hint('Choose a partner first: spin the wheel (W) or press their number');
    if (toolBusy()) return;
    // The partner wheel goes (its landing is in).
    const o = toolOverlay(app.live);
    if (o?.kind === 'wheel' && o.partnerFor) app.live.overlay = null;
    const hasCards = cardSlides(info.clue).length > 0;
    s.stage = hasCards ? 'distribute' : 'live';
    partnerShownAt = Date.now();
    partnerLiveByT = false;
    host.selected = [];
    host.amount = info.value;
    if (!hasCards) {
      autoTimer();
      partnerClockAt = partnerShownAt;
      partnerSentWithClock = false;
    } else partnerTimerStarted();
  }

  /**
   * 📤 Send and start (or ⏱ Start the clock): every card not sent yet goes to its phones, when the room takes cards
   * (copied by hand otherwise), and the countdown starts. Not over the answer.
   */
  function partnerClock(): void {
    const s = partner;
    if (!s || s.stage !== 'distribute' || !info) return;
    if (session.revealed) return hint('The answer is showing: Esc goes back to the board');
    // (Never more cards than the buzzer room takes: a send over that waits for a ↩ Take back.)
    const unsent = unsentCards();
    const go = (t: Session) => sendCards(t, t.partner!, unsent);
    if (unsent.length && roomCardsFull(game, session, go)) return hint(cardsFullText(game, session, go));
    const went = phoneCards ? sendCards(session, s, unsent) : [];
    if (went.length)
      announce(
        went
          .map((c) => `${clueCardWords(c, cardSlides(info.clue).indexOf(c), true)} sent to ${recipientsText(session, s, partnerRules(info.clue), c)}`)
          .join('. '),
      );
    s.stage = 'live';
    partnerClockAt = Date.now();
    partnerSentWithClock = went.length > 0;
    partnerLiveByT = false;
    if (!app.live.timer || app.live.timer.expired) startTimer(app.live, timerSeconds || clueTimer() || game.settings.defaultTimerSeconds || 30);
    else if (app.live.timer.startedAt === null) toggleTimer(app.live);
    // The main button takes the keys again (Next slide, or the answer).
    void tick().then(focusMain);
  }

  /**
   * T or the status line's ⏱ Start started the countdown (or let it go on), or it was running as the question went up:
   * a partner clue handing out its cards with none waiting for a phone goes live with it, as ⏱ Start the clock does,
   * sending nothing, and its first Enter only says the clock is running (so "T, then Enter" never judges by habit).
   * With phone cards waiting it's the clock only: Enter still sends them (📤 Send the cards).
   */
  function partnerTimerStarted(): void {
    const s = partner;
    const t = app.live.timer;
    if (!s || s.stage !== 'distribute' || partnerJudged || session.revealed || !t || t.startedAt === null || t.expired || unsentCards().length) return;
    s.stage = 'live';
    partnerClockAt = Date.now();
    partnerSentWithClock = false;
    partnerLiveByT = true;
  }

  /**
   * ↩ Take back: the card goes from every phone it was sent to (the room's next state hasn't it), and the room deletes
   * its files now unless another card still out uses them.
   */
  function partnerTakeBack(card: string): void {
    const s = partner;
    const c = info && s ? cardSlides(info.clue).find((x) => x.id === card) : undefined;
    if (!s || !c || !info) return;
    const n = cardSlides(info.clue).indexOf(c) + 1;
    const files = phoneCard(game, c, phoneCan(session)).items.flatMap((i) => ('file' in i.goes ? [i.goes.file] : []));
    takeBack(s, card);
    if (phonesOn && remote.status === 'online') {
      sendHostState(roomState(), true);
      forgetCardFiles(files);
    }
    announce(`${clueCardWords(c, n - 1, true)} taken back`);
  }

  /**
   * ↩ Take back a card sent with 🤫 Send a card… or from a tile's or the Final's panel: it goes from every phone it was
   * sent to (the room's next state hasn't it), and the room deletes its files now unless another card still out uses them.
   */
  function cardTakeBack(id: string): void {
    const c = session.cards?.find((x) => x.id === id);
    if (!c) return;
    const slide = sentSlide(game, c);
    const files = slide ? phoneCard(game, slide, phoneCan(session)).items.flatMap((i) => ('file' in i.goes ? [i.goes.file] : [])) : [];
    takeBackCard(session, id);
    if (phonesOn && remote.status === 'online') {
      sendHostState(roomState(), true);
      forgetCardFiles(files);
    }
    announce(`${c.label} taken back`);
  }

  /**
   * A 🎭 deal's cards were taken back (↩ Take back, a new deal, or the deal put away): they go from the phones now (the
   * room's next state hasn't them), and the room deletes their files unless another card still out uses them.
   */
  function dealGone(gone: SentCard[]): void {
    const files = gone.flatMap((c) => {
      const slide = sentSlide(game, c);
      return slide ? phoneCard(game, slide, phoneCan(session)).items.flatMap((i) => ('file' in i.goes ? [i.goes.file] : [])) : [];
    });
    if (phonesOn && remote.status === 'online') {
      sendHostState(roomState(), true);
      forgetCardFiles([...new Set(files)]);
    }
  }

  /** The open partner clue's marks since it opened, and whether both of the two have one (it's judged). */
  const partnerMarks = $derived(partner ? clueMarks(session, partner.clue, partner.at ?? 0) : {});
  const partnerJudged = $derived(!!partner && partnerVerdict(partner, partnerMarks).judged);
  /** The partner clue was missed with steals on, and someone can still steal it. */
  function stealOpen(): boolean {
    const steal = partnerSteal(session);
    return !!steal && !steal.by && stealersLeft(session.players, steal, partnerMarks).length > 0;
  }
  /** How a steal goes on. */
  const stealHint = (): string =>
    `🔔 A steal: ${phonesOn ? 'whoever buzzes in first answers, or press' : 'press'} the number of who steals it, then Enter (right) or Shift+Enter (wrong)`;

  /**
   * 📤 Send and start (or ⏱ Start the clock) by Enter or the check: never within a second of the question going up, so a
   * held or double press can't send before the host has looked at who gets which card. Live with no cards and no clock
   * yet: the clock, as T starts it. False: it waited, and said so.
   */
  function partnerHandOut(byKey: boolean): false | void {
    const s = partner;
    if (!s || s.stage === 'pick') return false;
    if (s.stage === 'live') return void clockKey(false);
    if (Date.now() - partnerShownAt < KEY_GUARD_MS) {
      hint(`The question just went up: ${byKey ? 'press Enter' : 'click'} again to ${unsentCards().length ? 'send the cards' : 'start the clock'}`);
      return false;
    }
    partnerClock();
  }

  /** 📋 Copy a partner card's words (or its picture, with none), to paste to its players in a DM: none of it on screen. */
  function partnerCopy(cardId: string): void {
    const s = partner;
    const cards = info ? cardSlides(info.clue) : [];
    const i = cards.findIndex((c) => c.id === cardId);
    if (!s || !info || !session.currentClue || i < 0) return;
    const card = cards[i];
    const to = cardRecipients(session, s, card).map((t) => toName(session, t));
    const W = clueCardWords(card, i, true);
    // (Noted, as the 🤝 box's 📋 notes it: once each card is copied, a click on the stage starts the clock.)
    markCopied(
      s,
      card.id,
      cardRecipients(session, s, card).map((t) => t.seat),
    );
    if (cardWords(card) || cardLinks(game, card).length)
      void copyText(cardCopyText(game, card, i + 1, clueName(game, session.currentClue), to), `${W}’s words copied: paste them to ${to.join(', ') || 'them'}`);
    else void copyCardPicture(game, card, W, to.join(', ') || 'them');
  }

  /**
   * ✔ Got it / ✘ Missed from the check before going on: pressed by a key, the keys' own guards first (a moment after the
   * clock started, the first Enter after T). False: it waited, and said so.
   */
  function checkJudge(got: boolean): false | void {
    if (host.quickKey) {
      if (partnerLiveByT && got) {
        partnerLiveByT = false;
        hint('Clock is running: Enter again for ✔ Got it');
        return false;
      }
      if (partnerTooSoon(host.quickKey)) return false;
    }
    partnerJudge(got);
  }

  /**
   * Enter or Shift+Enter judging or awarding by keys right after a partner clue's clock started (or its question, with no
   * cards) waits a moment: a double Enter can't turn the start into ✔ Got it.
   */
  function partnerTooSoon(e: KeyboardEvent): boolean {
    if (!partner || partner.stage !== 'live' || Date.now() - partnerClockAt >= KEY_GUARD_MS) return false;
    const again = selected.length
      ? 'press Enter again to give the points'
      : e.shiftKey
        ? 'press Shift+Enter again for ✘ Missed'
        : 'press Enter again to give ✔ Got it';
    // (A clue with no cards and ⚖ the countdown not starting by itself: only the question went up.)
    hint(`${partnerSentWithClock ? 'The cards just went out' : app.live.timer?.startedAt ? 'The clock just started' : 'The question just went up'}: ${again}`);
    return true;
  }

  /** What the partner clue's shares are of: the Amount box (the tile's value, unless the host changed it). */
  const partnerValue = (): number => (typeof amount === 'number' && Number.isFinite(amount) ? Math.abs(amount) : (info?.value ?? 0));

  /** "Judged: Bob ✔ +$400 · Ann ✔ +$200". */
  const judgedText = (): string => (partner ? `Judged: ${marksText(partner, partnerMarks, (id) => playerName(session, id), sym)}` : '');

  /**
   * ✔ Got it (`got`) or ✘ Missed on a partner clue (spec §6.6, §9.1): each of the two not yet scored on it gets their
   * part's share, in one undo step. ✔ Got it stops the countdown (kept for an Undo, as award does) and the guesser picks
   * next. Cards not handed out by then stay where they are.
   */
  function partnerJudge(got: boolean): void {
    const s = partner;
    if (!s || s.stage === 'pick' || !info) return;
    const batch = newId();
    const events = judgePartner(session, game, got, partnerValue(), batch);
    if (!events.length) return hint(`${judgedText()} (Ctrl+Z takes it back)`);
    partnerLiveByT = false;
    playCue(app.live, game, got ? 'right' : 'wrong');
    if (got) {
      const t = app.live.timer;
      if (t && !t.expired && timerRemaining(t) > 0) timerSteps.set(batch, { clue: info.clue.id, timer: $state.snapshot(t) as TimerState, at: Date.now() });
      stopTimer('right');
    }
    // (A 0 is a mark in the log, not a pop on stream.)
    for (const p of groupPops(
      events.filter((e) => e.delta),
      session.players,
      sym,
      game.theme?.value || '#ffcc00',
    ))
      pop(p);
    const each = events.map(
      (e) => `${playerName(session, e.playerId)} ${e.delta > 0 ? '+' : ''}${formatPoints(e.delta, sym)}, now ${formatPoints(score(session, e.playerId), sym)}`,
    );
    // Steal on a miss: the others can answer it now (the buzzers open for them: the buzz effect, as for any clue).
    const steal = events.some((e) => e.steal);
    announce(`${got ? 'Got it' : 'Missed'}: ${each.join('; ')}${steal ? `. A steal: ${phonesOn ? 'the others can buzz in' : 'who steals it?'}` : ''}`);
    host.selected = [];
    // The buttons that had the keys may be off now (✔ Got it, ⇄ Swap): they go on to the main button, the answer, not
    // to the nearest button left (▦ Done ▶ board, where a later Enter would close the clue).
    void tick().then(() => {
      const a = document.activeElement;
      if (!a || a === document.body || (a as HTMLButtonElement).disabled) focusMain();
    });
  }

  /**
   * A quick ✔ / ✘ on one of the two's score chips (with ⚖ Deduct on wrong on): that player alone, with their part's share
   * (a ✘ on the partner is usually 0, a mark all the same). Only the guesser's ✔ gives them the board.
   */
  function partnerQuick(id: string, got: boolean): void {
    const s = partner;
    if (!s || !info) return;
    const share = partnerShares(partnerValue(), partnerRules(info.clue), s, got).find((x) => x.id === id);
    if (!share) return award(got ? 1 : -1, [id], info.value, true, true);
    award(share.points > 0 ? 1 : share.points < 0 ? -1 : got ? 1 : -1, [id], Math.abs(share.points), partnerRoles(s).guesser === id, true);
  }

  /**
   * Enter / Shift+Enter on a partner clue (spec §6.5, §6.6, §6.11). On PARTNER UP!: the blue button, Show question ▶ (or
   * Next ▶ with the wheel up), asking first when something's left (who picked it, the partner). With players picked by
   * hand (1–9): ＋ Award / − Deduct, as on any clue. Handing out the cards: Enter is the 🤝 box's 📤 Send and start (or ⏱
   * Start the clock), never within a second of the question; Shift+Enter only says how to judge. Once the clock runs:
   * ✔ Got it / ✘ Missed. Never on a key repeat, nor a moment after the clock started. Returns whether it's done with
   * the key (false: award as on any clue).
   */
  function partnerEnter(e: KeyboardEvent): boolean {
    const s = partner;
    if (!s) return false;
    if (s.stage === 'pick') {
      if (!e.shiftKey && !e.repeat) goOn('enter', mainNow);
      return true;
    }
    if (e.repeat) return true;
    if (selected.length) return partnerTooSoon(e);
    if (partnerJudged) {
      const steal = partnerSteal(session);
      if (steal && !steal.by && !session.revealed) {
        // (Everyone who could steal it missed: nothing more to judge.)
        hint(stealOpen() ? stealHint() : 'Everyone missed the steal: R reveals the answer');
      } else hint(`${judgedText()} (Ctrl+Z takes it back)`);
      return true;
    }
    if (s.stage === 'distribute') {
      if (e.shiftKey)
        hint(
          session.revealed
            ? 'The answer is showing: click ✔ Got it or ✘ Missed, or Esc goes back to the board'
            : unsentCards().length
              ? 'Send the cards first (Enter), or click ✘ Missed'
              : 'Start the clock first (Enter), or click ✘ Missed',
        );
      else if (session.revealed) hint('The answer is showing: Esc goes back to the board');
      // (A tool over it, from the tools row: Enter puts it away, as its blue Next ▶ does.)
      else if (mainNow?.id === 'tool' || mainNow?.id === 'popreveal') goOn('enter', mainNow);
      else partnerHandOut(true);
      return true;
    }
    // (T made it live: its first Enter says so, and judges nothing.)
    if (partnerLiveByT && !e.shiftKey) {
      partnerLiveByT = false;
      hint('Clock is running: Enter again for ✔ Got it');
      return true;
    }
    if (!partnerTooSoon(e)) partnerJudge(!e.shiftKey);
    return true;
  }

  /** The partner wheel goes with its clue (back to the board, a player taken out): it's nobody's partner any more. */
  function dropPartnerWheel(): void {
    const o = app.live.overlay;
    if (o?.kind === 'wheel' && o.partnerFor) app.live.overlay = null;
    else if (o?.kind === 'scoreboard' && o.under?.kind === 'wheel' && o.under.partnerFor) o.under = undefined;
  }

  /**
   * The open clue's question hasn't shown yet (a Daily Double's splash, a partner clue's PARTNER UP!), so closing it
   * leaves the tile on the board. Not a partner clue already scored: taking out one of its two sends it back to
   * PARTNER UP!, but it was played.
   */
  const notPlayedYet = (): boolean => !!ownPlayers(session)?.setup && !Object.keys(partnerMarks).length;

  /**
   * Back to the board. The tile is marked used, unless the host cancelled (`keep`) or the Daily Double
   * question never showed.
   */
  function back(keep = false): void {
    // The tile's own wheel or dice goes with it (the scores over it too), as Esc closes it: not while it's still going,
    // and with a score effect not given yet the first Done says so. (↩ Put back takes it down without asking.)
    if (info && tileToolUp(app.live, info.clue)) {
      if (toolBusy()) return;
      const left = keep ? '' : scoreCardsLeft(toolOverlay(app.live), session).join();
      if (left && left !== host.cardsAsked) {
        host.cardsAsked = left;
        return hint('Score effect not given yet: Confirm or Skip it (Done again goes back without it)');
      }
      host.cardsAsked = '';
      app.live.overlay = null;
    }
    const clueId = info?.clue.id;
    keepAsk = null;
    // The host panel's status row then offers "↶ Reopen <tile>" (no toast: it would cover the round buttons).
    backToBoard(session, game, { markUsed: !keep && !notPlayedYet() });
    dropPartnerWheel();
    host.selected = [];
    host.amount = null;
    app.live.timer = null;
    delete app.live.toolTile;
    // The keys go on from the tile that was open (the arrow keys move from it), not from the top of the page.
    if (clueId)
      void tick().then(() => {
        host.ringOff = true;
        document.querySelector<HTMLElement>(`.play .stage-box .tile[data-clue="${clueId}"]`)?.focus({ preventScroll: true });
      });
  }

  /**
   * Back to the board without using up the tile (a misclick), unless points were already given for it (its own wheel's or
   * dice's score effect too).
   */
  function cancelClue(): void {
    if (!notPlayedYet() && info && clueScored(session, info.clue.id))
      return toast('Points were given for this clue: undo them first (Ctrl+Z), or use ▦ Done ▶ board', 4000);
    // A 🤫 card sent to a phone can't be unsent: putting the tile back is the host's call. Said per player, as it is:
    // who saw it (their phone showed it), who got it and hasn't opened it; a player with no phone here got nothing.
    const s = partner;
    const out = s && info && phoneCards ? cardSlides(info.clue).flatMap((c, i) => (cardSends(s, c.id).length ? [{ c, n: i + 1 }] : [])) : [];
    if (s && info && out.length) {
      const seenIds = new Set(
        out.flatMap(({ c }) => cardSends(s, c.id).flatMap((x) => (session.remote?.cardsSeen?.[cardId(s.clue, x)] ?? []).map((w) => w.split('/')[0]))),
      );
      const phones = new Set(app.live.phones ?? []);
      const sentIds = [...new Set(out.flatMap(({ c }) => sentSeats(session, s, c.id)))];
      const saw = sentIds.filter((id) => seenIds.has(id));
      const got = sentIds.filter((id) => !seenIds.has(id) && phones.has(id));
      const names = (ids: string[]) => nameList(ids.map((id) => playerName(session, id)));
      // (Named ones by name: "card “Clue tip” & card 2"; else by number, "cards 1 & 2".)
      const which =
        out.length === 1
          ? clueCardWords(out[0].c, out[0].n - 1)
          : out.some(({ c }) => c.name?.trim())
            ? nameList(out.map(({ c, n }) => clueCardWords(c, n - 1)))
            : `cards ${nameList(out.map((x) => String(x.n)))}`;
      const said = [
        saw.length ? `${names(saw)} already saw ${which}` : '',
        got.length ? `${names(got)} got ${which} but ${got.length > 1 ? 'haven’t' : 'hasn’t'} opened it` : '',
      ].filter(Boolean);
      if (said.length) return void (keepAsk = { clue: info.clue.id, text: `${said.join('; ')}. Put the tile back anyway?` });
    }
    // The same for a card sent from the tile's own panel, or shown in the 🪟 card window (a partner card's too, with no
    // phones): it goes when the tile closes, but it was seen.
    const mine = info ? cardsOut(game, session).filter((c) => c.until === 'tile') : [];
    if (info && mine.length) {
      const to = nameList([...new Set(mine.flatMap((c) => c.to.map((t) => playerName(session, t.seat))))]);
      return void (keepAsk = { clue: info.clue.id, text: `${nameList(mine.map((c) => c.label))} went to ${to}. Put the tile back anyway?` });
    }
    back(true);
  }
  /**
   * ↩ Put back (keep tile) asking first, for the tile it was pressed on: in the panel's strip, never over the stage. It
   * goes with the tile (never asked again by itself when the tile opens again), and a part's newer question in the
   * strip puts it away (see HostPanel).
   */
  let keepAsk = $state<{ clue: string; text: string } | null>(null);
  $effect(() => {
    if (session.phase !== 'clue') keepAsk = null;
  });
  const keepHere = $derived(!!keepAsk && session.phase === 'clue' && info?.clue.id === keepAsk.clue);
  const keepQuestion = $derived<HostAsk | null>(
    keepHere && keepAsk
      ? { text: keepAsk.text, ok: '↩ Put it back', cancel: 'Keep playing', onok: () => ((keepAsk = null), back(true)), oncancel: () => (keepAsk = null) }
      : null,
  );

  return {
    get partner() {
      return partner;
    },
    get phoneCards() {
      return phoneCards;
    },
    get partnerMarks() {
      return partnerMarks;
    },
    get partnerJudged() {
      return partnerJudged;
    },
    get keepQuestion() {
      return keepQuestion;
    },
    get keepAsk() {
      return keepAsk;
    },
    set keepAsk(v: typeof keepAsk) {
      keepAsk = v;
    },
    get partnerShownAt() {
      return partnerShownAt;
    },
    set partnerShownAt(v: number) {
      partnerShownAt = v;
    },
    get partnerClockAt() {
      return partnerClockAt;
    },
    set partnerClockAt(v: number) {
      partnerClockAt = v;
    },
    get partnerLiveByT() {
      return partnerLiveByT;
    },
    set partnerLiveByT(v: boolean) {
      partnerLiveByT = v;
    },
    back,
    cancelClue,
    cardTakeBack,
    checkJudge,
    dealGone,
    describerWanted,
    dropPartnerWheel,
    memberSpin,
    partnerChoose,
    partnerClock,
    partnerCopy,
    partnerDescriber,
    partnerEnter,
    partnerHandOut,
    partnerJudge,
    partnerLanded,
    partnerNumber,
    partnerPicker,
    partnerQuick,
    partnerShow,
    partnerSolo,
    partnerSpin,
    partnerTakeBack,
    partnerTimerStarted,
    partnerValue,
    partnerWheelUp,
    stealHint,
    stealOpen,
    toolGoing,
    unsentCards,
  };
}
