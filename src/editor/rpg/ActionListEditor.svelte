<!-- Edit a list of actions (an object's buttons, an item's "Use"). Each becomes a button the host presses in play. -->
<script lang="ts">
  import { editedGame } from '../../lib/app.svelte';
  import { dropMenu } from '../../lib/menustate.svelte';
  import { newId, PLAYER_WHEEL, setSlideText, slideText, textSlide, type Action, type ActionKind, type BoardGameRound, type SlideElement, type World } from '../../lib/model';
  import { mediaUrls } from '../../lib/media.svelte';
  import { statFields } from '../../lib/toolset';
  import MediaPicker from '../slide/MediaPicker.svelte';
  import ScreenPicker from './ScreenPicker.svelte';
  import SlideModal from './SlideModal.svelte';

  let {
    actions = $bindable(),
    world,
    objects = [],
    board,
  }: {
    actions: Action[] | undefined;
    /** For "Go to" (moves need a world). */
    world?: World;
    /** Objects on the same screen, for Reveal / Hide. */
    objects?: SlideElement[];
    /** Board games: for "Send to a space / zone". */
    board?: BoardGameRound;
  } = $props();

  const game = $derived(editedGame());
  const numbers = $derived(statFields(game).filter((f) => f.type === 'number'));
  let editing = $state<{ action: Action; which: 'slide' | 'question' | 'answer' } | null>(null);
  let pickingSound = $state<string | null>(null);

  const KINDS: [ActionKind, string][] = [
    ['stat', '📊 Change a stat'],
    ['item', '🎒 Give / take an item'],
    ['score', '💯 Change the score'],
    ['wheel', '🎡 Spin a wheel'],
    ['dice', '🎲 Roll dice'],
    ['popup', '🪧 Show a slide'],
    ['question', '❓ Ask a question'],
    ['sound', '🔊 Play a sound'],
    ['move', '🚪 Go to a screen'],
    ['goto', '📍 Send to a space / zone'],
    ['reveal', '👁 Reveal an object'],
    ['hide', '🙈 Hide an object'],
    ['shop', '🛒 Open a shop'],
    ['timer', '⏱ Start a timer'],
    ['note', '📝 Host note'],
  ];
  const LABEL = Object.fromEntries(KINDS) as Record<ActionKind, string>;

  function make(kind: ActionKind): Action | null {
    const id = newId();
    switch (kind) {
      case 'stat':
        // Only number stats can go up or down.
        return { id, do: 'stat', field: numbers[0]?.id ?? '', op: 'add', amount: -1, who: 'ask' };
      case 'item':
        return { id, do: 'item', item: game.items?.[0]?.id ?? '', qty: 1, op: 'give', who: 'ask' };
      case 'score':
        return { id, do: 'score', amount: 100, who: 'ask' };
      case 'wheel':
        return { id, do: 'wheel', wheel: game.wheels[0]?.id ?? PLAYER_WHEEL };
      case 'dice':
        return { id, do: 'dice', dice: 'd20' };
      case 'popup':
        return { id, do: 'popup', slide: textSlide('') };
      case 'question':
        return { id, do: 'question', question: textSlide(''), answer: textSlide(''), value: 100 };
      case 'sound':
        return { id, do: 'sound', media: '' };
      case 'move': {
        const m = world?.maps[0];
        return m?.screens[0] ? { id, do: 'move', to: { map: m.id, screen: m.screens[0].id }, who: 'party' } : null;
      }
      case 'reveal':
      case 'hide':
        return { id, do: kind, object: objects[0]?.id };
      case 'shop':
        return { id, do: 'shop', shop: game.shops?.[0]?.id ?? '' };
      case 'timer':
        return { id, do: 'timer', seconds: 30 };
      case 'note':
        return { id, do: 'note', text: '' };
      case 'goto':
        return board ? { id, do: 'goto', space: board.spaces[0]?.id, who: 'ask' } : null;
    }
  }

  function add(kind: ActionKind): void {
    const a = make(kind);
    if (!a) return;
    actions = [...(actions ?? []), a];
  }

  function remove(id: string): void {
    actions = (actions ?? []).filter((a) => a.id !== id);
    if (!actions.length) actions = undefined;
  }

  /** The kinds of action, under the button (a second click, Esc or a click elsewhere closes it). */
  function openMenu(e: MouseEvent): void {
    dropMenu(
      e,
      // Board spaces send players to a space (there are no screens); Reveal / Hide need objects on the same screen.
      KINDS.filter(([k]) => (k === 'goto' ? !!board : k === 'move' ? !board : k === 'reveal' || k === 'hide' ? objects.length > 0 : true)).map(([k, l]) => ({
        label: l,
        onclick: () => add(k),
        disabled: k === 'move' && !world?.maps[0]?.screens[0],
        hint: k === 'move' && !world?.maps[0]?.screens[0] ? 'Add an RPG round (a world of screens) first' : undefined,
      })),
    );
  }

  function move(i: number, d: number): void {
    const list = [...(actions ?? [])];
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    actions = list;
  }
