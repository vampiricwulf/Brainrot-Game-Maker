<!-- An RPG round: which world it plays, where the party starts, and the world itself. -->
<script lang="ts">
  import { app } from '../../lib/app.svelte';
  import { step } from '../../lib/history.svelte';
  import { dropMenu, menuItem, menuOf } from '../../lib/menustate.svelte';
  import type { RpgRound, World } from '../../lib/model';
  import { newWorld, rpgRounds, startRef, worldById } from '../../lib/rpg';
  import { duplicateWorld } from '../../lib/worldedit';
  import { RememberedFold } from '../../lib/fold.svelte';
  import { tick } from 'svelte';
  import ScreenPicker from './ScreenPicker.svelte';
  import WorldEditor from './WorldEditor.svelte';

  let { round }: { round: RpgRound } = $props();
  const game = $derived(app.game);
  const world = $derived(worldById(game, round.world));
  const sharing = $derived(rpgRounds(game).filter((r) => r.world === round.world && r.id !== round.id).length);
  /**
   * The other RPG rounds, which play other worlds: this round's adventure is separate from theirs (one line says so;
   * the world settings stay under ▸ Advanced).
   */
  const separate = $derived(rpgRounds(game).filter((r) => r.world !== round.world && r.id !== round.id).map((r) => r.name.trim() || 'another round'));
  /**
   * ▸ Advanced (the world this round plays): folded, as this computer last left it, and open by itself when it matters
   * here (another round plays this world, or this round has none).
   */
  const adv = new RememberedFold('jb.rpgAdvancedOpen');
  $effect(() => adv.need(sharing > 0 || !world));
  /** A screen is open in the screen editor: it gets the room this round's settings take. */
  let editing = $state(false);

  function createWorld(): void {
    const w = newWorld(`World ${(game.worlds?.length ?? 0) + 1}`);
    game.worlds = [...(game.worlds ?? []), w];
    round.world = w.id;
    round.start = undefined;
  }

  /**
   * A copy of the world, played by this round from now on (the other rounds that played it keep the original): its
   * party starts where it did, on the copy's screen.
   */
  function copyWorld(w: World): void {
    const at = round.start;
    step(`Duplicated world “${w.name}”`, () => {
      const copy = duplicateWorld(w, (game.worlds ?? []).map((x) => x.name));
      const list = game.worlds ?? [];
      list.splice(list.indexOf(w) + 1, 0, copy);
      game.worlds = list;
      round.world = copy.id;
      // (The same screen in the copy: the maps and screens are in the same places.)
      const m = at ? w.maps.findIndex((x) => x.id === at.map) : -1;
      const sc = at && m >= 0 ? w.maps[m].screens.findIndex((x) => x.id === at.screen) : -1;
      round.start = m >= 0 && sc >= 0 ? { map: copy.maps[m].id, screen: copy.maps[m].screens[sc].id } : undefined;
    });
  }
  let worldName = $state<HTMLInputElement>();
  /** ✎ Rename: the World name box, its name selected to type over. */
  const renameWorld = () => void tick().then(() => (worldName?.focus(), worldName?.select()));

  /** Done at once, with its maps and screens: the note at the bottom offers Undo. */
  function deleteWorld(w: World): void {
    step(
      `Deleted world “${w.name}”`,
      () => {
        game.worlds = (game.worlds ?? []).filter((x) => x.id !== w.id);
        // This round plays another world (or none: it says so below).
        round.world = game.worlds[0]?.id ?? '';
        round.start = undefined;
      },
      { notify: true },
    );
  }
</script>

<div class="rr">
  {#if !editing}
    <div class="top">
      <label class="field">Round name<input bind:value={round.name} data-round-name /></label>
      {#if world}
        <label class="field start" title="The screen everyone starts on (🏁 on the map below)">
          Players start on
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
      <!-- (Beside the name and the start, so the map starts higher up on a small screen.) -->
      <label class="field notes">
        Host notes (off stream, except in a single window)
        <textarea rows="1" data-field="round-notes" value={round.hostNotes ?? ''} oninput={(e) => (round.hostNotes = e.currentTarget.value || undefined)}></textarea>
      </label>
    </div>
    <p class="muted small">
      An adventure is a map of screens (places) the players walk between: ＋ on the map adds one, double-click it to draw it and fill it.
    </p>
    {#if sharing}
      <p class="muted small" data-world-shared>
        {sharing} other round{sharing === 1 ? '' : 's'} play{sharing === 1 ? 's' : ''} this adventure too: it carries on where it was left (the start only
        applies the first time).
      </p>
    {:else if world && separate.length}
      <p class="muted small" data-world-own>Its own world (separate from {[...new Set(separate)].join(', ')}).</p>
    {/if}
    <!-- Open by itself only when it matters here: another round plays this world, or this round has none. -->
    <details class="adv" open={adv.open} ontoggle={(e) => adv.set(e.currentTarget.open)}>
      <summary
        >{adv.open ? '▾' : '▸'} Advanced: carry this adventure into another round{#if !adv.open && world}<span class="muted"> · World “{world.name}”</span>{/if}</summary
      >
      <p class="muted small">
        The maps and screens belong to a “world”. Another RPG round can play the same world, so the adventure carries on where it was left; or
        give this round a world of its own.
      </p>
      <div class="top">
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
        {#if world}
          <label class="field" title="A world (its maps and screens) can be played by several rounds: the adventure carries on in the next one">
            World name<input bind:value={world.name} bind:this={worldName} />
          </label>
        {/if}
        <button onclick={createWorld} title="An empty world for this round (the other one stays in the game)">＋ New world</button>
        {#if world}
          <button
            class="ghost"
            aria-haspopup="menu"
            aria-label="More for this world"
            title="Rename, duplicate or delete this world"
            onclick={(e) =>
              dropMenu(
                e,
                menuOf({
                  heading: world.name,
                  rename: menuItem.rename(renameWorld, { label: '✎ Rename world', keys: false }),
                  duplicate: menuItem.duplicate(() => copyWorld(world), { label: '⧉ Duplicate world', keys: false, hint: 'This round plays the copy; another round can keep the original' }),
                  delete: menuItem.delete('world', () => deleteWorld(world), {
                    disabled: sharing > 0,
                    hint: sharing ? 'Another round plays this world' : 'With all its maps and screens',
                    keys: false,
                  }),
                }),
              )}>⋯</button
          >
        {/if}
      </div>
    </details>
  {/if}
  {#if world}
    {#key world.id}<WorldEditor {world} bind:editing remember={round.id} start={startRef(world, round)} onstart={(ref) => (round.start = ref)} />{/key}
  {:else}
    <p class="warn">This round's world is gone. Make a new one (＋ New world, under ▸ Advanced){game.worlds?.length ? ' or pick another there' : ''}.</p>
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
  .adv {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .adv summary {
    cursor: pointer;
    color: var(--muted);
    font-size: 13px;
    /* (Its ▸ / ▾ is in its words.) */
    list-style: none;
  }
  .adv summary::-webkit-details-marker {
    display: none;
  }
  .adv[open] summary {
    margin-bottom: 6px;
  }
  .notes {
    flex: 1 1 220px;
    max-width: 640px;
  }
  .notes textarea {
    width: 100%;
    resize: vertical;
  }
</style>
