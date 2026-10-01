<!-- Lightweight canvas confetti for the winner screen. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { calmStream } from '../lib/motion.svelte';

  let { colors = ['#ffcc00', '#ffffff', '#e6194b', '#3cb44b', '#4363d8', '#f032e6'] }: { colors?: string[] } = $props();
  let canvas: HTMLCanvasElement;

  onMount(() => {
    const ctx = canvas.getContext('2d')!;
    const W = (canvas.width = 1920);
    const H = (canvas.height = 1080);
    const parts = Array.from({ length: 260 }, () => ({
      x: Math.random() * W,
      // Reduced motion: the confetti lies still all over the screen instead of falling.
      y: calmStream() ? Math.random() * H : -Math.random() * H,
      vx: (Math.random() - 0.5) * 4,
      vy: 3 + Math.random() * 5,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      w: 12 + Math.random() * 14,
      h: 6 + Math.random() * 10,
      c: colors[Math.floor(Math.random() * colors.length)],
    }));
    let raf = 0;
    const tick = () => {
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        if (p.y > H + 20) {
          p.y = -20;
          p.x = Math.random() * W;
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
        ctx.restore();
      }
      if (!calmStream()) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  });
</script>

<canvas bind:this={canvas}></canvas>

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
