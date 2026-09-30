<!--
  One player's card in the RPG host panel: stats (±), inventory (equip, use, give, drop, remove), their sheet on
  screen, knocked out, and converting score to or from a currency. Every change is one undoable step.
-->
<script lang="ts">
  import { app, toast } from '../../lib/app.svelte';
  import { textOn } from '../../lib/colors';
  import { describeAction, runAction } from '../../lib/actions';
  import { formatPoints, newId, type BoardGameRound, type BoardGameState, type Game, type Player, type Session, type World, type WorldState } from '../../lib/model';
  import { applyScore, score } from '../../lib/session';
  import {
    addStat, currencyFields, entryName, formatStat, giveItem, inventory, itemDef, logged, setStat, statFields, statNumber, statValue,
    transferEntry,
  } from '../../lib/toolset';
  import Avatar from '../../lib/rpg/Avatar.svelte';
  import { droppedObject } from './hostops';

  let {
    game,
    session,
    player: p,
    world,
    st,
    board,
    bs,
    selected,
    ontoggle,
  }: {
    game: Game;
    session: Session;
    player: Player;
    /** RPG rounds: the world (avatar position, dropping items on the screen). */
    world?: World;
    st?: WorldState;
    /** Board-game rounds: for items whose "Use" sends players somewhere. */
    board?: BoardGameRound;
    bs?: BoardGameState;
    selected: string[];
    ontoggle: () => void;
  } = $props();

  const on = $derived(selected.includes(p.id));
  const fields = $derived(statFields(game));
  const items = $derived(inventory(session, p.id));
  const pos = $derived(st?.positions[p.id]);
  const name = $derived(p.name);
  const currencies = $derived(currencyFields(game));
  let convertAmt = $state<number | null>(null);
  let convertField = $state('');
  const cf = $derived(currencies.find((f) => f.id === convertField) ?? currencies[0]);

  function bump(fieldId: string, delta: number): void {
    const f = fields.find((x) => x.id === fieldId);
    if (!f) return;
    logged(session, `${name}: ${f.name} ${delta > 0 ? '+' : '−'}${Math.abs(delta)}`, () => addStat(game, session, p.id, f, delta));
  }

  function set(fieldId: string, v: string | boolean | string[]): void {
    const f = fields.find((x) => x.id === fieldId);
    if (!f) return;
    logged(session, `${name}: ${f.name} = ${Array.isArray(v) ? v.join(', ') : v}`, () => setStat(session, p.id, f, f.type === 'number' ? Number(v) : v));
  }

  function giveNew(itemId: string): void {
    if (!itemId) return;
    if (itemId === '*') {
      const n = prompt('Name of the item (made up on the spot):')?.trim();
      if (n) logged(session, `${name} gets ${n}`, () => giveItem(game, session, p.id, null, 1, n));
      return;
    }
    logged(session, `${name} gets ${itemDef(game, itemId)?.name}`, () => giveItem(game, session, p.id, itemId, 1));
  }

  function change(entryId: string, text: string, fn: (list: typeof items, i: number) => void): void {
    logged(session, `${name}: ${text}`, () => {
      const list = session.inventories?.[p.id];
      const i = list?.findIndex((e) => e.id === entryId) ?? -1;
      if (list && i >= 0) fn(list, i);
    });
  }

  function use(entryId: string): void {
    const e = items.find((x) => x.id === entryId);
    const def = itemDef(game, e?.item);
    if (!e || !def?.onUse?.length) return;
    if (!confirm(`${name} uses ${def.name}:\n${def.onUse.map((a) => '• ' + describeAction(game, a)).join('\n')}\n\nUse it up?`)) return;
    const ctx = { game, session, live: app.live, world, st, board, bs, selected, chosen: [p.id] };
    const said = def.onUse.map((a) => runAction(ctx, a, `${name} uses ${def.name}: ${describeAction(game, a)}`));
    if (!def.wearable) change(entryId, `used ${def.name}`, (list, i) => (list[i].qty > 1 ? list[i].qty-- : list.splice(i, 1)));
    toast(said.join(' · '), 3000);
  }

  function drop(entryId: string): void {
    const e = items.find((x) => x.id === entryId);
    if (!e || !pos || !st) return;
    const world = st;
    logged(session, `${name} drops ${entryName(game, e)}`, () => {
      const el = droppedObject(game, e, { x: pos.x + 140, y: pos.y });
      world.added[pos.screen] ??= [];
      world.added[pos.screen].push(el);
      const list = session.inventories?.[p.id];
      const i = list?.findIndex((x) => x.id === entryId) ?? -1;
      if (list && i >= 0) list.splice(i, 1);
    });
  }

  function convert(toCurrency: boolean): void {
    const amt = Math.abs(convertAmt ?? 0);
    if (!amt || !cf) return;
    if (toCurrency) {
      applyScore(session, game, [p.id], -amt, `Converted to ${cf.name}`);
      logged(session, `${name}: ${formatPoints(amt, game.settings.currencySymbol)} score → ${formatStat(cf, amt)}`, () => addStat(game, session, p.id, cf, amt));
    } else {
      const have = statNumber(game, session, p.id, cf);
      if (have < amt) return void toast(`${name} only has ${formatStat(cf, have)}`);
      logged(session, `${name}: ${formatStat(cf, amt)} → score`, () => addStat(game, session, p.id, cf, -amt));
      applyScore(session, game, [p.id], amt, `Converted from ${cf.name}`);
    }
    convertAmt = null;
  }