</script>

<!-- An action without a who is for `fallback` (the party, for a move): showing it doesn't fill that in. -->
{#snippet who(a: { who?: string }, fallback = 'ask')}
  <select bind:value={() => a.who ?? fallback, (v) => (a.who = v)} aria-label="Who">
    <option value="ask">Host picks who</option>
    <option value="party">{board ? 'Whoever’s turn it is' : 'The party here'}</option>
    <option value="selected">Selected players</option>
    <option value="picker">The picker (★)</option>
    <option value="all">Everyone</option>
  </select>
{/snippet}

<div class="actions">
  {#each actions ?? [] as a, i (a.id)}
    <div class="act">
      <div class="head">
        <b class="small">{LABEL[a.do]}</b>
        <span class="spacer"></span>
        <button class="ghost tiny" onclick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">▲</button>
        <button class="ghost tiny" onclick={() => move(i, 1)} disabled={i === (actions?.length ?? 0) - 1} aria-label="Move down">▼</button>
        <button class="ghost tiny" onclick={() => remove(a.id)} aria-label="Remove action">✕</button>
      </div>
      <div class="fields">
        {#if a.do === 'stat'}
          <select bind:value={a.field} aria-label="Stat">
            {#if !numbers.some((f) => f.id === a.field)}
              <option value={a.field}>{a.field && !game.statFields?.some((f) => f.id === a.field) ? '⚠ Deleted stat — pick another' : numbers.length ? '— choose —' : 'Add a number stat in 📊 Stats & Items'}</option>
            {/if}
            {#each numbers as f (f.id)}<option value={f.id}>{f.name}</option>{/each}
          </select>
          <select bind:value={a.op} aria-label="Change"><option value="add">add</option><option value="set">set to</option></select>
          <input type="number" bind:value={a.amount} aria-label="Amount" class="n" />
          {@render who(a)}
        {:else if a.do === 'item'}
          <select bind:value={a.op} aria-label="Give or take"><option value="give">Give</option><option value="take">Take</option></select>
          <input type="number" min="1" bind:value={a.qty} aria-label="How many" class="n" />
          <select bind:value={a.item} aria-label="Item">
            {#if !game.items?.some((it) => it.id === a.item)}
              <option value={a.item}>{a.item ? '⚠ Deleted item — pick another' : game.items?.length ? '— choose —' : 'Add items in 📊 Stats & Items'}</option>
            {/if}
            {#each game.items ?? [] as it (it.id)}<option value={it.id}>{it.name}</option>{/each}
          </select>
          {@render who(a)}
        {:else if a.do === 'score'}
          <input type="number" bind:value={a.amount} aria-label="Points" class="n" />
          {@render who(a)}
        {:else if a.do === 'wheel'}
          {#each [a.wheel, ...(a.also ?? [])] as id, wi (wi)}
            {#if wi > 0}<span class="small muted">+</span>{/if}
            <select
              value={id}
              aria-label={wi ? `Wheel ${wi + 1}` : 'Wheel'}
              onchange={(e) => {
                const v = e.currentTarget.value;
                if (wi === 0) a.wheel = v;
                else if (a.also) a.also[wi - 1] = v;
              }}
            >
              {#if id !== PLAYER_WHEEL && !game.wheels.some((w) => w.id === id)}<option value={id}>⚠ Deleted wheel — pick another</option>{/if}
              <option value={PLAYER_WHEEL}>🎯 Pick a player</option>
              {#each game.wheels as w (w.id)}<option value={w.id}>{w.name}</option>{/each}
            </select>
            {#if wi > 0}<button class="ghost tiny" onclick={() => (a.also = a.also?.filter((_, j) => j !== wi - 1))} aria-label="Remove wheel {wi + 1}">✕</button>{/if}
          {/each}
          <button class="small" onclick={() => (a.also = [...(a.also ?? []), game.wheels[0]?.id ?? PLAYER_WHEEL])} title="Spin several wheels at once">＋ Wheel</button>
        {:else if a.do === 'dice'}
          <input bind:value={a.dice} aria-label="Dice" placeholder="d20, 2d6…" list="dice-presets" />
          <datalist id="dice-presets">{#each game.dice as d (d.id)}<option value={d.name}></option>{/each}</datalist>
        {:else if a.do === 'popup'}
          <input value={slideText(a.slide)} oninput={(e) => setSlideText(a.slide, e.currentTarget.value)} placeholder="Text on the slide" aria-label="Slide text" />
          <button class="small" onclick={() => (editing = { action: a, which: 'slide' })}>Edit slide…</button>
        {:else if a.do === 'question'}
          <input value={slideText(a.question)} oninput={(e) => setSlideText(a.question, e.currentTarget.value)} placeholder="Question" aria-label="Question" />
          <input value={slideText(a.answer)} oninput={(e) => setSlideText(a.answer, e.currentTarget.value)} placeholder="Answer" aria-label="Answer" />
          <label class="small">Worth<input type="number" bind:value={a.value} class="n" /></label>
          <button class="small" onclick={() => (editing = { action: a, which: 'question' })}>Edit slides…</button>
        {:else if a.do === 'sound'}
          <div class="pop">
            <button class="small" onclick={() => (pickingSound = a.id)}>
              {a.media ? `🔊 ${game.media.find((m) => m.id === a.media)?.name ?? 'sound'}` : 'Choose sound…'}
            </button>
            {#if pickingSound === a.id}
              <MediaPicker kind="audio" onpick={(id) => ((a.media = id), (pickingSound = null))} onclose={() => (pickingSound = null)} />
            {/if}
          </div>
          {#if a.media && !mediaUrls[a.media]}<span class="warn small">missing</span>{/if}
        {:else if a.do === 'move'}
          {#if world}<ScreenPicker {world} value={a.to} onchange={(r) => r && (a.to = r)} />{/if}
          {@render who(a, 'party')}
        {:else if a.do === 'reveal' || a.do === 'hide'}
          <select bind:value={a.object} aria-label="Object">
            {#if !objects.some((o) => o.id === a.object)}<option value={a.object}>{a.object ? '⚠ Deleted object — pick another' : '— choose —'}</option>{/if}
            {#each objects as o (o.id)}<option value={o.id}>{o.name || o.kind}</option>{/each}
          </select>
        {:else if a.do === 'shop'}
          <select bind:value={a.shop} aria-label="Shop">
            {#if !game.shops?.some((s) => s.id === a.shop)}
              <option value={a.shop}>{a.shop ? '⚠ Deleted shop — pick another' : game.shops?.length ? '— choose —' : 'Add a shop in 📊 Stats & Items'}</option>
            {/if}
            {#each game.shops ?? [] as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
          </select>
        {:else if a.do === 'timer'}
          <input type="number" min="1" bind:value={a.seconds} aria-label="Seconds" class="n" /> <span class="small muted">seconds</span>
        {:else if a.do === 'goto'}
          {@const to = a.zone ? `z:${a.zone}` : `s:${a.space ?? ''}`}
          <select
            value={to}
            onchange={(e) => {
              const [k, v] = [e.currentTarget.value.slice(0, 1), e.currentTarget.value.slice(2)];
              a.space = k === 's' ? v : undefined;
              a.zone = k === 'z' ? v : undefined;
            }}
            aria-label="Send to"
          >
            {#if !(a.zone ? board?.zones.some((z) => z.id === a.zone) : board?.spaces.some((sp) => sp.id === a.space))}
              <option value={to}>{a.zone ? '⚠ Deleted zone — pick another' : a.space ? '⚠ Deleted space — pick another' : '— choose —'}</option>
            {/if}
            {#each board?.spaces ?? [] as sp (sp.id)}<option value="s:{sp.id}">{sp.name}</option>{/each}
            {#each board?.zones ?? [] as z (z.id)}<option value="z:{z.id}">🌀 {z.name}</option>{/each}
          </select>
          {@render who(a)}
        {:else if a.do === 'note'}
          <input bind:value={a.text} placeholder="A reminder for you (never on stream)" aria-label="Note" />
        {/if}
      </div>
    </div>
  {/each}
  <div class="row">
    <button class="small" onclick={openMenu} aria-haspopup="menu">＋ Add action</button>
  </div>
</div>

{#if editing}
  {@const e = editing}
  {#if e.action.do === 'popup'}
    <SlideModal slide={e.action.slide} title="Pop-up slide" onclose={() => (editing = null)} />
  {:else if e.action.do === 'question'}
    <!-- A fresh editor for the answer, with the answer slide's own undo history. -->
    {#key e.which}
      <SlideModal
        slide={e.which === 'answer' ? e.action.answer : e.action.question}
        title={e.which === 'answer' ? 'Answer slide' : 'Question slide (Done, then edit the answer)'}
        onclose={() => (editing = e.which === 'question' ? { ...e, which: 'answer' } : null)}
      />
    {/key}
  {/if}
{/if}

<style>
  .actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .act {
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px;
  }
  .head,
  .fields {
    display: flex;
    gap: 4px;
    align-items: center;
    flex-wrap: wrap;
  }
  .fields {
    margin-top: 4px;
  }
  .fields input:not(.n) {
    flex: 1;
    min-width: 120px;
  }
  .n {
    width: 70px;
  }
  .small {
    font-size: 12px;
  }
  .tiny {
    font-size: 11px;
    padding: 1px 5px;
  }
  .pop {
    position: relative;
  }
</style>
