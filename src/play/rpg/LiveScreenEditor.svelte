<!--
  Editing a screen (or one of its looks) during the game: the screen editor on the game being played, while the
  game keeps running underneath. Changes stay in this game until the host presses 💾 Keep in game. Everything done
  here is one undoable step (Ctrl+Z once it's closed).
-->
<script lang="ts">
  import { modal } from '../../lib/modal';
  import { onDestroy, untrack } from 'svelte';
  import { adoptAdded, focusRef, occupiedScreens } from '../../lib/rpg';
  import { app } from '../../lib/app.svelte';
  import type { Screen, Slide, World, WorldState } from '../../lib/model';
  import { startStep } from '../../lib/toolset';
  import ScreenEditor from '../../editor/rpg/ScreenEditor.svelte';

  let {
    world,
    screen,
    slide,
    title,
    st,
    onclose,
  }: { world: World; screen: Screen; slide: Slide; title: string; st?: WorldState; onclose: () => void } = $props();
  // One step for the whole edit, objects moving into the look included (so an undo puts them back where they were).
  const done = untrack(() => app.session && startStep(app.session, app.playGame ?? undefined));
  // Objects added during play become part of this look, so they can be moved and edited here too.
  untrack(() => st && adoptAdded(st, screen, slide));
  // The slide editors work on the game being played while this is open (and the host's shortcuts stay off).
  app.editGame = app.playGame;
  onDestroy(() => {
    app.editGame = null;
    done?.(`Edit ${title}`);
  });
  /** Viewers are looking at this screen (the party is on it, or a party is in split view). */
  const onAir = $derived(!!st && (st.split ? occupiedScreens(st) : [focusRef(st)]).some((r) => r?.screen === screen.id));

  let box = $state<HTMLElement>();
  /**
   * Esc is Done, once the screen editor's own Esc steps are over (they come first: out of a field, the link box or a
   * picker, then the selection). Not while a picker or another dialog is open over this one.
   */
  function key(e: KeyboardEvent): void {
    if (e.key !== 'Escape' || (e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable]')) return;
    const dialogs = document.querySelectorAll('[role="dialog"]');
    if (dialogs[dialogs.length - 1] !== box) return;
    e.stopImmediatePropagation();
    onclose();
  }
</script>

<svelte:window onkeydown={key} />

<div class="backdrop" role="presentation">
  <div class="modal" role="dialog" aria-modal="true" aria-label="Edit {title} live" bind:this={box} use:modal>
    <div class="row">
      <b class="modal-title">✎ {title}</b>
      <span class="muted small">
        {onAir ? 'Live: viewers see changes as you make them.' : 'Off air: viewers see it when the party gets here.'} They stay in this game unless you press
        💾 Keep in game.
      </span>
      <span class="spacer"></span>
      <button class="primary" onclick={onclose} title="Esc">Done</button>
      <button class="ghost modal-x" onclick={onclose} aria-label="Close" title="Close (Esc)">✕</button>
    </div>
    <div class="body"><ScreenEditor {world} {screen} {slide} /></div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 150;
    background: rgba(0, 0, 0, 0.6);
    display: grid;
    place-items: center;
    padding: 16px;
  }
  .modal {
    width: min(1400px, 100%);
    height: min(860px, 100%);
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  .body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .small {
    font-size: 12px;
  }
</style>
