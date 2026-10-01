<script lang="ts">
  import { dropMenu, showMenu } from '../lib/menustate.svelte';
  import SettingsDialog from './SettingsDialog.svelte';
  import OpenSaves from './OpenSaves.svelte';
  import { listSaves, readSave, type SaveEntry } from '../lib/desktop.svelte';
  import { onMount, tick, untrack } from 'svelte';
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
  import ShortcutsDialog from './ShortcutsDialog.svelte';
  import { inTauri } from '../lib/platform';
  import { dataFolders } from '../lib/desktop.svelte';
  import { registerGameFonts } from '../lib/fonts';
  import { validate, type Problem } from '../lib/validate';
  import { checklistLines, type ChecklistLine } from '../lib/checklist';
  import { followClueText } from '../lib/cluetext';
  import { arriving, history, mark, onApplied, onApplying, redo, step, undo } from '../lib/history.svelte';
  import { goTo, take, type Place } from '../lib/nav.svelte';
  import { itemIdsIn } from '../lib/historyops';
  import { rpgRounds } from '../lib/rpg';
  import { createFieldTracker, undoKeyOf } from '../lib/undokeys';
  import HistoryNotice from './HistoryNotice.svelte';
  import HistoryPanel from './HistoryPanel.svelte';

  /** `problems`: the checklist, worked out by the app a moment after changes stop. */
  let { onplay, problems }: { onplay: () => void; problems: Problem[] } = $props();

  // 'setup' | 'tiebreaker' | 'media' | 'tools' | 'theme' | 'history' | round index
  let tab = $state<'setup' | 'tiebreaker' | 'media' | 'tools' | 'theme' | 'stats' | 'history' | number>(0);
  const game = $derived(app.game);
  /** The round tab last open (🎨 Theme previews it). */
  let lastRound = $state(0);
  $effect(() => {
    if (typeof tab === 'number') lastRound = tab;
  });
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
      else toast(`“${game.worlds?.find((w) => w.id === place.world)?.name}” isn't played by any round: pick it in an RPG round to see it`, 5000);
    } else if (place.tab !== 'title') tab = place.tab;
  }

  // The round on screen stays on screen when an undo puts back (or takes away) a round before it. When an undo takes
  // away the round itself (one added or duplicated), the round before it shows: for a copy, its original. When a redo
  // takes it away (deleted again), its neighbour shows, as when it was deleted. A round's tab in focus keeps the focus
  // on its round, or on the one shown in its place.
  /** The round shown and the round tab in focus (with their places) just before an undo or redo changes the rounds. */
  let before: { shown?: string; focused?: string; at: number; focusedAt: number } = { at: -1, focusedAt: -1 };
  onMount(() => {
    const offApplying = onApplying(() => {
      const tabs = [...document.querySelectorAll<HTMLElement>('nav .round-tab')];
      const focusedAt = tabs.findIndex((t) => t === document.activeElement);
      const at = typeof tab === 'number' ? tab : -1;
      before = { shown: game.rounds[at]?.id, focused: game.rounds[focusedAt]?.id, at, focusedAt };
    });
    const offApplied = onApplied((e, dir, via) => {
      const near = (at: number) => Math.max(0, Math.min(dir < 0 ? at - 1 : at, game.rounds.length - 1));
      const where = (id: string | undefined, at: number) => {
        const i = game.rounds.findIndex((r) => r.id === id);
        return i >= 0 ? i : near(at);
      };
      if (typeof tab === 'number') tab = where(before.shown, before.at);
      if (before.focusedAt >= 0) focusRoundTab(game.rounds[where(before.focused, before.focusedAt)]?.id);
      // Then on to where it changed (the History tab shows it in its list).
      const place = dir < 0 ? e.undoPlace : e.place;
      if (via !== 'list' && tab !== 'history' && place) goTo(place, itemIdsIn(e.ops));
    });
    return () => (offApplying(), offApplied());
  });

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
      // The second board doubles the first (Double Jeopardy!); later ones keep the values of the one before.
      round = newRound(name, prev?.categories.length ?? 6, prev ? prev.values.map((v) => (boards.length === 1 ? v * 2 : v)) : undefined);
    }
    // Its clues take the theme's clue text.
    if (isBoard(round)) followClueText(game, round.categories.flatMap((c) => c.clues.flatMap((cl) => [cl.questionSlide, cl.answerSlide])));
    else if (isFinal(round)) followClueText(game, [round.questionSlide, round.answerSlide]);
    game.rounds.splice(at, 0, round);
    tab = at;
    // The menu (or the card) that added it is gone: the focus goes on to the new round's tab.
    focusRoundTab(round.id);
  }

  /** The round modes, under the button. The menu keeps every key: Delete or an arrow never reaches what's selected behind it. */
  function addRoundMenu(e: MouseEvent): void {
    dropMenu(
      e,
      Object.entries(ROUND_MODES).map(([mode, m]) => ({ label: `${m.icon} ${m.label}`, hint: m.hint, onclick: () => addRound(mode as RoundMode) })),
    );
  }

  // Moving, copying or deleting a round keeps the same tab on screen (a round's right-click menu can act on
  // another round). The round on screen follows its own move, and its copy shows the copy. Deleting is done at
  // once: the note at the bottom offers Undo (an RPG round's world stays, other rounds can play it).
  function removeRound(i: number): void {
    step(`Deleted round “${roundName(game.rounds[i], i)}”`, () => game.rounds.splice(i, 1), { notify: true });
    if (typeof tab === 'number' && tab > i) tab--;
    // The round on screen went: show its neighbour. With none left, tab 0 is the "add your first round" screen.
    else if (tab === i) tab = Math.max(0, Math.min(i, game.rounds.length - 1));
  }

  /** Move round `i` to `j` (the tab on screen stays with its round). */
  function moveRound(i: number, j: number): void {
    if (j < 0 || j >= game.rounds.length || j === i) return;
    const shown = typeof tab === 'number' ? game.rounds[tab] : undefined;
    step(`Moved round “${roundName(game.rounds[i], i)}” ${j < i ? 'earlier' : 'later'}`, () => {
      const [r] = game.rounds.splice(i, 1);
      game.rounds.splice(j, 0, r);
    });
    if (shown) tab = game.rounds.indexOf(shown);
  }

  /** A copy right after the original, with fresh ids everywhere (so used tiles and saved sessions never mix them up). */
  function duplicateRound(i: number): void {
    const copy = reidRound(clone($state.snapshot(game.rounds[i]) as Round));
    copy.name = `${roundName(game.rounds[i], i)} (copy)`;
    step(`Duplicated round “${roundName(game.rounds[i], i)}”`, () => game.rounds.splice(i + 1, 0, copy));
    if (typeof tab === 'number' && tab >= i) tab++;
  }

  // ---------- Round tabs: drag to reorder, keys, rename in place ----------

  const focusRoundTab = (id: string | undefined) => void tick().then(() => id && document.querySelector<HTMLElement>(`nav [data-place="round:${id}"]`)?.focus());

  /**
   * On a round's tab: Alt+↑/↓ moves it, Delete / Backspace deletes it (with Undo at the bottom), F2 renames it and
   * Ctrl+D duplicates it.
   */
  function roundTabKey(e: KeyboardEvent, i: number): void {
    const k = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    const id = game.rounds[i].id;
    if (e.altKey && !mod && (k === 'arrowup' || k === 'arrowdown')) {
      e.preventDefault();
      moveRound(i, i + (k === 'arrowup' ? -1 : 1));
      focusRoundTab(id);
    } else if ((k === 'delete' || k === 'backspace') && !mod && !e.altKey) {
      e.preventDefault();
      removeRound(i);
      focusRoundTab(game.rounds[Math.min(i, game.rounds.length - 1)]?.id);
    } else if (k === 'f2') {
      e.preventDefault();
      renamingRound = id;
    } else if (mod && !e.altKey && k === 'd') {
      e.preventDefault();
      duplicateRound(i);
      focusRoundTab(game.rounds[i + 1]?.id);
    }
  }

  /** The round tab being renamed in place. */
  let renamingRound = $state<string | null>(null);
  function renameRound(round: Round, name: string): void {
    renamingRound = null;
    const n = name.trim();
    if (n && n !== roundName(round, game.rounds.indexOf(round))) step(null, () => (round.name = n));
    focusRoundTab(round.id);
  }
  const focusAll = (el: HTMLInputElement) => {
    el.focus();
    el.select();
  };

  // Round tabs drag to reorder (a line shows where it goes).
  let roundDrag = $state<string | null>(null);
  let roundDrop = $state<{ id: string; after: boolean } | null>(null);
  function roundOver(e: DragEvent, round: Round): void {
    if (!roundDrag) return;
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    roundDrop = { id: round.id, after: e.clientY > r.top + r.height / 2 };
  }
  function roundDropped(e: DragEvent): void {
    if (!roundDrag) return;
    e.preventDefault();
    const from = game.rounds.findIndex((r) => r.id === roundDrag);
    const at = game.rounds.findIndex((r) => r.id === roundDrop?.id);
    if (from >= 0 && at >= 0 && roundDrop) {
      const to = at + (roundDrop.after ? 1 : 0);
      moveRound(from, to > from ? to - 1 : to);
    }
    roundDrag = null;
    roundDrop = null;
  }

  // ---------- Checklist ----------

  /** The checklist, one line a round. */
  const checklist = $derived(checklistLines(game, problems));

  /** A checklist line: its tab, at the first thing to finish there (a board's first unfinished tile has the focus). */
  function goFix(line: ChecklistLine): void {
    tab = line.tab;
    if (!line.place?.tab || line.place.tab !== 'round' || !line.place.part) return;
    goTo(line.place);
    const part = line.place.part;
    const key = part.kind === 'clue' ? `clue:${part.clue}` : part.kind === 'category' ? `category:${part.category}` : null;
    if (!key) return;
    void tick()
      .then(tick)
      .then(() => {
        const el = document.querySelector<HTMLElement>(`[data-place="${key}"]`);
        (el?.matches('button') ? el : el?.querySelector<HTMLElement>('textarea'))?.focus();
      });
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
    else toast('Drop pictures, videos and sounds on 🖼 Media, a slide, a tile or a Choose… button. A .brainrot game dropped here opens.', 5000);
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
    // ? (not typing, nothing open over the editor): the editor's keys.
    if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.defaultPrevented && !shortcuts) {
      if ((e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable]') || document.querySelector('[role="dialog"], [role="menu"]')) return;
      e.preventDefault();
      shortcuts = true;
      return;
    }
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
   * happens), and in the image editor and the drawpad, which undo their own drafts (they take the key first; in the
   * image editor's own boxes and sliders, nothing happens either).
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

  let about = $state(false);
  let shortcuts = $state(false);
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
    <button class="ghost" onclick={() => undo()} disabled={!history.canUndo} title={history.undoTitle} aria-label="Undo (Ctrl+Z)">↶</button>
    <button class="ghost" onclick={() => redo()} disabled={!history.canRedo} title={history.redoTitle} aria-label="Redo (Ctrl+Y)">↷</button>
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
    <button class="ghost" onclick={() => (settings = true)} title="Autosaves, how Save names files, and how much undo to remember">⚙ Settings</button>
    <button class="ghost" onclick={() => (shortcuts = true)} aria-label="Keyboard shortcuts" title="Keyboard shortcuts: the editor's keys and mouse moves (?)">⌨</button>
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
  {#if shortcuts}<ShortcutsDialog onclose={() => (shortcuts = false)} />{/if}
  {#if settings}<SettingsDialog onclose={() => (settings = false)} />{/if}
  {#if saveList}<OpenSaves saves={saveList} onpick={openSave} onbrowse={browse} onclose={() => (saveList = null)} />{/if}

  <div class="body">
    <nav aria-label="Editor">
      <div class="navlabel muted">Rounds</div>
      {#each game.rounds as round, i (round.id)}
        {#if renamingRound === round.id}
          <input
            class="tab-name"
            value={roundName(round, i)}
            aria-label="Round name"
            use:focusAll
            onkeydown={(e) => {
              if (e.key === 'Enter') renameRound(round, e.currentTarget.value);
              else if (e.key === 'Escape') renameRound(round, round.name);
            }}
            onblur={(e) => renamingRound === round.id && renameRound(round, e.currentTarget.value)}
          />
        {:else}
          <button
            class="round-tab"
            class:active={tab === i}
            class:drop-before={roundDrop?.id === round.id && !roundDrop.after}
            class:drop-after={roundDrop?.id === round.id && roundDrop.after}
            class:lifted={roundDrag === round.id}
            data-place="round:{round.id}"
            draggable="true"
            onclick={() => (tab = i)}
            ondblclick={() => (renamingRound = round.id)}
            onkeydown={(e) => roundTabKey(e, i)}
            oncontextmenu={(e) =>
              showMenu(e, [
                { heading: roundName(round, i) },
                { label: '✎ Rename', onclick: () => (renamingRound = round.id), keys: 'F2 or double-click' },
                { label: '▲ Move up', onclick: () => moveRound(i, i - 1), disabled: i === 0, keys: 'Alt+↑' },
                { label: '▼ Move down', onclick: () => moveRound(i, i + 1), disabled: i === game.rounds.length - 1, keys: 'Alt+↓' },
                { label: '⧉ Duplicate', onclick: () => duplicateRound(i), keys: 'Ctrl+D' },
                { sep: true },
                { label: '🗑 Delete round', danger: true, onclick: () => removeRound(i), keys: 'Delete' },
              ])}
            ondragstart={(e) => {
              roundDrag = round.id;
              e.dataTransfer?.setData('text/x-round', round.id);
              if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
            }}
            ondragover={(e) => roundOver(e, round)}
            ondrop={roundDropped}
            ondragend={() => ((roundDrag = null), (roundDrop = null))}
            title="{ROUND_MODES[round.mode].label} · drag to reorder, double-click to rename, right-click for more"
          >
            <span aria-hidden="true">{ROUND_MODES[round.mode].icon}</span> {roundName(round, i)}
          </button>
        {/if}
      {/each}
      <!-- Played after the rounds, when the game ends in a tie. -->
      <button class:active={tab === 'tiebreaker'} onclick={() => (tab = 'tiebreaker')} title="Played after the last round when players tie for the win">
        <span aria-hidden="true">🤝</span> Tiebreaker{game.tiebreaker ? '' : ' (off)'}
      </button>
      <button class="ghost" aria-haspopup="menu" onclick={addRoundMenu}>＋ Add round</button>
      <div class="navlabel muted">Game</div>
      <button class:active={tab === 'setup'} onclick={() => (tab = 'setup')}>⚙ Setup & Players</button>
      <button class:active={tab === 'theme'} onclick={() => (tab = 'theme')}>🎨 Theme</button>
      <button class:active={tab === 'tools'} onclick={() => (tab = 'tools')}>🎡 Wheels & Dice</button>
      <button class:active={tab === 'stats'} onclick={() => (tab = 'stats')} title="Player stats, items and shops (RPG rounds)">📊 Stats & Items</button>
      <button class:active={tab === 'media'} onclick={() => (tab = 'media')}>🖼 Media ({game.media.length})</button>
      <button class:active={tab === 'history'} onclick={() => (tab = 'history')} title="Every change to this game: go back to any point">
        🕘 History{history.entries.length ? ` (${history.entries.length})` : ''}
      </button>

      {#if checklist.length}
        <div class="problems">
          <div class="navlabel">Checklist</div>
          {#each checklist as line}
            <button class="problem {line.level}" onclick={() => goFix(line)} title={line.details.length > 1 ? line.details.join('\n') : undefined}>
              {line.level === 'warn' ? '⚠' : 'ℹ'} {line.text}
            </button>
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
          <ThemeEditor round={lastRound} />
        {:else if tab === 'history'}
          <HistoryPanel />
        {:else if game.rounds[tab]}
          {@const i = tab}
          {@const round = game.rounds[i]}
          {#key round.id}
            <RoundActions
              {round}
              index={i}
              count={game.rounds.length}
              onmove={(d) => moveRound(i, i + d)}
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
  <HistoryNotice quiet={tab === 'history'} />
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
    /* Two by two: the four modes never leave one alone on a row. */
    grid-template-columns: repeat(2, minmax(0, 1fr));
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
  /* At 720 px high the nav scrolls: its buttons keep their height. */
  nav > * {
    flex-shrink: 0;
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
  .round-tab.lifted {
    opacity: 0.5;
  }
  /* Where a dragged tab goes (a shadow: the tab clips what's inside it). */
  .round-tab.drop-before {
    box-shadow: 0 -3px 0 var(--accent);
  }
  .round-tab.drop-after {
    box-shadow: 0 3px 0 var(--accent);
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
    .first-round .modes {
      grid-template-columns: 1fr;
    }
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
