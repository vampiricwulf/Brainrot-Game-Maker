<!--
  The host's card for an object clicked on the RPG stage: what it is, buttons for its class and its actions (nothing
  runs until pressed), who they're for, reveal/hide, and notes. Every change goes in the action log (undoable).
-->
<script lang="ts">
  import { toast } from '../../lib/app.svelte';
  import { textOn } from '../../lib/colors';
  import { describeAction, needsPlayers, runAction, type RunContext } from '../../lib/actions';
  import { newId, type Screen, type SlideElement, type World, type WorldState } from '../../lib/model';
  import { activeParty, audienceSees, findIn, moveTo, OBJECT_CLASSES, override } from '../../lib/rpg';
  import { nameList } from '../../lib/session';
  import { formatStat, itemDef, logged, statFields, statNumber } from '../../lib/toolset';
  import InlineAsk from '../host/InlineAsk.svelte';
  import { objectName, pickUp as pickUpNow, removeObject } from './hostops';

  let {
    el,
    screen,
    world,
    st,
    ctx,
    onclose,
    onedit,
    onkeep,
  }: {
    el: SlideElement;
    screen: Screen;
    world: World;
    st: WorldState;
    ctx: RunContext;
    onclose: () => void;
    /** Open its screen in the live editor (to move, resize, restyle or fully set it up). */
    onedit?: () => void;
    /** Keep its screen (with this object) in the editor's game. */
    onkeep?: () => void;
  } = $props();

  const { game, session } = $derived(ctx);
  const o = $derived(st.objects[el.id]);
  const role = $derived(el.role);
  const seen = $derived(audienceSees(el, o));
  // Who the buttons apply to: the players picked on this card, else the host's selected players, else everyone here.
  let chosen = $state<string[] | null>(null);
  const here = $derived(session.players.filter((p) => st.positions[p.id]?.screen === screen.id).map((p) => p.id));
  /** Picked by the host (on this card, or selected): null means nobody was, so it's for everyone here. */
  const picked = $derived(chosen ?? (ctx.selected.length ? ctx.selected : null));
  const who = $derived(picked ?? here);
  const whoNames = $derived(nameList(who.map((id) => session.players.find((p) => p.id === id)?.name ?? '?')) || 'nobody');
  const title = $derived(objectName(el));
  const locked = $derived(o?.locked ?? role?.locked ?? false);
  const npcStats = $derived(o?.stats ?? role?.stats ?? []);

  /** Compare: a player number field against one of the NPC's stats (nothing more: no combat engine). */
  const numberFields = $derived(statFields(game).filter((f) => f.type === 'number'));
  let cmpField = $state('');
  /** The NPC stat picked (null: the one named like the player stat, else the first). */
  let cmpStat = $state<number | null>(null);
  const cf = $derived(numberFields.find((f) => f.id === cmpField) ?? numberFields.find((f) => npcStats.some((s) => s.name === f.name)) ?? numberFields[0]);
  const ns = $derived(cmpStat ?? Math.max(0, npcStats.findIndex((s) => s.name === cf?.name)));

  function runAll(): void {
    const list = role?.actions ?? [];
    if (list.some(needsPlayers) && !who.length) return void toast('Pick who it’s for first');
    let said: string[] = [];
    // One undoable step for all of them.
    logged(session, `${title}: ${list.map((a) => describeAction(game, a)).join(', ')}`, () => {
      said = list.map((a) => runAction({ ...ctx, chosen: who, world, st }, a, `${title}: ${describeAction(game, a)}`));
    });
    toast(said.join(' · '), 4000);
  }

  // Renaming or reclassing an object drawn on the screen changes the game being played: the undo puts it back.
  function rename(name: string): void {
    logged(session, `Rename ${title} to ${name}`, () => (el.name = name || undefined), game);
  }

  /** Make it an item, a zone, a hazard…: the rest (actions, dialogue) is set up in the live editor. */
  function setClass(c: string): void {
    logged(
      session,
      `${title}: ${c || 'scenery'}`,
      () => {
        el.role = c ? { ...(el.role ?? {}), class: c as NonNullable<SlideElement['role']>['class'] } : undefined;
      },
      game,
    );
  }

  function toggle(id: string): void {
    const cur = picked ?? [];
    chosen = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  }

  function run(a: NonNullable<typeof role>['actions'] extends (infer T)[] | undefined ? T : never): void {
    if (needsPlayers(a) && !who.length) return void toast('Pick who it’s for first');
    toast(runAction({ ...ctx, chosen: who, world, st }, a, `${title}: ${describeAction(game, a)}`), 3000);
  }

  function setShown(v: boolean): void {
    logged(session, `${v ? 'Reveal' : 'Hide'} ${title}`, () => (override(st, el.id).shown = v));
  }

  function take(): void {
    const said = removeObject(game, session, el.id);
    if (said) toast(said, 3000);
    onclose();
  }

  /** Going through while it's locked asks first, inline (a browser dialog would show on stream): who'd go. */
  let lockedAsk = $state<{ players?: string[] } | null>(null);

  function goThrough(players?: string[], anyway = false): void {
    const to = role?.to;
    if (!to || !findIn(world, to)) return void toast('This doorway leads nowhere yet');
    if (locked && !anyway) return void (lockedAsk = { players });
    // "The party" is whoever stands at this doorway (the followed party may be somewhere else).
    const active = activeParty(st)?.members ?? [];
    const partyHere = active.some((m) => here.includes(m));
    const movers = players ?? (partyHere ? undefined : here);
    const label = players ? whoNames : 'Party';
    logged(session, `${label} through ${title}`, () => moveTo(game, st, world, to, { players: movers, arriveAt: role?.arrive }));
    onclose();
  }

  function pickUp(): void {
    if (!who.length) return void toast('Pick who picks it up');
    pickUpNow(game, session, st, el, who[0]);
    onclose();
  }

  function npcStat(i: number, delta: number): void {
    const next = npcStats.map((s, j) => (j === i ? { ...s, value: s.value + delta } : { ...s }));
    logged(session, `${title}: ${next[i].name} ${delta > 0 ? '+' : '−'}${Math.abs(delta)}`, () => (override(st, el.id).stats = next));
  }

  function talk(): void {
    if (!role?.dialogue) return;
    ctx.live.overlay = { kind: 'popup', nonce: newId(), slide: JSON.parse(JSON.stringify(role.dialogue)), title };
  }
