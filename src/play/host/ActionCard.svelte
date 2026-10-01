<!-- Optional score effect of a wheel/dice outcome: pick who it applies to, preview, then confirm or skip. -->
<script lang="ts">
  import { untrack } from 'svelte';
  import { textOn } from '../../lib/colors';
  import { formatPoints, type Game, type ScoreAction, type Session } from '../../lib/model';
  import { actionDeltas, applyAction, describeAction, needsSource } from '../../lib/tools';

  let {
    action,
    game,
    session,
    reason,
    rollTotal = 0,
    defaultTargets = [],
    ondone,
  }: {
    action: ScoreAction;
    game: Game;
    session: Session;
    reason: string;
    rollTotal?: number;
    defaultTargets?: string[];
    ondone: (applied: boolean) => void;
  } = $props();

  const sym = $derived(game.settings.currencySymbol);
  /** A swap is with one player: the "For:" row picks one (a second would be left out without a word). */
  const one = untrack(() => action.kind === 'swapScores');
  let targets = $state<string[]>(
    untrack(() => (defaultTargets.length ? [...defaultTargets] : session.currentPickerId ? [session.currentPickerId] : []).slice(0, one ? 1 : undefined)),
  );
  let source = $state<string | undefined>(undefined);
  const deltas = $derived(actionDeltas(session, action, targets, source, rollTotal));
  const byId = $derived(Object.fromEntries(session.players.map((p) => [p.id, p])));
  const ready = $derived(targets.length > 0 && (!needsSource(action) || !!source) && Object.keys(deltas).length > 0);

  function toggle(id: string): void {
    targets = targets.includes(id) ? targets.filter((x) => x !== id) : one ? [id] : [...targets, id];
  }

  /** The player stolen from (or swapped with) isn't one it's for. */
  function pickSource(id: string): void {
    source = id;
    targets = targets.filter((x) => x !== id);
  }
</script>

<div class="ac">
  <div><b>Score effect:</b> {describeAction(action, sym)} <span class="muted small">(only if you confirm)</span></div>
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
        onclick={() => toggle(p.id)}>{p.name}</button>
    {/each}
  </div>
  {#if needsSource(action)}
    <div class="row">
      <span class="muted small">{action.kind === 'steal' ? 'Steal from:' : 'Swap with:'}</span>
      {#each session.players as p (p.id)}
        <button class="chip" class:src={source === p.id} style:border-color={p.color} aria-pressed={source === p.id} onclick={() => pickSource(p.id)}>{p.name}</button>
      {/each}
    </div>
  {/if}
  <div class="row">
    {#each Object.entries(deltas) as [id, d]}
      <span class="delta" class:neg={d < 0}>{byId[id]?.name}: {d > 0 ? '+' : '−'}{formatPoints(Math.abs(d), sym)}</span>
    {/each}
    <span class="spacer"></span>
    <button class="ghost small" onclick={() => ondone(false)}>Skip</button>
    <button
      class="good small"
      disabled={!ready}
      onclick={() => {
        applyAction(session, game, action, targets, source, reason, rollTotal);
        ondone(true);
      }}>Confirm</button>
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
