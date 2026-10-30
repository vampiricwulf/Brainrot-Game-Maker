<!--
  ✎ Edit board › ⚙ Buttons…: a space's buttons (when passed, when landed on) and its host notes, with the editor's own
  fields, on the game being played. Everything done here is one undoable step (Ctrl+Z once it's closed), and it lasts for
  this game only unless the host presses 💾 Keep in game. In a single window (viewers see it) a secret space not revealed
  yet keeps its buttons and notes behind 👁 Show its buttons.
-->
<script lang="ts">
  import { getContext, onDestroy, untrack } from 'svelte';
  import { app } from '../../lib/app.svelte';
  import { modal } from '../../lib/modal';
  import type { BoardGameRound, BoardSpace } from '../../lib/model';
  import { startStep } from '../../lib/toolset';
  import ActionListEditor from '../../editor/rpg/ActionListEditor.svelte';
  import { PANEL_AREA, type PanelPlace } from '../host/panelarea';

  let {
    round,
    space,
    name,
    quietName,
    hidden = false,
    onclose,
  }: {
    round: BoardGameRound;
    space: BoardSpace;
    /** Its name as the panel says it (one window, a secret space not revealed yet: “? (secret)”). */
    name?: string;
    /** Its name as a single window's step says it (a secret space not revealed yet: “? (secret)”). */
    quietName?: string;
    /** One window, a secret space not revealed yet: its buttons and notes wait for 👁 Show its buttons. */
    hidden?: boolean;
    onclose: () => void;
  } = $props();
  // One step for the whole edit (with the board's spaces, so Undo puts the buttons back).
  const done = untrack(() => app.session && startStep(app.session, app.playGame ?? undefined));
  const [title, quietTitle] = untrack(() => [space.name, quietName ?? space.name]);
  // The editor's fields work on the game being played while this is open (and the host's shortcuts stay off).
  app.editGame = app.playGame;
  onDestroy(() => {
    app.editGame = null;
    done?.(`Changed the buttons on “${title}”`, `Changed the buttons on “${quietTitle}”`);
  });
  /** 👁 Show its buttons pressed (a secret space's, in one window). */
  let shown = $state(false);

  // One window: over the host panel only (it waits for the panel's box), never the stage viewers see.
  const place = getContext<PanelPlace | undefined>(PANEL_AREA);
  const at = $derived(place?.() ?? { dual: true, box: null });
  const area = $derived(at.dual ? null : at.box);

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

{#if at.dual || area}
  <div
    class="backdrop"
    class:in-panel={!!area}
    style:top={area ? `${area.top}px` : undefined}
    style:left={area ? `${area.left}px` : undefined}
    style:width={area ? `${area.width}px` : undefined}
    style:height={area ? `${area.height}px` : undefined}
    role="presentation"
  >
    <div class="modal" role="dialog" aria-modal="true" aria-label="Buttons on {name ?? space.name}" bind:this={box} use:modal>
      <div class="row">
        <b class="modal-title">⚙ {name ?? space.name}</b>
        <span class="muted small">For this game only{app.playerOnly ? '' : ', unless you press 💾 Keep in game'}.</span>
        <span class="spacer"></span>
        <button class="primary" onclick={onclose} title="Esc">Done</button>
        <button class="ghost modal-x" onclick={onclose} aria-label="Close" title="Close (Esc)">✕</button>
      </div>
      {#if hidden && !shown}
        <p class="small" data-buttons-hidden>
          Viewers see this window, and this space is still a secret: its buttons and host notes stay hidden here.
          <button class="small" onclick={() => (shown = true)} title="Shows them here (viewers see them too)">👁 Show its buttons</button>
        </p>
      {:else}
        <div class="body">
          <h5>When passed <span class="muted small">(landing on it counts too · e.g. Start: +2 gold)</span></h5>
          <ActionListEditor bind:actions={space.onPass} board={round} passing addLabel="＋ Add button (when passed)" />
          <h5>When landed on</h5>
          <ActionListEditor bind:actions={space.onLand} board={round} addLabel="＋ Add button (when landed on)" />
          <label class="field">Host notes (off stream, except in a single window)<textarea rows="2" bind:value={space.hostNotes}></textarea></label>
        </div>
      {/if}
    </div>
  </div>
{/if}

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
  .backdrop.in-panel {
    inset: auto;
    padding: 8px;
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
