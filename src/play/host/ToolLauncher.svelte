<!-- Dice / wheel / roll-off / scoreboard buttons, usable any time (spec §6.6). -->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { app, toast } from '../../lib/app.svelte';
  import type { Game, Session } from '../../lib/model';
  import { openPlayerWheel, openQuickWheel, openWheel, quickDice, rollDice, toggleScoreboard } from '../../lib/overlay';
  import { parseDice, parseQuickWheel, QUICK_DICE } from '../../lib/tools';
  import { audience } from '../../lib/sync.svelte';

  let { game, session, onrolloff }: { game: Game; session: Session; onrolloff: (ids: string[], sides: number) => void } = $props();
  let menu = $state<'dice' | 'wheel' | 'rolloff' | null>(null);
  /** Single window: the height an open menu has above its button, up to the host panel's top (viewers see the stage above). */
  let room = $state<number>();
  let custom = $state('');
  let quickList = $state('');
  // Players left out of the roll-off; everyone else rolls (so players added or removed mid-game just work).
  let skipped = $state<string[]>([]);
  const who = $derived(session.players.filter((p) => !skipped.includes(p.id)).map((p) => p.id));
  let sides = $state<number | null>(untrack(() => game.settings.rollOffDie || 20));
  /** A die from d2 to d1000 (a blank box, or a d1 that would tie every round, can't be rolled). */
  const sidesOk = $derived(!!sides && sides >= 2 && sides <= 1000);

  /** The button that opened the menu: Esc gives it the focus back. */
  let opener: HTMLElement | null = null;

  /** Open (or close) a menu from its button: over the host panel only, unless there's an audience window. */
  async function toggle(m: 'dice' | 'wheel' | 'rolloff', e: MouseEvent): Promise<void> {
    const b = e.currentTarget as HTMLElement;
    menu = menu === m ? null : m;
    opener = b;
    // Measured once it's open: the host panel grows to make room for it (see HostPanel).
    await tick();
    const panel = b.closest('.panel')?.getBoundingClientRect();
    room = audience.open || !panel ? undefined : Math.max(0, b.getBoundingClientRect().top - panel.top - 8);
  }

  function dice(sides: number, count: number, name?: string): void {
    rollDice(app.live, session, quickDice(sides, count, name));
    menu = null;
  }

  /** Open a wheel, with its edit box open when `edit` (to change this spin's slices or chances first). */
  function wheel(open: () => void, edit = false): void {
    open();
    const o = app.live.overlay;
    if (o?.kind === 'wheel') o.editing = edit;
    menu = null;
  }

  function quickWheel(edit: boolean): void {
    const options = parseQuickWheel(quickList);
    if (options.length < 2) return toast('Add at least two options');
    wheel(() => openQuickWheel(app.live, options), edit);
  }

  function rollCustom(): void {
    const d = parseDice(custom);
    if (d) dice(d.sides, d.count, custom.trim());
    else toast('Use dice notation like d20 or 2d6 (up to 1000 sides)');
  }
</script>

<!-- Esc closes an open menu (even from its text boxes) and does nothing else: no overlay closed, no clue left. -->
<svelte:window
  onkeydowncapture={(e) => {
    if (menu && e.key === 'Escape') {
      e.stopImmediatePropagation();
      menu = null;
      opener?.focus();
    }
  }}
/>

