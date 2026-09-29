<script lang="ts">
  import { onMount } from 'svelte';
  import { app, toast } from './lib/app.svelte';
  import { clearPlay, debounce, loadDraft, loadPlay, saveDraft, savePlay, testStorage, type SavedPlay } from './lib/persist';
  import { loadGameMedia, pruneMedia } from './lib/media.svelte';
  import { migrateGame } from './lib/model';
  import { closeAudienceWindow } from './lib/sync.svelte';
  import { newSession } from './lib/session';
  import { clone } from './lib/ops';
  import Editor from './editor/Editor.svelte';
  import Play from './play/Play.svelte';

  let loaded = $state(false);
  let resumable = $state<SavedPlay | null>(null);

  onMount(async () => {
    const [draft, play, ok] = await Promise.all([loadDraft(), loadPlay(), testStorage()]);
    app.storageOk = ok;
    if (draft) {
      app.game = migrateGame(draft);
      await loadGameMedia(app.game);
    }
    if (play && play.session.phase !== 'end') resumable = { ...play, game: migrateGame(play.game) };
    else if (play) await clearPlay();
    // Drop stored media that no saved game uses any more.
    await pruneMedia([app.game, resumable?.game]);
    loaded = true;
  });

  // Autosave (spec §5.8 / §6.5). Only after the initial load so a blank game never overwrites a draft.
  const saveDraftSoon = debounce(saveDraft, 800);
  $effect(() => {
    const snap = $state.snapshot(app.game);
    if (loaded) saveDraftSoon(snap);
  });
  $effect(() => {
    const game = $state.snapshot(app.playGame);
    const session = $state.snapshot(app.session);
    if (loaded && game && session) savePlay(game, session);
  });

  function startPlay(): void {
    app.playGame = clone(app.game);
    app.session = newSession(app.playGame);
    app.pregame = true;
    app.screen = 'play';
    resumable = null;
  }

  async function resume(): Promise<void> {
    if (!resumable) return;
    await loadGameMedia(resumable.game);
    app.playGame = resumable.game;
    app.session = resumable.session;
    app.pregame = false;
    app.screen = 'play';
    resumable = null;
  }

  async function discardResume(): Promise<void> {
    resumable = null;
    await clearPlay();
    toast('Saved game discarded');
  }

  function exitPlay(): void {
    closeAudienceWindow();
    app.screen = 'editor';
    app.playGame = null;
    app.session = null;
    clearPlay();
  }
</script>

{#if !loaded}
  <div class="loading muted">Loading…</div>
{:else if app.screen === 'editor'}
  {#if resumable}
    <div class="resume">
      <span>
        A game in progress was found: <b>{resumable.game.title}</b>
        <span class="muted">(saved {new Date(resumable.savedAt).toLocaleString()})</span>
      </span>
      <button class="primary" onclick={resume}>Resume game</button>
      <button class="ghost" onclick={discardResume}>Discard</button>
    </div>
  {/if}
  <Editor onplay={startPlay} />
{:else}
  <Play onexit={exitPlay} />
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
    padding: 10px 16px;
    background: #2a2410;
    border-bottom: 1px solid var(--warn);
  }
</style>
