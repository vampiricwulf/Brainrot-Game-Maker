<!-- Simple text editing for a slide's main text + live preview. The full freeform slide editor is M3. -->
<script lang="ts">
  import { setSlideText, slideText, type Slide } from '../lib/model';
  import Stage from '../lib/Stage.svelte';
  import SlideView from '../lib/SlideView.svelte';

  let { slide, label, placeholder = '' }: { slide: Slide; label: string; placeholder?: string } = $props();
  const el = $derived(slide.elements.find((e) => e.kind === 'text'));
</script>

<div class="ste">
  <label class="field">
    {label}
    <textarea
      rows="4"
      {placeholder}
      value={slideText(slide)}
      oninput={(e) => setSlideText(slide, e.currentTarget.value)}
    ></textarea>
  </label>
  {#if el}
    <div class="row opts">
      <label class="check"><input type="checkbox" bind:checked={el.uppercase} /> ALL CAPS</label>
      <label class="check"><input type="checkbox" bind:checked={el.autoFit} /> Shrink to fit</label>
      <label class="check">Max size <input type="number" min="12" max="400" bind:value={el.size} /></label>
      <label class="check">Color <input type="color" bind:value={el.color} /></label>
    </div>
  {/if}
  <div class="preview">
    <Stage><SlideView {slide} /></Stage>
  </div>
</div>

<style>
  .ste {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  textarea {
    resize: vertical;
  }
  .opts {
    font-size: 12px;
  }
  .opts input[type='number'] {
    width: 64px;
  }
  .preview {
    aspect-ratio: 16 / 9;
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid var(--border);
  }
</style>
