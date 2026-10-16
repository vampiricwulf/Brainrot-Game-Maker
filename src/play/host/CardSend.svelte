<!--
  🤫 Send a card… (partner-clues spec §12.2), from the tools row in any round: who gets it (players or teams, people on
  a team, everyone, or ⇄ everyone else), what (a tile's 🤫 card made in the editor, or a quick one: words typed or
  pasted, with a picture, video or sound from this computer or pasted, or a link), and how long it lasts (until the
  round ends, or until taken back). 📤 Send puts it on their phones, through the same buzzer room path as a partner
  clue's cards; without one, 📋 copies it to them. Nothing goes but by that press. In one window viewers see this: the
  saved cards are listed by tile and counted, never said, and what's typed for a quick card shows, which it says.
  With `preset`, the card an action offered (an RPG object's, an item's, a wheel slice's or a board space's 🤫 button):
  who it starts with and how long it lasts come from the action, the card is fixed (counted, never shown), and it goes
  only when the host presses 📤 Send here.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { app, toast } from '../../lib/app.svelte';
  import { announce } from '../../lib/announce';
  import { CARD_MEDIA_MAX } from '../../lib/buzzproto';
  import { teamsOn } from '../../lib/buzz';
  import { phoneCan } from '../../lib/cardfiles.svelte';
  import { textOn } from '../../lib/colors';
  import { ACCEPT, addMediaFile, identicalMedia, mediaKind } from '../../lib/media.svelte';
  import { boardRounds, cardSlides, categoryLabel, clueValue, formatPoints, roundName, type CardTo, type Game, type Id, type SentCard, type Session, type Slide, type SlideElement, type TeamMember } from '../../lib/model';
  import { cardSummary, copyWordsText, toKey } from '../../lib/partner';
  import { cardItems, cardLinks, cardWords, phoneCard, type CardItem } from '../../lib/phonecard';
  import { buzzerOn, remote, roomHasCards, roomHasFiles, roomMembers } from '../../lib/remote.svelte';
  import { fileItem, linkItem, memberTo, quickSlide, sendCard, sentToText, tileCard } from '../../lib/sentcards';
  import { cardWindow } from '../../lib/cardwindow.svelte';
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

  /** Every tile's 🤫 card in the game, by tile ("Movies $400 · Card 1 · 1 line of words"): never what's on it. */
  const saved = $derived.by(() => {
    const sym = game.settings.currencySymbol;
    const rounds = boardRounds(game);
    const out: { key: string; clue: Id; card: Id; label: string }[] = [];
    for (const r of rounds) {
      const prefix = rounds.length > 1 ? `${roundName(r, game.rounds.indexOf(r))} · ` : '';
      for (const c of r.categories)
        c.clues.forEach((cl, row) => {
          if (cl.empty) return;
          cardSlides(cl).forEach((card, i) =>
            out.push({ key: `${cl.id}/${card.id}`, clue: cl.id, card: card.id, label: `${prefix}${categoryLabel(c)} ${formatPoints(clueValue(r, row, cl), sym)} · Card ${i + 1} · ${cardSummary(game, card)}` }),
          );
        });
    }
    return out;
  });
  let kind = $state<'saved' | 'quick'>('quick');
  let pick = $state('');
  // (In one window a card made in the editor keeps its words off stream: it's the first choice there.)
  let chose = false;
  $effect(() => {
    if (chose || !saved.length) return;
    chose = true;
    if (!dual) kind = 'saved';
  });
  const chosen = $derived(saved.find((x) => x.key === pick) ?? saved[0]);
  let words = $state('');
  let items = $state<SlideElement[]>([]);
  let link = $state('');
  let fileInput = $state<HTMLInputElement>();
  /** The card as it would go: an action's, a tile's (as the editor has it), or the quick one. */
  const slide = $derived(preset ? preset.slide : kind === 'saved' ? (chosen ? tileCard(game, chosen.clue, chosen.card)?.card : undefined) : quickSlide(words, items));
  const hasSomething = $derived(!!slide && slide.elements.some((e) => e.kind !== 'text' || !!e.text.trim()));
  /** The quick card's items, in order, by kind (never named: in one window viewers see this). */
  const itemKinds = $derived(cardItems(game, quickSlide('', items)));
  const ICON: Record<CardItem['kind'], string> = { picture: '🖼 picture', gif: '🖼 GIF', video: '🎞 video', sound: '🔊 sound', embed: '▶ online video' };

  /** A picture, GIF, video or sound from this computer (or pasted): into the game's 🖼 Media, onto the card. */
  async function addFile(file: File): Promise<void> {
    if (items.length >= CARD_MEDIA_MAX) return toast(`A card shows ${CARD_MEDIA_MAX} pictures, videos and sounds at most`);
    const k = mediaKind(file.name, file.type);
    if (k !== 'image' && k !== 'video' && k !== 'audio') return toast('Add a picture, GIF, video or sound');
    try {
      // (The same file already in the game: that one, without a toast naming it, as this window may be on stream.)
      const ref = (await identicalMedia(game, file, k)) ?? (await addMediaFile(game, file));
      const el = fileItem(ref);
      if (el) items = [...items, el];
    } catch (e) {
      toast(dual && e instanceof Error ? e.message : 'That file can’t go on a card: use a picture, GIF, video or sound', 4000);
    }
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
  /** What was sent last (names only), for the line under the button. */
  let said = $state('');
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
  const canSend = $derived(sendTo.length > 0 && hasSomething);

  function send(): void {
    if (!canSend || !slide) return;
    const content: SentCard['content'] = !preset && kind === 'saved' && chosen ? { clue: chosen.clue, card: chosen.card } : { slide };
    const c = sendCard(game, session, { to: sendTo, content, until });
    if (!c) return toast('That card can’t be sent now');
    said = `${c.label} sent to ${sentToText(session, c.to, teams)}`;
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
      <label class="check small"><input type="radio" name="card-kind" value="saved" bind:group={kind} disabled={!saved.length} /> One made in the editor</label>
      <label class="check small"><input type="radio" name="card-kind" value="quick" bind:group={kind} /> A quick card</label>
    </div>
    {#if kind === 'saved'}
      {#if saved.length}
        <select class="small" aria-label="The card to send" value={chosen?.key ?? ''} onchange={(e) => (pick = e.currentTarget.value)}>
          {#each saved as s (s.key)}<option value={s.key}>{s.label}</option>{/each}
        </select>
      {:else}
        <div class="muted small">No tile has a 🤫 card yet: make one in the editor (a tile’s ＋ Card).</div>
      {/if}
    {:else}
      <textarea rows="3" dir="auto" bind:value={words} onpaste={paste} placeholder="What they’ll see… (paste a picture here too)" aria-label="The card’s words"></textarea>
      <div class="row wrap">
        <button class="small" onclick={() => fileInput?.click()} title="A picture, GIF, video or sound from this computer (it goes into the game’s 🖼 Media)">🖼 Add a file…</button>
        <input bind:this={fileInput} type="file" accept={ACCEPT.any} hidden onchange={(e) => {
          const f = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (f) void addFile(f);
        }} />
        <input class="link" placeholder="or a link (YouTube, a picture…)" bind:value={link} aria-label="A link to put on the card" onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), addLink())} />
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
      <label class="check small"><input type="radio" name="card-lasts" value="round" bind:group={lasts} /> until the round ends</label>
      <label class="check small"><input type="radio" name="card-lasts" value="host" bind:group={lasts} /> until I take it back</label>
    </div>
  {/if}

  {#if left}<div class="small warn">{left}</div>{/if}
  {#if noPhone.length}
    <div class="small warn">📵 {noPhone.map((id) => session.players.find((p) => p.id === id)?.name ?? '?').join(', ')} {noPhone.length > 1 ? 'have' : 'has'} no phone here: copy it to them (📋), or show it in the 🪟 card window</div>
  {/if}
  <div class="row wrap">
    {#if cardsOn}
      <button class="primary small" onclick={send} disabled={!canSend} title={!to.length ? 'Choose who gets it first' : !hasSomething ? 'Put something on the card first' : `Sends it to ${names.join(', ')} now`}>📤 Send</button>
    {:else if windowName}
      <button class="primary small" onclick={send} disabled={!canSend} title={hasSomething ? `Shows it in the 🪟 card window, to ${windowName} alone, until you take it back or it’s over` : 'Put something on the card first'}>🪟 Show {windowName}</button>
    {/if}
    {#if !cardsOn || noPhone.length}
      <button class="small" onclick={copyWords} disabled={!to.length || !slide || (!cardWords(slide) && !cardLinks(game, slide).length)} title="Copies “For … only” with the card’s words and links, to paste in a DM">📋 Copy words</button>
      {#if slide && hasPicture(game, slide) && canCopyPicture}
        <button class="small" onclick={() => copyCardPicture(game, slide, 'The card', names.join(', ') || 'them')} disabled={!to.length}>📋 Copy picture</button>
      {/if}
    {/if}
  </div>
  {#if !cardsOn}
    <div class="muted small">{room ? 'This buzzer server doesn’t put cards on phones: copy it to them (📋)' : 'No phone buzzers in this game: copy it to them (📋)'}{cardWindow.open ? ', or show it in the 🪟 card window.' : ', or open a 🪟 card window for one of them.'}</div>
  {/if}
  {#if said}<div class="small" role="status" data-card-said>✓ {said}</div>{/if}
  {#if !dual}
    <span class="exposed">{preset ? '⚠ Viewers can see this window: it says who gets the card, never what’s on it.' : '⚠ Viewers can see this window: they’d see a quick card’s words and link as you type them. A card made in the editor stays off stream.'}</span>
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
    width: 100%;
    box-sizing: border-box;
  }
  select {
    max-width: 100%;
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
