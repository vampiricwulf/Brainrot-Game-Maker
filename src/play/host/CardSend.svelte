<!--
  🤫 Send a card… (partner-clues spec §12.2), from the tools row in any round: who gets it (players or teams, people on
  a team, everyone, or ⇄ everyone else), what (one of the editor's 🤫 Cards, a tile's or a Final's 🤫 card made in the
  editor, or a quick one: words typed or pasted, with a picture, video or sound from this computer, the game's 🖼 Media
  or pasted, or a link; or the slide on screen, as viewers see it), and how long it lasts (until the round ends, or
  until taken back: a 🤫 Card starts as its own). 📤 Send puts it on their phones, through the same buzzer room path as
  a partner clue's cards; without one, 📋 copies it to them, or 🪟 shows it in the card window. Nothing goes but by
  that press, never more cards than the room takes (✖ Take one back first), and never a card made in the editor again
  to exactly the players it's out to, for as long (↻ Send again in the cards out is for that).
  In one window viewers see this: the 🤫 Cards are listed by name and counted, never said; a tile's are listed by tile
  and name ("Card 2" when it has none) and counted, and only for tiles played or open (the others would say where a
  Daily Double is), and a Final's by the Final's name and theirs only once its category has been on screen (never from
  its title card); what's typed for a quick card is hidden unless the host asks (👁 Show); the 🖼 Media list (file
  names) and what's on the card picked from the editor are only shown with the audience window open.
  With `preset`, the card an action offered (an RPG object's, an item's, a wheel slice's or a board space's 🤫 button):
  who it starts with and how long it lasts come from the action, the card is fixed (counted, never shown), and it goes
  only when the host presses 📤 Send here.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { app, toast } from '../../lib/app.svelte';
  import { announce } from '../../lib/announce';
  import { CARD_MEDIA_MAX, clip } from '../../lib/buzzproto';
  import { cardsFullText, roomCardsFull, seenAtOnce, teamsOn } from '../../lib/buzz';
  import { phoneCan } from '../../lib/cardfiles.svelte';
  import { textOn } from '../../lib/colors';
  import { tileToolUp } from '../../lib/live';
  import { ACCEPT, addMediaFile, identicalMedia, mediaKind } from '../../lib/media.svelte';
  import {
    boardRounds, cardSlides, categoryLabel, clueCardName, clueValue, finalName, formatPoints, getClue, isFinal, isRpg, roundName, savedCardName,
    type CardTo, type Game, type Id, type MediaRef, type SentCard, type Session, type Slide, type SlideElement, type TeamMember,
  } from '../../lib/model';
  import { cardSummary, copyWordsText, toKey } from '../../lib/partner';
  import { cardItems, cardLinks, cardWords, phoneCard, type CardItem } from '../../lib/phonecard';
  import { buzzerOn, remote, roomHasCards, roomHasFiles, roomMembers } from '../../lib/remote.svelte';
  import { findIn, focusRef, screenElements, screenSlide, worldById } from '../../lib/rpg';
  import { cleanTo, fileItem, linkItem, listedCards, memberTo, quickSlide, savedCard, sendCard, sentSlide, sentToText, tileCard } from '../../lib/sentcards';
  import { currentClueInfo, currentFinal, finalReached, shownQuestionSlide, slidesRound } from '../../lib/session';
  import { hideFromViewers } from '../../lib/sync.svelte';
  import { cardWindow, openCardWindow } from '../../lib/cardwindow.svelte';
  import { copyText } from '../standings';
  import { canCopyPicture, copyCardPicture, hasPicture } from './cardcopy';
  import { leftLine } from './cardrow';

  let {
    game,
    session,
    dual = false,
    preset,
    onsent,
  }: {
    game: Game;
    session: Session;
    dual?: boolean;
    /** An action's card: what's on it (fixed), who it starts with (players' ids) and how long it lasts. */
    preset?: { slide: Slide; to: Id[]; until: 'round' | 'host' };
    /** It went (📤 Send). */
    onsent?: (c: SentCard) => void;
  } = $props();

  /** This copy's own radio groups (an offer and the tools row's dialog can be on screen at once). */
  const uid = $props.id();
  const teams = $derived(buzzerOn(game.settings) && teamsOn(game.settings));
  const room = $derived(buzzerOn(game.settings) && !!remote.code && remote.status !== 'off' && remote.status !== 'error');
  /** Its phones get the cards the host sends (else the host copies them: 📋). */
  const cardsOn = $derived(room && roomHasCards());
  const filesOn = $derived(cardsOn && roomHasFiles());
  const phones = $derived(new Set(app.live.phones ?? []));

  // ---------- Who ----------

  let to = $state<CardTo[]>(untrack(() => (preset?.to ?? []).filter((id) => session.players.some((p) => p.id === id)).map((seat) => ({ seat }))));
  const seatOn = (id: Id) => to.some((t) => t.seat === id && !t.member);
  const memberOn = (id: Id, m: TeamMember) => to.some((t) => t.seat === id && t.member?.id === m.id);
  /** A player (a whole team): on, or off with anyone on it. */
  function toggleSeat(id: Id): void {
    to = seatOn(id) ? to.filter((t) => t.seat !== id) : [...to.filter((t) => t.seat !== id), { seat: id }];
  }
  /** One person on a team (the whole team goes off: just them). */
  function toggleMember(id: Id, m: TeamMember): void {
    const one = memberTo(id, m);
    const rest = to.filter((t) => !(t.seat === id && !t.member));
    to = memberOn(id, m) ? rest.filter((t) => toKey(t) !== toKey(one)) : [...rest, one];
  }
  const everyoneOn = $derived(session.players.length > 0 && session.players.every((p) => seatOn(p.id)));
  function everyone(): void {
    to = everyoneOn ? [] : session.players.map((p) => ({ seat: p.id }));
  }
  /** ⇄ Everyone else: everyone not chosen now, and none of those chosen (the card after "you're the spy"). */
  function flip(): void {
    to = session.players.filter((p) => !to.some((t) => t.seat === p.id)).map((p) => ({ seat: p.id }));
  }
  /** People on each team with a phone here (teams, a room that takes cards): each can get a card of their own. */
  const people = (id: Id): TeamMember[] => (teams && cardsOn ? roomMembers(id) : []);

  // ---------- What ----------

  /**
   * A card made in the editor, as the list offers it: one of the editor's 🤫 Cards (`saved`), or a tile's or a Final's
   * (`clue`: the clue's or the Final round's id, `card`).
   */
  type FromEditor = { key: string; label: string; saved?: Id; clue?: Id; card?: Id };
  /**
   * The editor's 🤫 Cards, in its order: by name and counted ("Tip A · 1 line of words, 1 picture"), never what's on
   * them. In one window too (a card made ahead isn't tied to a place on the board). " · out" on one out now (with the
   * audience window open: to whom).
   */
  const mine = $derived.by((): FromEditor[] => {
    const out = listedCards(game, session);
    return (game.cards ?? []).map((c, i) => {
      const sent = out.filter((x) => 'saved' in x.content && x.content.saved === c.id);
      const mark = !sent.length ? '' : dual ? ` · out to ${sent.map((x) => sentToText(session, x.to, teams)).join(', ')}` : ' · out';
      return { key: `saved:${c.id}`, saved: c.id, label: `${savedCardName(c, i)} · ${cardSummary(game, c)}${mark}` };
    });
  });
  /** The tile open now (its clue id): its cards are listed in one window too. */
  const openId = $derived(session.phase === 'clue' && session.currentClue ? getClue(game, session.currentClue)?.clue.id : undefined);
  /**
   * Every tile's 🤫 card in the game, by tile and name ("Movies $400 · Clue tip · 1 line of words"; Card 1 unnamed):
   * never what's on it. In one window only those of tiles played or open: the list would tell viewers where an unplayed
   * Daily Double or partner clue is (the board never marks them).
   */
  const tiles = $derived.by((): FromEditor[] => {
    const sym = game.settings.currencySymbol;
    const rounds = boardRounds(game);
    const out: FromEditor[] = [];
    for (const r of rounds) {
      const prefix = rounds.length > 1 ? `${roundName(r, game.rounds.indexOf(r))} · ` : '';
      for (const c of r.categories)
        c.clues.forEach((cl, row) => {
          if (cl.empty || (!dual && !session.used[cl.id] && cl.id !== openId)) return;
          cardSlides(cl).forEach((card, i) =>
            out.push({ key: `${cl.id}/${card.id}`, clue: cl.id, card: card.id, label: `${prefix}${categoryLabel(c)} ${formatPoints(clueValue(r, row, cl), sym)} · ${clueCardName(card, i)} · ${cardSummary(game, card)}` }),
          );
        });
    }
    return out;
  });
  /**
   * Each Final's 🤫 cards ("Final Jeopardy! · Leader hint · 1 line of words"), never what's on them. In one window only a
   * Final whose category has been on stream (finalReached: not while its title card is up, nor after backing out of it):
   * one not reached yet would put its cards' names on stream early.
   */
  const finals = $derived.by((): FromEditor[] =>
    game.rounds.flatMap((r) =>
      !isFinal(r) || (!dual && !finalReached(session, r.id))
        ? []
        : cardSlides(r).map((card, i) => ({ key: `${r.id}/${card.id}`, clue: r.id, card: card.id, label: `${finalName(r)} · ${clueCardName(card, i)} · ${cardSummary(game, card)}` })),
    ),
  );
  /** Every card made in the editor that can go now: the 🤫 Cards first, then the tiles', then the Finals'. */
  const fromEditor = $derived([...mine, ...tiles, ...finals]);
  /** The kinds with any card, as the list's headings (only shown with two or more). */
  const groups = $derived(([['🤫 Cards', mine], ['On tiles', tiles], ['In Finals', finals]] as const).filter(([, l]) => l.length));

  /**
   * Only what viewers see of a slide as it comes up: never a secret item, a hotspot, a see-through item, nor one that
   * comes in seconds later (a hint: even once it's in, as nothing says when the slide came up).
   */
  const viewed = (s: Slide): Slide => ({ ...s, elements: s.elements.filter((e) => seenAtOnce(e) && !(e.kind === 'shape' && e.hotspot)) });
  /**
   * What's on stage now, as viewers see it: the open tile's question slide (its answer once shown), a slides round's
   * slide, the Final's, the tiebreaker's, or the RPG screen in view. Nothing over a splash, a title card or the board.
   */
  const onStage = $derived.by((): Slide | undefined => {
    if (session.intro?.stage === 'title') return undefined;
    if (session.phase === 'clue') {
      const info = currentClueInfo(session, game);
      if (!info || session.dd?.stage === 'splash' || session.partner?.stage === 'pick' || (tileToolUp(app.live, info.clue) && !session.revealed)) return undefined;
      return viewed(session.revealed ? info.clue.answerSlide : shownQuestionSlide(session, info.clue));
    }
    if (session.phase === 'slides') {
      const sr = slidesRound(session, game);
      return sr ? viewed(shownQuestionSlide(session, sr)) : undefined;
    }
    if (session.phase === 'final') {
      const f = currentFinal(session, game);
      return !f ? undefined : session.finalStep === 'question' ? viewed(shownQuestionSlide(session, f)) : session.finalStep === 'answer' ? viewed(f.answerSlide) : undefined;
    }
    if (session.phase === 'tiebreaker' && game.tiebreaker) return viewed(session.tiebreakerRevealed ? game.tiebreaker.answerSlide : shownQuestionSlide(session, game.tiebreaker));
    if (session.phase === 'rpg') {
      const r = game.rounds[session.currentRound];
      const world = isRpg(r) ? worldById(game, r.world) : undefined;
      const st = world ? session.worlds?.[world.id] : undefined;
      const ref = st && !st.split ? focusRef(st) : null;
      const found = world && ref ? findIn(world, ref) : null;
      return found ? { ...screenSlide(st, found.screen), elements: screenElements(st, found.screen, true) } : undefined;
    }
    return undefined;
  });
  const onStageSomething = $derived(!!onStage && onStage.elements.some((e) => e.kind !== 'text' || !!e.text.trim()));

  let kind = $state<'saved' | 'quick' | 'stage'>('quick');
  let pick = $state('');
  // (A card from 🤫 Cards was made to be sent: it's the first choice. In one window so is any card made in the editor, as
  // it keeps its words off stream.)
  let chose = false;
  $effect(() => {
    if (chose || !fromEditor.length) return;
    chose = true;
    if (!dual || mine.length) kind = 'saved';
  });
  const chosen = $derived(fromEditor.find((x) => x.key === pick) ?? fromEditor[0]);
  let words = $state('');
  let items = $state<SlideElement[]>([]);
  let link = $state('');
  let fileInput = $state<HTMLInputElement>();
  /** In one window what's typed is hidden (viewers see this window), unless the host asks to see it (👁 Show). */
  let reveal = $state(false);
  const masked = $derived(!dual && !reveal);
  /** The game's pictures, videos and sounds (by name: offered only with the audience window open). */
  const mediaFiles = $derived(game.media.filter((m) => m.kind === 'image' || m.kind === 'video' || m.kind === 'audio'));
  const FILE_ICON: Partial<Record<MediaRef['kind'], string>> = { image: '🖼', video: '🎞', audio: '🔊' };
  /**
   * The card as it would go: an action's, a 🤫 Card, a tile's or a Final's (as the editor has it), the slide on screen, or
   * the quick one.
   */
  const slide = $derived(
    preset
      ? preset.slide
      : kind === 'saved'
        ? !chosen
          ? undefined
          : chosen.saved
            ? savedCard(game, chosen.saved)
            : tileCard(game, chosen.clue!, chosen.card!)?.card
        : kind === 'stage'
          ? onStage
          : quickSlide(words, items),
  );
  const hasSomething = $derived(!!slide && slide.elements.some((e) => e.kind !== 'text' || !!e.text.trim()));
  /** The quick card's items, in order, by kind (never named: in one window viewers see this). */
  const itemKinds = $derived(cardItems(game, quickSlide('', items)));
  const ICON: Record<CardItem['kind'], string> = { picture: '🖼 picture', gif: '🖼 GIF', video: '🎞 video', sound: '🔊 sound', embed: '▶ online video' };

  /**
   * A picture, GIF, video or sound from this computer (or pasted): into the game's 🖼 Media, onto the card. A new file
   * is kept out of the viewers' windows (they never get a card's own files), and marked so before it joins the game.
   */
  async function addFile(file: File): Promise<void> {
    if (items.length >= CARD_MEDIA_MAX) return toast(`A card shows ${CARD_MEDIA_MAX} pictures, videos and sounds at most`);
    const k = mediaKind(file.name, file.type);
    if (k !== 'image' && k !== 'video' && k !== 'audio') return toast('Add a picture, GIF, video or sound');
    try {
      // (The same file already in the game: that one, without a toast naming it, as this window may be on stream. An SVG
      // is matched once it's cleaned, as the game stores it.)
      let ref = await identicalMedia(game, file, k);
      if (!ref) {
        // (Stored on a copy of the list, then hidden from viewers, then into the game: never sent to them meanwhile.)
        ref = await addMediaFile({ ...game, media: [...game.media] }, file, file.name, {}, { quiet: true });
        if (!game.media.some((m) => m.id === ref!.id)) {
          hideFromViewers([ref.id]);
          game.media.push(ref);
        }
      }
      addRef(ref);
    } catch (e) {
      toast(dual && e instanceof Error ? e.message : 'That file can’t go on a card: use a picture, GIF, video or sound', 4000);
    }
  }
  /** A file in the game onto the card. */
  function addRef(ref: Pick<MediaRef, 'id' | 'kind'>): void {
    if (items.length >= CARD_MEDIA_MAX) return toast(`A card shows ${CARD_MEDIA_MAX} pictures, videos and sounds at most`);
    const el = fileItem(ref);
    if (el) items = [...items, el];
  }
  function addLink(): void {
    if (!link.trim()) return;
    if (items.length >= CARD_MEDIA_MAX) return toast(`A card shows ${CARD_MEDIA_MAX} pictures, videos and sounds at most`);
    const it = linkItem(link);
    if (typeof it === 'string') return toast(it, 5000);
    items = [...items, it];
    link = '';
  }
  /** A picture pasted into the words box goes on the card (words paste as words). */
  function paste(e: ClipboardEvent): void {
    const file = Array.from(e.clipboardData?.files ?? []).find((f) => /^(image|video|audio)\//.test(f.type));
    if (!file) return;
    e.preventDefault();
    void addFile(file);
  }

  // ---------- How long, and sending ----------

  /** A round is on (the end screen and the tiebreaker are past the rounds: only "until I take it back" there). */
  const roundOn = $derived(session.phase !== 'end' && session.phase !== 'tiebreaker');
  let lasts = $state<'round' | 'host'>(untrack(() => preset?.until ?? 'round'));
  const until = $derived<SentCard['until']>(roundOn ? lasts : 'host');
  /** How long it lasts as the host picked it (the radios), else as the dialog opened: a 🤫 Card's own is only for it. */
  let ownLasts: 'round' | 'host' = untrack(() => lasts);
  // Picking a card from 🤫 Cards sets how long it lasts to the card's own (the radios can still change it), and moving on
  // to a tile's card or another kind puts back the host's own. Never an action's card: its own comes from the action.
  let lastsFor = '';
  $effect(() => {
    const k = !preset && kind === 'saved' && chosen?.saved ? chosen.key : '';
    if (k === lastsFor) return;
    lastsFor = k;
    const c = k ? savedCard(game, chosen!.saved!) : undefined;
    untrack(() => (lasts = c ? (c.until ?? 'round') : ownLasts));
  });
  /** What was sent last (names only), for the line under the button. */
  let said = $state('');
  /**
   * The card sent last, and who of those chosen it didn't reach (no phone here, nor a 🪟 card window open; with no phones
   * getting cards, all but the card window's player): the line under the button offers its 📋 copy for them, as a quick
   * card's words are gone from the dialog once it's sent.
   */
  let sentCopy = $state<{ card: SentCard; names: string[] } | null>(null);
  const sentCopySlide = $derived(sentCopy ? sentSlide(game, sentCopy.card) : undefined);
  const noPhone = $derived(cardsOn ? [...new Set(to.map((t) => t.seat))].filter((id) => !phones.has(id)) : []);
  const left = $derived(cardsOn && slide ? leftLine(phoneCard(game, slide, filesOn ? phoneCan(session) : { files: null }).left) : '');
  const names = $derived(to.map((t) => sentToText(session, [t], teams)));
  /**
   * The 🪟 card window is open for one of them (their whole seat): with no phones getting cards, 📤 Send shows it there,
   * to them alone (the others are copied to).
   */
  const windowTo = $derived(cardWindow.open ? to.filter((t) => t.seat === cardWindow.seat && !t.member && !t.except?.length) : []);
  const windowName = $derived(windowTo.length ? sentToText(session, windowTo, teams) : '');
  /** Who 📤 Send sends it to: their phones, else the card window's player. */
  const sendTo = $derived(cardsOn ? to : windowTo);
  /** Phones get cards, and the buzzer room has all it takes: ✖ Take one back first (the 🪟 card window has no limit). */
  const full = $derived(cardsOn && roomCardsFull(game, session));
  /** How long a card lasts, the shortest first (a tile closes before its round ends). */
  const LASTS_RANK: Record<SentCard['until'], number> = { tile: 0, round: 1, host: 2 };
  /**
   * The card picked, made in the editor, already out to exactly these players for as long or longer: a second 📤 Send
   * would put it on their phones twice. (One out for less long, a tile's card sent from its panel until the tile closes,
   * can go again to last longer: ↻ Send again keeps how long it lasts.)
   */
  const already = $derived.by(() => {
    const ch = chosen;
    if (preset || kind !== 'saved' || !ch || !sendTo.length) return undefined;
    const want = cleanTo(session, sendTo).map(toKey).sort().join();
    return listedCards(game, session).find(
      (c) =>
        ('saved' in c.content ? c.content.saved === ch.saved : 'clue' in c.content && c.content.clue === ch.clue && c.content.card === ch.card) &&
        c.to.map(toKey).sort().join() === want &&
        LASTS_RANK[c.until] >= LASTS_RANK[until],
    );
  });
  /**
   * (Its label and where to go: nothing of the card, so this shows in one window too. The cards out offer ↻ Send again
   * only when phones get cards: for the 🪟 card window, ✖ Take back and show it again.)
   */
  const alreadyText = $derived(
    !already
      ? ''
      : cardsOn
        ? `${already.label} is out to them already: ↻ Send it again in the cards out, or ✖ Take it back first`
        : `${already.label} is out to them already: ✖ Take it back in the cards out first to show it again`,
  );
  const canSend = $derived(sendTo.length > 0 && hasSomething && !full && !already);
  /** Why 📤 Send (or 🪟 Show) can't go, or ''. */
  const cant = $derived(
    full ? cardsFullText(game, session) : !to.length ? 'Choose who gets it first' : !hasSomething ? (kind === 'stage' ? 'Nothing on screen to send now' : 'Put something on the card first') : alreadyText,
  );

  function send(): void {
    if (full) return toast(cardsFullText(game, session), 4000);
    if (!canSend || !slide) return;
    const content: SentCard['content'] = !preset && kind === 'saved' && chosen ? (chosen.saved ? { saved: chosen.saved } : { clue: chosen.clue!, card: chosen.card! }) : { slide };
    const c = sendCard(game, session, { to: sendTo, content, until }, Date.now(), cardsOn && roomCardsFull(game, session));
    if (!c) return toast('That card can’t be sent now');
    // (Those it didn't reach, to copy it to: with phones, one with no phone here; without, all but the card window's.)
    const missed = (cardsOn ? noPhone : [...new Set(to.map((t) => t.seat))]).filter((id) => !windowTo.some((t) => t.seat === id)).map(nameOf);
    const copy = !missed.length ? '' : cardsOn ? ` · 📵 ${missed.join(', ')} ${missed.length > 1 ? 'have' : 'has'} no phone here: copy it to them (📋)` : ` · copy it to ${missed.join(', ')} (📋)`;
    said = `${c.label} sent to ${sentToText(session, c.to, teams)}${copy}`;
    sentCopy = missed.length ? { card: c, names: missed } : null;
    announce(said);
    onsent?.(c);
    if (kind === 'quick') {
      words = '';
      items = [];
      link = '';
    }
  }
  function copyWords(): void {
    if (!slide) return;
    void copyText(copyWordsText(game, slide, 'from the host', names), `The card’s words copied: paste them to ${names.join(', ') || 'them'}`);
  }
  /** 📋 The card sent last, for those of its players with no phone here. */
  function copySent(): void {
    if (!sentCopy || !sentCopySlide) return;
    const { card, names: whom } = sentCopy;
    void copyText(copyWordsText(game, sentCopySlide, card.label, whom), `${card.label}’s words copied: paste them to ${whom.join(', ')}`);
  }
  /** 🪟 The card window for a player (from this click: a popup needs one). */
  function openWin(seat: Id): void {
    if (!openCardWindow(seat)) toast('The browser blocked the popup. Allow popups for this file and try again.', 5000);
  }
  const nameOf = (id: Id) => session.players.find((p) => p.id === id)?.name ?? '?';
  /** The first player chosen as a whole seat (the card window shows a seat's cards). */
  const firstSeat = $derived(to.find((t) => !t.member && !t.except?.length)?.seat);
</script>

{#snippet seatChip(id: Id)}
  {@const p = session.players.find((x) => x.id === id)}
  {@const on = seatOn(id)}
  {@const nophone = cardsOn && !phones.has(id)}
  <button
    class="chip"
    style:border-color={p?.color}
    style:background={on ? p?.color : undefined}
    style:color={on ? textOn(p?.color ?? '#888') : undefined}
    aria-pressed={on}
    aria-label="{p?.name}{nophone ? ' (no phone here)' : ''}"
    title={teams ? `Every phone on ${p?.name} gets it` : undefined}
    onclick={() => toggleSeat(id)}>{p?.name}{#if on}&nbsp;✓{/if}{#if nophone}<span class="part" aria-hidden="true">📵</span>{/if}</button
  >
{/snippet}

<div class="send" data-card-send>
  <div class="head">To</div>
  <div class="row wrap">
    {#each session.players as p (p.id)}
      {@render seatChip(p.id)}
      {#each people(p.id) as m (m.id)}
        {@const on = memberOn(p.id, m)}
        <button
          class="chip person"
          style:border-color={p.color}
          style:background={on ? p.color : undefined}
          style:color={on ? textOn(p.color) : undefined}
          aria-pressed={on}
          aria-label="{m.name} on {p.name}"
          title="Only {m.name}’s phone gets it"
          onclick={() => toggleMember(p.id, m)}>{m.name}{#if on}&nbsp;✓{/if}</button
        >
      {/each}
    {/each}
  </div>
  <div class="row wrap">
    <button class="chip ghost" aria-pressed={everyoneOn} onclick={everyone}>Everyone</button>
    <button class="chip ghost" onclick={flip} disabled={!to.length || everyoneOn} title="Everyone you haven’t chosen, instead of those you have (send the next card to the rest)">⇄ Everyone else</button>
  </div>

  <div class="head">Card</div>
  {#if preset}
    <!-- (Fixed: the action's. Counted, never shown: in one window viewers see this.) -->
    <div class="small" data-offer-card>{cardSummary(game, preset.slide) || 'Nothing on it'} <span class="muted">(what’s on it is in the editor, never shown here)</span></div>
  {:else}
    <div class="row wrap" role="radiogroup" aria-label="Which card">
      <label class="check small" title="A card from the editor’s 🤫 Cards tab, or a tile’s or a Final’s 🤫 card"
        ><input type="radio" name="card-kind-{uid}" value="saved" bind:group={kind} disabled={!fromEditor.length} /> One made in the editor</label
      >
      <label class="check small"><input type="radio" name="card-kind-{uid}" value="quick" bind:group={kind} /> A quick card</label>
      <label class="check small" title={onStageSomething ? 'What viewers see on screen now, as a card (nothing hidden from them goes)' : 'Nothing is on screen to send now'}
        ><input type="radio" name="card-kind-{uid}" value="stage" bind:group={kind} disabled={!onStageSomething} /> The slide on screen</label
      >
    </div>
    {#if !dual}
      <div class="muted small" data-saved-note>
        Cards on tiles not played yet are listed with the audience window open (viewers see this one), as are a Final’s before its category is on screen.
      </div>
    {/if}
    {#if kind === 'saved'}
      {#if fromEditor.length}
        <select class="small" aria-label="The card to send" value={chosen?.key ?? ''} onchange={(e) => (pick = e.currentTarget.value)}>
          {#if groups.length > 1}
            {#each groups as [label, list] (label)}
              <optgroup {label}>{#each list as s (s.key)}<option value={s.key}>{s.label}</option>{/each}</optgroup>
            {/each}
          {:else}
            {#each fromEditor as s (s.key)}<option value={s.key}>{s.label}</option>{/each}
          {/if}
        </select>
        {#if dual && slide}
          <!-- (Two windows only: this window isn't on stream. The host's "did I pick the right one".) -->
          {@const text = cardWords(slide)}
          {@const its = cardItems(game, slide)}
          <div class="preview small" data-card-preview>
            <div class="muted">What’s on it</div>
            {#if text}<div class="words" dir="auto">{clip(text, 300)}</div>{/if}
            {#each its as it (it.el)}<div>{ICON[it.kind]} · {it.name}</div>{/each}
            {#if !text && !its.length}<div class="muted">Nothing on it</div>{/if}
          </div>
        {/if}
      {:else}
        <div class="muted small">
          {!dual
            ? 'No 🤫 Cards in this game, and no tile played yet (or Final reached) has a card.'
            : app.playerOnly
              ? 'No 🤫 Cards in this game, and no tile or Final has a card.'
              : 'No card made in the editor yet: make one in the editor’s 🤫 Cards tab (or a tile’s or a Final’s ＋ Card).'}
        </div>
      {/if}
    {:else if kind === 'stage'}
      <div class="small" data-stage-card>
        {#if onStage && onStageSomething}{cardSummary(game, onStage) || 'The slide'} <span class="muted">(what viewers see now; it stays as it is if the screen moves on)</span>{:else}<span class="muted">Nothing is on screen to send now.</span>{/if}
      </div>
    {:else}
      <div class="row">
        <textarea
          rows="3"
          dir="auto"
          bind:value={words}
          onpaste={paste}
          placeholder="What they’ll see… (paste a picture here too)"
          aria-label="The card’s words"
          style:-webkit-text-security={masked ? 'disc' : undefined}
        ></textarea>
        {#if !dual}
          <button class="ghost tiny" aria-pressed={reveal} onclick={() => (reveal = !reveal)} title={reveal ? 'Hide what you type again' : 'Shows what you type here (viewers see it too)'}>👁 Show</button>
        {/if}
      </div>
      <div class="row wrap">
        <button class="small" onclick={() => fileInput?.click()} title="A picture, GIF, video or sound from this computer (it goes into the game’s 🖼 Media)">🖼 Add a file…</button>
        <input bind:this={fileInput} type="file" accept={ACCEPT.any} hidden onchange={(e) => {
          const f = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (f) void addFile(f);
        }} />
        {#if dual && mediaFiles.length}
          <!-- (Names files: only with the audience window open, so never on stream.) -->
          <select class="small media" aria-label="A file from the game’s 🖼 Media" value="" onchange={(e) => {
            const ref = mediaFiles.find((m) => m.id === e.currentTarget.value);
            e.currentTarget.value = '';
            if (ref) addRef(ref);
          }}>
            <option value="">🖼 From Media…</option>
            {#each mediaFiles as m (m.id)}<option value={m.id}>{FILE_ICON[m.kind]} {m.name}</option>{/each}
          </select>
        {/if}
      </div>
      <div class="row wrap">
        <input
          class="link"
          placeholder="or a link (YouTube, a picture…)"
          bind:value={link}
          aria-label="A link to put on the card"
          style:-webkit-text-security={masked ? 'disc' : undefined}
          onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), addLink())}
        />
        <button class="small" onclick={addLink} disabled={!link.trim()}>＋ Link</button>
      </div>
      {#if itemKinds.length}
        <div class="row wrap" aria-label="On the card">
          {#each itemKinds as it (it.el)}
            <span class="item small">{ICON[it.kind]}<button class="ghost tiny" aria-label="Take the {ICON[it.kind].split(' ')[1]} off the card" onclick={() => (items = items.filter((x) => x.id !== it.el))}>✕</button></span>
          {/each}
        </div>
      {/if}
    {/if}
  {/if}

  {#if roundOn}
    <div class="row wrap" role="radiogroup" aria-label="How long it lasts">
      <span class="muted small">Lasts</span>
      <label class="check small"><input type="radio" name="card-lasts-{uid}" value="round" bind:group={lasts} onchange={() => (ownLasts = 'round')} /> until the round ends</label>
      <label class="check small"><input type="radio" name="card-lasts-{uid}" value="host" bind:group={lasts} onchange={() => (ownLasts = 'host')} /> until I take it back</label>
    </div>
  {/if}

  {#if left}<div class="small warn">{left}</div>{/if}
  {#if noPhone.length && hasSomething}
    <div class="small warn">
      📵 {noPhone.map(nameOf).join(', ')} {noPhone.length > 1 ? 'have' : 'has'} no phone here: copy it to them (📋), or
      {#if cardWindow.open && noPhone.includes(cardWindow.seat ?? '')}it shows in the 🪟 card window once sent{:else}<button class="ghost tiny" onclick={() => openWin(noPhone[0])} title="Opens a window with only {nameOf(noPhone[0])}’s cards, to share with them alone">show it in the 🪟 card window</button>{/if}
    </div>
  {/if}
  {#if full}<div class="small warn" data-cards-full>{cardsFullText(game, session)}</div>{/if}
  <div class="row wrap">
    {#if cardsOn}
      <button class="primary small" onclick={send} disabled={!canSend} title={cant || `Sends it to ${names.join(', ')} now`}>📤 Send</button>
    {:else if windowName}
      <button class="primary small" onclick={send} disabled={!canSend} title={(cant && cant !== 'Choose who gets it first' ? cant : '') || `Shows it in the 🪟 card window, to ${windowName} alone, until you take it back or it’s over`}>🪟 Show {windowName}</button>
    {/if}
    <!-- (Not a greyed one for a quick card that went, its words gone: the line under it copies that one.) -->
    {#if (!cardsOn || noPhone.length) && (hasSomething || !sentCopy)}
      <button class="small" onclick={copyWords} disabled={!to.length || !slide || (!cardWords(slide) && !cardLinks(game, slide).length)} title="Copies “For … only” with the card’s words and links, to paste in a DM">📋 Copy words</button>
      {#if slide && hasPicture(game, slide) && canCopyPicture}
        <button class="small" onclick={() => copyCardPicture(game, slide, 'The card', names.join(', ') || 'them')} disabled={!to.length}>📋 Copy picture</button>
      {/if}
    {/if}
  </div>
  {#if alreadyText}<div class="small muted" data-card-already>{alreadyText}</div>{/if}
  {#if !cardsOn}
    <div class="muted small">
      {room ? 'This buzzer server doesn’t put cards on phones: copy it to them (📋)' : 'No phone buzzers in this game: copy it to them (📋)'}{#if cardWindow.open}, or show it in the 🪟 card window.{:else if firstSeat}, or
        <button class="ghost tiny" onclick={() => openWin(firstSeat)} title="Opens a window with only {nameOf(firstSeat)}’s cards, to share with them alone">open a 🪟 card window for {nameOf(firstSeat)}</button>{:else}, or open a 🪟 card window for one of them.{/if}
    </div>
  {/if}
  {#if said}<div class="small" role="status" data-card-said>✓ {said}</div>{/if}
  {#if sentCopy && sentCopySlide}
    {@const label = sentCopy.card.label}
    {@const whom = sentCopy.names.join(', ')}
    {@const sl = sentCopySlide}
    <!-- (The card that went, for those with no phone here: a quick card's words are gone from the form above.) -->
    <div class="row wrap" data-card-said-copy>
      {#if cardWords(sl) || cardLinks(game, sl).length}
        <button class="small" onclick={copySent} aria-label="Copy {label}’s words for {whom}" title="Copies “For {whom} only” with {label}’s words and links, to paste in a DM">📋 Copy words</button>
      {/if}
      {#if hasPicture(game, sl) && canCopyPicture}
        <button class="small" onclick={() => copyCardPicture(game, sl, label, whom)} aria-label="Copy {label}’s picture for {whom}">📋 Copy picture</button>
      {/if}
    </div>
  {/if}
  {#if !dual}
    <span class="exposed"
      >{preset
        ? '⚠ Viewers can see this window: it says who gets the card, never what’s on it.'
        : '⚠ Viewers can see this window: what you type is hidden (👁 Show shows it to them too); of a card made in the editor they see its name or its tile, never what’s on it.'}</span
    >
  {/if}
</div>

<style>
  .send {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .head {
    font-size: 12px;
    font-weight: 700;
    opacity: 0.8;
  }
  .wrap {
    flex-wrap: wrap;
  }
  .chip {
    border-width: 2px;
    padding: 2px 8px;
    font-size: 12px;
  }
  .chip.ghost {
    border-style: dashed;
  }
  .chip.person {
    border-style: dotted;
  }
  .part {
    margin-left: 4px;
    font-size: 12px;
    opacity: 0.8;
  }
  .item {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 1px 2px 1px 8px;
    border-radius: 6px;
    background: var(--panel-2);
  }
  .tiny {
    font-size: 12px;
    padding: 0 4px;
  }
  .link {
    flex: 1;
    min-width: 0;
  }
  textarea {
    flex: 1;
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
  }
  .media {
    flex: 1;
    min-width: 0;
  }
  select {
    max-width: 100%;
  }
  .preview {
    max-height: 8lh;
    overflow-y: auto;
    white-space: pre-line;
    padding: 4px 8px;
    border-radius: 6px;
    background: var(--panel-2);
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
</style>
