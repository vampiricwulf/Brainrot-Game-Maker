<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { app, toast } from './lib/app.svelte';
  import { clearPlay, debounce, loadDraft, loadPlay, saveDraft, savePlay, testStorage, usePlayerStorage, type SavedPlay } from './lib/persist';
  import { openPack } from './lib/pack';
  import { unpackEmbedded } from './lib/export';
  import PlayerHome from './PlayerHome.svelte';
  import { holdOpenLock, loadGameMedia, pruneMedia } from './lib/media.svelte';
  import { migrateGame } from './lib/model';
  import { closeAudienceWindow } from './lib/sync.svelte';
  import { migrateSession, newSession, rebaseSession } from './lib/session';
  import { newLive } from './lib/live';
  import { clone } from './lib/ops';
  import Editor from './editor/Editor.svelte';
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
    const [draft, play, ok] = await Promise.all([loadDraft(), loadPlay(), testStorage()]);
    app.storageOk = ok;
    if (draft) {
      app.game = migrateGame(draft);
      await loadGameMedia(app.game);
    }
    // A finished game stays too, so its results can still be viewed after a reload.
    if (play) app.resumable = resumed(play);
    // Drop stored media that no saved game uses any more.
    await pruneMedia([app.game, app.resumable?.game]);
    loaded = true;
  });

  // Autosave (spec §5.8 / §6.5). Only after the initial load so a blank game never overwrites a draft.
  const saveDraftSoon = debounce(saveDraft, 500);
  // Don't lose the last edits if the tab is closed or hidden right after typing.
  onMount(() => {
    const flush = () => saveDraftSoon.flush();
    const onvis = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onvis);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onvis);
    };
  });
  $effect(() => {
    const snap = $state.snapshot(app.game);
    if (loaded && !playerOnly) saveDraftSoon(snap);
  });
  $effect(() => {
    const game = $state.snapshot(app.playGame);
    const session = $state.snapshot(app.session);
    // Nothing is written during pre-game, so an older saved game stays intact until "Start game".
    if (loaded && !app.pregame && game && session) savePlay(game, session);
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
    saveDraftSoon.flush();
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

{#if app.toast}
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
