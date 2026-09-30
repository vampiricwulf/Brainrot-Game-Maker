<!--
  A shop for the audience: its wares, prices, what's sold out, and who's shopping. In the host's window a ware can be
  clicked to buy it for the buyer.
-->
<script lang="ts">
  import { textOn } from '../../lib/colors';
  import { mediaUrls } from '../../lib/media.svelte';
  import type { Game, Session } from '../../lib/model';
  import { balance, formatPrice, itemDef, shopPrice, stockLeft } from '../../lib/toolset';

  let {
    game,
    session,
    shopId,
    buyer,
    onbuy,
  }: { game: Game; session: Session; shopId: string; buyer?: string; onbuy?: (itemId: string) => void } = $props();
  const shop = $derived(game.shops?.find((s) => s.id === shopId));
  const who = $derived(session.players.find((p) => p.id === buyer));
</script>

{#if shop}
  <div class="shop">
    <h1>🛒 {shop.name}</h1>
    {#if who}
      <div class="who">
        <span class="nm-chip" style:background={who.color} style:color={textOn(who.color)}>{who.name}</span>
        has {formatPrice(game, shop, balance(game, session, shop, who.id))}
      </div>
    {/if}
    <div class="wares">
      <!-- (An item listed twice, in a save from before the editor prevented it, shows once.) -->
      {#each shop.stock as s, i (i)}
        {@const def = itemDef(game, s.item)}
        {@const left = stockLeft(session, shop, s.item)}
        {#if def && shop.stock.findIndex((x) => x.item === s.item) === i}
          {@const out = left !== null && left <= 0}
          <svelte:element
            this={onbuy ? 'button' : 'div'}
            class="ware"
            class:out
            class:buy={!!onbuy}
            disabled={onbuy ? out : undefined}
            onclick={onbuy ? (e: MouseEvent) => (e.stopPropagation(), onbuy(s.item)) : undefined}
            aria-label={onbuy ? `Buy ${def.name}` : undefined}
            role={onbuy ? undefined : 'listitem'}
          >
            {#if def.icon && mediaUrls[def.icon]}<img src={mediaUrls[def.icon]} alt="" />{:else}<span class="ic">📦</span>{/if}
            <div class="nm">{def.name}</div>
            {#if def.description}<div class="desc">{def.description}</div>{/if}
            <div class="price">{formatPrice(game, shop, shopPrice(game, shop, s.item))}</div>
            {#if left !== null}<div class="left">{out ? 'SOLD OUT' : `${left} left`}</div>{/if}
          </svelte:element>
        {/if}
      {/each}
    </div>
  </div>
{/if}

<style>
  .shop {
    position: absolute;
    inset: 60px 100px;
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding: 30px 40px;
    border-radius: 30px;
    background: rgba(30, 14, 0, 0.93);
    border: 8px solid #ffcc00;
    color: #fff;
  }
  h1 {
    margin: 0;
    font: 90px 'Anton', 'Oswald', sans-serif;
    color: #ffcc00;
    text-align: center;
  }
  .wares {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 24px;
    overflow: hidden;
  }
  .ware {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 20px;
    border-radius: 20px;
    background: rgba(255, 255, 255, 0.08);
    text-align: center;
  }
  .ware.buy {
    font: inherit;
    color: inherit;
    border: 4px solid transparent;
    cursor: pointer;
  }
  .ware.buy:hover:not(:disabled) {
    border-color: #ffcc00;
    background: rgba(255, 204, 0, 0.15);
  }
  .who {
    text-align: center;
    font: 40px 'Anton', 'Oswald', sans-serif;
    margin-top: -12px;
  }
  .nm-chip {
    padding: 2px 16px;
    border-radius: 10px;
  }
  .ware.out {
    opacity: 0.45;
  }
  .ware img,
  .ic {
    width: 140px;
    height: 140px;
    object-fit: contain;
    font-size: 110px;
    line-height: 140px;
  }
  .nm {
    font: 44px 'Anton', 'Oswald', sans-serif;
  }
  .desc {
    font-size: 24px;
    opacity: 0.8;
  }
  .price {
    font-size: 48px;
    font-weight: 800;
    color: #ffcc00;
  }
  .left {
    font-size: 26px;
    font-weight: 700;
  }
  .out .left {
    color: #e6194b;
    font-size: 40px;
  }
</style>
