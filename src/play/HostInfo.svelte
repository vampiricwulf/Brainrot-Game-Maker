<!-- Host-only view of what's going on, including the answer before it's revealed (dual-window mode). -->
<script lang="ts">
  import { categoryLabel, finalName, formatPoints, questionSlides, slideText, type Game, type Session } from '../lib/model';
  import { clueSlideIndex, coWinnersHold, currentClueInfo, currentFinal, nameList, ownPlayers, places, playerName, slidesRound, tiedLeaders, toolOnlyClue } from '../lib/session';
  import { cardId, cardSends, cardSlides, partnerRules, recipientsText, sameAsAnswer, sendState, sentTo, toName } from '../lib/partner';
  import { cardWords, phoneCard, type CardItem, type PhoneItem } from '../lib/phonecard';
  import { buzzerOn, remote, roomHasCards } from '../lib/remote.svelte';
  import { phoneCan, uploads } from '../lib/cardfiles.svelte';
  import { mediaUrls } from '../lib/media.svelte';
  import { findIn, focusRef } from '../lib/rpg';
  import { currentPlayer, spaceById } from '../lib/boardgame';
  import { rpgNow } from './rpg/hostops';
  import { boardNow, busyZones } from './boardgame/bgops';
  import { app } from '../lib/app.svelte';
  import { tileToolUp } from '../lib/live';

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
  /** How an item reaches a phone, in a few words ("✔ goes to phones", "📋 copy it: too big for phones"). */
  function reach(it: PhoneItem): string {
    if (!phones) return '📋 you copy it';
    if (it.why === 'big') return '📋 copy it: too big for phones';
    if (it.why === 'expired') return '📋 copy it: its link has expired';
    if (it.why === 'kind') return '📋 copy it: phones can’t show it';
    if (it.why === 'nofiles') return '📋 copy it: this buzzer server isn’t taking files right now';
    if (it.why === 'failed') return `📋 copy it: ${uploads.jobs[it.media ?? '']?.error || 'it didn’t go up'}`;
    if (it.why === 'lost') return '📋 it isn’t in the game any more';
    if (it.why === 'many') return '📋 copy it: a card shows 6 at most';
    if (it.file) return 'file' in it.goes ? '✔ goes to phones (up)' : uploads.jobs[it.media ?? '']?.state === 'uploading' ? '✔ goes to phones (uploading…)' : '✔ goes to phones (from this computer)';
    return '✔ goes to phones (its link)';
  }
  /** A still of a picture or GIF, for the host's eyes (never a player: a card's video here could be taken for the stage's). */
  const thumb = (it: PhoneItem): string | undefined => (it.kind === 'picture' || it.kind === 'gif' ? (it.media && mediaUrls[it.media]) || it.url : undefined);
  /** How a card stands on the phones: "sent · ✓ seen". */
  function cardOut(card: ReturnType<typeof cardSlides>[number]): string {
    if (!pt || !phones) return '';
    const st = sendState(session, pt, card);
    if (st === 'unsent') return '';
    if (st === 'edited') return ' · changed in the editor since it was sent (off the phones)';
    const seen = session.remote?.cardsSeen ?? {};
    const any = cardSends(pt, card.id).some((x) => (seen[cardId(pt.clue, x)] ?? []).length);
    return ` · sent to ${sentTo(session, pt, card.id).map((t) => toName(session, t)).join(', ')}${st === 'changed' ? ' (changed since)' : ''}${any ? ' · ✓ seen' : ''}`;
  }
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

<div class="info">
  {#if ask}
    <div class="label">Pop-up question{ask.value ? ` · worth ${formatPoints(ask.value, sym)}` : ''}</div>
    <div class="q">{slideText(ask.q) || '—'}</div>
    <div class="label">Answer {ask.revealed ? '(on screen)' : '(hidden from viewers)'}</div>
    <div class="a">{slideText(ask.a) || '—'}</div>
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
    {#if info.clue.hostNotes}
      <div class="label">Notes</div>
      <div class="notes">{info.clue.hostNotes}</div>
    {/if}
    {#if pt && cardSlides(info.clue).length}
      {@const rules = partnerRules(info.clue)}
      <div class="group" data-partner-cards-info>
        <div class="label">🤫 Cards {phones ? '(only the phones you send them to get them)' : '(you copy them to their players)'}</div>
        {#each cardSlides(info.clue) as card, i (card.id)}
          <div class="q"><b>Card {i + 1}</b> → {recipientsText(session, pt, rules, card)}{cardOut(card)}</div>
          {#if sameAsAnswer(info.clue, card)}<div class="muted small">This card shows the answer</div>{/if}
          <div class="notes">{cardWords(card) || '(no words)'}</div>
          <!-- Its items as a phone gets them (phoneCard), each with whether it reaches one; pictures as a small still. -->
          {#each phoneCard(game, card, phoneCan(session)).items as it (it.el)}
            {@const src = thumb(it)}
            <div class="small item">
              {#if src}<img class="thumb" {src} alt="" referrerpolicy="no-referrer" />{/if}
              <span>{ITEM[it.kind][0]} {it.name} · {ITEM[it.kind][1]} · <span class:muted={!it.why}>{reach(it)}</span></span>
            </div>
          {/each}
        {/each}
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
    {#if finalRound.hostNotes}
      <div class="label">Notes</div>
      <div class="notes">{finalRound.hostNotes}</div>
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
