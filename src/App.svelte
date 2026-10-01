<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { app, toast } from './lib/app.svelte';
  import {
    clearPlay,
    clearRoom,
    debounce,
    dropStraySteps,
    loadEditor,
    loadPlay,
    loadRoom,
    retryWrites,
    saveEditor,
    savePlay,
    testStorage,
    usePlayerStorage,
    watchWrites,
    type SavedPlay,
    type SavedRoom,
  } from './lib/persist';
  import { closeRoom, endRoom, inRoom, kept, rejoinRoom, sendHostState } from './lib/remote.svelte';
  import { setupState } from './lib/buzz';
  import { openPack } from './lib/pack';
  import { packInfo, unpackEmbedded } from './lib/export';
  import PlayerHome from './PlayerHome.svelte';
  import { holdOpenLock, keepInMemory, loadGameMedia, mediaUrls, pruneMedia } from './lib/media.svelte';
  import { claimEditor, watchEditor } from './lib/editorlock';
  import { hasWork } from './lib/recent';
  import { validate, type Problem } from './lib/validate';
  import { migrateGame, newId } from './lib/model';
  import { closeAudienceWindow } from './lib/sync.svelte';
  import { migrateSession, newSession, rebaseSession } from './lib/session';
  import { newLive } from './lib/live';
  import { clone } from './lib/ops';
  import Editor from './editor/Editor.svelte';
  import ContextMenu from './lib/ContextMenu.svelte';
  import AskDialog from './lib/AskDialog.svelte';
  import { ask } from './lib/ask.svelte';
  import { autosave } from './lib/autosave';
  import { inTauri } from './lib/platform';
  import { flushOnClose } from './lib/desktop.svelte';
  import { prefs } from './lib/prefs.svelte';
  import { watchGame, type GameWatch } from './lib/watch.svelte';
  import { arriving, commit, heldMedia, history, listen, mark, savedSinceChange, startHistory, toSave } from './lib/history.svelte';
  import type { Game, Session } from './lib/model';
  import Play from './play/Play.svelte';

  /** Base64 game pack when this file is an exported, player-only game. */
  let { embedded = null }: { embedded?: string | null } = $props();
  // Fixed for the page's lifetime (set once at mount).
  const playerOnly = untrack(() => !!embedded);

  let loaded = $state(false);
  let loadError = $state('');
  /** While an exported game opens: its files unpacked so far, of how many. */
  let unpacked = $state<{ done: number; total: number } | null>(null);
  /** Another tab (or window) of the app edits the game: this one leaves the autosave alone until told to take over. */
  let paused = $state(false);
  /** While paused: the tab that was editing has closed, so nothing stops this one editing. */
  let otherClosed = $state(false);
  $effect(() => {
    if (!paused) return;
    return watchEditor((taken) => (otherClosed = !taken));
  });
  /** This copy is the one that edits and autosaves the game. */
  let editing = false;
  /** Set just before reloading to take over editing from another tab. */
  const TAKE_KEY = 'brainrot.takeEditor';

  /** A saved game in progress, converted if it was saved by an older version. */
  function resumed(play: SavedPlay): SavedPlay {
    const game = migrateGame(play.game);
    return { ...play, game, session: migrateSession(play.session, game) };
  }

  onMount(async () => {
    app.playerOnly = playerOnly;
    if (embedded) {
      try {
        const info = packInfo();
        // Its files stay in memory: every file opened from disk shares one storage with the builder (see keepInMemory).
        keepInMemory();
        app.game = await openPack(await unpackEmbedded(embedded, info.cut), (done, total) => (unpacked = { done, total }));
        document.title = app.game.title;
        usePlayerStorage(app.game.id, info.exported);
        app.storageOk = await testStorage();
        const play = await loadPlay();
        if (play) app.resumable = resumed(play);
      } catch (e) {
        loadError = (e as Error).message;
      }
      loaded = true;
      if (!loadError) await restoreRoom();
      return;
    }
    holdOpenLock();
    let take = false;
    try {
      take = sessionStorage.getItem(TAKE_KEY) === '1';
      sessionStorage.removeItem(TAKE_KEY);
    } catch {
      /* no session storage: wait to be asked */
    }
    if (!(await claimEditor(take, stopEditing))) {
      paused = true;
      loaded = true;
      return;
    }
    editing = true;
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
    await restoreRoom();
  });

  /**
   * Phone buzzers: a room the pre-game screen had open before this reload. On the pre-game screen: back to it, in the
   * same room with the same players. Back in the editor (the room left open): the room waits for ▶ Play. Another game's
   * room is closed.
   */
  async function restoreRoom(): Promise<void> {
    const r = await loadRoom();
    if (!r?.remote?.code || !Array.isArray(r.players)) return;
    if (r.gameId !== app.game.id || !app.game.settings.buzzer) {
      endRoom(r.remote);
      await clearRoom();
      return;
    }
    if (r.screen === 'pregame' && app.screen === 'editor') {
      app.playGame = clone(app.game);
      const s = newSession(app.playGame);
      s.players = r.players;
      s.remote = r.remote;
      app.session = s;
      app.live = newLive();
      app.pregame = true;
      app.screen = 'play';
      return;
    }
    keepRoom(r);
  }

  /** The room stays open while the host is in the editor: phones are told the host is setting up. */
  function keepRoom(r: SavedRoom): void {
    kept.room = r;
    rejoinRoom(r.remote);
    const early = Math.round((app.game.settings.earlyBuzzLock ?? 1) * 1000);
    sendHostState(setupState(app.game, r.players, r.remote.armId ?? 0, early, !!r.remote.locked));
  }

  /** ✕ Close the room (the banner in the editor): phones are told the game is over. */
  async function closeKeptRoom(): Promise<void> {
    const r = kept.room;
    kept.room = null;
    if (r && inRoom(r.remote.code)) closeRoom();
    else if (r) endRoom(r.remote);
    await clearRoom();
    toast('Buzzer room closed');
  }

  /** Another tab takes over editing: write the last changes, then leave the autosave alone. */
  async function stopEditing(): Promise<void> {
    if (!editing) return;
    if (watch) commit();
    await saveEditorNow();
    editing = false;
    paused = true;
  }

  /** "Edit here instead": the tab editing now writes its last changes and lets go, then this one starts afresh. */
  function editHere(): void {
    try {
      sessionStorage.setItem(TAKE_KEY, '1');
    } catch {
      /* it asks again after the reload */
    }
    location.reload();
  }

  // A write that fails after the start (the disk or the browser's storage is full) switches the header to "use Save",
  // saying so once; one that works again switches it back. A player-only file has no Save: its game restarts on refresh.
  // A write that fails after the start (the disk or the browser's storage is full) switches the header to "use Save",
  // saying so once. Failed writes are tried again (on the next write, and every little while), and the header says ✓
  // Autosaved again only once all of them went through. A player-only file has no Save: its game restarts on refresh.
  watchWrites((err) => {
    if (!loaded) return;
    if (!err) {
      if (!app.storageOk) toast('Autosave works again: everything is saved', 4000);
      app.storageOk = true;
      return;
    }
    if (app.storageOk) {
      const full = err instanceof DOMException && err.name === 'QuotaExceededError';
      const then = playerOnly ? 'a refresh restarts the game' : 'use Save to keep this game';
      toast(`${full ? 'Storage is full, so autosave stopped' : 'Autosave stopped working'}: ${then}`, 8000);
    }
    app.storageOk = false;
  });
  $effect(() => {
    if (app.storageOk || !loaded) return;
    const id = setInterval(retryWrites, 20_000);
    return () => clearInterval(id);
  });

  // Closing the tab while nothing can be autosaved loses the changes since the last Save: the browser asks first.
  onMount(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (!editing || app.storageOk || !hasWork(app.game) || savedSinceChange()) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  });

  // The game in the editor, watched for changes: the autosaves write its plain copy (watch.svelte.ts), instead of
  // copying the whole game on every keystroke, which made typing lag in big games.
  let watch: GameWatch | null = null;
  let watching: Game | null = null;
  // Autosave (spec §5.8 / §6.5), with the undo history. Only after the initial load so a blank game never overwrites a
  // draft.
  const saveEditorNow = () => saveEditor(() => (watch && editing ? { draft: watch.value(), ...toSave(newId()) } : null));
  const saveEditorSoon = debounce(saveEditorNow, 500);
  // The game in play too: a burst of host clicks is one write (flushed when leaving, like the draft).
  const savePlaySoon = debounce((session: Session) => playWatch && savePlay(playWatch.value(), session), 300);
  // ⚙ Settings → Autosave (desktop app): a copy of the game in the editor every few minutes, only when it changed.
  let autosaving = false;
  let lastAutosaveAt = Date.now();
  let autosavedRev = 0;

  // The editor's checklist, worked out from the watcher's plain copy a moment after changes stop: reading the whole
  // game through its proxies on every keystroke made typing in a clue lag in big games. (Whether files are missing
  // depends on the ones loaded, too.)
  let problems = $state.raw<Problem[]>([]);
  const checkSoon = debounce(() => watch && (problems = validate(watch.value())), 300);
  $effect(() => {
    void Object.keys(mediaUrls).length;
    untrack(checkSoon);
  });

  // Each game that arrives (the draft at the start, New, Open…) gets its own watcher, started once the game is on
  // screen (its first reading takes a moment on a big game) and outside this effect. Its checklist is worked out
  // at once.
  $effect(() => {
    const game = app.game;
    if (!loaded || !editing) return;
    problems = untrack(() => validate(game));
    requestAnimationFrame(() => setTimeout(() => startWatch(game)));
  });
  function startWatch(game: Game): void {
    if (app.game !== game || watching === game) return;
    watch?.destroy();
    watch = watchGame(game);
    watching = game;
    watch.subscribe(saveEditorSoon);
    watch.subscribe(checkSoon);
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
    if (loaded && editing) saveEditorSoon();
  });

  // Don't lose the last edits if the tab is closed or hidden right after typing (they're a step of their own then).
  onMount(() => {
    const flush = () => {
      if (watch && editing) {
        commit();
        saveEditorSoon();
      }
      saveEditorSoon.flush();
      savePlaySoon.flush();
    };
    const onvis = () => document.visibilityState === 'hidden' && flush();
    // Desktop app: closing the window waits for these writes.
    flushOnClose(flush);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onvis);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onvis);
    };
  });
  // The game in play is saved with its session after every host action. Only the session is copied each time: the game
  // (which play changes now and then: RPG screens kept, wheels made…) is watched like the editor's, and the watcher's
  // plain copy is written. Copying the whole game on every click made scoring lag in big games.
  let playWatch: GameWatch | null = null;
  let playWatched: Game | null = null;
  /** Goes up when the game in play changes. */
  let playRev = $state(0);
  $effect(() => {
    const game = app.playGame;
    if (game === playWatched) return;
    playWatch?.destroy();
    playWatch = playWatched = null;
    // Started outside this effect (the watcher can't start inside one).
    if (game) queueMicrotask(() => startPlayWatch(game));
  });
  function startPlayWatch(game: Game): void {
    if (app.playGame !== game || playWatched === game) return;
    playWatch?.destroy();
    playWatch = watchGame(game);
    playWatched = game;
    playWatch.subscribe(() => playRev++);
    playRev++;
  }
  $effect(() => {
    void playRev;
    const session = $state.snapshot(app.session);
    // Nothing is written during pre-game, so an older saved game stays intact until "Start game".
    if (loaded && !app.pregame && session && untrack(() => playWatched && playWatched === app.playGame)) savePlaySoon(session);
  });

  const savedTime = (ts: number) => new Date(ts).toLocaleString();

  async function startPlay(): Promise<void> {
    if (!app.game.rounds.length) return toast('Add a round first (＋ Add round)', 4000);
    const saved = app.resumable;
    if (
      saved &&
      saved.session.phase !== 'end' &&
      !(await ask(
        `A game in progress ("${saved.game.title}", saved ${savedTime(saved.savedAt)}) can still be resumed. ` +
          'Start a new game anyway?\n\nThe saved game is replaced once you press "Start game".',
        { ok: 'Start a new game', cancel: 'Keep it' },
      ))
    )
      return;
    mark('played', 'Played');
    saveEditorSoon.flush();
    app.playGame = clone(app.game);
    app.session = newSession(app.playGame);
    // The room left open going back to the editor: the same one again (phones stay joined), if it's this game's.
    const room = kept.room;
    kept.room = null;
    if (room && room.gameId === app.game.id && app.game.settings.buzzer) app.session.remote = room.remote;
    else if (room) {
      endRoom(room.remote);
      void clearRoom();
    }
    app.live = newLive();
    app.pregame = true;
    // An editor toast ("Added a sample game…") would cover the Start game button.
    app.toast = '';
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
    app.toast = '';
    app.screen = 'play';
    app.resumable = null;
  }

  async function discardResume(): Promise<void> {
    const saved = app.resumable;
    if (saved && saved.session.phase !== 'end' && !(await ask(`Discard the saved game "${saved.game.title}"? Its scores and used tiles are deleted.`, { ok: 'Discard', cancel: 'Keep', danger: true })))
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
  <div class="loading muted" role="status">
    {#if playerOnly}
      <span>
        Loading the game…
        {#if unpacked?.total}<br /><span class="small">Unpacking files: {unpacked.done} of {unpacked.total}</span>{/if}
      </span>
    {:else}
      Loading…
    {/if}
  </div>
{:else if loadError}
  <div class="loading">
    <div class="card" role="alert">
      <h1>Couldn't open this game</h1>
      <p>{loadError}</p>
    </div>
  </div>
{:else if paused && app.screen === 'editor'}
  <div class="loading">
    <div class="card" role="alert">
      {#if otherClosed}
        <h1>The other tab was closed</h1>
        <p class="muted">Its changes are saved. Nothing else is editing this game now.</p>
        <button class="primary" onclick={editHere}>Edit here</button>
      {:else}
        <h1>This game is open in another tab</h1>
        <p class="muted">Editing here is paused, so the two tabs don't overwrite each other's changes.</p>
        <button class="primary" onclick={editHere}>Edit here instead</button>
        <p class="muted small">The other tab saves its changes first, then pauses.</p>
      {/if}
    </div>
  </div>
{:else if playerOnly && app.screen === 'editor'}
  {@render roomBar()}
  <PlayerHome onplay={startPlay} resumable={app.resumable} onresume={() => resume()} ondiscard={discardResume} />
{:else if app.screen === 'editor'}
  {@render roomBar()}
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
  <Editor onplay={startPlay} {problems} />
{:else}
  <Play onexit={exitPlay} oncancel={leavePlay} />
{/if}

{#snippet roomBar()}
  {#if kept.room}
    <div class="resume room-bar" role="status">
      <span>
        📱 The buzzer room <b>{kept.room.remote.code}</b> is still open: phones are told you're setting up.
        <span class="muted small">▶ Play goes back into it.</span>
      </span>
      <button class="ghost" onclick={closeKeptRoom}>✕ Close the room</button>
    </div>
  {/if}
{/snippet}

<ContextMenu />
<AskDialog />
{#if app.toast && !app.onAir}
  <div class="toast" role="status" data-over-modal>{app.toast}</div>
{/if}

<style>
  .loading {
    display: grid;
    place-items: center;
    height: 100%;
    padding: 16px;
    text-align: center;
  }
  .card {
    width: min(520px, 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 28px 24px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 16px;
  }
  .card h1 {
    margin: 0;
    font-size: 22px;
  }
  .card p {
    margin: 0;
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
