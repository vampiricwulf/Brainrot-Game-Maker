<!-- Editable player roster with enforced unique colors. Used in Setup, the pre-game screen and the in-game Players dialog. -->
<script lang="ts">
  import { isColorTaken, nextFreeColor, textOn } from '../lib/colors';
  import { newId } from '../lib/model';
  import { toast } from '../lib/app.svelte';
  import Avatar from '../lib/rpg/Avatar.svelte';
  import MediaPicker from './slide/MediaPicker.svelte';

  interface P {
    id: string;
    name: string;
    color: string;
    startScore?: number;
    avatar?: string;
  }
  let {
    players = $bindable(),
    max = 8,
    showScores = false,
    inGame = false,
    onremove,
    avatars = false,
  }: {
    players: P[];
    max?: number;
    showScores?: boolean;
    /** In a running game: row numbers are the scoring keys, so say that reordering changes them. */
    inGame?: boolean;
    /** Replaces the plain removal (e.g. to ask first and keep the player restorable mid-game). */
    onremove?: (id: string) => void;
    /** Offer a picture per player (RPG avatars, player sheets). */
    avatars?: boolean;
  } = $props();
  /** The player whose avatar picker is open. */
  let picking = $state<string | null>(null);

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
      {#if avatars}
        <div class="pop">
          <button class="ghost av-btn" onclick={() => (picking = p.id)} aria-label="Picture for {p.name}" title="Avatar picture (RPG rounds, player sheets)">
            <Avatar player={p} size={30} />
          </button>
          {#if picking === p.id}
            <MediaPicker kind="image" onpick={(id) => ((p.avatar = id), (picking = null))} onclose={() => (picking = null)} />
          {/if}
        </div>
        {#if p.avatar}<button class="ghost small" onclick={() => (p.avatar = undefined)} aria-label="Remove {p.name}'s picture" title="Use the colored token">✕🖼</button>{/if}
      {/if}
      <input class="name" bind:value={p.name} aria-label="Player {i + 1} name" style:border-color={p.color} />
      <span class="chip" style:background={p.color} style:color={textOn(p.color)}>{p.name || '—'}</span>
      {#if showScores}
        <label class="field score">Start score<input type="number" bind:value={p.startScore} /></label>
      {/if}
      <button class="ghost small" onclick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">▲</button>
      <button class="ghost small" onclick={() => move(i, 1)} disabled={i === players.length - 1} aria-label="Move down">▼</button>
      <button class="ghost small" onclick={() => (onremove ? onremove(p.id) : players.splice(i, 1))} aria-label="Remove {p.name}">✕</button>
    </div>
  {/each}
  <div class="row">
    <button onclick={add} disabled={players.length >= max}>＋ Add player</button>
    <span class="muted">
      {players.length}/{max} players · each color must be unique{inGame ? ' · reordering changes the number keys (1–9)' : ''}
    </span>
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
  .pop {
    position: relative;
  }
  .av-btn {
    padding: 0;
    border-radius: 50%;
    line-height: 0;
  }
</style>
