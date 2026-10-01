<!-- RPG screens: what the selected item is (its class), what it does, and whether viewers see it. -->
<script lang="ts">
  import { editedGame } from '../../lib/app.svelte';
  import { textSlide, type ObjectClass, type Slide, type SlideElement, type World } from '../../lib/model';
  import { findIn, OBJECT_CLASSES } from '../../lib/rpg';
  import { currencyFields } from '../../lib/toolset';
  import ActionListEditor from './ActionListEditor.svelte';
  import ScreenPicker from './ScreenPicker.svelte';
  import SlideModal from './SlideModal.svelte';

  /** `slide`: the one being edited (the screen's own, or one of its looks), where Reveal / Hide find the objects. */
  let { el, world, slide }: { el: SlideElement; world: World; slide: Slide } = $props();
  const game = $derived(editedGame());
  let dialogueOpen = $state(false);

  const CLASSES = OBJECT_CLASSES;

  function setClass(c: string): void {
    if (!c) {
      el.role = undefined;
      return;
    }
    el.role = { ...(el.role ?? {}), class: c as ObjectClass };
    if (c === 'item' && !el.role.item) el.role.item = game.items?.[0]?.id;
    if (c === 'item') el.role.qty ??= 1;
    if (c === 'currency') {
      el.role.field ??= currencyFields(game)[0]?.id;
      el.role.amount ??= 10;
    }
    if (c === 'spawn' || c === 'blocker') el.name ||= c === 'spawn' ? 'Arrival point' : 'No-go area';
  }

  const target = $derived(el.role?.to ? findIn(world, el.role.to) : null);
  const others = $derived(slide.elements.filter((e) => e.id !== el.id));
</script>

<section class="obj">
  <h4>Object</h4>
  <label class="field">Name<input bind:value={el.name} placeholder="e.g. Old Man, Cave door" /></label>
  <label class="field">
    Class
    <select value={el.role?.class ?? ''} onchange={(e) => setClass(e.currentTarget.value)} aria-label="Object class">
      {#each CLASSES as [v, l, hint]}<option value={v} title={hint}>{l}</option>{/each}
    </select>
  </label>
  {#if el.role}
    {@const r = el.role}
    {#if r.class === 'doorway'}
      <!-- Another screen has other objects to arrive at. -->
      <ScreenPicker {world} value={r.to} onchange={(ref) => ((r.to = ref), (r.arrive = undefined))} />
      {#if target}
        <label class="field">
          Arrive at
          <select bind:value={r.arrive} aria-label="Arrive at">
            <option value={undefined}>The screen’s arrival point (or the middle)</option>
            {#if r.arrive && !target.screen.slide.elements.some((e) => e.id === r.arrive)}<option value={r.arrive}>⚠ Deleted object — pick another</option>{/if}
            {#each target.screen.slide.elements.filter((e) => e.name || e.role) as o (o.id)}<option value={o.id}>{o.name || o.role?.class}</option>{/each}
          </select>
        </label>
      {/if}
      <label class="check"><input type="checkbox" bind:checked={r.locked} /> Locked (you can still open it in play)</label>
    {:else if r.class === 'item'}
      <div class="row">
        <input type="number" min="1" bind:value={r.qty} class="n" aria-label="How many" />
        <select bind:value={r.item} aria-label="Item">
          {#if !game.items?.some((it) => it.id === r.item)}
            <option value={r.item}>{r.item ? '⚠ Deleted item — pick another' : game.items?.length ? '— choose —' : 'Add items in 📊 Stats & Items'}</option>
          {/if}
          {#each game.items ?? [] as it (it.id)}<option value={it.id}>{it.name}</option>{/each}
        </select>
      </div>
    {:else if r.class === 'currency'}
      <div class="row">
        <input type="number" bind:value={r.amount} class="n" aria-label="Amount" />
        <select bind:value={r.field} aria-label="Currency">
          {#if r.field && !currencyFields(game).some((f) => f.id === r.field)}
            <!-- A stat no longer ticked as a currency is still the one it gives. -->
            <option value={r.field}>{game.statFields?.find((f) => f.id === r.field)?.name ?? '⚠ Deleted currency — pick another'}</option>
          {/if}
          {#each currencyFields(game) as f (f.id)}<option value={f.id}>{f.name}</option>{:else}<option value={undefined}>Add a currency in 📊 Stats & Items</option>{/each}
        </select>
      </div>
    {:else if r.class === 'npc'}
      <div class="stats">
        {#each r.stats ?? [] as s, i (i)}
          <div class="row">
            <input bind:value={s.name} placeholder="Power" aria-label="Stat name" />
            <input type="number" bind:value={s.value} class="n" aria-label="{s.name || 'Stat'} value" />
            <button class="ghost tiny" onclick={() => r.stats?.splice(i, 1)} aria-label="Delete stat" title="Delete stat">🗑</button>
          </div>
        {/each}
        <div class="row"><button class="small" onclick={() => (r.stats = [...(r.stats ?? []), { name: 'Power', value: 1 }])}>＋ Stat (power, HP…)</button></div>
        {#if r.stats?.length}<label class="check small"><input type="checkbox" bind:checked={r.statsShown} /> Viewers see its stats</label>{/if}
      </div>
      <div class="row">
        <button class="small" onclick={() => ((r.dialogue ??= textSlide('')), (dialogueOpen = true))}>{r.dialogue ? 'Edit dialogue slide…' : '＋ Dialogue slide'}</button>
        {#if r.dialogue}<button class="ghost tiny" onclick={() => (r.dialogue = undefined)} aria-label="Delete dialogue" title="Delete dialogue">🗑</button>{/if}
      </div>
    {/if}
    {#if r.class === 'npc' || r.class === 'shop'}
      <label class="field">
        Shop
        <select bind:value={r.shop} aria-label="Shop">
          <option value={undefined}>—</option>
          {#if r.shop && !game.shops?.some((s) => s.id === r.shop)}<option value={r.shop}>⚠ Deleted shop — pick another</option>{/if}
          {#each game.shops ?? [] as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
        </select>
      </label>
    {/if}
    {#if r.class !== 'spawn' && r.class !== 'blocker'}
      <div class="muted small">Buttons in play (you always confirm them):</div>
      <ActionListEditor bind:actions={r.actions} {world} objects={others} />
    {/if}
  {/if}
  <label class="check" title="Viewers don't see it until you reveal it in play">
    <input type="checkbox" checked={!!el.secret} onchange={(e) => (el.secret = e.currentTarget.checked || undefined)} /> Secret (hidden until revealed)
  </label>
  <label class="field">
    Host notes
    <textarea rows="2" value={el.hostNotes ?? ''} oninput={(e) => (el.hostNotes = e.currentTarget.value || undefined)} placeholder="What it really does…"></textarea>
  </label>
</section>

{#if dialogueOpen && el.role?.dialogue}
  <SlideModal slide={el.role.dialogue} title="Dialogue slide for {el.name || 'this character'}" onclose={() => (dialogueOpen = false)} />
{/if}

<style>
  .obj {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  /* Like the inspector's other section headings. */
  h4 {
    margin: 0;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
  }
  .row {
    display: flex;
    gap: 4px;
    align-items: center;
  }
  .n {
    width: 70px;
  }
  .small {
    font-size: 12px;
  }
  .tiny {
    font-size: 12px;
    padding: 1px 5px;
  }
  .stats {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
</style>
