<!-- Host-only view of what's going on, including the answer before it's revealed (dual-window mode). Its words select, to
     copy into chat: this column is never on stream. -->
<script lang="ts">
  import { categoryLabel, clueCardName, finalName, formatPoints, questionSlides, slideText, type ClueCard, type Game, type Id, type Session } from '../lib/model';
  import { clueSlideIndex, coWinnersHold, currentClueInfo, currentFinal, nameList, ownPlayers, places, playerName, slidesRound, tiedLeaders, toolOnlyClue } from '../lib/session';
  import { cardId, cardSends, cardSlides, finalGoesToLabel, partnerRules, recipientsText, sameAsAnswer, sendState, sentTo, tileGoesToLabel, toName } from '../lib/partner';
  import { cardsOut, sentCardId, sentState, sentToText } from '../lib/sentcards';
  import { cardWords, phoneCard, sendsOf, type CardItem, type PhoneItem } from '../lib/phonecard';
  import { buzzerOn, remote, roomHasCards } from '../lib/remote.svelte';
  import { phoneCan, uploads } from '../lib/cardfiles.svelte';
  import { formatBytes, mediaUrls } from '../lib/media.svelte';
  import { mbText } from '../lib/buzzproto';
  import { findIn, focusRef } from '../lib/rpg';
  import { currentPlayer, spaceById } from '../lib/boardgame';
  import { rpgNow } from './rpg/hostops';
  import { boardNow, busyZones } from './boardgame/bgops';
  import { app } from '../lib/app.svelte';
  import { tileToolUp } from '../lib/live';
  import { dealHeld, dealOut } from '../lib/deals';
  import { toKey } from '../lib/partner';
  import ShrinkButton from './host/ShrinkButton.svelte';
  import { letter, usableChoices } from '../lib/choices';

  let { game, session }: { game: Game; session: Session } = $props();
  const info = $derived(currentClueInfo(session, game));
  const finalRound = $derived(currentFinal(session, game));
  const sym = $derived(game.settings.currencySymbol);
  const picker = $derived(session.players.find((p) => p.id === session.currentPickerId));
  const ties = $derived(session.phase === 'end' && !coWinnersHold(session) ? tiedLeaders(session) : []);
  // RPG and board-game rounds: where the party is, whose turn it is, and the notes that go with them.
  const rpg = $derived(rpgNow(game, session));
  const here = $derived(rpg.world && rpg.st ? findIn(rpg.world, focusRef(rpg.st) ?? { map: '', screen: '' }) : null);
  const board = $derived(boardNow(game, session));
  const landed = $derived(board.round && board.bs?.last?.landed ? spaceById(board.round, board.bs.last.landed) : undefined);
  /** A question pop-up on screen (an RPG object's or a wheel slice's): its answer, for the host's eyes only. */
  // A 🤝 partner clue: who plays it, and its 🤫 cards as text (this window isn't on stream: the host checks what each
  // player gets). Never a slide or a player: a card's video here could be taken for the stage's (mediactl's one map).
  const pt = $derived(session.phase === 'clue' && info ? session.partner : null);
  const ptName = (id?: string) => (id ? (session.players.find((p) => p.id === id)?.name ?? '?') : '');
  const ITEM: Record<CardItem['kind'], [string, string]> = { picture: ['🖼', 'picture'], gif: ['🖼', 'GIF'], video: ['🎞', 'video'], sound: ['🔊', 'sound'], embed: ['🌐', 'online video'] };
  /** The cards go to phones (a buzzer room that takes them), not only by 📋 copying. */
  const phones = $derived(buzzerOn(game.settings) && !!remote.code && remote.status !== 'off' && remote.status !== 'error' && roomHasCards());
  /** What the phones can get now (its server's biggest file too). */
  const can = $derived(phoneCan(session));
  /**
   * How an item reaches a phone, in a few words ("✔ goes to phones", "📋 copy it: too big for the buzzer server (16 MB at
   * most)"), and a big one that goes, how big (phones on mobile data may wait for it).
   */
  function reach(it: PhoneItem): string {
    if (!phones) return '📋 you copy it';
    const goes = reachOf(it);
    return it.slow ? `${goes} · big (${formatBytes(game.media.find((m) => m.id === sendsOf(it))?.size ?? 0)}): phones on mobile data may wait for it` : goes;
  }
  /** Whether it goes, and how (reach() adds how big). */
  function reachOf(it: PhoneItem): string {
    if (it.why === 'big') return `📋 copy it: too big for the buzzer server (${mbText(can.fileBytes)} at most)`;
    if (it.why === 'expired') return '📋 copy it: its link has expired';
    if (it.why === 'kind') return '📋 copy it: phones can’t show it';
    if (it.why === 'nofiles') return '📋 copy it: this buzzer server isn’t taking files right now';
    if (it.why === 'failed' || it.why === 'full') return `📋 copy it: ${uploads.jobs[sendsOf(it) ?? '']?.error || 'it didn’t go up'}`;
    if (it.why === 'lost') return '📋 it isn’t in the game any more';
    if (it.why === 'many') return '📋 copy it: a card shows 6 at most';
    const job = uploads.jobs[sendsOf(it) ?? ''];
    const pct = job?.progress === undefined ? '' : ` ${Math.floor(job.progress * 100)}%`;
    if (it.file) return 'file' in it.goes ? '✔ goes to phones (up)' : job?.state === 'uploading' ? `✔ goes to phones (uploading…${pct})` : '✔ goes to phones (from this computer)';
    return '✔ goes to phones (its link)';
  }
  /** A still of a picture or GIF, for the host's eyes (never a player: a card's video here could be taken for the stage's). */
  const thumb = (it: PhoneItem): string | undefined => (it.kind === 'picture' || it.kind === 'gif' ? (it.media && mediaUrls[it.media]) || it.url : undefined);
  /** How a card stands on the phones: "sent · ✓ seen". */
  function cardOut(card: ClueCard): string {
    if (!pt || !phones) return '';
    const st = sendState(session, pt, card);
    if (st === 'unsent') return '';
    if (st === 'edited') return ' · changed in the editor since it was sent (off the phones)';
    const seen = session.remote?.cardsSeen ?? {};
    const any = cardSends(pt, card.id).some((x) => (seen[cardId(pt.clue, x)] ?? []).length);
    return ` · sent to ${sentTo(session, pt, card.id).map((t) => toName(session, t)).join(', ')}${st === 'changed' ? ' (changed since)' : ''}${any ? ' · ✓ seen' : ''}`;
  }
  /**
   * Any other tile's card (🤫 Just you, 💡 Insider tip) or a Final's (`holder`: the clue's or the Final round's id): who
   * it went to from the panel (or 🤫 Send a card…), else who it starts with there (`starts`).
   */
  function heldOut(holder: Id, card: ClueCard, starts: string): string {
    const c = [...cardsOut(game, session)].reverse().find((x) => 'clue' in x.content && x.content.clue === holder && x.content.card === card.id);
    if (!c) return `${starts} (when you send it)`;
    // (No phone gets cards: it went to the 🪟 card window.)
    if (!phones) return `${sentToText(session, c.to)} · shown in the 🪟 card window as ${c.label}`;
    if (sentState(game, c) === 'edited') return `${sentToText(session, c.to)} · changed in the editor since it was sent (off the phones)`;
    return `${sentToText(session, c.to)} · sent as ${c.label}${(session.remote?.cardsSeen?.[sentCardId(c)] ?? []).length ? ' · ✓ seen' : ''}`;
  }
  /**
   * 🎭 The deal on the table: who got which part (and the slice they drew). Only here, in the host's own column with the
   * audience window open: the panel, which is on stream in one window, only counts the parts.
   */
  const deal = $derived(session.deal ?? null);
  const dealCards = $derived(deal ? dealOut(game, session) : []);
  /** (Out while any is held, one for a player taken out too.) */
  const dealKept = $derived(deal ? dealHeld(game, session) : []);
  function dealWhere(): string {
    if (!deal) return '';
    if (deal.stage === 'dealt') return 'dealt, not sent yet';
    if (!dealKept.length) return deal.round ? 'its cards went when that round ended' : 'its cards are taken back';
    return phones ? 'on their phones' : 'dealt: you copy each card';
  }
  /** That player's phone showed their card. */
  const handSeen = (to: { seat: string; member?: { id: string } }) =>
    dealCards.some((c) => c.to.some((t) => t.seat === to.seat && t.member?.id === to.member?.id) && (session.remote?.cardsSeen?.[sentCardId(c)] ?? []).includes(to.member ? `${to.seat}/${to.member.id}` : to.seat));
  const ask = $derived.by(() => {
    const o = app.live.overlay;
    return o?.kind === 'popup' && o.answer ? { q: o.slide, a: o.answer, revealed: !!o.revealed, value: o.value } : null;
  });
