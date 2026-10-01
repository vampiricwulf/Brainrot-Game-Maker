<!--
  One player's card in the RPG host panel: stats (±), inventory (equip, use, give, drop, remove; drag an item onto
  another player's card or avatar to give it, or onto the stage to drop it there), their sheet on screen, knocked out,
  and converting score to or from a currency. Every change is one undoable step.
-->
<script module lang="ts">
  /** The host folded or unfolded the players' cards (null: not yet), and the card to show them (it flashes). */
  export const playerCards = $state<{ open: boolean | null; flash: string | null }>({ open: null, flash: null });

  /**
   * The players' cards show in the RPG and board game host panels: as the host last chose, in any round of the show,
   * else only on a tall window (on a short one the stage needs the room).
   */
  export function cardsShown(): boolean {
    return playerCards.open ?? window.innerHeight >= 900;
  }
</script>

<script lang="ts">
  import { showMenu } from '../../lib/menustate.svelte';
  import { app, toast } from '../../lib/app.svelte';
  import { textOn } from '../../lib/colors';
  import { describeAction, runAction } from '../../lib/actions';
  import { formatPoints, newId, type BoardGameRound, type BoardGameState, type Game, type Player, type Session, type World, type WorldState } from '../../lib/model';
  import { applyScore, score } from '../../lib/session';
  import {
    addStat, clampStat, currencyFields, entryName, formatStat, giveItem, inventory, itemDef, logged, setStat, statFields, statNumber, statValue,
  } from '../../lib/toolset';
  import Avatar from '../../lib/rpg/Avatar.svelte';
  import InlineAsk from '../host/InlineAsk.svelte';
  import { dragDone, dropHover, itemDrag } from '../dragdrop.svelte';
  import { count, dropEntry, giveEntry } from './hostops';

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

  // Their card was asked for (from their menu): it comes into view and flashes.
  let cardEl = $state<HTMLElement>();
  $effect(() => {
    if (playerCards.flash !== p.id || !cardEl) return;
    cardEl.scrollIntoView({ block: 'nearest' });
    const t = setTimeout(() => (playerCards.flash = null), 1200);
    return () => clearTimeout(t);
  });

  function bump(fieldId: string, delta: number): void {
    const f = fields.find((x) => x.id === fieldId);
    if (!f) return;
    let changed = 0;
    logged(session, `${name}: ${f.name} ${delta > 0 ? '+' : '−'}${Math.abs(delta)}`, () => (changed = addStat(game, session, p.id, f, delta)));
    if (!changed) toast(`${name}’s ${f.name} is already at its ${delta > 0 ? `max (${f.max})` : `min (${f.min})`}`);
  }

  /** Set a stat (a number stays within the field's min and max: the log says what it became). */
  function set(fieldId: string, v: string | boolean | string[]): void {
    const f = fields.find((x) => x.id === fieldId);
    if (!f) return;
    const value = clampStat(f, f.type === 'number' ? Number(v) : v);
    logged(session, `${name}: ${f.name} = ${Array.isArray(value) ? value.join(', ') : value}`, () => setStat(session, p.id, f, value));
  }

  // "Something else…" and Use ask inline (a browser dialog would show on stream).
  /** "Something else…" was picked: the made-up item's name is being typed. */
  let naming = $state(false);
  /** The item whose Use is being asked about. */
  let using = $state<string | null>(null);

  function giveNew(itemId: string): void {
    if (!itemId) return;
    if (itemId === '*') return void (naming = true);
    logged(session, `${name} gets ${itemDef(game, itemId)?.name}`, () => giveItem(game, session, p.id, itemId, 1));
  }

  /** An item made up on the spot (not one of the game's items). */
  function giveMadeUp(n: string): void {
    naming = false;
    logged(session, `${name} gets ${n}`, () => giveItem(game, session, p.id, null, 1, n));
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
    using = null;
    if (!e || !def?.onUse?.length) return;
    const actions = def.onUse;
    const ctx = { game, session, live: app.live, world, st, board, bs, selected, chosen: [p.id] };
    let said: string[] = [];
    // One undoable step: what it does, and using it up.
    logged(session, `${name} uses ${def.name}`, () => {
      said = actions.map((a) => runAction(ctx, a, `${name} uses ${def.name}: ${describeAction(game, a)}`));
      if (!def.wearable) change(entryId, `used ${def.name}`, (list, i) => (list[i].qty > 1 ? list[i].qty-- : list.splice(i, 1)));
    });
    toast(said.join(' · '), 3000);
  }

  /** How many of a stack the give / drop / remove buttons move (1 unless typed). */
  let amounts = $state<Record<string, number>>({});
  const howMany = (entryId: string, qty: number) => Math.max(1, Math.min(qty, Math.round(amounts[entryId] ?? 1) || 1));

  function give(entryId: string, to: string): void {
    const e = items.find((x) => x.id === entryId);
    if (!e) return;
    giveEntry(game, session, p.id, to, entryId, howMany(entryId, e.qty));
    delete amounts[entryId];
  }

  function remove(entryId: string): void {
    const e = items.find((x) => x.id === entryId);
    if (!e) return;
    const n = howMany(entryId, e.qty);
    change(entryId, `loses ${count(n, entryName(game, e))}`, (l, i) => (l[i].qty > n ? (l[i].qty -= n) : l.splice(i, 1)));
    delete amounts[entryId];
  }

  function drop(entryId: string): void {
    const e = items.find((x) => x.id === entryId);
    if (!e || !pos) return;
    dropEntry(game, session, p.id, entryId, howMany(entryId, e.qty));
    delete amounts[entryId];
  }

  /** An item from another player's card dragged over this one: it would go to them. */
  const itemFromElsewhere = () => !!itemDrag.now && itemDrag.now.from !== p.id;

  /** Another player's item dropped on this card: they give it to this player (as many as their amount box says). */
  function dropItem(e: DragEvent): void {
    const d = itemDrag.now;
    dragDone();
    if (!d || d.from === p.id) return;
    e.preventDefault();
    giveEntry(game, session, d.from, p.id, d.entryId, d.n);
  }

  function convert(toCurrency: boolean): void {
    const amt = Math.abs(convertAmt ?? 0);
    if (!amt || !cf) return;
    // One undoable step: the points and the currency change together.
    if (toCurrency) {
      const have = score(session, p.id);
      if (have < amt) return void toast(`${name} only has ${formatPoints(have, game.settings.currencySymbol)}`);
      logged(session, `${name}: ${formatPoints(amt, game.settings.currencySymbol)} score → ${formatStat(cf, amt)}`, () => {
        applyScore(session, game, [p.id], -amt, `Converted to ${cf.name}`);
        addStat(game, session, p.id, cf, amt);
      });
    } else {
      const have = statNumber(game, session, p.id, cf);
      if (have < amt) return void toast(`${name} only has ${formatStat(cf, have)}`);
      logged(session, `${name}: ${formatStat(cf, amt)} → score`, () => {
        addStat(game, session, p.id, cf, -amt);
        applyScore(session, game, [p.id], amt, `Converted from ${cf.name}`);
      });
    }
    convertAmt = null;
  }
