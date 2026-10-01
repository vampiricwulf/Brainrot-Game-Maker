<script lang="ts">
  import { dropMenu, showMenu } from '../lib/menustate.svelte';
  import SettingsDialog from './SettingsDialog.svelte';
  import OpenSaves from './OpenSaves.svelte';
  import { listSaves, onOpenedFile, readSave, type SaveEntry } from '../lib/desktop.svelte';
  import { onMount, tick, untrack } from 'svelte';
  import { app, toast } from '../lib/app.svelte';
  import {
    gameProblem,
    isBoard,
    isBoardGame,
    isFinal,
    isRpg,
    migrateGame,
    newFinalRound,
    newGame,
    newRound,
    roundName,
    type Game,
    type Round,
    type RoundMode,
  } from '../lib/model';
  import { forgetRecent, hasWork, keepRecent, listRecent, readRecent, type RecentEntry, type RecentGame, type ReplaceChoice } from '../lib/recent';
  import { newSession } from '../lib/session';
  import ReplaceDialog from './ReplaceDialog.svelte';
  import NameDialog from './NameDialog.svelte';
  import OpenGame from './OpenGame.svelte';
  import { ask, tell } from '../lib/ask.svelte';
  import { clone, reidRound } from '../lib/ops';
  import { newRpgRound } from '../lib/rpg';
  import { ROUND_MODES } from '../lib/modes';
  import { GAME_FILES, isGameFile, pickFile, safeFilename, saveGameJson } from '../lib/fileio';
  import { readGameFile, savePack, storeFiles, type ReadGame } from '../lib/pack';
  import { exportStandaloneHtml } from '../lib/export';
  import { buzzerBase } from '../lib/remote.svelte';
  import { formatBytes, loadGameMedia, pruneMedia } from '../lib/media.svelte';
  import { askToKeepStorage } from '../lib/persist';
  import SoundsPanel from './SoundsPanel.svelte';
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
  import { validate } from '../lib/validate';
  import { boardPlace, type ChecklistLine } from '../lib/checklist';
  import { followClueText } from '../lib/cluetext';
  import { arriving, commit, history, mark, onApplied, onApplying, redo, savedSinceChange, savePoint, step, undo, wholeHistory, type Origin } from '../lib/history.svelte';
  import { whileWriting } from '../lib/desktop.svelte';
  import { isCancel } from '../lib/fileio';
  import { goTo, take, type Place } from '../lib/nav.svelte';
  import { itemIdsIn } from '../lib/historyops';
  import { rpgRounds } from '../lib/rpg';
  import { createFieldTracker, undoKeyOf } from '../lib/undokeys';
  import HistoryNotice from './HistoryNotice.svelte';
  import HistoryPanel from './HistoryPanel.svelte';
  import FindDialog from './FindDialog.svelte';
  import RoundImport from './RoundImport.svelte';
  import { clipboard } from '../lib/clipboard.svelte';
  import { addRoundItems, addSample, copyRoundOf, pasteRound, pickOtherGame } from './roundtools';

  /** `checklist`: worked out by the app a moment after changes stop (one line a round). */
  let { onplay, checklist }: { onplay: () => void; checklist: ChecklistLine[] } = $props();

  // 'sounds' | 'tiebreaker' | 'media' | 'tools' | 'theme' | 'history' | round index
  let tab = $state<'sounds' | 'tiebreaker' | 'media' | 'tools' | 'theme' | 'stats' | 'history' | number>(0);
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
    } else if (place.tab === 'play') {
      // The players, the rules… are on the ▶ Play screen: Go there opens it, at that part.
      if (!game.rounds.length) return void toast('That’s on the ▶ Play screen: add a round first (＋ Add round)', 4000);
      app.pregameAt = place.part;
      onplay();
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
      // (Not to the ▶ Play screen: an undo never starts a game. The notice says where it was.)
      if (via !== 'list' && tab !== 'history' && place && place.tab !== 'play') goTo(place, itemIdsIn(e.ops));
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
    // The menu (or the card) that added it is gone: the focus goes to the new round's name, ready to type over.
    focusRoundName(round.id);
  }

  /** The round modes, templates and rounds from elsewhere, under the button. The menu keeps every key: Delete or an arrow never reaches what's selected behind it. */
  function addRoundMenu(e: MouseEvent): void {
    dropMenu(e, addRoundItems(game, addRound, showNew, importRounds));
  }

  /** A round just added (a template, a pasted or imported round, the sample game): shown, with its name ready to type over. */
  function showNew(at: number): void {
    tab = at;
    const id = game.rounds[at]?.id;
    if (id) focusRoundName(id);
  }

  /** Import rounds…: the other game, while its rounds are picked. */
  let importFrom = $state<Game | null>(null);
  async function importRounds(): Promise<void> {
    importFrom = await pickOtherGame();
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
    focusRoundTab(copy.id);
  }

  // ---------- Round tabs: drag to reorder, keys, rename in place ----------

  /** The shown round's name field, selected; its tab when the round has none. */
  const focusRoundName = (id: string) =>
    void tick().then(() => {
      const field = document.querySelector<HTMLInputElement>('main [data-round-name]');
      if (field) field.select();
      else focusRoundTab(id);
    });
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

  /**
   * A checklist line: its tab, at the first thing to finish there (a board's first unfinished tile, an RPG's screen or
   * a board game's space has the focus).
   */
  function goFix(line: ChecklistLine): void {
    // Players are set on the ▶ Play screen.
    if (line.tab === 'play') return onplay();
    tab = line.tab;
    // (The line is worked out a moment after changes stop: a board's first tile to finish is looked up now.)
    const round = typeof line.tab === 'number' ? game.rounds[line.tab] : undefined;
    const place = (round && isBoard(round) && boardPlace(game, round)) || line.place;
    // A stat or a shop in 📊 Stats & Items: it flashes there.
    if (place?.tab === 'stats') return void goTo(place);
    if (!place || (place.tab === 'round' && !place.part) || (place.tab !== 'round' && place.tab !== 'world')) return;
    goTo(place);
    const part = place.tab === 'round' ? place.part : undefined;
    const key =
      part?.kind === 'clue'
        ? `clue:${part.clue}`
        : part?.kind === 'category'
          ? `category:${part.category}`
          : part?.kind === 'space'
            ? `space:${part.space}`
            : place.tab === 'world' && place.screen && !place.inSlide
              ? `screen:${place.screen}`
              : null;
    if (!key) return;
    void tick()
      .then(tick)
      .then(() => {
        const el = document.querySelector<HTMLElement>(`[data-place="${key}"]`);
        (el?.matches('button, [tabindex]') ? el : el?.querySelector<HTMLElement>('textarea'))?.focus();
      });
  }

  // ---------- New, Open… and recent games ----------
  // The browser keeps one game at a time, so a game that New, Open… or a recent game replaces is kept in Recent games
  // (recent.ts) with its undo history: Open… lists them, and a note offers to reopen it at once. A game with changes
  // that aren't saved to a file asks first: Save first, Discard or Cancel. A game with nothing in it asks nothing.

  /** The question being asked before this game is replaced (null: none). */
  let asking = $state<{ heading: string; title: string; answer: (c: ReplaceChoice) => void } | null>(null);
  /** The game just replaced, which "↶ Reopen previous game" brings back (null: no note), and kept games that made room. */
  let previous = $state<{ key: string; title: string; dropped?: string[] } | null>(null);

  /** Counts the questions asked, so an older one answered late doesn't close a newer one. */
  let asked = 0;
  /** Discard was picked while told that storage is full (so the game is lost): replaceGame doesn't ask again. */
  let lossAccepted = false;

  /** May this game be replaced? Asks when it has changes not saved to a file (and saves it first if told to). */
  async function mayReplace(heading: string): Promise<boolean> {
    // Typing not yet made a step (it becomes one after a pause) counts as a change too.
    commit();
    lossAccepted = false;
    if (!hasWork(game) || savedSinceChange()) return true;
    // A question already up (a file the desktop app was given arrived meanwhile) is answered Cancel: this one replaces it.
    asking?.answer('cancel');
    const mine = ++asked;
    const choice = await new Promise<ReplaceChoice>((answer) => (asking = { heading, title: game.title.trim() || 'Untitled Game', answer }));
    if (mine === asked) asking = null;
    if (choice === 'save') return save();
    lossAccepted = choice === 'discard' && !app.storageOk;
    return choice === 'discard';
  }

  /**
   * Put `next` in place of this game, keeping this one in Recent games when it has anything in it. `history`: the
   * undo history it comes with (a recent game's); `spare`: the recent game being reopened; `read`: the file it was read
   * from, whose files are stored only now (so a game that isn't opened after all never changes the stored ones). False
   * when it didn't happen.
   */
  async function replaceGame(next: Game, origin: Omit<Origin, 'ts'>, history?: RecentGame['history'], spare?: string, read?: ReadGame): Promise<boolean> {
    const old = game;
    let kept: { key: string; dropped: string[] } | null = null;
    if (hasWork(old)) {
      kept = await keepRecent($state.snapshot(old) as Game, wholeHistory(), spare);
      const title = old.title.trim() || 'Untitled Game';
      if (
        !kept &&
        !lossAccepted &&
        !(await ask(`“${title}” couldn't be kept in Recent games (this browser's storage is full or blocked), so it would be lost. Replace it anyway?`, {
          ok: 'Replace it',
          cancel: 'Keep it',
          danger: true,
        }))
      )
        return false;
    }
    if (read) await storeFiles(read);
    arriving(origin, history, !!history);
    app.game = next;
    // A new game has no rounds: tab 0 is the screen that adds the first one.
    tab = 0;
    previous = kept ? { key: kept.key, title: old.title.trim() || 'Untitled Game', dropped: kept.dropped } : null;
    pruneMedia([app.game, app.playGame, app.resumable?.game]);
    return true;
  }

  async function newFile(): Promise<void> {
    if (await mayReplace('Start a new game?')) await replaceGame(newGame(), { kind: 'new', label: 'New game' });
  }

  /** Bring back a game from Recent games, with its undo history (this game takes its place there). */
  async function reopen(entry: { key: string; title: string }): Promise<void> {
    recentList = null;
    const kept = await readRecent(entry.key);
    if (!kept) {
      previous = null;
      await forgetRecent(entry.key);
      return void tell(`“${entry.title}” is no longer kept in this browser.`);
    }
    if (!(await mayReplace(`Reopen “${entry.title}”?`))) return;
    // Brought up to date if an older version kept it; its history goes on only if that changed nothing.
    const plain = JSON.stringify(kept.draft);
    const g = migrateGame(kept.draft);
    const history = JSON.stringify(g) === plain ? kept.history : undefined;
    if (!(await replaceGame(g, { kind: 'reopened', label: `Reopened “${g.title}”` }, history, entry.key))) return;
    await forgetRecent(entry.key);
    await loadGameMedia(g);
    toast(`Reopened “${g.title}”`);
  }

  /** Desktop app: the saves in BrainrotSaves, listed by Open… (null: the list is closed). */
  let saveList = $state<SaveEntry[] | null>(null);
  /** Open…'s Recent games (null: closed), and how many saves BrainrotSaves holds (desktop app). */
  let recentList = $state<RecentEntry[] | null>(null);
  let desktopSaves = $state<SaveEntry[]>([]);

  /** The recent games Open… found, for OpenSaves' way back to them. */
  let recentKept = $state<RecentEntry[]>([]);

  async function open(): Promise<void> {
    const recent = (recentKept = await listRecent());
    desktopSaves = inTauri() ? await listSaves() : [];
    if (recent.length) recentList = recent;
    else if (desktopSaves.length) saveList = desktopSaves;
    else await browse();
  }

  async function forget(e: RecentEntry): Promise<void> {
    const sure = await ask(`Forget “${e.title}”? It's removed from this browser with its files and undo history, and can't be brought back.`, {
      ok: 'Forget',
      cancel: 'Keep it',
      danger: true,
    });
    if (!sure) return;
    await forgetRecent(e.key);
    if (previous?.key === e.key) previous = null;
    const left = (recentKept = await listRecent());
    recentList = left.length ? left : null;
    pruneMedia([app.game, app.playGame, app.resumable?.game]);
  }

  async function browse(): Promise<void> {
    saveList = null;
    recentList = null;
    const file = await pickFile(GAME_FILES);
    if (file) await openFile(file);
  }

  async function openSave(s: SaveEntry): Promise<void> {
    saveList = null;
    try {
      await openFile(await readSave(s));
    } catch (e) {
      void tell((e as Error).message);
    }
  }

  async function openFile(file: File): Promise<void> {
    let read: ReadGame;
    let opened: Game;
    try {
      // Read and checked first: a file that isn't a game asks nothing. Its files are stored once it replaces this game.
      read = await readGameFile(file);
      opened = read.game;
      // A hand-edited file missing parts the editor needs would break the page: check it before it replaces this game
      // (what can be filled in was, see migrateGame).
      const problem = gameProblem(opened);
      if (problem) throw new Error(`“${file.name}” has a part the app can't use (was it edited by hand?), so it wasn't opened.\n\n${problem}`);
      try {
        validate(opened);
        newSession(opened);
      } catch (e) {
        throw new Error(`“${file.name}” is missing parts a game needs (was it edited by hand?), so it wasn't opened.\n\n${(e as Error).message}`);
      }
    } catch (e) {
      return void tell((e as Error).message);
    }
    if (!(await mayReplace(`Open “${file.name}”?`))) return;
    if (await replaceGame(opened, { kind: 'opened', label: `Opened “${opened.title}”` }, undefined, undefined, read)) toast(`Opened “${opened.title}”`);
  }

  // Desktop app: a game file the app was opened with ("Open with…") opens like Open….
  onMount(() => onOpenedFile(openFile));

  /** A game file dropped anywhere no other part of the editor takes the drop opens, like Open…. */
  function ondrop(e: DragEvent): void {
    if (e.defaultPrevented || !e.dataTransfer?.files.length) return;
    e.preventDefault();
    const file = Array.from(e.dataTransfer.files).find((f) => isGameFile(f.name));
    if (file) openFile(file);
    else toast('Drop pictures, videos and sounds on 🖼 Media, a slide, a tile or a Choose… button. A game file (.brainrot, .json, exported .html) dropped here opens.', 5000);
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
    // Ctrl+F: 🔍 Find, over the whole game (not in a window open over the editor).
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'f' && !e.defaultPrevented) {
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      e.preventDefault();
      finding = true;
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

  /** The name asked for on the first Save of an untitled game (null: not asking). */
  let naming = $state<((name: string | null) => void) | null>(null);
  /** Games already asked for a name (asked once: "Untitled Game" is a fine name if the host says so). */
  const named = new Set<string>();

  /** The first Save (or Export HTML) of an untitled game asks for its name, once. False when that was cancelled. */
  async function askName(): Promise<boolean> {
    if ((game.title.trim() && game.title.trim() !== 'Untitled Game') || named.has(game.id)) return true;
    const name = await new Promise<string | null>((answer) => (naming = answer));
    naming = null;
    if (name === null) return false;
    named.add(game.id);
    if (name !== game.title) step(`Named the game “${name}”`, () => (game.title = name));
    return true;
  }

  /** Save the game as a .brainrot pack. True when it was saved. */
  async function save(): Promise<boolean> {
    if (!(await askName())) return false;
    saving = true;
    packPct = null;
    askToKeepStorage();
    // Changes made while the file is written aren't in it: the save is marked where the game was when it started.
    const point = savePoint();
    try {
      const { missing, where, file } = await whileWriting(() => savePack($state.snapshot(game), packProgress));
      // The file it was written as: the desktop app may have picked another name ("Game (2).brainrot").
      mark('saved', `Saved “${file}”`, point);
      if (missing.length) void tell(`${where}\n\nThese media files were missing and weren't included:\n${missing.join('\n')}`);
      else toast(where, 5000);
      return true;
    } catch (e) {
      // (The save picker was closed.)
      if (!isCancel(e)) void tell('Save failed: ' + (e as Error).message);
      return false;
    } finally {
      saving = false;
    }
  }

  let exporting = $state(false);
  async function exportHtml(): Promise<void> {
    // A file with nothing to play: the player couldn't add a round there.
    if (!game.rounds.length) return void toast('Add a round first (＋ Add round): the exported file is for playing, and this game has no rounds yet.', 5000);
    if (!(await askName())) return;
    exporting = true;
    packPct = null;
    const point = savePoint();
    try {
      const r = await whileWriting(() => exportStandaloneHtml($state.snapshot(game), packProgress, buzzerBase()));
      if (r) {
        mark('exported', 'Exported HTML', point);
        toast(
          `Exported a playable HTML file (${formatBytes(r.size)}): ${r.where.replace(/^(Saved to |Saved |Download started: )/, '')}. Double-click it to play.` +
            (r.online ? ` ${r.online} item${r.online === 1 ? ' plays' : 's play'} from the internet, so it needs internet during the game.` : ''),
          r.online ? 8000 : 5000,
        );
      }
      if (r?.missing.length) void tell(`These media files were missing and weren't included:\n${r.missing.join('\n')}`);
    } catch (e) {
      if (!isCancel(e)) void tell('Export failed: ' + (e as Error).message);
    } finally {
      exporting = false;
    }
  }

  let about = $state(false);
  let shortcuts = $state(false);
  let finding = $state(false);
  let settings = $state(false);

  /** The header's ⋯ menu: what isn't needed every few minutes, so the header fits at 125% and 150% zoom. */
  function moreMenu(e: MouseEvent): void {
    dropMenu(e, [
      { label: '{ } Export JSON', hint: 'Text only, no media. Handy for hand-editing.', onclick: exportJson },
      { sep: true },
      { label: '⚙ Settings', hint: 'Autosaves, how Save names files, how much undo to remember, motion on stream', onclick: () => (settings = true) },
      { label: '⌨ Keyboard shortcuts', hint: "The editor's keys and mouse moves", keys: '?', onclick: () => (shortcuts = true) },
      { label: 'ℹ About', hint: 'Version, links, and where your data is saved', onclick: () => (about = true) },
    ]);
  }

  async function exportJson(): Promise<void> {
    const point = savePoint();
    try {
      toast(await whileWriting(() => saveGameJson($state.snapshot(game))), 5000);
      mark('exported', 'Exported JSON', point);
    } catch (e) {
      if (!isCancel(e)) void tell('Export failed: ' + (e as Error).message);
    }
  }
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
    <button class="ghost" onclick={() => undo()} disabled={!history.canUndo} title={history.undoTitle} aria-label="Undo (Ctrl+Z)"><span aria-hidden="true">↶</span><span class="word">Undo</span></button>
    <button class="ghost" onclick={() => redo()} disabled={!history.canRedo} title={history.redoTitle} aria-label="Redo (Ctrl+Y)"><span aria-hidden="true">↷</span><span class="word">Redo</span></button>
    <button onclick={newFile}><span aria-hidden="true">📄</span> New</button>
    <button onclick={open}><span aria-hidden="true">📂</span> Open…</button>
    <button
      onclick={save}
      disabled={saving}
      title={`${inTauri() ? 'Save a .brainrot game pack (the game and all its media) into BrainrotSaves' : 'Download a .brainrot game pack (the game and all its media)'} · Ctrl+S`}
    >
      <span aria-hidden="true">💾</span> {saving ? `Saving…${packPct !== null ? ` ${packPct}%` : ''}` : 'Save'}
    </button>
    <button onclick={exportHtml} disabled={exporting} title="One HTML file to host this game from, with everything inside (it shows the answers: keep it to yourself)">
      <span aria-hidden="true">⬇</span> {exporting ? `Exporting…${packPct !== null ? ` ${packPct}%` : ''}` : 'Export HTML'}
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
    <button class="ghost" onclick={() => (finding = true)} aria-label="Find" title="Find clues, screens, spaces, items… anywhere in the game (Ctrl+F)"><span aria-hidden="true">🔍</span><span class="word">Find</span></button>
    <button class="ghost more" onclick={moreMenu} aria-haspopup="menu" aria-label="More: Export JSON, Settings, Keyboard shortcuts, About" title="Export JSON, ⚙ Settings, ⌨ Keyboard shortcuts, ℹ About">⋯</button>
    <button class="primary play" onclick={onplay} disabled={!game.rounds.length} title={game.rounds.length ? '' : 'Add a round first'}>▶ Play</button>
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
  {#if finding}<FindDialog onclose={() => (finding = false)} />{/if}
  {#if importFrom}<RoundImport source={importFrom} onclose={() => (importFrom = null)} onadded={showNew} />{/if}
  {#if settings}<SettingsDialog onclose={() => (settings = false)} />{/if}
  {#if saveList}
    <OpenSaves
      saves={saveList}
      onpick={openSave}
      onbrowse={browse}
      onrecent={recentKept.length ? () => ((saveList = null), (recentList = recentKept)) : undefined}
      onclose={() => (saveList = null)}
    />
  {/if}
  {#if recentList}
    <OpenGame
      recent={recentList}
      saves={desktopSaves.length}
      onreopen={reopen}
      onforget={forget}
      onbrowse={browse}
      onsaves={() => ((recentList = null), (saveList = desktopSaves))}
      onclose={() => (recentList = null)}
    />
  {/if}
  {#if asking}<ReplaceDialog heading={asking.heading} title={asking.title} full={!app.storageOk} onchoice={asking.answer} />{/if}
  {#if naming}<NameDialog onname={naming} />{/if}
  {#if previous}
    {@const prev = previous}
    <div class="data-notice" role="status">
      <span
        >“{prev.title}” was replaced. It's kept in Open… → Recent games.{#if prev.dropped?.length}
          {prev.dropped.length === 1 ? 'Removed the oldest kept game' : 'Removed the oldest kept games'}: {prev.dropped.map((t) => `“${t}”`).join(', ')}.{/if}</span
      >
      <button class="small" onclick={() => reopen(prev)}>↶ Reopen previous game</button>
      <button class="small ghost" onclick={() => (previous = null)} aria-label="Dismiss">✕</button>
    </div>
  {/if}

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
            aria-current={tab === i ? 'page' : undefined}
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
                { label: '📋 Copy round', onclick: () => copyRoundOf(game, i), hint: 'To paste in this game or another' },
                {
                  label: clipboard.round ? `📋 Paste round “${roundName(clipboard.round.round)}” after it` : '📋 Paste round after it',
                  disabled: !clipboard.round,
                  onclick: () => {
                    const at = pasteRound(game, i);
                    if (at !== null) tab = at;
                  },
                },
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
      <button class:active={tab === 'tiebreaker'} aria-current={tab === 'tiebreaker' ? 'page' : undefined} onclick={() => (tab = 'tiebreaker')} title="Played after the last round when players tie for the win">
        <span aria-hidden="true">🤝</span> Tiebreaker{game.tiebreaker ? '' : ' (off)'}
      </button>
      <button class="ghost" aria-haspopup="menu" onclick={addRoundMenu}>＋ Add round</button>
      <div class="navlabel muted">Game</div>
      <button class:active={tab === 'sounds'} aria-current={tab === 'sounds' ? 'page' : undefined} onclick={() => (tab = 'sounds')} title="The sounds played on stream (players and rules are set on the ▶ Play screen)">🔊 Sounds</button>
      <button class:active={tab === 'theme'} aria-current={tab === 'theme' ? 'page' : undefined} onclick={() => (tab = 'theme')}>🎨 Theme</button>
      <button class:active={tab === 'tools'} aria-current={tab === 'tools' ? 'page' : undefined} onclick={() => (tab = 'tools')}>🎡 Wheels & Dice</button>
      <button class:active={tab === 'stats'} aria-current={tab === 'stats' ? 'page' : undefined} onclick={() => (tab = 'stats')} title="Player stats, items and shops (RPG rounds)">📊 Stats & Items</button>
      <button class:active={tab === 'media'} aria-current={tab === 'media' ? 'page' : undefined} onclick={() => (tab = 'media')}>🖼 Media ({game.media.length})</button>
      <button class:active={tab === 'history'} aria-current={tab === 'history' ? 'page' : undefined} onclick={() => (tab = 'history')} title="Every change to this game: go back to any point">
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
        {#if tab === 'sounds'}
          <SoundsPanel {onplay} canPlay={game.rounds.length > 0} />
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
            <button class="sample" onclick={() => showNew(addSample(game))}>
              <span class="icon" aria-hidden="true">✨</span>
              <b>Try a sample game</b>
              <span class="muted small">A small board, an adventure, a board game and a Final, all filled in and ready to play</span>
            </button>
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
  .first-round .mode,
  .first-round .sample {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    padding: 14px;
    text-align: left;
    white-space: normal;
  }
  .first-round .sample {
    border-color: var(--accent);
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
  /* Narrow windows and 125–150% zoom: the title and the autosave note give way, ▶ Play always shows. */
  header > * {
    flex-shrink: 0;
  }
  .title {
    font-size: 18px;
    font-weight: 600;
    width: min(340px, 28vw);
    min-width: 120px;
    flex-shrink: 1;
  }
  .autosave {
    font-size: 12px;
    min-width: 0;
    flex-shrink: 1;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .more {
    font-weight: 700;
    letter-spacing: 1px;
  }
  .word {
    margin-left: 0.3em;
  }
  /* Narrow (or zoomed) windows: ↶ and ↷ alone (their names stay for screen readers). */
  @media (max-width: 1100px) {
    .word {
      display: none;
    }
  }
  /* Very narrow (200% zoom on a laptop): the header wraps onto a second line instead of running off the side. */
  @media (max-width: 900px) {
    header {
      flex-wrap: wrap;
      row-gap: 6px;
    }
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
    background: var(--accent-fill);
    border-color: var(--accent-fill);
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
    font-size: 12px;
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
