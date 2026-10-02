<!--
  ✎ Edit board, in the host panel: what's picked on the stage (a space: its name, color, secret, buttons, Start,
  connections; a link: its direction) and the edits that need no click on the board (＋ Space, 💾 Keep in game).
  The changes are made to the game being played: they last for this game only, unless the host keeps them.
-->
<script lang="ts">
  import { app } from '../../lib/app.svelte';
  import { spaceById } from '../../lib/boardgame';
  import type { BoardGameRound, BoardGameState, Game, Session } from '../../lib/model';
  import BoardSpaceButtons from './BoardSpaceButtons.svelte';
  import { boardEdit, editBothWays, editConnect, editDelete, editDisconnect, editKeep, editReverse, editSpace, editStart } from './boardedit.svelte';

  let { game, session, round, bs, dual }: { game: Game; session: Session; round: BoardGameRound; bs: BoardGameState; dual: boolean } = $props();

  const sel = $derived(spaceById(round, boardEdit.sel ?? undefined));
  const link = $derived.by(() => {
    const l = boardEdit.link;
    const a = l && spaceById(round, l.from);
    const b = l && spaceById(round, l.to);
    return l && a && b ? { l, a, b, both: b.next.includes(a.id) } : null;
  });
  /** Ways into the picked space (the ones that aren't also ways out of it). */
  const into = $derived(sel ? round.spaces.filter((s) => s.next.includes(sel.id) && !sel.next.includes(s.id)) : []);
  const isStart = $derived(!!sel && (round.start ?? round.spaces[0]?.id) === sel.id);
  const here = $derived(sel ? session.players.filter((p) => bs.positions[p.id]?.space === sel.id) : []);
  let buttonsFor = $state<string | null>(null);
  const name = (id: string) => spaceById(round, id)?.name ?? '?';
</script>

