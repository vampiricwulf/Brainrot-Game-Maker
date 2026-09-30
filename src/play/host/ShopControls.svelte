<!--
  Buying from the shop on screen: pick who buys, then an item. Short of money, the host can sell it anyway (the
  currency goes negative), give it free, or charge a different price. Stock can be changed on the spot.
-->
<script lang="ts">
  import { toast } from '../../lib/app.svelte';
  import { textOn } from '../../lib/colors';
  import type { Game, Session } from '../../lib/model';
  import { buy, currencyFields, entryName, inventory, sell, sellPrice, formatStat, itemDef, logged, setStock, shopPrice, statFields, statNumber, stockLeft } from '../../lib/toolset';

  let { game, session, shopId, selected }: { game: Game; session: Session; shopId: string; selected: string[] } = $props();
  const shop = $derived(game.shops?.find((s) => s.id === shopId));
  const cur = $derived(statFields(game).find((f) => f.id === shop?.currency) ?? currencyFields(game)[0]);
  let buyer = $state<string>('');
  $effect.pre(() => {
    if (!buyer || !session.players.some((p) => p.id === buyer)) buyer = selected[0] ?? session.players[0]?.id ?? '';
  });
  /** A purchase that came up short, waiting for the host's call. */
  let short = $state<{ item: string; error: string } | null>(null);

  function purchase(item: string, opts: { price?: number; allowShort?: boolean } = {}): void {
    if (!shop || !buyer) return;
    const s = shop;
    let result: ReturnType<typeof buy> | undefined;
    logged(session, `Shop: ${itemDef(game, item)?.name}`, () => (result = buy(game, session, s, buyer, item, opts)));
    if (!result) return;
    if (result.ok) {
      short = null;
      toast(result.text, 3000);
    } else if (result.error === 'Sold out') toast(`${itemDef(game, item)?.name} is sold out`);
    else short = { item, error: result.error };
  }

  function sellEntry(entryId: string): void {
    if (!shop || !buyer) return;
    const s = shop;
    let result: ReturnType<typeof sell> | undefined;
    logged(session, 'Shop: sell', () => (result = sell(game, session, s, buyer, entryId)));
    if (result) toast(result.ok ? result.text : result.error, 3000);
  }

  function otherPrice(item: string): void {
    const v = prompt('Price for this sale:', String(shopPrice(game, shop!, item)));
    if (v === null) return;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return void toast('That isn’t a price');
    purchase(item, { price: n, allowShort: true });
  }

  function restock(item: string): void {
    if (!shop) return;
    const left = stockLeft(session, shop, item);
    const v = prompt('How many left? (blank = unlimited)', left === null ? '' : String(left));
    if (v === null) return;
    const s = shop;
    logged(session, `Restock ${itemDef(game, item)?.name}`, () => setStock(session, s, item, v.trim() === '' ? null : Math.max(0, Math.round(Number(v) || 0))));
  }
</script>

{#if shop}
  <div class="row">
    <span class="muted small">Buyer:</span>
    {#each session.players as p (p.id)}
      {@const on = buyer === p.id}
      <button class="chip" style:border-color={p.color} style:background={on ? p.color : undefined} style:color={on ? textOn(p.color) : undefined} onclick={() => ((buyer = p.id), (short = null))}>
        {p.name}{cur ? ` ${formatStat(cur, statNumber(game, session, p.id, cur))}` : ''}
      </button>
    {/each}
  </div>
  <div class="row">
    {#each shop.stock as s (s.item)}
      {@const def = itemDef(game, s.item)}
      {@const left = stockLeft(session, shop, s.item)}
      {#if def}
        <span class="ware">
          <button class="small" disabled={left !== null && left <= 0} onclick={() => purchase(s.item)} title="Buy for the selected buyer">
            {def.name} · {cur ? formatStat(cur, shopPrice(game, shop, s.item)) : shopPrice(game, shop, s.item)}{left !== null ? ` (${left})` : ''}
          </button>
          <button class="tiny ghost" onclick={() => restock(s.item)} title="Change the stock">📦</button>
        </span>
      {/if}
    {/each}
  </div>
  {#if shop.buysBack}
    {@const sellable = inventory(session, buyer).filter((e) => sellPrice(game, shop, e.item) !== null)}
    <div class="row">
      <span class="muted small">Sell ({Math.round(shop.buysBack.rate * 100)}%):</span>
      {#each sellable as e (e.id)}
        {@const pr = sellPrice(game, shop, e.item) ?? 0}
        <button class="small" onclick={() => sellEntry(e.id)}>{entryName(game, e)}{e.qty > 1 ? ` ×${e.qty}` : ''} → {cur ? formatStat(cur, pr) : pr}</button>
      {:else}
        <span class="muted small">Nothing to sell.</span>
      {/each}
    </div>
  {/if}
  {#if short}
    {@const it = short.item}
    <div class="row warn">
      <span>{short.error} for {itemDef(game, it)?.name}.</span>
      <button class="small" onclick={() => purchase(it, { allowShort: true })}>Sell anyway</button>
      <button class="small" onclick={() => purchase(it, { price: 0 })}>Give it free</button>
      <button class="small" onclick={() => otherPrice(it)}>Other price…</button>
      <button class="small ghost" onclick={() => (short = null)}>Cancel</button>
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
</style>
