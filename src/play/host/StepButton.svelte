<!--
  A step button: a box's own action button (🎡 Spin for a partner beside the names, 📤 Send and start at the 🤝 box's
  foot), with its words, key, tooltip and greyed state in one NextAction. Never the main one: never blue, never
  data-next, so the app and the tests still find the main button by its mark. While it's the action due now (what the
  blue button's check would offer first) it wears the ring. Its clicks go through the panel's click guard (the rest of
  a double-click that redrew the box is dropped), the rest of its own double-click is dropped wherever it lands (its
  box can go with it: the Daily Double's once its question shows), and after a click the keys go back to the main
  button, so Enter, N, W and Shift+Enter keep their meanings.
-->
<script lang="ts">
  import { hint } from '../../lib/app.svelte';
  import { oneShot } from '../../lib/oneshot';
  import { focusMain } from './focus';
  import { panelGuard, type NextAction } from './slots.svelte';

  let { step, ring = false }: { step: NextAction; ring?: boolean } = $props();

  const guard = panelGuard();

  function click(e: MouseEvent): void {
    // (A step that can't be undone waits a second after the step before it, as on the main button: its `final` says why.)
    const v = guard.press(`step:${step.label}`, e.detail, { step: true, final: !!step.final, x: e.clientX, y: e.clientY });
    if (v === 'soon' && step.final) hint(step.final);
    if (v !== 'go') return;
    step.run();
    focusMain();
  }
</script>

<button data-step class:ring disabled={step.disabled} title={step.title ?? step.key} use:oneShot onclick={click}>
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
