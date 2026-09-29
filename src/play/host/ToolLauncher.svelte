<!-- Dice / wheel / roll-off / scoreboard buttons, usable any time (spec §6.6). -->
<script lang="ts">
  import { untrack } from 'svelte';
  import { app, toast } from '../../lib/app.svelte';
  import type { Game, Session } from '../../lib/model';
  import { openQuickWheel, openWheel, quickDice, rollDice, toggleScoreboard } from '../../lib/overlay';
  import { parseDice, QUICK_DICE } from '../../lib/tools';

  let { game, session, onrolloff }: { game: Game; session: Session; onrolloff: (ids: string[], sides: number) => void } = $props();
  let menu = $state<'dice' | 'wheel' | 'rolloff' | null>(null);
  let custom = $state('');
  let quickList = $state('');
  // Players left out of the roll-off; everyone else rolls (so players added or removed mid-game just work).
  let skipped = $state<string[]>([]);
  const who = $derived(session.players.filter((p) => !skipped.includes(p.id)).map((p) => p.id));
  let sides = $state(untrack(() => game.settings.rollOffDie || 20));

  function dice(sides: number, count: number, name?: string): void {
    rollDice(app.live, session, quickDice(sides, count, name));
    menu = null;
  }

  function rollCustom(): void {
    const d = parseDice(custom);
    if (d) dice(d.sides, d.count, custom.trim());
    else toast('Use dice notation like d20 or 2d6 (up to 1000 sides)');
  }
</script>

<div class="tl">
  <div class="pop">
    <button onclick={() => (menu = menu === 'dice' ? null : 'dice')} title="D rolls the last dice">🎲 Dice</button>
    {#if menu === 'dice'}
      <div class="menu">
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
    <button onclick={() => (menu = menu === 'wheel' ? null : 'wheel')}>🎡 Wheel</button>
    {#if menu === 'wheel'}
      <div class="menu">
        {#each game.wheels as w (w.id)}
          <button class="small item" onclick={() => ((menu = null), openWheel(app.live, session, w))}>{w.name}</button>
        {:else}
          <div class="muted small">No saved wheels yet: make them in the editor's 🎡 tab, or use a quick one:</div>
        {/each}
        <div class="muted small">Quick wheel (one option per line)</div>
        <textarea rows="4" bind:value={quickList} placeholder={'Sing a song\nDo 10 push-ups\nSkip'}></textarea>
        <button
          class="small"
          onclick={() => {
            const labels = quickList.split('\n').map((l) => l.trim()).filter(Boolean);
            if (labels.length < 2) return toast('Add at least two options');
            openQuickWheel(app.live, labels);
            menu = null;
          }}>Open quick wheel</button>
      </div>
    {/if}
  </div>
  <div class="pop">
    <button onclick={() => (menu = menu === 'rolloff' ? null : 'rolloff')} title="O rolls for everyone">🏁 Who goes first</button>
    {#if menu === 'rolloff'}
      <div class="menu">
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
          disabled={who.length < 1}
          onclick={() => {
            onrolloff(who, sides);
            menu = null;
          }}>Roll for {who.length}</button>
      </div>
    {/if}
  </div>
  <button onclick={() => toggleScoreboard(app.live)} title="S">📊 Scores</button>
</div>

{#if menu}<div class="backdrop" onclick={() => (menu = null)} role="presentation"></div>{/if}

<style>
  .tl {
    display: flex;
    gap: 6px;
  }
  .pop {
    position: relative;
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
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
  }
  .item {
    text-align: left;
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
