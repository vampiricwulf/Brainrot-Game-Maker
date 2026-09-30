<!--
  📊 Stats & Items: the game's player stats (HP, Gold, Vibes… host-defined), the item catalog, and shops. Used by
  RPG rounds, and shown on the stats strip in any mode.
-->
<script lang="ts">
  import { app, toast } from '../lib/app.svelte';
  import { downloadText, pickFile } from '../lib/fileio';
  import { newId, type ItemDef, type Shop, type StatField, type Wearable } from '../lib/model';
  import { allActions, worldObjects } from '../lib/refs';
  import { currencyFields, newStatField, STAT_PRESETS, shopCurrency, SCORE_CURRENCY } from '../lib/toolset';
  import { mediaUrls } from '../lib/media.svelte';
  import MediaPicker from './slide/MediaPicker.svelte';
  import ActionListEditor from './rpg/ActionListEditor.svelte';
  import WornLookEditor from './WornLookEditor.svelte';

  const game = $derived(app.game);
  let iconFor = $state<string | null>(null);
  let openItem = $state<string | null>(null);

  function addField(f: StatField): void {
    game.statFields = [...(game.statFields ?? []), f];
  }

  function removeField(f: StatField): void {
    if (!confirm(`Delete the stat "${f.name}"? Values players have for it are dropped.`)) return;
    game.statFields = (game.statFields ?? []).filter((x) => x.id !== f.id);
  }

  function addItem(): ItemDef {
    const it: ItemDef = { id: newId(), name: `Item ${(game.items?.length ?? 0) + 1}`, stackable: true, price: 1 };
    game.items = [...(game.items ?? []), it];
    openItem = it.id;
    return it;
  }

  function removeItem(it: ItemDef): void {
    if (!confirm(`Delete "${it.name}" from the catalog?`)) return;
    game.items = (game.items ?? []).filter((x) => x.id !== it.id);
    for (const s of game.shops ?? []) s.stock = s.stock.filter((x) => x.item !== it.id);
    // Objects that were it are picked up by their own name now; buttons that gave or took it have nothing chosen.
    for (const w of game.worlds ?? []) for (const el of worldObjects(w)) if (el.role?.class === 'item' && el.role.item === it.id) el.role.item = undefined;
    for (const a of allActions(game)) if (a.do === 'item' && a.item === it.id) a.item = '';
  }

  /** Tags are typed as a list, "poisoned, cursed" (read when the field is left, so a comma being typed stays put). */
  const tagList = (v: string) => v.split(',').map((t) => t.trim()).filter(Boolean);

  /** A shop's next thing to sell: the first item it doesn't sell yet (each item once, with its own price and stock). */
  function unstocked(s: Shop): ItemDef | undefined {
    return game.items?.find((it) => !s.stock.some((x) => x.item === it.id));
  }

  function addShop(): void {
    const s: Shop = { id: newId(), name: `Shop ${(game.shops?.length ?? 0) + 1}`, currency: currencyFields(game)[0]?.id, stock: [] };
    game.shops = [...(game.shops ?? []), s];
  }

  // CSV: name, price, stackable, slot, description (the columns a spreadsheet of items usually has).
  const csvCell = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  function exportCsv(): void {
    const rows = [['name', 'price', 'stackable', 'wearable', 'description'], ...(game.items ?? []).map((i) => [i.name, i.price ?? '', i.stackable ? 'yes' : 'no', i.wearable?.slot ?? '', i.description ?? ''])];
    downloadText(`${game.title || 'game'}-items.csv`, rows.map((r) => r.map(csvCell).join(',')).join('\n'), 'text/csv');
  }

  /** Split CSV text into rows (quoted fields may hold commas, quotes and line breaks). */
  function parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++;
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') row.push(cell), (cell = '');
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      } else cell += ch;
    }
    if (cell || row.length) rows.push([...row, cell]);
    return rows.filter((r) => r.some((c) => c.trim()));
  }

  async function importCsv(): Promise<void> {
    const file = await pickFile('.csv,text/csv');
    if (!file) return;
    const rows = parseCsv(await file.text());
    const head = rows[0]?.map((h) => h.trim().toLowerCase()) ?? [];
    const col = (name: string) => head.indexOf(name);
    const start = col('name') >= 0 ? 1 : 0;
    const n = col('name') >= 0 ? col('name') : 0;
    let added = 0;
    for (const r of rows.slice(start)) {
      const name = r[n]?.trim();
      if (!name) continue;
      const price = Number(r[col('price')] ?? '');
      const slot = r[col('wearable')]?.trim().toLowerCase();
      const existing = game.items?.find((i) => i.name.toLowerCase() === name.toLowerCase());
      const it: ItemDef = existing ?? { id: newId(), name, stackable: true };
      if (!isNaN(price) && r[col('price')] !== undefined && r[col('price')] !== '') it.price = price;
      if (col('stackable') >= 0) it.stackable = !/^(no|false|0)$/i.test(r[col('stackable')]?.trim() ?? '');
      if (slot === 'head' || slot === 'hand' || slot === 'body' || slot === 'badge') it.wearable = { slot };
      if (col('description') >= 0 && r[col('description')]) it.description = r[col('description')];
      if (!existing) {
        game.items = [...(game.items ?? []), it];
        added++;
      }
    }
    toast(`Imported ${rows.length - start} item row(s): ${added} new`);
  }
