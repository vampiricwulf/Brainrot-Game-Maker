<!-- ℹ About: version and build, links, and where this copy keeps its data (the desktop app's folders, with buttons to
     open them, so nobody is surprised by folders the app made). -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { toast } from '../lib/app.svelte';
  import { dataFolders, openDataFolder, openLink, type DataFolders, type FolderName } from '../lib/desktop.svelte';
  import { inTauri } from '../lib/platform';

  let { onclose }: { onclose: () => void } = $props();

  const REPO = 'https://github.com/vampiricwulf/Brainrot-Game-Maker';
  const desktopApp = inTauri();
  let folders = $state<DataFolders | null>(null);
  const leftovers = $derived(
    folders ? ([['old-data', folders.oldData], ['old-settings', folders.oldSettings]] as const).filter(([, f]) => f?.exists && f.path) : [],
  );
  let modal = $state<HTMLElement>();

  onMount(() => {
    modal?.focus();
    if (desktopApp) dataFolders().then((f) => (folders = f));
  });

  /** In the desktop app, the project's pages open in the default browser instead of an app window. */
  function link(e: MouseEvent): void {
    if (!desktopApp) return;
    e.preventDefault();
    const url = (e.currentTarget as HTMLAnchorElement).href;
    openLink(url).then((ok) => !ok && toast(`Couldn't open the browser: ${url}`));
  }

  async function show(which: FolderName): Promise<void> {
    const err = await openDataFolder(which);
    if (err) toast(err);
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape') {
      e.stopImmediatePropagation();
      onclose();
    }
  }}
/>

<div class="backdrop" onclick={(e) => e.target === e.currentTarget && onclose()} role="presentation">
  <div class="modal" role="dialog" aria-modal="true" aria-label="About Brainrot Games Maker" tabindex="-1" bind:this={modal}>
    <h2>Brainrot Games Maker</h2>
    <p class="muted">Build game shows (Jeopardy boards, RPG maps and more) with rich slides, then host them for a livestream.</p>
    <dl>
      <dt>Version</dt>
      <dd>{__APP_VERSION__} ({desktopApp ? 'Windows desktop app' : 'single HTML file'})</dd>
      <dt>Build</dt>
      <dd>{__BUILD_COMMIT__ ? `${__BUILD_COMMIT__}, ` : ''}{__BUILD_DATE__}</dd>
      <dt>Source</dt>
      <dd><a href={REPO} target="_blank" rel="noreferrer" onclick={link}>GitHub: vampiricwulf/Brainrot-Game-Maker</a></dd>
      <dt>Updates</dt>
      <dd><a href={`${REPO}/releases/latest`} target="_blank" rel="noreferrer" onclick={link}>Latest release</a></dd>
      <dt>Problems</dt>
      <dd><a href={`${REPO}/issues`} target="_blank" rel="noreferrer" onclick={link}>Report an issue</a></dd>
      <dt>License</dt>
      <dd>MIT. Bundled fonts: SIL Open Font License.</dd>
    </dl>

    <h3>Where your data is saved</h3>
    {#if desktopApp}
      <p class="muted">
        The desktop app keeps your autosave, the media you add and its settings in these folders on this PC. Nothing else
        is written anywhere, except files you save or export yourself.
      </p>
      {#if folders}
        <div class="folder">
          <div>
            <div class="what">Autosave, games in progress and media</div>
            <code>{folders.data.path ?? 'unknown'}</code>
          </div>
          <button class="small" disabled={!folders.data.exists} onclick={() => show('data')}>📂 Open folder</button>
        </div>
        <div class="folder">
          <div>
            <div class="what">Settings (Discord audio fix)</div>
            <code>{folders.settings.path ?? 'unknown'}</code>
            {#if !folders.settings.exists}<div class="muted small">Not created: it's only made if you change the Discord audio fix.</div>{/if}
          </div>
          {#if folders.settings.exists}<button class="small" onclick={() => show('settings')}>📂 Open folder</button>{/if}
        </div>
        {#if leftovers.length}
          <div class="leftover" role="note">
            <div class="what">Left over from Jeopardy Builder (the old name)</div>
            <p class="muted small">
              This app couldn't move {leftovers.length === 1 ? 'this folder' : 'these folders'} (the old app may have been
              open, or this app already had data of its own). Look inside, then delete {leftovers.length === 1 ? 'it' : 'them'}
              when you no longer need {leftovers.length === 1 ? 'it' : 'them'}.
            </p>
            {#each leftovers as [which, f] (which)}
              <div class="folder">
                <code>{f!.path}</code>
                <button class="small" onclick={() => show(which)}>📂 Open folder</button>
              </div>
            {/each}
          </div>
        {/if}
        <p class="muted small">
          Removing Brainrot Games Maker? Delete these folders too. Deleting them while the app is closed starts it fresh:
          anything not saved as a .brainrot (or exported) is lost.
        </p>
      {:else}
        <p class="muted small">Looking up the folders…</p>
      {/if}
    {:else}
      <p class="muted">
        The autosave and the media you add are kept in this browser's storage for this file (nothing is uploaded). Another
        browser, or this file in another folder, starts empty. Clearing this browser's site data deletes them, so use
        <b>Save</b> (.brainrot) to keep a copy.
      </p>
    {/if}
    <div class="end"><button class="primary" onclick={onclose}>Close</button></div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(0, 0, 0, 0.6);
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    grid-template-columns: minmax(0, 1fr);
    place-items: center;
    padding: 16px;
  }
  .modal {
    width: min(620px, 100%);
    max-height: 100%;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 18px 22px;
    font-size: 14px;
    outline: none;
  }
  h2,
  h3,
  p {
    margin: 0;
  }
  h3 {
    margin-top: 6px;
    font-size: 15px;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 14px;
    margin: 0;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
  }
  .folder {
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
  }
  .folder > div {
    min-width: 0;
  }
  .folder button {
    flex: none;
  }
  .leftover {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 10px;
    border: 1px solid var(--warn);
    border-radius: 8px;
  }
  .what {
    font-weight: 600;
    margin-bottom: 2px;
  }
  code {
    display: block;
    word-break: break-all;
    font-size: 12px;
    user-select: text;
  }
  .small {
    font-size: 12px;
  }
  .end {
    display: flex;
    justify-content: flex-end;
  }
</style>
