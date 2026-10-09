<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { app, toast } from './lib/app.svelte';
  import {
    clearPlay,
    clearRoom,
    debounce,
    dropStraySteps,
    loadEditor,
    rescueDraft,
    rescuePlay,
    loadPlay,
    playUnsure,
    applyRoomSettings,
    loadRoom,
    retryWrites,
    saveEditor,
    savePlay,
    testStorage,
    unstored,
    usePlayerStorage,
    watchWrites,
    type SavedPlay,
    type SavedRoom,
  } from './lib/persist';
  import { buzzerBase, buzzerOn, endRoom, kept, leaveRoom, rejoinRoom, remote, sendHostState } from './lib/remote.svelte';
  import { setupState } from './lib/buzz';
  import { joinUrl } from './lib/buzzproto';
  import { MAX_PACK_READ, openPack } from './lib/pack';
  import { packInfo, unpackEmbedded } from './lib/export';
  import PlayerHome from './PlayerHome.svelte';
  import { holdOpenLock, keepInMemory, loadGameMedia, mediaUrls, pruneMedia, storePlayFiles } from './lib/media.svelte';
  import { claimEditor, watchEditor } from './lib/editorlock';
  import { hasWork } from './lib/recent';
  import { validate } from './lib/validate';
  import { checklistLines, type ChecklistLine } from './lib/checklist';
  import { blankName, isBoard, migrateGame, newId } from './lib/model';
  import { nextFreeColor } from './lib/colors';
  import { checkForUpdate } from './lib/update.svelte';
  import { audience, audienceTitle, closeAudienceWindow, closeScoresWindow, openAudienceWindow, pushGame, pushLive } from './lib/sync.svelte';
  import ModeCards from './play/ModeCards.svelte';
  import { goToRound, migrateSession, newSession, randomizeDailyDoubles, rebaseSession, startIntro } from './lib/session';
  import { forgetGameParts } from './lib/toolset';
  import { newLive } from './lib/live';
  import { clone } from './lib/ops';
  import { sameGame } from './lib/samegame';
  import { sameContent } from './lib/roundcopy';
  import Editor from './editor/Editor.svelte';
  import ContextMenu from './lib/ContextMenu.svelte';
  import AskDialog from './lib/AskDialog.svelte';
  import { ask } from './lib/ask.svelte';
  import { autosave } from './lib/autosave';
  import { inTauri } from './lib/platform';
  import { flushOnClose, whileWriting } from './lib/desktop.svelte';
  import { prefs, savePrefs } from './lib/prefs.svelte';
  import { watchGame, type GameWatch } from './lib/watch.svelte';
  import {
    arriving,
    commit,
    heldMedia,
    history,
    listen,
    mark,
    rescueHistory,
    savedSinceChange,
    savePoint,
    settledGame,
    startHistory,
    toSave,
  } from './lib/history.svelte';
  import type { Game, Session } from './lib/model';
  import Play from './play/Play.svelte';

  /**
   * Base64 game pack when this file is an exported, player-only game. `packError`: it's one, but its pack can't be read
   * (too big for the browser): what to say instead (never the editor, which would show another game, answers and all).
   */
  let { embedded = null, packError = null }: { embedded?: string | null; packError?: string | null } = $props();
  // Fixed for the page's lifetime (set once at mount).
  const playerOnly = untrack(() => !!embedded || !!packError);

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
  /**
   * A player-only file: this tab is the one that plays and saves its game (it holds that game's lock). Never `editing`,
   * which would autosave its game over the builder's draft.
   */
  let playsHere = false;
  /** Set just before reloading to take over editing from another tab. */
  const TAKE_KEY = 'brainrot.takeEditor';
  /** "Edit here instead" was pressed just before this reload (read once). */
  function takeAsked(): boolean {
    try {
      const take = sessionStorage.getItem(TAKE_KEY) === '1';
      sessionStorage.removeItem(TAKE_KEY);
      return take;
    } catch {
      /* no session storage: wait to be asked */
      return false;
    }
  }

  /** A saved game in progress, converted if it was saved by an older version. */
  function resumed(play: SavedPlay): SavedPlay {
    const game = migrateGame(play.game);
    return { ...play, game, session: migrateSession(play.session, game) };
  }

  onMount(async () => {
    app.playerOnly = playerOnly;
    if (packError) {
      loadError = packError;
      loaded = true;
      return;
    }
    if (embedded) {
      try {
        const info = packInfo();
        // Its files stay in memory: every file opened from disk shares one storage with the builder (see keepInMemory).
        keepInMemory();
        app.game = await openPack(await unpackEmbedded(embedded, info.cut), (done, total) => (unpacked = { done, total }));
        document.title = app.game.title;
        usePlayerStorage(app.game.id, info.exported);
        // Files added from now on (a drawing during play) are kept with its saved game; its own files never are.
        storePlayFiles();
        // One tab plays its saved game at a time (two would overwrite each other's): another one opened waits, paused.
        if (!(await claimEditor(takeAsked(), stopEditing, `brainrot-play:${app.game.id}:${info.exported ?? ''}`))) {
          paused = true;
          loaded = true;
          return;
        }
        playsHere = true;
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
    if (!(await claimEditor(takeAsked(), stopEditing))) {
      paused = true;
      loaded = true;
      return;
    }
    editing = true;
    // Is a newer version out? Asked first, so nothing slow (or failing) while the game loads holds it up. (The builder
    // only: an exported game file isn't updated.)
    void checkForUpdate();
    const [editor, play, ok] = await Promise.all([loadEditor(), loadPlay(), testStorage()]);
    app.storageOk = ok;
    /** Removed files the undo history can bring back. */
    let held = new Set<string>();
    if (editor.draft) {
      // The undo history goes on from before the reload, unless bringing the draft up to date changed it (its steps
      // wouldn't fit it any more). Key order aside: a theme preset puts the theme's `source` after its clue font, and
      // migrateGame puts it back in its usual place. (Compared with a copy: migrateGame changes parts of the draft.)
      const plain = JSON.stringify(editor.draft);
      const game = migrateGame(editor.draft);
      const saved = editor.history && (JSON.stringify(game) === plain || sameContent(game, JSON.parse(plain))) ? editor.history : undefined;
      app.game = game;
      if (editor.rescued && !saved) {
        arriving({ kind: 'rescued', label: `“${game.title}” as it was when the page closed` });
        toast('Your last changes before the page closed are back (the undo history starts again here)', 6000);
        // (Its steps are written again: some were only in the copy.)
      } else arriving({ kind: 'reopened', label: `Reopened “${game.title}”` }, saved, !!editor.rescued);
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
   * Phone buzzers: a room left open before this reload. On the pre-game screen: back to it, in the same room with the
   * same players. Back in the editor (the room left open, or kept with a game to resume): the room waits for ▶ Play or
   * Resume. It belongs to the stream, not to one game: with another game in the editor it stays open too (▶ Play offers
   * to keep it).
   */
  async function restoreRoom(): Promise<void> {
    const r = await loadRoom();
    if (!r?.remote?.code || !Array.isArray(r.players)) return;
    // The room itself says Buzzer mode was on: a reload right after turning it on can come back before the editor's
    // copy of that setting was written, and the room must not close for it.
    if (r.screen === 'pregame' && app.screen === 'editor' && r.gameId === app.game.id) {
      applyRoomSettings(app.game.settings, r);
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

  // Buzzer mode turned off in the editor (an undo, say) while its room waits: the room closes, as on the Play screen
  // (▶ Play would otherwise go back into it with Buzzer mode on again). Only a change made here: a quick reload can
  // come back before the editor's copy of the setting was written, and that mustn't close the room.
  let buzzerWas: { id: string; on: boolean } | null = null;
  $effect(() => {
    const now = { id: app.game.id, on: !!app.game.settings.buzzer };
    untrack(() => {
      const was = buzzerWas;
      buzzerWas = now;
      if (was?.id === now.id && was.on && !now.on && app.screen === 'editor' && kept.room?.gameId === now.id) void closeKeptRoom();
    });
  });

  /** ✕ Close the room (the bar over the editor): phones are told the game is over. */
  async function closeKeptRoom(quiet = false): Promise<void> {
    const r = kept.room;
    kept.room = null;
    // (The room this window is in is closed through its link; one an earlier page left open, through the server.)
    if (r) endRoom(r.remote);
    // A game kept to resume forgets it too (Resume would try to get back into a closed room).
    const saved = app.resumable;
    if (r && saved?.session.remote?.code === r.remote.code) app.resumable = { ...saved, session: { ...saved.session, remote: null } };
    await clearRoom();
    if (!quiet) toast('Buzzer room closed');
  }

  // A room kept in the editor that ended meanwhile (closed elsewhere, or unused for hours while the app was closed) is
  // forgotten: the bar doesn't say it's open, and ▶ Play or Resume don't go back into it. Not one another window took
  // (4000): that one is still open, and closing it here would end it for that window too.
  $effect(() => {
    const r = kept.room;
    if (!r || remote.status !== 'error' || remote.code !== r.remote.code || (remote.closedCode !== 4004 && remote.closedCode !== 4003)) return;
    untrack(() => {
      toast(`Buzzer room ${r.remote.code} has ended: ▶ Play starts a new one`, 6000);
      void closeKeptRoom(true);
    });
  });

  /**
   * Another tab takes over editing (or, in a player-only file, playing): write the last changes, then leave the
   * autosave alone. A game being played here is written too and left (the other tab resumes it): only one tab plays and
   * saves it.
   */
  async function stopEditing(): Promise<void> {
    if (!editing && !playsHere) return;
    if (watch) commit();
    const { playGame, session } = app;
    const playing = app.screen === 'play' && !app.pregame && !app.test && playGame && session && playWatch && playWatched === playGame;
    await Promise.all([editing && saveEditorNow(), playing && savePlay(playWatch!.value(), $state.snapshot(session), !!app.live.cover)]);
    editing = false;
    playsHere = false;
    paused = true;
    // The phones stay in the room: the tab taking over picks it up again.
    if (kept.room || (app.screen === 'play' && app.session?.remote)) leaveRoom();
    kept.room = null;
    // (Leaving the game screen below mustn't forget the saved room the other tab picks up.)
    kept.handedOff = true;
    // The audience window goes with this tab (the one taking over opens its own).
    closeAudienceWindow();
    if (app.screen !== 'play') return;
    leavePlay();
    app.resumable = null;
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
  watchWrites((err, key) => {
    // (Heard after every write: one of the game in progress that went through clears it, whatever else still fails.)
    app.playUnstored = unstored('play');
    if (!loaded) return;
    if (!err) {
      if (!app.storageOk) toast('Autosave works again: everything is saved', 4000);
      app.storageOk = true;
      return;
    }
    if (app.storageOk) {
      const full = err instanceof DOMException && err.name === 'QuotaExceededError';
      // (Save writes the game, not the game in progress: its scores are only in this window. Its write can fail back in
      // the editor too, after Exit › Keep & leave.)
      const playing = key === 'play' || (app.screen === 'play' && !app.pregame && !app.test);
      const then = playing
        ? "the game in progress isn't being saved: don't close or reload this window until it works again"
        : playerOnly
          ? 'a refresh restarts the game'
          : 'use Save to keep this game';
      toast(`${full ? 'Storage is full, so autosave stopped' : 'Autosave stopped working'}: ${then}`, 8000);
    }
    app.storageOk = false;
  });
  $effect(() => {
    if (app.storageOk || !loaded) return;
    const id = setInterval(retryWrites, 20_000);
    return () => clearInterval(id);
  });

  // Closing the tab while nothing can be autosaved loses the changes since the last Save, or the game in progress (being
  // played, or kept to resume when its last write failed and waits to be tried again): the browser asks first.
  onMount(() => {
    const warn = (e: BeforeUnloadEvent) => {
      // (While autosave fails, a host action whose write waits a moment for more clicks counts too.)
      const playing = app.screen === 'play' && !app.pregame && !app.test;
      const playLost = mayPlay() && (unstored('play') || (playing && !app.storageOk && savePlaySoon.pending()));
      const editLost = editing && !app.storageOk && hasWork(app.game) && !savedSinceChange();
      if (!playLost && !editLost) return;
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
  // (The game as of the last step while a change is still being made: the draft never holds a change its history lacks.)
  const saveEditorNow = () => saveEditor(() => (watch && editing ? { draft: settledGame() ?? watch.value(), ...toSave(newId()) } : null));
  const saveEditorSoon = debounce(saveEditorNow, 500);
  /** This copy may write the game in play: it edits (holds the lock), or it's the player-only file's tab that plays it. */
  const mayPlay = () => editing || playsHere;
  // The game in play too: a burst of host clicks is one write (flushed when leaving, like the draft).
  const savePlaySoon = debounce((session: Session, cover?: boolean) => playWatch && mayPlay() && savePlay(playWatch.value(), session, cover), 300);
  // ⚙ Settings → Autosave (desktop app): a copy of the game in the editor every few minutes, only when it changed.
  let autosaving = false;
  let lastAutosaveAt = Date.now();
  let autosavedRev = 0;
  /** The last autosave was too big to be opened again, and that was said (once, until one is small enough again). */
  let autosaveTooBig = false;

  // The editor's checklist, worked out from the watcher's plain copy a moment after changes stop: reading the whole
  // game through its proxies on every keystroke made typing in a clue lag in big games. (Whether files are missing
  // depends on the ones loaded, too.)
  let checklist = $state.raw<ChecklistLine[]>([]);
  /** The checklist's lines (one a round) for this game: the watcher's plain copy, or the game itself as it arrives. */
  const check = (game: Game) => (checklist = checklistLines(game, validate(game)));
  const checkSoon = debounce(() => watch && check(watch.value()), 300);
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
    untrack(() => check(game));
    requestAnimationFrame(() => setTimeout(() => startWatch(game)));
  });
  function startWatch(game: Game): void {
    if (app.game !== game || watching === game) return;
    watch?.destroy();
    watch = watchGame(game);
    watching = game;
    watch.subscribe(saveEditorSoon);
    watch.subscribe(checkSoon);
    watch.subscribe(compareSoon);
    // An audience window left open on the Starting soon card follows every edit (the theme, the banner, the title…).
    watch.subscribe(soonCardLater);
    compareSoon();
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
      // Where the game stands as it's written (changes made meanwhile aren't in the file): its mark goes there.
      const point = savePoint();
      const game = watch.value();
      const rev = watch.rev;
      if (rev === autosavedRev || !game.rounds.length) return;
      autosaving = true;
      try {
        const { path, bytes } = await whileWriting(() => autosave(game, prefs.autosaveKeep));
        autosavedRev = rev;
        app.fileAutosave = { path, at: Date.now() };
        mark('autosaved', `Autosaved to ${path.split(/[\\/]/).pop()}`, point);
        // Written whole, but it can't be opened again (as Save says): said now, while the game is here to make smaller.
        if (bytes >= MAX_PACK_READ && !autosaveTooBig)
          toast(
            `Autosaved, but this game is ${(bytes / 1e9).toFixed(1)} GB: a pack over about 2 GB can't be opened again, so the next autosaves go in this same file and the others are kept. Move big videos to 🌐 links (or trim them).`,
            8000,
          );
        autosaveTooBig = bytes >= MAX_PACK_READ;
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
        rescueDraft(watch.value(), rescueHistory());
        saveEditorSoon();
      }
      // The game in progress too, when the last host click may not be stored yet: its write waits a moment for more
      // clicks, is under way, or failed. (Not on every hide: no write would follow to drop the copy, and copies of games
      // long over would pile up.)
      const { playGame, session } = app;
      const inPlay = loaded && mayPlay() && app.screen === 'play' && !app.pregame && !app.test;
      if (inPlay && session && playWatch && playWatched === playGame && (savePlaySoon.pending() || playUnsure()))
        rescuePlay(playWatch.value(), $state.snapshot(session), !!app.live.cover);
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
  /** The game in play as plain JSON (the audience window gets it), or null until its watcher has started. */
  const playCopy = () => (playWatch && playWatched === app.playGame ? playWatch.value() : null);
  $effect(() => {
    void playRev;
    const session = $state.snapshot(app.session);
    // (The cover too: a game picked up after a reload comes back covered if it was.)
    const cover = !!app.live.cover;
    // Nothing is written during pre-game, so an older saved game stays intact until "Start game".
    // (A ▶ Test this round is never written: the game kept to resume stays as it is.)
    if (loaded && !app.pregame && !app.test && session && untrack(() => playWatched && playWatched === app.playGame)) savePlaySoon(session, cover);
  });

  const savedTime = (ts: number) => new Date(ts).toLocaleString();

  async function startPlay(): Promise<void> {
    // (A player-only file has no ＋ Add round: one with no rounds can only be exported again from the builder.)
    if (!app.game.rounds.length)
      return toast(playerOnly ? 'This game has no rounds to play: ask whoever made it for a new copy.' : 'Add a round first (＋ Add round)', 5000);
    // (A game kept to resume isn't asked about here: the pre-game screen offers ▶ Resume it, and Start replaces it.)
    app.test = null;
    backTo = null;
    // The room left open in the editor belongs to the stream: another game asks first whether to keep it (and its
    // players), the safe answer (Enter, Esc) keeping it.
    const open = kept.room;
    if (open && open.gameId !== app.game.id && !(await keepRoomFor(open))) await closeKeptRoom(true);
    mark('played', 'Played');
    saveEditorSoon.flush();
    app.playGame = clone(app.game);
    app.session = newSession(app.playGame);
    // The same room again (phones stay joined).
    const room = kept.room;
    kept.room = null;
    // (A kept room means Buzzer mode is on: turning it off closes the room. The editor's copy of the setting may not
    // say so yet after a quick reload.)
    if (room) {
      app.session.remote = room.remote;
      app.playGame.settings.buzzer = true;
      // The players the phones joined as (the Play screen sets the players; a quick reload can leave the editor's copy
      // of them behind). Another game's room brings its players along, seats and all, at 0.
      const same = room.gameId === app.game.id;
      if (Array.isArray(room.players) && room.players.length) app.session.players = room.players.map((p) => (same ? p : { ...p, startScore: 0 }));
    }
    app.live = newLive();
    app.pregame = true;
    // An editor toast ("Added a sample game…") would cover the Start game button.
    app.toast = '';
    app.screen = 'play';
  }

  /**
   * ▶ Play with another game's room open: keep it (true) and its players for this game, or close it. Asked with the
   * keeping answer focused (Enter and Esc keep it). A copy with no buzzer server can't use it: it's closed.
   */
  async function keepRoomFor(room: SavedRoom): Promise<boolean> {
    if (!buzzerBase()) return false;
    const code = room.remote.code;
    const n = Array.isArray(room.players) ? room.players.length : 0;
    const players = n ? ` and its ${n} player${n === 1 ? '' : 's'}` : '';
    const close = await ask(
      `The phones stay joined for “${app.game.title.trim() || 'this game'}” and Buzzer mode stays on, so nobody has to join again. Closing it tells the phones the game is over (Start the room makes a new code).`,
      { title: `Keep buzzer room ${code}${players}?`, cancel: n ? 'Keep room & players' : 'Keep the room', ok: 'Close it, start fresh', danger: true },
    );
    return !close && kept.room === room;
  }

  /**
   * ▶ Test this round (the editor): just that round, in a throwaway copy of the game, straight onto the board (the
   * game's players, or three sample players). Nothing is saved: the game kept to resume, and a buzzer room left open,
   * stay as they are. Exit comes back to the editor on that round.
   */
  function testRound(index: number): void {
    const round = app.game.rounds[index];
    if (!round) return;
    saveEditorSoon.flush();
    const game = clone(app.game);
    const r = game.rounds[index];
    game.rounds = [r];
    // (No tiebreaker after it, and no phones: the room, if one is open, waits for ▶ Play.)
    delete game.tiebreaker;
    game.settings.buzzer = undefined;
    // Daily Doubles the board wants but hasn't got go in at random, in this copy only.
    if (isBoard(r)) randomizeDailyDoubles(r, r.dailyDoubleCount ?? 1, Math.random, { keepExisting: true });
    const s = newSession(game);
    if (!s.players.length)
      for (const name of ['Alex', 'Sam', 'Jordan'].slice(0, Math.max(1, game.settings.maxPlayers)))
        s.players.push({ id: newId(), name, color: nextFreeColor(s.players.map((p) => p.color)), startScore: 0 });
    s.players.forEach((p, i) => blankName(p.name) && (p.name = `Player ${i + 1}`));
    app.test = round.id;
    app.playGame = game;
    app.session = s;
    app.live = newLive();
    app.pregame = false;
    if (isBoard(r)) startIntro(s, game);
    else goToRound(s, game, 0);
    app.toast = '';
    app.screen = 'play';
  }

  /** The round the editor opens on when it's back (the one just tested). */
  let backTo = $state<string | null>(null);

  /**
   * Resume game was pressed: a game in progress asks how it's shown first (one window, or the audience window to
   * capture), as before the game. A finished one shows its results at once.
   */
  let resuming = $state<{ withEdits: boolean } | null>(null);

  /**
   * The editor's game differs from the game kept to resume (it was edited since): only then is "Resume with my edits"
   * offered. Worked out a moment after changes stop, from the watcher's plain copy.
   */
  let editsDiffer = $state(false);
  const compareSoon = debounce(() => {
    const saved = app.resumable;
    if (!saved || saved.game.id !== app.game.id) return void (editsDiffer = false);
    const now = watch && watching === app.game ? watch.value() : $state.snapshot(app.game);
    editsDiffer = !sameGame(now, saved.game);
  }, 300);
  $effect(() => {
    void app.resumable;
    untrack(() => compareSoon());
  });
  function askResume(withEdits = false): void {
    if (app.resumable?.session.phase === 'end') void resume(withEdits);
    else resuming = { withEdits };
  }

  /** Resume in the mode picked: the audience window opens now (from the click, or the browser blocks it). */
  function resumeIn(audienceWindow: boolean): void {
    const saved = app.resumable;
    const withEdits = !!resuming?.withEdits;
    resuming = null;
    if (!saved) return;
    // (Remembered for next time, like the pre-game screen's 🖥 Display.)
    prefs.display = audienceWindow ? 'audience' : 'single';
    savePrefs();
    // One window: an audience window still up from before (a reload of this page no longer holds it) closes.
    if (!audienceWindow) closeAudienceWindow();
    else
      void openAudienceWindow(audienceTitle(saved.game)).then((ok) => {
        if (!ok)
          toast(
            inTauri()
              ? "Couldn't open the audience window: press A in the game to try again."
              : 'The browser blocked the audience window: allow popups for this file, then press A in the game.',
            6000,
          );
      });
    void resume(withEdits);
  }

  /**
   * Resume the saved game, optionally switching it to the editor's current version of the game. It's read again first:
   * another tab may have played on since this one started (the newer copy wins).
   */
  async function resume(withEdits = false, room: SavedRoom['remote'] | null = null): Promise<void> {
    const shown = app.resumable;
    if (!shown) return;
    const stored = await loadPlay();
    const saved = stored && stored.savedAt >= shown.savedAt ? resumed(stored) : shown;
    let game = saved.game;
    if (withEdits) {
      game = clone(app.game);
      rebaseSession(saved.session, saved.game, game);
      forgetGameParts(saved.session);
    }
    // The buzzer room open now (the pre-game screen's, or the one left open in the editor): the phones stay in it for
    // the resumed game, when that one plays with phone buzzers (a room of its own it had before is closed). A finished
    // game's results (View results) leave the room kept for the next game.
    const open = room ?? kept.room?.remote ?? null;
    if (open) {
      const own = saved.session.remote;
      if (saved.session.phase === 'end') {
        if (own?.code === open.code) saved.session.remote = null;
      } else if (buzzerOn(game.settings)) {
        if (own && own.code !== open.code) endRoom(own);
        saved.session.remote = own?.code === open.code ? { ...open, armId: Math.max(own.armId ?? 0, open.armId ?? 0) } : open;
        kept.room = null;
        void clearRoom();
      } else if (room) {
        // The pre-game screen's room, for a game that plays without buzzers: closed, and forgotten (a reload mid-game
        // would go back to the pre-game screen with it).
        endRoom(room);
        void clearRoom();
      }
      // (A room kept in the editor that this game doesn't use stays kept: the game mustn't close it on its way in.)
      else if (own?.code === open.code) saved.session.remote = null;
    }
    app.test = null;
    await loadGameMedia(game);
    app.playGame = game;
    app.session = saved.session;
    app.live = newLive();
    // Left with the screen covered: it comes back covered (viewers never see the host's screen meanwhile).
    if (saved.cover) app.live.cover = true;
    app.pregame = false;
    app.toast = '';
    app.screen = 'play';
    app.resumable = null;
    // A fresh game screen (from the pre-game screen, the one there is replaced).
    playKey++;
  }

  /** Goes up to start the game screen afresh (resuming from the pre-game screen). */
  let playKey = $state(0);
  /** The one-line "game kept to resume" over the editor was closed (✕) for this visit. */
  let resumeHidden = $state(false);

  async function discardResume(): Promise<void> {
    const saved = app.resumable;
    if (saved && saved.session.phase !== 'end' && !(await ask(`Discard the saved game "${saved.game.title}"? Its scores and used tiles are deleted.`, { ok: 'Discard', cancel: 'Keep', danger: true })))
      return;
    // Its own room goes with it (the phones are told the game is over), as with Exit › Discard & leave. A room kept open
    // in the editor belongs to the stream and stays (its bar has ✕ Close the room).
    const room = saved?.session.remote;
    app.resumable = null;
    if (room && kept.room?.remote.code !== room.code) endRoom(room);
    await clearPlay();
    // (A write of it that failed is dropped with it.)
    app.playUnstored = false;
    toast('Saved game discarded');
  }

  function leavePlay(): void {
    // The audience window stays up (OBS keeps its capture source between games): in the editor it shows the "Starting
    // soon" card. Only its ✕ (or closing it) closes it. The scores window belongs to the game.
    closeScoresWindow();
    app.screen = 'editor';
    app.playGame = null;
    app.session = null;
    app.pregame = false;
    app.live = newLive();
    app.test = null;
    // The keys go on from ▶ Play (not from <body>, where the next Tab starts at the top of the editor).
    void tick().then(() => {
      if (document.activeElement && document.activeElement !== document.body) return;
      document.querySelector<HTMLElement>('.editor button.play')?.focus({ preventScroll: true });
    });
  }

  /**
   * Leave a game: kept (Exit › Keep & leave), it stays saved and can be resumed (▶ Play offers it); discarded, or
   * finished, it's cleared. A ▶ Test this round leaves nothing: back to the editor, on that round.
   */
  function exitPlay(keep = true): void {
    if (app.test) {
      backTo = app.test;
      return leavePlay();
    }
    // Written now, so a finished game's clearPlay below comes after it.
    savePlaySoon.flush();
    const { playGame, session } = app;
    resumeHidden = false;
    if (playGame && session && !app.pregame) {
      if (session.phase === 'end' || !keep) {
        app.resumable = null;
        clearPlay();
        app.playUnstored = false;
        if (!keep && session.phase !== 'end') toast('Game discarded');
      } else
        app.resumable = {
          game: $state.snapshot(playGame),
          session: $state.snapshot(session),
          savedAt: Date.now(),
          ...(app.live.cover ? { cover: true } : {}),
        };
    }
    leavePlay();
  }

  /**
   * Game over › ▶ Next game…: the results stay viewable from the editor (like a rematch's), and the editor opens
   * Open… / Recent games for the stream's next game. Play left the buzzer room open; the audience window stays up.
   */
  let openOnArrival = $state(false);
  function nextGame(): void {
    const { playGame, session } = app;
    savePlaySoon.flush();
    if (playGame && session) app.resumable = { game: $state.snapshot(playGame), session: $state.snapshot(session), savedAt: Date.now() };
    resumeHidden = false;
    openOnArrival = !playerOnly;
    leavePlay();
  }

  // In the editor, an audience window left open shows the "Starting soon" card of the game in the editor, with the
  // buzzer room's code when one is open (viewers can join for the next game). A moment after any change to the game
  // (the editor's watcher, startWatch), and at once when the room or the game does.
  function soonCard(): void {
    if (app.screen !== 'editor' || !audience.open || !mayPlay()) return;
    const r = kept.room?.remote;
    pushGame(watch && watching === app.game ? watch.value() : $state.snapshot(app.game));
    pushLive({ ...newLive(), pregame: true, room: r?.code && r.base ? { code: r.code, link: joinUrl(r.base, r.code) } : null });
  }
  const soonCardLater = debounce(soonCard, 400);
  $effect(() => {
    if (!loaded || app.screen !== 'editor' || !audience.open) return;
    void app.game;
    void kept.room?.remote.code;
    untrack(soonCard);
  });

  /** The bar's ✕ for the audience window (OBS's capture goes black): asked first. */
  async function closeAudience(): Promise<void> {
    if (await ask('Close the audience window? Your stream capture goes black until it opens again.', { ok: 'Close it', cancel: 'Keep it', danger: true }))
      closeAudienceWindow();
  }
  async function reopenAudience(): Promise<void> {
    if (!(await openAudienceWindow(audienceTitle(app.game))))
      toast(inTauri() ? "Couldn't open the audience window." : 'The browser blocked the popup. Allow popups for this file and try again.', 5000);
  }

  /** Focus the remembered display's card, so Enter resumes in it. */
  function focusPicked(node: HTMLElement): void {
    requestAnimationFrame(() => node.querySelector<HTMLElement>('.mode.on')?.focus());
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
      {#if otherClosed && playerOnly}
        <h1>The other tab was closed</h1>
        <p class="muted">Its game is saved. Nothing else is playing this game now.</p>
        <button class="primary" onclick={editHere}>Play here</button>
      {:else if otherClosed}
        <h1>The other tab was closed</h1>
        <p class="muted">Its changes are saved. Nothing else is editing this game now.</p>
        <button class="primary" onclick={editHere}>Edit here</button>
      {:else if playerOnly}
        <!-- (The same file opened twice: one tab plays and saves its game at a time.) -->
        <h1>This game is open in another tab</h1>
        <p class="muted">Playing here is paused, so the two tabs don't overwrite each other's game.</p>
        <button class="primary" onclick={editHere}>Play here instead</button>
        <p class="muted small">The other tab saves its game first, then pauses.</p>
      {:else}
        <h1>This game is open in another tab</h1>
        <p class="muted">Editing here is paused, so the two tabs don't overwrite each other's changes.</p>
        <button class="primary" onclick={editHere}>Edit here instead</button>
        <p class="muted small">The other tab saves its changes first, then pauses.</p>
      {/if}
    </div>
  </div>
{:else if playerOnly && app.screen === 'editor'}
  <!-- As the editor: the status bar on top, the start screen in the rest (scrolling there in a short window, not the page). -->
  <div class="player-screen">
    {@render statusBar(false)}
    <div class="player-slot">
      <PlayerHome onplay={startPlay} resumable={app.resumable} onresume={() => askResume()} ondiscard={discardResume} ask={resuming ? modeAsk : undefined} />
    </div>
  </div>
{:else if app.screen === 'editor'}
  <!-- The editor fills the window (the page itself never scrolls): the status bar stays on top of it. -->
  <div class="editor-screen">
    {@render statusBar(true)}
    <div class="editor-slot">
      <Editor onplay={startPlay} ontest={testRound} startRound={backTo} {checklist} startOpen={openOnArrival} onopened={() => (openOnArrival = false)} />
    </div>
  </div>
{:else}
  {#key playKey}
    <Play onexit={exitPlay} oncancel={leavePlay} onresume={(withEdits, room) => void resume(withEdits, room)} onnextgame={nextGame} gameRev={playRev} gameCopy={playCopy} />
  {/key}
{/if}

{#snippet modeAsk()}
  <div class="mode-ask" role="group" aria-label="How is the game shown?" use:focusPicked>
    <span>
      <b>How is it shown?</b>
      <span class="muted small">Enter picks the one you used last.</span>
      {#if app.resumable?.cover} <span class="muted small">It comes back with the screen covered (⏸ Cover).</span>{/if}
    </span>
    <ModeCards dual={audience.open || prefs.display === 'audience'} onsingle={() => resumeIn(false)} onaudience={() => resumeIn(true)} />
    <button class="ghost" onclick={() => (resuming = null)}>Cancel</button>
  </div>
{/snippet}

<!--
  One compact line over the editor for what's still going on between games: the buzzer room left open, the game kept to
  resume (or a finished one's results) and the audience window. `resume`: with the kept game (the player-only start
  screen shows its own); the room and the audience window show on both.
-->
{#snippet statusBar(resume: boolean)}
  {@const saved = resume && app.resumable && (!resumeHidden || resuming) ? app.resumable : null}
  {@const room = kept.room}
  {@const showAudience = audience.open || audience.lost}
  {#if room || saved || showAudience}
    <div class="status-bar" class:asking={!!resuming && !!saved} role="region" aria-label="Status">
      {#if room}
        {@const n = Array.isArray(room.players) ? room.players.length : 0}
        {@const other = room.gameId !== app.game.id}
        <!-- (The player-only start screen has no ▶ Play while a game is kept: Resume game goes into the room; a finished
             game's View results doesn't, its New game then ▶ Play does.) -->
        {@const via = playerOnly && app.resumable ? (app.resumable.session.phase === 'end' ? 'New game, then ▶ Play,' : 'Resume game') : '▶ Play'}
        <span class="item room-bar" role="status">
          <span class="what" title="Phones in the room are told you're setting up">
            📱 Buzzer room <b>{room.remote.code}</b> is still open{n ? ` (${n} player${n === 1 ? '' : 's'})` : ''}.
            <span class="muted small">{other ? '▶ Play asks to keep it for this game.' : `${via} goes back into it.`}</span>
          </span>
          <button class="small ghost" onclick={() => closeKeptRoom()}>✕ Close the room</button>
        </span>
      {/if}
      {#if saved}
        {@const ended = saved.session.phase === 'end'}
        <span class="item kept" role="group" aria-label={ended ? 'Finished game' : 'Game in progress'}>
          <span class="what" title="Saved {savedTime(saved.savedAt)}{ended ? '' : ". Edits you make here don't change it unless you resume with them."}">
            {ended ? '🏁 Finished game:' : '⏸ Kept to resume:'} <b>{saved.game.title}</b>
          </span>
          {#if !resuming}
            <button class="small primary" onclick={() => askResume()}>{ended ? 'View results' : 'Resume game'}</button>
            {#if !ended && saved.game.id === app.game.id && editsDiffer}
              <button class="small" onclick={() => askResume(true)} title="Play on with the editor's current version of this game (fixed typos, new slides…). Scores and used tiles are kept.">
                Resume with my edits
              </button>
            {/if}
            <button class="small ghost" onclick={discardResume}>Discard</button>
            <button class="small ghost x" onclick={() => (resumeHidden = true)} aria-label="Hide this line" title="Hide this line (the game stays kept: ▶ Play offers to resume it)">✕</button>
          {/if}
        </span>
      {/if}
      {#if showAudience}
        {#if audience.open}
          <span class="item audience-item" data-audience-open>
            <span class="what" title="Viewers see the “Starting soon” card until the next game starts">📺 Audience window: <span class="muted">“Starting soon”</span></span>
            <button class="small ghost" onclick={closeAudience} aria-label="Close the audience window" title="Close the audience window (your stream capture goes black)">✕</button>
          </span>
        {:else}
          <span class="item audience-item lost" role="alert" data-audience-lost>
            <span class="what">📺 Audience window closed: viewers see nothing</span>
            <button class="small" onclick={reopenAudience}>Reopen</button>
          </span>
        {/if}
      {/if}
      {#if resuming && saved}
        {@render modeAsk()}
      {/if}
    </div>
  {/if}
{/snippet}

<ContextMenu />
<AskDialog />
{#if app.toast && !app.onAir}
  <!-- (Screen readers hear it from the live region: announce.ts.) -->
  <div class="toast note-pill" data-over-modal aria-hidden="true">{app.toast}</div>
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
  .editor-screen {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }
  .editor-slot {
    flex: 1;
    min-height: 0;
  }
  .player-screen {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .player-slot {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
  .status-bar {
    flex: none;
    display: flex;
    gap: 6px 16px;
    align-items: center;
    flex-wrap: wrap;
    padding: 3px 16px;
    font-size: 13px;
    background: #2a2410;
    border-bottom: 1px solid var(--warn);
  }
  .status-bar .item {
    display: flex;
    gap: 6px;
    align-items: center;
    min-width: 0;
    max-width: 100%;
  }
  /* Between items, a thin line. */
  .status-bar .item + .item {
    padding-left: 16px;
    border-left: 1px solid rgba(255, 255, 255, 0.15);
  }
  .status-bar .what {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .status-bar .lost .what {
    color: var(--bad);
    font-weight: 600;
  }
  .status-bar button.small {
    padding: 2px 8px;
  }
  .small {
    font-size: 12px;
  }
  .status-bar .mode-ask {
    flex-basis: 100%;
    padding: 6px 0;
  }
  .mode-ask {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    width: min(760px, 100%);
  }
  .mode-ask :global(.modes) {
    align-self: stretch;
  }
</style>
