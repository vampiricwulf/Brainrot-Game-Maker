<!--
  Weighted prize wheel, or several spun together (side by side, each landing on its own slice). Rotation is computed
  from the spin's timestamps so every window agrees.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Overlay } from '../../lib/live';
  import type { Game } from '../../lib/model';
  import type { MediaRole } from '../../lib/mediactl.svelte';
  import { textOn } from '../../lib/colors';
  import OutcomeCard from './OutcomeCard.svelte';
  import WheelDisc from './WheelDisc.svelte';

  let { o, game, role }: { o: Extract<Overlay, { kind: 'wheel' }>; game: Game; role: MediaRole } = $props();

  let now = $state(Date.now());
  onMount(() => {
    let raf = 0;
    const tick = () => {
      now = Date.now();
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  });

  const wheels = $derived([{ key: 'main', ...o }, ...(o.extra ?? [])]);
  const many = $derived(wheels.length > 1);
  const landedAt = (w: { spin: { startedAt: number; duration: number } | null; result: number | null }) =>
    !!w.spin && w.result !== null && now >= w.spin.startedAt + w.spin.duration + 250;
  const landed = $derived(landedAt(o));
  const seg = $derived(o.result !== null ? o.segments[o.result] : undefined);
  // Several wheels share the width; up to 3 in a row, then two rows.
  const perRow = $derived(wheels.length <= 3 ? wheels.length : Math.ceil(wheels.length / 2));
  const rows = $derived(Math.ceil(wheels.length / perRow));
  // Fit the width (1800 after padding, 30 between wheels) and the height (each wheel plus its name and result).
  const size = $derived(Math.min(940, Math.floor((1800 - 30 * (perRow - 1)) / perRow), Math.floor(1040 / rows / 1.26)));
</script>

{#if !many}
  <div class="wrap">
    <div class="title">{o.name}</div>
    <div class="disc single"><WheelDisc segments={o.segments} rotation={o.rotation} spin={o.spin} {now} players={!!o.players} /></div>
    {#if !o.spin}<div class="hint">Get ready to spin…</div>{/if}
    {#if landed && seg}
      <div class="reveal"><OutcomeCard outcome={seg} {game} {role} color={seg.color} /></div>
    {/if}
  </div>
{:else}
  <div class="wrap many" style:--size="{size}px">
    {#each wheels as w (w.key)}
      {@const s = w.result !== null ? w.segments[w.result] : undefined}
      <div class="cell">
        <div class="name">{w.name}</div>
        <div class="disc"><WheelDisc segments={w.segments} rotation={w.rotation} spin={w.spin} {now} players={!!w.players} /></div>
        <div class="res">
          {#if s && landedAt(w)}
            <span class="chip" style:background={s.color} style:color={textOn(s.color)}>{s.label}</span>
          {/if}
        </div>
      </div>
    {/each}
    {#if !o.spin}<div class="hint">Get ready to spin…</div>{/if}
  </div>
{/if}

<style>
  .wrap {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .title {
    position: absolute;
    top: 30px;
    left: 40px;
    max-width: 440px;
    font-family: var(--value-font);
    font-size: 64px;
    line-height: 1.05;
    font-weight: 900;
    color: var(--value);
    text-shadow: 5px 5px 0 #000;
  }
  .disc.single {
    width: 940px;
    height: 1000px;
    margin-top: 40px;
  }
  .many {
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
    align-content: center;
    gap: 10px 30px;
    padding: 20px 60px;
  }
  .cell {
    width: var(--size);
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .cell .disc {
    width: var(--size);
    height: calc(var(--size) * 1000 / 940);
  }
  .name {
    font-family: var(--value-font);
    font-size: calc(var(--size) / 12);
    font-weight: 900;
    color: var(--value);
    text-shadow: 4px 4px 0 #000;
    text-align: center;
    line-height: 1.05;
  }
  .res {
    min-height: calc(var(--size) / 9);
  }
  .chip {
    display: inline-block;
    padding: 4px 22px;
    border-radius: 14px;
    border: 4px solid #000;
    font-family: var(--board-font);
    font-size: calc(var(--size) / 13);
    font-weight: 900;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.5);
  }
  .hint {
    position: absolute;
    bottom: 40px;
    font-size: 48px;
    color: #fff;
    font-family: var(--board-font);
  }
  .reveal {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.35);
  }
</style>
