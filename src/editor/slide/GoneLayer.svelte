<!--
  The slide editor's marks for files deleted in 🖼️ Media that the slide still uses: a dashed ⚠ frame over each such
  picture, video or sound (dimming it: it still shows, so ↶ Undo visibly brings it back), and a strip along the bottom
  for its background picture. They aren't saved with the game, so the stream won't have them. Drawn inside the stage
  between the slide and the edit layer, never on stream (the stage and SlideView are left as they are).
-->
<script lang="ts">
  import { getContext } from 'svelte';
  import type { Game, Slide } from '../../lib/model';
  import { fileDeleted, itemFileDeleted } from '../../lib/usage';
  import { slideNouns } from './nouns';

  let { slide, game }: { slide: Slide; game: Game } = $props();
  const stage = getContext<{ scale: number } | undefined>('stage');
  const inv = $derived(1 / (stage?.scale || 1));
  const words = slideNouns();
  const say = $derived(words());
  const gone = $derived(slide.elements.filter((el) => itemFileDeleted(game, el)));
  const bgGone = $derived(fileDeleted(game, slide.background.image));
  /** The label's width on screen (px): it keeps its size whatever the stage's scale or the item's, never clipped by it. */
  const LABEL = 240;
  /** Its height on screen, at most (three lines): near the slide's foot it goes up from the item's bottom instead. */
  const LABEL_H = 64;
  const another = (kind: string) => (kind === 'video' ? 'video' : kind === 'audio' ? 'sound' : 'picture');
</script>

{#if gone.length || bgGone}
  <div class="gone-layer" inert aria-hidden="true" style:--inv={inv}>
    {#each gone as el (el.id)}
      <div
        class="gone"
        data-gone={el.id}
        style:left="{el.x}px"
        style:top="{el.y}px"
        style:width="{el.w}px"
        style:height="{el.h}px"
        style:transform="rotate({el.rotation}deg)"
      >
        <span
          class="say"
          class:right={el.x + LABEL * inv > 1920 && el.x + el.w > LABEL * inv}
          class:up={el.y + LABEL_H * inv > 1080 && el.y + el.h > LABEL_H * inv}
          >⚠ Deleted file: not saved with the game. Undo in 🕘 History, or 🔁 Use another {another(el.kind)}…</span
        >
      </div>
    {/each}
    {#if bgGone}
      <div class="gone-bg" data-gone="background">
        ⚠ The {say.page}’s background picture was deleted: not saved with the game. Undo in 🕘 History, or Background ▾ › Change…
      </div>
    {/if}
  </div>
{/if}

<style>
  .gone-layer {
    position: absolute;
    inset: 0;
    /* Over the slide's items, under the badge, the guides and the edit layer (999, 998 and 1000). */
    z-index: 997;
    pointer-events: none;
  }
  .gone {
    position: absolute;
    box-sizing: border-box;
    outline: calc(3px * var(--inv)) dashed var(--warn);
    outline-offset: calc(-3px * var(--inv));
    /* The picture still shows, dimmed (about a third of its strength). */
    background: rgb(0 0 0 / 0.65);
  }
  /* A badge at the item's top-left (its right near the slide's right edge, its bottom near the slide's foot), as the
     editor's ribbon is: its screen size whatever the item's, so a small picture's still reads. */
  .say {
    position: absolute;
    top: 0;
    left: 0;
    width: calc(240px * var(--inv));
    box-sizing: border-box;
    padding: calc(3px * var(--inv)) calc(8px * var(--inv));
    border-radius: calc(4px * var(--inv));
    background: var(--warn);
    color: #000;
    font-size: calc(12px * var(--inv));
    font-weight: 700;
    line-height: 1.3;
  }
  .say.right {
    left: auto;
    right: 0;
  }
  .say.up {
    top: auto;
    bottom: 0;
  }
  .gone-bg {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    padding: calc(4px * var(--inv)) calc(10px * var(--inv));
    background: var(--warn);
    color: #000;
    font-size: calc(12px * var(--inv));
    font-weight: 700;
    text-align: center;
  }
</style>