</script>

<div class="card" role="dialog" aria-label="Object: {title}">
  <div class="row head">
    <b>{title}</b>
    {#if role}<span class="cls">{role.class}</span>{/if}
    <span class="vis" class:off={!seen}>{seen ? '👁 Viewers see it' : '🙈 Hidden from viewers'}</span>
    <span class="spacer"></span>
    <button class="ghost small" onclick={onclose} aria-label="Close">✕</button>
  </div>
  {#if el.hostNotes}<div class="notes">📝 {el.hostNotes}</div>{/if}
  <div class="row setup">
    <input
      class="nm"
      value={el.name ?? ''}
      placeholder="Name"
      aria-label="Object name"
      onchange={(e) => rename(e.currentTarget.value.trim())}
      onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
    <!-- Let go of the keys after a pick: shortcuts ignore a focused select, and arrow keys would change the class again. -->
    <select
      value={role?.class ?? ''}
      onchange={(e) => {
        const v = e.currentTarget.value;
        e.currentTarget.blur();
        setClass(v);
      }}
      aria-label="Object class"
      title="What it is"
    >
      {#each OBJECT_CLASSES as [v, l, hint] (v)}<option value={v} title={hint}>{l}</option>{/each}
    </select>
    {#if onedit}<button class="small" onclick={onedit} title="Move, resize, restyle, or give it actions and dialogue">✎ Edit</button>{/if}
    {#if onkeep}<button class="small" onclick={onkeep} title="Save its screen, with this, in the game in the editor, so it's there next time">💾 Keep</button>{/if}
  </div>
  <div class="row who">
    <span class="muted small">For{picked ? '' : ' everyone here'}:</span>
    {#each session.players as p (p.id)}
      {@const on = !!picked?.includes(p.id)}
      <!-- Everyone here (nobody picked) is outlined, not filled: clicking one picks just them. -->
      <button
        class="chip"
        class:auto={!picked && here.includes(p.id)}
        style:border-color={p.color}
        style:background={on ? p.color : undefined}
        style:color={on ? textOn(p.color) : undefined}
        aria-pressed={on}
        onclick={() => toggle(p.id)}
      >
        {p.name}
      </button>
    {/each}
  </div>
  <div class="row btns">
    {#if role?.class === 'doorway'}
      <button class="primary" onclick={() => goThrough()}>🚪 Go through (party)</button>
      {#if picked?.length}<button onclick={() => goThrough(who)}>🚪 Only {whoNames}</button>{/if}
      <button class="small" onclick={() => logged(session, `${locked ? 'Unlock' : 'Lock'} ${title}`, () => (override(st, el.id).locked = !locked))}>
        {locked ? '🔓 Unlock' : '🔒 Lock'}
      </button>
    {:else if role?.class === 'item'}
      <button class="primary" onclick={pickUp}>✋ {whoNames.split(',')[0]} picks up {role.qty ?? 1} {itemDef(game, role.item)?.name ?? title}</button>
    {:else if role?.class === 'currency'}
      {@const f = statFields(game).find((x) => x.id === role.field)}
      <button class="primary" onclick={pickUp}>✋ {whoNames.split(',')[0]} picks up {f ? formatStat(f, role.amount ?? 0) : role.amount}</button>
    {/if}
    {#if role?.dialogue}<button onclick={talk}>💬 Talk</button>{/if}
    {#if role?.shop}<button onclick={() => (ctx.live.overlay = { kind: 'shop', nonce: newId(), shopId: role.shop!, buyer: who[0] })}>🛒 Shop</button>{/if}
    {#each role?.actions ?? [] as a (a.id)}
      <button onclick={() => run(a)}>{describeAction(game, a)}</button>
    {/each}
    {#if (role?.actions?.length ?? 0) > 1}<button class="small" onclick={runAll} title="Every action above, in order">▶ Run all</button>{/if}
  </div>
  {#if lockedAsk && locked}
    {@const a = lockedAsk}
    <InlineAsk text="{title} is locked. Go through anyway?" ok="🚪 Go through" onok={() => goThrough(a.players, true)} oncancel={() => (lockedAsk = null)} />
  {/if}
  {#if npcStats.length}
    <div class="row">
      {#each npcStats as s, i (i)}
        <span class="stat">
          {s.name} <b>{s.value}</b>
          <button class="tiny" onclick={() => npcStat(i, -1)} aria-label="{s.name} minus 1">−</button>
          <button class="tiny" onclick={() => npcStat(i, 1)} aria-label="{s.name} plus 1">+</button>
        </span>
      {/each}
    </div>
  {/if}
  {#if npcStats.length && numberFields.length}
    <div class="row cmp">
      <span class="muted small">Compare</span>
      <select class="tiny" value={cf?.id} onchange={(e) => ((cmpField = e.currentTarget.value), (cmpStat = null))} aria-label="Player stat">
        {#each numberFields as f (f.id)}<option value={f.id}>{f.name}</option>{/each}
      </select>
      <span class="muted small">vs</span>
      <select class="tiny" value={ns} onchange={(e) => (cmpStat = +e.currentTarget.value)} aria-label="{title} stat">
        {#each npcStats as s, i (i)}<option value={i}>{s.name}</option>{/each}
      </select>
      {#if cf}
        {#each who as id (id)}
          {@const pv = statNumber(game, session, id, cf)}
          {@const nv = npcStats[ns]?.value ?? 0}
          <span class="vs" class:win={pv > nv} class:lose={pv < nv}>
            {session.players.find((p) => p.id === id)?.name} {pv} vs {nv}
          </span>
        {/each}
      {/if}
    </div>
  {/if}
  <div class="row">
    <button class="small" onclick={() => setShown(!seen)}>{seen ? '🙈 Hide from viewers' : '👁 Reveal to viewers'}</button>
    <button class="small ghost" onclick={take} title="Take it off the screen (Delete; undoable)">🗑 Remove</button>
    <span class="muted small">Drag avatars on the stage to move them{role?.class === 'item' || role?.class === 'currency' ? ', or this onto one to pick it up' : ''}.</span>
  </div>
</div>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    border: 1px solid var(--accent);
    border-radius: 8px;
    background: rgba(79, 124, 255, 0.08);
  }
  .row {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }
  .cls {
    font-size: 11px;
    padding: 1px 6px;
    border-radius: 6px;
    background: var(--panel-2);
  }
  .vis {
    font-size: 12px;
    color: var(--good);
  }
  .vis.off {
    color: var(--warn);
  }
  .setup .nm {
    flex: 1;
    min-width: 100px;
    padding: 2px 6px;
  }
  .setup select {
    padding: 2px 6px;
  }
  .notes {
    font-size: 12px;
    background: var(--panel-2);
    padding: 2px 8px;
    border-radius: 6px;
  }
  .chip {
    border-width: 2px;
    padding: 1px 8px;
    font-size: 12px;
  }
  .chip.auto {
    border-style: dashed;
  }
  .stat {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    border-radius: 6px;
    background: var(--panel-2);
    font-size: 12px;
  }
  .vs {
    font-size: 12px;
    padding: 1px 6px;
    border-radius: 6px;
    background: var(--panel-2);
  }
  .vs.win {
    color: var(--good);
  }
  .vs.lose {
    color: var(--bad);
  }
  .tiny {
    font-size: 11px;
    padding: 0 6px;
  }
  .small {
    font-size: 12px;
  }
</style>
