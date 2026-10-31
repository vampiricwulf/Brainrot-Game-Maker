<!--
  Optional score effect of a wheel/dice outcome: pick who it applies to, preview, then confirm or skip. Who it's for is
  the game screen's (app.live: see overlay.ts scoreDraft), so the check before going on can give it the same way.
-->
<script lang="ts">
  import { app } from '../../lib/app.svelte';
  import { textOn } from '../../lib/colors';
  import { formatPoints, type Game, type Id, type Session } from '../../lib/model';
  import { applyScoreCard, draftDeltas, draftPick, scoreDraft, type ScoreCard } from '../../lib/overlay';
  import { describeAction, needsSource } from '../../lib/tools';

  let {
    card,
    game,
    session,
    tile,
  }: {
    card: ScoreCard;
    game: Game;
    session: Session;
    /** A wheel or dice tile's own tool: the points go down as that tile's. */
    tile?: Id;
  } = $props();

  const action = $derived(card.action);
  const sym = $derived(game.settings.currencySymbol);
  const draft = $derived(scoreDraft(app.live, session, card));
  const targets = $derived(draft.targets);
  const source = $derived(draft.source);
  const now = $derived(draftDeltas(app.live, session, card));
  const byId = $derived(Object.fromEntries(session.players.map((p) => [p.id, p])));
</script>

<!-- (In sight as it comes, its confirm too: in one window the host panel can keep one height, and it scrolls.) -->
<div class="ac" data-score-card={card.key} {@attach (el) => el.scrollIntoView({ block: 'nearest' })}>
  <div><b>Score effect:</b> {describeAction(action, sym)} <span class="muted small">(only if you confirm)</span></div>
  <!-- (A wheel slice saved with it: say why Confirm never lights up.) -->
  {#if action.kind === 'addRollTimes' && !card.rollTotal}<div class="warn small" role="status">No dice were rolled: this gives no points (Skip it).</div>{/if}
  <div class="row">
    <span class="muted small">For:</span>
    {#each session.players as p (p.id)}
      <button
        class="chip"
        style:border-color={p.color}
        style:background={targets.includes(p.id) ? p.color : undefined}
        style:color={targets.includes(p.id) ? textOn(p.color) : undefined}
        aria-pressed={targets.includes(p.id)}
        disabled={source === p.id}
        title={source === p.id ? `${action.kind === 'steal' ? 'Stolen from' : 'Swapped with'}: pick someone else` : undefined}
        data-player-id={p.id}
        onclick={() => draftPick(app.live, session, card, p.id)}>{p.name}</button>
    {/each}
  </div>
  {#if needsSource(action)}
    <div class="row">
      <span class="muted small">{action.kind === 'steal' ? 'Steal from:' : 'Swap with:'}</span>
      {#each session.players as p (p.id)}
        <button class="chip" class:src={source === p.id} style:border-color={p.color} aria-pressed={source === p.id} data-player-id={p.id} onclick={() => draftPick(app.live, session, card, p.id, true)}
          >{p.name}</button
        >
      {/each}
    </div>
  {/if}
  <div class="row">
    {#each Object.entries(now.deltas) as [id, d]}
      <span class="delta" class:neg={d < 0}>{byId[id]?.name}: {d > 0 ? '+' : '−'}{formatPoints(Math.abs(d), sym)}</span>
    {/each}
    <span class="spacer"></span>
    <button class="ghost small" onclick={() => applyScoreCard(game, session, app.live, card.key, { skip: true })}>Skip</button>
    <button class="good small" disabled={!now.ready} onclick={() => applyScoreCard(game, session, app.live, card.key, { tile })}>Confirm</button>
  </div>
</div>

<style>
  .ac {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    border: 1px solid var(--warn);
    border-radius: 8px;
  }
  .chip {
    border-width: 2px;
    padding: 2px 8px;
    font-size: 12px;
  }
  .chip.src {
    outline: 2px solid #fff;
  }
  .small {
    font-size: 12px;
  }
  .delta {
    font-weight: 700;
    color: var(--good);
  }
  .delta.neg {
    color: var(--bad);
  }
</style>