<div class="tl">
  <div class="pop">
    <button onclick={(e) => toggle('dice', e)} title="D rolls the last dice" aria-haspopup="dialog" aria-expanded={menu === 'dice'}>🎲 Dice</button>
    {#if menu === 'dice'}
      <div class="menu" role="dialog" aria-label="Dice" style:max-height={room === undefined ? undefined : `${room}px`}>
        <div class="grid">
          {#each QUICK_DICE as q}<button class="small" onclick={() => dice(q.sides, q.count, q.label)}>{q.label}</button>{/each}
        </div>
        <div class="row">
          <input placeholder="e.g. 3d37" bind:value={custom} onkeydown={(e) => e.key === 'Enter' && rollCustom()} />
          <button class="small" onclick={rollCustom}>Roll</button>
        </div>
        {#if game.dice.length}
          <div class="muted small">Saved dice</div>
          {#each game.dice as p (p.id)}
            <button class="small item" onclick={() => ((menu = null), rollDice(app.live, session, p))}>{p.name}</button>
          {/each}
        {/if}
      </div>
    {/if}
  </div>
  <div class="pop">
    <button onclick={(e) => toggle('wheel', e)} aria-haspopup="dialog" aria-expanded={menu === 'wheel'}>🎡 Wheel</button>
    {#if menu === 'wheel'}
      <div class="menu" role="dialog" aria-label="Wheels" style:max-height={room === undefined ? undefined : `${room}px`}>
        <div class="wl">
          <button
            class="small item"
            disabled={session.players.length < 2}
            title={session.players.length < 2 ? 'Needs at least two players' : 'A wheel of the players, in their colors'}
            onclick={() => wheel(() => openPlayerWheel(app.live, session))}>🎯 Pick a player</button>
          <button
            class="small ghost"
            disabled={session.players.length < 2}
            aria-label="Edit Pick a player, then spin"
            title="Leave players out or change their chances for this spin"
            onclick={() => wheel(() => openPlayerWheel(app.live, session), true)}>✎</button>
        </div>
        {#each game.wheels as w (w.id)}
          <div class="wl">
            <button class="small item" onclick={() => wheel(() => openWheel(app.live, session, w))}>{w.name}</button>
            <button
              class="small ghost"
              aria-label={`Edit ${w.name}, then spin`}
              title="Change slices or chances for this spin (the saved wheel stays as it is)"
              onclick={() => wheel(() => openWheel(app.live, session, w), true)}>✎</button>
          </div>
        {:else}
          <div class="muted small">No saved wheels yet: make them in the editor's 🎡 tab, or use a quick one.</div>
        {/each}
        <div class="muted small">Quick wheel (one option per line)</div>
        <textarea rows="4" bind:value={quickList} placeholder={'Sing a song\nDo 10 push-ups x2\nSkip'} aria-label="Quick wheel options"></textarea>
        <div class="muted small">End a line with x2, x3… to make it that many times as likely.</div>
        <div class="row">
          <button class="small" onclick={() => quickWheel(false)}>Open quick wheel</button>
          <button class="small" onclick={() => quickWheel(true)} title="Open it with the edit box: colors, chances, and Save as">✎ Open & edit</button>
        </div>
      </div>
    {/if}
  </div>
  <div class="pop">
    <button onclick={(e) => toggle('rolloff', e)} title="O rolls for everyone" aria-haspopup="dialog" aria-expanded={menu === 'rolloff'}>🏁 Who goes first</button>
    {#if menu === 'rolloff'}
      <div class="menu" role="dialog" aria-label="Who goes first" style:max-height={room === undefined ? undefined : `${room}px`}>
        <div class="muted small">Everyone included rolls; tied leaders re-roll.</div>
        {#each session.players as p (p.id)}
          <label class="check small">
            <input
              type="checkbox"
              checked={who.includes(p.id)}
              onchange={(e) => (skipped = e.currentTarget.checked ? skipped.filter((x) => x !== p.id) : [...skipped, p.id])}
            />
            <span style:color={p.color}>●</span> {p.name}
          </label>
        {/each}
        <label class="check small">Die: d<input type="number" min="2" max="1000" bind:value={sides} class="n" /></label>
        <button
          class="primary small"
          disabled={who.length < 1 || !sidesOk}
          title={sidesOk ? '' : 'Pick a die from d2 to d1000'}
          onclick={() => {
            onrolloff(who, Math.round(sides!));
            menu = null;
          }}>Roll for {who.length}</button>
      </div>
    {/if}
  </div>
  <button onclick={() => ((menu = null), toggleScoreboard(app.live))} title="S">📊 Scores</button>
</div>

{#if menu}<div class="backdrop" onclick={() => (menu = null)} role="presentation"></div>{/if}

<style>
  .tl {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .pop {
    position: relative;
  }
  /* Above the backdrop, so another tool's button switches menus in one click. */
  .pop > button,
  .tl > button {
    position: relative;
    z-index: 61;
  }
  .menu {
    position: absolute;
    bottom: 100%;
    left: 0;
    margin-bottom: 6px;
    z-index: 60;
    width: 260px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    overflow: auto;
  }
  /* A short menu scrolls (its parts keep their size). */
  .menu > * {
    flex-shrink: 0;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
  }
  .item {
    text-align: left;
  }
  .wl {
    display: flex;
    gap: 4px;
  }
  .wl .item {
    flex: 1;
  }
  .small {
    font-size: 12px;
  }
  .n {
    width: 70px;
  }
  input:not([type]) {
    flex: 1;
    min-width: 0;
  }
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 55;
  }
</style>
