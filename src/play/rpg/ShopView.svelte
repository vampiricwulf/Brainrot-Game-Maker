<!-- A shop for the audience: its wares, prices and what's sold out. -->
<script lang="ts">
  import { mediaUrls } from '../../lib/media.svelte';
  import type { Game, Session } from '../../lib/model';
  import { currencyFields, formatStat, itemDef, shopPrice, statFields, stockLeft } from '../../lib/toolset';

  let { game, session, shopId }: { game: Game; session: Session; shopId: string } = $props();
  const shop = $derived(game.shops?.find((s) => s.id === shopId));
  const cur = $derived(statFields(game).find((f) => f.id === shop?.currency) ?? currencyFields(game)[0]);
</script>

{#if shop}
  <div class="shop">
    <h1>🛒 {shop.name}</h1>
    <div class="wares">
      {#each shop.stock as s (s.item)}
        {@const def = itemDef(game, s.item)}
        {@const left = stockLeft(session, shop, s.item)}
        {#if def}
          <div class="ware" class:out={left !== null && left <= 0}>
            {#if def.icon && mediaUrls[def.icon]}<img src={mediaUrls[def.icon]} alt="" />{:else}<span class="ic">📦</span>{/if}
            <div class="nm">{def.name}</div>
            {#if def.description}<div class="desc">{def.description}</div>{/if}
            <div class="price">{cur ? formatStat(cur, shopPrice(game, shop, s.item)) : shopPrice(game, shop, s.item)}</div>
            {#if left !== null}<div class="left">{left <= 0 ? 'SOLD OUT' : `${left} left`}</div>{/if}
          </div>
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
