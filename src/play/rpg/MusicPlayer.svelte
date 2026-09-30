<!--
  Looping background music for RPG screens. A new track cross-fades in over the old one; the same track keeps
  playing without restarting when the party moves between screens that share it.
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { applySink } from '../../lib/audioout.svelte';

  let { src, volume = 0.6 }: { src: string | undefined; volume?: number } = $props();
  const FADE_MS = 900;
  const players: HTMLAudioElement[] = [];
  let current: HTMLAudioElement | null = null;

  function fade(el: HTMLAudioElement, to: number, done?: () => void): void {
    const from = el.volume;
    const start = performance.now();
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / FADE_MS);
      el.volume = Math.max(0, Math.min(1, from + (to - from) * t));
      if (t < 1) requestAnimationFrame(step);
      else done?.();
    };
    requestAnimationFrame(step);
  }

  $effect(() => {
    const url = src;
    if (current && current.dataset.src === (url ?? '')) return;
    const old = current;
    if (old) fade(old, 0, () => {
      old.pause();
      players.splice(players.indexOf(old), 1);
    });
    current = null;
    if (!url) return;
    const el = new Audio();
    el.loop = true;
    el.volume = 0;
    el.src = url;
    el.dataset.src = url;
    players.push(el);
    current = el;
    void applySink(el).then(() => el.play().catch(() => {}));
    fade(el, volume);
  });

  onDestroy(() => {
    for (const p of players) p.pause();
  });
</script>