</script>

{#snippet hostNote(label: string, text: string | undefined)}
  {#if text}
    <div class="label">{label}</div>
    <div class="notes">{text}</div>
  {/if}
{/snippet}

<!-- A tile's or a Final's 🤫 cards: who each goes to (`out`), its words and its items as a phone gets them (one that's big
     for phones, or too big for the buzzer server, with 🗜 Make smaller). -->
{#snippet cardsInfo(cards: ClueCard[], out: (c: ClueCard) => string, isAnswer: (c: ClueCard) => boolean)}
  {#each cards as card, i (card.id)}
    <div class="q"><b>{clueCardName(card, i)}</b> → {out(card)}</div>
    {#if isAnswer(card)}<div class="muted small">This card shows the answer</div>{/if}
    <div class="notes">{cardWords(card) || '(no words)'}</div>
    <!-- Its items as a phone gets them (phoneCard), each with whether it reaches one; pictures as a small still. -->
    {#each phoneCard(game, card, can).items as it (it.el)}
      {@const src = thumb(it)}
      <div class="small item">
        {#if src}<img class="thumb" {src} alt="" referrerpolicy="no-referrer" draggable="false" />{/if}
        <span
          >{ITEM[it.kind][0]} {it.name} · {ITEM[it.kind][1]} · <span class:muted={!it.why}>{reach(it)}</span
          >{#if phones}<ShrinkButton {game} items={[it]} which={it.slow ? 'slow' : 'big'} title="Make a smaller copy of this file for phones" />{/if}</span
        >
      </div>
    {/each}
  {/each}
{/snippet}

{#snippet standingsList()}
  <div class="group">
    <div class="label">Standings</div>
    <ol>
      <!-- Equal scores share a place, as on stream. -->
      {#each places(session) as { player, score, place } (player.id)}
        <li value={place}><span class="dot" style:background={player.color}></span>{player.name} <b>{formatPoints(score, sym)}</b></li>
      {/each}
    </ol>
  </div>
{/snippet}

<div class="info selectable">
  {#if ask}
    <div class="label">Pop-up question{ask.value ? ` · worth ${formatPoints(ask.value, sym)}` : ''}</div>
    <div class="q">{slideText(ask.q) || '—'}</div>
    <div class="label">Answer {ask.revealed ? '(on screen)' : '(hidden from viewers)'}</div>
    <div class="a">{slideText(ask.a) || '—'}</div>
  {/if}
  {#if deal}
    <div class="group" data-deal-info>
      <div class="label">🎭 {deal.name} · {dealWhere()}{deal.shown ? ' · Who was who on screen' : ''}</div>
      <!-- (A player taken out keeps their part in the deal, for a restore: not listed while they're out.) -->
      {#each deal.hands.filter((x) => session.players.some((p) => p.id === x.to.seat)) as h (toKey(h.to))}
        <div class="small"><b>{h.to.member ? `${h.to.member.name} (${ptName(h.to.seat)})` : ptName(h.to.seat)}</b> → {h.part}{h.slice ? ` · ${h.slice}` : ''}{phones && handSeen(h.to) ? ' · ✓ seen' : ''}</div>
      {/each}
    </div>
  {/if}
  {#if session.phase === 'clue' && info}
    <div class="meta">
      <span class="cat">{categoryLabel(info.category)}</span>
      <span class="val">{formatPoints(info.value, sym)}</span>
    </div>
    {#if session.dd}
      <div class="dd">
        ⭐ Daily Double{session.dd.stage === 'question'
          ? ` · ${session.players.find((p) => p.id === session.dd?.playerId)?.name ?? ''} wagered ${formatPoints(session.dd.wager ?? 0, sym)}`
          : ' · waiting for the wager'}
      </div>
    {/if}
    {#if pt}
      <div class="dd partner" data-partner-info>
        🤝 Partner clue{pt.pickerId ? ` · ${ptName(pt.pickerId)}` : ''}{pt.partnerId
          ? pt.partnerId === pt.pickerId
            ? pt.member
              ? ` · ${pt.member.name} describes to the rest of the team`
              : ' · Solo'
            : ` + ${ptName(pt.partnerId)}`
          : pt.pickerId
            ? ' · choosing a partner'
            : ''}
      </div>
    {/if}
    <!-- A clue with several question slides: the one on screen, and the next one coming. -->
    {@const slides = questionSlides(info.clue)}
    {@const at = clueSlideIndex(session, info.clue)}
    <!-- (A wheel or dice tile's question comes up once its tool closes. One with nothing to ask is just its tool: no word.) -->
    <div class="label">
      Question{slides.length > 1 ? ` · slide ${at + 1} of ${slides.length}` : ''}
      {session.revealed || toolOnlyClue(info.clue)
        ? ''
        : ownPlayers(session)?.setup
          ? '(not shown yet)'
          : tileToolUp(app.live, info.clue)
            ? `(after the ${info.clue.type === 'dice' ? 'dice' : 'wheel'})`
            : '(on screen)'}
    </div>
    <div class="q">{slideText(slides[at]) || '—'}</div>
    {#if !session.revealed && slides[at + 1]}
      <div class="label">Next slide</div>
      <div class="notes">{slideText(slides[at + 1]) || '—'}</div>
    {/if}
    <div class="label">Answer {session.revealed ? '(on screen)' : '(hidden from viewers)'}</div>
    <div class="a">{slideText(info.clue.answerSlide) || '—'}</div>
    {#if info.clue.everyone && info.clue.type === 'standard' && usableChoices(info.clue.choices).length}
      <!-- (Lettered as the phones letter them: those with words only.) -->
      <div class="notes" data-choices-info>
        Choices: {usableChoices(info.clue.choices)
          .map((c, i) => `${letter(i)} ${c.text}${c.right ? ' ✔' : ''}`)
          .join(' · ')}
      </div>
    {/if}
    {#if info.clue.hostNotes}
      <div class="label">Notes</div>
      <div class="notes">{info.clue.hostNotes}</div>
    {/if}
    {#if cardSlides(info.clue).length}
      {@const clue = info.clue}
      {@const rules = partnerRules(clue)}
      <div class="group" data-partner-cards-info>
        <div class="label">🤫 Cards {phones ? '(only the phones you send them to get them)' : '(you copy them to their players)'}</div>
        {@render cardsInfo(
          cardSlides(clue),
          (c) => (pt ? `${recipientsText(session, pt, rules, c)}${cardOut(c)}` : heldOut(clue.id, c, tileGoesToLabel(clue.type, c.to, false))),
          (c) => sameAsAnswer(clue, c),
        )}
      </div>
    {/if}
  {:else if session.phase === 'final' && finalRound}
    <div class="meta"><span class="cat">{finalName(finalRound)}{finalRound.category ? ` · ${finalRound.category}` : ''}</span></div>
    {@const slides = questionSlides(finalRound)}
    {@const at = clueSlideIndex(session, finalRound)}
    <div class="label">Question{slides.length > 1 && session.finalStep === 'question' ? ` · slide ${at + 1} of ${slides.length}` : ''}</div>
    <div class="q">{slideText(session.finalStep === 'question' ? slides[at] : slides[0]) || '—'}</div>
    {#if session.finalStep === 'question' && slides[at + 1]}
      <div class="label">Next slide</div>
      <div class="notes">{slideText(slides[at + 1]) || '—'}</div>
    {:else if session.finalStep !== 'question' && slides.length > 1}
      {#each slides.slice(1) as s, i (i)}
        <div class="label">Question slide {i + 2}</div>
        <div class="notes">{slideText(s) || '—'}</div>
      {/each}
    {/if}
    <div class="label">Answer</div>
    <div class="a">{slideText(finalRound.answerSlide) || '—'}</div>
    {#if !finalRound.phoneAnswersOff && usableChoices(finalRound.choices).length}
      <!-- (Lettered as the phones letter them: those with words only.) -->
      <div class="notes" data-choices-info>
        Choices: {usableChoices(finalRound.choices)
          .map((c, i) => `${letter(i)} ${c.text}${c.right ? ' ✔' : ''}`)
          .join(' · ')}
      </div>
    {/if}
    {#if finalRound.hostNotes}
      <div class="label">Notes</div>
      <div class="notes">{finalRound.hostNotes}</div>
    {/if}
    {#if cardSlides(finalRound).length}
      {@const fr = finalRound}
      <div class="group" data-final-cards-info>
        <div class="label">🤫 This Final’s cards {phones ? '(only the phones you send them to get them)' : '(you copy them to their players)'}</div>
        {@render cardsInfo(
          cardSlides(fr),
          (c) => heldOut(fr.id, c, finalGoesToLabel(c.to, false)),
          (c) => sameAsAnswer(fr, c),
        )}
      </div>
    {/if}
    {#if session.final}
      <!-- While wagers are taken, in the players' own order (as the wager boxes); then in the reveal order. -->
      {@const taking = (session.finalStep ?? 'wagers') === 'wagers'}
      {@const fp = session.final.players}
      <!-- The heading and its list together (in columns, the heading never ends a column alone). -->
      <div class="group">
        <div class="label">Wagers</div>
        <ol>
          {#each taking ? session.players.map((x) => x.id).filter((x) => fp.includes(x)) : session.final.order as id (id)}
            {@const p = session.players.find((x) => x.id === id)}
            <li>
              <span class="dot" style:background={p?.color}></span>{p?.name}
              <b>{session.final.wagers[id] !== undefined ? formatPoints(session.final.wagers[id], sym) : taking ? 'waiting…' : '—'}</b>{#if session.final.wagerFrom?.[id] === 'phone'}<span title="Sent from their phone"> 📱</span>{/if}
              {session.final.results[id] === 'right' ? '✔' : session.final.results[id] === 'wrong' ? '✘' : ''}
            </li>
          {/each}
        </ol>
      </div>
    {/if}
  {:else if session.phase === 'tiebreaker' && game.tiebreaker}
    <div class="meta"><span class="cat">Tiebreaker</span></div>
    {@const slides = questionSlides(game.tiebreaker)}
    {@const at = clueSlideIndex(session, game.tiebreaker)}
    <div class="label">Question{slides.length > 1 ? ` · slide ${at + 1} of ${slides.length}` : ''}</div>
    <div class="q">{slideText(slides[at]) || '—'}</div>
    {#if !session.tiebreakerRevealed && slides[at + 1]}
      <div class="label">Next slide</div>
      <div class="notes">{slideText(slides[at + 1]) || '—'}</div>
    {/if}
    <div class="label">Answer</div>
    <div class="a">{slideText(game.tiebreaker.answerSlide) || '—'}</div>
    {@render hostNote('Notes', game.tiebreaker.hostNotes?.trim() ? game.tiebreaker.hostNotes : undefined)}
  {:else if session.phase === 'rpg' && rpg.round}
    <div class="meta"><span class="cat">{rpg.round.name}</span></div>
    {#if here && rpg.st}
      <div class="label">On screen</div>
      <div class="q">🗺 {here.map.name} · {here.screen.name}</div>
      {@render hostNote('Screen notes', here.screen.hostNotes)}
      {#if rpg.st.parties.length > 1}
        <div class="label">Parties</div>
        <ul>
          {#each rpg.st.parties as pt (pt.id)}<li>{pt.name}: {nameList(pt.members.map((m) => playerName(session, m)))}</li>{/each}
        </ul>
      {/if}
    {/if}
    {@render hostNote('Round notes', rpg.round.hostNotes)}
    {@render standingsList()}
  {:else if session.phase === 'boardgame' && board.round && board.bs}
    {@const turn = currentPlayer(board.bs)}
    <div class="meta"><span class="cat">{board.round.name}</span></div>
    <div class="label">Turn</div>
    <div class="q">🎲 {turn ? playerName(session, turn) : 'Nobody'}</div>
    {#if landed}{@render hostNote(`Landed on ${landed.name}`, landed.hostNotes)}{/if}
    {#each busyZones(board.round, board.bs) as z (z.id)}{@render hostNote(`🌀 ${z.name}`, z.hostNotes)}{/each}
    {@render hostNote('Round notes', board.round.hostNotes)}
    {@render standingsList()}
  {:else}
    {#if session.phase === 'end'}
      <div class="meta"><span class="cat">Game over</span></div>
      {#if ties.length}
        <div class="label">Tie for first</div>
        <div class="q">{nameList(ties.map((p) => p.name))}: settle it in the panel below</div>
      {/if}
    {:else}
      <div class="meta"><span class="cat">{game.rounds[session.currentRound]?.name ?? ''}</span></div>
      {#if session.phase === 'board'}
        <div class="label">Picking next</div>
        <div class="q">{picker ? picker.name : 'Nobody set (press P then a number, or click a name plate)'}</div>
      {:else if session.phase === 'slides'}
        {@const sr = slidesRound(session, game)}
        {#if sr}
          {@const all = questionSlides(sr)}
          {@const at = clueSlideIndex(session, sr)}
          <div class="label">On screen{all.length > 1 ? `: slide ${at + 1} of ${all.length}` : ''}</div>
          <div class="q">{slideText(all[at]) || '(no text)'}</div>
          {#if all[at + 1]}<div class="label">Next slide</div><div class="q muted">{slideText(all[at + 1]) || '(no text)'}</div>{/if}
          {@render hostNote('Notes', sr.hostNotes?.trim() ? sr.hostNotes : undefined)}
        {/if}
      {/if}
    {/if}
    {@render standingsList()}
  {/if}
</div>

<style>
  .info {
    height: 100%;
    overflow-y: auto;
    padding: 12px 14px;
    background: var(--panel);
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .meta {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-weight: 700;
    margin-bottom: 6px;
  }
  .val {
    color: var(--value);
  }
  .dd {
    background: #7a00ff;
    color: #fff;
    border-radius: 6px;
    padding: 4px 8px;
    font-weight: 600;
  }
  .dd.partner {
    background: #1f8a57;
  }
  .small {
    font-size: 12px;
  }
  .label {
    margin-top: 8px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
  }
  .q {
    font-size: 15px;
  }
  .a {
    font-size: 18px;
    font-weight: 700;
    color: var(--good);
  }
  .notes {
    background: var(--panel-2);
    padding: 6px 8px;
    border-radius: 6px;
    white-space: pre-wrap;
  }
  ol,
  ul {
    margin: 0;
    padding-left: 20px;
  }
  li {
    margin: 2px 0;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .thumb {
    width: 48px;
    height: 32px;
    object-fit: cover;
    border-radius: 3px;
    flex-shrink: 0;
  }
  .dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    margin-right: 6px;
  }
</style>
