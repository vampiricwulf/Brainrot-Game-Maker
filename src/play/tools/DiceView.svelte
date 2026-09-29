<!-- Dice roll: faces flicker, then settle on the precomputed result; custom faces and total outcomes are revealed. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Overlay } from '../../lib/live';
  import type { Game } from '../../lib/model';
  import type { MediaRole } from '../../lib/mediactl.svelte';
  import Die from './Die.svelte';
  import OutcomeCard from './OutcomeCard.svelte';

  let { o, game, role }: { o: Extract<Overlay, { kind: 'dice' }>; game: Game; role: MediaRole } = $props();
  let now = $state(Date.now());
  onMount(() => {
    const id = setInterval(() => (now = Date.now()), 70);
    return () => clearInterval(id);
  });
  // Before the roll, show one blank die per die in the preset.
  const pending = $derived(o.preset.dice.flatMap((d) => Array.from({ length: Math.max(1, d.count) }, () => ({ sides: d.sides }))));
  const rolling = $derived(!!o.roll && now < o.startedAt + o.duration);
  const count = $derived(o.roll?.dice.length ?? pending.length);
  const size = $derived(count > 6 ? 150 : count > 3 ? 190 : 240);
  const face = (i: number) => {
    if (!o.roll) return '?';
    const d = o.roll.dice[i];
    if (rolling) {
      // Deterministic flicker so both windows look alike.
      const v = 1 + ((Math.floor(now / 70) * 7919 + i * 104729) % d.sides);
      return d.face ? '?' : String(v);
    }
    return d.face?.label ?? String(d.value);
  };
  const faceOutcome = $derived(o.roll?.dice.find((d) => d.face && (d.face.details || d.face.media))?.face);
  const outcome = $derived(o.roll?.totalOutcome ?? faceOutcome);
</script>

<div class="wrap">
  <div class="title">{o.name}</div>
  <div class="dice">
    {#each o.roll?.dice ?? pending as d, i}
      <Die value={face(i)} sides={d.sides} {rolling} {size} />
    {/each}
  </div>
  {#if !o.roll}<div class="total small">Get ready to roll…</div>{/if}
  {#if o.roll && !rolling && o.roll.dice.length > 1 && o.roll.dice.every((d) => !d.face)}
    <div class="total">Total: {o.roll.total}</div>
  {/if}
  {#if !rolling && outcome}
    <div class="reveal"><OutcomeCard {outcome} {game} {role} /></div>
  {/if}
</div>

<style>
  .wrap {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 50px;
  }
  .title {
    position: absolute;
    top: 40px;
    font-family: var(--value-font);
    font-size: 64px;
    font-weight: 900;
    color: #ffcc00;
    text-shadow: 5px 5px 0 #000;
  }
  .dice {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 50px;
    max-width: 1700px;
  }
  .total {
    font-family: var(--value-font);
    font-size: 110px;
    font-weight: 900;
    color: #fff;
    text-shadow: 6px 6px 0 #000;
  }
  .total.small {
    font-size: 56px;
  }
  .reveal {
    position: absolute;
    bottom: 40px;
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
  }
  .reveal :global(.card) {
    max-height: 520px;
    padding: 24px 50px;
  }
  .reveal :global(.label) {
    font-size: 80px;
  }
</style>
