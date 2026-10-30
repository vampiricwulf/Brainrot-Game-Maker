<!--
  ✎ Edit board, in the host panel: what's picked on the stage (a space: its name, color, secret, buttons, Start,
  connections; a link: its direction) and the edits that need no click on the board (＋ Space, 💾 Keep in game).
  The changes are made to the game being played: they last for this game only, unless the host keeps them. In one
  window (viewers see this panel) a secret space not revealed yet is “? (secret)” here, its name box behind 👁 Show.
-->
<script lang="ts">
  import { app } from '../../lib/app.svelte';
  import { applySpaceKind, nameShown, SPACE_KINDS, spaceById, spaceListNames, spaceSaid, unrevealed } from '../../lib/boardgame';
  import { numberStat } from '../../lib/rpgpresets';
  import type { BoardGameRound, BoardGameState, BoardSpace, Game, Session } from '../../lib/model';
  import BoardSpaceButtons from './BoardSpaceButtons.svelte';
  import ColorBox from '../../lib/ColorBox.svelte';
  import { boardEdit, editAllNames, editBothWays, editConnect, editDelete, editDisconnect, editKeep, editReverse, editShowName, editSpace, editStart } from './boardedit.svelte';

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
  /** One window: the panel is on stream, so a secret space not revealed yet is “? (secret)” in it. */
  const hide = $derived(!dual);
  const said = (s: BoardSpace | undefined) => spaceSaid(bs, s, hide);
  const name = (id: string) => said(spaceById(round, id));
  /** A secret space not revealed yet whose name would be on stream (one window). */
  const quiet = (s: BoardSpace) => hide && unrevealed(bs, s);
  /** The secret space whose name box shows its name (👁 Show): only that one, until another is picked. */
  let shownFor = $state<string | null>(null);
  const masked = $derived(!!sel && quiet(sel) && shownFor !== sel.id);
  /** The spaces' names in Connect to… (a name that repeats says where it is: “Bonus (after Space 6)”). */
  const listNames = $derived(spaceListNames(hide ? { ...round, spaces: round.spaces.map((x) => (unrevealed(bs, x) ? { ...x, name: '? (secret)' } : x)) } : round));
</script>

