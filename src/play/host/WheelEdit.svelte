<!-- The host's edit box for the wheel on screen: switch slices off, change their chances, add or rename slices.
     Edits change this run of the wheel only; Save as / Overwrite keep them in the game. -->
<script lang="ts">
  import { untrack } from 'svelte';
  import { app, toast } from '../../lib/app.svelte';
  import type { Live } from '../../lib/live';
  import { newId, type Game, type Session, type WheelPreset } from '../../lib/model';
  import { editWheel, resetWheelEdits, wheelPool } from '../../lib/overlay';
  import { newSegment, onSlices, type PoolSlice } from '../../lib/tools';

  type WheelOverlay = Extract<NonNullable<Live['overlay']>, { kind: 'wheel' }>;
  let { o, game, session, disabled }: { o: WheelOverlay; game: Game; session: Session; disabled: boolean } = $props();

  let rows = $state<PoolSlice[]>(untrack(() => wheelPool(o, session, game)));
  const preset = $derived(o.wheelId ? game.wheels.find((w) => w.id === o.wheelId) : undefined);
  const on = $derived(onSlices(rows));
  const total = $derived(on.reduce((a, s) => a + s.weight, 0));
  const chance = (s: PoolSlice) => (s.off || s.weight <= 0 || !total ? '—' : `${Math.round((s.weight / total) * 1000) / 10}%`);

  /** Put the edits on the wheel (this run only). */
  function apply(): void {
    if (!on.length) return toast('Keep at least one slice on the wheel');
    editWheel(o, rows);
  }

  function reset(): void {
    resetWheelEdits(o, session, game);
    rows = wheelPool(o, session, game);
  }

  /** A saved wheel goes into the game being played and, when it's the same game, the one in the editor. */
  function keep(change: (g: Game) => void): void {
    change(game);
    if (app.game.id === game.id && app.game !== game) change(app.game);
  }

  function saveAs(): void {
    if (!on.length) return toast('Keep at least one slice on the wheel');
    const name = prompt('Name for the new wheel:', o.players ? 'Players' : `${o.name} (edited)`)?.trim();
    if (!name) return;
    const wheel: WheelPreset = {
      id: newId(),
      name,
      segments: on.map((s) => ({ ...s, id: newId() })),
      spinDurationMs: preset?.spinDurationMs ?? 5000,
      removeAfterLanding: preset?.removeAfterLanding ?? false,
    };
    keep((g) => g.wheels.push(JSON.parse(JSON.stringify(wheel))));
    // The wheel on screen is now that saved wheel.
    o.wheelId = wheel.id;
    o.name = name;
    o.players = undefined;
    rows = JSON.parse(JSON.stringify(wheel.segments));
    editWheel(o, rows);
    toast(`Saved "${name}" with the game's wheels`);
  }

  function overwrite(): void {
    if (!preset || !on.length) return;
    if (!confirm(`Replace the slices of "${preset.name}" with these ${on.length}? This changes the wheel for the rest of the game.`)) return;
    const id = preset.id;
    keep((g) => {
      const w = g.wheels.find((x) => x.id === id);
      if (w) w.segments = JSON.parse(JSON.stringify(on));
    });
    rows = JSON.parse(JSON.stringify(on));
    editWheel(o, rows);
    toast(`"${preset.name}" updated`);
  }
</script>

<fieldset class="we" {disabled} aria-label="Edit this wheel">
  <p class="muted small">
    Changes apply to this spin only (until the wheel is closed). {o.players ? 'Players added later join with a normal chance.' : ''}
  </p>
  <table>
    <thead>
      <tr><th>On</th><th></th><th>Slice</th><th>Chance</th><th></th><th></th></tr>
    </thead>
    <tbody>
      {#each rows as s, i (s.id)}
        <tr class:off={s.off}>
          <td><input type="checkbox" checked={!s.off} aria-label={`Include ${s.label}`} onchange={(e) => ((s.off = !e.currentTarget.checked), apply())} /></td>
          <td>
            {#if o.players}
              <span class="dot" style:background={s.color}></span>
            {:else}
              <input type="color" bind:value={s.color} onchange={apply} aria-label={`Color of ${s.label}`} />
            {/if}
          </td>
          <td>
            {#if o.players}
              {s.label}
            {:else}
              <input class="label" bind:value={s.label} onchange={apply} aria-label={`Slice ${i + 1} label`} />
            {/if}
          </td>
          <td>
            <input
              class="w"
              type="number"
              min="0"
              step="0.5"
              value={s.weight}
              aria-label={`Weight of ${s.label}`}
              title="Relative chance: 2 is twice as likely as 1"
              onchange={(e) => ((s.weight = Math.max(0, +e.currentTarget.value || 0)), apply())}
            />
          </td>
          <td class="pct">{chance(s)}</td>
          <td>
            {#if !o.players}
              <button class="ghost small" aria-label={`Remove ${s.label}`} onclick={() => ((rows = rows.filter((x) => x !== s)), apply())}>✕</button>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
  <div class="row">
    {#if !o.players}
      <button class="small" onclick={() => ((rows = [...rows, newSegment(`Option ${rows.length + 1}`, rows.length)]), apply())}>＋ Add slice</button>
    {/if}
    <button class="small" onclick={() => ((rows = rows.map((s) => ({ ...s, weight: 1 }))), apply())}>Even chances</button>
    <button class="small ghost" onclick={reset}>↺ Undo edits</button>
    <span class="spacer"></span>
    <button class="small" onclick={saveAs}>💾 Save as new wheel…</button>
    {#if preset}
      <button class="small" onclick={overwrite}>Overwrite "{preset.name}"</button>
    {/if}
  </div>
</fieldset>

<style>
  .we {
    margin: 0;
    padding: 0;
    border: none;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 320px;
    overflow: auto;
  }
  table {
    width: auto;
    align-self: flex-start;
    border-collapse: collapse;
    font-size: 13px;
  }
  th {
    text-align: left;
    font-weight: normal;
    font-size: 11px;
    color: var(--muted);
    padding: 0 4px;
  }
  td {
    padding: 2px 4px;
  }
  tr.off td:not(:first-child) {
    opacity: 0.45;
  }
  .label {
    width: 220px;
  }
  .w {
    width: 64px;
  }
  .pct {
    min-width: 52px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  input[type='color'] {
    width: 28px;
    height: 24px;
    padding: 0;
  }
  .dot {
    display: inline-block;
    width: 14px;
    height: 14px;
    border-radius: 50%;
  }
  .small {
    font-size: 12px;
  }
</style>
