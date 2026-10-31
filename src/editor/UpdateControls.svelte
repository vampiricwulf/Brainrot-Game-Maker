<!--
  A newer version is out: what this copy can do about it. The desktop app updates itself in place (it downloads the
  new .exe, checks its signature, saves everything and restarts into it); a copy that can't (no signing key built in)
  or the HTML file offers the new file to download. Shown in the editor's notice (`notice`) and in ℹ About. Once the HTML
  file's download is open in a new tab, both say what to do with it (the page itself can't change the file).
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { app, toast } from '../lib/app.svelte';
  import { ask, tell } from '../lib/ask.svelte';
  import { canSelfUpdate, installUpdate, openLink, restartIntoUpdate } from '../lib/desktop.svelte';
  import { inTauri } from '../lib/platform';
  import { oneShot } from '../lib/oneshot';
  import { jobAsk, jobLine, stopAll } from '../lib/shrink/jobs.svelte';
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
    // A ✎ / 🗜 / 🔄 job would be cut off by the restart: asked first, as New and ▶ Play do.
    const job = jobAsk('restart into the new version');
    if (job) {
      if (!(await ask(job, { ok: 'Stop it and update', cancel: 'Keep working' }))) return;
      stopAll(undefined, true);
    }
    update.status = 'installing';
    try {
      // Already in place (the restart failed last time): only the restart is left.
      if (update.installed !== release.version) {
        await installUpdate(exe, sig);
        update.installed = release.version;
      }
      // A game (or a job) started while it downloaded: no restart by itself. The button says ⟳ Restart into it.
      if (app.screen === 'play' || jobLine()) {
        update.status = 'available';
        const when = app.screen === 'play' ? 'from the editor when the game is over' : 'once the job is done';
        toast(`Version ${release.version} is ready: ⟳ Restart into it ${when}.`, 8000);
        return;
      }
      await restartIntoUpdate();
    } catch (err) {
      update.status = 'available';
      const why = typeof err === 'string' ? err : err instanceof Error ? err.message : '';
      const msg =
        update.installed === release.version
          ? `Version ${release.version} is in place, but the app didn't restart${why ? ` (${why})` : ''}. Press Restart again, or close the app and open it.`
          : why || "The update didn't install.";
      // (Shown until it's read: it can say what the next start needs. During a game, back in the editor: nothing pops
      // up over the stage, nor takes the keys.)
      if (app.screen !== 'play') return void tell(msg);
      update.failed = msg;
      toast(`Version ${release.version} didn't install: the editor says why when you go back.`, 8000);
    }
  }
  const ready = $derived(update.installed === release.version);

  /** The HTML file: the new one opens in a new tab, and the steps from there show here (and in the other place). */
  let doneBtn = $state<HTMLButtonElement>();
  function download(): void {
    open(html ?? release.page);
    update.downloading = release.version;
    // (Its button gives way to the steps: the keys go to Done.)
    void tick().then(() => doneBtn?.focus());
  }
  const steps = $derived(
    `${html ? `Downloading ${release.version} in a new tab.` : `${release.version}'s page is open in a new tab: download its .html file there.`} Then save it over your old Brainrot file (same name, same folder) and open it. Your games come along.`,
  );
</script>

{#if desktopApp && selfUpdate && exe && sig}
  <button class="small primary" onclick={install} disabled={update.status === 'installing'} title={ready ? 'Saves your game and restarts into the new version' : "Downloads it, checks it's the real thing, saves your game and restarts the app"}>
    {update.status === 'installing' ? 'Updating…' : ready ? `⟳ Restart into ${release.version}` : `⬆ Update to ${release.version}`}
  </button>
{:else if desktopApp}
  <button class="small primary" onclick={() => open(exe ?? release.page)} title="Put the downloaded .exe in place of this one">⬇ Download {release.version}</button>
{:else if notice && update.downloading === release.version}
  <!-- The notice: the steps, then What's new and ✕ Done (back to the notice). -->
  <span class="steps">{steps}</span>
{:else}
  <button class="small primary" onclick={download} title="Save it in place of this file (same name and folder) and open that: your games carry over">
    ⬇ Download {release.version}
  </button>
{/if}
<button class="small ghost" onclick={() => open(release.page)}>What’s new</button>
<!-- The notice's ✕, at its far right (named for what it does: Done puts the steps away, Not now hides the notice).
     (Not now comes up where Done was: a double-click on Done is one click, never Not now too.) -->
{#if notice && !desktopApp && update.downloading === release.version}
  <button class="small ghost notice-x" bind:this={doneBtn} use:oneShot onclick={() => (update.downloading = '')} aria-label="Done" title="Done: put these steps away">✕</button>
{:else if notice}
  <button class="small ghost notice-x" onclick={() => skipVersion(release.version)} aria-label="Not now" title="Hide until a newer version is out">✕</button>
{/if}
{#if !notice && !desktopApp && update.downloading === release.version}
  <!-- ℹ About: the steps on a line of their own, under its buttons (its own Done closes it). -->
  <span class="steps own-line">{steps}</span>
{/if}

<style>
  .own-line {
    flex-basis: 100%;
  }
</style>