<div class="be" data-board-editing>
  <div class="row note">
    <b>✎ Editing the board</b>
    <span class="muted small">
      {dual ? 'Viewers see the changes as you make them (not the dashed marks).' : 'Viewers see this: the board changes as you edit it, with its dashed marks.'}
      The changes last for this game only, unless you press 💾 Keep in game. Each one is a step: Ctrl+Z takes it back.
    </span>
  </div>
  {#if bs.zoneShown}
    <div class="row">
      <span class="warn small">📺 A zone is on screen: put the board back on screen to edit it.</span>
      <button class="small" onclick={() => (bs.zoneShown = null)}>📺 The board</button>
    </div>
  {/if}
  <div class="row">
    <button class="small" class:on={boardEdit.adding} aria-pressed={boardEdit.adding} onclick={() => (boardEdit.adding = !boardEdit.adding)} title="Then click the board where it goes">＋ Space</button>
    <span class="spacer"></span>
    <!-- (An exported player-only file has no editor to keep it in.) -->
    {#if !app.playerOnly}
      <button class="small" onclick={() => editKeep(game, session)} title="Copy this board as it is now (its spaces, links and buttons) into the game in the editor, so it's there next time">
        💾 Keep in game
      </button>
    {/if}
  </div>

  <div class="row">
    <span class="muted small">
      {#if boardEdit.adding}
        Click the board where the new space goes{sel ? ` (after ${sel.name})` : ''}…
      {:else if boardEdit.connecting && sel}
        Click the space {sel.name} should lead to…
      {:else}
        Click a space or a link to pick it · drag a space to move it · Shift+click a space to connect the picked one to it · Ctrl+click or double-click the board to add one · right-click for more
      {/if}
    </span>
  </div>

  {#if sel}
    {@const s = sel}
    <div class="row pick" data-edit-space={s.id}>
      <label class="small">
        Name
        <input
          class="nm"
          value={s.name}
          data-edit-name
          aria-label="Space name"
          onchange={(e) => {
            const v = e.currentTarget.value.trim();
            if (v && v !== s.name) editSpace(game, session, s.id, `Renamed space “${s.name}” to “${v}”`, (x) => (x.name = v));
            else e.currentTarget.value = s.name;
          }}
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
          }}
        />
      </label>
      <label class="small">
        Color
        <input type="color" value={s.color} aria-label="Space color" onchange={(e) => editSpace(game, session, s.id, `Color of “${s.name}”`, (x) => (x.color = e.currentTarget.value))} />
      </label>
      <label class="check small">
        <input
          type="checkbox"
          checked={!!s.secret}
          onchange={(e) => {
            const on = e.currentTarget.checked;
            editSpace(game, session, s.id, `${on ? 'Secret' : 'Not secret'}: “${s.name}”`, (x) => (x.secret = on || undefined));
          }}
        />
        Secret
      </label>
      <button class="small" onclick={() => (buttonsFor = s.id)} title="What it does when passed or landed on, and its host notes">⚙ Buttons ({(s.onPass?.length ?? 0) + (s.onLand?.length ?? 0)})…</button>
      <button class="small" disabled={isStart} onclick={() => editStart(game, session, s.id)}>🏁 Make it Start</button>
      <span class="spacer"></span>
      <button class="ghost small danger" onclick={() => editDelete(game, session, s.id)} title="Delete (Ctrl+Z brings it back){here.length ? `: ${here.map((p) => p.name).join(', ')} move to the space before it` : ''}">🗑 Delete space</button>
    </div>
    <div class="row">
      <span class="muted small">Leads to:</span>
      {#each s.next as n (n)}
        <span class="chip">
          {spaceById(round, n)?.next.includes(s.id) ? '↔' : '→'} {name(n)}
          <button class="ghost tiny" onclick={() => editDisconnect(game, session, { from: s.id, to: n })} aria-label="Disconnect {s.name} from {name(n)}" title="Disconnect">✂</button>
        </span>
      {:else}
        <span class="muted small">nothing (the path ends)</span>
      {/each}
      {#if into.length}
        <span class="muted small">· From:</span>
        {#each into as f (f.id)}
          <span class="chip">
            ← {f.name}
            <button class="ghost tiny" onclick={() => editDisconnect(game, session, { from: f.id, to: s.id })} aria-label="Disconnect {f.name} from {s.name}" title="Disconnect">✂</button>
          </span>
        {/each}
      {/if}
      <button class="small" class:on={boardEdit.connecting} aria-pressed={boardEdit.connecting} onclick={() => (boardEdit.connecting = !boardEdit.connecting)} title="Then click the space it should lead to (or Shift+click it on the stage)">🔗 Connect to…</button>
      <select
        class="small"
        aria-label="Connect {s.name} to"
        onchange={(e) => {
          const v = e.currentTarget.value;
          e.currentTarget.value = '';
          e.currentTarget.blur();
          if (v) editConnect(game, session, s.id, v);
        }}
      >
        <option value="">→ Connect to a space…</option>
        {#each round.spaces.filter((x) => x.id !== s.id && !s.next.includes(x.id)) as x (x.id)}<option value={x.id}>{x.name}</option>{/each}
      </select>
    </div>
  {:else if link}
    {@const k = link}
    <div class="row pick" data-edit-link>
      <b class="small">{k.a.name} {k.both ? '↔' : '→'} {k.b.name}</b>
      <button class="small" onclick={() => editBothWays(game, session, k.l)}>{k.both ? '→ One way only' : '⇄ Both ways'}</button>
      <button class="small" disabled={k.both} onclick={() => editReverse(game, session, k.l)}>↺ Reverse</button>
      <span class="spacer"></span>
      <button class="ghost small danger" onclick={() => editDisconnect(game, session, k.l)} title="Delete">✂ Disconnect</button>
    </div>
  {/if}
</div>

{#if buttonsFor}
  {@const s = spaceById(round, buttonsFor)}
  {#if s}
    <BoardSpaceButtons {round} space={s} onclose={() => (buttonsFor = null)} />
  {/if}
{/if}

<style>
  .be {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px 8px;
    border: 1px dashed var(--accent);
    border-radius: 8px;
  }
  .row {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }
  .note {
    gap: 8px;
  }
  .nm {
    width: 140px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 0 2px 0 6px;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 12px;
  }
  .small {
    font-size: 12px;
  }
  .tiny {
    font-size: 12px;
    padding: 0 4px;
  }
  select.small {
    padding: 2px 6px;
  }
  button.on {
    outline: 2px solid var(--accent);
  }
  .warn {
    color: var(--warn);
  }
</style>
