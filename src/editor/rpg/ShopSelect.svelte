<!--
  Which shop a character, a shop object or an "Open a shop" button opens: the game's shops, and ＋ New shop… to make
  one right here (selling every item in the catalog), with a line saying where shops are set up.
-->
<script lang="ts">
  import { app, editedGame } from '../../lib/app.svelte';
  import { nameStep, step } from '../../lib/history.svelte';
  import { goTo } from '../../lib/nav.svelte';
  import { newShop } from '../../lib/rpgpresets';

  let {
    value = $bindable(),
    none,
    name,
  }: {
    value: string | undefined;
    /** The choice for no shop (a character's), if it can have none. */
    none?: string;
    /** What a new shop is called ("Old Man's shop"); else "Shop N". */
    name?: string;
  } = $props();
  const game = $derived(editedGame());
  const gone = $derived(!!value && !game.shops?.some((s) => s.id === value));
  const shop = $derived(game.shops?.find((s) => s.id === value));
  let made = $state<string | null>(null);

  function create(sel: HTMLSelectElement): void {
    // Made and picked in one step.
    const make = () => {
      const s = newShop(game, name);
      value = s.id;
      return s;
    };
    // (Live in play, the game being edited isn't the editor's: no step of its history.)
    const s = app.editGame
      ? make()
      : step(null, () => {
          const s = make();
          nameStep(`Added shop “${s.name}”`);
          return s;
        });
    made = s.id;
    sel.value = s.id;
  }
</script>

<select
  value={value ?? ''}
  aria-label="Shop"
  onchange={(e) => {
    const v = e.currentTarget.value;
    if (v === '+') create(e.currentTarget);
    else value = v || undefined;
  }}
>
  {#if none !== undefined}<option value="">{none}</option>{:else if !value}<option value="">{game.shops?.length ? '— choose —' : '— no shops yet —'}</option>{/if}
  {#if gone}<option value={value}>⚠ Deleted shop — pick another</option>{/if}
  {#each game.shops ?? [] as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
  <option value="+">＋ New shop…</option>
</select>
<span class="muted small hint" data-shop-hint>
  {#if made && shop?.id === made}
    Made “{shop.name}”, selling {shop.stock.length ? `all ${shop.stock.length} item${shop.stock.length === 1 ? '' : 's'}` : 'nothing yet (add items)'}.
  {:else}
    Shops (what they sell, and the prices) are set up in 📊 Stats & Items.
  {/if}
  {#if !app.editGame}
    <button class="link" onclick={() => void goTo(shop ? { tab: 'stats', shop: shop.id } : { tab: 'stats' })}>{shop ? `Set up “${shop.name}” →` : 'Go there →'}</button>
  {/if}
</span>

<style>
  .hint {
    display: block;
  }
  .link {
    padding: 0;
    border: none;
    background: none;
    color: var(--accent);
    font-size: inherit;
    text-decoration: underline;
  }
</style>
