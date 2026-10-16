<!--
  🤝 A partner clue's part of the host panel (partner-clues spec §6.10): PARTNER UP! (who picked it, the partner by the
  wheel or by hand, ⇄ Swap), then 📤 Distribute (who gets each card: 📤 Send to their phones, ✓ seen, ↻ Send again,
  📤 Send changes, ✖ Take back, ⇡ Get it ready, or 📋 copying it to them), and ✔ Got it / ✘ Missed with what each gives.
  Nothing goes to a phone or the buzzer server but by those presses. In one window this panel is on stream: it counts
  what's on a card and never says it, nor names a card's pictures (a file name is often the answer), uploads included.
  The cards themselves are in the editor's 🤫 Card tabs, and the two-window host column.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { app, toast } from '../../lib/app.svelte';
  import { textOn } from '../../lib/colors';
  import { overlayDoneAt, toolOverlay } from '../../lib/live';
  import { mediaUrls } from '../../lib/media.svelte';
  import { cardSlides, PARTNER_GAMES, type Clue, type ClueCard, type Game, type Id, type PartnerState, type Session } from '../../lib/model';
  import {
    cardCopyText, cardId, cardRecipients, cardSends, cardSummary, countItems, goesToLabel, lowerWord, markReady, marksText, pairOnly, partnerCandidates, partnerRoles, partnerRules,
    partnerShares, partnerVerdict, partWho, partWordOf, partWords, recipientsText, resetRecipients, sendAgain, sendCards, sendChanges, sendState, sentSeats, setPartner, setPartnerPicker,
    setRecipients, sharesText, swapParts,
  } from '../../lib/partner';
  import { cardItems, cardLinks, cardWords, phoneCard, type LeftOut } from '../../lib/phonecard';
  import { clueName } from '../../lib/session';
  import { buzzerOn, remote, roomHasCards, roomHasFiles } from '../../lib/remote.svelte';
  import { cardFileCounts, filesCounted, phoneCan, retryFiles } from '../../lib/cardfiles.svelte';
  import { ask } from '../../lib/ask.svelte';
  import { teamsOn } from '../../lib/buzz';
  import { dropMenu } from '../../lib/menustate.svelte';
  import { announce } from '../../lib/announce';
  import { copyText } from '../standings';
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
  } = $props();

  // (Mounted only while there's one; a stand-in for the moment it goes, before this part does.)
  const s = $derived<PartnerState>(session.partner ?? { clue: clue.id, stage: 'pick', giver: 'partner' });
  const rules = $derived(partnerRules(clue));
  const words = $derived(partWords(rules));
  const roles = $derived(partnerRoles(s));
  const cards = $derived(cardSlides(clue));
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
    const which = moved.map(({ n }) => `card ${n}`).join(' and ');
    void ask(`${name(old)} already has ${which}: take it back and send it to ${name(id)}?`, { ok: '📤 Send changes', cancel: `Leave it with ${name(old)}` }).then((yes) => {
      if (!yes || session.partner !== s) return;
      for (const { card } of moved) sendChanges(session, s, card);
      announce(`${moved.map(({ n }) => `Card ${n}`).join(' and ')} sent to ${name(id)}`);
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
      const who = sentSeats(session, s, card.id).map(name).join(' and ');
      const part = `the ${lowerWord(words[card.to as 'giver' | 'guesser'])}’s`;
      const yes = await ask(`${who} already saw card ${n} (${part}). Swap anyway? They keep it; 📤 Send changes gives it to whoever plays that part now.`, { ok: '⇄ Swap', cancel: 'Don’t swap' });
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

  const recipients = (card: ClueCard): Id[] => cardRecipients(session, s, card).map((t) => t.seat);
  /** Every player but the two. */
  const others = $derived(session.players.map((p) => p.id).filter((id) => id !== s.pickerId && id !== s.partnerId));
  /** A part's word for a player's chip ("describer"), while they play it. */
  const partOf = (id: Id): string => (s.partnerId ? partWordOf(rules, s, id) : '');
  function toggle(card: ClueCard, id: Id): void {
    const to = recipients(card);
    setRecipients(session, s, card, to.includes(id) ? to.filter((x) => x !== id) : [...to, id]);
  }
  function everyoneElse(card: ClueCard): void {
    const to = recipients(card);
    const all = others.length > 0 && others.every((id) => to.includes(id));
    setRecipients(session, s, card, all ? to.filter((id) => !others.includes(id)) : [...new Set([...to, ...others])]);
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
  /** The players (teams) with a phone in the room now. */
  const phones = $derived(new Set(app.live.phones ?? []));
  const hasPhone = (id: Id) => phones.has(id);
  /** The cards with what's out of them, numbered. */
  const sentCards = (): { card: ClueCard; n: number }[] => cards.flatMap((card, i) => (cardSends(s, card.id).length ? [{ card, n: i + 1 }] : []));
  /** What a phone gets for each card, and how far its files are. */
  const can = $derived(phoneCan(session));
  const lefts = (card: ClueCard) => (cardsOn ? phoneCard(game, card, filesOn ? can : { files: null }).left : []);
  /** The players who saw a card (its sends still out), by seat. */
  function seenBy(card: ClueCard): Id[] {
    const seen = session.remote?.cardsSeen ?? {};
    const seats = new Set(cardSends(s, card.id).flatMap((x) => (Array.isArray(seen[cardId(s.clue, x)]) ? seen[cardId(s.clue, x)] : []).map((w) => w.split('/')[0])));
    return session.players.map((p) => p.id).filter((id) => seats.has(id));
  }
  /** "Card 1 sent to Bob" (names only, never what's on it). */
  const sentText = (card: ClueCard, n: number) => `Card ${n} sent to ${recipientsText(session, s, rules, card)}`;

  /** 📤 Send: this card to its players' phones now (the countdown doesn't start). */
  function sendOne(card: ClueCard, n: number): void {
    if (!cardsOn) return;
    if (!sendCards(session, s, [card]).length) return toast(`Choose who gets card ${n} first`);
    announce(sentText(card, n));
  }
  /** ↻ Send again: under a new id, so a phone that came late (a new phone for the seat) gets it too. */
  function again(card: ClueCard, n: number): void {
    retryFiles(game, session, [card]);
    if (sendAgain(session, s, card)) announce(`Card ${n} sent again to ${sentSeats(session, s, card.id).map(name).join(', ')}`);
  }
  /** 📤 Send changes: to whoever was added, and taken back from whoever was taken off. */
  function changes(card: ClueCard, n: number): void {
    sendChanges(session, s, card);
    announce(cardSends(s, card.id).length ? sentText(card, n) : `Card ${n} taken back`);
  }
  /** The cards not sent yet: their files are what ⇡ Get it ready puts in the room. */
  const unsent = $derived(cards.filter((c) => !cardSends(s, c.id).length));
  /** ⇡ Get it ready now: the files of the cards not sent yet go up to the buzzer room (no phone gets them until they're sent). */
  function getReady(): void {
    retryFiles(game, session, unsent);
    markReady(s, unsent.map((c) => c.id));
    announce('Getting the cards’ files ready');
  }

  /** The files from this computer of the cards not sent yet, counted: what goes up, what's up, what's on its way. */
  const files = $derived(cardsOn ? filesCounted(game, session, unsent) : { files: 0, up: 0, going: 0, failed: 0 });
  /** Items counted by kind: "1 picture", "2 pictures and 1 video". */
  const fileKinds = (pick: (c: ClueCard) => ReturnType<typeof phoneCard>['items']) => countItems(unsent.flatMap((c) => pick(c).map((i) => i.kind)));
  /** The line about those files (counted, never named), and whether ⇡ is offered. (A sent card's row says how its own go.) */
  const filesLine = $derived.by((): { text: string; ready: boolean } | null => {
    if (!cardsOn || !files.files) return null;
    const items = (c: ClueCard) => phoneCard(game, c, filesOn ? can : { files: null }).items.filter((i) => i.file);
    if (!filesOn) return { text: `🖼 ${fileKinds(items)} from this computer won’t reach the phones: this buzzer server isn’t taking files right now (📋 Copy picture)`, ready: false };
    if (files.up >= files.files - files.failed) return files.up ? { text: `🖼 ${fileKinds((c) => items(c).filter((i) => 'file' in i.goes))} ready in the buzzer room (no phone gets ${files.up === 1 ? 'it' : 'them'} until you send)`, ready: false } : null;
    if (files.going) return { text: `⇡ getting ${Math.min(files.files, files.up + 1)} of ${files.files - files.failed} ready…`, ready: false };
    const waiting = (c: ClueCard) => items(c).filter((i) => !i.why && 'pending' in i.goes);
    return { text: `🖼 ${fileKinds(waiting)} ${files.files - files.up - files.failed === 1 ? 'goes' : 'go'} up when you send ${unsent.length === 1 ? 'the card' : 'their cards'}`, ready: true };
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

  /** A card's row, after the chips: how it stands on the phones (sent, seen, uploading, what won't reach them). */
  function rowState(card: ClueCard): { text: string; warn?: boolean } | null {
    const st = sendState(session, s, card);
    if (st === 'unsent') return null;
    if (st === 'edited') return { text: 'changed in the editor: off the phones until ↻ Send again', warn: true };
    const seen = seenBy(card);
    const f = cardFileCounts(game, session, card);
    const out = [st === 'changed' ? 'changed:' : seen.length ? `✓ seen${seen.length < sentSeats(session, s, card.id).length ? ` by ${seen.map(name).join(', ')}` : ''}` : 'sent'];
    if (filesOn && f.going) out.push(`uploading ${Math.min(f.files, f.up + 1)} of ${f.files - f.failed}…`);
    return { text: out.join(' · ') };
  }
  /** What of a card won't reach the phones, counted ("🖼 1 picture won't reach the phones: 📋 Copy picture"). */
  function leftLine(card: ClueCard): string {
    const left = lefts(card).filter((l) => l.why !== 'nofiles');
    if (!left.length) return '';
    const WHY: Record<LeftOut, string> = {
      big: 'too big for phones',
      expired: 'its link has expired',
      kind: 'phones can’t show it',
      nofiles: '',
      failed: 'didn’t reach the buzzer server',
      lost: 'isn’t in the game any more',
      many: 'one card shows 6 at most',
    };
    const why = [...new Set(left.map((l) => WHY[l.why]))].join('; ');
    return `🖼 ${countItems(left.map((l) => l.kind))} won’t reach the phones (${why})`;
  }

  /** The guess the guesser typed on their phone (PartnerRules.typeGuess), the newest. */
  const guess = $derived.by(() => {
    const a = session.remote?.answers;
    if (!rules.typeGuess || s.stage === 'pick' || a?.id !== clue.id) return null;
    const [seat, g] = Object.entries(a.seats).sort((x, y) => y[1].n - x[1].n)[0] ?? [];
    return seat && g && typeof g.text === 'string' ? { seat, text: g.text, by: g.by } : null;
  });

  /** The browser can put a picture on the clipboard (to paste into a DM). */
  const canCopyPicture = typeof ClipboardItem !== 'undefined' && typeof navigator !== 'undefined' && !!navigator.clipboard?.write;

  /** 📋 Copy words: the card's words and links, named for who they're for. Nothing of it shows on screen. */
  function copyWords(card: ClueCard, n: number): void {
    const to = recipients(card).map(name);
    void copyText(cardCopyText(game, card, n, where, to), `Card ${n}’s words copied: paste them to ${to.join(', ') || 'them'}`);
  }

  /** A picture as PNG (what pastes into a DM); a picture from a site that doesn't allow it can't be read back. */
  function pngOf(src: string): Promise<Blob> {
    return new Promise((ok, fail) => {
      const img = new Image();
      if (!/^(blob|data):/.test(src)) img.crossOrigin = 'anonymous';
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        try {
          c.getContext('2d')?.drawImage(img, 0, 0);
          c.toBlob((b) => (b ? ok(b) : fail(new Error('no picture'))), 'image/png');
        } catch (e) {
          fail(e);
        }
      };
      img.onerror = () => fail(new Error('not loaded'));
      img.src = src;
    });
  }

  /** 📋 Copy picture: the card's first picture (or GIF, as a still), to paste into a DM. */
  async function copyPicture(card: ClueCard, n: number): Promise<void> {
    const to = recipients(card).map(name).join(', ') || 'them';
    const item = cardItems(game, card).find((i) => i.kind === 'picture' || i.kind === 'gif');
    const src = item && ((item.media && mediaUrls[item.media]) || item.url);
    if (!src) return toast(`Card ${n}’s picture isn’t loaded here: open the game’s 🖼 Media to find it`, 4000);
    try {
      const png = await pngOf(src);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      toast(`Card ${n}’s picture copied: paste it to ${to}`);
    } catch {
      toast(`Couldn’t copy card ${n}’s picture (its site doesn’t allow it): 📋 Copy words adds its link`, 5000);
    }
  }

  // The main button, in the panel's main cell: spin, then show the question, then start the clock (then the clue's own).
  offerNext('partner', () => {
    const st = session.partner;
    if (!st) return null;
    if (st.stage === 'pick') {
      if (st.partnerId) return { label: '▶ Show question', key: '⏎', title: 'Enter or N: the question goes on screen (nothing is sent to anyone)', run: onshow };
      const who = st.pickerId ? (session.players.find((p) => p.id === st.pickerId)?.name ?? '') : '';
      const why = !st.pickerId
        ? `${noun === 'team' ? 'Which team' : 'Who'} picked it? Press their number first (1–${Math.min(9, session.players.length) || 9})`
        : !partnerCandidates(session, st).length
          ? `Nobody to partner with: tick “${who} can be on the wheel” to play it Solo, or press Esc`
          : '';
      return { label: '🎡 Spin for a partner', key: 'W', title: why || 'W, Enter or N: the wheel spins over the other players', disabled: !!why, run: onspin };
    }
    // (Judged meanwhile, by a click: the clue's own next, the answer. The answer shown meanwhile (R): no countdown over
    // it, the clue's own next, ▦ Done.)
    if (st.stage === 'distribute' && !verdict.judged && !session.revealed) {
      if (cardsOn && cards.some((c) => !cardSends(st, c.id).length && cardRecipients(session, st, c).length))
        return { label: '📤 Send and start', key: '⏎', title: 'Enter or N: the cards not sent yet go to their phones, and the countdown starts', run: onclock };
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
  <span class="parts" data-partner-parts>{roles.solo ? '🎯' : G.icon} {partsSaid.replace(' · ', ' · 🎯 ')}</span>
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
        <span class="muted">{partner ? `🤝 ${picker.name}${partner.id === picker.id ? ' · Solo' : ` + ${partner.name}`}${s.how ? HOW[s.how] : ''}` : 'Partner: spin the wheel, or choose →'}</span>
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
    {/if}
    <div class="row">{@render parts()}</div>
    <div class="row small" data-partner-cards>
      {#if cards.length}
        🤫 {cards.length} card{cards.length === 1 ? '' : 's'}: {#each cards as card, i (card.id)}{i ? ' · ' : ''}Card {i + 1} → {recipientsText(session, s, rules, card)}{/each}
      {:else}
        <span class="muted">🤫 No cards on this clue: the question starts the clock.</span>
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
          Card {i + 1} → {out ? sentSeats(session, s, card.id).map(name).join(', ') : recipientsText(session, s, rules, card)}{#if out && seenBy(card).length}{' '}✓ seen{/if}
          {#if out}<button class="ghost small" onclick={() => ontakeback(card.id)} aria-label="Take card {i + 1} back" title="Takes it off the phones it went to">✖ Take back</button>{/if}
        </div>
      {/each}
    {:else if cards.length}
      <!-- (Three rows show; more scroll, so the judge row stays in view with up to six cards.) -->
      <div class="cardlist">
        {#each cards as card, i (card.id)}
          {@const n = i + 1}
          {@const to = recipients(card)}
          {@const changed = !!s.deal?.[card.id]}
          {@const pics = cardItems(game, card).some((it) => it.kind === 'picture' || it.kind === 'gif')}
          {@const copyable = !!cardWords(card) || cardLinks(game, card).length > 0}
          {@const st = cardsOn ? sendState(session, s, card) : 'unsent'}
          {@const state = cardsOn ? rowState(card) : null}
          {@const left = cardsOn ? leftLine(card) : ''}
          <!-- (📋 when a player it goes to has no phone here, or the room can't put cards on phones.) -->
          {@const copying = !cardsOn || to.some((id) => !hasPhone(id))}
          <!-- One row a card: what's on it (counted), who gets it, how it stands on their phones, and its buttons. -->
          <div class="row card" data-card={n}>
            <b>Card {n}</b>
            <span class="muted small">· {cardSummary(game, card)}</span>
            <span aria-hidden="true">→</span>
            {#each session.players as p (p.id)}
              {@const nophone = cardsOn && !hasPhone(p.id)}
              {@render chip(
                p.id,
                to.includes(p.id),
                `Card ${n} to ${p.name}${nophone ? ' (no phone here)' : ''}`,
                () => toggle(card, p.id),
                false,
                nophone ? `${p.name} has no phone here: copy the card to ${noun === 'team' ? 'the team' : 'them'} (📋)` : noun === 'team' ? `Every phone on ${p.name} gets it (everyone on the team sees it)` : '',
                0,
                nophone,
              )}
            {/each}
            {#if others.length}
              <button class="chip ghost" aria-pressed={others.every((id) => to.includes(id))} onclick={() => everyoneElse(card)} aria-label="Card {n} to everyone else">Everyone else</button>
            {/if}
            <button class="chip ghost" aria-pressed={!to.length} onclick={() => setRecipients(session, s, card, [])} aria-label="Card {n} to nobody">Nobody</button>
            {#if !to.length}<span class="muted small">nobody yet</span>{/if}
            {#if changed}
              <span class="muted small">(changed)</span>
              <button class="ghost small" onclick={() => resetRecipients(s, card.id)} title="Back to who it goes to by default: {goesToLabel(rules, card.to, false)}" aria-label="Card {n}: back to {goesToLabel(rules, card.to, false)}">↺</button>
            {/if}
            {#if state}<span class="small" class:warn={state.warn} data-card-state>{state.text}</span>{/if}
            <span class="spacer"></span>
            {#if cardsOn}
              {#if st === 'unsent'}
                <button class="small" onclick={() => sendOne(card, n)} disabled={!to.length} aria-label="Send card {n}" title={to.length ? `Sends it to ${to.map(name).join(', ')} now (the countdown doesn’t start)` : 'Choose who gets it first'}>📤 Send</button>
              {:else}
                {#if st === 'changed'}
                  <button class="small" onclick={() => changes(card, n)} aria-label="Send card {n}’s changes" title="Sends it to whoever you added, and takes it back from whoever you took off">📤 Send changes</button>
                {:else}
                  <button class="small" onclick={() => again(card, n)} aria-label="Send card {n} again" title="Sends it again under a new id: a phone that came late (a player on a new phone) gets it too, with what’s on the card now">↻ Send again</button>
                {/if}
                <button class="ghost small" onclick={() => ontakeback(card.id)} aria-label="Take card {n} back" title="Takes it off every phone it went to">✖ Take back</button>
              {/if}
            {/if}
            {#if copying}
              <button class="small" onclick={() => copyWords(card, n)} disabled={!to.length || !copyable}
                title={!to.length ? 'Choose who gets it first' : copyable ? `Copies “For ${to.map(name).join(', ')} only…” with the card’s words and links, to paste in a DM` : 'This card has no words or links: 📋 Copy picture'}
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
         off: Play's partnerJudge gives the keys to the main button.) -->
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
  {/if}
  {#if !dual}
    <span class="exposed">⚠ Viewers can see this window: what’s on a card is never shown here (check the cards in the editor’s 🤫 Card tabs).</span>
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
  .shares {
    margin-right: 8px;
  }
</style>
