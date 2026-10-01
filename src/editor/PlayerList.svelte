<!--
  Editable player roster with enforced unique colors. Used on the pre-game screen (the game's players) and in the in-game Players
  dialog. Rows reorder by dragging their ⋮⋮ grip, with ▲▼ or Alt+↑/↓; ＋ Add player and Enter in a name add the next
  player, typing in their name. Before the game a row has a right-click menu (in play, the host's own player menu is the one).
-->
<script lang="ts">
  import { isColorTaken, nextFreeColor, textOn } from '../lib/colors';
  import { tick } from 'svelte';
  import { DragOrder, rowKeys } from '../lib/dragorder.svelte';
  import { newId } from '../lib/model';
  import { toast } from '../lib/app.svelte';
  import { showMenu } from '../lib/menustate.svelte';
  import { isTextField } from '../lib/undokeys';
  import { commit, joinTyping } from '../lib/history.svelte';
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
    rowMenu = false,
    onraise,
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
    /** Right-click a row for its menu (the pre-game screen). */
    rowMenu?: boolean;
    /** At the most players: raise ⚖ Game rules › Most players by one (left out when it can't go higher). */
    onraise?: () => void;
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

  /** Typing in a player's name (all of it selected). */
  async function editName(p: P): Promise<HTMLInputElement | undefined> {
    await tick();
    const box = list?.querySelector<HTMLInputElement>(`[data-place="player:${p.id}"] input.name`) ?? undefined;
    box?.select();
    return box;
  }

  /** ＋ Add player: the next player, typing in their name. */
  function addAndName(): void {
    // Before the game, the name typed so far is a step of its own in the editor's history, not part of this addition…
    if (!inGame) commit();
    const p = add();
    if (!p) return;
    void editName(p).then((box) => {
      // …and the name typed in the new player's box joins the addition ("Added player “Bo”").
      if (box && !inGame && document.activeElement === box) joinTyping(box);
    });
  }

  /** Enter in a name: the next player, typing in their name (keyboard-first roster entry). */
  function nameKey(e: KeyboardEvent): void {
    if (e.key !== 'Enter' || e.isComposing || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    if (players.length >= max) return void toast(`${max} players at most`);
    addAndName();
  }

  // In a running game a player is removed (their points can be restored); otherwise the roster's entry is deleted.
  const removeWord = $derived(inGame ? 'Remove' : 'Delete');
  /** A running game keeps at least one player (its turns, parties and scoreboard need someone). */
  const lastOne = $derived(inGame && players.length <= 1);
  /** Before the game (no undo history there): the player just deleted, for the note's Undo. */
  let undone = $state<{ p: P; at: number } | null>(null);
  function remove(p: P): void {
    if (lastOne) return void toast('The game needs at least one player: add another first');
    const at = players.indexOf(p);
    if (onremove) onremove(p.id);
    else {
      players.splice(at, 1);
      undone = { p: $state.snapshot(p), at };
    }
    // The focus goes on to the next row's delete button (or ＋ Add player), not to the page. (A removal that asks
    // first has put it on the question.)
    void tick().then(() => {
      if (document.activeElement && document.activeElement !== document.body) return;
      const dels = list?.querySelectorAll<HTMLButtonElement>('button.del');
      (dels?.[Math.min(at, dels.length - 1)] ?? list?.querySelector<HTMLButtonElement>('button.add'))?.focus();
    });
  }
  function undoRemove(): void {
    if (!undone || players.length >= max) return;
    players.splice(Math.min(undone.at, players.length), 0, undone.p);
    undone = null;
  }

  /** A row's right-click menu (not in its name box, which keeps the browser's own). */
  function menu(e: MouseEvent, p: P, i: number): void {
    if (!rowMenu || isTextField(e.target)) return;
    showMenu(e, [
      { heading: p.name || `Player ${i + 1}` },
      { label: '✎ Rename', onclick: () => void editName(p) },
      { label: '▲ Move up', onclick: () => move(i, -1), disabled: i === 0, keys: 'Alt+↑' },
      { label: '▼ Move down', onclick: () => move(i, 1), disabled: i === players.length - 1, keys: 'Alt+↓' },
      { sep: true },
      { label: `🗑 ${removeWord} player`, danger: true, onclick: () => remove(p) },
    ]);
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

<div class="players" bind:this={list}>
  {#if showScores && players.length}
    <!-- Column headings: a row like the others with only its headings showing, so they line up (and wrap) the same. -->
    <div class="cols" aria-hidden="true" inert>
      <span class="grip">⋮⋮</span>
      <span class="num"></span>
      <input type="color" tabindex="-1" />
      {#if avatars}<span class="av-btn"><Avatar player={players[0]} size={30} /></span>{/if}
      <span class="name"></span>
      <span class="chip"></span>
      <span class="score">Start score</span>
      <span class="btn">▲</span>
      <span class="btn">▼</span>
      <span class="btn">🗑</span>
    </div>
  {/if}
  <div class="rows" role="list" aria-label="Players">
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
      oncontextmenu={(e) => menu(e, p, i)}
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
          <!-- (On the picture's corner: the row keeps its shape with or without one.) -->
          {#if p.avatar}<button class="tiny unpic" onclick={() => (p.avatar = undefined)} aria-label="Remove {p.name}'s picture" title="Remove the picture (use the colored token)">✕</button>{/if}
          {#if picking === p.id}
            <MediaPicker kind="image" onpick={(id) => ((p.avatar = id), (picking = null))} onclose={() => (picking = null)} />
          {/if}
        </div>
      {/if}
      <input class="name" dir="auto" bind:value={p.name} aria-label="Player {i + 1} name" style:border-color={p.color} onkeydown={nameKey} />
      <span class="chip" dir="auto" style:background={p.color} style:color={textOn(p.color)}>{p.name || '—'}</span>
      {#if showScores}
        <input class="score" type="number" bind:value={p.startScore} aria-label="{p.name || `Player ${i + 1}`}'s start score" />
      {/if}
      <button class="ghost tiny" onclick={() => move(i, -1)} disabled={i === 0} aria-label="Move {p.name || `player ${i + 1}`} up">▲</button>
      <button class="ghost tiny" onclick={() => move(i, 1)} disabled={i === players.length - 1} aria-label="Move {p.name || `player ${i + 1}`} down">▼</button>
      <button
        class="ghost tiny del"
        class:danger={!inGame}
        onclick={() => remove(p)}
        disabled={lastOne}
        aria-label="{removeWord} {p.name}"
        title={lastOne ? 'The game needs at least one player: add another first' : `${removeWord} ${p.name}`}
      >{inGame ? '−' : '🗑'}</button>
    </div>
  {/each}
  </div>
  <div class="row">
    <button class="add" onclick={addAndName} disabled={players.length >= max}>＋ Add player</button>
    <span class="muted">
      {players.length}/{max} players · each color must be unique{inGame ? ' · reordering changes the number keys (1–9)' : ''}
    </span>
    {#if players.length >= max && onraise}
      <button class="small" onclick={onraise} title="⚖ Game rules › Most players">Raise Most players to {max + 1}</button>
    {/if}
  </div>
  {#if undone}
    <div class="undo-note" role="status">
      <span>Deleted <b>{undone.p.name}</b></span>
      <button class="small" onclick={undoRemove} disabled={players.length >= max}>↶ Undo</button>
      <button class="small ghost" onclick={() => (undone = null)} aria-label="Dismiss">✕</button>
    </div>
  {/if}
</div>

<style>
  .undo-note {
    display: flex;
    gap: 8px;
    align-items: center;
    align-self: flex-start;
    padding: 4px 6px 4px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--panel-2);
  }
  .players,
  .rows {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .player,
  .cols {
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
  /* Narrower when the row is short of room (the pre-game screen's column), so ▲ ▼ 🗑 stay on the row's line; up to
     200px when there's room. */
  .name {
    flex: 1 1 110px;
    min-width: 110px;
    max-width: 200px;
    border-left-width: 6px;
  }
  /* The same width on every row (a long name ends in "…"), so the rows line up and wrap at the same place. */
  .chip {
    box-sizing: border-box;
    flex: none;
    width: 110px;
    padding: 3px 10px;
    border-radius: 999px;
    font-weight: 700;
    font-size: 12px;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .unpic {
    position: absolute;
    top: -6px;
    right: -8px;
    min-width: 0;
    padding: 0 4px;
    border-radius: 999px;
    line-height: 1.3;
  }
  .score {
    /* Room for 7 digits and the spinner (12400 reads whole). */
    width: calc(8ch + 24px);
    flex: none;
  }
  /* The headings row: only its headings show (the rest keeps their room). */
  .cols {
    margin-bottom: -4px;
  }
  .cols > :not(.score) {
    visibility: hidden;
  }
  .cols input {
    height: 0;
    padding-block: 0;
    border-block-width: 0;
  }
  .cols .name {
    border: 1px solid transparent;
    border-left-width: 6px;
  }
  .cols .av-btn,
  .cols .chip,
  .cols .btn {
    height: 0;
    padding-block: 0;
    overflow: hidden;
  }
  /* As wide as the row's ▲ ▼ 🗑 (button.tiny). */
  .cols .btn {
    display: inline-block;
    min-width: 22px;
    padding-inline: 5px;
    border: 1px solid transparent;
    font-size: 12px;
  }
  .cols .av-btn {
    display: inline-block;
    border: 1px solid transparent;
  }
  .cols .score {
    color: var(--muted);
    font-size: 12px;
    padding-left: 2px;
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
