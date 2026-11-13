<!--
  A saved 🎭 deal (partner-clues spec §11): its parts (a name, how many get it, its 🤫 card, and whether the card shows a
  slice of the deal's wheel too), the wheel, and for teams whether it's dealt within each team. The host deals it in
  play from 🎭 Deal… in the tools row; nothing of it goes to anyone until they send it there.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { app } from '../../lib/app.svelte';
  import { step } from '../../lib/history.svelte';
  import { announce } from '../../lib/announce';
  import { countText, dealSetupProblems, newDealPart, partName } from '../../lib/deals';
  import { DEAL_PART_MAX, DEAL_PARTS_MAX, MAX_PLAYERS, setSlideText, slideText, type DealPart, type DealPreset } from '../../lib/model';
  import { cardSummary } from '../../lib/partner';
  import { copyDealPart, moveTo } from '../../lib/listedit';
  import { DragOrder, rowKeys } from '../../lib/dragorder.svelte';
  import { menuItem, menuOf, showMenu, type MenuEntry } from '../../lib/menustate.svelte';
  import { isTextField } from '../../lib/undokeys';
  import RowTools from '../RowTools.svelte';
  import DealCardWindow from './DealCardWindow.svelte';

  let { deal }: { deal: DealPreset } = $props();
  const game = $derived(app.game);
  const problems = $derived(dealSetupProblems(game, deal));
  const draws = $derived(deal.parts.some((p) => p.draw));
  let editing = $state<DealPart | null>(null);
  const COUNTS = Array.from({ length: MAX_PLAYERS + 1 }, (_, i) => i);

  let partsEl = $state<HTMLElement>();
  function focusName(id: string): void {
    void tick().then(() => partsEl?.querySelector<HTMLInputElement>(`[data-part="${id}"] input.pname`)?.focus());
  }
  /** A new part (after `at`: Enter in a part's name, `blank`), its name ready to type. */
  function add(at = deal.parts.length - 1, blank = false): void {
    if (deal.parts.length >= DEAL_PARTS_MAX) return;
    // (From Enter in a name, as a wheel's next slice: no name yet, its place's shows until one's typed.)
    const p = { ...newDealPart(deal.parts.length + 1), ...(blank ? { name: '' } : {}) };
    step(`Added part “${partName(p, at + 1)}”`, () => deal.parts.splice(at + 1, 0, p));
    focusName(p.id);
  }
  /** A copy right after it, its card too. */
  function duplicate(i: number): void {
    const p = deal.parts[i];
    if (!p || deal.parts.length >= DEAL_PARTS_MAX) return;
    const copy = copyDealPart(p, deal.parts.map((x) => x.name));
    step(`Duplicated part “${partName(p, i)}”`, () => deal.parts.splice(i + 1, 0, copy));
    focusName(copy.id);
  }
  // Deleting is done at once: the note at the bottom offers Undo.
  function remove(i: number): void {
    const p = deal.parts[i];
    if (!p || deal.parts.length < 2) return;
    step(`Deleted part “${partName(p, i)}”`, () => deal.parts.splice(i, 1), { notify: true });
  }
  function move(i: number, j: number): void {
    const p = deal.parts[i];
    if (!p || j < 0 || j >= deal.parts.length) return;
    step(`Moved part “${partName(p, i)}” ${j < i ? 'up' : 'down'}`, () => moveTo(deal.parts, i, j));
    announce(`Part “${partName(p, i)}” moved to ${j + 1} of ${deal.parts.length}`);
  }

  /** In a part's name, as in a wheel's slices: Enter adds the next part, Backspace in an empty one deletes it. */
  function nameKey(e: KeyboardEvent, i: number): void {
    if (e.isComposing || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (deal.parts.length < DEAL_PARTS_MAX) add(i, true);
      else focusName((deal.parts[i + 1] ?? deal.parts[0]).id);
    } else if (e.key === 'Backspace' && !deal.parts[i].name && deal.parts.length > 1) {
      e.preventDefault();
      const back = deal.parts[i - 1] ?? deal.parts[i + 1];
      remove(i);
      focusName(back.id);
    }
  }

  /** A part's menu: its ⋯, a right-click on it (not in its text boxes, which keep the browser's own), Shift+F10 in it. */
  function partItems(i: number): MenuEntry[] {
    const p = deal.parts[i];
    const n = deal.parts.length;
    return menuOf({
      heading: partName(p, i),
      open: [{ label: '✎ Edit card…', onclick: () => (editing = p) }],
      duplicate: menuItem.duplicate(() => duplicate(i), { disabled: n >= DEAL_PARTS_MAX }),
      move: [menuItem.up(() => move(i, i - 1), { disabled: i === 0 }), menuItem.down(() => move(i, i + 1), { disabled: i === n - 1 })],
      delete: menuItem.delete('part', () => remove(i), { disabled: n < 2, keys: false, hint: n < 2 ? 'A deal needs a part' : undefined }),
    });
  }
  function partMenu(e: MouseEvent, i: number): void {
    if (!isTextField(e.target)) showMenu(e, partItems(i));
  }

  const rows = new DragOrder();
  // Each choice is one named step ("How many get Wolf in “Secret roles”: ×2"), as adding and moving a part are.
  function setCount(p: DealPart, i: number, to: string): void {
    const n = to === 'rest' ? 'rest' : Number(to);
    step(`How many get ${partName(p, i)} in “${deal.name}”: ${countText(n)}`, () => (p.count = n));
  }
  const DRAWS: Record<string, string> = { '': 'nothing more', shared: '+ a wheel slice everyone shares', own: '+ a wheel slice of their own' };
  let wheelEl = $state<HTMLSelectElement>();
  function setDraw(p: DealPart, i: number, to: string): void {
    step(`${partName(p, i)}’s card in “${deal.name}”: ${DRAWS[to] ?? DRAWS['']}`, () => {
      if (to === 'own' || to === 'shared') p.draw = to;
      else delete p.draw;
    });
    // A slice needs a wheel: with none chosen yet, take the author to the 🎡 box that just appeared.
    if (p.draw && !deal.wheel)
      void tick().then(() => {
        wheelEl?.scrollIntoView({ block: 'nearest' });
        wheelEl?.focus();
      });
  }
  function setWheel(id: string): void {
    step(`“${deal.name}” draws from ${game.wheels.find((w) => w.id === id)?.name ?? 'no wheel'}`, () => (deal.wheel = id || undefined));
  }
  function setPerTeam(on: boolean): void {
    step(on ? `“${deal.name}” is dealt within each team` : `“${deal.name}” is dealt to everyone together`, () => (on ? (deal.perTeam = true) : delete deal.perTeam));
  }
</script>

<div class="de" data-deal-editor>
  <label class="field">Deal name<input bind:value={deal.name} /></label>
  <p class="muted small">
    Secret parts for everyone: in play, <b>🎭 Deal…</b> in the tools row gives each player one part, at random (or as you
    choose, with the audience window open), and each part's 🤫 card goes to its players' phones only when you send it.
    Afterwards <b>🎭 Show who was who</b> shows everyone's part on screen.
  </p>

  <div class="parts" role="list" aria-label="Parts" bind:this={partsEl}>
    {#each deal.parts as part, i (part.id)}
      {@const line = rows.lineAt(part.id)}
      <div
        class="part drag-row"
        class:drop-before={line === 'before'}
        class:drop-after={line === 'after'}
        class:dragging={rows.dragging === part.id}
        role="listitem"
        data-part={part.id}
        ondragover={(e) => rows.over(e, part.id)}
        ondrop={(e) => {
          const m = rows.drop(e, deal.parts.map((x) => x.id));
          if (m) move(m.from, m.to);
        }}
        oncontextmenu={(e) => partMenu(e, i)}
        use:rowKeys={{ move: (d) => move(i, i + d), duplicate: () => duplicate(i), menu: () => partItems(i) }}
      >
        <div class="row">
          <span
            class="drag-grip"
            draggable="true"
            ondragstart={(e) => rows.start(e, part.id, (e.currentTarget as HTMLElement).closest('.part'))}
            ondragend={() => rows.end()}
            aria-hidden="true"
            title="Drag to reorder (or Alt+↑/↓) · right-click for more">⋮⋮</span
          >
          <input
            class="pname"
            value={part.name}
            maxlength={DEAL_PART_MAX}
            placeholder="Part {i + 1}"
            aria-label="Part {i + 1}’s name"
            title="On their phone: “You’re the {partName(part, i)}”, and on screen in Who was who · Enter: the next part"
            oninput={(e) => (part.name = e.currentTarget.value)}
            onkeydown={(e) => nameKey(e, i)}
          />
          <label class="inline"
            >How many get it<select aria-label="How many get {partName(part, i)}" value={String(part.count)} onchange={(e) => setCount(part, i, e.currentTarget.value)}>
              {#each COUNTS as n (n)}<option value={String(n)}>{countText(n)}</option>{/each}
              <option value="rest">{countText('rest')}</option>
            </select></label
          >
          <RowTools menu={() => partItems(i)} name={partName(part, i)} remove={() => remove(i)} deleteLabel="Delete {partName(part, i)}" off={deal.parts.length < 2 ? 'A deal needs a part' : undefined} />
        </div>
        <div class="row">
          <input class="grow" value={slideText(part.card)} placeholder="What its card says (only its players see it)" aria-label="{partName(part, i)}’s card words" oninput={(e) => setSlideText(part.card, e.currentTarget.value)} />
          <button class="small" onclick={() => (editing = part)} title="Pictures, videos, sounds, links: on their phones under the words. 📱 On their phone shows the card as they get it">Edit card…</button>
          <label class="inline"
            >Their card also shows<select aria-label="{partName(part, i)}’s card draws from the wheel" value={part.draw ?? ''} onchange={(e) => setDraw(part, i, e.currentTarget.value)}>
              <option value="">nothing more</option>
              <option value="shared">a wheel slice everyone shares</option>
              <option value="own">a wheel slice of their own</option>
            </select></label
          >
        </div>
        <div class="muted small">Card: {cardSummary(game, part.card)}{part.draw === 'shared' ? ', then the slice drawn for everyone who shares it' : part.draw === 'own' ? ', then their own slice of the wheel' : ''}</div>
      </div>
    {/each}
  </div>
  {#if deal.parts.length < DEAL_PARTS_MAX}<div class="row"><button onclick={() => add()}>＋ Add part</button></div>{/if}

  {#if draws}
    <label class="field">🎡 Wheel its cards draw from
      <select bind:this={wheelEl} value={deal.wheel ?? ''} onchange={(e) => setWheel(e.currentTarget.value)}>
        <option value="">Choose a saved wheel…</option>
        {#each game.wheels as w (w.id)}<option value={w.id}>{w.name}</option>{/each}
      </select>
    </label>
    <p class="muted small">“A wheel slice everyone shares” is drawn once for the deal (🕵 the location everyone but the spy knows); “a wheel slice of their own” gives each player their own (🧠 a prompt each), none twice while there are enough.</p>
  {/if}
  <label class="check"><input type="checkbox" checked={!!deal.perTeam} onchange={(e) => setPerTeam(e.currentTarget.checked)} /> Teams: deal within each team, to the people on it (a captain for each team)</label>

  {#each problems as p (p)}<p class="warn small" role="status">⚠ This deal: {p}</p>{/each}
</div>

{#if editing}
  <DealCardWindow {deal} part={editing} onclose={() => (editing = null)} />
{/if}

<style>
  .de {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 820px;
  }
  .parts {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .part {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px;
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  .pname,
  .grow {
    flex: 1;
    min-width: 0;
  }
  /* A dropdown with its name before it, on the row's line. */
  .inline {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--muted);
  }
  .inline select {
    color: var(--text);
  }
  p {
    margin: 0;
  }
  .small {
    font-size: 12px;
  }
  .warn {
    color: var(--warn);
  }
</style>
