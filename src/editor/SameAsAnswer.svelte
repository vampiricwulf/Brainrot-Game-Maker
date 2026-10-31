<!--
  ⧉ Same as the answer, in the corner of an empty 🤫 card's words box (a tile's, in the clue editor; a Final's): a copy of
  the answer slide on the card, once. Greyed while the answer is empty. The card's tab menu has it too.
-->
<script lang="ts">
  import type { Slide } from '../lib/model';
  import { slideHasContent } from '../lib/usage';

  let { answer, oncopy }: { answer: Slide; oncopy: () => void } = $props();
  const has = $derived(slideHasContent(answer));
</script>

<button
  class="small same"
  onclick={oncopy}
  disabled={!has}
  title={has ? 'Put a copy of the answer slide on this card, once: changing the answer afterwards doesn’t change the card' : 'The answer slide is empty'}
  >⧉ Same as the answer</button
>

<style>
  /* In the empty box's bottom corner (the box's words start top left): gone once there's anything on the card. */
  .same {
    position: absolute;
    right: 6px;
    bottom: 6px;
  }
</style>
