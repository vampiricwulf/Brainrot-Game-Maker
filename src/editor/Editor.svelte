<script lang="ts">
  import { focusRescue } from '../lib/focusrescue';
  import { inertWhile } from '../lib/modal';
  import { dropMenu, showMenu } from '../lib/menustate.svelte';
  import SettingsDialog from './SettingsDialog.svelte';
  import OpenSaves from './OpenSaves.svelte';
  import { listSaves, onOpenedFile, readSave, type SaveEntry } from '../lib/desktop.svelte';
  import { onDestroy, onMount, tick, untrack } from 'svelte';
  import { app, toast } from '../lib/app.svelte';
  import { announce } from '../lib/announce';
  import {
    gameProblem,
    isBoard,
    isBoardGame,
    isFinal,
    isRpg,
    isSlides,
    migrateGame,
    newFinalRound,
    newSlidesRound,
    newGame,
    newRound,
    roundName,
    slidesOfClue,
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
  import { copyName } from '../lib/listedit';
  import { newRpgRound } from '../lib/rpg';
  import { ROUND_MODES } from '../lib/modes';
  import { GAME_FILES, isGameFile, pickFile, safeFilename, saveGameJson } from '../lib/fileio';
  import { MAX_PACK_READ, readGameFile, savePack, storeFiles, type ReadGame } from '../lib/pack';
  import { exportStandaloneHtml } from '../lib/export';
  import { buzzerBase } from '../lib/remote.svelte';
  import { formatBytes, loadGameMedia, mediaUrls, pruneMedia } from '../lib/media.svelte';
  import { askToKeepStorage } from '../lib/persist';
  import SoundsPanel from './SoundsPanel.svelte';
  import RoundEditor from './RoundEditor.svelte';
  import FinalEditor from './FinalEditor.svelte';
  import SlidesEditor from './SlidesEditor.svelte';
  import TiebreakerEditor from './TiebreakerEditor.svelte';
  import StatsItemsEditor from './StatsItemsEditor.svelte';
  import RpgRoundEditor from './rpg/RpgRoundEditor.svelte';
  import BoardGameEditor from './boardgame/BoardGameEditor.svelte';
  import { newBoardGameRound } from '../lib/boardgame';
  import RoundActions from './RoundActions.svelte';
  import MediaLibrary from './MediaLibrary.svelte';
  import ToolsEditor from './tools/ToolsEditor.svelte';
  import CardsEditor from './CardsEditor.svelte';
  import ThemeEditor from './ThemeEditor.svelte';
  import { isThemeFile, parseThemeFile, ThemeError, type SharedTheme } from '../lib/themefile';
  import UpdateControls from './UpdateControls.svelte';
  import { update } from '../lib/update.svelte';
  import AboutDialog from './AboutDialog.svelte';
  import ShortcutsDialog from './ShortcutsDialog.svelte';
  import { inTauri, keptHere } from '../lib/platform';
  import { dataFolders } from '../lib/desktop.svelte';
  import { registerGameFonts } from '../lib/fonts';
  import { validate } from '../lib/validate';
  import { boardPlace, type ChecklistLine } from '../lib/checklist';
  import { followClueText } from '../lib/cluetext';
  import { arriving, commit, heldMedia, history, historyStarted, mark, onApplied, onApplying, redo, savedSinceChange, savePoint, step, undo, wholeHistory, type Origin } from '../lib/history.svelte';
  import { whileWriting } from '../lib/desktop.svelte';
  import { isCancel } from '../lib/fileio';
  import { goTo, take, type Place } from '../lib/nav.svelte';
  import { itemIdsIn } from '../lib/historyops';
  import { rpgRounds } from '../lib/rpg';
  import { createFieldTracker, undoKeyOf } from '../lib/undokeys';
  import HistoryNotice from './HistoryNotice.svelte';
  import HistoryPanel from './HistoryPanel.svelte';
  import FindDialog from './FindDialog.svelte';
  import ShrinkDialog from './ShrinkDialog.svelte';
  import JobPill from './JobPill.svelte';
  import { dialogIds, mediaDialog, openMediaDialog, openShrinkDialog, shrinkDialog } from '../lib/shrink/dialog.svelte';
  import MediaEditDialog from './MediaEditDialog.svelte';
  import ConvertDialog from './ConvertDialog.svelte';
  import ConvertNotice from './ConvertNotice.svelte';
  import { verdictOf } from '../lib/shrink/checks.svelte';
  import { jobAsk, stopAll } from '../lib/shrink/jobs.svelte';
  import { checkGame } from '../lib/shrink/checks.svelte';
  import { libraryMedia } from '../lib/phonecopies';
  import RoundImport from './RoundImport.svelte';
  import { clipboard } from '../lib/clipboard.svelte';
  import { bundleName, sameContent } from '../lib/roundcopy';
  import { addRoundItems, addSample, copyRoundOf, pasteRound, pickOtherGame } from './roundtools';
  import { HOSTING_GUIDE, openSite } from '../lib/sitelinks';

  /** `checklist`: worked out by the app a moment after changes stop (one line a round). */
  let {
    onplay,
    ontest,
    checklist,
    startRound = null,
    startFix = false,
    onfixed,
    startOpen = false,
    onopened,
  }: {
    /** ▶ Play, from the tab shown (a round's id, or 'theme', 'media'…: ◀ Back to editor opens it again). */
    onplay: (from?: string) => void;
    /** ▶ Test this round (its index). */
    ontest?: (index: number) => void;
    checklist: ChecklistLine[];
    /** The tab to open on: a round's id (back from testing it), or a tab such as 'theme' (back from ▶ Play). */
    startRound?: string | null;
    /** Go on to the first thing to fix on that tab, as its checklist line does (◀ Fix in editor); `onfixed` says it did. */
    startFix?: boolean;
    onfixed?: () => void;
    /** Open… right away (Game over › ▶ Next game…); `onopened` says it was. */
    startOpen?: boolean;
    onopened?: () => void;
  } = $props();

  // 'sounds' | 'tiebreaker' | 'media' | 'tools' | 'cards' | 'theme' | 'stats' | 'history' | round index
  type Tab = 'sounds' | 'tiebreaker' | 'media' | 'tools' | 'cards' | 'theme' | 'stats' | 'history' | number;
  const NAMED_TABS: readonly unknown[] = ['sounds', 'tiebreaker', 'media', 'tools', 'cards', 'theme', 'stats', 'history'];
  let tab = $state<Tab>(untrack(() => (NAMED_TABS.includes(startRound) ? (startRound as Tab) : Math.max(0, app.game.rounds.findIndex((r) => r.id === startRound)))));
  /** ▶ Play, saying the tab it was pressed on. */
  const play = () => onplay(typeof tab === 'number' ? game.rounds[tab]?.id : tab);
  const game = $derived(app.game);
  /** 📊 Stats & Items in the sidebar: once an RPG or board game round uses it, or it has anything in it (or it's open). */
  const showStats = $derived(
    tab === 'stats' || game.rounds.some((r) => r.mode === 'rpg' || r.mode === 'boardgame') || !!game.statFields?.length || !!game.items?.length || !!game.shops?.length,
  );
  /** The round tab last open (🎨 Theme previews it). */
  let lastRound = $state(0);
  $effect(() => {
    if (typeof tab === 'number') lastRound = tab;
  });
  // Again when a font's file arrives or changes (loaded after the game opened, found again, replaced).
  $effect(() => {
    for (const m of game.media) if (m.kind === 'font') void mediaUrls[m.id];
    registerGameFonts(game);
  });
  $effect(() => {
    document.title = game.title ? `${game.title} · Brainrot Games Maker` : 'Brainrot Games Maker';
  });
  // Whether each video and sound really plays in this browser, worked out as files arrive or change (🖼 Media and the
  // checklist say; nothing pops up for files already in a game).
  $effect(() => {
    for (const m of game.media) if (m.kind === 'video' || m.kind === 'audio') void mediaUrls[m.id];
    untrack(() => checkGame(game));
  });
  // A 🗜 copy being made belongs to its game in the editor: another game (New, Open…) stops it, and its window closes;
  // so does going to play (each asks first: mayReplace, and ▶ Play and Resume).
  $effect(() => {
    const id = game.id;
    untrack(() => {
      stopAll(id);
      if (shrinkDialog.open && !shrinkDialog.open.every((id) => game.media.some((m) => m.id === id))) shrinkDialog.open = null;
      if (mediaDialog.open && !dialogIds(mediaDialog.open).some((id) => game.media.some((m) => m.id === id))) mediaDialog.open = null;
    });
  });
  onDestroy(() => {
    stopAll(undefined, true);
    shrinkDialog.open = null;
    mediaDialog.open = null;
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
      const rpg = rpgRounds(game);
      const playing = rpg.filter((r) => r.world === place.world);
      const r = playing.find((x) => x === on) ?? playing[0];
      if (r) tab = game.rounds.indexOf(r);
      else {
        // (With no RPG round left to pick it in, says how to add one.)
        const how = rpg.length ? 'pick it in an RPG round' : 'add an RPG round (＋ Add round › 🗺 RPG) and pick it there';
        toast(`“${game.worlds?.find((w) => w.id === place.world)?.name}” isn't played by any round: ${how} to see it`);
      }
    } else if (place.tab === 'play') {
      // The players, the rules… are on the ▶ Play screen: Go there opens it, at that part.
      if (!game.rounds.length) return void toast('That’s on the ▶ Play screen: add a round first (＋ Add round)');
      app.pregameAt = place.part;
      play();
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

  /**
   * Add a round of `mode`. New rounds go before Final rounds at the end, so the Final stays last; the first slides round
   * is the game's introduction, so it goes first.
   */
  function addRound(mode: RoundMode): void {
    let at = game.rounds.length;
    if (mode !== 'final') while (at > 0 && isFinal(game.rounds[at - 1])) at--;
    const intro = mode === 'slides' && !game.rounds.some(isSlides);
    if (intro) at = 0;
    // A step of its own, so its name and fields typed right after are steps too: Ctrl+Z never takes the round with them.
    const round = step(null, () => {
      const round = newRoundOf(mode, at, intro);
      game.rounds.splice(at, 0, round);
      return round;
    });
    tab = at;
    // (Said, as it isn't where new rounds usually go.)
    if (intro && game.rounds.length > 1) toast('Added “Introduction” at the start of the game: drag its tab to move it');
    // The menu (or the card) that added it is gone: the focus goes to the new round's name, ready to type over.
    focusRoundName(round.id);
  }

  /** A blank round of `mode`, to go in at `at`. */
  function newRoundOf(mode: RoundMode, at: number, intro: boolean): Round {
    let round: Round;
    if (mode === 'slides') round = newSlidesRound(intro ? 'Introduction' : `Slides ${game.rounds.filter(isSlides).length + 1}`);
    else if (mode === 'rpg') round = newRpgRound(game, game.rounds.some(isRpg) ? `Adventure ${game.rounds.filter(isRpg).length + 1}` : 'Adventure');
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
    if (isBoard(round)) followClueText(game, round.categories.flatMap((c) => c.clues.flatMap(slidesOfClue)));
    else if (isFinal(round)) followClueText(game, [round.questionSlide, round.answerSlide]);
    else if (isSlides(round)) followClueText(game, [round.questionSlide]);
    return round;
  }

  /** The round modes, templates and rounds from elsewhere, under the button. The menu keeps every key: Delete or an arrow never reaches what's selected behind it. */
  function addRoundMenu(e: MouseEvent): void {
    dropMenu(e, addRoundItems(game, addRound, showNew, importRounds, showSample));
  }

  /** A round just added (a template, a pasted or imported round): shown, with its name ready to type over. */
  function showNew(at: number): void {
    tab = at;
    const id = game.rounds[at]?.id;
    if (id) focusRoundName(id);
  }

  /**
   * The sample game: shown, the focus on its first round's tab (its rounds are named and filled in, so nothing is
   * selected to type over by accident).
   */
  function showSample(): void {
    tab = addSample(game);
    focusRoundTab(game.rounds[tab]?.id);
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
    announce(`Round “${roundName(game.rounds[j], j)}” moved to ${j + 1} of ${game.rounds.length}`);
    if (shown) tab = game.rounds.indexOf(shown);
  }

  /** A copy right after the original, with fresh ids everywhere (so used tiles and saved sessions never mix them up). */
  function duplicateRound(i: number): void {
    const copy = reidRound(clone($state.snapshot(game.rounds[i]) as Round));
    copy.name = copyName(roundName(game.rounds[i], i), game.rounds.map(roundName));
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

  /**
   * The round tab being renamed in place. The tab takes the focus back (Enter, Esc, a click on nothing), but not from a
   * field or another tab clicked: the next key goes there, not to the tab, where Backspace would delete the round.
   */
  let renamingRound = $state<string | null>(null);
  function renameRound(round: Round, name: string, refocus = true): void {
    renamingRound = null;
    const n = name.trim();
    if (n && n !== roundName(round, game.rounds.indexOf(round))) step(null, () => (round.name = n));
    if (refocus) focusRoundTab(round.id);
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
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    // (On a narrow window the tabs sit in a row: the side is left or right, not above or below.)
    const row = el.parentElement ? getComputedStyle(el.parentElement).flexDirection.startsWith('row') : false;
    roundDrop = { id: round.id, after: row ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2 };
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
   * A checklist line: its tab, at the first thing to finish there (a board's first unfinished tile, an RPG's screen, a
   * board game's space, a Final's question or answer, a Slides round's empty slide has the focus).
   */
  function goFix(line: ChecklistLine): void {
    // The game's name: its box at the top, selected to type over.
    if (line.place?.tab === 'title') return void document.querySelector<HTMLInputElement>('[data-place="title"]')?.select();
    // Players are set on the ▶ Play screen.
    if (line.tab === 'play') return play();
    // No rounds yet: the keys go to the first card of the page that adds one (✨ Try a sample game).
    if (!game.rounds.length && typeof line.tab === 'number')
      return void tick().then(() => document.querySelector<HTMLElement>('.first-round .sample, .first-round .mode')?.focus());
    // (The line is worked out a moment after changes stop: its round is found by id, as rounds may have moved or gone
    // since, and a board's first tile to finish is looked up now.)
    const at = line.round ? game.rounds.findIndex((r) => r.id === line.round) : -1;
    if (line.round && at < 0) return;
    tab = line.round ? at : line.tab;
    const round = line.round ? game.rounds[at] : undefined;
    const place = (round && isBoard(round) && boardPlace(game, round)) || line.place;
    // A stat, an item or a shop in 📊 Stats & Items, a wheel or dice in 🎡 Wheels, Dice & Deals, a card in 🤫 Cards: it
    // flashes there.
    if (place?.tab === 'stats' || place?.tab === 'tools' || place?.tab === 'cards') return void goTo(place);
    if (!place || (place.tab === 'round' && !place.part) || (place.tab !== 'round' && place.tab !== 'world' && place.tab !== 'tiebreaker')) return;
    goTo(place);
    const part = place.tab === 'round' ? place.part : undefined;
    // A Final's side or one of its 🤫 cards, a Slides round's slide or the tiebreaker's side: its quick text box (the one
    // with nothing in it).
    if (part?.kind === 'final' || part?.kind === 'slides' || place.tab === 'tiebreaker') {
      const field =
        part?.kind === 'final' && part.side === 'card'
          ? 'card'
          : (part?.kind === 'final' && part.side === 'a') || (place.tab === 'tiebreaker' && place.side === 'a')
            ? 'a'
            : 'q';
      return void tick()
        .then(tick)
        .then(() => document.querySelector<HTMLElement>(`main [data-field="${field}"]`)?.focus());
    }
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

  // ◀ Fix in editor on the ▶ Play screen: on to the first thing to fix on the tab it opened, as its checklist line goes.
  onMount(() => {
    if (!untrack(() => startFix)) return;
    onfixed?.();
    const id = untrack(() => startRound);
    const line = untrack(() => checklist).find((l) => (typeof tab === 'number' ? l.round === id : !l.round && l.tab === tab));
    if (line) goFix(line);
  });

  // ---------- New, Open… and recent games ----------
  // The browser keeps one game at a time, so a game that New, Open… or a recent game replaces is kept in Recent games
  // (recent.ts) with its undo history: Open… lists them, and a note offers to reopen it at once. A game with changes
  // that aren't saved to a file asks first: Save first, Open anyway (it's kept in Recent games) or Cancel. A game with nothing in it asks nothing.

  /** The question being asked before this game is replaced (null: none). */
  let asking = $state<{ heading: string; title: string; go: string; answer: (c: ReplaceChoice) => void } | null>(null);
  /** The game just replaced, which "↶ Reopen previous game" brings back (null: no note), and kept games that made room. */
  let previous = $state<{ key: string; title: string; dropped?: string[] } | null>(null);

  /** Counts the questions asked, so an older one answered late doesn't close a newer one. */
  let asked = 0;
  /** "… anyway" was picked while told that storage is full (so the game is lost): replaceGame doesn't ask again. */
  let lossAccepted = false;

  /** May this game be replaced? Asks when it has changes not saved to a file (and saves it first if told to). */
  async function mayReplace(heading: string, go: string): Promise<boolean> {
    // Typing not yet made a step (it becomes one after a pause) counts as a change too.
    commit();
    lossAccepted = false;
    // A ✂ / 🗜 / 🔄 job on this game's files stops with it: asked first, as ▶ Play does. (Stopped once the game really
    // changes: a Cancel to the question below leaves it working.)
    const job = jobAsk('leave this game');
    if (job && !(await ask(job, { ok: 'Stop it', cancel: 'Keep working' }))) return false;
    // (A game New made has nothing in it: anything in it now is a change, even one made before its history started
    // a moment after it arrived.)
    if (!hasWork(game) || (savedSinceChange() && !(history.origin.kind === 'new' && !history.entries.length && !history.marks.length))) return true;
    // A question already up (a file the desktop app was given arrived meanwhile) is answered Cancel: this one replaces it.
    asking?.answer('cancel');
    const mine = ++asked;
    const choice = await new Promise<ReplaceChoice>((answer) => (asking = { heading, title: game.title.trim() || 'Untitled Game', go, answer }));
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
  /**
   * A game is being put in place of this one (it's being kept in Recent games first, a moment on a slow disk): the
   * editor takes no edits meanwhile, which would land on the game that's on its way out and be lost.
   */
  let replacing = $state(false);
  let openBtn = $state<HTMLButtonElement>();

  async function replaceGame(next: Game, origin: Omit<Origin, 'ts'>, history?: RecentGame['history'], spare?: string, read?: ReadGame): Promise<boolean> {
    replacing = true;
    try {
      return await replaceNow(next, origin, history, spare, read);
    } finally {
      replacing = false;
      // The button that started it (New, Open…, a recent game) was out of reach meanwhile, which drops the focus: it
      // goes to the game's first round, or the screen that adds one.
      void tick().then(() => {
        if (!document.activeElement || document.activeElement === document.body)
          (document.querySelector<HTMLElement>('nav [data-place^="round:"]') ?? document.querySelector<HTMLElement>('.first-round .sample, .first-round .mode'))?.focus();
      });
    }
  }

  async function replaceNow(next: Game, origin: Omit<Origin, 'ts'>, history?: RecentGame['history'], spare?: string, read?: ReadGame): Promise<boolean> {
    const old = game;
    let kept: { key: string; dropped: string[] } | null = null;
    if (hasWork(old)) {
      kept = await keepRecent($state.snapshot(old) as Game, wholeHistory(), spare);
      const title = old.title.trim() || 'Untitled Game';
      if (
        !kept &&
        !lossAccepted &&
        !(await ask(`“${title}” couldn't be kept in Recent games (${inTauri() ? 'storage on this PC' : "this browser's storage"} is full or blocked), so it would be lost. Replace it anyway?`, {
          ok: 'Replace it',
          danger: true,
        }))
      )
        return false;
    }
    if (read) await storeFiles(read);
    // Files the incoming history can bring back (a reopened game's: its Recent games entry, which held them, is forgotten
    // once it's open) and the ones this history holds (its steps leave a little later, see history.svelte.ts).
    const held = new Set([...heldMedia(history?.steps ?? []), ...heldMedia()]);
    const started = historyStarted();
    arriving(origin, history, !!history);
    app.game = next;
    // A new game has no rounds: tab 0 is the screen that adds the first one.
    tab = 0;
    previous = kept ? { key: kept.key, title: old.title.trim() || 'Untitled Game', dropped: kept.dropped } : null;
    await pruneMedia([app.game, app.playGame, app.resumable?.game], held);
    // The editor takes no edits until the game's history has started, a moment after it's on screen (App.svelte's
    // startWatch): one made before would count as part of the game as it arrived, so Open… or New wouldn't ask about it
    // and Ctrl+Z couldn't take it back. (Not for long, whatever happens.)
    await Promise.race([started, new Promise((go) => setTimeout(go, 5000))]);
    return true;
  }

  async function newFile(): Promise<void> {
    if ((await mayReplace('Start a new game?', 'Start new')) && (await replaceGame(newGame(), { kind: 'new', label: 'New game' })))
      announce(previous ? `Started a new game. “${previous.title}” is kept in Open… → Recent games` : 'Started a new game');
  }

  /** Bring back a game from Recent games, with its undo history (this game takes its place there). */
  async function reopen(entry: { key: string; title: string }): Promise<void> {
    recentList = null;
    const kept = await readRecent(entry.key);
    if (!kept) {
      previous = null;
      await forgetRecent(entry.key);
      return void tell(`“${entry.title}” is no longer kept ${keptHere()}.`);
    }
    if (!(await mayReplace(`Reopen “${entry.title}”?`, 'Reopen'))) return;
    // Brought up to date if an older version kept it; its history goes on only if that changed nothing but the order of
    // keys (see App.svelte). (Compared with a copy: migrateGame changes parts of the game it's given.)
    const plain = JSON.stringify(kept.draft);
    const g = migrateGame(kept.draft);
    const history = JSON.stringify(g) === plain || sameContent(g, JSON.parse(plain)) ? kept.history : undefined;
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
    const sure = await ask(
      `Delete “${e.title}” from Recent games? The copy ${keptHere()} goes for good, with its files and undo history. Game files you saved aren't touched.`,
      { ok: 'Delete', danger: true },
    );
    if (!sure) return;
    await forgetRecent(e.key);
    if (previous?.key === e.key) previous = null;
    const left = (recentKept = await listRecent());
    recentList = left.length ? left : null;
    // The last one gone: the saves in BrainrotSaves are still there to open.
    if (!left.length && desktopSaves.length) saveList = desktopSaves;
    // (Not the files this game's own undo history can bring back.)
    pruneMedia([app.game, app.playGame, app.resumable?.game], heldMedia());
  }

  async function browse(): Promise<void> {
    saveList = null;
    recentList = null;
    const file = await pickFile(GAME_FILES);
    if (file) await openFile(file);
  }

  async function openSave(s: SaveEntry): Promise<void> {
    saveList = null;
    // (Read into memory in one piece, like any game file: one too big for that fails, after a long wait.)
    if (s.size >= MAX_PACK_READ)
      return void tell(`“${s.name}” is ${(s.size / 1e9).toFixed(1)} GB: a pack over about 2 GB can't be opened (the file itself is likely fine). Open an older save or autosave of it instead.`);
    if (opening) return void toast(`Still opening “${opening}”…`);
    try {
      // A big one takes a while to read: the header says so meanwhile, as for any game file.
      opening = s.name;
      let file: File;
      try {
        file = await readSave(s);
      } finally {
        opening = null;
      }
      await openFile(file);
    } catch (e) {
      void tell((e as Error).message);
    }
  }

  /** A .brainrot-theme file opened or dropped here: the 🎨 Theme page, showing it first (Use in this game / Save to my themes). */
  let incomingTheme = $state.raw<SharedTheme | null>(null);
  async function openThemeFile(file: File): Promise<void> {
    try {
      incomingTheme = parseThemeFile(await file.text());
      tab = 'theme';
    } catch (e) {
      void tell(`“${file.name}” can’t be used as a theme: ${e instanceof ThemeError ? e.message : 'it can’t be read.'}`);
    }
  }

  /** The game file Open… is reading (a big pack takes a while: the header says so), or null. */
  let opening = $state<string | null>(null);

  async function openFile(file: File): Promise<void> {
    if (isThemeFile(file.name)) return openThemeFile(file);
    // A theme file whose name ends in .json (renamed, or saved so by a browser): its "format" comes first in it.
    if (/\.json$/i.test(file.name)) {
      const head = await file.slice(0, 400).text().catch(() => '');
      if (/"format"\s*:\s*"brainrot-theme"/.test(head)) return openThemeFile(file);
    }
    if (opening) return void toast(`Still opening “${opening}”…`);
    let read: ReadGame;
    let opened: Game;
    opening = file.name;
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
    } finally {
      opening = null;
    }
    if (!(await mayReplace(`Open “${file.name}”?`, 'Open'))) return;
    if (await replaceGame(opened, { kind: 'opened', label: `Opened “${opened.title}”` }, undefined, undefined, read)) toast(`Opened “${opened.title}”`);
  }

  // Desktop app: a game file the app was opened with ("Open with…") opens like Open….
  onMount(() => onOpenedFile(openFile));
  // Game over › ▶ Next game…: Open… (Recent games, or the file picker when there are none) for the stream's next game.
  onMount(() => {
    if (!untrack(() => startOpen)) return;
    onopened?.();
    void open();
  });

  /** A game file dropped anywhere no other part of the editor takes the drop opens, like Open…. */
  function ondrop(e: DragEvent): void {
    if (e.defaultPrevented || !e.dataTransfer?.files.length) return;
    e.preventDefault();
    const file = Array.from(e.dataTransfer.files).find((f) => isGameFile(f.name) || isThemeFile(f.name));
    if (file) openFile(file);
    else
      toast(
        'Drop pictures, videos and sounds on 🖼 Media, a slide, a tile or a Choose… button, and a sheet of clues (.csv, .tsv) on a board’s 📥 Import clues…. A game file (.brainrot, .json, exported .html) dropped here opens, and a theme file (.brainrot-theme) shows on 🎨 Theme.',
      );
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
    if (replacing) return;
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
    const open = [...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')];
    // The clue being edited is the game itself (not a question waiting on an answer): it saves from there too, what's
    // being typed first (a field commits as it's left), and the keys come back to it.
    if (open.length === 1 && open[0].matches('.modal.clue')) {
      if (saving || e.repeat) return;
      const at = document.activeElement instanceof HTMLElement && open[0].contains(document.activeElement) ? document.activeElement : null;
      at?.blur();
      void save().finally(() => at?.isConnected && at.focus({ preventScroll: true }));
    } else if (open.length) toast('Close this window first, then save (Ctrl+S)');
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

  /** The first Save (or Export as a web page) of an untitled game asks for its name, once. False when that was cancelled. */
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
      const { missing, where, file, bytes } = await whileWriting(() => savePack($state.snapshot(game), packProgress));
      // The file it was written as: the desktop app may have picked another name ("Game (2).brainrot").
      mark('saved', `Saved “${file}”`, point);
      // Written whole, but too big to be opened again: said now, while the game is still here to make smaller.
      const big =
        bytes >= MAX_PACK_READ
          ? `\n\nBut this pack is ${(bytes / 1e9).toFixed(1)} GB: a pack over about 2 GB can't be opened again. Move big videos to 🌐 links (or trim them) and Save again.`
          : '';
      if (missing.length || big) void tell(`${where}${big}${missing.length ? `\n\nThese media files were missing and weren't included:\n${missing.join('\n')}` : ''}`);
      else toast(where);
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
    if (!game.rounds.length) return void toast('Add a round first (＋ Add round): the exported file is for playing, and this game has no rounds yet.');
    if (!(await askName())) return;
    exporting = true;
    packPct = null;
    const point = savePoint();
    try {
      const r = await whileWriting(() => exportStandaloneHtml($state.snapshot(game), packProgress, buzzerBase()));
      if (r) {
        mark('exported', 'Exported HTML', point);
        const line =
          `Exported a playable HTML file (${formatBytes(r.size)}): ${r.where.replace(/^(Saved to |Saved |Download started: )/, '')}. Double-click it to play.` +
          (r.online ? ` ${r.online} item${r.online === 1 ? ' plays' : 's play'} from the internet, so it needs internet during the game.` : '');
        // (One message, as Save gives: a toast under the missing files' window was cut to one line.)
        if (r.missing.length) void tell(`${line}\n\nThese media files were missing and weren't included, so the game plays without them:\n${r.missing.join('\n')}`);
        else toast(line);
      }
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
      {
        label: '⬇ Export as a web page…',
        hint: 'One .html file that plays this game in any browser, without this app: to share it, or to play it on another computer. It shows the answers, so keep it to yourself until the show.',
        disabled: exporting,
        onclick: exportHtml,
      },
      { label: '{ } Export JSON', hint: 'Text only, no media. Handy for hand-editing.', onclick: exportJson },
      { sep: true },
      // (Autosaves and Save's file names are desktop app settings: a browser has neither.)
      {
        label: '⚙ Settings',
        hint: `${inTauri() ? 'Autosaves, how Save names files, how much undo to remember' : 'How much undo to remember'}, motion on stream, update checks, the phone buzzer server`,
        onclick: () => (settings = true),
      },
      { label: '⌨ Keyboard shortcuts', hint: "The editor's keys and mouse moves", keys: '?', onclick: () => (shortcuts = true) },
      { label: '📖 How to host (guide) ↗', hint: 'The guide on GitHub: hosting, phone buzzers, 🤫 cards, 🎭 deals, teams', onclick: () => openSite(HOSTING_GUIDE) },
      { label: 'ℹ About', hint: 'Version, links, and where your data is saved', onclick: () => (about = true) },
    ]);
  }

  async function exportJson(): Promise<void> {
    const point = savePoint();
    try {
      toast(await whileWriting(() => saveGameJson($state.snapshot(game))));
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
  // ⬆ Update failed during a game: why, now that the host is back here (see UpdateControls).
  onMount(() => {
    const why = update.failed;
    if (!why) return;
    update.failed = '';
    void tell(why);
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

<div class="editor" aria-busy={replacing || !!opening}>
  <header use:inertWhile={replacing}>
    <input class="title" bind:value={game.title} aria-label="Game title" data-place="title" />
    <button class="ghost" onclick={() => undo()} disabled={!history.canUndo} title={history.undoTitle} aria-label="Undo (Ctrl+Z)"><span aria-hidden="true">↶</span><span class="word">Undo</span></button>
    <button class="ghost" onclick={() => redo()} disabled={!history.canRedo} title={history.redoTitle} aria-label="Redo (Ctrl+Y)"><span aria-hidden="true">↷</span><span class="word">Redo</span></button>
    <button onclick={newFile} disabled={!!opening}><span aria-hidden="true">📄</span> New</button>
    <button onclick={open} disabled={!!opening} bind:this={openBtn}><span aria-hidden="true">📂</span> Open…</button>
    <button
      onclick={save}
      disabled={saving}
      title={`${inTauri() ? 'Save a .brainrot game pack (the game and all its media) into BrainrotSaves' : 'Download a .brainrot game pack (the game and all its media)'} · Ctrl+S`}
    >
      <span aria-hidden="true">💾</span> {saving ? `Saving…${packPct !== null ? ` ${packPct}%` : ''}` : 'Save'}
    </button>
    <span class="spacer"></span>
    {#if exporting}
      <span class="muted autosave" role="status">⬇ Exporting the web page…{packPct !== null ? ` ${packPct}%` : ''}</span>
    {/if}
    <JobPill />
    {#if opening}
      <span class="muted autosave" role="status">📂 Opening “{opening}”…</span>
    {/if}
    {#if app.storageOk}
      <span
        class="muted autosave saved"
        title={`Every change is autosaved ${keptHere()}.${app.fileAutosave ? ` Last autosave file: ${app.fileAutosave.path}` : ''}`}
      >
        ✓ Autosaved{app.fileAutosave ? ` · file ${new Date(app.fileAutosave.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}
      </span>
    {:else}
      <span class="autosave warn" title={`Changes can't be kept ${keptHere()} right now (storage is blocked or full). Use Save often.`}>
        ⚠ Autosave unavailable here: use Save
      </span>
    {/if}
    <button class="ghost" onclick={() => (finding = true)} aria-label="Find" title="Find clues, screens, spaces, items… anywhere in the game (Ctrl+F)"><span aria-hidden="true">🔍</span><span class="word">Find</span></button>
    <button class="ghost more" onclick={moreMenu} aria-haspopup="menu" aria-label="More: Export as a web page, Export JSON, Settings, Keyboard shortcuts, How to host (guide), About" title={'⬇ Export as a web page, { } Export JSON, ⚙ Settings, ⌨ Keyboard shortcuts, 📖 How to host (guide), ℹ About'}>⋯</button>
    <button class="primary play" onclick={play} disabled={!game.rounds.length || !!opening} title={game.rounds.length ? '' : 'Add a round first'}>▶ Play</button>
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
  {#if (update.status === 'available' || update.status === 'installing') && update.latest && update.latest.version !== update.skipped}
    {@const latest = update.latest}
    <div class="data-notice" role="status">
      <span>⬆ <b>Brainrot Games Maker {latest.version}</b> is out (this is {__APP_VERSION__}).</span>
      <UpdateControls release={latest} notice />
    </div>
  {/if}
  <ConvertNotice onshow={() => (tab = 'media')} />
  {#if about}<AboutDialog onclose={() => (about = false)} />{/if}
  {#if shortcuts}<ShortcutsDialog onclose={() => (shortcuts = false)} />{/if}
  {#if finding}<FindDialog onclose={() => (finding = false)} />{/if}
  {#if shrinkDialog.open}
    {#key shrinkDialog.open}<ShrinkDialog ids={shrinkDialog.open} onclose={() => (shrinkDialog.open = null)} />{/key}
  {/if}
  {#if mediaDialog.open?.mode === 'convert'}
    {#key mediaDialog.open}<ConvertDialog ids={mediaDialog.open.ids} onclose={() => (mediaDialog.open = null)} />{/key}
  {:else if mediaDialog.open?.mode === 'edit'}
    {#key mediaDialog.open}<MediaEditDialog id={mediaDialog.open.id} item={mediaDialog.open.item} onclose={() => (mediaDialog.open = null)} />{/key}
  {/if}
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
  {#if asking}<ReplaceDialog heading={asking.heading} title={asking.title} go={asking.go} full={!app.storageOk} onchoice={asking.answer} />{/if}
  {#if naming}<NameDialog onname={naming} />{/if}
  {#if previous}
    {@const prev = previous}
    <div class="data-notice" role="status">
      <span
        >“{prev.title}” was replaced. It's kept in Open… → Recent games.{#if prev.dropped?.length}{' '}{prev.dropped.length === 1 ? 'Removed the oldest kept game' : 'Removed the oldest kept games'}: {prev.dropped.map((t) => `“${t}”`).join(', ')}.{/if}</span
      >
      <button class="small" onclick={() => reopen(prev)}>↶ Reopen previous game</button>
      <button
        class="small ghost"
        onclick={() => {
          // (The focus goes on from here to Open…, where the game is kept, instead of dropping to the page.)
          previous = null;
          openBtn?.focus();
        }}
        aria-label="Dismiss">✕</button
      >
    </div>
  {/if}

  <svelte:boundary onerror={(e) => console.error('The editor failed to show this game', e)}>
  <div class="body" use:inertWhile={replacing || !!opening} use:focusRescue>
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
            onblur={(e) => renamingRound === round.id && renameRound(round, e.currentTarget.value, !e.relatedTarget)}
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
            onclick={(e) => {
              tab = i;
              // (Safari and Firefox on a Mac don't focus a clicked button: it takes the keys, not a tab renamed.)
              e.currentTarget.focus();
            }}
            ondblclick={() => (renamingRound = round.id)}
            onkeydown={(e) => roundTabKey(e, i)}
            oncontextmenu={(e) =>
              showMenu(e, [
                { heading: roundName(round, i) },
                { label: '✎ Rename', onclick: () => (renamingRound = round.id), keys: 'F2 or double-click' },
                { label: '▲ Move up', onclick: () => moveRound(i, i - 1), disabled: i === 0, keys: 'Alt+↑' },
                { label: '▼ Move down', onclick: () => moveRound(i, i + 1), disabled: i === game.rounds.length - 1, keys: 'Alt+↓' },
                ...(ontest ? [{ label: '▶ Test this round', onclick: () => ontest(i), hint: 'Play just this round (nothing kept)' }] : []),
                { label: '⧉ Duplicate', onclick: () => duplicateRound(i), keys: 'Ctrl+D' },
                { label: '📋 Copy round', onclick: () => copyRoundOf(game, i), hint: 'To paste in this game or another' },
                {
                  label: clipboard.round ? `📋 Paste round “${bundleName(clipboard.round)}” after it` : '📋 Paste round after it',
                  disabled: !clipboard.round,
                  onclick: () => {
                    const at = pasteRound(game, i);
                    if (at !== null) showNew(at);
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
      <!-- Played after the rounds, when the game ends in a tie (once there's a round for it to follow). Until it's
           turned on it's an optional extra, not a round: muted, with a ＋. -->
      {#if game.rounds.length || game.tiebreaker}
        <button
          class:active={tab === 'tiebreaker'}
          class:optional={!game.tiebreaker}
          aria-current={tab === 'tiebreaker' ? 'page' : undefined}
          onclick={() => (tab = 'tiebreaker')}
          title={game.tiebreaker ? 'Played after the last round when players tie for the win' : 'Optional: a clue played after the last round when players tie for the win (off)'}
        >
          {#if game.tiebreaker}<span aria-hidden="true">❓</span> Tiebreaker{:else}<span aria-hidden="true">＋</span> Tiebreaker <span class="opt">(optional)</span>{/if}
        </button>
      {/if}
      <button class="ghost" aria-haspopup="menu" onclick={addRoundMenu}>＋ Add round</button>
      <div class="navlabel muted">Game</div>
      <button class:active={tab === 'sounds'} aria-current={tab === 'sounds' ? 'page' : undefined} onclick={() => (tab = 'sounds')} title="The sounds played on stream (players and rules are set on the ▶ Play screen)">🔊 Sounds</button>
      <button class:active={tab === 'theme'} aria-current={tab === 'theme' ? 'page' : undefined} onclick={() => (tab = 'theme')}>🎨 Theme</button>
      <button
        class="wrap"
        class:active={tab === 'tools'}
        aria-current={tab === 'tools' ? 'page' : undefined}
        onclick={() => (tab = 'tools')}
        title="Wheels, custom dice and 🎭 deals (a secret part for each player)"
      >
        🎡 Wheels, Dice & Deals
      </button>
      <button
        class:active={tab === 'cards'}
        aria-current={tab === 'cards' ? 'page' : undefined}
        onclick={() => (tab = 'cards')}
        title="Private cards made before the show: during play, 🤫 Send a card… sends one to the players you choose, on their phones only, never on stream"
        >🤫 Cards{game.cards?.length ? ` (${game.cards.length})` : ''}</button
      >
      <!-- (Only RPG and board game rounds use stats and items: shown once there's one, or anything in it.) -->
      {#if showStats}
        <button class:active={tab === 'stats'} aria-current={tab === 'stats' ? 'page' : undefined} onclick={() => (tab = 'stats')} title="Player stats, items and shops (RPG and board game rounds)">📊 Stats & Items</button>
      {/if}
      <button class:active={tab === 'media'} aria-current={tab === 'media' ? 'page' : undefined} onclick={() => (tab = 'media')}>🖼 Media ({libraryMedia(game).length})</button>
      <button class:active={tab === 'history'} aria-current={tab === 'history' ? 'page' : undefined} onclick={() => (tab = 'history')} title="Every change to this game: go back to any point">
        🕘 History{history.entries.length ? ` (${history.entries.length})` : ''}
      </button>

      {#if checklist.length}
        <!-- Orange only when something needs fixing (notes alone are grey). -->
        <div class="problems" class:warn={checklist.some((l) => l.level === 'warn')}>
          <div class="navlabel">Checklist</div>
          {#each checklist as line}
            {#if line.convert?.length}
              <!-- (🔄 beside it, or ↻ for files phones can't open: never naming a file, as the line doesn't.) -->
              {@const repack = line.convert.every((id) => (v => typeof v === 'object' && v.is === 'plays')(verdictOf(id)))}
              <div class="problem-row">
                <button class="problem {line.level}" onclick={() => goFix(line)} title={line.details.length > 1 ? line.details.join('\n') : undefined}>
                  {line.level === 'warn' ? '⚠' : 'ℹ'} {line.text}
                </button>
                <button
                  class="small ghost"
                  data-checklist-convert
                  onclick={() => openMediaDialog({ mode: 'convert', ids: line.convert! })}
                  title={repack ? 'Repackage it so phones can open it (nothing lost)' : 'Convert them so they play in this browser'}
                  aria-label={repack ? 'Repackage it so phones can open it' : 'Convert them so they play in this browser'}>{repack ? '↻' : '🔄'}</button
                >
              </div>
            {:else if line.shrink?.length}
              <!-- (🗜 beside it: never naming the file, as the line doesn't.) -->
              <div class="problem-row">
                <button class="problem {line.level}" onclick={() => goFix(line)} title={line.details.length > 1 ? line.details.join('\n') : undefined}>
                  {line.level === 'warn' ? '⚠' : 'ℹ'} {line.text}
                </button>
                <button class="small ghost" data-checklist-shrink onclick={() => openShrinkDialog(line.shrink![0])} title="Make a smaller copy for phones" aria-label="Make a smaller copy for phones">🗜</button>
              </div>
            {:else}
              <button class="problem {line.level}" onclick={() => goFix(line)} title={line.details.length > 1 ? line.details.join('\n') : undefined}>
                {line.level === 'warn' ? '⚠' : 'ℹ'} {line.text}
              </button>
            {/if}
          {/each}
        </div>
      {:else}
        <div class="problems ok">✓ Ready to play</div>
      {/if}
    </nav>

    <main>
      <h1 class="sr-only">{game.title || 'Untitled game'}</h1>
      <!-- A game that's opened or new starts every editor afresh: no undo history carries over from the last one
           (another save of the same game has the same round ids). -->
      {#key game}
        {#if tab === 'sounds'}
          <SoundsPanel onplay={play} canPlay={game.rounds.length > 0} />
        {:else if tab === 'stats'}
          <StatsItemsEditor />
        {:else if tab === 'tiebreaker'}
          <TiebreakerEditor />
        {:else if tab === 'media'}
          <MediaLibrary />
        {:else if tab === 'tools'}
          <ToolsEditor />
        {:else if tab === 'cards'}
          <CardsEditor />
        {:else if tab === 'theme'}
          <ThemeEditor round={lastRound} bind:incoming={incomingTheme} />
        {:else if tab === 'history'}
          <HistoryPanel />
        {:else if game.rounds[tab]}
          {@const i = tab}
          {@const round = game.rounds[i]}
          {#key round.id}
            <!-- (A form round reads best at the pages' width; boards and maps fill the screen.) -->
            <div class:page={isFinal(round) || isSlides(round)}>
            <RoundActions
              {round}
              index={i}
              count={game.rounds.length}
              onmove={(d) => moveRound(i, i + d)}
              onduplicate={() => duplicateRound(i)}
              ondelete={() => removeRound(i)}
              ontest={ontest && (() => ontest(i))}
            />
            {#if isBoard(round)}
              <RoundEditor {round} />
            {:else if isFinal(round)}
              <FinalEditor {round} />
            {:else if isRpg(round)}
              <RpgRoundEditor {round} />
            {:else if isBoardGame(round)}
              <BoardGameEditor {round} />
            {:else if isSlides(round)}
              <SlidesEditor {round} />
            {/if}
            </div>
          {/key}
        {:else if !game.rounds.length}
          <div class="first-round">
            <h2>Add your first round</h2>
            <p class="muted">A game is a list of rounds, and each round picks how it plays. Add as many as you like, in any order.</p>
            {#if !inTauri()}
              <!-- The one thing a first-time browser user can lose: the game lives in this browser until it's saved as a file. -->
              {#if app.storageOk}
                <p class="muted small">Your game is kept in this browser as you work. <b>💾 Save</b> gives you it as a file: keep that to move it to another computer or browser, or to share it.</p>
              {:else}
                <p class="small warn">⚠ This browser isn't keeping your game (its storage is blocked or full): <b>💾 Save</b> it to a file before you close the tab.</p>
              {/if}
            {/if}
            <button class="sample" onclick={showSample}>
              <span class="icon" aria-hidden="true">✨</span>
              <b>Try a sample game</b>
              <span class="muted small">An introduction, a small board, an adventure, a board game and a Final, all filled in and ready to play</span>
            </button>
            <div class="modes">
              {#each Object.entries(ROUND_MODES) as [mode, m] (mode)}
                <button class="mode" onclick={() => addRound(mode as RoundMode)}>
                  <span class="icon" aria-hidden="true">{m.icon}</span>
                  <b>{m.label}</b>
                  <span class="muted small">{m.hint}</span>
                  {#if mode === 'board'}<span class="muted small">Clues in a spreadsheet already? <b>📥 Import clues…</b> on the board brings them in.</span>{/if}
                </button>
              {/each}
            </div>
          </div>
        {/if}
      {/key}
    </main>
  </div>
  {#snippet failed(error: unknown, reset: () => void)}
    <!-- A game the editor can't show (a file damaged in a way nothing caught): say so, with the way back, instead of a
         half-drawn screen. -->
    <div class="body broken" role="alert">
      <h2>This game can't be shown</h2>
      <p class="muted selectable">{error instanceof Error ? error.message : String(error)}</p>
      <div class="row">
        {#if previous}
          {@const prev = previous}
          <button class="primary" onclick={async () => (await reopen(prev), reset())}>↶ Back to “{prev.title}”</button>
        {/if}
        <button onclick={async () => (await newFile(), reset())}>Start a new game</button>
        <!-- (On the first round's tab, or 🔊 Sounds if that's the one that failed: one tab it can't show leaves the
             others in reach.) -->
        <button class="ghost" onclick={() => ((tab = tab === 0 ? 'sounds' : 0), reset())}>Try again</button>
      </div>
    </div>
  {/snippet}
  </svelte:boundary>
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
  .first-round h2 {
    font-size: 20px;
  }
  .first-round .modes {
    display: grid;
    /* Three, then two (wider): the five modes never leave one alone on a row. */
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 12px;
  }
  .first-round .modes > .mode {
    grid-column: span 2;
  }
  .first-round .modes > .mode:nth-child(n + 4) {
    grid-column: span 3;
  }
  .first-round .mode,
  .first-round .sample {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    padding: 16px;
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
    font-size: 16px;
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
  .autosave.warn {
    color: var(--warn);
  }
  .body {
    flex: 1;
    display: flex;
    min-height: 0;
  }
  .broken {
    flex-direction: column;
    gap: 12px;
    padding: 40px;
    align-items: flex-start;
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
  /* (A little less padding than other buttons: with three boards and 🤫 Cards the sidebar still fits at 720 px.) */
  nav > button {
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    padding-block: 5px;
  }
  /* (A long name goes on two lines where it doesn't fit, rather than lose its last word to "…".) */
  nav > button.wrap {
    white-space: normal;
  }
  nav > button.active {
    background: var(--accent-fill);
    border-color: var(--accent-fill);
    color: #fff;
  }
  /* The Tiebreaker before it's turned on: an optional extra, not a round. */
  nav > button.optional:not(.active) {
    background: transparent;
    border-style: dashed;
    color: var(--muted);
  }
  nav > button .opt {
    font-size: 12px;
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
    color: var(--muted);
  }
  .problems.warn {
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
  .problem-row {
    display: flex;
    align-items: flex-start;
    gap: 2px;
  }
  .problem-row > .small {
    flex-shrink: 0;
    margin-top: 4px;
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
    .first-round .modes > .mode,
    .first-round .modes > .mode:nth-child(n + 4) {
      grid-column: auto;
    }
    .body {
      flex-direction: column;
    }
    /* (At most 30% of the height, as at 200% zoom on a laptop: the list scrolls in its box, the rest is for editing.) */
    nav {
      width: auto;
      flex-direction: row;
      flex-wrap: wrap;
      border-right: none;
      border-bottom: 1px solid var(--border);
      max-height: 30vh;
    }
    .navlabel,
    .problems,
    .autosave {
      display: none;
    }
  }
</style>
