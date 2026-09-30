<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { app, toast } from './lib/app.svelte';
  import { clearPlay, debounce, dropStraySteps, loadEditor, loadPlay, saveEditor, savePlay, testStorage, usePlayerStorage, watchWrites, type SavedPlay } from './lib/persist';
  import { openPack } from './lib/pack';
  import { unpackEmbedded } from './lib/export';
  import PlayerHome from './PlayerHome.svelte';
  import { holdOpenLock, loadGameMedia, pruneMedia } from './lib/media.svelte';
  import { migrateGame, newId } from './lib/model';
  import { closeAudienceWindow } from './lib/sync.svelte';
  import { migrateSession, newSession, rebaseSession } from './lib/session';
  import { newLive } from './lib/live';
  import { clone } from './lib/ops';
  import Editor from './editor/Editor.svelte';
  import ContextMenu from './lib/ContextMenu.svelte';
  import { autosave } from './lib/autosave';
  import { inTauri } from './lib/platform';
  import { prefs } from './lib/prefs.svelte';
  import { watchGame, type GameWatch } from './lib/watch.svelte';
  import { arriving, commit, heldMedia, history, listen, mark, startHistory, toSave } from './lib/history.svelte';
  import type { Game } from './lib/model';
  import Play from './play/Play.svelte';

  /** Base64 game pack when this file is an exported, player-only game. */
  let { embedded = null }: { embedded?: string | null } = $props();
  // Fixed for the page's lifetime (set once at mount).
  const playerOnly = untrack(() => !!embedded);

  let loaded = $state(false);
  let loadError = $state('');

  /** A saved game in progress, converted if it was saved by an older version. */
  function resumed(play: SavedPlay): SavedPlay {
    const game = migrateGame(play.game);
    return { ...play, game, session: migrateSession(play.session, game) };
  }

  onMount(async () => {
    if (embedded) {
      try {
        app.game = await openPack(await unpackEmbedded(embedded));
        document.title = app.game.title;
        usePlayerStorage(app.game.id);
        app.storageOk = await testStorage();
        const play = await loadPlay();
        if (play) app.resumable = resumed(play);
      } catch (e) {
        loadError = (e as Error).message;
      }
      loaded = true;
      return;
    }
    holdOpenLock();
    const [editor, play, ok] = await Promise.all([loadEditor(), loadPlay(), testStorage()]);
    app.storageOk = ok;
    /** Removed files the undo history can bring back. */
    let held = new Set<string>();
    if (editor.draft) {
      // The undo history goes on from before the reload, unless bringing the draft up to date changed it (its steps
      // wouldn't fit it any more).
      const plain = JSON.stringify(editor.draft);
      const game = migrateGame(editor.draft);
      const saved = editor.history && JSON.stringify(game) === plain ? editor.history : undefined;
      app.game = game;
      arriving({ kind: 'reopened', label: `Reopened “${game.title}”` }, saved);
      held = heldMedia(saved?.steps ?? []);
      void dropStraySteps(saved?.saved.ids ?? []);
      await loadGameMedia(app.game);
    } else arriving({ kind: 'new', label: 'New game' });
    // A finished game stays too, so its results can still be viewed after a reload.
    if (play) app.resumable = resumed(play);
    // Drop stored media that no saved game uses any more.
    await pruneMedia([app.game, app.resumable?.game], held);
    loaded = true;
  });

  // A write that fails after the start (the disk or the browser's storage is full) switches the header to "use Save",
  // saying so once; one that works again switches it back. A player-only file has no Save: its game restarts on refresh.
  watchWrites((err) => {
    if (!loaded) return;
    if (!err) return void (app.storageOk = true);
    if (app.storageOk) {
      const full = err instanceof DOMException && err.name === 'QuotaExceededError';
      const then = playerOnly ? 'a refresh restarts the game' : 'use Save to keep this game';
      toast(`${full ? 'Storage is full, so autosave stopped' : 'Autosave stopped working'}: ${then}`, 8000);
    }
    app.storageOk = false;
  });

  // The game in the editor, watched for changes: the autosaves write its plain copy (watch.svelte.ts), instead of
  // copying the whole game on every keystroke, which made typing lag in big games.
  let watch: GameWatch | null = null;
  let watching: Game | null = null;
  // Autosave (spec §5.8 / §6.5), with the undo history. Only after the initial load so a blank game never overwrites a
  // draft.
  const saveEditorSoon = debounce(() => watch && saveEditor({ draft: watch.value(), ...toSave(newId()) }), 500);
  // The game in play too: a burst of host clicks is one write (flushed when leaving, like the draft).
  const savePlaySoon = debounce(savePlay, 300);
  // ⚙ Settings → Autosave (desktop app): a copy of the game in the editor every few minutes, only when it changed.
  let autosaving = false;
  let lastAutosaveAt = Date.now();
  let autosavedRev = 0;

  // Each game that arrives (the draft at the start, New, Open…) gets its own watcher, started once the game is on
  // screen (its first reading takes a moment on a big game) and outside this effect.
  $effect(() => {
    const game = app.game;
    if (loaded && !playerOnly) requestAnimationFrame(() => setTimeout(() => startWatch(game)));
  });
  function startWatch(game: Game): void {
    if (app.game !== game || watching === game) return;
    watch?.destroy();
    watch = watchGame(game);
    watching = game;
    watch.subscribe(saveEditorSoon);
    saveEditorSoon();
    startHistory(game, watch);
    // Changes count from the game as it arrives, so an unchanged game is never autosaved.
    autosavedRev = watch.rev;
    lastAutosaveAt = Date.now();
  }
  onMount(() => {
    if (!inTauri()) return;
    const id = setInterval(async () => {
      if (autosaving || !watch || !prefs.autosaveMinutes || Date.now() - lastAutosaveAt < prefs.autosaveMinutes * 60_000) return;
      lastAutosaveAt = Date.now();
      const game = watch.value();
      const rev = watch.rev;
      if (rev === autosavedRev || !game.rounds.length) return;
      autosaving = true;
      try {
        const path = await autosave(game, prefs.autosaveKeep);
        autosavedRev = rev;
        app.fileAutosave = { path, at: Date.now() };
        mark('autosaved', `Autosaved to ${path.split(/[\\/]/).pop()}`);
      } catch (err) {
        console.warn('Autosave failed', err);
        toast(`Autosave failed: ${err instanceof Error ? err.message : err}`, 5000);
      } finally {
        autosaving = false;
      }
    }, 15_000);
    return () => clearInterval(id);
  });

  /** A file dropped outside every drop spot is ignored: the browser would open it in place of the app. */
  function ignoreFiles(e: DragEvent): void {
    if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
  }

  // Every press, a key in another field and focus moving on start a new undo step (history.svelte.ts).
  onMount(() => (playerOnly ? undefined : listen()));
  // Steps made, undone or redone (and saves, plays…) are saved with the draft.
  $effect(() => {
    void [history.entries, history.index, history.marks, history.origin];
    if (loaded && !playerOnly) saveEditorSoon();
  });

  // Don't lose the last edits if the tab is closed or hidden right after typing (they're a step of their own then).
  onMount(() => {
    const flush = () => {
      if (watch) {
        commit();
        saveEditorSoon();
      }
      saveEditorSoon.flush();
      savePlaySoon.flush();
    };
    const onvis = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onvis);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onvis);
    };
  });
  $effect(() => {
    const game = $state.snapshot(app.playGame);
    const session = $state.snapshot(app.session);
    // Nothing is written during pre-game, so an older saved game stays intact until "Start game".
    if (loaded && !app.pregame && game && session) savePlaySoon(game, session);
  });

  const savedTime = (ts: number) => new Date(ts).toLocaleString();

  function startPlay(): void {
    if (!app.game.rounds.length) return toast('Add a round first (＋ Add round)', 4000);
    const saved = app.resumable;
    if (
      saved &&
      saved.session.phase !== 'end' &&
      !confirm(
        `A game in progress ("${saved.game.title}", saved ${savedTime(saved.savedAt)}) can still be resumed. ` +
          'Start a new game anyway?\n\nThe saved game is replaced once you press "Start game". Cancel keeps it.',
      )
    )
      return;
    mark('played', 'Played');
    saveEditorSoon.flush();
    app.playGame = clone(app.game);
    app.session = newSession(app.playGame);
    app.live = newLive();
    app.pregame = true;
    app.screen = 'play';
  }

  /** Resume the saved game, optionally switching it to the editor's current version of the game. */
  async function resume(withEdits = false): Promise<void> {
    const saved = app.resumable;
    if (!saved) return;
    let game = saved.game;
    if (withEdits) {
      game = clone(app.game);
      rebaseSession(saved.session, saved.game, game);
    }
    await loadGameMedia(game);
    app.playGame = game;
    app.session = saved.session;
    app.live = newLive();
    app.pregame = false;
    app.screen = 'play';
    app.resumable = null;
  }

  async function discardResume(): Promise<void> {
    const saved = app.resumable;
    if (saved && saved.session.phase !== 'end' && !confirm(`Discard the saved game "${saved.game.title}"? Its scores and used tiles are deleted.`))
      return;
    app.resumable = null;
    await clearPlay();
    toast('Saved game discarded');
  }

  function leavePlay(): void {
    closeAudienceWindow();
    app.screen = 'editor';
    app.playGame = null;
    app.session = null;
    app.pregame = false;
    app.live = newLive();
  }

  /** Leave a game: it stays saved and can be resumed from the editor. A finished game is cleared. */
  function exitPlay(): void {
    // Written now, so a finished game's clearPlay below comes after it.
    savePlaySoon.flush();
    const { playGame, session } = app;
    if (playGame && session && !app.pregame) {
      if (session.phase === 'end') {
        app.resumable = null;
        clearPlay();
      } else app.resumable = { game: $state.snapshot(playGame), session: $state.snapshot(session), savedAt: Date.now() };
    }
    leavePlay();
  }
