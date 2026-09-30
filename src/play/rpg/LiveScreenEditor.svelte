<!--
  Editing a screen (or one of its looks) during the game: the screen editor on the game being played, while the
  game keeps running underneath. Changes stay in this game until the host presses 💾 Keep in game.
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { app } from '../../lib/app.svelte';
  import type { Screen, Slide, World } from '../../lib/model';
  import ScreenEditor from '../../editor/rpg/ScreenEditor.svelte';

  let { world, screen, slide, title, onclose }: { world: World; screen: Screen; slide: Slide; title: string; onclose: () => void } = $props();
  // The slide editors work on the game being played while this is open (and the host's shortcuts stay off).
  app.editGame = app.playGame;
  onDestroy(() => (app.editGame = null));
</script>

<div class="backdrop" role="presentation">
  <div class="modal" role="dialog" aria-label="Edit {title} live">
    <div class="row">
      <b>✎ {title}</b>
      <span class="muted small">Live: viewers see changes as you make them. They stay in this game unless you press 💾 Keep in game.</span>
      <span class="spacer"></span>
      <button class="primary" onclick={onclose}>Done</button>
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
