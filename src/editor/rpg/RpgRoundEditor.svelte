<!-- An RPG round: which world it plays, where the party starts, and the world itself. -->
<script lang="ts">
  import { app } from '../../lib/app.svelte';
  import type { RpgRound } from '../../lib/model';
  import { newWorld, rpgRounds, worldById } from '../../lib/rpg';
  import ScreenPicker from './ScreenPicker.svelte';
  import WorldEditor from './WorldEditor.svelte';

  let { round }: { round: RpgRound } = $props();
  const game = $derived(app.game);
  const world = $derived(worldById(game, round.world));
  const sharing = $derived(rpgRounds(game).filter((r) => r.world === round.world && r.id !== round.id).length);

  function createWorld(): void {
    const w = newWorld(`World ${(game.worlds?.length ?? 0) + 1}`);
    game.worlds = [...(game.worlds ?? []), w];
    round.world = w.id;
    round.start = undefined;
  }
</script>

<div class="rr">
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
        {#each game.worlds ?? [] as w (w.id)}<option value={w.id}>{w.name}</option>{/each}
      </select>
    </label>
    <button class="small" onclick={createWorld}>＋ New world</button>
    {#if world}
      <label class="field">World name<input bind:value={world.name} /></label>
      <div class="field">
        <span>Party starts at</span>
        <ScreenPicker {world} value={round.start} label="" onchange={(ref) => (round.start = ref)} />
      </div>
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
  {#if world}
    {#key world.id}<WorldEditor {world} />{/key}
  {:else}
    <p class="warn">This round's world is gone. Pick one above or make a new one.</p>
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
  .notes textarea {
    width: min(640px, 100%);
  }
  .small {
    font-size: 12px;
  }
</style>
