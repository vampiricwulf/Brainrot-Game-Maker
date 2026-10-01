<!-- "Save a copy": download a live-link file into the game (same id, so every use of it keeps working). -->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { app, toast } from '../lib/app.svelte';
  import { fetchLinkCopy, formatBytes, keepLinkCopy, stashMedia } from '../lib/media.svelte';
  import { attachBlobSwap, stepAsync } from '../lib/history.svelte';
  import { isAbort } from '../lib/download';

  let { id, label = '💾 Save a copy', onsaved }: { id: string; label?: string; onsaved?: () => void } = $props();

  let busy = $state<number | null>(null);
  let controller: AbortController | null = null;
  onDestroy(() => controller?.abort());

  async function save(): Promise<void> {
    const ctl = (controller = new AbortController());
    busy = 0;
    try {
      // Downloaded first (changes made meanwhile are steps of their own), then put in as one step: Undo makes it a link
      // again, and takes the copy's bytes out (kept for Redo).
      const copy = await fetchLinkCopy(app.game, id, { signal: ctl.signal, onprogress: (n) => (busy = n) });
      const game = app.game;
      const name = game.media.find((m) => m.id === id)?.name ?? 'the file';
      const kept =
        !!copy &&
        (await stepAsync(`Saved a copy of “${name}”`, async () => {
          const before = await stashMedia(id);
          if (!(await keepLinkCopy(game, id, copy))) return false;
          attachBlobSwap({ id, before, after: await stashMedia(id) });
          return true;
        }));
      if (!kept) return;
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
