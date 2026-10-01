<!-- Long help, folded away: one line shows, "Tips" opens the rest. Open or closed is remembered on this computer, per
     place (`id`), so help that's been read once stays out of the way. -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { id, hint, children }: { id: string; /** The one line that always shows. */ hint?: string; children: Snippet } = $props();
  const key = () => `jb.tips.${id}`;
  let open = $state(read());

  function read(): boolean {
    try {
      return localStorage.getItem(key()) === 'open';
    } catch {
      return false;
    }
  }
  function toggled(e: Event): void {
    open = (e.currentTarget as HTMLDetailsElement).open;
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
