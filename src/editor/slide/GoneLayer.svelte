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
  /** The label's size on screen (px; its height at most, three lines): the same whatever the stage's scale or the item's. */
  const LABEL = 240;
  const LABEL_H = 64;
  /** Where the label goes: at the item's top-left (unturned), moved in as far as it takes to be wholly on the slide. */
  const at = (v: number, size: number, room: number) => Math.max(0, Math.min(v, room - size * inv));
  const another = (kind: string) => (kind === 'video' ? 'video' : kind === 'audio' ? 'sound' : 'picture');
</script>

{#if gone.length || bgGone}
  <div class="gone-layer" inert aria-hidden="true" style:--inv={inv}>
    {#each gone as el (el.id)}
      <div class="gone" data-gone={el.id}>
        <div class="frame" style:left="{el.x}px" style:top="{el.y}px" style:width="{el.w}px" style:height="{el.h}px" style:transform="rotate({el.rotation}deg)"
        ></div>
        <!-- (Not turned with it, and never off the slide, whatever the item's place or size.) -->
        <span class="say" style:left="{at(el.x, LABEL, 1920)}px" style:top="{at(el.y, LABEL_H, 1080)}px"
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
  .frame {
    position: absolute;
    box-sizing: border-box;
    outline: calc(3px * var(--inv)) dashed var(--warn);
    outline-offset: calc(-3px * var(--inv));
    /* The picture still shows, dimmed (about a third of its strength). */
    background: rgb(0 0 0 / 0.65);
  }
  /* A badge at the item's top-left (moved in where that would be off the slide), as the editor's ribbon is: its screen
     size whatever the item's, so a small picture's still reads. */
  .say {
    position: absolute;
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
