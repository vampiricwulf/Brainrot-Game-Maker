<!--
  The host's card for an object clicked on the RPG stage: what it is, buttons for its class and its actions (nothing
  runs until pressed), who they're for, reveal/hide, and notes. Every change goes in the action log (undoable).
-->
<script lang="ts">
  import { toast } from '../../lib/app.svelte';
  import { textOn } from '../../lib/colors';
  import { describeAction, needsPlayers, runAction, type RunContext } from '../../lib/actions';
  import { newId, type Screen, type SlideElement, type World, type WorldState } from '../../lib/model';
  import { audienceSees, findIn, moveTo, override } from '../../lib/rpg';
  import { addStat, currencyFields, formatStat, giveItem, itemDef, logged, statFields } from '../../lib/toolset';

  let {
    el,
    screen,
    world,
    st,
    ctx,
    onclose,
  }: { el: SlideElement; screen: Screen; world: World; st: WorldState; ctx: RunContext; onclose: () => void } = $props();

  const { game, session } = $derived(ctx);
  const o = $derived(st.objects[el.id]);
  const role = $derived(el.role);
  const seen = $derived(audienceSees(el, o));
  // Who the buttons apply to: the host's selected players, else the party here.
  let chosen = $state<string[]>([]);
  const here = $derived(session.players.filter((p) => st.positions[p.id]?.screen === screen.id).map((p) => p.id));
  const who = $derived(chosen.length ? chosen : ctx.selected.length ? ctx.selected : here);
  const whoNames = $derived(who.map((id) => session.players.find((p) => p.id === id)?.name ?? '?').join(', ') || 'nobody');
  const title = $derived(el.name || role?.class || 'Object');
  const locked = $derived(o?.locked ?? role?.locked ?? false);
  const npcStats = $derived(o?.stats ?? role?.stats ?? []);

  function toggle(id: string): void {
    chosen = chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id];
  }

  function run(a: NonNullable<typeof role>['actions'] extends (infer T)[] | undefined ? T : never): void {
    if (needsPlayers(a) && !who.length) return void toast('Pick who it’s for first');
    toast(runAction({ ...ctx, chosen: who, world, st }, a, `${title}: ${describeAction(game, a)}`), 3000);
  }

  function setShown(v: boolean): void {
    logged(session, `${v ? 'Reveal' : 'Hide'} ${title}`, () => (override(st, el.id).shown = v));
  }

  function take(): void {
    logged(session, `Remove ${title}`, () => (override(st, el.id).taken = true));
    onclose();
  }

  function goThrough(players?: string[]): void {
    const to = role?.to;
    if (!to || !findIn(world, to)) return void toast('This doorway leads nowhere yet');
    if (locked && !confirm(`${title} is locked. Go through anyway?`)) return;
    logged(session, `${players ? whoNames : 'Party'} through ${title}`, () => moveTo(game, st, world, to, { players, arriveAt: role?.arrive }));
    onclose();
  }

  function pickUp(): void {
    if (!who.length) return void toast('Pick who picks it up');
    const target = who[0];
    logged(session, `${session.players.find((p) => p.id === target)?.name} picks up ${title}`, () => {
      if (role?.class === 'item') giveItem(game, session, target, role.item ?? null, role.qty ?? 1, role.item ? undefined : title);
      else if (role?.class === 'currency') {
        const f = statFields(game).find((x) => x.id === role.field) ?? currencyFields(game)[0];
        if (f) addStat(game, session, target, f, role.amount ?? 0);
      }
      override(st, el.id).taken = true;
    });
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
  <div class="row who">
    <span class="muted small">For:</span>
    {#each session.players as p (p.id)}
      {@const on = who.includes(p.id)}
      <button class="chip" style:border-color={p.color} style:background={on ? p.color : undefined} style:color={on ? textOn(p.color) : undefined} onclick={() => toggle(p.id)}>
        {p.name}
      </button>
    {/each}
  </div>
  <div class="row btns">
    {#if role?.class === 'doorway'}
      <button class="primary" onclick={() => goThrough()}>🚪 Go through (party)</button>
      {#if chosen.length || ctx.selected.length}<button onclick={() => goThrough(who)}>🚪 Only {whoNames}</button>{/if}
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
    {#if role?.shop}<button onclick={() => (ctx.live.overlay = { kind: 'shop', nonce: newId(), shopId: role.shop! })}>🛒 Shop</button>{/if}
    {#each role?.actions ?? [] as a (a.id)}
      <button onclick={() => run(a)}>{describeAction(game, a)}</button>
    {/each}
  </div>
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
  <div class="row">
    <button class="small" onclick={() => setShown(!seen)}>{seen ? '🙈 Hide from viewers' : '👁 Reveal to viewers'}</button>
    <button class="small ghost" onclick={take} title="Take it off the screen (undoable)">🗑 Remove</button>
    <span class="muted small">Drag avatars on the stage to move them.</span>
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
  .stat {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    border-radius: 6px;
    background: var(--panel-2);
    font-size: 12px;
  }
  .tiny {
    font-size: 11px;
    padding: 0 6px;
  }
  .small {
    font-size: 12px;
  }
</style>
