<!--
  🤝 A partner clue's part of the host panel (partner-clues spec §6.10): PARTNER UP! (who picked it, the partner by the
  wheel or by hand, ⇄ Swap), then 📤 Hand out the cards (who gets each card, and 📋 copying it to them). In one window
  this panel is on stream: it counts what's on a card and never says it, nor names a card's pictures (a file name is
  often the answer). The cards themselves are in the editor's 🤫 Card tabs, and the two-window host column.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { app, toast } from '../../lib/app.svelte';
  import { textOn } from '../../lib/colors';
  import { overlayDoneAt, toolOverlay } from '../../lib/live';
  import { mediaUrls } from '../../lib/media.svelte';
  import { cardSlides, PARTNER_GAMES, type Clue, type ClueCard, type Game, type Id, type PartnerState, type Session } from '../../lib/model';
  import {
    cardCopyText, cardRecipients, cardSummary, goesToLabel, lowerWord, pairOnly, partnerCandidates, partnerRoles, partnerRules, partWordOf, partWords, recipientsText,
    resetRecipients, setPartner, setPartnerPicker, setRecipients, swapParts,
  } from '../../lib/partner';
  import { cardItems, cardLinks, cardWords } from '../../lib/phonecard';
  import { clueName } from '../../lib/session';
  import { buzzerOn } from '../../lib/remote.svelte';
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
    onspin,
    onshow,
    onclock,
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
    if (!setPartner(session, s, id, 'host')) return toast(`${name(id)} picked it: tick “${name(id)} can be on the wheel” to make it Solo`);
    announce(id === s.pickerId ? `${name(id)} plays it alone` : `${name(id)} is ${name(s.pickerId)}’s partner`);
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
  /** Who plays which part, in words: "Bob describes · Ann guesses" (before the pair is known, "The partner describes…"). */
  const partsSaid = $derived(
    roles.solo
      ? `${name(roles.guesser)} plays it alone (Solo)`
      : `${roles.giver ? name(roles.giver) : 'The partner'} ${G.verb} · ${roles.guesser ? name(roles.guesser) : 'the partner'} ${G.guessVerb}`,
  );
  function swap(): void {
    swapParts(s);
    announce(partsSaid);
  }

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
    if (st.stage === 'distribute') return { label: '⏱ Start the clock', key: '⏎', title: 'Enter or N: the countdown starts (copy the cards to their players first)', run: onclock };
    return null;
  });
</script>

{#snippet chip(id: Id, on: boolean, label: string, onclick: () => void, disabled = false, title = '', key = 0)}
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
    {#if key && key <= 9}<span class="key">{key}</span>{/if}{p?.name}{#if on}&nbsp;✓{/if}{#if partOf(id)}<span class="part">{partOf(id)}</span>{/if}
  </button>
{/snippet}

{#snippet parts()}
  <span class="parts" data-partner-parts>{roles.solo ? '🎯' : G.icon} {partsSaid.replace(' · ', ' · 🎯 ')}</span>
  <button class="small ghost" onclick={swap} disabled={roles.solo} title={roles.solo ? 'Solo: one player plays both parts' : `Turn the parts round: the ${lowerWord(words.giver)} becomes the ${lowerWord(words.guesser)} (the cards that follow a part go with it, and so do the points)`}>⇄ Swap</button>
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
        <span class="muted">{partner ? `🤝 ${picker.name} + ${partner.id === picker.id ? 'Solo' : partner.name}${s.how ? HOW[s.how] : ''}` : 'Partner: spin the wheel, or choose →'}</span>
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
    {#if cards.length}<span class="muted small">📋 You’ll copy the cards to them: phones only show who plays.</span>{/if}
  {:else}
    <div class="row">
      <b>{cards.length ? '📤 Hand out the cards' : '🤝 Partner clue'}</b>
      {@render parts()}
      <button class="ghost small" aria-haspopup="menu" onclick={partnerMenu} title="Choose another partner (the cards that follow a part go with it)">change partner ▾</button>
    </div>
    {#each cards as card, i (card.id)}
      {@const n = i + 1}
      {@const to = recipients(card)}
      {@const changed = !!s.deal?.[card.id]}
      {@const pics = cardItems(game, card).some((it) => it.kind === 'picture' || it.kind === 'gif')}
      {@const copyable = !!cardWords(card) || cardLinks(game, card).length > 0}
      <!-- One row a card: what's on it (counted), who gets it, and the copy buttons. -->
      <div class="row card" data-card={n}>
        <b>Card {n}</b>
        <span class="muted small">· {cardSummary(game, card)}</span>
        <span aria-hidden="true">→</span>
        {#each session.players as p (p.id)}
          {@render chip(p.id, to.includes(p.id), `Card ${n} to ${p.name}`, () => toggle(card, p.id))}
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
        <span class="spacer"></span>
        <button class="small" onclick={() => copyWords(card, n)} disabled={!to.length || !copyable}
          title={!to.length ? 'Choose who gets it first' : copyable ? `Copies “For ${to.map(name).join(', ')} only…” with the card’s words and links, to paste in a DM` : 'This card has no words or links: 📋 Copy picture'}
          >📋 Copy words</button
        >
        {#if pics && canCopyPicture}
          <button class="small" onclick={() => copyPicture(card, n)} disabled={!to.length} title={to.length ? 'Copies the card’s picture, to paste in a DM' : 'Choose who gets it first'}>📋 Copy picture</button>
        {/if}
      </div>
    {/each}
    {#if cards.length}
      <span class="muted small">📋 Copy each card to its {noun}s (paste it in a DM): phones only show who plays. The points follow the parts, not the cards.</span>
    {/if}
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
</style>
