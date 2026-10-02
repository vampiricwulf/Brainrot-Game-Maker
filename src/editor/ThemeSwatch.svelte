<!-- A theme as a tiny board (category headers and two rows of tiles), for the theme picker. -->
<script lang="ts">
  import { headerBackground, lookNumber, lookVars, tileBackground, type Theme } from '../lib/theme';

  let { theme }: { theme: Theme } = $props();
  const vars = $derived(lookVars(theme));
  const gap = $derived(Math.max(1, Math.round(lookNumber(theme, 'tileGap') / 4)));
  const radius = $derived(Math.round(lookNumber(theme, 'tileRadius') / 6));
  const COLS = [0, 1, 2, 3];
</script>

<span class="sw" aria-hidden="true" style:background={vars['--board-bg']} style:gap="{gap}px" style:padding="{gap}px">
  {#each COLS as c}
    <span class="h" style:background={headerBackground(theme, c)} style:border-radius="{radius}px"></span>
  {/each}
  {#each [0, 1] as r}
    {#each COLS as c}
      <span
        class="t"
        style:background={tileBackground(theme, r, c)}
        style:color={theme.value}
        style:font-family={theme.valueFont}
        style:border-radius="{radius}px"
        style:box-shadow={theme.glow !== 'none' ? `0 0 4px ${theme.glow}` : undefined}>{(r + 1) * 2}</span
      >
    {/each}
  {/each}
</span>

<style>
  .sw {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    grid-template-rows: 0.8fr 1fr 1fr;
    height: 50px;
    border-radius: 4px;
    overflow: hidden;
  }
  .h,
  .t {
    min-width: 0;
    display: grid;
    place-items: center;
    font-size: 12px;
    line-height: 1;
    text-shadow: 1px 1px 0 #000;
  }
</style>
