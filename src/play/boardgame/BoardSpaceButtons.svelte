<!--
  ✎ Edit board › ⚙ Buttons…: a space's buttons (when passed, when landed on) and its host notes, with the editor's own
  fields, on the game being played. Everything done here is one undoable step (Ctrl+Z once it's closed), and it lasts for
  this game only unless the host presses 💾 Keep in game.
-->
<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { app } from '../../lib/app.svelte';
  import { modal } from '../../lib/modal';
  import type { BoardGameRound, BoardSpace } from '../../lib/model';
  import { startStep } from '../../lib/toolset';
  import ActionListEditor from '../../editor/rpg/ActionListEditor.svelte';

  let { round, space, onclose }: { round: BoardGameRound; space: BoardSpace; onclose: () => void } = $props();
  // One step for the whole edit (with the board's spaces, so Undo puts the buttons back).
  const done = untrack(() => app.session && startStep(app.session, app.playGame ?? undefined));
  const title = untrack(() => space.name);
  // The editor's fields work on the game being played while this is open (and the host's shortcuts stay off).
  app.editGame = app.playGame;
  onDestroy(() => {
    app.editGame = null;
    done?.(`Changed the buttons on “${title}”`);
  });

  let box = $state<HTMLElement>();
  /** Esc closes it (not while a field, a picker or another dialog over it has the key). */
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
  <div class="modal" role="dialog" aria-modal="true" aria-label="Buttons on {space.name}" bind:this={box} use:modal>
    <div class="row">
      <b class="modal-title">⚙ {space.name}</b>
      <span class="muted small">For this game only, unless you press 💾 Keep in game.</span>
      <span class="spacer"></span>
      <button class="primary" onclick={onclose} title="Esc">Done</button>
      <button class="ghost modal-x" onclick={onclose} aria-label="Close" title="Close (Esc)">✕</button>
    </div>
    <div class="body">
      <h5>When passed <span class="muted small">(landing on it counts too · e.g. Start: +2 gold)</span></h5>
      <ActionListEditor bind:actions={space.onPass} board={round} addLabel="＋ Add button (when passed)" />
      <h5>When landed on</h5>
      <ActionListEditor bind:actions={space.onLand} board={round} addLabel="＋ Add button (when landed on)" />
      <label class="field">Host notes (never shown on stream)<textarea rows="2" bind:value={space.hostNotes}></textarea></label>
    </div>
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
    width: min(720px, 100%);
    max-height: min(860px, 100%);
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
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .small {
    font-size: 12px;
  }
  h5 {
    margin: 4px 0 0;
  }
</style>