<div class="be" data-board-editing>
  <div class="row note">
    <b>✎ Editing the board</b>
    <span class="muted small">
      {dual ? 'Viewers see the changes as you make them (not the dashed marks).' : 'Viewers see this: the board changes as you edit it, with its dashed marks.'}
      {dual ? 'Hidden names show dimmed, here only.' : 'Hidden names show dimmed while you edit (on the stage too), and go again when you’re done.'}
      The changes last for this game only{app.playerOnly ? '' : ', unless you press 💾 Keep in game'}. Each one is a step: Ctrl+Z takes it back.
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
    <span class="muted small">Names:</span>
    <button class="small" data-names-all="show" disabled={round.spaces.every(nameShown)} onclick={() => editAllNames(game, session, true)} title="Viewers see every space's name">
      Show all
    </button>
    <button class="small" data-names-all="hide" disabled={!round.spaces.some(nameShown)} onclick={() => editAllNames(game, session, false)} title="Viewers see no space's name">
      Hide all
    </button>
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
        Click the board where the new space goes{sel ? ` (after ${said(sel)})` : ''}…
      {:else if boardEdit.connecting && sel}
        Click the space {said(sel)} should lead to…
      {:else}
        Click a space or a link to pick it · drag a space to move it · Shift+click a space to connect the picked one to it · Ctrl+click or double-click the board to add one · right-click for more
      {/if}
    </span>
  </div>

  <!-- (A pick's row comes into view as it's picked: in one window under the stage this part scrolls, the note above it.) -->
  {#if sel}
    {@const s = sel}
    <div class="row pick" data-edit-space={s.id} {@attach (el) => (void boardEdit.sel, el.scrollIntoView({ block: 'nearest' }))}>
      <label class="small">
        Name
        <input
          class="nm"
          value={s.name}
          data-edit-name
          aria-label="Space name"
          style:-webkit-text-security={masked ? 'disc' : undefined}
          onchange={(e) => {
            const v = e.currentTarget.value.trim();
            if (v && v !== s.name) editSpace(game, session, s.id, quiet(s) ? 'Renamed space “? (secret)”' : `Renamed space “${s.name}” to “${v}”`, (x) => (x.name = v));
            else e.currentTarget.value = s.name;
          }}
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
          }}
        />
      </label>
      {#if quiet(s)}
        <button class="ghost tiny" aria-pressed={!masked} onclick={() => (shownFor = masked ? s.id : null)} title={masked ? 'Shows its name here (viewers see it too)' : 'Hide its name again'}
          >{masked ? '👁 Show' : '🙈 Hide'}</button
        >
      {/if}
      <label class="small">
        Color
        <ColorBox value={s.color} aria-label="Space color" onchange={(e) => editSpace(game, session, s.id, `Color of “${said(s)}”`, (x) => (x.color = e.currentTarget.value))} />
      </label>
      <label class="check small">
        <input
          type="checkbox"
          checked={!!s.secret}
          onchange={(e) => {
            const on = e.currentTarget.checked;
            // (Its name stays out of the step either way in one window: it's, or it was, a secret not revealed yet.)
            const named = hide && !bs.revealed?.includes(s.id) ? '? (secret)' : s.name;
            editSpace(game, session, s.id, `${on ? 'Secret' : 'Not secret'}: “${named}”`, (x) => (x.secret = on || undefined));
          }}
        />
        Secret
      </label>
      <label class="check small" title="Viewers see its name under it (you always see it while editing)">
        <input type="checkbox" data-show-name checked={nameShown(s)} onchange={(e) => editShowName(game, session, s.id, e.currentTarget.checked, hide)} />
        Show name on the board
      </label>
      <select
        class="small"
        data-space-kind
        aria-label="Make it a…"
        title="Fills in what landing on it does, its color and an emoji in it (its landing buttons are replaced: Ctrl+Z brings them back)"
        onchange={(e) => {
          const k = SPACE_KINDS.find((x) => x.kind === e.currentTarget.value);
          e.currentTarget.value = '';
          if (k) editSpace(game, session, s.id, `Made “${said(s)}” a ${k.label.replace(/^\S+\s/, '')} space`, (x) => applySpaceKind(x, k.kind, { shop: game.shops?.[0]?.id, hp: numberStat(game, 'HP')?.id }));
        }}
      >
        <option value="">✨ Make it a…</option>
        {#each SPACE_KINDS as k (k.kind)}
          <option value={k.kind} disabled={k.kind === 'shop' && !game.shops?.length} title={k.kind === 'shop' && !game.shops?.length ? 'The game has no shop yet (make one in 📊 Stats & Items)' : k.hint}>{k.label}</option>
        {/each}
      </select>
      <button class="small" onclick={() => (boardEdit.buttons = s.id)} title="What it does when passed or landed on, and its host notes">⚙ Buttons ({(s.onPass?.length ?? 0) + (s.onLand?.length ?? 0)})…</button>
      <button class="small" disabled={isStart} onclick={() => editStart(game, session, s.id, hide)}>🏁 Make it Start</button>
      <span class="spacer"></span>
      <button class="ghost small danger" onclick={() => editDelete(game, session, s.id, hide)} title="Delete (Ctrl+Z brings it back){here.length ? `: ${here.map((p) => p.name).join(', ')} move to the space before it` : ''}">🗑 Delete space</button>
    </div>
    <div class="row">
      <span class="muted small">Leads to:</span>
      {#each s.next as n (n)}
        <span class="chip">
          {spaceById(round, n)?.next.includes(s.id) ? '↔' : '→'} {name(n)}
          <button class="ghost tiny" onclick={() => editDisconnect(game, session, { from: s.id, to: n }, hide)} aria-label="Disconnect {said(s)} from {name(n)}" title="Disconnect">✂</button>
        </span>
      {:else}
        <span class="muted small">nothing (the path ends)</span>
      {/each}
      {#if into.length}
        <span class="muted small">· From:</span>
        {#each into as f (f.id)}
          <span class="chip">
            ← {said(f)}
            <button class="ghost tiny" onclick={() => editDisconnect(game, session, { from: f.id, to: s.id }, hide)} aria-label="Disconnect {said(f)} from {said(s)}" title="Disconnect">✂</button>
          </span>
        {/each}
      {/if}
      <button class="small" class:on={boardEdit.connecting} aria-pressed={boardEdit.connecting} onclick={() => (boardEdit.connecting = !boardEdit.connecting)} title="Then click the space it should lead to (or Shift+click it on the stage)">🔗 Connect to…</button>
      <select
        class="small"
        aria-label="Connect {said(s)} to"
        onchange={(e) => {
          const v = e.currentTarget.value;
          e.currentTarget.value = '';
          e.currentTarget.blur();
          if (v) editConnect(game, session, s.id, v, hide);
        }}
      >
        <option value="">→ Connect to a space…</option>
        {#each round.spaces.filter((x) => x.id !== s.id && !s.next.includes(x.id)) as x (x.id)}<option value={x.id}>{listNames.get(x.id)}</option>{/each}
      </select>
    </div>
  {:else if link}
    {@const k = link}
    <div class="row pick" data-edit-link {@attach (el) => (void boardEdit.link, el.scrollIntoView({ block: 'nearest' }))}>
      <b class="small">{said(k.a)} {k.both ? '↔' : '→'} {said(k.b)}</b>
      <button class="small" onclick={() => editBothWays(game, session, k.l, hide)}>{k.both ? '→ One way only' : '⇄ Both ways'}</button>
      <button class="small" disabled={k.both} onclick={() => editReverse(game, session, k.l, hide)}>↺ Reverse</button>
      <span class="spacer"></span>
      <button class="ghost small danger" onclick={() => editDisconnect(game, session, k.l, hide)} title="Delete">✂ Disconnect</button>
    </div>
  {/if}
</div>

{#if boardEdit.buttons}
  {@const s = spaceById(round, boardEdit.buttons)}
  {#if s}
    <BoardSpaceButtons {round} space={s} name={said(s)} onclose={() => (boardEdit.buttons = null)} />
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
