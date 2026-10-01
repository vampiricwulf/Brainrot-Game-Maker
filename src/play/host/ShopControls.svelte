<!--
  Buying from the shop on screen: pick who buys, then an item (here, or by clicking it on the stage). Short of money,
  the host can sell it anyway (going below zero), give it free, or charge a different price. Stock can be changed on
  the spot, a shop that buys back lists what the buyer can sell, and 🚪 Leave shop closes it.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { app, toast } from '../../lib/app.svelte';
  import { textOn } from '../../lib/colors';
  import type { Game, Session } from '../../lib/model';
  import { balance, entryName, formatPrice, inventory, itemDef, logged, sell, sellPrice, setStock, shopPrice, stockLeft } from '../../lib/toolset';
  import { playerName } from '../../lib/session';
  import { shopBuy, shopBuyer } from './shopops';

  let { game, session, selected }: { game: Game; session: Session; selected: string[] } = $props();
  const o = $derived(app.live.overlay?.kind === 'shop' ? app.live.overlay : undefined);
  const shop = $derived(o ? game.shops?.find((s) => s.id === o.shopId) : undefined);
  const buyer = $derived(o ? (shopBuyer(o, session, selected) ?? '') : '');

  function purchase(item: string, opts: { price?: number; allowShort?: boolean } = {}): void {
    if (o) shopBuy(game, session, o, selected, item, opts);
  }

  function sellEntry(entryId: string): void {
    if (!shop || !buyer) return;
    const s = shop;
    const who = buyer;
    const entry = inventory(session, who).find((e) => e.id === entryId);
    let result: ReturnType<typeof sell> | undefined;
    logged(session, `${playerName(session, who)} sells ${entry ? entryName(game, entry) : 'an item'}`, () => (result = sell(game, session, s, who, entryId)));
    if (result) toast(result.ok ? result.text : result.error, 3000);
  }

  /** A price for this sale, or the stock left, being typed in (asked inline: a browser dialog would show on stream). */
  let asking = $state<{ what: 'price' | 'stock'; item: string } | null>(null);
  let typed = $state<number | null>(null);
  let priceBox = $state<HTMLInputElement>();
  let stockBox = $state<HTMLInputElement>();

  // Each goes into its box (the button that asked keeps the focus otherwise, and typing would reach the shortcuts).
  function otherPrice(item: string): void {
    asking = { what: 'price', item };
    typed = shopPrice(game, shop!, item);
    tick().then(() => priceBox?.select());
  }

  function restock(item: string): void {
    if (!shop) return;
    asking = { what: 'stock', item };
    typed = stockLeft(session, shop, item);
    tick().then(() => stockBox?.select());
  }

  /** Sell at the price typed, or set the stock left (blank = unlimited). */
  function answer(): void {
    const a = asking;
    const v = typed;
    if (!a || !shop) return;
    asking = null;
    if (a.what === 'price') {
      if (v === null || v < 0) return void toast('That isn’t a price');
      purchase(a.item, { price: v, allowShort: true });
      return;
    }
    const s = shop;
    logged(session, `Restock ${itemDef(game, a.item)?.name}`, () => setStock(session, s, a.item, v === null ? null : Math.max(0, Math.round(v))));
  }

  function keys(e: KeyboardEvent): void {
    if (e.key === 'Enter') answer();
    else if (e.key === 'Escape') asking = null;
  }
</script>

{#if shop && o}
  <div class="row">
    <span class="muted small">Buyer:</span>
    {#each session.players as p (p.id)}
      {@const on = buyer === p.id}
      <button
        class="chip"
        style:border-color={p.color}
        style:background={on ? p.color : undefined}
        style:color={on ? textOn(p.color) : undefined}
        aria-pressed={on}
        onclick={() => ((o.buyer = p.id), (o.short = undefined))}
      >
        {p.name} {formatPrice(game, shop, balance(game, session, shop, p.id))}
      </button>
    {/each}
    <span class="spacer"></span>
    <button onclick={() => (app.live.overlay = null)} title="Close the shop (Esc)">🚪 Leave shop</button>
  </div>
  <div class="row">
    <span class="muted small">Buy (or click it on the stage):</span>
    <!-- (An item listed twice, in a save from before the editor prevented it, shows once.) -->
    {#each shop.stock as s, i (i)}
      {@const def = itemDef(game, s.item)}
      {@const left = stockLeft(session, shop, s.item)}
      {#if def && shop.stock.findIndex((x) => x.item === s.item) === i}
        <span class="ware">
          <button class="small" disabled={left !== null && left <= 0} onclick={() => purchase(s.item)} title="Buy one for the buyer">
            {def.name} · {formatPrice(game, shop, shopPrice(game, shop, s.item))}{left !== null ? ` (${left})` : ''}
          </button>
          <button class="tiny ghost" onclick={() => restock(s.item)} title="Change the stock">📦</button>
        </span>
      {/if}
    {/each}
  </div>
  {#if asking?.what === 'stock'}
    <div class="row">
      <label class="check small">
        How many {itemDef(game, asking.item)?.name} left?
        <input class="n" type="number" min="0" placeholder="∞" bind:this={stockBox} bind:value={typed} onkeydown={keys} />
      </label>
      <span class="muted small">Blank = unlimited</span>
      <button class="small" onclick={answer}>Set</button>
      <button class="small ghost" onclick={() => (asking = null)}>Cancel</button>
    </div>
  {/if}
  {#if shop.buysBack}
    {@const sellable = inventory(session, buyer).filter((e) => sellPrice(game, shop, e.item) !== null)}
    <div class="row">
      <span class="muted small">Sell ({Math.round(shop.buysBack.rate * 100)}%):</span>
      {#each sellable as e (e.id)}
        {@const pr = sellPrice(game, shop, e.item) ?? 0}
        <button class="small" onclick={() => sellEntry(e.id)}>{entryName(game, e)}{e.qty > 1 ? ` ×${e.qty}` : ''} → {formatPrice(game, shop, pr)}</button>
      {:else}
        <span class="muted small">Nothing to sell.</span>
      {/each}
    </div>
  {/if}
  {#if o.short}
    {@const it = o.short.item}
    <div class="row warn" role="alert">
      <span>{o.short.error} for {itemDef(game, it)?.name}.</span>
      {#if asking?.what === 'price' && asking.item === it}
        <label class="check">
          Price
          <input class="n" type="number" min="0" bind:this={priceBox} bind:value={typed} onkeydown={keys} />
        </label>
        <button class="small" onclick={answer}>Sell</button>
        <button class="small ghost" onclick={() => (asking = null)}>Cancel</button>
      {:else}
        <button class="small" onclick={() => purchase(it, { allowShort: true })}>Sell anyway</button>
        <button class="small" onclick={() => purchase(it, { price: 0 })}>Give it free</button>
        <button class="small" onclick={() => otherPrice(it)}>Other price…</button>
        <button class="small ghost" onclick={() => (o.short = undefined)}>Cancel</button>
      {/if}
    </div>
  {/if}
{/if}

<style>
  .row {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }
  .chip {
    border-width: 2px;
    padding: 1px 8px;
    font-size: 12px;
  }
  .ware {
    display: inline-flex;
    gap: 2px;
  }
  .warn {
    color: var(--warn);
    font-size: 12px;
  }
  .small {
    font-size: 12px;
  }
  .tiny {
    font-size: 11px;
    padding: 1px 5px;
  }
  .n {
    width: 80px;
  }
</style>
