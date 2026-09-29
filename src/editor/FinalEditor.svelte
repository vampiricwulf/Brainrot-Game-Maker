<script lang="ts">
  import { app } from '../lib/app.svelte';
  import SlideTextEditor from './SlideTextEditor.svelte';

  const final = $derived(app.game.final);
</script>

<h2>Final Jeopardy</h2>
<label class="check"><input type="checkbox" bind:checked={final.enabled} /> Include Final Jeopardy</label>

{#if final.enabled}
  <p class="muted">Wagers and the per-player reveal are coming in a later milestone. You can write the content now.</p>
  <div class="grid">
    <label class="field">Category<input bind:value={final.category} placeholder="e.g. Internet History" /></label>
    <label class="field">Think time (seconds)<input type="number" min="5" bind:value={final.timerSeconds} /></label>
  </div>
  <div class="slides">
    <SlideTextEditor slide={final.questionSlide} label="Question" />
    <SlideTextEditor slide={final.answerSlide} label="Answer" />
  </div>
{/if}

<style>
  h2 {
    margin: 0 0 8px;
  }
  p {
    margin: 12px 0;
  }
  .grid {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
  }
  .grid input {
    width: 280px;
  }
  .slides {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    max-width: 1100px;
  }
  @media (max-width: 760px) {
    .slides {
      grid-template-columns: 1fr;
    }
  }
</style>
