<!--
  📊 Stats & Items: the game's player stats (HP, Gold, Vibes… host-defined), the item catalog, and shops. Used by
  RPG rounds, and shown on the stats strip in any mode.
-->
<script lang="ts">
  import PageHeader from './PageHeader.svelte';
  import { tick } from 'svelte';
  import { app, toast } from '../lib/app.svelte';
  import { tell } from '../lib/ask.svelte';
  import { flash, take } from '../lib/nav.svelte';
  import { step } from '../lib/history.svelte';
  import { DragOrder, rowKeys } from '../lib/dragorder.svelte';
  import { copyItem, copyShop, copyStat, moveTo } from '../lib/listedit';
  import { dropMenu, showMenu } from '../lib/menustate.svelte';
  import { isTextField } from '../lib/undokeys';
  import { pickFile, safeFilename, saveFile, savedWhere } from '../lib/fileio';
  import { newId, type ItemDef, type Shop, type StatField, type Wearable } from '../lib/model';
  import { allActions, worldObjects } from '../lib/refs';
  import { currencyFields, newStatField, STAT_PRESETS, shopCurrency, shopCurrencyGone, SCORE_CURRENCY, statRangeProblem } from '../lib/toolset';
  import { mediaUrls } from '../lib/media.svelte';
  import MediaPicker from './slide/MediaPicker.svelte';
  import { mediaDrop } from '../lib/mediadrop';
  import ActionListEditor from './rpg/ActionListEditor.svelte';
  import WornLookEditor from './WornLookEditor.svelte';

  const game = $derived(app.game);
  let iconFor = $state<string | null>(null);
  let openItem = $state<string | null>(null);
  // An undo or redo of an item's settings opens them.
  const handled = { seq: 0 };
  $effect(() => {
    const place = take(handled);
    if (place?.tab === 'stats' && place.item) openItem = place.item;
  });

  /** A stat, item or shop just added: the typing goes to its name (selected, to type over). */
  function focusName(kind: Kind, id: string): void {
    void tick().then(() => {
      const el = document.querySelector<HTMLInputElement>(`[data-place="${kind}:${id}"] input.name`);
      el?.focus();
      el?.select();
    });
  }

  function addField(f: StatField): void {
    game.statFields = [...(game.statFields ?? []), f];
    focusName('stat', f.id);
  }

  // Deleting is done at once: the note at the bottom offers Undo.
  function removeField(f: StatField): void {
    // Shops that charged it say so (and charge the first other currency, or points, until one is picked).
    const shops = (game.shops ?? []).filter((s) => s.currency === f.id).map((s) => `“${s.name}”`);
    const also = shops.length ? ` · shop${shops.length === 1 ? '' : 's'} ${shops.join(', ')} charged it: pick what ${shops.length === 1 ? 'it charges' : 'they charge'}` : '';
    step(`Deleted stat “${f.name}”${also}`, () => (game.statFields = (game.statFields ?? []).filter((x) => x.id !== f.id)), { notify: true });
  }

  function addItem(): ItemDef {
    const it: ItemDef = { id: newId(), name: `Item ${(game.items?.length ?? 0) + 1}`, stackable: true, price: 1 };
    game.items = [...(game.items ?? []), it];
    openItem = it.id;
    focusName('item', it.id);
    return it;
  }

  function removeItem(it: ItemDef): void {
    const shops = (game.shops ?? []).filter((s) => s.stock.some((x) => x.item === it.id)).length;
    const also = shops ? ` · also from ${shops} shop${shops === 1 ? '' : 's'}` : '';
    step(
      `Deleted item “${it.name}”${also}`,
      () => {
        game.items = (game.items ?? []).filter((x) => x.id !== it.id);
        for (const s of game.shops ?? []) s.stock = s.stock.filter((x) => x.item !== it.id);
        // Objects that were it are picked up by their own name now; buttons that gave or took it have nothing chosen.
        for (const w of game.worlds ?? []) for (const el of worldObjects(w)) if (el.role?.class === 'item' && el.role.item === it.id) el.role.item = undefined;
        for (const a of allActions(game)) if (a.do === 'item' && a.item === it.id) a.item = '';
      },
      { notify: true },
    );
  }

  /** Tags are typed as a list, "poisoned, cursed" (read when the field is left, so a comma being typed stays put). */
  const tagList = (v: string) => [...new Set(v.split(',').map((t) => t.trim()).filter(Boolean))];

  /** Whether a shop has items left to sell (each item once, with its own price and stock). */
  function unstocked(s: Shop): boolean {
    return !!game.items?.some((it) => !s.stock.some((x) => x.item === it.id));
  }

  function addShop(): void {
    const s: Shop = { id: newId(), name: `Shop ${(game.shops?.length ?? 0) + 1}`, currency: currencyFields(game)[0]?.id, stock: [] };
    game.shops = [...(game.shops ?? []), s];
    focusName('shop', s.id);
  }

  function removeShop(s: Shop): void {
    step(`Deleted shop “${s.name}”`, () => (game.shops = (game.shops ?? []).filter((x) => x.id !== s.id)), { notify: true });
  }

  /** Sell these items here too (each item once per shop). */
  function stock(s: Shop, items: ItemDef[]): void {
    if (!items.length) return;
    const what = items.length === 1 ? `“${items[0].name}”` : `${items.length} items`;
    step(`Selling ${what} in shop “${s.name}”`, () => {
      for (const it of items) if (!s.stock.some((x) => x.item === it.id)) s.stock.push({ item: it.id, qty: null });
    });
  }

  /** What a shop can sell yet, under its button, and all of them at once. */
  function stockMenu(e: MouseEvent, s: Shop): void {
    const left = (game.items ?? []).filter((it) => !s.stock.some((x) => x.item === it.id));
    dropMenu(e, [
      ...left.map((it) => ({ label: it.name, onclick: () => stock(s, [it]) })),
      ...(left.length > 1 ? [{ sep: true as const }, { label: '＋ Add everything', onclick: () => stock(s, left), hint: `${left.length} items` }] : []),
    ]);
  }

  // ---------- Order, copies and the rows' menus ----------

  type Kind = 'stat' | 'item' | 'shop';
  type Row = StatField | ItemDef | Shop;
  const KEY = { stat: 'statFields', item: 'items', shop: 'shops' } as const;
  const listOf = (kind: Kind): Row[] => game[KEY[kind]] ?? [];

  /** Move a stat, item or shop from `from` to `to`: the order players see them in (▲▼ in its menu, Alt+↑/↓, a drag). */
  function move(kind: Kind, from: number, to: number): void {
    const list = listOf(kind);
    const x = list[from];
    if (!x || to < 0 || to >= list.length || to === from) return;
    step(`Moved ${kind} “${x.name}” ${to < from ? 'up' : 'down'}`, () => moveTo(list, from, to));
  }

  /** A copy right after it, with fresh ids (an item's buttons and pop-ups too); players' values stay with the original. */
  function duplicate(kind: Kind, x: Row): void {
    const list = listOf(kind);
    const names = list.map((r) => r.name);
    const copy = kind === 'stat' ? copyStat(x as StatField, names) : kind === 'item' ? copyItem(x as ItemDef, names) : copyShop(x as Shop, names);
    step(`Duplicated ${kind} “${x.name}”`, () => {
      const next = [...list];
      next.splice(list.indexOf(x) + 1, 0, copy);
      if (kind === 'stat') game.statFields = next as StatField[];
      else if (kind === 'item') game.items = next as ItemDef[];
      else game.shops = next as Shop[];
    });
    if (kind === 'item' && openItem === x.id) openItem = copy.id;
    flash(`${kind}:${copy.id}`);
  }

  function remove(kind: Kind, x: Row): void {
    if (kind === 'stat') removeField(x as StatField);
    else if (kind === 'item') removeItem(x as ItemDef);
    else removeShop(x as Shop);
  }

  /** Right-click a row (not in a text box, which keeps the browser's own menu). */
  function rowMenu(e: MouseEvent, kind: Kind, x: Row, i: number): void {
    if (isTextField(e.target)) return;
    const n = listOf(kind).length;
    showMenu(e, [
      { heading: x.name },
      { label: '⧉ Duplicate', onclick: () => duplicate(kind, x), keys: 'Ctrl+D' },
      { label: '▲ Move up', onclick: () => move(kind, i, i - 1), disabled: i === 0, keys: 'Alt+↑' },
      { label: '▼ Move down', onclick: () => move(kind, i, i + 1), disabled: i === n - 1, keys: 'Alt+↓' },
      { sep: true },
      { label: `🗑 Delete ${kind}`, danger: true, onclick: () => remove(kind, x) },
    ]);
  }

  const drags = { stat: new DragOrder(), item: new DragOrder(), shop: new DragOrder() };

  /** A shop's row being dragged, and the item icon dragged onto a shop (to sell it there). */
  const wares = new DragOrder();
  let iconDrag = $state<string | null>(null);

  // Rows for sale have no id of their own: each row object gets one while it's shown, so it keeps its place.
  const wareIds = new WeakMap<object, string>();
  function wareId(x: object): string {
    let id = wareIds.get(x);
    if (!id) wareIds.set(x, (id = newId()));
    return id;
  }

  const wareName = (s: Shop, i: number) => game.items?.find((it) => it.id === s.stock[i]?.item)?.name ?? 'item';

  function moveWare(s: Shop, from: number, to: number): void {
    if (to < 0 || to >= s.stock.length || to === from) return;
    step(`Moved “${wareName(s, from)}” ${to < from ? 'up' : 'down'} in shop “${s.name}”`, () => moveTo(s.stock, from, to));
  }

  /** Done at once (the item stays in the game): the note at the bottom offers Undo. */
  function unstock(s: Shop, i: number): void {
    step(`Stopped selling “${wareName(s, i)}” in shop “${s.name}”`, () => s.stock.splice(i, 1), { notify: true });
  }

  /** Right-click a row a shop sells (not in its boxes): move it, or stop selling it. Each item is sold once, so no copy. */
  function wareMenu(e: MouseEvent, s: Shop, i: number): void {
    if (isTextField(e.target)) return;
    showMenu(e, [
      { heading: wareName(s, i) },
      { label: '▲ Move up', onclick: () => moveWare(s, i, i - 1), disabled: i === 0, keys: 'Alt+↑' },
      { label: '▼ Move down', onclick: () => moveWare(s, i, i + 1), disabled: i === s.stock.length - 1, keys: 'Alt+↓' },
      { sep: true },
      { label: '− Remove from shop', danger: true, onclick: () => unstock(s, i) },
    ]);
  }

  // CSV: name, price, stackable, slot, description (the columns a spreadsheet of items usually has).
  const csvCell = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  /** Saved like the game's own files (BrainrotSaves in the desktop app, a download in a browser). */
  async function exportCsv(): Promise<void> {
    const rows = [['name', 'price', 'stackable', 'wearable', 'description'], ...(game.items ?? []).map((i) => [i.name, i.price ?? '', i.stackable ? 'yes' : 'no', i.wearable?.slot ?? '', i.description ?? ''])];
    const name = `${safeFilename(game.title)}-items.csv`;
    try {
      toast(savedWhere(await saveFile(name, new Blob([rows.map((r) => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv' })), name));
    } catch (e) {
      void tell('Export failed: ' + (e as Error).message);
    }
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
    step(`Imported items from “${file.name}”`, () => {
      for (const r of rows.slice(start)) {
        const name = r[n]?.trim();
        if (!name) continue;
        const price = Number(r[col('price')] ?? '');
        const slot = r[col('wearable')]?.trim().toLowerCase();
        const existing = game.items?.find((i) => i.name.toLowerCase() === name.toLowerCase());
        const it: ItemDef = existing ?? { id: newId(), name, stackable: true };
        if (!isNaN(price) && r[col('price')] !== undefined && r[col('price')] !== '') it.price = price;
        if (col('stackable') >= 0) it.stackable = !/^(no|false|0)$/i.test(r[col('stackable')]?.trim() ?? '');
        // (Its worn look, picture and place on the avatar, stays: only the slot is the file's.)
        if (slot === 'head' || slot === 'hand' || slot === 'body' || slot === 'badge') it.wearable = { ...it.wearable, slot };
        if (col('description') >= 0 && r[col('description')]) it.description = r[col('description')];
        if (!existing) {
          game.items = [...(game.items ?? []), it];
          added++;
        }
      }
    });
    toast(`Imported ${rows.length - start} item row(s): ${added} new`);
  }

  /**
   * A stat's type changed: its start, and the players' own starts, were of the old type (10 gold would start every
   * player ticked as a Yes/no), so they go back to the new type's default.
   */
  function setStatType(f: StatField, type: StatField['type']): void {
    if (type === f.type) return;
    f.type = type;
    delete f.start;
    for (const p of game.players) if (p.stats && f.id in p.stats) delete p.stats[f.id];
  }
</script>

{#snippet grip(kind: Kind, id: string, what: string)}
  <span
    class="drag-grip"
    draggable="true"
    ondragstart={(e) => drags[kind].start(e, id, (e.currentTarget as HTMLElement).closest('.drag-row'))}
    ondragend={() => drags[kind].end()}
    aria-hidden="true"
    title="Drag to reorder {what} (or Alt+↑/↓) · right-click for more">⋮⋮</span
  >
{/snippet}

<PageHeader
  title="Stats & Items"
  sub="Player stats, the item catalog and shops, for RPG rounds (the stats strip shows in any round). Nothing is enforced: every number can be changed in play."
/>

<section>
  <h3>Player stats</h3>
  {#if !game.statFields?.length}
    <p class="hint">No stats yet. Start with a preset or make your own:</p>
  {/if}
  <div class="presets">
    {#each STAT_PRESETS as p (p.label)}
      {@const name = p.make().name}
      {@const added = game.statFields?.some((f) => f.name.trim().toLowerCase() === name.toLowerCase())}
      <button class="small" onclick={() => addField(p.make())} disabled={added} title={added ? `This game has a stat called ${name}` : undefined}>＋ {p.label}</button>
    {/each}
    <button class="small" onclick={() => addField(newStatField(`Stat ${(game.statFields?.length ?? 0) + 1}`))}>＋ Add custom stat</button>
  </div>
  <!-- A list only with rows in it (one that's empty, or holds only "No items yet", misleads a screen reader). -->
  <div class="list" role={game.statFields?.length ? 'list' : undefined} aria-label={game.statFields?.length ? 'Stats' : undefined}>
    {#each game.statFields ?? [] as f, i (f.id)}
      {@const line = drags.stat.lineAt(f.id)}
      <div
        class="field-row drag-row"
        class:drop-before={line === 'before'}
        class:drop-after={line === 'after'}
        class:dragging={drags.stat.dragging === f.id}
        data-place="stat:{f.id}"
        role="listitem"
        ondragover={(e) => drags.stat.over(e, f.id)}
        ondrop={(e) => {
          const m = drags.stat.drop(e, listOf('stat').map((x) => x.id));
          if (m) move('stat', m.from, m.to);
        }}
        oncontextmenu={(e) => rowMenu(e, 'stat', f, i)}
        use:rowKeys={{ move: (d) => move('stat', i, i + d), duplicate: () => duplicate('stat', f) }}
      >
        {@render grip('stat', f.id, 'stats')}
        <input class="name" bind:value={f.name} aria-label="Stat name" />
        <select bind:value={() => f.type, (v) => setStatType(f, v)} aria-label="{f.name} type">
          <option value="number">Number</option>
          <option value="text">Text</option>
          <option value="checkbox">Yes/no</option>
          <option value="tags">Tags</option>
        </select>
        <!-- What the type needs goes on a line of its own (see .field-row), so every row's audience, color and 🗑 line up. -->
        <div class="by-type">
          {#if f.type === 'number'}
            <!-- A number counts as it's typed; an emptied box (or a "-" on its way to a number) keeps what it was until it's
                 left: Start then shows its number again, Min and Max have no limit. -->
            <label class="field"
              >Start<input
                type="number"
                class="n"
                value={Number(f.start ?? 0)}
                oninput={(e) => e.currentTarget.value !== '' && (f.start = +e.currentTarget.value)}
                onchange={(e) => e.currentTarget.value === '' && (e.currentTarget.value = String(Number(f.start ?? 0)))}
              /></label
            >
            <label class="field"
              >Min<input
                type="number"
                class="n"
                value={f.min ?? ''}
                oninput={(e) => e.currentTarget.value !== '' && (f.min = +e.currentTarget.value)}
                onchange={(e) => e.currentTarget.value === '' && (f.min = undefined)}
              /></label
            >
            <label class="field"
              >Max<input
                type="number"
                class="n"
                value={f.max ?? ''}
                oninput={(e) => e.currentTarget.value !== '' && (f.max = +e.currentTarget.value)}
                onchange={(e) => e.currentTarget.value === '' && (f.max = undefined)}
              /></label
            >
            <!-- (A stat without a display shows as a number: showing the field doesn't fill it in.) -->
            <select bind:value={() => f.display ?? 'counter', (v) => (f.display = v)} aria-label="{f.name} shown as">
              <option value="counter">Number</option>
              <option value="bar">Bar</option>
              <option value="hearts">Hearts</option>
            </select>
            <label class="check small"><input type="checkbox" bind:checked={f.currency} /> Currency</label>
            <input class="sym" bind:value={f.symbol} placeholder={f.currency ? '🪙' : 'Symbol'} aria-label="{f.name} symbol" title="Shown before the number, e.g. 🪙 or $" />
            {#if statRangeProblem(f)}<span class="warn small" data-warn="range">⚠ {statRangeProblem(f)}</span>{/if}
          {:else if f.type === 'text'}
            <label class="field">Start<input value={String(f.start ?? '')} oninput={(e) => (f.start = e.currentTarget.value)} /></label>
          {:else if f.type === 'checkbox'}
            <label class="check small"><input type="checkbox" checked={f.start === true} onchange={(e) => (f.start = e.currentTarget.checked)} /> Starts as yes</label>
          {:else}
            <label class="field">
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
        <button class="ghost tiny" onclick={() => duplicate('stat', f)} aria-label="Duplicate {f.name}" title="Duplicate (Ctrl+D)">⧉</button>
        <button class="ghost tiny danger" onclick={() => removeField(f)} aria-label="Delete {f.name}" title="Delete (Undo brings it back)">🗑</button>
      </div>
    {/each}
  </div>
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
                      oninput={(e) => {
                        // Emptied: their own value goes (they start with the stat's, the box's grey hint).
                        const v = e.currentTarget.value;
                        p.stats = { ...(p.stats ?? {}) };
                        if (v === '') delete p.stats[f.id];
                        else p.stats[f.id] = v;
                      }}
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
    <button onclick={addItem}>＋ Add item</button>
    <button class="ghost" onclick={importCsv} title="Columns: name, price, stackable, wearable, description">📂 Import CSV…</button>
    <button class="ghost" onclick={exportCsv} disabled={!game.items?.length}>⬇ Export CSV</button>
  </div>
  <div class="list" role={game.items?.length ? 'list' : undefined} aria-label={game.items?.length ? 'Items' : undefined}>
    {#each game.items ?? [] as it, i (it.id)}
      {@const line = drags.item.lineAt(it.id)}
      <div
        class="item drag-row"
        class:drop-before={line === 'before'}
        class:drop-after={line === 'after'}
        class:dragging={drags.item.dragging === it.id}
        data-place="item:{it.id}"
        role="listitem"
        ondragover={(e) => drags.item.over(e, it.id)}
        ondrop={(e) => {
          const m = drags.item.drop(e, listOf('item').map((x) => x.id));
          if (m) move('item', m.from, m.to);
        }}
        oncontextmenu={(e) => rowMenu(e, 'item', it, i)}
        use:rowKeys={{ move: (d) => move('item', i, i + d), duplicate: () => duplicate('item', it) }}
      >
        <div class="item-row">
          {@render grip('item', it.id, 'items')}
          <div class="pop">
            <button
              class="icon"
              onclick={() => (iconFor = it.id)}
              use:mediaDrop={{ kind: 'image', onpick: (id) => (it.icon = id) }}
              aria-label="Icon for {it.name}"
              title="Icon (or drop a picture here) · drag it onto a shop to sell it there"
              draggable="true"
              ondragstart={(e) => {
                iconDrag = it.id;
                e.dataTransfer?.setData('text/x-item', it.id);
                if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
              }}
              ondragend={() => (iconDrag = null)}
            >
              {#if it.icon && mediaUrls[it.icon]}<img src={mediaUrls[it.icon]} alt="" />{:else}📦{/if}
            </button>
            {#if iconFor === it.id}<MediaPicker kind="image" onpick={(id) => ((it.icon = id), (iconFor = null))} onclose={() => (iconFor = null)} />{/if}
          </div>
          <input class="name" bind:value={it.name} aria-label="Item name" />
          <label class="field">Price<input type="number" class="n" min="0" value={it.price ?? ''} oninput={(e) => (it.price = e.currentTarget.value === '' ? undefined : Math.max(0, +e.currentTarget.value || 0))} /></label>
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
          <button class="ghost small" onclick={() => duplicate('item', it)} aria-label="Duplicate {it.name}" title="Duplicate, with its buttons and look (Ctrl+D)">⧉</button>
          <button class="ghost small danger" onclick={() => removeItem(it)} aria-label="Delete {it.name}" title="Delete (Undo brings it back)">🗑</button>
        </div>
        {#if openItem === it.id}
          <div class="more">
            <label class="field">Description (on its card)<textarea rows="2" bind:value={it.description}></textarea></label>
            <label class="field">Host notes (never shown on stream)<textarea rows="2" bind:value={it.hostNotes}></textarea></label>
            <div class="hint">"Use" in play runs:</div>
            <ActionListEditor bind:actions={it.onUse} world={game.worlds?.[0]} />
            {#if it.wearable}
              {@const worn = it as ItemDef & { wearable: Wearable }}
              <div class="hint">Worn look (how it shows on the avatar when equipped):</div>
              <WornLookEditor item={worn} />
            {/if}
          </div>
        {/if}
      </div>
    {:else}
      <p class="hint">No items yet.</p>
    {/each}
  </div>
</section>

<section>
  <h3>Shops</h3>
  <div class="row"><button onclick={addShop}>＋ Add shop</button></div>
  <div class="list" role={game.shops?.length ? 'list' : undefined} aria-label={game.shops?.length ? 'Shops' : undefined}>
    {#each game.shops ?? [] as s, si (s.id)}
      <!-- What the shop charges: with its currency stat deleted, that's the first currency (or points). -->
      {@const cur = shopCurrency(game, s)}
      {@const line = drags.shop.lineAt(s.id)}
      {@const sells = !!iconDrag && !s.stock.some((x) => x.item === iconDrag)}
      <div
        class="shop drag-row"
        class:drop-before={line === 'before'}
        class:drop-after={line === 'after'}
        class:dragging={drags.shop.dragging === s.id}
        class:drop-on={sells}
        data-place="shop:{s.id}"
        role="listitem"
        ondragover={(e) => (sells ? e.preventDefault() : drags.shop.over(e, s.id))}
        ondrop={(e) => {
          if (iconDrag) {
            e.preventDefault();
            const it = sells ? game.items?.find((x) => x.id === iconDrag) : undefined;
            iconDrag = null;
            if (it) stock(s, [it]);
            return;
          }
          const m = drags.shop.drop(e, listOf('shop').map((x) => x.id));
          if (m) move('shop', m.from, m.to);
        }}
        oncontextmenu={(e) => rowMenu(e, 'shop', s, si)}
        use:rowKeys={{ move: (d) => move('shop', si, si + d), duplicate: () => duplicate('shop', s) }}
      >
        <div class="row">
          {@render grip('shop', s.id, 'shops')}
          <input class="name" bind:value={s.name} aria-label="Shop name" />
          <label class="field">
            Charges
            <select
              value={shopCurrencyGone(game, s) ? s.currency : cur === 'score' ? SCORE_CURRENCY : cur.id}
              onchange={(e) => (s.currency = e.currentTarget.value)}
              aria-label="{s.name} currency"
            >
              <!-- Its stat was deleted: say so, rather than seem to charge points (or another currency) by choice. -->
              {#if shopCurrencyGone(game, s)}<option value={s.currency}>⚠ Deleted stat — pick another</option>{/if}
              <option value={SCORE_CURRENCY}>Points (the score)</option>
              <!-- A stat no longer ticked as a currency is still what it charges. -->
              {#if cur !== 'score' && !currencyFields(game).includes(cur)}<option value={cur.id}>{cur.name}</option>{/if}
              {#each currencyFields(game) as f (f.id)}<option value={f.id}>{f.name}</option>{/each}
            </select>
          </label>
          <label class="field" title="Shops with the same pool name share their stock">Shared stock pool<input bind:value={s.pool} placeholder="(none)" class="pool" /></label>
          <label class="field" title="Players can sell items here for this share of the price (blank: it doesn't buy things back)">
            Buys back at (%)
            <input
              type="number"
              class="n"
              min="0"
              max="100"
              value={s.buysBack ? Math.round(s.buysBack.rate * 100) : ''}
              placeholder="—"
              oninput={(e) => {
                // 0% (or blank): it doesn't buy things back (not "for nothing").
                const pct = Math.min(100, Math.max(0, +e.currentTarget.value || 0));
                s.buysBack = pct > 0 ? { rate: pct / 100 } : undefined;
              }}
            />
          </label>
          <span class="spacer"></span>
          <button class="ghost small" onclick={() => duplicate('shop', s)} aria-label="Duplicate {s.name}" title="Duplicate, with its stock (Ctrl+D)">⧉</button>
          <button class="ghost small danger" onclick={() => removeShop(s)} title="Delete this shop (Undo brings it back)">🗑 Delete shop</button>
        </div>
        <table>
          {#if s.stock.length}
            <thead><tr><th></th><th>Item</th><th>Price</th><th>In stock</th><th></th></tr></thead>
          {/if}
          <tbody>
            {#each s.stock as st, i (wareId(st))}
              {@const wid = wareId(st)}
              {@const wline = wares.lineAt(wid)}
              {@const wname = game.items?.find((x) => x.id === st.item)?.name ?? 'item'}
              <tr
                class="drag-row"
                class:drop-before={wline === 'before'}
                class:drop-after={wline === 'after'}
                class:dragging={wares.dragging === wid}
                ondragover={(e) => {
                  // (A row of another shop isn't dropped here.)
                  if (s.stock.some((x) => wareId(x) === wares.dragging)) wares.over(e, wid);
                }}
                ondrop={(e) => {
                  if (!wares.dragging || iconDrag) return;
                  const m = wares.drop(e, s.stock.map(wareId));
                  if (m) moveWare(s, m.from, m.to);
                }}
                oncontextmenu={(e) => wareMenu(e, s, i)}
                use:rowKeys={{ move: (d) => moveWare(s, i, i + d) }}
              >
                <td>
                  <span
                    class="drag-grip"
                    draggable="true"
                    ondragstart={(e) => wares.start(e, wid, (e.currentTarget as HTMLElement).closest('tr'))}
                    ondragend={() => wares.end()}
                    aria-hidden="true"
                    title="Drag to reorder (or Alt+↑/↓)">⋮⋮</span
                  >
                </td>
                <td>
                  <!-- Another item: the old one's price on this row goes with it (the new item's own price shows). -->
                  <select value={st.item} onchange={(e) => ((st.item = e.currentTarget.value), (st.price = undefined))} aria-label="Item for sale">
                    <!-- Each item once per shop: the ones other rows sell are greyed out. -->
                    {#each game.items ?? [] as it (it.id)}<option value={it.id} disabled={it.id !== st.item && s.stock.some((x) => x.item === it.id)}>{it.name}</option>{/each}
                  </select>
                </td>
                <td><input type="number" class="n" value={st.price ?? ''} placeholder={String(game.items?.find((x) => x.id === st.item)?.price ?? 0)} min="0" oninput={(e) => (st.price = e.currentTarget.value === '' ? undefined : Math.max(0, +e.currentTarget.value || 0))} aria-label="Price" /></td>
                <td>
                  <input type="number" class="n" min="0" value={st.qty ?? ''} placeholder="∞" step="1" oninput={(e) => (st.qty = e.currentTarget.value === '' ? null : Math.max(0, Math.floor(+e.currentTarget.value || 0)))} aria-label="In stock" />
                </td>
                <td>
                  <button class="ghost tiny" onclick={() => unstock(s, i)} aria-label="Remove {wname} from shop" title="Stop selling it here (it stays in the game)">✕</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
        <div class="row">
          <button
            class="small"
            disabled={!unstocked(s)}
            onclick={(e) => stockMenu(e, s)}
            aria-haspopup="menu"
            title={unstocked(s) ? 'Pick an item to sell here (or drag an item’s 📦 icon onto the shop)' : game.items?.length ? 'It sells every item already' : 'Add items first'}>＋ Add item to sell ▾</button
          >
        </div>
      </div>
    {/each}
  </div>
</section>

<style>
  section {
    max-width: 1200px;
    margin: 0 0 24px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  h3 {
    margin: 0;
    font-size: 16px;
  }
  .presets,
  .row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: flex-end;
  }
  .field-row,
  .item-row {
    display: flex;
    gap: 8px;
    align-items: flex-end;
    flex-wrap: wrap;
    padding: 4px 0 8px;
    border-bottom: 1px solid var(--border);
  }
  /* Ticks, grips and small buttons sit on the fields' line (under the labels above them). */
  .field-row :is(.check, .drag-grip, button.small, button.tiny),
  .item-row :is(.check, .drag-grip, button.small, button.tiny),
  .shop .row :is(.drag-grip, button.small) {
    margin-bottom: 5px;
  }
  /* Name, type, audience, color, ⧉ 🗑 on the first line, in the same columns on every row; what the type needs (its
     fields labelled above) on a line of its own under them. */
  .field-row {
    display: grid;
    grid-template-columns: auto auto auto minmax(0, 1fr) auto auto auto;
    row-gap: 8px;
  }
  .field-row > .by-type {
    grid-row: 2;
    grid-column: 2 / -1;
  }
  .field-row > select:last-of-type {
    justify-self: start;
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .by-type {
    display: flex;
    gap: 8px;
    align-items: flex-end;
    flex-wrap: wrap;
  }
  .name {
    width: 170px;
  }
  /* On a narrow window an item's name gives way first, so ⧉ and 🗑 stay on its line. */
  .item-row .name {
    flex: 1 1 110px;
    max-width: 170px;
    min-width: 90px;
  }
  .item-row select {
    flex: 0 1 auto;
    min-width: 0;
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
  /* An item's 📦 dragged over a shop that doesn't sell it yet. */
  .shop.drop-on {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }
  .shop th {
    padding: 0 4px;
    text-align: left;
    font-size: 12px;
    font-weight: 400;
    color: var(--muted);
  }
  .starts table td,
  .starts table th {
    padding: 2px 6px;
    text-align: left;
    font-size: 12px;
  }
</style>
