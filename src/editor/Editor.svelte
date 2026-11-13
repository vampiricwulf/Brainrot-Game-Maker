<script lang="ts">
  import { focusRescue } from '../lib/focusrescue';
  import { inertWhile } from '../lib/modal';
  import { dropMenu, menuItem, menuOf, showMenu, type MenuEntry } from '../lib/menustate.svelte';
  import SettingsDialog from './SettingsDialog.svelte';
  import { listSaves, onOpenedFile, readSave, type SaveEntry } from '../lib/desktop.svelte';
  import { onDestroy, onMount, tick, untrack } from 'svelte';
  import { app, clearToast, toast } from '../lib/app.svelte';
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
  import { forgetRecent, hasWork, keepRecent, keptWhen, listRecent, readRecent, type RecentEntry, type RecentGame, type ReplaceChoice } from '../lib/recent';
  import { newSession } from '../lib/session';
  import ReplaceDialog from './ReplaceDialog.svelte';
  import NameDialog from './NameDialog.svelte';
  import OpenGame from './OpenGame.svelte';
  import { ask, tell } from '../lib/ask.svelte';
  import { cardFromAnswer, clone, reidRound } from '../lib/ops';
  import { copyName } from '../lib/listedit';
  import { newRpgRound } from '../lib/rpg';
  import { ROUND_MODES } from '../lib/modes';
  import { GAME_FILES, isGameFile, pickFile, safeFilename, saveGameJson } from '../lib/fileio';
  import { MAX_PACK_READ, readGameFile, savePack, storeFiles, type ReadGame } from '../lib/pack';
  import { exportedLine, exportStandaloneHtml } from '../lib/export';
  import { buzzerBase } from '../lib/remote.svelte';
  import { loadGameMedia, mediaUrls, pruneMedia } from '../lib/media.svelte';
  import { askToKeepStorage } from '../lib/persist';
  import SoundsPanel from './SoundsPanel.svelte';
  import RoundEditor from './RoundEditor.svelte';
  import FinalEditor from './FinalEditor.svelte';
  import SlidesEditor from './SlidesEditor.svelte';
  import TiebreakerEditor, { setTiebreaker } from './TiebreakerEditor.svelte';
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
  import KeysHelp from '../play/KeysHelp.svelte';
  import { inTauri, keptHere } from '../lib/platform';
  import { dataFolders } from '../lib/desktop.svelte';
  import { registerGameFonts } from '../lib/fonts';
  import { validate } from '../lib/validate';
  import { answerCardAt, boardPlace, type ChecklistLine } from '../lib/checklist';
  import { followClueText } from '../lib/cluetext';
  import { arriving, commit, heldMedia, history, historyStarted, mark, onApplied, onApplying, redo, savedSinceChange, savePoint, step, undo, wholeHistory, type Origin } from '../lib/history.svelte';
  import { whileWriting } from '../lib/desktop.svelte';
  import { isCancel } from '../lib/fileio';
  import { goTo, take, type Place } from '../lib/nav.svelte';
  import { itemIdsIn } from '../lib/historyops';
  import { rpgRounds } from '../lib/rpg';
  import { copyIsTheBrowsers, createFieldTracker, undoKeyOf } from '../lib/undokeys';
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
  import { addRoundItems, addSample, addTemplate, copyRoundOf, pasteRound, pickOtherGame } from './roundtools';
  import { firstTemplates } from '../lib/samples';
  import { cardToward, isArrow } from '../lib/gridkeys';
  import { HOSTING_GUIDE, openSite } from '../lib/sitelinks';
  import { showTipsAgain } from '../lib/tips';
  import { oneShot } from '../lib/oneshot';
  import { movedNew } from '../play/whatmoved.svelte';
  import { lastFileSave, saveState, untouchedSample } from '../lib/savestate';

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
    /**
     * Go on to the first thing to fix on that tab, as its checklist line does (◀ Fix in editor), or to this place in it
     * (a ▶ Play check's own Fix ›); `onfixed` says it did.
     */
    startFix?: boolean | Place;
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
  /** The header's ▶ Play: with no rounds yet it says to add one, the keys on ✨ Try a sample game (it isn't greyed). */
  function playClicked(): void {
    if (game.rounds.length) return play();
    toast('Add a round first: ✨ Try a sample game, or pick a kind of round');
    tab = 0;
    void tick().then(() => document.querySelector<HTMLElement>('.first-round .sample')?.focus());
  }
  const game = $derived(app.game);
  /**
   * 📊 Stats & Items is in use: an RPG or board game round plays with it, or it has anything in it. Until then the
   * sidebar lists it muted, "(optional)", as the Tiebreaker before it's turned on.
   */
  const statsUsed = $derived(
    game.rounds.some((r) => r.mode === 'rpg' || r.mode === 'boardgame') || !!game.statFields?.length || !!game.items?.length || !!game.shops?.length,
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
      const name = boards.length === 1 ? 'Double Jeopardy!' : boards.length ? `Jeopardy! ${boards.length + 1}` : 'Jeopardy!';
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

  /** The first screen's cards (✨ the sample, then a card a mode): the arrow keys go from one to another. */
  function cardKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || !isArrow(e.key)) return;
    const cards = [...document.querySelectorAll<HTMLElement>('.first-round .sample, .first-round .mode')];
    const to = cardToward(cards.map((c) => c.getBoundingClientRect()), cards.indexOf(e.currentTarget as HTMLElement), e.key);
    if (to < 0) return;
    e.preventDefault();
    cards[to].focus();
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

  /** A right-click on ↶ Undo or ↷ Redo opens 🕘 History (every step, to go back to any of them), as on the game screen. */
  function historyMenu(e: MouseEvent): void {
    e.preventDefault();
    tab = 'history';
  }

  /**
   * A round's menu, the same from its tab (right-click, Shift+F10) and its page's header (⋯, or a right-click on it), with
   * the keys its tab takes.
   */
  function roundMenu(i: number): MenuEntry[] {
    const round = game.rounds[i];
    return menuOf({
      heading: roundName(round, i),
      verbs: ontest ? [{ label: '▶ Test this round', onclick: () => ontest(i), hint: 'Play just this round (nothing kept)' }] : [],
      rename: menuItem.rename(() => (renamingRound = round.id)),
      duplicate: menuItem.duplicate(() => duplicateRound(i)),
      copy: menuItem.copy(() => copyRoundOf(game, i), { label: '📋 Copy round', hint: 'To paste in this game or another' }),
      paste: menuItem.paste(
        () => {
          const at = pasteRound(game, i);
          if (at !== null) showNew(at);
        },
        { label: clipboard.round ? `📋 Paste round “${bundleName(clipboard.round)}” after it` : '📋 Paste round after it', disabled: !clipboard.round },
      ),
      move: [menuItem.up(() => moveRound(i, i - 1), { disabled: i === 0 }), menuItem.down(() => moveRound(i, i + 1), { disabled: i === game.rounds.length - 1 })],
      delete: menuItem.delete('round', () => removeRound(i)),
    });
  }

  /**
   * ＋ Add tiebreaker (optional): turned on in one step, its page open with the keys in its question (its ☑ Include a
   * tiebreaker clue turns it off).
   */
  function addTiebreaker(): void {
    tab = 'tiebreaker';
    setTiebreaker(true);
    void tick()
      .then(tick)
      .then(() => document.querySelector<HTMLElement>('main [data-field="q"]')?.focus());
  }

  /**
   * The Tiebreaker's tab menu (a right-click on it, or Shift+F10): first what a click on it does (open it, or add it
   * while it's off), then, red at its end, turning it off (that takes its question, answer and notes away).
   */
  function tiebreakerMenu(): MenuEntry[] {
    const on = !!game.tiebreaker;
    return menuOf({
      heading: 'Tiebreaker clue',
      open: [on ? { label: '❓ Open it', onclick: () => (tab = 'tiebreaker') } : { label: '＋ Add tiebreaker', onclick: addTiebreaker }],
      delete: on
        ? { label: '🗑 Turn it off', onclick: () => setTiebreaker(false), hint: 'Takes the tiebreaker clue out of the game, its question, answer and notes too (Undo brings it back)' }
        : undefined,
    });
  }

  /** A checklist line's menu: go and fix it, or the fix it offers beside it (⧉ the answer on a card, 🗜 a smaller copy, 🔄 convert). */
  function checkMenu(line: ChecklistLine): MenuEntry[] {
    const repack = !!line.convert?.length && line.convert.every((id) => ((v) => typeof v === 'object' && v.is === 'plays')(verdictOf(id)));
    const same = line.answerCard && answerCardAt(game, line.answerCard);
    return menuOf({
      heading: line.text,
      open: [{ label: '◀ Fix it', onclick: () => goFix(line) }],
      verbs: [
        ...(same ? [{ label: '⧉ Same as the answer', hint: `A copy of the answer on ${same.name}`, onclick: () => sameAsAnswer(line) }] : []),
        ...(line.shrink?.length ? [{ label: '🗜 Make a smaller copy for phones…', onclick: () => openShrinkDialog(line.shrink![0]) }] : []),
        ...(line.convert?.length ? [{ label: repack ? '↻ Repackage it so phones can open it…' : '🔄 Convert them so they play here…', onclick: () => openMediaDialog({ mode: 'convert', ids: line.convert! }) }] : []),
      ],
    });
  }

  /**
   * On a round's tab: Alt+↑/↓ moves it, Delete / Backspace deletes it (with Undo at the bottom), F2 renames it,
   * Ctrl+D duplicates it, and Ctrl+C / Ctrl+V copy it and paste a copied round after it (the keys go to the new tab).
   * Text selected on the page still copies as text.
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
    } else if (mod && !e.altKey && !e.shiftKey && k === 'c' && !copyIsTheBrowsers(e.currentTarget, window.getSelection())) {
      e.preventDefault();
      copyRoundOf(game, i);
    } else if (mod && !e.altKey && !e.shiftKey && k === 'v') {
      e.preventDefault();
      if (!clipboard.round) return void toast('Copy a round first (its tab’s menu, or Ctrl+C on its tab)');
      const at = pasteRound(game, i);
      if (at === null) return;
      tab = at;
      focusRoundTab(game.rounds[at]?.id);
    }
  }

  /**
   * The round tab being renamed in place. The tab takes the focus back (Enter, Esc, a click on nothing), but not from a
   * field or another tab clicked: the next key goes there, not to the tab, where Backspace would delete the round.
   */
  let renamingRound = $state<string | null>(null);
  /** The pinned checklist's height: a button Tab reaches in the sidebar scrolls into view above it, not under it. */
  let checkH = $state(0);
  /** With no rounds yet the first screen says what to do: the checklist only has what else there is (a file that won't play). */
  const lines = $derived(game.rounds.length ? checklist : checklist.filter((l) => !l.starter));
  const warns = $derived(lines.filter((l) => l.level === 'warn').length);
  const notes = $derived(lines.length - warns);
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
   * A checklist line's ⧉: the answer copied onto the first empty 🤫 card it's about (a tile's or a Final's), one step
   * named as the card's own ⧉ names it. The keys stay on the checklist (the line goes there with its own click).
   */
  function sameAsAnswer(line: ChecklistLine): void {
    const at = line.answerCard;
    const hit = at && answerCardAt(game, at);
    if (!at || !hit) return;
    step(`Copied the answer onto ${hit.name}`, () => cardFromAnswer(hit.holder, hit.card), { place: at });
  }

  /**
   * A checklist line: its tab, at the first thing to finish there (a board's first unfinished tile, an RPG's screen, a
   * board game's space, a Final's question or answer, a Slides round's empty slide has the focus).
   */
  function goFix(line: ChecklistLine, exact?: Place): void {
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
    const place = exact ?? ((round && isBoard(round) && boardPlace(game, round)) || line.place);
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

  // ◀ Fix in editor on the ▶ Play screen: on to the first thing to fix on the tab it opened, as its checklist line goes
  // (a check's own Fix ›: to its place there).
  onMount(() => {
    const fix = untrack(() => startFix);
    if (!fix) return;
    onfixed?.();
    const id = untrack(() => startRound);
    const exact = typeof fix === 'object' ? fix : undefined;
    const line =
      untrack(() => checklist).find((l) => (typeof tab === 'number' ? l.round === id : !l.round && l.tab === tab)) ??
      (exact && id ? { text: '', level: 'warn', tab: typeof tab === 'number' ? tab : (tab as ChecklistLine['tab']), details: [], round: typeof tab === 'number' ? id : undefined } : undefined);
    if (line) goFix(line, exact);
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
    // (Nor the sample just as it came: it's kept in Recent games, and ↶ Reopen previous game brings it back.)
    if (!hasWork(game) || untouchedSample(history) || (savedSinceChange() && !(history.origin.kind === 'new' && !history.entries.length && !history.marks.length)))
      return true;
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
    // A toast about the game that was here ("Added a sample game: press ▶ Play…") goes with it.
    clearToast();
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
    openList = null;
    const kept = await readRecent(entry.key);
    if (!kept) {
      previous = null;
      await forgetRecent(entry.key);
      recentSeq++;
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
    recentSeq++;
    await loadGameMedia(g);
    toast(`Reopened “${g.title}”`);
  }

  /**
   * Open…'s one window (null: closed): Recent games, and in the desktop app the saves in BrainrotSaves. The header's
   * 📂 Open…, Ctrl+O, the first screen's 📂 Open a game… and Game over › ▶ Next game… all open it.
   */
  let openList = $state<{ recent: RecentEntry[]; saves: SaveEntry[] } | null>(null);

  /** The first screen's Recent games: the newest three (Open… lists them all), read again as games come and go. */
  let recentFirst = $state<RecentEntry[]>([]);
  let recentSeq = $state(0);
  $effect(() => {
    if (game.rounds.length) return;
    void recentSeq;
    void listRecent().then((l) => (recentFirst = l.slice(0, 3)));
  });

  async function open(): Promise<void> {
    const [recent, saves] = await Promise.all([listRecent(), inTauri() ? listSaves() : Promise.resolve([])]);
    openList = { recent, saves };
  }

  async function forget(e: RecentEntry): Promise<void> {
    const sure = await ask(
      `Delete “${e.title}” from Recent games? The copy ${keptHere()} goes for good, with its files and undo history. Game files you saved aren't touched.`,
      { ok: 'Delete', danger: true },
    );
    if (!sure) return;
    await forgetRecent(e.key);
    if (previous?.key === e.key) previous = null;
    recentSeq++;
    // (The window stays: the other games, the saves and Browse for a game file… are still there.)
    const recent = await listRecent();
    if (openList) openList = { ...openList, recent };
    // (Not the files this game's own undo history can bring back.)
    pruneMedia([app.game, app.playGame, app.resumable?.game], heldMedia());
  }

  async function browse(): Promise<void> {
    openList = null;
    const file = await pickFile(GAME_FILES);
    if (file) await openFile(file);
  }

  async function openSave(s: SaveEntry): Promise<void> {
    openList = null;
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
    // (A file dropped on the Open… window, or the desktop app's Open with…: the window goes, as for Browse….)
    openList = null;
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
        'Drop pictures, videos and sounds on 🖼 Media, a slide, a tile or a Choose… button, and a sheet of clues (.csv, .tsv) on a board’s 📥 Import clues…. A game file (.brainrot, .json, or a play-only web page’s .html) dropped here opens, and a theme file (.brainrot-theme) shows on 🎨 Theme.',
      );
  }

  let saving = $state(false);
  /**
   * 💾 Save's state: a dot when the game has work a file doesn't have yet (what New and Open… ask about), and its
   * tooltip says when it was last saved as a file (Save, or the desktop app's autosave file).
   */
  const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const fileState = $derived(
    saveState(
      {
        work: hasWork(game),
        saved: savedSinceChange(),
        sample: untouchedSample(history),
        lastAt: lastFileSave(history.marks),
      },
      clock,
    ),
  );
  /** Percent done while a pack is built (big games take a few seconds). */
  let packPct = $state<number | null>(null);
  const packProgress = (done: number, total: number) => (packPct = total ? Math.floor((done / total) * 100) : null);

  /**
   * Ctrl+S saves the game (in a browser it would save this app's page instead), except in a dialog: finish that first
   * (a picker, or the 🌐 Link box that stays open beside the slide, isn't one). Ctrl+Z / Ctrl+Y undo and redo.
   */
  function onkeydown(e: KeyboardEvent): void {
    // Ctrl+O: Open… (never the browser's own Open, which would leave the app), as the header's 📂 Open… does.
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'o' && !e.defaultPrevented) {
      e.preventDefault();
      if (replacing || e.repeat || openList) return;
      if (opening) return void toast(`Still opening “${opening}”…`);
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return void toast('Close this window first, then open a game (Ctrl+O)');
      void open();
      return;
    }
    if (replacing) return;
    const key = undoKeyOf(e);
    if (key) return undoKey(e, key);
    // ? (not typing, nothing open over the editor): the editor's keys.
    if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.defaultPrevented && !shortcuts) {
      if ((e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable]') || document.querySelector('[role="dialog"], [role="menu"]')) return;
      e.preventDefault();
      shortcuts = 'editor';
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
    const windows = [...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')];
    // The clue being edited is the game itself (not a question waiting on an answer): it saves from there too, what's
    // being typed first (a field commits as it's left), and the keys come back to it.
    if (windows.length === 1 && windows[0].matches('.modal.clue')) {
      if (saving || e.repeat) return;
      const at = document.activeElement instanceof HTMLElement && windows[0].contains(document.activeElement) ? document.activeElement : null;
      at?.blur();
      void save().finally(() => at?.isConnected && at.focus({ preventScroll: true }));
    } else if (windows.length) toast('Close this window first, then save (Ctrl+S)');
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

  /** The name asked for on the first Save (or export) of an untitled game (null: not asking). */
  let naming = $state<{ answer: (name: string | null) => void; exporting: boolean } | null>(null);
  /** Games already asked for a name (asked once: "Untitled Game" is a fine name if the host says so). */
  const named = new Set<string>();

  /**
   * The first Save (or Export as a web page: `exporting`) of an untitled game asks for its name, once. False when that
   * was cancelled.
   */
  async function askName(exporting = false): Promise<boolean> {
    if ((game.title.trim() && game.title.trim() !== 'Untitled Game') || named.has(game.id)) return true;
    const name = await new Promise<string | null>((answer) => (naming = { answer, exporting }));
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
    if (!game.rounds.length) return void toast('Add a round first (＋ Add round): a play-only web page is for playing, and this game has no rounds yet.');
    if (!(await askName(true))) return;
    exporting = true;
    packPct = null;
    const point = savePoint();
    try {
      const r = await whileWriting(() => exportStandaloneHtml($state.snapshot(game), packProgress, buzzerBase()));
      if (r) {
        mark('exported', 'Exported a play-only web page', point);
        const line = exportedLine(r.size, r.where, r.online);
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
  /** The keys window, open on the editor's keys or the game's (❔ Help › 🎮 Keys during the game). */
  let shortcuts = $state<false | 'editor' | 'game'>(false);
  let finding = $state(false);
  let settings = $state(false);

  /**
   * The header's ⋯ menu: what isn't needed every few minutes, so the header fits at 125% and 150% zoom. First the copies
   * of the game that aren't its .brainrot (each saying what it's for), then the rest.
   */
  function moreMenu(e: MouseEvent): void {
    dropMenu(e, [
      { heading: 'Save a copy as' },
      {
        label: '⬇ Export as a web page… (play-only)',
        detail: 'Plays without this app. Shows the answers: keep it to yourself.',
        disabled: exporting,
        onclick: exportHtml,
      },
      { label: '{ } Export JSON (text only, no pictures)', detail: 'For editing by hand.', onclick: exportJson },
      { sep: true },
      // (Autosaves and Save's file names are desktop app settings: a browser has neither.)
      {
        label: '⚙ Settings',
        hint: `${inTauri() ? 'Autosaves, how Save names files, how much undo to remember' : 'How much undo to remember'}, motion on stream, update checks, the phone buzzer server`,
        onclick: () => (settings = true),
      },
      { label: '⌨ Keyboard shortcuts', hint: "The editor's keys and mouse moves, and the host's during the game", keys: '?', onclick: () => (shortcuts = 'editor') },
      { label: '📖 How to host (guide) ↗', hint: 'The guide on GitHub: hosting, phone buzzers, 🤫 cards, 🎭 deals, teams', onclick: () => openSite(HOSTING_GUIDE) },
      { label: 'ℹ About', hint: 'Version, updates, links, and where your data is saved', onclick: () => (about = true) },
    ]);
  }

  /**
   * ❔ Help, in the header: where to find the keys, the tips and the guide (⋯ keeps them too, where they always were).
   */
  function helpMenu(e: MouseEvent): void {
    dropMenu(e, [
      {
        label: '⌨ Keyboard shortcuts',
        hint: `The editor's keys and mouse moves, with a filter${movedNew('editor') ? ' · 🆕 What moved in this version' : ''}`,
        keys: '?',
        onclick: () => (shortcuts = 'editor'),
      },
      { label: '🎮 Keys during the game', hint: "The host's keys while a game is played, round by round", onclick: () => (shortcuts = 'game') },
      { label: '💡 Show all tips again', hint: 'The 💡 Tips folds open again, and the game screen’s first-time notes show again', onclick: tipsAgain },
      { label: '📖 How to host (guide) ↗', hint: 'The guide on GitHub: hosting, phone buzzers, 🤫 cards, 🎭 deals, teams', onclick: () => openSite(HOSTING_GUIDE) },
      { label: 'ℹ About', hint: 'Version, updates, links, and where your data is saved', onclick: () => (about = true) },
    ]);
  }

  /** 💡 Show all tips again: the ones on this page open now, the rest the next time their page comes up. */
  function tipsAgain(): void {
    showTipsAgain();
    for (const d of document.querySelectorAll<HTMLDetailsElement>('main details.tips')) d.open = true;
    toast('💡 Every tip shows again, as the first time');
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
  // The first start after the rename moved Jeopardy Builder's folders over: say so once. (That the desktop app keeps
  // its data in folders on this PC is a line on the first screen, and ℹ About shows which.)
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
</script>

<svelte:window {onkeydown} onfocusincapture={fields.focusin} oninputcapture={fields.input} />
<svelte:document {ondrop} />

<div class="editor" aria-busy={replacing || !!opening}>
  <header use:inertWhile={replacing}>
    <input class="title" bind:value={game.title} aria-label="Game title" placeholder="Untitled Game" title="Game title: shows on stream and names the saved file" data-place="title" />
    <!-- (Three groups, apart: the title, undo and redo, the game's file.) -->
    <!-- Right-click either one for 🕘 History, as on the game screen. -->
    <button class="ghost group" onclick={() => undo()} oncontextmenu={historyMenu} disabled={!history.canUndo} title={history.undoTitle} aria-label="Undo (Ctrl+Z)"><span aria-hidden="true">↶</span><span class="word">Undo</span></button>
    <button class="ghost" onclick={() => redo()} oncontextmenu={historyMenu} disabled={!history.canRedo} title={history.redoTitle} aria-label="Redo (Ctrl+Y)"><span aria-hidden="true">↷</span><span class="word">Redo</span></button>
    <button class="group" onclick={newFile} disabled={!!opening}><span aria-hidden="true">📄</span> New</button>
    <button onclick={open} disabled={!!opening} bind:this={openBtn} title="Recent games{inTauri() ? ', your saves' : ''} or a game file · Ctrl+O"><span aria-hidden="true">📂</span> Open…</button>
    <!-- (Its name stays Save; the dot and its words say how the file stands, as its tooltip does.) -->
    <button
      class="save-file"
      onclick={save}
      disabled={saving}
      data-changed={fileState.changed || undefined}
      title={`${fileState.said ? `${fileState.said} · Ctrl+S\n` : ''}${inTauri() ? 'Save a .brainrot game pack (the game and all its media) into BrainrotSaves' : 'Download a .brainrot game pack (the game and all its media)'}${fileState.said ? '' : ' · Ctrl+S'}`}
    >
      <span aria-hidden="true">💾</span> {saving ? `Saving…${packPct !== null ? ` ${packPct}%` : ''}` : 'Save'}{#if fileState.changed && !saving}<span class="dot" aria-hidden="true">{' '}•<span class="unsaved">{' '}not saved as a file</span></span>{/if}
    </button>
    <span class="spacer"></span>
    {#if exporting}
      <span class="muted autosave" role="status">⬇ Exporting the play-only web page…{packPct !== null ? ` ${packPct}%` : ''}</span>
    {/if}
    <JobPill />
    {#if opening}
      <span class="muted autosave" role="status">📂 Opening “{opening}”…</span>
    {/if}
    {#if app.storageOk}
      <!-- (In a browser it says it isn't a file: the game is kept in the browser until 💾 Save makes one.) -->
      <span
        class="muted autosave saved"
        title={`Every change is autosaved ${keptHere()}.${app.fileAutosave ? ` Last autosave file: ${app.fileAutosave.path}` : inTauri() ? '' : ' 💾 Save makes a file of it, to keep, move or share.'}`}
      >
        {#if inTauri()}✓ Autosaved{app.fileAutosave ? ` · file ${clock(app.fileAutosave.at)}` : ''}{:else}✓ Kept in this browser<span class="wide">{' '}(💾 Save makes a file)</span>{/if}
      </span>
    {:else}
      <span class="autosave warn" title={`Changes can't be kept ${keptHere()} right now (storage is blocked or full). Use Save often.`}>
        ⚠ Autosave unavailable here: use Save
      </span>
    {/if}
    <button class="ghost" onclick={() => (finding = true)} aria-label="Find" title="Find clues, screens, spaces, items… anywhere in the game (Ctrl+F)"><span aria-hidden="true">🔍</span><span class="word">Find</span></button>
    <button
      class="ghost help"
      onclick={helpMenu}
      aria-haspopup="menu"
      aria-label="Help: Keyboard shortcuts, Keys during the game, Show all tips again, How to host (guide), About"
      title="⌨ Keyboard shortcuts (?), 🎮 Keys during the game, 💡 Show all tips again, 📖 How to host (guide), ℹ About"
      ><span aria-hidden="true">❔</span><span class="word">Help</span>{#if movedNew('editor')}<span class="newdot" data-moved-dot aria-hidden="true"></span>{/if}</button
    >
    <button class="ghost more" onclick={moreMenu} aria-haspopup="menu" aria-label="More: Export as a web page, Export JSON, Settings, Keyboard shortcuts, How to host (guide), About" title={'⬇ Export as a web page, { } Export JSON, ⚙ Settings, ⌨ Keyboard shortcuts, 📖 How to host (guide), ℹ About'}>⋯</button>
    <button class="primary play" use:oneShot onclick={playClicked} disabled={!!opening} title={game.rounds.length ? '' : 'Add a round first'}>▶ Play</button>
  </header>
  <!-- The notices under the header look and close alike: an icon and words, the actions (the main one first), then ✕
       at the far right, its tooltip saying what it does (its name is the word it replaced: Got it, Not now…). -->
  {#if movedNotice}
    <div class="data-notice" role="status">
      <span>📁 Jeopardy Builder is now <b>Brainrot Games Maker</b>. Your games and media were moved to its new folder.</span>
      <button class="small" onclick={() => ((about = true), (movedNotice = false))}>ℹ See where</button>
      <button class="small ghost notice-x" onclick={() => (movedNotice = false)} aria-label="Got it" title="Got it: don't show this again">✕</button>
    </div>
  {/if}
  {#if (update.status === 'available' || update.status === 'installing') && update.latest && update.latest.version !== update.skipped}
    {@const latest = update.latest}
    <!-- (Once its download is open, the notice says what to do with it instead: see UpdateControls.) -->
    <div class="data-notice" role="status">
      <span>⬆{#if update.downloading !== latest.version}{' '}<b>Brainrot Games Maker {latest.version}</b> is out (this is {__APP_VERSION__}).{/if}</span>
      <UpdateControls release={latest} notice />
    </div>
  {/if}
  <ConvertNotice onshow={() => (tab = 'media')} />
  {#if about}<AboutDialog onclose={() => (about = false)} />{/if}
  {#if shortcuts}<KeysHelp from="editor" start={shortcuts} onclose={() => (shortcuts = false)} />{/if}
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
  {#if openList}
    <OpenGame
      recent={openList.recent}
      saves={openList.saves}
      desktop={inTauri()}
      onreopen={reopen}
      onforget={forget}
      onpick={openSave}
      onbrowse={browse}
      onclose={() => (openList = null)}
    />
  {/if}
  {#if asking}<ReplaceDialog heading={asking.heading} title={asking.title} go={asking.go} full={!app.storageOk} onchoice={asking.answer} />{/if}
  {#if naming}<NameDialog onname={naming.answer} exporting={naming.exporting} />{/if}
  {#if previous}
    {@const prev = previous}
    <div class="data-notice" role="status">
      <span
        >📂 “{prev.title}” was replaced. It's kept in Open… → Recent games.{#if prev.dropped?.length}{' '}{prev.dropped.length === 1 ? 'Removed the oldest kept game' : 'Removed the oldest kept games'}: {prev.dropped.map((t) => `“${t}”`).join(', ')}.{/if}</span
      >
      <button class="small" onclick={() => reopen(prev)}>↶ Reopen previous game</button>
      <button
        class="small ghost notice-x"
        onclick={() => {
          // (The focus goes on from here to Open…, where the game is kept, instead of dropping to the page.)
          previous = null;
          openBtn?.focus();
        }}
        aria-label="Hide"
        title="Hide (it stays in Open… → Recent games)">✕</button
      >
    </div>
  {/if}

  <svelte:boundary onerror={(e) => console.error('The editor failed to show this game', e)}>
  <div class="body" use:inertWhile={replacing || !!opening} use:focusRescue>
    <nav aria-label="Editor" style:scroll-padding-bottom="{checkH}px">
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
            oncontextmenu={(e) => showMenu(e, roundMenu(i))}
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
           turned on it's an optional extra, not a round: muted, ＋ Add tiebreaker, which turns it on in one click. -->
      {#if game.rounds.length || game.tiebreaker}
        <button
          class:active={tab === 'tiebreaker'}
          class:optional={!game.tiebreaker}
          aria-current={tab === 'tiebreaker' ? 'page' : undefined}
          onclick={() => (game.tiebreaker ? (tab = 'tiebreaker') : addTiebreaker())}
          oncontextmenu={(e) => showMenu(e, tiebreakerMenu())}
          title={game.tiebreaker
            ? 'Played after the last round when players tie for the win'
            : 'Optional: adds a clue played after the last round when players tie for the win (☑ Include a tiebreaker clue on its page turns it off; Ctrl+Z takes it back)'}
        >
          {#if game.tiebreaker}<span aria-hidden="true">❓</span> Tiebreaker{:else}<span aria-hidden="true">＋</span> Add tiebreaker <span class="opt">(optional)</span>{/if}
        </button>
      {/if}
      <button class="ghost" aria-haspopup="menu" onclick={addRoundMenu}>＋ Add round</button>
      <div class="navlabel muted">Game</div>
      <!-- The players, ⚖ Game rules and phone buzzers are set on the ▶ Play screen, before the game: this opens it at 👥
           Players (nothing starts until Start game ▶). With no rounds yet it says to add one first. -->
      <button
        class="wrap"
        data-nav="players"
        onclick={() => show({ tab: 'play', part: 'players' })}
        title={game.rounds.length ? 'Set before the show, on the ▶ Play screen. The game doesn’t start until you press Start game ▶.' : 'Add a round first'}
        >👥 Players & rules ▶{game.players.length ? ` (${game.players.length})` : ''}</button
      >
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
      <!-- (Only RPG and board game rounds use stats and items: muted, "(optional)", until one does or it has anything.) -->
      <button
        class:active={tab === 'stats'}
        class:optional={!statsUsed}
        aria-current={tab === 'stats' ? 'page' : undefined}
        onclick={() => (tab = 'stats')}
        title={statsUsed ? 'Player stats, items and shops (RPG and board game rounds)' : 'Optional: player stats, items and shops, for RPG and board game rounds'}
        >📊 Stats & Items{#if !statsUsed}{' '}<span class="opt">(optional)</span>{/if}</button
      >
      <button class:active={tab === 'media'} aria-current={tab === 'media' ? 'page' : undefined} onclick={() => (tab = 'media')}>🖼 Media ({libraryMedia(game).length})</button>
      <button class:active={tab === 'history'} aria-current={tab === 'history' ? 'page' : undefined} onclick={() => (tab = 'history')} title="Every change to this game: go back to any point">
        🕘 History{history.entries.length ? ` (${history.entries.length})` : ''}
      </button>

      <!-- Pinned to the bottom of the sidebar, its heading always in view however many rounds there are (a long list
           scrolls in its own box). None for a new game with no rounds: the page itself says what to do. Orange only when
           something needs fixing (notes alone are grey). -->
      {#if game.rounds.length || lines.length}
        <div class="problems" class:warn={warns > 0} class:ok={!lines.length} bind:offsetHeight={checkH}>
          {#if lines.length}
            <div class="navlabel">Checklist{#if warns}{' · '}⚠ {warns}{/if}{#if notes}{' · '}ℹ {notes}{/if}</div>
            <div class="problem-list">
              {#each lines as line}
                <!-- (The fix it offers beside it: ⧉ for an empty card, 🔄 or ↻ to convert, 🗜 a smaller copy; never naming a
                     file, as the line doesn't.) -->
                {@const repack = !!line.convert?.length && line.convert.every((id) => (v => typeof v === 'object' && v.is === 'plays')(verdictOf(id)))}
                {@const same = line.answerCard && answerCardAt(game, line.answerCard)}
                <div class="problem-row">
                  <button class="problem {line.level}" onclick={() => goFix(line)} oncontextmenu={(e) => showMenu(e, checkMenu(line))} title={line.details.length > 1 ? line.details.join('\n') : undefined}>
                    {line.level === 'warn' ? '⚠' : 'ℹ'} {line.text}
                  </button>
                  {#if same}
                    <button
                      class="small ghost"
                      data-checklist-same
                      onclick={() => sameAsAnswer(line)}
                      title="⧉ Same as the answer: a copy of the answer on {same.name}"
                      aria-label="Same as the answer: a copy of the answer on {same.name}">⧉</button
                    >
                  {/if}
                  {#if line.convert?.length}
                    <button
                      class="small ghost"
                      data-checklist-convert
                      onclick={() => openMediaDialog({ mode: 'convert', ids: line.convert! })}
                      title={repack ? 'Repackage it so phones can open it (nothing lost)' : 'Convert them so they play in this browser'}
                      aria-label={repack ? 'Repackage it so phones can open it' : 'Convert them so they play in this browser'}>{repack ? '↻' : '🔄'}</button
                    >
                  {:else if line.shrink?.length}
                    <button class="small ghost" data-checklist-shrink onclick={() => openShrinkDialog(line.shrink![0])} title="Make a smaller copy for phones" aria-label="Make a smaller copy for phones">🗜</button>
                  {/if}
                </div>
              {/each}
            </div>
          {:else}
            ✓ Ready to play
          {/if}
        </div>
      {/if}
    </nav>

    <main>
      <h1 class="sr-only">{game.title || 'Untitled Game'}</h1>
      <!-- A game that's opened or new starts every editor afresh: no undo history carries over from the last one
           (another save of the same game has the same round ids). -->
      {#key game}
        {#if tab === 'sounds'}
          <SoundsPanel />
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
              menu={() => roundMenu(i)}
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
            <!-- (One short line, so the cards and 📂 Open a game… fit a laptop's screen.) The one thing a first-time browser
                 user can lose: the game lives in this browser until it's saved as a file. -->
            {#if !inTauri() && app.storageOk}
              <p class="muted small">New here? <b>✨ Try the sample</b>, then <b>▶ Play</b> it. Your work is kept in this browser; <b>💾 Save</b> makes a file.</p>
            {:else}
              <p class="muted small">New here? <b>✨ Try the sample</b>, then <b>▶ Play</b> it.</p>
            {/if}
            {#if !inTauri()}
              {#if !app.storageOk}
                <p class="small warn">⚠ This browser isn't keeping your game (its storage is blocked or full): <b>💾 Save</b> it to a file before you close the tab.</p>
              {/if}
            {:else}
              <!-- (Where the desktop app keeps things: ℹ About shows the folders, with a button to open each.) -->
              <p class="muted small data-line">
                Brainrot Games Maker saves your autosave and media in a folder on this PC as you work.
                <button class="small" onclick={() => (about = true)}>ℹ See where</button>
                <b>💾 Save</b> makes a game file to move or share.
              </p>
            {/if}
            <button class="sample" use:oneShot onclick={showSample} onkeydown={cardKey}>
              <span class="icon" aria-hidden="true">✨</span>
              <b>Try a sample game</b>
              <span class="muted small">An introduction, a small board, an adventure, a board game and a Final, all filled in and ready to play</span>
            </button>
            <!-- A card a mode: a blank round, and at most two templates to start from (＋ Add round has them all). -->
            <div class="modes" role="group" aria-label="Kinds of round (the arrow keys move between them)">
              {#each Object.entries(ROUND_MODES) as [mode, m] (mode)}
                {@const starts = firstTemplates(mode as RoundMode)}
                <div class="card">
                  <button class="mode" use:oneShot onclick={() => addRound(mode as RoundMode)} onkeydown={cardKey}>
                    <span class="icon" aria-hidden="true">{m.icon}</span>
                    <b>{m.label}</b>
                    <span class="muted small">{m.hint}</span>
                    {#if mode === 'board'}<span class="muted small">Clues in a spreadsheet already? <b>📥 Import clues…</b> on the board brings them in.</span>{/if}
                  </button>
                  {#if starts.length}
                    <div class="from muted small">
                      Start from:
                      {#each starts as t (t.label)}
                        <button class="small" use:oneShot title={t.hint} onclick={() => showNew(addTemplate(game, t))}>{t.label}</button>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
            <!-- Someone sent a game file, or back for one played here before. -->
            <div class="open-line muted small">
              <span>Have a game file?</span>
              <button class="small" onclick={open} disabled={!!opening}><span aria-hidden="true">📂</span> Open a game…</button>
              <span>or drop it here.</span>
              {#if recentFirst.length}
                <span class="recent-head">Recent:</span>
                {#each recentFirst as r (r.key)}
                  <button
                    class="small ghost"
                    use:oneShot
                    onclick={() => reopen(r)}
                    title="Reopen it, with its undo history (kept {keptHere()})">{r.title} · {r.rounds} round{r.rounds === 1 ? '' : 's'} · {keptWhen(r.closedAt)}</button
                  >
                {/each}
              {/if}
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
  /* ❔ Help's dot: what moved in this version, until its list was shown on this computer (as on the game screen). */
  .help {
    position: relative;
  }
  .newdot {
    position: absolute;
    top: 3px;
    right: 3px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
  }
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
  .first-round .modes > .card {
    grid-column: span 2;
  }
  .first-round .modes > .card:nth-child(n + 4) {
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
  /* A mode's card: its button fills it, and its templates sit in it, at the foot. */
  .first-round .card {
    display: flex;
    flex-direction: column;
    background: var(--panel-2);
    border: 1px solid var(--control-border);
    border-radius: 6px;
  }
  .first-round .card > .mode {
    flex: 1;
    border: none;
    border-radius: 5px;
    background: transparent;
  }
  .first-round .card > .mode:hover {
    background: var(--hover);
  }
  .first-round .from {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 0 16px 12px;
  }
  .first-round .open-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .first-round .recent-head {
    margin-left: 10px;
  }
  /* (Their words in full color: only the words around them are muted.) */
  .first-round .from button,
  .first-round .open-line button,
  .first-round .data-line button {
    color: var(--text);
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
  /* The start of a group of buttons: a wider gap before it. */
  header > .group {
    margin-left: 6px;
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
  /* Short, so it stays on one line (the details are in its tooltip). From a laptop up it's never cut mid-word: the
     title box gives way first. */
  .saved {
    white-space: nowrap;
  }
  @media (min-width: 1101px) {
    .saved {
      flex-shrink: 0;
    }
  }
  /* 💾 Save •: changed since its last save as a file. Its words only where the header has room. */
  .save-file .dot {
    color: var(--accent);
    font-weight: 700;
  }
  .save-file .unsaved {
    font-weight: 400;
    color: var(--muted);
  }
  /* (Measured in the CI fonts, the browser's note in full beside it: under 1600px the two cut the note short.) */
  @media (max-width: 1599px) {
    .save-file .unsaved {
      display: none;
    }
  }
  /* (The browser's note says what 💾 Save is for where the header has room; its tooltip always does. Under 1450px
     it would be cut short.) */
  @media (max-width: 1449px) {
    .autosave .wide {
      display: none;
    }
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
  /* The Tiebreaker before it's turned on: an optional extra, not a round. */
  nav > button.optional:not(.active) {
    background: transparent;
    border-style: dashed;
    color: var(--muted);
  }
  /* "(optional)" on a small second line of its own, so neither it nor the name is cut to "…". */
  nav > button .opt {
    display: block;
    font-size: 12px;
    line-height: 1.2;
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
  /* (At the foot of the sidebar even when the buttons leave room; over them, and scrolling on its own, when they don't.) */
  .problems {
    position: sticky;
    bottom: -12px;
    z-index: 1;
    margin-top: auto;
    margin-bottom: -12px;
    padding: 8px 0 12px;
    display: flex;
    flex-direction: column;
    max-height: 35vh;
    background: var(--panel);
    border-top: 1px solid var(--border);
    font-size: 12px;
    color: var(--muted);
  }
  .problems > .navlabel {
    margin-top: 0;
  }
  .problem-list {
    min-height: 0;
    overflow-y: auto;
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
    .first-round .modes > .card,
    .first-round .modes > .card:nth-child(n + 4) {
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
