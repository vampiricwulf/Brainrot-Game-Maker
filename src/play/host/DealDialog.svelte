<!--
  🎭 Deal… (partner-clues spec §11, §12.2), from the tools row in any round: secret parts for everyone. The host chooses
  a deal saved with the game (made in the editor's 🎡 Wheels, Dice & Deals tab) or a ready-made one, changes its numbers
  for this deal if they like, and presses 🎭 Deal: each player dealt in gets one part, at random (with the audience
  window open, the host can choose who gets a part), and a part's card can show a slice of a saved wheel. Nothing goes
  anywhere until 📤 Send: then each player's card goes to their phone as a card of its own (through the same path as
  🤫 Send a card…).
  ↻ Send again, ✖ Take back, and 🎭 Who was who (on stream, a step: Ctrl+Z takes it off) follow.
  In one window viewers see this: it never says who got which part (only how many of each, and everyone dealt in alike,
  a part or not; with the phones getting the cards, those dealt in with no phone here, by phone only), never shows
  what's on a card, and offers the host's picks only with the audience window open. Who got which is in the host column
  there.
-->
<script lang="ts">
  import { app, hint, toast } from '../../lib/app.svelte';
  import { announce } from '../../lib/announce';
  import { ask } from '../../lib/ask.svelte';
  import { cardsLeftOff, dealFullText, roomCardsFull, teamsOn } from '../../lib/buzz';
  import { CARDS_MAX } from '../../lib/buzzproto';
  import { filesCounted, phoneCan, retryFiles } from '../../lib/cardfiles.svelte';
  import { cardWindow, openCardWindow } from '../../lib/cardwindow.svelte';
  import { textOn } from '../../lib/colors';
  import {
    clearDeal, countText, dealCopyText, dealCounts, dealFromTemplate, dealHands, dealOut, dealPhones, dealPhonesLate, dealProblem, dealtIn, dealTrial, DEAL_TEMPLATES, newDealPart,
    partName, sendDeal, sendDealAgain, startDeal, takeBackDeal,
  } from '../../lib/deals';
  import { DEAL_PART_MAX, DEAL_PARTS_MAX, MAX_PLAYERS, setSlideText, slideText, type CardTo, type DealPart, type Game, type Id, type SentCard, type Session } from '../../lib/model';
  import { cardSummary, toKey } from '../../lib/partner';
  import { phoneCard } from '../../lib/phonecard';
  import { buzzerOn, remote, roomHasCards, roomHasFiles, roomMembers } from '../../lib/remote.svelte';
  import { nameList } from '../../lib/session';
  import { sentCardId, sentSlide } from '../../lib/sentcards';
  import { whoWasWhoStep } from '../../lib/toolset';
  import { WHEEL_TEMPLATES, wheelFromTemplate } from '../../lib/wheeltemplates';
  import { copyText } from '../standings';
  import { leftLine, seenSeats } from './cardrow';
  import { dealDraft } from './dealdraft.svelte';

  let {
    game,
    session,
    dual = false,
    ongone,
  }: {
    game: Game;
    session: Session;
    dual?: boolean;
    /** A deal's cards were taken back (✖ Take back, or a new deal): the room hears it at once, and lets go of their files. */
    ongone: (cards: SentCard[]) => void;
  } = $props();

  const uid = $props.id();
  const teams = $derived(buzzerOn(game.settings) && teamsOn(game.settings));
  const room = $derived(buzzerOn(game.settings) && !!remote.code && remote.status !== 'off' && remote.status !== 'error');
  /** Its phones get the cards the host sends (else the host copies them: 📋, or the 🪟 card window). */
  const cardsOn = $derived(room && roomHasCards());
  const filesOn = $derived(cardsOn && roomHasFiles());
  const nameOf = (id: Id) => session.players.find((p) => p.id === id)?.name ?? '?';
  const who = (t: CardTo) => (t.member ? `${t.member.name} (${nameOf(t.seat)})` : nameOf(t.seat));

  const d = $derived(session.deal ?? null);
  /** Setting up a new deal while one is on the table. */
  let fresh = $state(false);
  const setup = $derived(!d || fresh);

  // ---------- Setting up ----------

  const work = $derived(dealDraft.work);
  /** The game's wheel for a ready-made deal's wheel: one named like it, if the game has one. */
  function wheelFor(key: string | undefined): Id | undefined {
    const t = WHEEL_TEMPLATES.find((x) => x.key === key);
    if (!t) return undefined;
    const have = game.wheels.find((w) => w.name.trim().toLowerCase() === t.name.toLowerCase());
    return have?.id ?? readyWheel(t.key);
  }
  /**
   * A ready-made wheel for this deal to draw from (the game has none like it): kept with the setup, never added to the
   * game. Its id.
   */
  function readyWheel(key: string): Id | undefined {
    const t = WHEEL_TEMPLATES.find((x) => x.key === key);
    if (!t) return undefined;
    if (dealDraft.extra?.key !== key) dealDraft.extra = { key, wheel: wheelFromTemplate(t, game.settings.currencySymbol) };
    return dealDraft.extra.wheel.id;
  }
  /** The wheels a deal can draw from: the game's, and the ready-made one chosen for this deal. */
  const drawFrom = $derived({ wheels: dealDraft.extra ? [...game.wheels, dealDraft.extra.wheel] : game.wheels, media: game.media });
  const wheelValue = $derived(work?.wheel && work.wheel === dealDraft.extra?.wheel.id ? `tpl:${dealDraft.extra.key}` : (work?.wheel ?? ''));
  function chooseWheel(v: string): void {
    if (!work) return;
    work.wheel = v.startsWith('tpl:') ? readyWheel(v.slice(4)) : v || undefined;
  }
  function choose(from: string): void {
    dealDraft.from = from;
    dealDraft.picks = {};
    if (from.startsWith('saved:')) {
      const saved = game.deals?.find((x) => `saved:${x.id}` === from);
      dealDraft.work = saved ? JSON.parse(JSON.stringify($state.snapshot(saved))) : null;
    } else {
      const t = DEAL_TEMPLATES.find((x) => `tpl:${x.key}` === from);
      dealDraft.work = t ? dealFromTemplate(t, t.name, wheelFor(t.wheel)) : null;
    }
  }
  // (The deal chosen last in this game, or its first saved one.)
  $effect(() => {
    if (dealDraft.work && dealDraft.game === game.id) return;
    Object.assign(dealDraft, { game: game.id, picks: {}, skip: [], dealt: undefined, extra: undefined });
    const first = game.deals?.[0];
    choose(first ? `saved:${first.id}` : `tpl:${DEAL_TEMPLATES[0].key}`);
  });

  /** Dealt within each team, to the people on it (teams whose phones get cards: the room knows who's on each). */
  const perTeam = $derived(!!work?.perTeam && teams && cardsOn);
  /** Everyone who can be dealt in: the players (whole teams), or the people on each team. */
  const everyone = $derived<CardTo[]>(
    perTeam ? session.players.flatMap((p) => roomMembers(p.id).map((m) => ({ seat: p.id, member: { id: m.id, name: m.name } }))) : session.players.map((p) => ({ seat: p.id })),
  );
  const pool = $derived(everyone.filter((t) => !dealDraft.skip.includes(toKey(t))));
  function toggleIn(t: CardTo): void {
    const k = toKey(t);
    dealDraft.skip = dealDraft.skip.includes(k) ? dealDraft.skip.filter((x) => x !== k) : [...dealDraft.skip, k];
  }
  /** The host's picks count only with the audience window open (in one window viewers would see them). */
  const picks = $derived(dual ? dealDraft.picks : {});
  const pickedFor = (part: DealPart, t: CardTo) => (dealDraft.picks[part.id] ?? []).some((x) => toKey(x) === toKey(t));
  /** Pick a player for a part (off any other part they were picked for: never two parts), or unpick them. */
  function togglePick(part: DealPart, t: CardTo): void {
    const k = toKey(t);
    const on = pickedFor(part, t);
    const next: Record<Id, CardTo[]> = {};
    for (const [id, list] of Object.entries(dealDraft.picks)) {
      const kept = list.filter((x) => toKey(x) !== k);
      if (kept.length) next[id] = kept;
    }
    if (!on) next[part.id] = [...(next[part.id] ?? []), t];
    dealDraft.picks = next;
  }
  const problem = $derived(work ? dealProblem(drawFrom, work, pool, { picks, perTeam }) : 'Choose a deal first');
  const draws = $derived(!!work?.parts.some((p) => p.draw));

  function addPart(): void {
    if (!work || work.parts.length >= DEAL_PARTS_MAX) return;
    work.parts.push(newDealPart(work.parts.length + 1));
  }
  function removePart(part: DealPart): void {
    if (!work) return;
    work.parts = work.parts.filter((p) => p !== part);
    const { [part.id]: _gone, ...rest } = dealDraft.picks;
    dealDraft.picks = rest;
  }

  /** 🎭 Deal: who gets which, nothing sent. A deal whose cards are out is taken back first (one deal at a time). */
  async function deal(): Promise<void> {
    if (!work) return;
    const r = dealHands(drawFrom, work, pool, { picks, perTeam });
    if ('problem' in r) return toast(r.problem);
    if (d && dealOut(game, session).length) {
      const yes = await ask(`Dealing a new one takes the cards of “${d.name}” back from the phones.`, { title: 'Deal a new one?', ok: 'Take them back and deal' });
      if (!yes) return;
    }
    const gone = (session.cards ?? []).filter((c) => c.deal);
    dealDraft.dealt = startDeal(session, work, r.hands, r.dealtIn).id;
    if (gone.length) ongone(gone);
    fresh = false;
    announce(`Dealt to ${r.dealtIn.length}: ${dealCounts(session.deal!)}. Nothing sent yet.`);
  }

  // ---------- The deal on the table ----------

  /** The deal's cards out now (one per player). */
  const out = $derived(d ? dealOut(game, session) : []);
  const roundOn = $derived(session.phase !== 'end' && session.phase !== 'tiebreaker');
  let lasts = $state<'round' | 'host'>('round');
  /** How long the cards last: as chosen, or as they lasted when sent before (📤 Send again after ✖ Take back). */
  const until = $derived<'round' | 'host'>(!roundOn ? 'host' : d?.stage === 'sent' && d.until ? d.until : lasts);
  /** More players than the phones hold cards at once, all together (the room's CARDS_MAX). */
  const tooMany = $derived(!!d && cardsOn && d.hands.length > CARDS_MAX);
  const full = $derived(!!d && cardsOn && !out.length && !tooMany && roomCardsFull(game, session, dealTrial(game, d, until)));
  /** Why it can't go when `full`: the cards out, what the deal adds, how many to take back. */
  const fullText = $derived(full && d ? dealFullText(game, session, dealTrial(game, d, until)) : '');
  /**
   * The deal's cards out that never reach a phone (their ids on the wire): handed out before the room took cards, more
   * than it takes at once (it's told the newest CARDS_MAX).
   */
  const leftOff = $derived.by(() => {
    if (!cardsOn || !out.length) return new Set<string>();
    const off = new Set(cardsLeftOff(game, session));
    return new Set(out.map(sentCardId).filter((id) => off.has(id)));
  });
  const over = $derived(leftOff.size > 0);

  /** 📤 Send (or ✔ Hand them out, with no phones getting cards): every player's card goes now. */
  function send(): void {
    if (!d) return;
    if (tooMany) return hint(`The phones hold ${CARDS_MAX} cards at once, all phones together: deal fewer in`);
    if (full) return toast(fullText, 4000);
    const cards = sendDeal(game, session, until, Date.now(), cardsOn && roomCardsFull(game, session, dealTrial(game, d, until)));
    if (!cards.length) return toast('The deal can’t be sent now');
    d.phonesAt = dealPhones(d, remote.phones);
    announce(cardsOn ? `${d.name}: ${cards.length} cards sent, one to each player` : `${d.name} dealt: copy each card to its player (📋)`);
  }
  function again(): void {
    if (!d) return;
    retryFiles(game, session, out.flatMap((c) => sentSlide(game, c) ?? []));
    const n = sendDealAgain(game, session);
    if (!n) return;
    d.phonesAt = dealPhones(d, remote.phones);
    announce(`${d.name}: ${n} cards sent again`);
  }
  function takeBack(): void {
    if (!d) return;
    const gone = takeBackDeal(game, session);
    if (gone.length) ongone(gone);
    announce(`${d.name}: cards taken back`);
  }
  async function putAway(): Promise<void> {
    if (!d) return;
    if (out.length && !(await ask(`The cards of “${d.name}” go from the phones, and who had which part is forgotten.`, { title: 'Put the deal away?', ok: 'Put it away' }))) return;
    const gone = (session.cards ?? []).filter((c) => c.deal);
    clearDeal(session);
    if (gone.length) ongone(gone);
    fresh = false;
  }
  function reveal(show: boolean): void {
    if (whoWasWhoStep(session, show)) announce(show ? 'Who was who is on screen' : 'Who was who is off the screen');
  }

  /**
   * How the deal's cards stand on the phones, all together (never one player's card: that would say who had which). In
   * one window the phones that came after the cards went are only counted, a part or not, from the room's list of phones
   * (dealPhonesLate): only those with a part have a card to be late for, so their names, or any count of the room's late
   * phones, would say who got one (a deal with no part for "the rest") as each phone came.
   */
  const status = $derived.by(() => {
    if (!d || d.stage !== 'sent') return '';
    if (!out.length)
      return tooMany
        ? `Its cards are back: the phones hold ${CARDS_MAX} at once, all phones together, so 🎭 Deal a new one with fewer in`
        : full
          ? `Its cards are back, and the phones have no room for them now: ${fullText}`
          : 'Its cards are back (or over): 📤 Send puts them out again';
    if (over)
      return `Only ${out.length - leftOff.size} of the ${out.length} cards are on the phones (they hold ${CARDS_MAX} at once, all phones together): copy ${dual ? 'the others theirs (📋, marked below)' : 'everyone theirs (📋)'}, or ✖ Take back and deal fewer in`;
    if (!cardsOn) return `Dealt: copy each card to its player (📋)${cardWindow.open ? ', or show them in the 🪟 card window' : ''}`;
    const seen = out.filter((c) => seenSeats(session, c).length).length;
    const parts = [seen ? `✓ seen by ${seen} of ${out.length}` : `Sent to ${out.length}`];
    const f = filesOn ? filesCounted(game, session, out.flatMap((c) => sentSlide(game, c) ?? [])) : null;
    if (f?.going) parts.push(`uploading ${Math.min(f.files, f.up + 1)} of ${f.files - f.failed}…`);
    if (dual) {
      const lateHere = remote.cardsLate.filter((l) => out.some((c) => sentCardId(c) === l.id));
      const late = [...new Set(lateHere.map((l) => (l.by ? `${l.by}’s phone (${nameOf(l.seatId)})` : `${nameOf(l.seatId)}’s new phone`)))];
      if (late.length) parts.push(`${nameList(late)} ${late.length > 1 ? 'haven’t' : 'hasn’t'} got theirs: ↻ Send again`);
    } else {
      const n = dealPhonesLate(d, remote.phones);
      if (n) parts.push(`${n} phone${n === 1 ? '' : 's'} came after the cards went: ↻ Send again`);
    }
    // (Never taken off the count above: it counts the parts, so the difference would say whether they got one.)
    if (noPhone.length) parts.push(`📵 ${nameList(noPhone.map(who))} ${noPhone.length > 1 ? 'have' : 'has'} no phone here: copy theirs (📋)`);
    return parts.join(' · ');
  });
  /** What of the cards won't reach the phones, counted for the whole deal. */
  const left = $derived(cardsOn && d ? leftLine(d.hands.flatMap((h) => phoneCard(game, h.slide, filesOn ? phoneCan(session) : { files: null }).left)) : '');
  const seenBy = (seat: Id, member?: string) =>
    out.some((c) => c.to.some((t) => t.seat === seat && t.member?.id === member) && (session.remote?.cardsSeen?.[sentCardId(c)] ?? []).some((w) => w === (member ? `${seat}/${member}` : seat)));
  /** Their card is one the phones never get (said only with the audience window open: only those with a part have one). */
  const leftOffFor = (to: CardTo) => out.some((c) => c.to.some((t) => toKey(t) === toKey(to)) && leftOff.has(sentCardId(c)));

  /** Everyone dealt in, a part or not: the list to copy from names them all (only those with a part would say who). */
  const dealtList = $derived(d ? dealtIn(d) : []);
  const phones = $derived(new Set(app.live.phones ?? []));
  /**
   * Dealt in with no phone here while the phones get the cards: the host copies theirs (📋), a part or not (picked out by
   * phone only, never by part: who has a phone is on their plate already).
   */
  const noPhone = $derived(cardsOn ? dealtList.filter((t) => !t.member && !phones.has(t.seat)) : []);
  /** 📋 Their card (or "no part for you this time"), in words for a DM. */
  function copyHand(to: CardTo): void {
    if (!d) return;
    void copyText(dealCopyText(game, session, d, to), `${who(to)}’s card copied: paste it to them alone`);
  }
  function openWin(seat: Id): void {
    if (!openCardWindow(seat)) toast('The browser blocked the popup. Allow popups for this file and try again.', 5000);
  }
  const COUNTS = Array.from({ length: MAX_PLAYERS + 1 }, (_, i) => i);