</script>

<h2>📊 Stats & Items</h2>
<p class="muted">
  Player stats, the item catalog and shops, used by RPG rounds (and shown on the stats strip in any round). Nothing is
  enforced: every number can be changed in play.
</p>

<section>
  <h3>Player stats</h3>
  {#if !game.statFields?.length}
    <p class="muted small">No stats yet. Start with a preset or make your own:</p>
  {/if}
  <div class="presets">
    {#each STAT_PRESETS as p (p.label)}<button class="small" onclick={() => addField(p.make())}>＋ {p.label}</button>{/each}
    <button class="small" onclick={() => addField(newStatField(`Stat ${(game.statFields?.length ?? 0) + 1}`))}>＋ Custom stat</button>
  </div>
  {#each game.statFields ?? [] as f (f.id)}
    <div class="field-row">
      <input class="name" bind:value={f.name} aria-label="Stat name" />
      <select bind:value={f.type} aria-label="{f.name} type">
        <option value="number">Number</option>
        <option value="text">Text</option>
        <option value="checkbox">Yes/no</option>
        <option value="tags">Tags</option>
      </select>
      <!-- What the type needs wraps inside its own column, so every row's audience, color and ✕ line up. -->
      <div class="by-type">
        {#if f.type === 'number'}
          <label class="small">Start<input type="number" class="n" value={Number(f.start ?? 0)} oninput={(e) => (f.start = +e.currentTarget.value)} /></label>
          <label class="small">Min<input type="number" class="n" value={f.min ?? ''} oninput={(e) => (f.min = e.currentTarget.value === '' ? undefined : +e.currentTarget.value)} /></label>
          <label class="small">Max<input type="number" class="n" value={f.max ?? ''} oninput={(e) => (f.max = e.currentTarget.value === '' ? undefined : +e.currentTarget.value)} /></label>
          <select bind:value={f.display} aria-label="{f.name} shown as">
            <option value="counter">Number</option>
            <option value="bar">Bar</option>
            <option value="hearts">Hearts</option>
          </select>
          <label class="check small"><input type="checkbox" bind:checked={f.currency} /> Currency</label>
          <input class="sym" bind:value={f.symbol} placeholder={f.currency ? '🪙' : 'Symbol'} aria-label="{f.name} symbol" title="Shown before the number, e.g. 🪙 or $" />
        {:else if f.type === 'text'}
          <label class="small">Start<input value={String(f.start ?? '')} oninput={(e) => (f.start = e.currentTarget.value)} /></label>
        {:else if f.type === 'checkbox'}
          <label class="check small"><input type="checkbox" checked={f.start === true} onchange={(e) => (f.start = e.currentTarget.checked)} /> Starts as yes</label>
        {:else}
          <label class="small">
            Start
            <input value={Array.isArray(f.start) ? f.start.join(', ') : ''} onchange={(e) => (f.start = tagList(e.currentTarget.value))} placeholder="e.g. poisoned, cursed" />
          </label>
        {/if}
      </div>
      <select bind:value={f.audience} aria-label="{f.name} audience">
        <option value="hud">On the stats strip</option>
        <option value="sheet">Only on the player sheet</option>
        <option value="hidden">Host only</option>
      </select>
      <input type="color" value={f.color ?? '#ffcc00'} oninput={(e) => (f.color = e.currentTarget.value)} aria-label="{f.name} color" />
      <button class="ghost small" onclick={() => removeField(f)} aria-label="Delete {f.name}">✕</button>
    </div>
  {/each}
  {#if game.statFields?.length && game.players.length}
    <details class="starts">
      <summary>Per-player starting values ("all mammals start with 4 gold")</summary>
      <table>
        <thead><tr><th></th>{#each game.statFields as f (f.id)}<th>{f.name}</th>{/each}</tr></thead>
        <tbody>
          {#each game.players as p (p.id)}
            <tr>
              <td style:color={p.color}>● {p.name}</td>
              {#each game.statFields as f (f.id)}
                <td>
                  {#if f.type === 'number'}
                    <input
                      type="number"
                      class="n"
                      placeholder={String(f.start ?? 0)}
                      value={p.stats?.[f.id] ?? ''}
                      oninput={(e) => {
                        const v = e.currentTarget.value;
                        p.stats = { ...(p.stats ?? {}) };
                        if (v === '') delete p.stats[f.id];
                        else p.stats[f.id] = +v;
                      }}
                      aria-label="{p.name} starting {f.name}"
                    />
                  {:else if f.type === 'text'}
                    <input
                      placeholder={String(f.start ?? '')}
                      value={p.stats?.[f.id] ?? ''}
                      oninput={(e) => (p.stats = { ...(p.stats ?? {}), [f.id]: e.currentTarget.value })}
                      aria-label="{p.name} starting {f.name}"
                    />
                  {:else if f.type === 'checkbox'}
                    {@const own = p.stats?.[f.id]}
                    <select
                      value={own === undefined ? '' : own ? 'yes' : 'no'}
                      onchange={(e) => {
                        const v = e.currentTarget.value;
                        p.stats = { ...(p.stats ?? {}) };
                        if (v === '') delete p.stats[f.id];
                        else p.stats[f.id] = v === 'yes';
                      }}
                      aria-label="{p.name} starting {f.name}"
                    >
                      <option value="">({f.start === true ? 'yes' : 'no'})</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  {:else}
                    {@const own = p.stats?.[f.id]}
                    <input
                      placeholder={Array.isArray(f.start) ? f.start.join(', ') : ''}
                      value={Array.isArray(own) ? own.join(', ') : ''}
                      onchange={(e) => {
                        const v = e.currentTarget.value;
                        p.stats = { ...(p.stats ?? {}) };
                        if (!v.trim()) delete p.stats[f.id];
                        else p.stats[f.id] = tagList(v);
                      }}
                      aria-label="{p.name} starting {f.name}"
                    />
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </details>
  {/if}
</section>

<section>
  <h3>Items</h3>
  <div class="row">
    <button onclick={addItem}>＋ Item</button>
    <button class="ghost small" onclick={importCsv} title="Columns: name, price, stackable, wearable, description">Import CSV…</button>
    <button class="ghost small" onclick={exportCsv} disabled={!game.items?.length}>Export CSV</button>
  </div>
  {#each game.items ?? [] as it (it.id)}
    <div class="item">
      <div class="item-row">
        <div class="pop">
          <button class="icon" onclick={() => (iconFor = it.id)} aria-label="Icon for {it.name}" title="Icon">
            {#if it.icon && mediaUrls[it.icon]}<img src={mediaUrls[it.icon]} alt="" />{:else}📦{/if}
          </button>
          {#if iconFor === it.id}<MediaPicker kind="image" onpick={(id) => ((it.icon = id), (iconFor = null))} onclose={() => (iconFor = null)} />{/if}
        </div>
        <input class="name" bind:value={it.name} aria-label="Item name" />
        <label class="small">Price<input type="number" class="n" value={it.price ?? ''} oninput={(e) => (it.price = e.currentTarget.value === '' ? undefined : +e.currentTarget.value)} /></label>
        <label class="check small"><input type="checkbox" bind:checked={it.stackable} /> Stacks</label>
        <select
          value={it.wearable?.slot ?? ''}
          onchange={(e) => {
            const slot = e.currentTarget.value as Wearable['slot'] | '';
            // Changing the slot keeps the picture; its position goes back to the new slot's.
            it.wearable = slot ? { slot, image: it.wearable?.image } : undefined;
            if (slot) openItem = it.id;
          }}
          aria-label="{it.name} worn on"
        >
          <option value="">Not worn</option>
          <option value="head">Worn on the head</option>
          <option value="hand">Held</option>
          <option value="body">Worn on the body</option>
          <option value="badge">Badge</option>
        </select>
        <label class="check small" title="Only the host sees it in inventories"><input type="checkbox" bind:checked={it.secret} /> Secret</label>
        <button class="ghost small" onclick={() => (openItem = openItem === it.id ? null : it.id)} aria-expanded={openItem === it.id}>More</button>
        <button class="ghost small" onclick={() => removeItem(it)} aria-label="Delete {it.name}">✕</button>
      </div>
      {#if openItem === it.id}
        <div class="more">
          <label class="field">Description (on its card)<textarea rows="2" bind:value={it.description}></textarea></label>
          <label class="field">Host notes (what it really does)<textarea rows="2" bind:value={it.hostNotes}></textarea></label>
          <div class="muted small">"Use" in play runs:</div>
          <ActionListEditor bind:actions={it.onUse} world={game.worlds?.[0]} />
          {#if it.wearable}
            {@const worn = it as ItemDef & { wearable: Wearable }}
            <div class="muted small">Worn look (how it shows on the avatar when equipped):</div>
            <WornLookEditor item={worn} />
          {/if}
        </div>
      {/if}
    </div>
  {:else}
    <p class="muted small">No items yet.</p>
  {/each}
</section>

<section>
  <h3>Shops</h3>
  <div class="row"><button onclick={addShop}>＋ Shop</button></div>
  {#each game.shops ?? [] as s (s.id)}
    <div class="shop">
      <div class="row">
        <input class="name" bind:value={s.name} aria-label="Shop name" />
        <label class="small">
          Charges
          <select
            value={shopCurrency(game, s) === 'score' ? SCORE_CURRENCY : s.currency ?? currencyFields(game)[0]?.id}
            onchange={(e) => (s.currency = e.currentTarget.value)}
            aria-label="{s.name} currency"
          >
            <option value={SCORE_CURRENCY}>Points (the score)</option>
            {#each currencyFields(game) as f (f.id)}<option value={f.id}>{f.name}</option>{/each}
          </select>
        </label>
        <label class="small" title="Shops with the same pool name share their stock">Shared stock pool<input bind:value={s.pool} placeholder="(none)" class="pool" /></label>
        <label class="small" title="Players can sell items here for this share of the price (blank: it doesn't buy things back)">
          Buys back at
          <input
            type="number"
            class="n"
            min="0"
            max="100"
            value={s.buysBack ? Math.round(s.buysBack.rate * 100) : ''}
            placeholder="—"
            oninput={(e) => (s.buysBack = e.currentTarget.value === '' ? undefined : { rate: Math.max(0, +e.currentTarget.value) / 100 })}
          />%
        </label>
        <span class="spacer"></span>
        <button class="ghost small" onclick={() => confirm(`Delete "${s.name}"?`) && (game.shops = (game.shops ?? []).filter((x) => x.id !== s.id))}>Delete shop</button>
      </div>
      <table>
        <tbody>
          {#each s.stock as st, i (i)}
            <tr>
              <td>
                <select bind:value={st.item} aria-label="Item for sale">
                  <!-- Each item once per shop: the ones other rows sell are greyed out. -->
                  {#each game.items ?? [] as it (it.id)}<option value={it.id} disabled={it.id !== st.item && s.stock.some((x) => x.item === it.id)}>{it.name}</option>{/each}
                </select>
              </td>
              <td><label class="small">Price<input type="number" class="n" value={st.price ?? ''} placeholder={String(game.items?.find((x) => x.id === st.item)?.price ?? 0)} oninput={(e) => (st.price = e.currentTarget.value === '' ? undefined : +e.currentTarget.value)} /></label></td>
              <td>
                <label class="small">
                  In stock<input type="number" class="n" min="0" value={st.qty ?? ''} placeholder="∞" oninput={(e) => (st.qty = e.currentTarget.value === '' ? null : +e.currentTarget.value)} />
                </label>
              </td>
              <td><button class="ghost small" onclick={() => s.stock.splice(i, 1)} aria-label="Remove from shop">✕</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
      <div class="row">
        <button
          class="small"
          disabled={!unstocked(s)}
          onclick={() => {
            const next = unstocked(s);
            if (next) s.stock.push({ item: next.id, qty: null });
          }}
          title={unstocked(s) ? undefined : game.items?.length ? 'It sells every item already' : 'Add items first'}>＋ Something to sell</button
        >
      </div>
    </div>
  {/each}
</section>

<style>
  h2 {
    margin: 0 0 6px;
  }
  section {
    margin: 18px 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  h3 {
    margin: 0;
  }
  .presets,
  .row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    align-items: center;
  }
  .field-row,
  .item-row {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
    padding: 4px 0;
    border-bottom: 1px solid var(--border);
  }
  /* Name, type, what the type needs, audience, color, ✕: the same columns on every row. */
  .field-row {
    display: grid;
    grid-template-columns: auto auto minmax(0, 1fr) auto auto auto;
  }
  .by-type {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }
  .name {
    width: 170px;
  }
  .n {
    width: 64px;
  }
  .sym {
    width: 72px;
  }
  .pool {
    width: 110px;
  }
  .small {
    font-size: 12px;
  }
  .icon {
    width: 36px;
    height: 36px;
    padding: 0;
    display: grid;
    place-items: center;
    overflow: hidden;
  }
  .icon img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .pop {
    position: relative;
  }
  .more {
    padding: 6px 0 8px 44px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .shop {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .starts table td,
  .starts table th {
    padding: 2px 6px;
    text-align: left;
    font-size: 12px;
  }
</style>
