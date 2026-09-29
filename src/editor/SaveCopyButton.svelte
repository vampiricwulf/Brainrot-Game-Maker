<!-- "Save a copy": download a live-link file into the game (same id, so every use of it keeps working). -->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { app, toast } from '../lib/app.svelte';
  import { formatBytes, saveLinkCopy } from '../lib/media.svelte';
  import { isAbort } from '../lib/download';

  let { id, label = '💾 Save a copy', onsaved }: { id: string; label?: string; onsaved?: () => void } = $props();

  let busy = $state<number | null>(null);
  let controller: AbortController | null = null;
  onDestroy(() => controller?.abort());

  async function save(): Promise<void> {
    const ctl = (controller = new AbortController());
    busy = 0;
    try {
      await saveLinkCopy(app.game, id, { signal: ctl.signal, onprogress: (n) => (busy = n) });
      toast('✓ Saved a copy in your game. It works offline now.', 4000);
      onsaved?.();
    } catch (e) {
      if (!isAbort(e)) toast(`⚠ ${(e as Error).message}`, 8000);
    } finally {
      if (controller === ctl) controller = null;
      busy = null;
    }
  }
</script>

{#if busy === null}
  <button class="small" onclick={save} title="Download the file into the game, so it works offline and never expires">{label}</button>
{:else}
  <span class="small busy" role="status">
    Saving… {busy ? formatBytes(busy) : ''}
    <button class="small ghost" onclick={() => controller?.abort()}>Cancel</button>
  </span>
{/if}

<style>
  .small {
    font-size: 12px;
  }
  .busy {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
  }
</style>
