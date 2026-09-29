<!-- One die showing a number or custom face label. -->
<script lang="ts">
  import { textOn } from '../../lib/colors';
  let { value, sides, color = '#ffffff', rolling = false, size = 200 }: { value: string; sides: number; color?: string; rolling?: boolean; size?: number } =
    $props();
  const shape = $derived(sides === 4 ? 'tri' : sides === 6 ? 'sq' : sides === 8 || sides === 10 ? 'dia' : sides === 12 ? 'pent' : sides === 20 ? 'hex' : 'sq');
</script>

<div
  class="die {shape}"
  class:rolling
  style:--c={color}
  style:--t={textOn(color)}
  style:width="{size}px"
  style:height="{size}px"
  style:font-size="{Math.max(24, Math.min(size * 0.45, (size * 1.7) / Math.max(1, value.length)))}px"
>
  <span>{value}</span>
  <small>d{sides}</small>
</div>

<style>
  .die {
    position: relative;
    display: grid;
    place-items: center;
    background: var(--c);
    color: var(--t);
    font-family: var(--value-font);
    font-weight: 900;
    border-radius: 18%;
    box-shadow: inset 0 -12px 0 rgba(0, 0, 0, 0.25), 0 16px 30px rgba(0, 0, 0, 0.5);
    border: 5px solid rgba(0, 0, 0, 0.6);
  }
  .die span {
    line-height: 1;
    text-align: center;
    padding: 0 6px;
    word-break: break-word;
  }
  small {
    position: absolute;
    bottom: 6%;
    font-size: 22px;
    opacity: 0.6;
  }
  .tri {
    clip-path: polygon(50% 2%, 98% 94%, 2% 94%);
    border-radius: 0;
    padding-top: 22%;
  }
  .dia {
    clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
    border-radius: 0;
  }
  .pent {
    clip-path: polygon(50% 0, 100% 38%, 82% 100%, 18% 100%, 0 38%);
    border-radius: 0;
  }
  .hex {
    clip-path: polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0 50%);
    border-radius: 0;
  }
  .rolling {
    animation: tumble 0.25s linear infinite;
  }
  @keyframes tumble {
    0% {
      rotate: -12deg;
      translate: 0 -10px;
    }
    50% {
      rotate: 12deg;
      translate: 0 8px;
    }
    100% {
      rotate: -12deg;
      translate: 0 -10px;
    }
  }
</style>
