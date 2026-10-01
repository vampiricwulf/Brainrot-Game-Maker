<!--
  A newer version is out: what this copy can do about it. The desktop app updates itself in place (it downloads the
  new .exe, checks its signature, saves everything and restarts into it); a copy that can't (no signing key built in)
  or the HTML file offers the new file to download. Shown in the editor's notice (`notice`) and in ℹ About.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { toast } from '../lib/app.svelte';
  import { canSelfUpdate, installUpdate, openLink } from '../lib/desktop.svelte';
  import { inTauri } from '../lib/platform';
  import { ASSETS, skipVersion, update, type Release } from '../lib/update.svelte';

  let { release, notice = false }: { release: Release; notice?: boolean } = $props();

  const desktopApp = inTauri();
  let selfUpdate = $state(false);
  onMount(() => void canSelfUpdate().then((ok) => (selfUpdate = ok)));

  const exe = $derived(release.files[ASSETS.exe]);
  const sig = $derived(release.files[ASSETS.sig]);
  const html = $derived(release.files[ASSETS.html]);

  /** In the desktop app, links open in the default browser. */
  function open(url: string): void {
    if (!desktopApp) return void window.open(url, '_blank', 'noopener');
    openLink(url).then((ok) => !ok && toast(`Couldn't open the browser: ${url}`));
  }

  async function install(): Promise<void> {
    if (!exe || !sig) return;
    update.status = 'installing';
    try {
      await installUpdate(exe, sig);
    } catch (err) {
      update.status = 'available';
      toast(typeof err === 'string' ? err : err instanceof Error ? err.message : "The update didn't install.", 8000);
    }
  }
</script>

{#if desktopApp && selfUpdate && exe && sig}
  <button class="small primary" onclick={install} disabled={update.status === 'installing'} title="Downloads it, checks it's the real thing, saves your game and restarts the app">
    {update.status === 'installing' ? 'Updating…' : `⬆ Update to ${release.version}`}
  </button>
{:else if desktopApp}
  <button class="small primary" onclick={() => open(exe ?? release.page)} title="Put the downloaded .exe in place of this one">⬇ Download {release.version}</button>
{:else}
  <button class="small primary" onclick={() => open(html ?? release.page)} title="Save it in place of this file (same name and folder) and open that: your games carry over">
    ⬇ Download {release.version}
  </button>
{/if}
<button class="small ghost" onclick={() => open(release.page)}>What’s new</button>
{#if notice}
  <button class="small ghost" onclick={() => skipVersion(release.version)} title="Hide this until a newer version is out">Not now</button>
{/if}