</script>

<div class="deal" data-deal>
  {#if !dual}
    <span class="exposed">⚠ Viewers can see this window: it never says who got which part, nor what’s on a card.</span>
  {/if}
  {#if setup}
    <div class="head">🎭 Deal secret parts</div>
    <select class="small" aria-label="The deal" value={dealDraft.from} onchange={(e) => choose(e.currentTarget.value)}>
      {#if game.deals?.length}
        <optgroup label="Saved with the game">
          {#each game.deals as s (s.id)}<option value="saved:{s.id}">🎭 {s.name}</option>{/each}
        </optgroup>
      {/if}
      <optgroup label="Ready-made">
        {#each DEAL_TEMPLATES as t (t.key)}<option value="tpl:{t.key}">{t.icon} {t.name} · {t.hint}</option>{/each}
      </optgroup>
    </select>
    <div class="muted small">Make your own in the editor’s 🎡 Wheels, Dice & Deals tab.</div>
    {#if work}
      <div class="head">Parts</div>
      {#each work.parts as part, i (part.id)}
        <div class="part" data-deal-part={i + 1}>
          <div class="row">
            <input class="pname small" value={part.name} maxlength={DEAL_PART_MAX} aria-label="Part {i + 1}’s name" oninput={(e) => (part.name = e.currentTarget.value)} />
            <select class="small" aria-label="How many get {partName(part, i)}" value={String(part.count)} onchange={(e) => (part.count = e.currentTarget.value === 'rest' ? 'rest' : Number(e.currentTarget.value))}>
              {#each COUNTS as n (n)}<option value={String(n)}>{countText(n)}</option>{/each}
              <option value="rest">{countText('rest')}</option>
            </select>
            <button class="ghost tiny" aria-label="Take {partName(part, i)} out of this deal" onclick={() => removePart(part)} disabled={work.parts.length < 2}>✕</button>
          </div>
          <div class="row">
            {#if dual}
              <!-- (Two windows: viewers don't see this one.) -->
              <input class="small grow" value={slideText(part.card)} placeholder="What its card says" aria-label="{partName(part, i)}’s card words" oninput={(e) => setSlideText(part.card, e.currentTarget.value)} />
            {:else}
              <span class="muted small grow">Card: {cardSummary(game, part.card)}</span>
            {/if}
            <select class="small" aria-label="{partName(part, i)}’s card draws from the wheel" value={part.draw ?? ''} onchange={(e) => {
              const v = e.currentTarget.value;
              if (v === 'own' || v === 'shared') part.draw = v;
              else delete part.draw;
            }}>
              <option value="">no wheel</option>
              <option value="shared">+ the slice they all share</option>
              <option value="own">+ a slice each</option>
            </select>
          </div>
          {#if dual}
            <details class="small">
              <summary>Choose who gets it {(dealDraft.picks[part.id] ?? []).length ? `(${dealDraft.picks[part.id].map(who).join(', ')})` : '(else at random)'}</summary>
              <div class="row wrap">
                {#each pool as t (toKey(t))}
                  {@const p = session.players.find((x) => x.id === t.seat)}
                  {@const on = pickedFor(part, t)}
                  <button class="chip" style:border-color={p?.color} style:background={on ? p?.color : undefined} style:color={on ? textOn(p?.color ?? '#888') : undefined} aria-pressed={on} aria-label="{who(t)} gets {partName(part, i)}" onclick={() => togglePick(part, t)}>{who(t)}{#if on}&nbsp;✓{/if}</button>
                {/each}
              </div>
            </details>
          {/if}
        </div>
      {/each}
      {#if work.parts.length < DEAL_PARTS_MAX}<button class="ghost small" onclick={addPart}>＋ Part</button>{/if}
      {#if draws}
        <label class="small row">🎡 Wheel
          <select class="small grow" aria-label="The wheel its cards draw from" value={wheelValue} onchange={(e) => chooseWheel(e.currentTarget.value)}>
            <option value="">Choose a wheel…</option>
            {#if game.wheels.length}
              <optgroup label="Saved with the game">
                {#each game.wheels as w (w.id)}<option value={w.id}>{w.name}</option>{/each}
              </optgroup>
            {/if}
            <optgroup label="Ready-made">
              {#each WHEEL_TEMPLATES as t (t.key)}<option value="tpl:{t.key}">{t.icon} {t.name}</option>{/each}
            </optgroup>
          </select>
        </label>
      {/if}
      {#if work.perTeam && !perTeam}
        <div class="muted small">{teams ? 'Dealt to each team’s people once their phones are in the buzzer room: until then, to the teams.' : 'Not a teams game: dealt to the players.'}</div>
      {/if}
      {#if perTeam}<div class="muted small">Dealt within each team: each number is for each team.</div>{/if}
      <div class="head">Dealt in</div>
      <div class="row wrap">
        {#each everyone as t (toKey(t))}
          {@const p = session.players.find((x) => x.id === t.seat)}
          {@const on = !dealDraft.skip.includes(toKey(t))}
          <button class="chip" style:border-color={p?.color} style:background={on ? p?.color : undefined} style:color={on ? textOn(p?.color ?? '#888') : undefined} aria-pressed={on} aria-label="Deal {who(t)} in" onclick={() => toggleIn(t)}>{who(t)}{#if on}&nbsp;✓{/if}</button>
        {:else}
          <span class="muted small">{perTeam ? 'Nobody’s phone is on a team yet.' : 'No players.'}</span>
        {/each}
      </div>
      {#if !dual}
        <div class="muted small">Choosing who gets a part is offered with the audience window open (viewers see this one).</div>
      {/if}
      <!-- (Held at the menu's foot while the parts scroll: the way on is always in view.) -->
      <div class="actions">
        {#if problem}<div class="small warn" data-deal-problem>{problem}</div>{/if}
        <div class="row wrap">
          <button class="primary small" onclick={deal} disabled={!!problem} title={problem || 'Deals the parts: nothing goes to anyone until you send them'}>🎭 Deal</button>
          {#if d}<button class="ghost small" onclick={() => (fresh = false)}>Back to “{d.name}”</button>{/if}
        </div>
      </div>
    {/if}
  {:else if d}
    <div class="head">🎭 {d.name}</div>
    <div class="small" data-deal-counts>Dealt to {dealtList.length}: {dealCounts(d)}</div>
    <div class="muted small">{dual ? 'Who got which part is in the column beside the stage (viewers don’t see it).' : 'Who got which part is never shown here: viewers see this window.'}</div>
    {#if d.stage === 'dealt'}
      <div class="small">Not sent yet: nobody has their card.</div>
      {#if roundOn}
        <div class="row wrap" role="radiogroup" aria-label="How long the cards last">
          <span class="muted small">Lasts</span>
          <label class="check small"><input type="radio" name="deal-lasts-{uid}" value="round" bind:group={lasts} /> until the round ends</label>
          <label class="check small"><input type="radio" name="deal-lasts-{uid}" value="host" bind:group={lasts} /> until I take them back</label>
        </div>
      {/if}
      {#if left}<div class="small warn">{left}</div>{/if}
      {#if tooMany}<div class="small warn">The phones hold {CARDS_MAX} cards at once, all phones together: this deal has {d.hands.length}, one each. Deal fewer in.</div>{/if}
      {#if full}<div class="small warn" data-cards-full>{fullText}</div>{/if}
      <div class="actions">
        <div class="row wrap">
          <button class="primary small" onclick={send} disabled={tooMany || full} title={cardsOn ? 'Each player’s card goes to their phone now, a card of its own' : 'Hands them out: then copy each card to its player (📋), or show it in the 🪟 card window'} data-deal-send>{cardsOn ? '📤 Send' : '✔ Hand them out'}</button>
          {#if dealDraft.dealt === d.id}
            <button class="small" onclick={deal} disabled={!!problem || !work} title="Deals it again, the same way (nothing was sent)">↻ Deal again</button>
          {/if}
          <button class="ghost small" onclick={() => (fresh = true)}>✎ Change it</button>
          <button class="ghost small" onclick={putAway}>✖ Put it away</button>
        </div>
      </div>
    {:else}
      {#if status}<div class="small" role="status" data-deal-status>{status}</div>{/if}
      {#if left && out.length}<div class="small warn">{left}</div>{/if}
      <div class="row wrap">
        {#if out.length}
          {#if cardsOn && !over}<button class="small" onclick={again} title="Every card of the deal goes again under a new id: a phone that came late (a player on a new phone) gets theirs">↻ Send again</button>{/if}
          <button class="ghost small" onclick={takeBack} title="Takes every card of the deal off the phones (the deal stays, for Who was who)">✖ Take back</button>
        {:else}
          <button class="small" onclick={send} disabled={tooMany || full} title={tooMany ? `The phones hold ${CARDS_MAX} cards at once, all phones together: this deal has ${d.hands.length}, one each` : full ? fullText : 'The same cards go out again'}>📤 Send</button>
        {/if}
        {#if d.shown}
          <button class="small" onclick={() => reveal(false)} data-deal-hide>🙈 Hide Who was who</button>
        {:else}
          <button class="small" onclick={() => reveal(true)} title="Puts everyone’s part on screen, for viewers too (Ctrl+Z takes it off)" data-deal-reveal>🎭 Who was who</button>
        {/if}
        <button class="ghost small" onclick={() => (fresh = true)}>🎭 Deal a new one</button>
        <button class="ghost small" onclick={putAway}>✖ Put it away</button>
      </div>
      {#if out.length && (!cardsOn || dual || over || noPhone.length)}
        <!-- Each player dealt in, to copy their card (a DM) or show it in the 🪟 card window: by name only, the same
             buttons for everyone, those with no part included (listing only the others would say who got one). In one
             window with the phones getting the cards, only those with no phone here (picked out by phone, never by
             part), or everyone when some cards never reach the phones; it says nothing of anyone's (seen or not). -->
        <div class="hands">
          {#each cardsOn && !dual && !over ? noPhone : dealtList as to (toKey(to))}
            {@const nophone = cardsOn && !to.member && !phones.has(to.seat)}
            <div class="row small">
              <span class="grow">{who(to)}{#if nophone}{' '}· 📵 no phone here{:else if cardsOn && dual && seenBy(to.seat, to.member?.id)}{' '}· ✓ seen{/if}{#if dual && leftOffFor(to)}{' '}· not on their phone{/if}</span>
              <button class="ghost tiny" onclick={() => copyHand(to)} aria-label="Copy {who(to)}’s card" title="Copies “For … only” with their card, to paste in a DM (nothing of it shows here)">📋 Copy</button>
              {#if (!cardsOn || nophone) && !to.member}<button class="ghost tiny" onclick={() => openWin(to.seat)} aria-label="Show {who(to)}’s card in the card window" title="Opens a window with only their cards, to share with them alone">🪟</button>{/if}
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .deal {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .head {
    font-size: 12px;
    font-weight: 700;
    opacity: 0.8;
  }
  .part {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px;
    border-radius: 6px;
    background: var(--panel-2);
  }
  .wrap {
    flex-wrap: wrap;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .pname {
    flex: 1;
    min-width: 0;
  }
  .chip {
    border-width: 2px;
    padding: 2px 8px;
    font-size: 12px;
  }
  .hands {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .tiny {
    font-size: 12px;
    padding: 0 4px;
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
  /* The menu's foot (ToolLauncher's .menu: 10px of padding, and it scrolls), over the parts scrolling under it. */
  .actions {
    position: sticky;
    bottom: -10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0 -10px -10px;
    padding: 6px 10px 10px;
    background: var(--panel);
    border-top: 1px solid var(--border);
    z-index: 1;
  }
</style>