</script>

<div
  class="pc"
  class:on
  class:flash={playerCards.flash === p.id}
  class:drop-on={dropHover.at === `player:${p.id}`}
  style:--c={p.color}
  bind:this={cardEl}
  role="group"
  aria-label="{p.name}'s card"
  ondragover={(e) => {
    if (!itemFromElsewhere()) return;
    e.preventDefault();
    dropHover.at = `player:${p.id}`;
  }}
  ondragleave={(e) => !cardEl?.contains(e.relatedTarget as Node) && dropHover.at === `player:${p.id}` && (dropHover.at = null)}
  ondrop={dropItem}
>
  <div class="row head" data-player-id={p.id}>
    <button
      class="who"
      onclick={ontoggle}
      style:background={on ? p.color : undefined}
      style:color={on ? textOn(p.color) : undefined}
      aria-pressed={on}
      draggable={st ? 'true' : undefined}
      ondragstart={st ? (e) => e.dataTransfer?.setData('text/x-player', p.id) : undefined}
      title="Select (key {session.players.findIndex((x) => x.id === p.id) + 1}) · right-click for their menu{st ? ' · drag onto a party to join it' : ''}"
    >
      <Avatar player={p} size={28} />
      <span class="name">{p.name}</span>
    </button>
    <span class="score">{formatPoints(score(session, p.id), game.settings.currencySymbol)}</span>
    <span class="spacer"></span>
    {#if pos && st}
      {@const w = st}
      <button
        class="tiny"
        class:on={pos.down}
        title="Knocked out (shown grey and tipped over)"
        aria-label="{name} knocked out"
        aria-pressed={!!pos.down}
        onclick={() => logged(session, `${name} ${pos.down ? 'gets up' : 'is knocked out'}`, () => (w.positions[p.id].down = !pos.down))}>💫</button
      >
      <button
        class="tiny"
        class:on={pos.hidden}
        title="Hide their avatar from the screen"
        aria-label="Hide {name}'s avatar"
        aria-pressed={!!pos.hidden}
        onclick={() => logged(session, `${name} ${pos.hidden ? 'shown' : 'hidden'}`, () => (w.positions[p.id].hidden = !pos.hidden))}>🫥</button
      >
    {/if}
    <button class="tiny" title="Show {p.name}'s sheet on screen (I)" aria-label="Show {p.name}'s sheet on screen" onclick={() => (app.live.overlay = { kind: 'sheet', nonce: newId(), playerId: p.id })}>📺</button>
  </div>
  {#if fields.length}
    <!-- Two stats a line (name, value, name, value), so a card stays short. -->
    <div class="stats">
      {#each fields as f (f.id)}
        {@const v = statValue(game, session, p.id, f)}
        <span class="k" title="{f.name}: {f.audience === 'hidden' ? 'host only' : f.audience === 'sheet' ? 'on the player sheet' : 'on the stats strip'}">
          {f.name}{f.audience === 'hidden' ? ' 🔒' : ''}
        </span>
        <span class="v">
          {#if f.type === 'number'}
            <button class="tiny" onclick={() => bump(f.id, -1)} aria-label="{p.name} {f.name} minus 1">−</button>
            <!-- Its max is in the tooltip (the stats strip's bar shows it too): the box fits beside the next stat's name. -->
            <input
              class="sn"
              type="number"
              value={v}
              aria-label="{p.name} {f.name}"
              title={f.max === undefined ? undefined : `Up to ${f.max}`}
              onchange={(e) => {
                set(f.id, e.currentTarget.value);
                // Kept within min and max: the box shows what it became (even when that's what it was).
                e.currentTarget.value = String(statValue(game, session, p.id, f));
              }}
              onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
            <button class="tiny" onclick={() => bump(f.id, 1)} aria-label="{p.name} {f.name} plus 1">+</button>
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
        </span>
      {/each}
    </div>
  {/if}
  <div class="inv">
    {#each items as e (e.id)}
      {@const def = itemDef(game, e.item)}
      {@const about = def?.hostNotes ?? def?.description}
      <div
        class="row it"
        role="group"
        aria-label={entryName(game, e)}
        oncontextmenu={(ev) =>
          showMenu(ev, [
            { heading: `${entryName(game, e)}${e.qty > 1 ? ` ×${e.qty}` : ''}` },
            ...(def?.wearable
              ? [{ label: e.equipped ? 'Unequip' : 'Equip', onclick: () => change(e.id, `${e.equipped ? 'unequips' : 'equips'} ${def.name}`, (l, i) => (l[i].equipped = !e.equipped)) }]
              : []),
            ...(def?.onUse?.length ? [{ label: 'Use…', onclick: () => (using = e.id) }] : []),
            { sep: true as const },
            ...session.players.filter((x) => x.id !== p.id).map((o) => ({ label: `Give ${e.qty > 1 ? howMany(e.id, e.qty) + ' ' : ''}to ${o.name}`, onclick: () => give(e.id, o.id) })),
            ...(pos ? [{ label: '⬇ Drop it here', onclick: () => drop(e.id) }] : []),
            { sep: true as const },
            { label: '− Remove', danger: true, onclick: () => remove(e.id) },
          ])}
      >
        <!-- Only the name drags: a press on the buttons, the amount box or Give → that moves a little is still a press. -->
        <span
          class="nm"
          draggable="true"
          ondragstart={(ev) => {
            itemDrag.now = { from: p.id, entryId: e.id, n: howMany(e.id, e.qty) };
            ev.dataTransfer?.setData('text/x-item', e.id);
            if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
          }}
          ondragend={dragDone}
          role="presentation"
          title="{entryName(game, e)}{about ? `: ${about}` : ''} · drag onto another player to give it{pos ? ', or onto the stage to drop it there' : ''}"
        >
          {entryName(game, e)}{e.qty > 1 ? ` ×${e.qty}` : ''}{def?.secret ? ' 🔒' : ''}
        </span>
        <!-- The buttons stay together: on the name's line, or all on the next one. -->
        <span class="acts">
          {#if def?.wearable}
            <button class="tiny" class:on={e.equipped} aria-pressed={!!e.equipped} onclick={() => change(e.id, `${e.equipped ? 'unequips' : 'equips'} ${def.name}`, (l, i) => (l[i].equipped = !e.equipped))}>
              {e.equipped ? 'Unequip' : 'Equip'}
            </button>
          {/if}
          {#if def?.onUse?.length}<button class="tiny" class:on={using === e.id} aria-pressed={using === e.id} onclick={() => (using = e.id)}>Use</button>{/if}
          {#if e.qty > 1}
            <input
              class="qty"
              type="number"
              min="1"
              max={e.qty}
              value={amounts[e.id] ?? 1}
              oninput={(ev) => (amounts[e.id] = +ev.currentTarget.value)}
              aria-label="How many of {entryName(game, e)}"
              title="How many to give, drop or remove"
            />
          {/if}
          <select
            class="tiny"
            aria-label="Give {entryName(game, e)} to"
            onchange={(ev) => {
              const to = ev.currentTarget.value;
              ev.currentTarget.value = '';
              // Let go of the keys: shortcuts ignore a focused select, and arrow keys would give it to someone else.
              ev.currentTarget.blur();
              if (to) give(e.id, to);
            }}
          >
            <option value="">Give →</option>
            {#each session.players.filter((x) => x.id !== p.id) as o (o.id)}<option value={o.id}>{o.name}</option>{/each}
          </select>
          {#if pos}<button class="tiny" title="Drop it on this screen (it can be picked up again)" aria-label="Drop {entryName(game, e)} on this screen" onclick={() => drop(e.id)}>⬇</button>{/if}
          <button class="tiny" title="Remove {e.qty > 1 ? 'that many' : 'it'}" aria-label="Remove {entryName(game, e)}" onclick={() => remove(e.id)}>−</button>
        </span>
      </div>
      {#if using === e.id && def?.onUse?.length}
        <InlineAsk
          text="{name} uses {def.name}: {def.onUse.map((a) => describeAction(game, a)).join(', ')}. {def.wearable ? 'Use it?' : 'Use it up?'}"
          ok="Use"
          onok={() => use(e.id)}
          oncancel={() => (using = null)}
        />
      {/if}
    {/each}
    <select
      class="tiny add"
      aria-label="Give {p.name} an item"
      onchange={(ev) => {
        const v = ev.currentTarget.value;
        ev.currentTarget.value = '';
        // Let go of the keys: shortcuts ignore a focused select, and arrow keys would give another item.
        ev.currentTarget.blur();
        giveNew(v);
      }}
    >
      <option value="">＋ Item…</option>
      {#each game.items ?? [] as it (it.id)}<option value={it.id}>{it.name}</option>{/each}
      <option value="*">Something else…</option>
    </select>
    {#if naming}
      <InlineAsk field="Name of the item" ok="Give" onok={giveMadeUp} oncancel={() => (naming = false)} />
    {/if}
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
    min-width: 250px;
    flex: 0 1 300px;
    font-size: 12px;
  }
  .pc.on {
    box-shadow: 0 0 0 2px var(--c);
  }
  /* A dragged item would go to them. */
  .pc.drop-on {
    outline: 2px dashed var(--accent);
    outline-offset: 2px;
  }
  /* Asked for from their menu. */
  .pc.flash {
    animation: flash 0.4s ease 3;
  }
  @keyframes flash {
    50% {
      box-shadow: 0 0 0 4px var(--c), 0 0 18px var(--c);
    }
  }
  .it .nm[draggable='true'] {
    cursor: grab;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }
  /* One line: a long name is cut short (it's in full on the stats strip and the sheet), so 📺 stays beside it. */
  .head {
    flex-wrap: nowrap;
  }
  .who {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    font-weight: 700;
    padding: 2px 8px 2px 2px;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .score {
    font-weight: 700;
  }
  .stats {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto minmax(0, 1fr);
    gap: 3px 4px;
    align-items: center;
  }
  .k {
    max-width: 64px;
    opacity: 0.85;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* The second stat on a line stands apart from the first. */
  .k:nth-child(4n + 3) {
    margin-left: 6px;
  }
  .v {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
  }
  .num {
    width: 64px;
    padding: 1px 4px;
  }
  /* A stat's number: − and + do what the box's spinners would, so they're hidden (they'd cover the number). */
  .sn {
    flex: 1;
    min-width: 24px;
    padding: 1px 3px;
    appearance: textfield;
  }
  .sn::-webkit-inner-spin-button {
    display: none;
  }
  .v .tiny {
    padding: 1px 4px;
  }
  .txt {
    flex: 1;
    min-width: 0;
    padding: 1px 4px;
  }
  .tiny {
    font-size: 12px;
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
  .qty {
    width: 44px;
    padding: 0 3px;
  }
  /* A long name is cut short (it's in full in its tooltip). */
  .nm {
    flex: 1;
    min-width: 60px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .acts {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
  }
  /* A long item or player name never widens the card (the Give → list gets narrower). */
  .add,
  .acts {
    max-width: 100%;
  }
  .acts select {
    min-width: 0;
  }
  .add {
    align-self: flex-start;
  }
</style>
