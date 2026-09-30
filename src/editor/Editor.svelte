<script lang="ts">
  import { dropMenu, showMenu } from '../lib/menustate.svelte';
  import SettingsDialog from './SettingsDialog.svelte';
  import OpenSaves from './OpenSaves.svelte';
  import { listSaves, readSave, type SaveEntry } from '../lib/desktop.svelte';
  import { onMount, untrack } from 'svelte';
  import { app, toast } from '../lib/app.svelte';
  import { isBoard, isBoardGame, isFinal, isRpg, newFinalRound, newGame, newRound, roundName, type Round, type RoundMode } from '../lib/model';
  import { clone, reidRound } from '../lib/ops';
  import { newRpgRound } from '../lib/rpg';
  import { ROUND_MODES } from '../lib/modes';
  import { pickFile, safeFilename, saveGameJson } from '../lib/fileio';
  import { openGameFile, savePack } from '../lib/pack';
  import { exportStandaloneHtml } from '../lib/export';
  import { formatBytes } from '../lib/media.svelte';
  import { pruneMedia } from '../lib/media.svelte';
  import SetupPanel from './SetupPanel.svelte';
  import RoundEditor from './RoundEditor.svelte';
  import FinalEditor from './FinalEditor.svelte';
  import TiebreakerEditor from './TiebreakerEditor.svelte';
  import StatsItemsEditor from './StatsItemsEditor.svelte';
  import RpgRoundEditor from './rpg/RpgRoundEditor.svelte';
  import BoardGameEditor from './boardgame/BoardGameEditor.svelte';
  import { newBoardGameRound } from '../lib/boardgame';
  import RoundActions from './RoundActions.svelte';
  import MediaLibrary from './MediaLibrary.svelte';
  import ToolsEditor from './tools/ToolsEditor.svelte';
  import ThemeEditor from './ThemeEditor.svelte';
  import AboutDialog from './AboutDialog.svelte';
  import { inTauri } from '../lib/platform';
  import { dataFolders } from '../lib/desktop.svelte';
  import { registerGameFonts } from '../lib/fonts';
  import { validate } from '../lib/validate';
  import { arriving, history, mark, onApplied, redo, undo } from '../lib/history.svelte';
  import { goTo, take, type Place } from '../lib/nav.svelte';
  import { rpgRounds } from '../lib/rpg';
  import { createFieldTracker, undoKeyOf } from '../lib/undokeys';
  import HistoryNotice from './HistoryNotice.svelte';

  let { onplay }: { onplay: () => void } = $props();

  // 'setup' | 'tiebreaker' | 'media' | 'tools' | 'theme' | round index
  let tab = $state<'setup' | 'tiebreaker' | 'media' | 'tools' | 'theme' | 'stats' | number>(0);
  const game = $derived(app.game);
  $effect(() => {
    registerGameFonts(game);
  });
  $effect(() => {
    document.title = game.title ? `${game.title} · Brainrot Games Maker` : 'Brainrot Games Maker';
  });

  // Where an undo or redo changed something: that tab (the parts inside it open the rest, see nav.svelte.ts).
  const handled = { seq: 0 };
  $effect(() => {
    const place = take(handled);
    if (place) untrack(() => show(place));
  });
  function show(place: Place): void {
    if (place.tab === 'round') {
      const i = game.rounds.findIndex((r) => r.id === place.round);
      if (i >= 0) tab = i;
    } else if (place.tab === 'world') {
      // The round on screen if it plays that world, else the first round that does (a world no round plays stays put).
      const on = typeof tab === 'number' ? game.rounds[tab] : undefined;
      const playing = rpgRounds(game).filter((r) => r.world === place.world);
      const r = playing.find((x) => x === on) ?? playing[0];
      if (r) tab = game.rounds.indexOf(r);
    } else if (place.tab !== 'title' && place.tab !== 'history') tab = place.tab;
  }

  // The round on screen stays on screen when an undo puts back (or takes away) a round before it.
  let shownRound: string | undefined;
  $effect(() => {
    shownRound = typeof tab === 'number' ? game.rounds[tab]?.id : undefined;
  });
  onMount(() =>
    onApplied((e, dir, via) => {
      const i = game.rounds.findIndex((r) => r.id === shownRound);
      if (typeof tab === 'number' && i >= 0) tab = i;
      // Then on to where it changed (a jump in the History list shows there).
      const place = dir < 0 ? e.undoPlace : e.place;
      if (via !== 'list' && place) goTo(place);
    }),
  );

  /** Add a round of `mode`. New rounds go before Final rounds at the end, so the Final stays last. */
  function addRound(mode: RoundMode): void {
    let at = game.rounds.length;
    if (mode !== 'final') while (at > 0 && isFinal(game.rounds[at - 1])) at--;
    let round: Round;
    if (mode === 'rpg') round = newRpgRound(game, game.rounds.some(isRpg) ? `Adventure ${game.rounds.filter(isRpg).length + 1}` : 'Adventure');
    else if (mode === 'boardgame') round = newBoardGameRound(game.rounds.some(isBoardGame) ? `Board game ${game.rounds.filter(isBoardGame).length + 1}` : 'Board game');
    else if (mode === 'final') round = newFinalRound(game.rounds.some(isFinal) ? `Final round ${game.rounds.filter(isFinal).length + 1}` : 'Final Jeopardy!');
    else {
      const boards = game.rounds.slice(0, at).filter(isBoard);
      const prev = boards[boards.length - 1];
      const name = boards.length === 1 ? 'Double Jeopardy!' : boards.length ? `Round ${boards.length + 1}` : 'Jeopardy!';
      round = newRound(name, prev?.categories.length ?? 6, prev ? prev.values.map((v) => v * 2) : undefined);
    }
    game.rounds.splice(at, 0, round);
    tab = at;
  }

  /** The round modes, under the button. The menu keeps every key: Delete or an arrow never reaches what's selected behind it. */
  function addRoundMenu(e: MouseEvent): void {
    dropMenu(
      e,
      Object.entries(ROUND_MODES).map(([mode, m]) => ({ label: `${m.icon} ${m.label}`, hint: m.hint, onclick: () => addRound(mode as RoundMode) })),
    );
  }

  /** What goes with a deleted round, for the confirm (an RPG's world stays: other rounds can play it). */
  const GOES_WITH: Record<RoundMode, string> = {
    board: ' and all its clues?',
    final: ' and its question and answer?',
    rpg: '? Its world of screens stays in the game.',
    boardgame: ' and all its spaces?',
  };

  // Moving, copying or deleting a round keeps the same tab on screen (a round's right-click menu can act on
  // another round). The round on screen follows its own move, and its copy shows the copy.
  function removeRound(i: number): void {
    if (!confirm(`Delete "${roundName(game.rounds[i], i)}"${GOES_WITH[game.rounds[i].mode]}`)) return;
    game.rounds.splice(i, 1);
    if (typeof tab === 'number' && tab > i) tab--;
    // The round on screen went: show its neighbour. With none left, tab 0 is the "add your first round" screen.
    else if (tab === i) tab = Math.max(0, Math.min(i, game.rounds.length - 1));
  }

  function moveRound(i: number, delta: number): void {
    const j = i + delta;
    if (j < 0 || j >= game.rounds.length) return;
    const [r] = game.rounds.splice(i, 1);
    game.rounds.splice(j, 0, r);
    if (tab === i) tab = j;
    else if (tab === j) tab = i;
  }

  /** A copy right after the original, with fresh ids everywhere (so used tiles and saved sessions never mix them up). */
  function duplicateRound(i: number): void {
    const copy = reidRound(clone($state.snapshot(game.rounds[i]) as Round));
    copy.name = `${roundName(game.rounds[i], i)} (copy)`;
    game.rounds.splice(i + 1, 0, copy);
    if (typeof tab === 'number' && tab >= i) tab++;
  }

  function newFile(): void {
    if (!confirm('Start a new game? Save this one first if you want to keep it.')) return;
    arriving({ kind: 'new', label: 'New game' });
    app.game = newGame();
    // A new game has no rounds: start on the screen that adds the first one.
    tab = 0;
    pruneMedia([app.game, app.playGame, app.resumable?.game]);
  }

  /** Desktop app: the saves in BrainrotSaves, listed by Open… (null: the list is closed). */
  let saveList = $state<SaveEntry[] | null>(null);

  async function open(): Promise<void> {
    if (inTauri()) {
      const saves = await listSaves();
      if (saves.length) {
        saveList = saves;
        return;
      }
    }
    await browse();
  }

  async function browse(): Promise<void> {
    saveList = null;
    const file = await pickFile('.brainrot,.jbr,.zip,.json,application/json,application/zip');
    if (file) await openFile(file);
  }

  async function openSave(s: SaveEntry): Promise<void> {
    saveList = null;
    try {
      await openFile(await readSave(s));
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function openFile(file: File): Promise<void> {
    // Like New: asked once the file is chosen (a cancelled picker asks nothing), and not for a game with nothing in it
    // yet (wheels, players or the Stats & Items catalog made before any round count).
    const work = game.rounds.length || game.players.length || game.media.length || game.wheels.length || game.dice.length;
    const kit = game.statFields?.length || game.items?.length || game.shops?.length || game.worlds?.length;
    if ((work || kit) && !confirm(`Open "${file.name}"? It replaces this game. Save this one first if you want to keep it.`)) return;
    try {
      const opened = await openGameFile(file);
      // A hand-edited file missing parts the editor needs would break the page: check it before it replaces this game.
      try {
        validate(opened);
      } catch {
        throw new Error(`"${file.name}" is missing parts a game needs (was it edited by hand?), so it wasn't opened.`);
      }
      arriving({ kind: 'opened', label: `Opened “${opened.title}”` });
      app.game = opened;
      tab = 0;
      toast(`Opened "${app.game.title}"`);
      pruneMedia([app.game, app.playGame, app.resumable?.game]);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  /** A game file dropped anywhere no other part of the editor takes the drop opens, like Open…. */
  function ondrop(e: DragEvent): void {
    if (e.defaultPrevented || !e.dataTransfer?.files.length) return;
    e.preventDefault();
    const file = Array.from(e.dataTransfer.files).find((f) => /\.(brainrot|jbr|json)$/i.test(f.name));
    if (file) openFile(file);
    else toast('Drop pictures, videos and sounds on 🖼 Media, a slide or a tile. A .brainrot game dropped here opens.', 5000);
  }

  let saving = $state(false);
  /** Percent done while a pack is built (big games take a few seconds). */
  let packPct = $state<number | null>(null);
  const packProgress = (done: number, total: number) => (packPct = total ? Math.floor((done / total) * 100) : null);

  /**
   * Ctrl+S saves the game (in a browser it would save this app's page instead), except in a dialog: finish that first
   * (a picker, or the 🌐 Link box that stays open beside the slide, isn't one). Ctrl+Z / Ctrl+Y undo and redo.
   */
  function onkeydown(e: KeyboardEvent): void {
    const key = undoKeyOf(e);
    if (key) return undoKey(e, key);
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== 's') return;
    e.preventDefault();
    if (document.querySelector('[role="dialog"][aria-modal="true"]')) toast('Close this window first, then save (Ctrl+S)');
    else if (!saving && !e.repeat) save();
  }

  // The text field in focus, so Ctrl+Z can stay its own while it has typing of its own.
  const fields = createFieldTracker();

  /**
   * Ctrl+Z / Ctrl+Y go through the game's undo history, except in a text field with typing of its own (the field's
   * own undo takes that back first), in a window that isn't about the game (⚙ Settings, ℹ About, Open: nothing
   * happens), and in the editors that keep an undo of their own for now (they take the key first).
   */
  function undoKey(e: KeyboardEvent, key: 'undo' | 'redo'): void {
    if (e.defaultPrevented || fields.native(e, key)) return;
    // Never the browser's own undo, which would change the last field typed in, wherever it is.
    e.preventDefault();
    if (document.querySelector('[data-undo="off"]')) return;
    if (key === 'undo') undo('key');
    else redo('key');
    fields.afterGlobal();
  }

  async function save(): Promise<void> {
    saving = true;
    packPct = null;
    try {
      const { missing, where } = await savePack($state.snapshot(game), packProgress);
      mark('saved', `Saved “${safeFilename(game.title)}.brainrot”`);
      if (missing.length) alert(`${where}\n\nThese media files were missing and weren't included:\n${missing.join('\n')}`);
      else toast(where, 5000);
    } catch (e) {
      alert('Save failed: ' + (e as Error).message);
    } finally {
      saving = false;
    }
  }

  let exporting = $state(false);
  async function exportHtml(): Promise<void> {
    exporting = true;
    packPct = null;
    try {
      const r = await exportStandaloneHtml($state.snapshot(game), packProgress);
      if (r) {
        mark('exported', 'Exported HTML');
        toast(
          `Exported a playable HTML file (${formatBytes(r.size)}): ${r.where.replace(/^(Saved to|Downloaded) /, '')}. Double-click it to play.` +
            (r.online ? ` ${r.online} item${r.online === 1 ? ' plays' : 's play'} from the internet, so it needs internet during the game.` : ''),
          r.online ? 8000 : 5000,
        );
      }
      if (r?.missing.length) alert(`These media files were missing and weren't included:\n${r.missing.join('\n')}`);
    } catch (e) {
      alert('Export failed: ' + (e as Error).message);
    } finally {
      exporting = false;
    }
  }

  const problems = $derived(validate(game));
  const undoTitle = $derived(history.canUndo ? `Undo: ${history.undoLabel} (Ctrl+Z)` : 'Nothing to undo');
  const redoTitle = $derived(history.canRedo ? `Redo: ${history.redoLabel} (Ctrl+Y)` : 'Nothing to redo');

  let about = $state(false);
  let settings = $state(false);
  // The desktop app says once, up front, that it keeps data in folders on this PC (ℹ About shows which).
  const NOTICE_KEY = 'jb.dataNoticeSeen';
  let dataNotice = $state(inTauri() && !seen());
  function seen(): boolean {
    try {
      return localStorage.getItem(NOTICE_KEY) === '1';
    } catch {
      return false;
    }
  }
  // The first start after the rename moved Jeopardy Builder's folders over: say so once.
  let movedNotice = $state(false);
  onMount(() => {
    if (inTauri()) dataFolders().then((f) => (movedNotice = !!f?.moved));
  });
  function dismissNotice(): void {
    dataNotice = false;
    movedNotice = false;
    try {
      localStorage.setItem(NOTICE_KEY, '1');
    } catch {
      /* ignore */
    }
  }
</script>

<svelte:window {onkeydown} onfocusincapture={fields.focusin} oninputcapture={fields.input} />
<svelte:document {ondrop} />

<div class="editor">
  <header>
    <input class="title" bind:value={game.title} aria-label="Game title" data-place="title" />
    <button class="ghost" onclick={() => undo()} disabled={!history.canUndo} title={undoTitle} aria-label="Undo (Ctrl+Z)">↶</button>
    <button class="ghost" onclick={() => redo()} disabled={!history.canRedo} title={redoTitle} aria-label="Redo (Ctrl+Y)">↷</button>
    <button onclick={newFile}>New</button>
    <button onclick={open}>Open…</button>
    <button
      onclick={save}
      disabled={saving}
      title={`${inTauri() ? 'Save a .brainrot game pack (the game and all its media) into BrainrotSaves' : 'Download a .brainrot game pack (the game and all its media)'} · Ctrl+S`}
    >
      {saving ? `Saving…${packPct !== null ? ` ${packPct}%` : ''}` : 'Save'}
    </button>
    <button onclick={exportHtml} disabled={exporting} title="A single player-only HTML file with everything inside. Share it and double-click to play.">
      {exporting ? `Exporting…${packPct !== null ? ` ${packPct}%` : ''}` : '⬇ Export HTML'}
    </button>
    <button
      class="ghost"
      onclick={async () => {
        try {
          toast(await saveGameJson($state.snapshot(game)), 5000);
          mark('exported', 'Exported JSON');
        } catch (e) {
          alert('Export failed: ' + (e as Error).message);
        }
      }}
      title="Text only, no media. Handy for hand-editing."
    >
      Export JSON
    </button>
    <span class="spacer"></span>
    {#if app.storageOk}
      <span
        class="muted autosave saved"
        title={`Every change is autosaved ${inTauri() ? 'on this PC' : 'in this browser'}.${app.fileAutosave ? ` Last autosave file: ${app.fileAutosave.path}` : ''}`}
      >
        ✓ Autosaved{app.fileAutosave ? ` · file ${new Date(app.fileAutosave.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}
      </span>
    {:else}
      <span class="autosave warn" title={`Changes can't be kept ${inTauri() ? 'on this PC' : 'in this browser'} right now (storage is blocked or full). Use Save often.`}>
        ⚠ Autosave unavailable here: use Save
      </span>
    {/if}
    <button class="ghost" onclick={() => (settings = true)} title="Autosaves and how Save names files">⚙ Settings</button>
    <button class="ghost" onclick={() => (about = true)} title="Version, links, and where your data is saved">ℹ About</button>
    <button class="primary" onclick={onplay} disabled={!game.rounds.length} title={game.rounds.length ? '' : 'Add a round first'}>▶ Play</button>
  </header>
  {#if movedNotice}
    <div class="data-notice" role="status">
      <span>Jeopardy Builder is now <b>Brainrot Games Maker</b>. Your games and media were moved to its new folder.</span>
      <button class="small" onclick={() => ((about = true), dismissNotice())}>ℹ See where</button>
      <button class="small ghost" onclick={dismissNotice}>Got it</button>
    </div>
  {:else if dataNotice}
    <div class="data-notice" role="status">
      <span>Brainrot Games Maker saves your autosave and media in a folder on this PC.</span>
      <button class="small" onclick={() => ((about = true), dismissNotice())}>ℹ See where</button>
      <button class="small ghost" onclick={dismissNotice}>Got it</button>
    </div>
  {/if}
  {#if about}<AboutDialog onclose={() => (about = false)} />{/if}
  {#if settings}<SettingsDialog onclose={() => (settings = false)} />{/if}
  {#if saveList}<OpenSaves saves={saveList} onpick={openSave} onbrowse={browse} onclose={() => (saveList = null)} />{/if}

  <div class="body">
    <nav>
      <button class:active={tab === 'setup'} onclick={() => (tab = 'setup')}>⚙ Setup & Players</button>
      <div class="navlabel muted">Rounds</div>
      {#each game.rounds as round, i (round.id)}
        <button
          class="round-tab"
          class:active={tab === i}
          data-place="round:{round.id}"
          onclick={() => (tab = i)}
          oncontextmenu={(e) =>
            showMenu(e, [
              { heading: roundName(round, i) },
              { label: '◀ Move earlier', onclick: () => moveRound(i, -1), disabled: i === 0 },
              { label: 'Move later ▶', onclick: () => moveRound(i, 1), disabled: i === game.rounds.length - 1 },
              { label: '⧉ Duplicate', onclick: () => duplicateRound(i) },
              { sep: true },
              { label: '🗑 Delete round', danger: true, onclick: () => removeRound(i) },
            ])}
          title={ROUND_MODES[round.mode].label}
        >
          <span aria-hidden="true">{ROUND_MODES[round.mode].icon}</span> {roundName(round, i)}
        </button>
      {/each}
      <button class="ghost" aria-haspopup="menu" onclick={addRoundMenu}>＋ Add round</button>
      <button class:active={tab === 'theme'} onclick={() => (tab = 'theme')}>🎨 Theme</button>
      <button class:active={tab === 'tools'} onclick={() => (tab = 'tools')}>🎡 Wheels & Dice</button>
      <button class:active={tab === 'stats'} onclick={() => (tab = 'stats')} title="Player stats, items and shops (RPG rounds)">📊 Stats & Items</button>
      <button class:active={tab === 'media'} onclick={() => (tab = 'media')}>🖼 Media ({game.media.length})</button>
      <div class="navlabel muted">End</div>
      <button class:active={tab === 'tiebreaker'} onclick={() => (tab = 'tiebreaker')}>
        Tiebreaker {game.tiebreaker ? '' : '(off)'}
      </button>

      {#if problems.length}
        <div class="problems">
          <div class="navlabel">Checklist</div>
          {#each problems as p}
            <button class="problem {p.level}" onclick={() => (tab = p.tab)}>{p.level === 'warn' ? '⚠' : 'ℹ'} {p.text}</button>
          {/each}
        </div>
      {:else}
        <div class="problems ok">✓ Ready to play</div>
      {/if}
    </nav>

    <main>
      <!-- A game that's opened or new starts every editor afresh: no undo history carries over from the last one
           (another save of the same game has the same round ids). -->
      {#key game}
        {#if tab === 'setup'}
          <SetupPanel />
        {:else if tab === 'stats'}
          <StatsItemsEditor />
        {:else if tab === 'tiebreaker'}
          <TiebreakerEditor />
        {:else if tab === 'media'}
          <MediaLibrary />
        {:else if tab === 'tools'}
          <ToolsEditor />
        {:else if tab === 'theme'}
          <ThemeEditor />
        {:else if game.rounds[tab]}
          {@const i = tab}
          {@const round = game.rounds[i]}
          {#key round.id}
            <RoundActions
              {round}
              index={i}
              count={game.rounds.length}
              onmove={(d) => moveRound(i, d)}
              onduplicate={() => duplicateRound(i)}
              ondelete={() => removeRound(i)}
            />
            {#if isBoard(round)}
              <RoundEditor {round} />
            {:else if isFinal(round)}
              <FinalEditor {round} />
            {:else if isRpg(round)}
              <RpgRoundEditor {round} />
            {:else if isBoardGame(round)}
              <BoardGameEditor {round} />
            {/if}
          {/key}
        {:else if !game.rounds.length}
          <div class="first-round">
            <h2>Add your first round</h2>
            <p class="muted">A game is a list of rounds, and each round picks how it plays. Add as many as you like, in any order.</p>
            <div class="modes">
              {#each Object.entries(ROUND_MODES) as [mode, m] (mode)}
                <button class="mode" onclick={() => addRound(mode as RoundMode)}>
                  <span class="icon" aria-hidden="true">{m.icon}</span>
                  <b>{m.label}</b>
                  <span class="muted small">{m.hint}</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}
      {/key}
    </main>
  </div>
  <HistoryNotice />
</div>

<style>
  .first-round {
    max-width: 820px;
    margin: 40px auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .first-round h2,
  .first-round p {
    margin: 0;
  }
  .first-round .modes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 10px;
  }
  .first-round .mode {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    padding: 14px;
    text-align: left;
    white-space: normal;
  }
  .first-round .icon {
    font-size: 28px;
  }
  .editor {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  header {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 10px 16px;
    background: var(--panel);
    border-bottom: 1px solid var(--border);
  }
  .title {
    font-size: 18px;
    font-weight: 600;
    width: min(340px, 28vw);
  }
  .autosave {
    font-size: 12px;
  }
  /* Short, so it stays on one line (the details are in its tooltip). */
  .saved {
    white-space: nowrap;
  }
  .data-notice {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 6px 16px;
    font-size: 13px;
    background: rgba(79, 124, 255, 0.12);
    border-bottom: 1px solid var(--accent);
  }
  .data-notice .small {
    font-size: 12px;
  }
  .warn {
    color: var(--warn);
  }
  .body {
    flex: 1;
    display: flex;
    min-height: 0;
  }
  nav {
    width: 220px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px;
    border-right: 1px solid var(--border);
    background: var(--panel);
    overflow-y: auto;
  }
  nav > button {
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  nav > button.active {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .navlabel {
    margin-top: 12px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .problems {
    margin-top: 8px;
    font-size: 12px;
    color: var(--warn);
  }
  .problem {
    display: block;
    width: 100%;
    margin-top: 4px;
    padding: 2px 4px;
    border: none;
    background: none;
    text-align: left;
    white-space: normal;
    font-size: 12px;
    color: var(--warn);
  }
  .problem.info {
    color: var(--muted);
  }
  .problem:hover {
    background: var(--panel-2);
  }
  .problems.ok {
    color: var(--good);
  }
  main {
    flex: 1;
    overflow: auto;
    padding: 16px 20px;
    min-width: 0;
  }
  @media (max-width: 700px) {
    .body {
      flex-direction: column;
    }
    nav {
      width: auto;
      flex-direction: row;
      flex-wrap: wrap;
      border-right: none;
      border-bottom: 1px solid var(--border);
    }
    .navlabel,
    .problems,
    .autosave {
      display: none;
    }
  }
</style>
