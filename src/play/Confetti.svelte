<!--
  Canvas confetti for the winner screen: a short burst of big pieces either side of the standings, then it stops (see
  confetti.ts). With reduced motion on stream there's none at all.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { calmStream } from '../lib/motion.svelte';
  import { confettiAlpha, confettiRunning, confettiX, PIECES } from './confetti';

  let {
    colors = ['#ffcc00', '#ffffff', '#e6194b', '#3cb44b', '#4363d8', '#f032e6'],
    keepOut,
  }: {
    colors?: string[];
    /** A column (stage px across) the confetti never falls over: the standings. */
    keepOut?: { left: number; right: number };
  } = $props();
  let canvas: HTMLCanvasElement;

  onMount(() => {
    if (calmStream()) return;
    const ctx = canvas.getContext('2d')!;
    const W = (canvas.width = 1920);
    const H = (canvas.height = 1080);
    const parts = Array.from({ length: PIECES }, () => ({
      x: confettiX(Math.random(), W, keepOut),
      y: -Math.random() * H,
      vx: (Math.random() - 0.5) * 3,
      vy: 4 + Math.random() * 5,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.2,
      w: 26 + Math.random() * 16,
      h: 14 + Math.random() * 12,
      c: colors[Math.floor(Math.random() * colors.length)],
    }));
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const t = performance.now() - start;
      ctx.clearRect(0, 0, W, H);
      if (!confettiRunning(t, calmStream())) return;
      ctx.save();
      // Only either side of the standings.
      if (keepOut) {
        ctx.beginPath();
        ctx.rect(0, 0, keepOut.left, H);
        ctx.rect(keepOut.right, 0, W - keepOut.right, H);
        ctx.clip();
      }
      ctx.globalAlpha = confettiAlpha(t);
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        if (p.y > H + 40) {
          p.y = -40;
          p.x = confettiX(Math.random(), W, keepOut);
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
        ctx.restore();
      }
      ctx.restore();
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  });
</script>

<canvas bind:this={canvas} data-confetti></canvas>

<style>
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 5;
  }
</style>
