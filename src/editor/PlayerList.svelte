<!--
  Editable player roster with enforced unique colors. Used in Setup, the pre-game screen and the in-game Players
  dialog. Rows reorder by dragging their ⋮⋮ grip, with ▲▼ or Alt+↑/↓; Enter in a name adds the next player.
-->
<script lang="ts">
  import { isColorTaken, nextFreeColor, textOn } from '../lib/colors';
  import { tick } from 'svelte';
  import { DragOrder, rowKeys } from '../lib/dragorder.svelte';
  import { newId } from '../lib/model';
  import { toast } from '../lib/app.svelte';
  import Avatar from '../lib/rpg/Avatar.svelte';
  import MediaPicker from './slide/MediaPicker.svelte';
  import { mediaDrop } from '../lib/mediadrop';

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
    record = (_label, fn) => fn(),
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
    /** Makes a change one named step (the editor's undo history). */
    record?: (label: string, fn: () => void) => void;
  } = $props();
  let list = $state<HTMLElement>();
  /** The player whose avatar picker is open. */
  let picking = $state<string | null>(null);

  function add(): P | undefined {
    if (players.length >= max) return;
    const color = nextFreeColor(players.map((p) => p.color));
    const p: P = { id: newId(), name: `Player ${players.length + 1}`, color };
    if (showScores) p.startScore = 0;
    players.push(p);
    return p;
  }

  /** Enter in a name: the next player, typing in their name (keyboard-first roster entry). */
  function nameKey(e: KeyboardEvent): void {
    if (e.key !== 'Enter' || e.isComposing || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    if (players.length >= max) return void toast(`${max} players at most`);
    const p = add();
    if (p) void tick().then(() => list?.querySelector<HTMLInputElement>(`[data-place="player:${p.id}"] input.name`)?.select());
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

  /** Move a player `d` places up (−) or down the list (the others close up). */
  function move(i: number, d: number): void {
    const j = i + d;
    if (!d || j < 0 || j >= players.length) return;
    const p = players[i];
    record(`Moved player “${p.name}” ${d < 0 ? 'up' : 'down'}`, () => {
      players.splice(i, 1);
      players.splice(j, 0, p);
    });
  }

  const rows = new DragOrder();
</script>

<div class="players" role="list" aria-label="Players" bind:this={list}>
  {#each players as p, i (p.id)}
    {@const line = rows.lineAt(p.id)}
    <div
      class="player"
      data-place="player:{p.id}"
      class:drop-before={line === 'before'}
      class:drop-after={line === 'after'}
      class:dragging={rows.dragging === p.id}
      role="listitem"
      ondragover={(e) => rows.over(e, p.id)}
      ondrop={(e) => {
        const m = rows.drop(e, players.map((x) => x.id));
        if (m) move(m.from, m.to - m.from);
      }}
      use:rowKeys={{ move: (d) => move(i, d) }}
    >
      <!-- Only the grip drags (dragging over a name box selects its text). -->
      <span
        class="grip"
        draggable="true"
        ondragstart={(e) => rows.start(e, p.id, (e.currentTarget as HTMLElement).parentElement)}
        ondragend={() => rows.end()}
        aria-hidden="true"
        title="Drag to reorder (or Alt+↑/↓){inGame ? ' (the number keys follow the order)' : ''}">⋮⋮</span
      >
      <span class="num muted">{i + 1}</span>
      <input
        type="color"
        value={p.color}
        onchange={(e) => setColor(p, e.currentTarget.value, e.currentTarget)}
        aria-label="Color for {p.name}"
      />
      {#if avatars}
        <div class="pop">
          <button
            class="ghost av-btn"
            onclick={() => (picking = p.id)}
            use:mediaDrop={{ kind: 'image', onpick: (id) => (p.avatar = id) }}
            aria-label="Picture for {p.name}"
            title="Avatar picture (RPG rounds, player sheets): click, or drop a picture here"
          >
            <Avatar player={p} size={30} />
          </button>
          {#if picking === p.id}
            <MediaPicker kind="image" onpick={(id) => ((p.avatar = id), (picking = null))} onclose={() => (picking = null)} />
          {/if}
        </div>
        {#if p.avatar}<button class="ghost small" onclick={() => (p.avatar = undefined)} aria-label="Remove {p.name}'s picture" title="Use the colored token">✕🖼</button>{/if}
      {/if}
      <input class="name" bind:value={p.name} aria-label="Player {i + 1} name" style:border-color={p.color} onkeydown={nameKey} />
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
    position: relative;
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .player.dragging {
    opacity: 0.5;
  }
  /* Where a dragged row goes. */
  .player.drop-before::before,
  .player.drop-after::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--accent);
  }
  .player.drop-before::before {
    top: -5px;
  }
  .player.drop-after::after {
    bottom: -5px;
  }
  .grip {
    cursor: grab;
    color: var(--muted);
    font-size: 12px;
    letter-spacing: -2px;
    user-select: none;
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
