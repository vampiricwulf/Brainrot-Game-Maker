<!--
  A number field for the Inspector. It never saves an empty or broken value: while typing, only numbers in range
  count at once; leaving the field keeps the last good value (or pulls the number into range) and shows that.
-->
<script lang="ts">
  import { liveNumber, numberFieldValue } from '../../lib/numfield';

  let {
    value = $bindable(),
    min,
    max,
    step,
    fallback = 0,
    label,
  }: {
    value: number;
    min?: number;
    max?: number;
    step?: number | string;
    /** Used when the value it started with isn't a number either. */
    fallback?: number;
    label?: string;
  } = $props();
</script>

<input
  type="number"
  {min}
  {max}
  {step}
  aria-label={label}
  value={typeof value === 'number' && Number.isFinite(value) ? value : ''}
  oninput={(e) => {
    const n = liveNumber(e.currentTarget.value, min, max);
    if (n !== null && n !== value) value = n;
  }}
  onchange={(e) => {
    const n = numberFieldValue(e.currentTarget.value, value, min, max, fallback);
    if (n !== value) value = n;
    e.currentTarget.value = String(n);
  }}
/>

<style>
  input {
    width: 100%;
    min-width: 0;
  }
</style>