</script>

<div class="pc" class:on style:--c={p.color}>
  <div class="row head">
    <button class="who" onclick={ontoggle} style:background={on ? p.color : undefined} style:color={on ? textOn(p.color) : undefined} aria-pressed={on}>
      <Avatar player={p} size={28} />
      {p.name}
    </button>
    <span class="score">{formatPoints(score(session, p.id), game.settings.currencySymbol)}</span>
    <span class="spacer"></span>
    {#if pos && st}
      {@const w = st}
      <button
        class="tiny"
        class:on={pos.down}
        title="Knocked out (shown grey and tipped over)"
        onclick={() => logged(session, `${name} ${pos.down ? 'gets up' : 'is knocked out'}`, () => (w.positions[p.id].down = !pos.down))}>💫</button
      >
      <button
        class="tiny"
        class:on={pos.hidden}
        title="Hide their avatar from the screen"
        onclick={() => logged(session, `${name} ${pos.hidden ? 'shown' : 'hidden'}`, () => (w.positions[p.id].hidden = !pos.hidden))}>🫥</button
      >
    {/if}
    <button class="tiny" title="Show {p.name}'s sheet on screen (I)" onclick={() => (app.live.overlay = { kind: 'sheet', nonce: newId(), playerId: p.id })}>📺</button>
  </div>
  {#each fields as f (f.id)}
    {@const v = statValue(game, session, p.id, f)}
    <div class="row stat">
      <span class="k" title={f.audience === 'hidden' ? 'Host only' : f.audience === 'sheet' ? 'On the player sheet' : 'On the stats strip'}>
        {f.name}{f.audience === 'hidden' ? ' 🔒' : ''}
      </span>
      {#if f.type === 'number'}
        <button class="tiny" onclick={() => bump(f.id, -1)} aria-label="{p.name} {f.name} minus 1">−</button>
        <input
          class="num"
          type="number"
          value={v}
          aria-label="{p.name} {f.name}"
          onchange={(e) => set(f.id, e.currentTarget.value)}
          onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <button class="tiny" onclick={() => bump(f.id, 1)} aria-label="{p.name} {f.name} plus 1">+</button>
        {#if f.max !== undefined}<span class="muted small">/ {f.max}</span>{/if}
      {:else if f.type === 'checkbox'}
        <input type="checkbox" checked={!!v} onchange={(e) => set(f.id, e.currentTarget.checked)} aria-label="{p.name} {f.name}" />
      {:else if f.type === 'tags'}
        <input
          class="txt"
          value={Array.isArray(v) ? v.join(', ') : ''}
          placeholder="tag, tag"
          aria-label="{p.name} {f.name}"
          onchange={(e) => set(f.id, e.currentTarget.value.split(',').map((t) => t.trim()).filter(Boolean))}
        />
      {:else}
        <input class="txt" value={String(v)} aria-label="{p.name} {f.name}" onchange={(e) => set(f.id, e.currentTarget.value)} />
      {/if}
    </div>
  {/each}
  <div class="inv">
    {#each items as e (e.id)}
      {@const def = itemDef(game, e.item)}
      <div class="row it">
        <span class="nm" title={def?.hostNotes ?? def?.description}>
          {entryName(game, e)}{e.qty > 1 ? ` ×${e.qty}` : ''}{def?.secret ? ' 🔒' : ''}
        </span>
        {#if def?.wearable}
          <button class="tiny" class:on={e.equipped} onclick={() => change(e.id, `${e.equipped ? 'unequips' : 'equips'} ${def.name}`, (l, i) => (l[i].equipped = !e.equipped))}>
            {e.equipped ? 'Unequip' : 'Equip'}
          </button>
        {/if}
        {#if def?.onUse?.length}<button class="tiny" onclick={() => use(e.id)}>Use</button>{/if}
        <select
          class="tiny"
          aria-label="Give {entryName(game, e)} to"
          onchange={(ev) => {
            const to = ev.currentTarget.value;
            ev.currentTarget.value = '';
            if (to) logged(session, `${name} gives ${entryName(game, e)} to ${session.players.find((x) => x.id === to)?.name}`, () => transferEntry(session, p.id, to, e.id));
          }}
        >
          <option value="">Give →</option>
          {#each session.players.filter((x) => x.id !== p.id) as o (o.id)}<option value={o.id}>{o.name}</option>{/each}
        </select>
        {#if pos}<button class="tiny" title="Drop it on this screen (it can be picked up again)" onclick={() => drop(e.id)}>⬇</button>{/if}
        <button class="tiny" title="Remove one" onclick={() => change(e.id, `loses ${entryName(game, e)}`, (l, i) => (l[i].qty > 1 ? l[i].qty-- : l.splice(i, 1)))}>✕</button>
      </div>
    {/each}
    <select
      class="tiny add"
      aria-label="Give {p.name} an item"
      onchange={(ev) => {
        const v = ev.currentTarget.value;
        ev.currentTarget.value = '';
        giveNew(v);
      }}
    >
      <option value="">＋ Item…</option>
      {#each game.items ?? [] as it (it.id)}<option value={it.id}>{it.name}</option>{/each}
      <option value="*">Something else…</option>
    </select>
  </div>
  {#if currencies.length}
    <div class="row conv">
      <input class="num" type="number" min="0" placeholder="Amt" bind:value={convertAmt} aria-label="Amount to convert" />
      {#if currencies.length > 1}
        <select class="tiny" bind:value={convertField} aria-label="Currency">
          {#each currencies as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
        </select>
      {/if}
      <button class="tiny" disabled={!convertAmt} onclick={() => convert(true)} title="Take it off the score, add it to {cf?.name}">Score → {cf?.name}</button>
      <button class="tiny" disabled={!convertAmt} onclick={() => convert(false)} title="Take it off {cf?.name}, add it to the score">{cf?.name} → Score</button>
    </div>
  {/if}
</div>

<style>
  .pc {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 5px;
    border: 2px solid var(--c);
    border-radius: 8px;
    min-width: 220px;
    flex: 0 1 260px;
    font-size: 12px;
  }
  .pc.on {
    box-shadow: 0 0 0 2px var(--c);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }
  .who {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 700;
    padding: 2px 8px 2px 2px;
  }
  .score {
    font-weight: 700;
  }
  .k {
    min-width: 60px;
    opacity: 0.85;
  }
  .num {
    width: 64px;
    padding: 1px 4px;
  }
  .txt {
    flex: 1;
    min-width: 80px;
    padding: 1px 4px;
  }
  .tiny {
    font-size: 11px;
    padding: 1px 6px;
  }
  .tiny.on {
    border-color: var(--accent);
    background: rgba(79, 124, 255, 0.25);
  }
  .inv {
    display: flex;
    flex-direction: column;
    gap: 2px;
    border-top: 1px solid var(--border);
    padding-top: 3px;
  }
  .nm {
    flex: 1;
    min-width: 70px;
  }
  .add {
    align-self: flex-start;
  }
  .small {
    font-size: 11px;
  }
</style>
