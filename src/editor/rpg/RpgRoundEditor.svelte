<!-- An RPG round: which world it plays, where the party starts, and the world itself. -->
<script lang="ts">
  import { app } from '../../lib/app.svelte';
  import type { RpgRound, World } from '../../lib/model';
  import { newWorld, rpgRounds, startRef, worldById } from '../../lib/rpg';
  import ScreenPicker from './ScreenPicker.svelte';
  import WorldEditor from './WorldEditor.svelte';

  let { round }: { round: RpgRound } = $props();
  const game = $derived(app.game);
  const world = $derived(worldById(game, round.world));
  const sharing = $derived(rpgRounds(game).filter((r) => r.world === round.world && r.id !== round.id).length);
  /** A screen is open in the screen editor: it gets the room this round's settings take. */
  let editing = $state(false);

  function createWorld(): void {
    const w = newWorld(`World ${(game.worlds?.length ?? 0) + 1}`);
    game.worlds = [...(game.worlds ?? []), w];
    round.world = w.id;
    round.start = undefined;
  }

  function deleteWorld(w: World): void {
    const screens = w.maps.reduce((n, m) => n + m.screens.length, 0);
    if (!confirm(`Delete the world "${w.name}" and its ${screens} screen(s)?`)) return;
    game.worlds = (game.worlds ?? []).filter((x) => x.id !== w.id);
    // This round plays another world (or none: it says so below).
    round.world = game.worlds[0]?.id ?? '';
    round.start = undefined;
  }
</script>

<div class="rr">
  {#if !editing}
    <div class="top">
      <label class="field">Round name<input bind:value={round.name} /></label>
      <label class="field">
        World
        <select
          value={round.world}
          onchange={(e) => {
            round.world = e.currentTarget.value;
            round.start = undefined;
          }}
          aria-label="World"
        >
          {#each game.worlds ?? [] as w (w.id)}<option value={w.id}>{w.name}</option>{:else}<option value="">— none yet —</option>{/each}
        </select>
      </label>
      <button class="small" onclick={createWorld}>＋ New world</button>
      {#if world}
        <button
          class="ghost small"
          onclick={() => deleteWorld(world)}
          disabled={sharing > 0}
          title={sharing ? 'Another round plays this world' : 'Delete this world and all its maps and screens'}>Delete world</button
        >
        <label class="field">World name<input bind:value={world.name} /></label>
        <label class="field start">
          Party starts at
          <!-- A start screen deleted since: the party starts on the first screen (as the map's 🏁 shows). -->
          <ScreenPicker
            {world}
            value={startRef(world, round) === round.start ? round.start : undefined}
            label=""
            none="— first screen —"
            onchange={(ref) => (round.start = ref)}
          />
        </label>
      {/if}
    </div>
    {#if sharing}
      <p class="muted small">
        {sharing} other round{sharing === 1 ? '' : 's'} play{sharing === 1 ? 's' : ''} this world too: the adventure carries on where it was left
        (the start only applies the first time).
      </p>
    {/if}
    <label class="field notes">
      Host notes
      <textarea rows="2" value={round.hostNotes ?? ''} oninput={(e) => (round.hostNotes = e.currentTarget.value || undefined)}></textarea>
    </label>
  {/if}
  {#if world}
    {#key world.id}<WorldEditor {world} bind:editing start={startRef(world, round)} onstart={(ref) => (round.start = ref)} />{/key}
  {:else}
    <p class="warn">This round's world is gone. Make a new one (＋ New world){game.worlds?.length ? ' or pick another above' : ''}.</p>
  {/if}
</div>

<style>
  .rr {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .top {
    display: flex;
    gap: 12px;
    align-items: end;
    flex-wrap: wrap;
  }
  /* The screen picker's selects, like the other fields' (the label's own text is small and muted). */
  .start :global(select) {
    color: var(--text);
    font-size: 14px;
  }
  .notes textarea {
    width: min(640px, 100%);
  }
  .small {
    font-size: 12px;
  }
</style>
