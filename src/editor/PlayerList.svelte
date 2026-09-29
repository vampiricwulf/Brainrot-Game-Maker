<!-- Editable player roster with enforced unique colors. Used in Setup and in the pre-game screen. -->
<script lang="ts">
  import { isColorTaken, nextFreeColor, textOn } from '../lib/colors';
  import { newId } from '../lib/model';
  import { toast } from '../lib/app.svelte';

  interface P {
    id: string;
    name: string;
    color: string;
    startScore?: number;
  }
  let { players = $bindable(), max = 8, showScores = false }: { players: P[]; max?: number; showScores?: boolean } = $props();

  function add(): void {
    if (players.length >= max) return;
    const color = nextFreeColor(players.map((p) => p.color));
    const p: P = { id: newId(), name: `Player ${players.length + 1}`, color };
    if (showScores) p.startScore = 0;
    players.push(p);
  }

  function setColor(p: P, color: string, input: HTMLInputElement): void {
    const others = players.filter((o) => o.id !== p.id).map((o) => o.color);
    if (isColorTaken(color, others)) {
      toast('Another player already has that color');
      input.value = p.color;
      return;
    }
    p.color = color;
  }

  function move(i: number, d: number): void {
    const j = i + d;
    if (j < 0 || j >= players.length) return;
    [players[i], players[j]] = [players[j], players[i]];
  }
</script>

<div class="players">
  {#each players as p, i (p.id)}
    <div class="player">
      <span class="num muted">{i + 1}</span>
      <input
        type="color"
        value={p.color}
        onchange={(e) => setColor(p, e.currentTarget.value, e.currentTarget)}
        aria-label="Color for {p.name}"
      />
      <input class="name" bind:value={p.name} aria-label="Player {i + 1} name" style:border-color={p.color} />
      <span class="chip" style:background={p.color} style:color={textOn(p.color)}>{p.name || '—'}</span>
      {#if showScores}
        <label class="field score">Start score<input type="number" bind:value={p.startScore} /></label>
      {/if}
      <button class="ghost small" onclick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">▲</button>
      <button class="ghost small" onclick={() => move(i, 1)} disabled={i === players.length - 1} aria-label="Move down">▼</button>
      <button class="ghost small" onclick={() => players.splice(i, 1)} aria-label="Remove {p.name}">✕</button>
    </div>
  {/each}
  <div class="row">
    <button onclick={add} disabled={players.length >= max}>＋ Add player</button>
    <span class="muted">{players.length}/{max} players · each color must be unique</span>
  </div>
</div>

<style>
  .players {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .player {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .num {
    width: 16px;
    text-align: right;
  }
  .name {
    width: 200px;
    border-left-width: 6px;
  }
  .chip {
    padding: 3px 10px;
    border-radius: 999px;
    font-weight: 700;
    font-size: 12px;
    min-width: 60px;
    text-align: center;
  }
  .score {
    flex-direction: row;
    align-items: center;
  }
  .score input {
    width: 90px;
  }
</style>
