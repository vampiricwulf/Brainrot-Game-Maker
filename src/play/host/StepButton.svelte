<!--
  A step button: a moment's own button, in its box, for a step the main button may do too (🎡 Spin for a partner beside
  the names), with the same words, key, tooltip and greyed state (one NextAction, given to both). Never the main one:
  never blue, never data-next, so the app and the tests still find the main button by its mark. Its clicks go through
  the panel's click guard (the rest of a double-click that redrew the box is dropped), and after a click the keys go
  back to the main button, so Enter, N, W and Shift+Enter keep their meanings.
-->
<script lang="ts">
  import { hint } from '../../lib/app.svelte';
  import { focusMain } from './focus';
  import { panelGuard, type NextAction } from './slots.svelte';

  let {
    step,
    final,
  }: {
    step: NextAction;
    /**
     * A step that can't be undone (cards sent to phones): a click within a second of the step before it waits, and this
     * says why ("The question just went up: click again to send the cards").
     */
    final?: string;
  } = $props();

  const guard = panelGuard();

  function click(e: MouseEvent): void {
    const v = guard.press(`step:${step.label}`, e.detail, { step: true, final: !!final });
    if (v === 'soon' && final) hint(final);
    if (v !== 'go') return;
    step.run();
    focusMain();
  }
</script>

<button data-step disabled={step.disabled} title={step.title ?? step.key} onclick={click}>
  {step.label}{#if step.key} <kbd aria-hidden="true">{step.key}</kbd>{/if}
</button>

<style>
  kbd {
    font: 11px/1 ui-monospace, monospace;
    padding: 1px 4px;
    margin-left: 4px;
    border: 1px solid currentColor;
    border-radius: 4px;
    opacity: 0.75;
  }
</style>
