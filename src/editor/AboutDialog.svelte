<!-- ℹ About: version and build, links, and where this copy keeps its data (the desktop app's folders, with buttons to
     open them, so nobody is surprised by folders the app made). -->
<script lang="ts">
  import { modal } from '../lib/modal';
  import { onMount } from 'svelte';
  import { toast } from '../lib/app.svelte';
  import { dataFolders, openDataFolder, openLink, type DataFolders, type FolderName } from '../lib/desktop.svelte';
  import { inTauri } from '../lib/platform';
  import { storageKept } from '../lib/persist';
  import { checkForUpdate, update } from '../lib/update.svelte';
  import { prefs } from '../lib/prefs.svelte';
  import UpdateControls from './UpdateControls.svelte';

  let { onclose }: { onclose: () => void } = $props();

  const REPO = 'https://github.com/vampiricwulf/Brainrot-Game-Maker';
  const desktopApp = inTauri();
  let folders = $state<DataFolders | null>(null);
  const leftovers = $derived(
    folders ? ([['old-data', folders.oldData], ['old-settings', folders.oldSettings]] as const).filter(([, f]) => f?.exists && f.path) : [],
  );

  /** Browser: whether it keeps this file's storage for good (null: it can't say). */
  let kept = $state<boolean | null>(null);
  onMount(() => {
    if (desktopApp) dataFolders().then((f) => (folders = f));
    else storageKept().then((k) => (kept = k));
  });

  /** When GitHub last answered: a time today, else the date. */
  function checkedWhen(at: number): string {
    const d = new Date(at);
    const today = d.toDateString() === new Date().toDateString();
    return today ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

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

<div class="modal-backdrop" onclick={(e) => e.target === e.currentTarget && onclose()} role="presentation">
  <div class="modal" role="dialog" aria-modal="true" aria-label="About Brainrot Games Maker" use:modal data-undo="off">
    <div class="modal-head">
      <h2 class="modal-title">ℹ Brainrot Games Maker</h2>
      <button class="ghost modal-x" onclick={onclose} aria-label="Close" title="Close (Esc)">✕</button>
    </div>
    <p class="muted">Build game shows (Jeopardy boards, RPG maps and more) with rich slides, then host them for a livestream.</p>
    <dl>
      <dt>Version</dt>
      <dd>{__APP_VERSION__} ({desktopApp ? 'Windows desktop app' : 'single HTML file'})</dd>
      <dt>Build</dt>
      <dd>{__BUILD_COMMIT__ ? `${__BUILD_COMMIT__}, ` : ''}{__BUILD_DATE__}</dd>
      <dt>Source</dt>
      <dd><a href={REPO} target="_blank" rel="noreferrer" onclick={link}>GitHub: vampiricwulf/Brainrot-Game-Maker</a></dd>
      <dt>Updates</dt>
      <dd class="updates">
        <span role="status">
          {#if update.status === 'checking'}Checking…{:else if update.status === 'available' && update.latest}Version {update.latest.version} is out.{:else if update.status === 'current'}✓ This is the newest version.{:else if update.status === 'failed'}{update.error}.{:else if update.status === 'idle' && !prefs.checkUpdates}Not checked at start-up (⚙ Settings).{/if}
          {#if update.checkedAt && update.status !== 'checking'}<span class="muted checked">(checked {checkedWhen(update.checkedAt)})</span>{/if}
        </span>
        {#if (update.status === 'available' || update.status === 'installing') && update.latest}
          <UpdateControls release={update.latest} />
        {:else}
          <a href={`${REPO}/releases/latest`} target="_blank" rel="noreferrer" onclick={link}>Latest release</a>
        {/if}
        <button class="small" onclick={() => checkForUpdate(true)} disabled={update.status === 'checking' || update.status === 'installing'}>Check for updates</button>
      </dd>
      <dt>Problems</dt>
      <dd><a href={`${REPO}/issues`} target="_blank" rel="noreferrer" onclick={link}>Report an issue</a></dd>
      <dt>License</dt>
      <dd>MIT. Bundled fonts: SIL Open Font License.</dd>
    </dl>

    <h3>Where your data is saved</h3>
    {#if desktopApp}
      <p class="muted">
        The desktop app keeps the game you’re editing, Recent games, the media you add and its settings in these folders on
        this PC. Nothing else is written anywhere, except the files you save or export and the timed autosaves (⚙ Settings):
        those go in a <b>BrainrotSaves</b> folder next to the app.
      </p>
      {#if folders}
        <div class="folder">
          <div>
            <div class="what">Your saves (Save, Export JSON, Export HTML, autosaves)</div>
            <code>{folders.saves?.path ?? 'unknown'}</code>
            {#if !folders.saves?.exists}<div class="hint">Made the first time you save.</div>{/if}
            {#if folders.savesDocuments?.exists}
              <div class="hint">
                Also in <code>{folders.savesDocuments.path}</code> (saves made when the app’s folder couldn’t be written).
                <button class="small ghost" onclick={() => show('saves-documents')}>📂 Open</button>
              </div>
            {/if}
          </div>
          <button class="small" onclick={() => show('saves')}>📂 Open folder</button>
        </div>
        <div class="folder">
          <div>
            <div class="what">The game you’re editing, Recent games, a game in progress and media</div>
            <code>{folders.data.path ?? 'unknown'}</code>
          </div>
          <button class="small" disabled={!folders.data.exists} onclick={() => show('data')}>📂 Open folder</button>
        </div>
        <div class="folder">
          <div>
            <div class="what">Settings (Discord audio fix)</div>
            <code>{folders.settings.path ?? 'unknown'}</code>
            {#if !folders.settings.exists}<div class="hint">Not made yet: it’s only made if you switch the Discord audio fix off.</div>{/if}
          </div>
          {#if folders.settings.exists}<button class="small" onclick={() => show('settings')}>📂 Open folder</button>{/if}
        </div>
        {#if leftovers.length}
          <div class="leftover" role="note">
            <div class="what">Left over from Jeopardy Builder (the old name)</div>
            <p class="hint">
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
        <p class="hint">
          Removing Brainrot Games Maker? Delete the .exe and the last two folders. Keep BrainrotSaves (or copy it somewhere
          else) if you want your saved games. Deleting the last two while the app is closed starts it fresh: anything not
          saved as a .brainrot (or exported) is lost.
        </p>
      {:else}
        <p class="hint">Looking up the folders…</p>
      {/if}
    {:else}
      <p class="muted">
        The autosave and the media you add are kept in this browser's storage for this file (nothing is uploaded). Another
        browser, or this file in another folder, starts empty. Clearing this browser's site data deletes them, so use
        <b>Save</b> (.brainrot) to keep a copy.
      </p>
      {#if kept !== null}
        <p class="hint">
          {kept
            ? 'Storage: kept. This browser has agreed not to clear it when the disk runs low.'
            : 'Storage: may be cleared. This browser can clear it when the disk runs low, so Save often.'}
        </p>
      {/if}
    {/if}
    <div class="modal-foot"><button class="primary" onclick={onclose}>Done</button></div>
  </div>
</div>

<style>
  h3 {
    margin: 8px 0 0;
    font-size: 16px;
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
  .updates {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 10px;
    align-items: center;
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
</style>
