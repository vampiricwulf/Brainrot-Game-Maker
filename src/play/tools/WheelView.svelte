<!-- Weighted prize wheel. Rotation is computed from the spin's timestamps so every window agrees. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Overlay } from '../../lib/live';
  import type { Game } from '../../lib/model';
  import type { MediaRole } from '../../lib/mediactl.svelte';
  import { easeOut, segmentAngles } from '../../lib/tools';
  import { textOn } from '../../lib/colors';
  import OutcomeCard from './OutcomeCard.svelte';

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

  const R = 440;
  const angles = $derived(segmentAngles(o.segments));
  const rot = $derived.by(() => {
    if (!o.spin) return o.rotation;
    const t = (now - o.spin.startedAt) / o.spin.duration;
    return o.spin.from + (o.spin.to - o.spin.from) * easeOut(t);
  });
  const landed = $derived(!!o.spin && now >= o.spin.startedAt + o.spin.duration + 250 && o.result !== null);
  const seg = $derived(o.result !== null ? o.segments[o.result] : undefined);

  function pt(deg: number, r = R): [number, number] {
    const a = ((deg - 90) * Math.PI) / 180;
    return [r * Math.cos(a), r * Math.sin(a)];
  }
  function path(start: number, end: number): string {
    if (end - start >= 359.99) return `M 0 ${-R} A ${R} ${R} 0 1 1 0 ${R} A ${R} ${R} 0 1 1 0 ${-R} Z`;
    const [x1, y1] = pt(start);
    const [x2, y2] = pt(end);
    return `M 0 0 L ${x1} ${y1} A ${R} ${R} 0 ${end - start > 180 ? 1 : 0} 1 ${x2} ${y2} Z`;
  }
  const fontFor = (span: number, label: string) => Math.max(18, Math.min(56, span * 1.6, 900 / Math.max(4, label.length)));
</script>

<div class="wrap">
  <div class="title">{o.name}</div>
  <svg viewBox="-470 -500 940 1000" class="wheel">
    <g transform="rotate({rot})">
      {#each o.segments as s, i (s.id)}
        {@const a = angles[i]}
        {@const mid = (a.start + a.end) / 2}
        <path d={path(a.start, a.end)} fill={s.color} stroke="#000" stroke-width="3" />
        <g transform="rotate({mid})">
          <text
            x="0"
            y={-R * 0.58}
            fill={textOn(s.color)}
            font-size={fontFor(a.end - a.start, s.label)}
            text-anchor="middle"
            dominant-baseline="middle"
            transform="rotate(-90 0 {-R * 0.58})"
          >{s.label.length > 22 ? s.label.slice(0, 21) + '…' : s.label}</text>
        </g>
      {/each}
      <circle r="60" fill="#111" stroke="#ffcc00" stroke-width="8" />
    </g>
    <circle r={R} fill="none" stroke="#ffcc00" stroke-width="10" />
    <polygon points="-34,-488 34,-488 0,-410" fill="#fff" stroke="#000" stroke-width="5" />
  </svg>
  {#if !o.spin}<div class="hint">Get ready to spin…</div>{/if}
  {#if landed && seg}
    <div class="reveal"><OutcomeCard outcome={seg} {game} {role} color={seg.color} /></div>
  {/if}
</div>

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
    color: #ffcc00;
    text-shadow: 5px 5px 0 #000;
  }
  .wheel {
    width: 940px;
    height: 1000px;
    margin-top: 40px;
    font-family: var(--board-font);
    font-weight: 800;
    filter: drop-shadow(0 20px 40px rgba(0, 0, 0, 0.6));
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