</script>

<svelte:window ondragover={ignoreFiles} ondrop={ignoreFiles} />

{#if !loaded}
  <div class="loading muted">Loading…</div>
{:else if loadError}
  <div class="loading">Couldn't open this game: {loadError}</div>
{:else if playerOnly && app.screen === 'editor'}
  <PlayerHome onplay={startPlay} resumable={app.resumable} onresume={() => resume()} ondiscard={discardResume} />
{:else if app.screen === 'editor'}
  {#if app.resumable}
    {@const saved = app.resumable}
    {@const ended = saved.session.phase === 'end'}
    <div class="resume">
      <span>
        {ended ? 'A finished game was saved:' : 'A game in progress was found:'} <b>{saved.game.title}</b>
        <span class="muted">(saved {savedTime(saved.savedAt)})</span>
        {#if !ended}
          <span class="muted small">Edits you make here don't change it unless you resume with them.</span>
        {/if}
      </span>
      <button class="primary" onclick={() => resume()}>{ended ? 'View results' : 'Resume game'}</button>
      {#if !ended && saved.game.id === app.game.id}
        <button onclick={() => resume(true)} title="Play on with the editor's current version of this game (fixed typos, new slides…). Scores and used tiles are kept.">
          Resume with my edits
        </button>
      {/if}
      <button class="ghost" onclick={discardResume}>Discard</button>
    </div>
  {/if}
  <Editor onplay={startPlay} />
{:else}
  <Play onexit={exitPlay} oncancel={leavePlay} />
{/if}

<ContextMenu />
{#if app.toast && !app.onAir}
  <div class="toast" role="status">{app.toast}</div>
{/if}

<style>
  .loading {
    display: grid;
    place-items: center;
    height: 100%;
  }
  .resume {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
    padding: 10px 16px;
    background: #2a2410;
    border-bottom: 1px solid var(--warn);
  }
  .small {
    font-size: 12px;
  }
</style>
