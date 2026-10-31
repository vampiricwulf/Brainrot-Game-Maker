<!--
  Buying from the shop on screen: pick who buys, then an item (here, or by clicking it on the stage). Short of money,
  the host can sell it anyway (going below zero), give it free, or charge a different price. Stock can be changed on
  the spot, a shop that buys back lists what the buyer can sell, and 🚪 Leave shop closes it. Each question asks in the
  panel's way: Cancel first, the answer last; in a box Enter answers and Esc cancels.
-->
<script lang="ts">
  import { app, toast } from '../../lib/app.svelte';
  import { textOn } from '../../lib/colors';
  import type { Game, Session } from '../../lib/model';
  import { blip } from '../../lib/live';
  import { balance, entryName, formatPrice, inventory, itemDef, logged, sell, sellPrice, setStock, shopPrice, stockLeft } from '../../lib/toolset';
  import { playerName } from '../../lib/session';
  import InlineAsk from './InlineAsk.svelte';
  import { shopBuy, shopBuyer } from './shopops';
  import { stockAsk } from './shopask.svelte';
  import { untrack } from 'svelte';

  let { game, session, selected }: { game: Game; session: Session; selected: string[] } = $props();
  const o = $derived(app.live.overlay?.kind === 'shop' ? app.live.overlay : undefined);
  const shop = $derived(o ? game.shops?.find((s) => s.id === o.shopId) : undefined);
  const buyer = $derived(o ? (shopBuyer(o, session, selected) ?? '') : '');
  // A shop that's gone (deleted in the editor) would leave a blank dimmed screen on stream: close it.
  $effect(() => {
    if (o && !shop) {
      app.live.overlay = null;
      toast('That shop no longer exists, so it was closed');
    }
  });

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
    if (result?.ok) blip(app.live, 'coin');
  }

  /**
   * A price for this sale, or the stock left, being typed in (asked inline: a browser dialog would show on stream), with
   * what its box starts with. Each goes into its box (typing would reach the shortcuts otherwise).
   */
  let asking = $state<{ what: 'price' | 'stock'; item: string; start: string } | null>(null);

  // A price typed in before (and still short) starts the box again.
  function otherPrice(item: string): void {
    asking = { what: 'price', item, start: String(o?.short?.price ?? shopPrice(game, shop!, item)) };
  }

  function restock(item: string): void {
    if (!shop) return;
    const left = stockLeft(session, shop, item, game);
    asking = { what: 'stock', item, start: left === null ? '' : String(left) };
  }

  // A ware's 📦 Change the stock… from its menu on the stage: asked here, as by its 📦.
  $effect(() => {
    const item = stockAsk.item;
    if (!item) return;
    stockAsk.item = null;
    untrack(() => restock(item));
  });

  /** Sell at the price typed, or set the stock left (blank = unlimited). */
  function answer(typed: string): void {
    const a = asking;
    const v = typed === '' ? null : Number(typed);
    if (!a || !shop) return;
    asking = null;
    if (a.what === 'price') {
      if (v === null || !Number.isFinite(v) || v < 0) return void toast('That isn’t a price');
      // Short of it at that price too: it says so (Sell anyway is still there), as at the usual price.
      purchase(a.item, { price: v, allowShort: false });
      return;
    }
    if (v !== null && !Number.isFinite(v)) return void toast('That isn’t a number');
    const s = shop;
    logged(session, `Restock ${itemDef(game, a.item)?.name}`, () => setStock(session, s, a.item, v === null ? null : Math.max(0, Math.round(v))));
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
        data-player-id={p.id}
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
      {@const left = stockLeft(session, shop, s.item, game)}
      {#if def && shop.stock.findIndex((x) => x.item === s.item) === i}
        <span class="ware">
          <button class="small" disabled={left !== null && left <= 0} onclick={() => purchase(s.item)} title="Buy one for the buyer">
            {def.name} · {formatPrice(game, shop, shopPrice(game, shop, s.item))}{left !== null ? ` (${left})` : ''}
          </button>
          <button class="tiny ghost" onclick={() => restock(s.item)} title="Change the stock" aria-label="Change the stock of {def.name}">📦</button>
        </span>
      {/if}
    {/each}
  </div>
  {#if asking?.what === 'stock'}
    {#key asking}
      <InlineAsk
        text="How many {itemDef(game, asking.item)?.name} left? Blank = unlimited"
        field="Stock left"
        placeholder="∞"
        number
        blankOk
        value={asking.start}
        ok="Set"
        onok={answer}
        oncancel={() => (asking = null)}
      />
    {/key}
  {/if}
  {#if shop.buysBack}
    {@const sellable = inventory(session, buyer).filter((e) => sellPrice(game, shop, e.item) !== null)}
    <div class="row">
      <span class="muted small">Sell ({Math.round(shop.buysBack.rate * 100)}%):</span>
      {#each sellable as e (e.id)}
        {@const pr = sellPrice(game, shop, e.item) ?? 0}
        <button class="small" onclick={() => sellEntry(e.id)} title={e.equipped ? 'The one they wear' : undefined}>{entryName(game, e)}{e.qty > 1 ? ` ×${e.qty}` : ''}{e.equipped ? ' (worn)' : ''} → {formatPrice(game, shop, pr)}</button>
      {:else}
        <span class="muted small">Nothing to sell.</span>
      {/each}
    </div>
  {/if}
  <!-- (Worked out from the buyer's money now: an Undo, a sale or a score change can shrink the gap or close it.) -->
  {@const gap = o.short ? (o.short.price ?? shopPrice(game, shop, o.short.item)) - balance(game, session, shop, buyer) : 0}
  {#if o.short && gap > 0}
    {@const it = o.short.item}
    <!-- (Short at a price typed in: Sell anyway sells at that price.) -->
    {@const at = o.short.price}
    {@const short = `Short by ${formatPrice(game, shop, gap)} for ${itemDef(game, it)?.name}.`}
    <!-- (Cancel first; Give it free and Other price… between; Sell anyway, the buyer going below zero, last.) -->
    <div class="small" role="alert">
      {#if asking?.what === 'price' && asking.item === it}
        {#key asking}
          <InlineAsk text={short} field="Price" number value={asking.start} ok="Sell" onok={answer} oncancel={() => (asking = null)} />
        {/key}
      {:else}
        <InlineAsk
          text={short}
          ok="Sell anyway"
          alts={[
            { label: 'Give it free', onclick: () => purchase(it, { price: 0 }) },
            { label: 'Other price…', onclick: () => otherPrice(it) },
          ]}
          onok={() => purchase(it, { allowShort: true, price: at })}
          oncancel={() => (o.short = undefined)}
        />
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
  .small {
    font-size: 12px;
  }
  .tiny {
    font-size: 12px;
    padding: 1px 5px;
  }
</style>
