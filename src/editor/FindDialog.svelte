<!--
  🔍 Find (Ctrl+F): type words, see every clue, screen, space, item, wheel… that has them, and go there (as the
  History tab's Go there does). ↑/↓ move through the list, Enter goes to the one picked.
-->
<script lang="ts" module>
  /** The last search, back for the next Ctrl+F (as in a browser). */
  const last = { query: '' };
</script>

<script lang="ts">
  import { app, toast } from '../lib/app.svelte';
  import { modal } from '../lib/modal';
  import { findAll, type Hit } from '../lib/find';
  import { goTo, placeKey } from '../lib/nav.svelte';

  let { onclose }: { onclose: () => void } = $props();

  let query = $state(last.query);
  let at = $state(0);
  const LIMIT = 200;
  const hits = $derived(findAll(app.game, query, LIMIT));
  $effect(() => {
    last.query = query;
  });
  let listEl = $state<HTMLElement>();

  function go(h: Hit | undefined): void {
    if (!h) return;
    onclose();
    const to = goTo(h.place);
    if (!to) return toast('It was deleted since', 3000);
    focusThere(to === h.place ? h.focus : undefined, placeKey(to));
  }

  /**
   * Once what Find went to is on screen, the focus goes there: to the field with the words (`selector`), else to what
   * flashes (or the first field in it). Never left on the page itself.
   */
  function focusThere(selector: string | undefined, key: string | null): void {
    let frames = 0;
    const tryNow = () => {
      const field = selector ? document.querySelector<HTMLElement>(selector) : null;
      const flashed = key ? document.querySelector<HTMLElement>(`[data-place="${CSS.escape(key)}"]`) : null;
      const target =
        field ??
        (flashed?.matches('button, input, textarea, select, [tabindex]') ? flashed : flashed?.querySelector<HTMLElement>('input, textarea, select, button'));
      // (What opens there can take a few frames: a clue editor, a space's card.)
      if (!target && ++frames < 30) return void requestAnimationFrame(tryNow);
      if (!target) return;
      // After what opened has put the focus where it wants it.
      requestAnimationFrame(() => {
        target.focus();
        if (target === field && target instanceof HTMLInputElement) target.select();
      });
    };
    requestAnimationFrame(tryNow);
  }

  function onkey(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      at = Math.max(0, Math.min(hits.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)));
      listEl?.querySelector(`[data-hit="${at}"]`)?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(hits[at]);
    }
  }

  const focus = (el: HTMLInputElement) => {
    el.focus();
    el.select();
  };
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape') {
      e.stopImmediatePropagation();
      e.preventDefault();
      onclose();
    }
  }}
/>

<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="modal" role="dialog" aria-modal="true" aria-label="Find" use:modal data-undo="off">
    <div class="row">
      <h2 class="modal-title">🔍 Find</h2>
      <span class="spacer"></span>
      <button class="ghost modal-x" onclick={onclose} aria-label="Close" title="Close (Esc)">✕</button>
    </div>
    <div class="row">
      <input
        class="q"
        type="search"
        role="combobox"
        aria-expanded={hits.length > 0}
        aria-autocomplete="list"
        aria-activedescendant={hits.length ? `find-hit-${at}` : undefined}
        bind:value={query}
        oninput={() => (at = 0)}
        onkeydown={onkey}
        placeholder="Find clues, screens, spaces, items, wheels…"
        aria-label="Find"
        aria-controls="find-hits"
        use:focus
      />
    </div>
    <p class="muted small" role="status">
      {#if !query.trim()}
        Type some words: every one must be there (capitals don’t matter).
      {:else if !hits.length}
        Nothing found.
      {:else}
        {hits.length}{hits.length >= LIMIT ? '+' : ''} found · ↑/↓ and Enter, or click, to go there
      {/if}
    </p>
    {#if hits.length}
      <div class="hits" id="find-hits" role="listbox" aria-label="Found" bind:this={listEl}>
        {#each hits as h, i (i)}
          <!-- (One Tab stop: ↑/↓ in the box pick a result, which it announces.) -->
          <button
            class="hit"
            class:on={i === at}
            id="find-hit-{i}"
            data-hit={i}
            role="option"
            tabindex="-1"
            aria-selected={i === at}
            onclick={() => go(h)}
            onmouseenter={() => (at = i)}
          >
            <span class="icon" aria-hidden="true">{h.icon}</span>
            <span class="txt">
              <span class="t">{h.text}</span>
              <span class="w muted">{h.where}</span>
            </span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 150;
    background: rgba(0, 0, 0, 0.5);
    display: grid;
    justify-items: center;
    align-items: start;
    padding: 10vh 16px 16px;
  }
  .modal {
    width: min(680px, 100%);
    max-height: 75vh;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  p {
    margin: 0;
  }
  .row {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .q {
    flex: 1;
    font-size: 16px;
  }
  .hits {
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .hit {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    text-align: left;
    border: 1px solid transparent;
    background: none;
    white-space: normal;
    padding: 4px 6px;
  }
  .hit.on {
    background: var(--panel-2);
    border-color: var(--accent);
  }
  .txt {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .w {
    font-size: 12px;
  }
  .small {
    font-size: 12px;
  }
</style>
