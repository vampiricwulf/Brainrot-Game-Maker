<!-- Long help, folded away: one line shows, "Tips" opens the rest. The first time a place (`id`) is seen the tips are
     open; after that, open or closed is remembered on this computer, so help that's been read once stays out of the way. -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { id, hint, children }: { id: string; /** The one line that always shows. */ hint?: string; children: Snippet } = $props();
  const key = () => `jb.tips.${id}`;
  let open = $state(read());

  /** Open or closed as last left; never seen before: open this once (and closed from then on, unless opened again). */
  function read(): boolean {
    try {
      const was = localStorage.getItem(key());
      if (was === null) {
        localStorage.setItem(key(), 'closed');
        return true;
      }
      return was === 'open';
    } catch {
      return false;
    }
  }
  function toggled(e: Event): void {
    const now = (e.currentTarget as HTMLDetailsElement).open;
    // (The toggle a details shown open fires on its own isn't the host's choice.)
    if (now === open) return;
    open = now;
    try {
      localStorage.setItem(key(), open ? 'open' : 'closed');
    } catch {
      /* not kept: it opens closed next time */
    }
  }
</script>

{#if hint}<p class="hint tips-hint">{hint}</p>{/if}
<details class="tips" {open} ontoggle={toggled}>
  <summary>💡 Tips</summary>
  {@render children()}
</details>

<style>
  .tips-hint {
    margin: 0 0 4px;
  }
</style>
