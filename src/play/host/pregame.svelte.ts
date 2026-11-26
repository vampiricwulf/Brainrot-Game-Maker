/**
 * The pre-game screen's part of the host screen (moved out of Play.svelte, which calls createPregame once, where this
 * code was): 🖥 Display, the 📱 room line and who has joined, Start and Resume, ✅ Before you start's checks, the game's
 * players and rules kept with the editor's copy, 📺 On stream, Undo and Redo before the game, and the pre-game's keys.
 * Some of it carries on mid-game (the rules kept, Teams). Play's own state comes in through `host`, as getters, setters
 * and functions; Play's markup reads the values back from the object this returns.
 */
import { takeFocus } from '../../lib/modal';
import { app, toast } from '../../lib/app.svelte';
import { prefs, savePrefs } from '../../lib/prefs.svelte';
import { streamMovesThoughAsked } from '../../lib/motion.svelte';
import { commit, history, redo as redoStep, step, undo as undoStep } from '../../lib/history.svelte';
import { createFieldTracker, isTextField, undoKeyOf } from '../../lib/undokeys';
import { isBoard, isRpg, MAX_PLAYERS, newId, type BoardRound } from '../../lib/model';
import { randomizeDailyDoubles } from '../../lib/session';
import { askServerFiles, fileLimitsNow } from '../../lib/serverlimits.svelte';
import { soonLeft as soonLeftAt } from '../../lib/live';
import { teamsOn } from '../../lib/buzz';
import { scrollBehavior } from '../../lib/motion.svelte';
import { buzzerBase, buzzerOn, closeRoom, inRoom, remote, roomHasCards, roomHasFiles, roomStillOpen } from '../../lib/remote.svelte';
import { clearRoom, debounce, type SavedRoom } from '../../lib/persist';
import { dailyDoublesShort, partnerTilesShort, phoneUses, phoneUsesLine, validate, type Problem } from '../../lib/validate';
import { checklistLines } from '../../lib/checklist';
import type { Place } from '../../lib/historylabel';
import { nextFreeColor } from '../../lib/colors';
import PlayerList from '../../editor/PlayerList.svelte';
import { keptRoster, type RosterRow } from '../roster';
import { joinAsks } from '../JoinAsk.svelte';
import { phoneWord, whoJoined, type PhoneWord } from '../phonewords';
import { keptProgress, keptRound } from '../keptgame';
import { streamGist } from '../streamgist';
import { RememberedFold } from '../../lib/fold.svelte';
import { clone, randomizePartnerTiles } from '../../lib/ops';
import type { Game, GameSettings, MediaRef, Session } from '../../lib/model';
import { closeAudienceWindow } from '../../lib/sync.svelte';
import { mediaUrls } from '../../lib/media.svelte';
import { onMount, tick, untrack } from 'svelte';
import { phoneAwaySince } from './phoneaway.svelte';
import type { Phones } from './phones.svelte';
import { knownVerdict } from '../../lib/shrink/checks.svelte';
import { shrinkDialog } from '../../lib/shrink/dialog.svelte';
import { shrinkable, shrinksFurther } from '../../lib/shrink/apply';
import { shrinkMaybe } from '../../lib/shrink/probe';

/** What the pre-game's part reads from (and does through) the rest of the host screen: Play's own, live. */
export interface PregameHost {
  readonly game: Game;
  readonly session: Session;
  readonly phones: Phones;
  readonly phonesOn: boolean;
  readonly dual: boolean;
  readonly showSound: boolean;
  /** The ? list (Play keeps it). */
  showKeys: boolean;
  readonly checksEl: HTMLElement | undefined;
  /** The game has been left (Play's onDestroy). A plain value, not a reactive one: read it from `host` each time. */
  readonly left: boolean;
  /** Sample players' names, by id (nobody renamed them). */
  readonly samples: Map<string, string>;
  /** The players' start scores as the pre-game set them, by id. */
  readonly startScores: Map<string, number>;
  readonly gameRev: number;
  readonly gameCopy: (() => Game | null) | undefined;
  readonly onresume: ((withEdits: boolean, room: SavedRoom['remote'] | null) => void) | undefined;
  openAudience(): Promise<boolean>;
  openScores(): void;
  flashTo(sel: string, flash?: string): void;
  start(): void;
  startPhoneRoom(): Promise<void>;
  closePhoneRoom(): void;
}

export type Pregame = ReturnType<typeof createPregame>;

/** Call once, from Play's script (its effects belong to Play). */
export function createPregame(host: PregameHost) {
  const game = $derived(host.game);
  const session = $derived(host.session);
  const phones = $derived(host.phones);
  const phonesOn = $derived(host.phonesOn);
  const dual = $derived(host.dual);
  const showSound = $derived(host.showSound);
  const checksEl = $derived(host.checksEl);
  const gameRev = $derived(host.gameRev);
  const gameCopy = $derived(host.gameCopy);
  const onresume = $derived(host.onresume);
  const { samples, startScores, openAudience, openScores, flashTo, start, startPhoneRoom, closePhoneRoom } = host;
  // ---------- Pre-game ----------

  /** The display picked (🖥 Display, remembered from the last game): the audience window opens on Start if it isn't yet. */
  const wantAudience = $derived(dual || prefs.display === 'audience');
  /** 📺 picked opens the audience window, or brings it forward when it's open; 🖥 closes it. */
  function pickDisplay(audienceWindow: boolean): void {
    prefs.display = audienceWindow ? 'audience' : 'single';
    savePrefs();
    if (!audienceWindow && dual) closeAudienceWindow();
    else if (audienceWindow) void openAudience();
  }
  /** The audience window line's Close it asks first, as the host panel's 📺 does (it's usually the stream capture). */
  let askCloseAud = $state(false);
  $effect(() => {
    if (!dual) askCloseAud = false;
  });

  /** What the game uses phones for (the 📱 card says it while phone buzzers are off): its partner cards, choices… */
  const phoneUsesNow = $derived(phonesOn ? '' : phoneUsesLine(phoneUses(game)));
  /** Buzzer mode is on and the room is up: its code, and the players whose phones are in. */
  const roomUp = $derived(phonesOn && !!remote.code && remote.status !== 'off' && remote.status !== 'error');
  const phonesIn = $derived(session.players.filter((p) => remote.phones.some((ph) => ph.seatId === p.id && ph.connected)).length);
  /** Who's in and who isn't yet, as the 📱 card counts them (teams: the people on teams). */
  const joined = $derived.by(() => whoJoined(session.players, remote.phones, pregameTeams));
  /**
   * Who has joined, as the Start bar and the checklist say it (teams: as the 📱 card does): no count while the room is
   * out of reach (its list is stale).
   */
  const joinedText = $derived.by(() => {
    if (remote.status === 'connecting') return 'connecting…';
    if (remote.status !== 'online') return '⚠ reconnecting to the buzzer room…';
    return joined.joined;
  });
  /** Everyone's phone is in (the bar's room line goes green). */
  const allIn = $derived(remote.status === 'online' && !!session.players.length && !joined.waiting.length);
  /** Phones asking to join now (the bar says so, with ✔ Add and ✕ No, while the room can hear the answer). */
  const asksNow = $derived(roomUp && remote.status === 'online' ? joinAsks() : []);
  /** The bar's room line (the keys come back to it after its ✔ Add or ✕ No, never to the next one asking). */
  let roomLine = $state<HTMLElement>();
  function lineAnswer(fn: () => void): void {
    const inside = !!roomLine?.contains(document.activeElement);
    fn();
    if (inside) void tick().then(() => roomLine?.focus({ preventScroll: true }));
  }
  /** The 👥 list (its rows' menu and F2 work from the 📱 card's rows too). */
  let roster = $state<ReturnType<typeof PlayerList>>();
  /** Each second while the room is up before the game, for the 👥 rows' "📵 lost 0:12" and "⛔ kicked 1:40". */
  let phoneNow = $state(Date.now());
  $effect(() => {
    if (!app.pregame || !roomUp) return;
    const id = setInterval(() => (phoneNow = Date.now()), 1000);
    return () => clearInterval(id);
  });
  /** Each 👥 row's phone in words while the room is up (not with Teams: a team's row says who's on it). */
  const rowPhone = $derived.by(() => {
    if (!roomUp || pregameTeams) return undefined;
    const now = phoneNow;
    const online = remote.status === 'online';
    const locked = !!session.remote?.locked;
    return (id: string): PhoneWord => {
      const mine = remote.phones.filter((ph) => ph.seatId === id);
      const phone = mine.some((ph) => ph.connected) ? 'in' : mine.length ? 'away' : null;
      return phoneWord({ online, phone, awaySince: phoneAwaySince(id), kickedAt: remote.kicked[id], locked }, now);
    };
  });
  /** The bar's Show ↓: the 📱 card's list of who's asking, in sight with the keys on it. */
  function showAsks(): void {
    const list = document.querySelector<HTMLElement>('[data-place="play:buzzers"] [data-join-asks]');
    list?.scrollIntoView({ block: 'center', behavior: scrollBehavior() });
    list?.focus({ preventScroll: true });
  }
  /** The game kept to resume (Exit › Keep & leave, or a reload mid-game), not a finished one: Start replaces it. */
  const keptGame = $derived(app.resumable && app.resumable.session.phase !== 'end' ? app.resumable : null);
  /** Start would throw something away with it (points, a tile played…): it asks first. */
  const keptLoses = $derived(!!keptGame && keptProgress(keptGame.session));
  /** Where the kept game is ("Jeopardy!", "round 2 of 5"). */
  const keptWhere = $derived(keptGame ? keptRound(keptGame.game, keptGame.session) : { name: '', at: '' });
  /**
   * Start was pressed and asks first, in its bar: phone buzzers on with no room (start it first, or play without
   * phones), a game in progress it would throw away (`lose`), or both, as one question. `at`: when it asked (a second
   * Ctrl+Enter or click that soon is the same double press, not the answer).
   */
  let startAsk = $state<{ at: number; noRoom: boolean; lose: boolean } | null>(null);
  $effect(() => {
    if (startAsk?.noRoom && (roomUp || !phonesOn)) startAsk = null;
  });
  /** A second press this soon after Start asked (a held or doubled Ctrl+Enter) doesn't answer it. */
  const ASK_GUARD_MS = 500;

  /**
   * Start game ▶ (or Ctrl+Enter, `byKey`): with phone buzzers on and no room yet, or a game in progress it would discard,
   * it asks first, and the next press (not the second half of a double one) goes on; with the audience window picked,
   * that opens now (from the click: a browser lets only a click open it). While it asks about the game in progress, a
   * click on it doesn't answer (its red Start new game does, or a later Ctrl+Enter): the question flashes, the keys on
   * Not yet.
   */
  async function startClicked(byKey = false): Promise<void> {
    if (!session.players.length) return;
    if (startAsk) {
      if (Date.now() - startAsk.at < ASK_GUARD_MS) return;
      if (startAsk.lose && !byKey) return flashTo('.actions [data-start-ask] .ia > button', '.actions [data-start-ask] .ia');
    } else {
      const noRoom = phonesOn && !roomUp;
      if (noRoom || keptLoses) return void (startAsk = { at: Date.now(), noRoom, lose: keptLoses });
    }
    await startAnyway();
  }
  /** The question answered with Start new game (or Start without phones): the game starts. */
  async function startAnyway(): Promise<void> {
    startAsk = null;
    if (wantAudience && !dual && !(await openAudience())) return;
    start();
  }

  /**
   * ✅ Before you start's going-live tips shown or hidden: the keys go to the button that turns them back (Show them, or
   * the tips' ✕), not to the page with the one pressed.
   */
  function tipsShown(on: boolean): void {
    prefs.liveChecklist = on;
    savePrefs();
    void tick().then(() => {
      if (document.activeElement && document.activeElement !== document.body) return;
      document.querySelector<HTMLElement>('.pregame [data-tips-toggle]')?.focus();
    });
  }

  /** The room started from the bar's question (or the card): scrolled into view, its code above the Start bar. */
  async function startRoomHere(): Promise<void> {
    startAsk = null;
    await startPhoneRoom();
    await tick();
    document.querySelector('[data-place="play:buzzers"]')?.scrollIntoView({ block: 'start', behavior: scrollBehavior() });
  }

  /** ✎ Rename on the pre-game screen: the game's title (on stream), kept in the editor too (undoable there). */
  let renaming = $state(false);
  const untitled = $derived(!game.title.trim() || game.title.trim() === 'Untitled Game');
  /** The title takes the focus when it shows, but not from a field clicked to end the rename: the typing goes there. */
  let titleRefocus = true;
  const titleFocus = (node: HTMLElement) => {
    if (titleRefocus) takeFocus(node);
    titleRefocus = true;
  };
  function rename(to: string, refocus = true): void {
    renaming = false;
    titleRefocus = refocus;
    const title = to.trim();
    if (!title || title === game.title) return;
    game.title = title;
    if (editorHasIt()) step(`Named the game “${title}”`, () => (app.game.title = title), { during: 'play' });
    // (A player-only file's own copy keeps it too, like its players and rules: it has no undo.)
    else if (keepsSetup()) app.game.title = title;
  }

  /** ⚙ Set up phone buzzers… (the 📱 card, when this app has no buzzer server): ⚙ Settings, at the phone buzzers. */
  let showSettings = $state(false);

  /**
   * The kept game's rooms the server says have ended (closed elsewhere, or unused for hours while the app was closed):
   * their phones were told the game is over, so nothing here waits for them. Each is asked once.
   */
  let keptGone = $state<string[]>([]);
  const keptAsked = new Set<string>();
  $effect(() => {
    const own = app.pregame && phonesOn && app.resumable?.session.phase !== 'end' ? app.resumable?.session.remote : null;
    if (!own || keptAsked.has(own.code)) return;
    keptAsked.add(own.code);
    const { code, base } = own;
    untrack(() => void roomStillOpen({ code, base }).then((open) => open === false && (keptGone = [...keptGone, code])));
  });
  /**
   * The room of the game kept to resume, when ▶ Resume it goes back into it (a reload mid-game left its phones waiting
   * there): no room started here has a phone in it. One that has takes the game instead.
   */
  const keptRoom = $derived.by(() => {
    const k = app.resumable;
    const own = k && k.session.phase !== 'end' ? k.session.remote : null;
    return own && !keptGone.includes(own.code) && own.code !== session.remote?.code && !(roomUp && remote.phones.length) ? own.code : '';
  });

  /** The pre-game's ▶ Resume: the game kept to resume plays on, in the display picked here (and its room, if open). */
  async function resumeKept(withEdits: boolean): Promise<void> {
    // Like Start: with the audience window picked (🖥 Display), it opens now, from the click (answers and notes stay off stream).
    if (wantAudience && !dual && !(await openAudience())) return;
    const r = session.remote;
    // A room started here that no phone is in, while the kept game's phones wait in its own: that one goes on, and this
    // one closes (nobody is in it to be told).
    if (r && keptRoom) {
      closeRoom();
      session.remote = null;
      void clearRoom();
      return onresume?.(withEdits, null);
    }
    const room = r && phonesOn && inRoom(r.code) ? $state.snapshot(r) : null;
    // The room goes on with the resumed game: leaving this screen mustn't close it.
    if (room) phones.keepRoomOpen = true;
    onresume?.(withEdits, room);
  }

  // (A room open now that puts cards on phones but takes no files, or a server that takes none: a card's file from this
  // computer won't reach one. How big a file the server takes, as it said.)
  const fileLimits = $derived(fileLimitsNow());
  const filesOff = $derived((!!remote.code && remote.status === 'online' && roomHasCards() && !roomHasFiles()) || fileLimits.off);
  const fileBytes = $derived(fileLimits.limits.fileBytes);
  // (Which 🗜 copies for phones go: those stored here, a GIF's only to a room that shows it as one.)
  const gifs = $derived(fileLimits.gifs);
  // (Asked before a room is open, for the checklist here.)
  $effect(() => {
    const b = buzzerBase();
    if (b && game.media.some((m) => !m.url && m.kind !== 'font')) askServerFiles(b);
  });
  /**
   * Things worth fixing before going live (warnings only: Start still works). Worked out from the watcher's plain copy
   * once the screen is up, then a moment after changes stop (as the editor's checklist): reading the whole game through
   * its proxies on every key of a player's name made typing lag in big games, and held up ▶ Play itself.
   */
  let checks = $state.raw<GameCheck[]>([]);
  /** The checks have been worked out once (until then, ✅ Before you start doesn't say there's nothing to check). */
  let checksReady = $state(false);
  /** The bar's ⚠ 2 to check: the card's checks, in sight, with the keys on them. */
  function toChecks(): void {
    checksEl?.scrollIntoView({ block: 'center', behavior: scrollBehavior() });
    checksEl?.focus({ preventScroll: true });
  }
  /** Of the checks, the warnings (the rest are notes Start takes care of, such as Daily Doubles not placed yet). */
  const warnings = $derived(checks.filter((c) => c.level === 'warn').length);
  /** Where ◀ Fix in editor goes: the first warning's tab (else the first note's). */
  const fixAt = $derived((checks.find((c) => c.level === 'warn' && c.fix) ?? checks.find((c) => c.fix))?.fix);
  const recheck = debounce(() => {
    if (!host.left && app.pregame) {
      checks = gameChecks(gameCopy?.() ?? $state.snapshot(game));
      checksReady = true;
    }
  }, 300);
  /** At once (the screen just up, 🎲 Place now). Never from inside an effect (the watcher's copy). */
  function recheckNow(): void {
    recheck();
    recheck.flush();
  }
  $effect(() => {
    void gameRev;
    void [filesOff, fileBytes, gifs];
    // (Whether files are missing depends on the ones loaded, too.)
    void Object.keys(mediaUrls).length;
    if (app.pregame) untrack(recheck);
  });
  onMount(() => {
    requestAnimationFrame(() => setTimeout(recheckNow));
  });
  /** A line of ✅ Before you start › The game. */
  interface GameCheck {
    text: string;
    /** Its words in one window, where viewers see this page (none: the same). */
    quiet?: string;
    /** What a grouped line stands for (its tooltip), and in one window. */
    details?: string[];
    quietDetails?: string[];
    level: Problem['level'];
    /** Where ◀ Fix in editor goes: a round's id or an editor tab. */
    fix?: string;
    /** 🎲 Place now: the round whose Daily Doubles or partner clues aren't placed yet. */
    ddRound?: number;
    ptRound?: number;
    /** 🗜 Make smaller: the file. */
    shrink?: string;
    /** Where its own Fix › goes. */
    place?: Place;
  }
  function gameChecks(g: Game): GameCheck[] {
    // (A board short of Daily Doubles gets a button to place them.)
    // (Daily Doubles not placed yet are only a note in the editor, as Start places them: here they're listed with it.)
    // (Whether a video or sound plays in this browser: as worked out in the editor, as nothing is checked here.)
    // (A card's file too big for the buzzer server, or of a kind phones can't play, that 🗜 can make a copy of: its
    // line gets 🗜 Make smaller. There's no ↻ here: an MKV that plays is 🗜's too.)
    const canShrink = (m: MediaRef) => shrinkMaybe() && shrinkable(m) && !!mediaUrls[m.id] && shrinksFurther(g, m, fileBytes);
    const problems = validate(g, { filesOff, fileBytes, gifs, stored: (id) => id in mediaUrls, plays: knownVerdict, canShrink, repack: false });
    // (A player-only file can't add or swap files: its own words for those.)
    const said = (t: { text: string; player?: string }) => (app.playerOnly && t.player ? t.player : t.text);
    // The warnings as the editor's checklist puts them, one line a round (and one for the tiebreaker), so the bar's
    // ⚠ 2 to check is the editor's ⚠ 2. Also in the words for one window, where this page is on stream: a line about a
    // tile, a secret space or object doesn't say which (the same lines, as they're grouped by where they are).
    const lines = checklistLines(
      g,
      problems.map((p) => ({ ...p, text: said(p) })),
    );
    const hushed = checklistLines(
      g,
      problems.map((p) => ({ ...p, text: p.quiet ? said({ text: p.quiet.text, player: p.quiet.player ?? p.player }) : said(p) })),
    );
    // Daily Doubles and partner clues not placed yet: notes of their own, with 🎲 Place now (Start places them too).
    const unplaced = (p: Problem) => {
      const r = typeof p.tab === 'number' ? g.rounds[p.tab] : undefined;
      const dd = isBoard(r) && !!dailyDoublesShort(r) && p.text.includes('Daily Double') && p.text.includes(' not placed yet');
      const pt = isBoard(r) && partnerShort(r) && p.text.includes('partner clue') && p.text.includes(' not placed yet');
      return dd || pt ? { dd, pt } : null;
    };
    return lines.flatMap((line, i): GameCheck[] => {
      const quiet = hushed[i];
      const warn: GameCheck[] =
        line.level === 'warn'
          ? [
              {
                text: line.text,
                quiet: quiet && quiet.text !== line.text ? quiet.text : undefined,
                // (Its tooltip: what it stands for, as the editor's.)
                details: line.details.length > 1 ? line.details : undefined,
                quietDetails: line.details.length > 1 ? quiet?.details : undefined,
                level: line.level,
                // Where ◀ Fix in editor goes (not this screen's own things).
                fix: line.round ?? (typeof line.tab === 'number' || line.tab === 'play' ? undefined : line.tab),
                ddRound: undefined,
                ptRound: undefined,
                shrink: line.shrink?.[0],
                // (Its own Fix › goes there.)
                place: line.place,
              },
            ]
          : [];
      const notes = line.round
        ? problems.flatMap((p) => {
            const u = p.tab === line.tab ? unplaced(p) : null;
            if (!u) return [];
            const ri = p.tab as number;
            return [
              {
                text: said(p),
                quiet: undefined,
                details: undefined,
                quietDetails: undefined,
                level: p.level,
                fix: line.round,
                ddRound: u.dd ? ri : undefined,
                ptRound: u.pt ? ri : undefined,
                shrink: undefined,
                place: p.place,
              },
            ];
          })
        : [];
      return [...warn, ...notes];
    });
  }

  /**
   * Scatter the missing Daily Doubles now (in this game and in the editor's copy, so they're kept).
   * The ones placed by hand stay where they are.
   */
  function placeDailyDoubles(ri: number, tell = true): number {
    const r = game.rounds[ri];
    if (!isBoard(r)) return 0;
    const dds = () => r.categories.flatMap((c) => c.clues.filter((cl) => cl.type === 'dailyDouble').map((cl) => cl.id));
    const before = new Set(dds());
    const n = randomizeDailyDoubles(r, r.dailyDoubleCount ?? 1, Math.random, { keepExisting: true });
    const added = new Set(dds().filter((id) => !before.has(id)));
    // Nowhere to put one: no step (🎲 Place now says why).
    if (!n) {
      if (tell) toast(`No room for another Daily Double in ${r.name}: one a category, on a standard tile`);
      return 0;
    }
    const edited = app.game.rounds.find((x) => x.id === r.id);
    step(
      `Placed ${n} Daily Double${n === 1 ? '' : 's'} in ${r.name}`,
      () => {
        for (const c of isBoard(edited) ? edited.categories : [])
          for (const cl of c.clues) if (added.has(cl.id) && cl.type === 'standard') cl.type = 'dailyDouble';
      },
      { during: 'play' },
    );
    if (tell) toast(`Placed ${n} Daily Double${n === 1 ? '' : 's'} in ${r.name}`);
    return n;
  }

  /** A board's 🤝 Partner clues box asks for more than it has, with tiles to put them on. */
  const partnerShort = (r: BoardRound): boolean => {
    const s = partnerTilesShort(r);
    return !!s && s.placed < s.want;
  };

  /**
   * Scatter the missing 🤝 partner clues now (in this game and in the editor's copy, so they're kept), on tiles with a
   * written question and answer. The ones already on the board stay where they are.
   */
  function placePartnerTiles(ri: number, tell = true): number {
    const r = game.rounds[ri];
    if (!isBoard(r)) return 0;
    const before = new Set(r.categories.flatMap((c) => c.clues.filter((cl) => cl.type === 'partner').map((cl) => cl.id)));
    // (Each with a copy of its answer as its card, whatever the round says: an empty card can't be filled in now. The
    // editor's 🔀 Randomize is where the host fills one in.)
    const n = randomizePartnerTiles(r, r.partnerCount ?? 0, Math.random, { keepExisting: true, cardFrom: 'answer' });
    if (!n) {
      if (tell) toast(`No room for another partner clue in ${r.name}: they go on tiles with a written question and answer`);
      return 0;
    }
    // (What each became: its rules, its cards, its countdown, as plain copies for the editor's game.)
    const added = new Map(
      r.categories.flatMap((c) => c.clues.filter((cl) => cl.type === 'partner' && !before.has(cl.id)).map((cl) => [cl.id, $state.snapshot(cl)] as const)),
    );
    const edited = app.game.rounds.find((x) => x.id === r.id);
    step(
      `Placed ${n} partner clue${n === 1 ? '' : 's'} in ${r.name}`,
      () => {
        for (const c of isBoard(edited) ? edited.categories : [])
          for (const cl of c.clues) {
            const now = added.get(cl.id);
            if (!now || cl.type !== 'standard') continue;
            cl.type = 'partner';
            if (now.partner) cl.partner = clone(now.partner);
            if (now.cards) cl.cards = clone(now.cards);
            else delete cl.cards;
            if (now.timerSeconds != null && cl.timerSeconds == null) cl.timerSeconds = now.timerSeconds;
          }
      },
      { during: 'play' },
    );
    if (tell) toast(`Placed ${n} partner clue${n === 1 ? '' : 's'} in ${r.name}`);
    return n;
  }

  // ---------- The game's players and rules (pre-game) ----------

  /** The editor holds this same game (after resuming an older save it may not; a player-only file has no editor). */
  const editorHasIt = () => !app.playerOnly && app.game.id === game.id;
  /**
   * The app's copy of this game (the editor's, or a player-only file's own) keeps what the pre-game screen sets up: ◀ Back
   * and ▶ Play again find the players and rules as they were left (as setStream keeps the stream's words).
   */
  const keepsSetup = () => app.game.id === game.id;

  /**
   * The pre-game screen is where the game's players are set: each change to the list here (a name, a color, a picture,
   * the order, a player added or deleted) is kept with the game, in the editor's copy too, as an undoable change in its
   * history. Sample players nobody renamed aren't kept. (Start scores are only for this game.)
   */
  function keepRoster(g: Game, list: RosterRow[], before: RosterRow[]): void {
    const next = keptRoster($state.snapshot(g.players), list, before);
    if (JSON.stringify(next) !== JSON.stringify($state.snapshot(g.players))) g.players = next;
  }
  /** The pre-game list as last kept (for its pictures: one taken off there comes off the game's player too). */
  let rosterSeen: { s: unknown; key: string; list: RosterRow[] } = { s: null, key: '', list: [] };
  $effect(() => {
    if (!app.pregame) return;
    const list: RosterRow[] = session.players
      .filter((p) => samples.get(p.id) !== p.name)
      .map(({ id, name, color, avatar }) => ({ id, name, color, ...(avatar ? { avatar } : {}) }));
    const key = JSON.stringify(list);
    // A new pre-game (a rematch) starts from its players as they are.
    if (rosterSeen.s !== session) return void (rosterSeen = { s: session, key, list });
    if (key === rosterSeen.key) return;
    const before = rosterSeen.list;
    rosterSeen = { s: session, key, list };
    untrack(() => {
      keepRoster(game, list, before);
      if (keepsSetup()) keepRoster(app.game, list, before);
    });
  });

  /** The settings ⚖ Game rules sets. */
  const RULES = [
    'allowNegativeScores',
    'deductOnWrong',
    'pickerFollowsAward',
    'currencySymbol',
    'maxPlayers',
    'defaultTimerSeconds',
    'timerAutoStart',
    'roundIntro',
    'partnerSteal',
    'wagerFloor',
  ] as const satisfies readonly (keyof GameSettings)[];
  // ⚖ Game rules changes the game being played (before it, or mid-game from the host panel); the editor's copy of
  // the game keeps each change (undoable there).
  let rulesSeen = '';
  $effect(() => {
    const rules = JSON.stringify(RULES.map((k) => game.settings[k] ?? null));
    if (!rulesSeen || rules === rulesSeen) return void (rulesSeen = rules);
    rulesSeen = rules;
    untrack(() => {
      if (!keepsSetup()) return;
      const to = app.game.settings as unknown as Record<string, unknown>;
      for (const k of RULES) {
        const v = $state.snapshot(game.settings[k]);
        if (JSON.stringify(v ?? null) === JSON.stringify($state.snapshot(to[k]) ?? null)) continue;
        if (v === undefined) delete to[k];
        else to[k] = v;
      }
    });
  });

  // ---------- On stream (pre-game) ----------

  type StreamSettings = NonNullable<GameSettings['stream']>;
  const stream = $derived(game.settings.stream ?? {});

  /** A stream card's words or a caption, here and in the editor's copy of this game (kept, undoable there). */
  function setStream<K extends keyof StreamSettings>(key: K, value: StreamSettings[K], label: string): void {
    const apply = (g: Game) => (g.settings.stream = { ...g.settings.stream, [key]: value });
    apply(game);
    if (app.game.id === game.id) step(label, () => apply(app.game), { during: 'play' });
  }

  /** A stream card's words changed, as the 🕘 History says it ("Cover card text “Snack break”"). */
  const cardLabel = (card: string, text: string) => (text.trim() ? `${card} card text “${text.trim().slice(0, 40)}”` : `${card} card text back to the default`);

  /** Phone buzzer teams are on: the pre-game list is of teams (people join them from their phone). */
  const pregameTeams = $derived(buzzerOn(game.settings) && teamsOn(game.settings));
  /** Teams: the people who joined a team from their phone. */
  const teamMembers = (id: string): string[] => remote.phones.filter((p) => p.seatId === id && p.member).map((p) => p.name ?? '');
  /** Minutes the "Starting soon" card counts down from. */
  let soonMinutes = $state(5);
  /** Seconds left on the "Starting soon" countdown, for the host (ticks only while there's one). */
  let soonLeft = $state(0);
  /** 📺 On stream, folded (rare setup): open while its countdown runs. */
  const streamFold = new RememberedFold('jb.streamOpen');
  $effect(() => {
    const on = !!app.live.soonAt;
    untrack(() => streamFold.need(on));
  });
  /** Its line, closed: what's set. */
  const streamGistNow = $derived(
    streamGist(stream, {
      countdown: app.live.soonAt ? (soonLeft ? `${Math.floor(soonLeft / 60)}:${String(soonLeft % 60).padStart(2, '0')}` : 'now') : undefined,
      phones: phonesOn,
      rpg: game.rounds.some(isRpg),
      reduceMotion: prefs.reduceMotion,
      osMotion: streamMovesThoughAsked(),
    }),
  );
  $effect(() => {
    const at = app.live.soonAt;
    if (!at) return;
    // "Starting now!" for a while, then the countdown is over: viewers' card has its own words again, and here it's
    // ▶ Start countdown again (no "Starting now!" for as long as the host takes).
    const tick = () => {
      const left = soonLeftAt(at, Date.now());
      if (left === null) app.live.soonAt = undefined;
      else soonLeft = left;
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  });

  function addSamplePlayers(): void {
    // Teams get team names (people's names would read as players on stream), numbered as ＋ Add team numbers them.
    for (const name of pregameTeams ? ['Team 1', 'Team 2', 'Team 3'] : ['Alex', 'Sam', 'Jordan']) {
      if (session.players.length >= game.settings.maxPlayers) break;
      const id = newId();
      samples.set(id, name);
      session.players.push({ id, name, color: nextFreeColor(session.players.map((p) => p.color)), startScore: 0 });
    }
  }

  /** At the most players (👥 Players, or before the game): one more may join. */
  function raiseMost(): void {
    if (game.settings.maxPlayers < MAX_PLAYERS) game.settings.maxPlayers++;
  }

  // ---------- Undo and redo before the game ----------

  /** The editor's steps when this pre-game opened: Ctrl+Z here takes back only the changes made since. */
  let editorSteps = new Set<string>();
  $effect(() => {
    if (!app.pregame) return;
    void session;
    untrack(() => {
      commit();
      editorSteps = new Set(history.entries.map((e) => e.id));
    });
  });

  // The text field in focus, so Ctrl+Z stays its own while it has typing of its own (as in the editor).
  const fields = createFieldTracker();

  /**
   * Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z) before the game: the editor's history, as in the editor (the same steps 🕘 History
   * shows), for the changes made here (players, rules, buzzers, on stream, Daily Doubles placed). Never the browser's
   * own undo, which would change the last field typed in.
   */
  function pregameKey(e: KeyboardEvent): void {
    // ? lists the keys, this screen's first (typed in a field it's a question mark; a window over the screen has its own).
    // A ticked box keeps no text: ? there lists them too, as in the game.
    if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.defaultPrevented) {
      const t = e.target instanceof Element ? e.target : null;
      if (
        showSound ||
        showSettings ||
        shrinkDialog.open ||
        t?.closest('input:not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable], [role="dialog"], [role="menu"]')
      )
        return;
      e.preventDefault();
      host.showKeys = true;
      return;
    }
    // A and Shift+A, as in the game: the audience window (opened, or brought forward; never closed) and the scores window.
    if (e.key.toLowerCase() === 'a' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat && !e.defaultPrevented) {
      const t = e.target instanceof Element ? e.target : null;
      if (
        showSound ||
        showSettings ||
        shrinkDialog.open ||
        t?.closest('input:not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable], [role="dialog"], [role="menu"]')
      )
        return;
      e.preventDefault();
      if (e.shiftKey) openScores();
      else void openAudience();
      return;
    }
    // Ctrl+Enter starts the game from wherever the focus is on the page (not in a window over it).
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && !e.repeat && !e.defaultPrevented) {
      const t = e.target instanceof Element ? e.target : null;
      if (showSound || t?.closest('[role="dialog"], [role="menu"]')) return;
      e.preventDefault();
      if (!session.players.length) return void toast(`Add ${pregameTeams ? 'teams' : 'players'} to start`);
      // (A field being typed in keeps what's in it: its change lands first. Only a field: the keys on the question's
      // Not yet stay there, for Esc and Enter.)
      if (isTextField(document.activeElement)) document.activeElement.blur();
      return void startClicked(true);
    }
    const key = undoKeyOf(e);
    if (!key || e.defaultPrevented || fields.native(e, key)) return;
    e.preventDefault();
    // A window over the screen (🔊 Test the sound…, ⚙ Settings, 🗜) isn't about the game.
    if (showSound || showSettings || shrinkDialog.open) return;
    if (!editorHasIt()) return void toast(app.playerOnly ? 'Nothing to undo here' : 'Undo works for the game open in the editor');
    commit();
    const next = key === 'undo' ? history.entries[history.index - 1] : history.entries[history.index];
    if (!next || editorSteps.has(next.id)) {
      return void toast(key === 'undo' ? 'Nothing more to undo here (earlier changes are undone in the editor)' : 'Nothing to redo');
    }
    const was = editorSetup();
    const done = key === 'undo' ? undoStep('key') : redoStep('key');
    fields.afterGlobal();
    if (!done) return;
    fromEditor(was);
    toast(`${key === 'undo' ? '↶ Undid' : '↷ Redid'} ${done.label}`);
  }

  /** The buzzer settings (the 📱 Phone buzzers card). */
  const BUZZ = ['buzzer', 'buzzArm', 'phoneJoin', 'phoneColorsOff', 'earlyBuzzLock', 'buzzTeams'] as const satisfies readonly (keyof GameSettings)[];
  /** The settings set here. */
  const SETUP = [...RULES, ...BUZZ, 'stream'] as const;
  /** The editor's copy of what's set here, to see what an undo or redo changed in it. */
  const editorSetup = () => ({
    settings: SETUP.map((k) => JSON.stringify($state.snapshot(app.game.settings[k]) ?? null)),
    players: JSON.stringify($state.snapshot(app.game.players)),
    copies: copiesOf(app.game),
  });
  /** A game's 🗜 copies for phones, to see whether an undo or redo changed them. */
  const copiesOf = (g: Game): string => JSON.stringify($state.snapshot(g.media.filter((m) => m.phoneCopy)));

  /**
   * An undo or redo changed the editor's game (`before`: what it had): the game here, and the players listed, follow
   * what it changed. The rest stays as it is here, where the two differ (a quick reload can leave the editor's copy
   * behind).
   */
  function fromEditor(before: ReturnType<typeof editorSetup>): void {
    const src = app.game;
    const to = game.settings as unknown as Record<string, unknown>;
    SETUP.forEach((k, i) => {
      const v = $state.snapshot(src.settings[k]);
      const json = JSON.stringify(v ?? null);
      if (json === before.settings[i] || json === JSON.stringify($state.snapshot(to[k]) ?? null)) return;
      if (v === undefined) delete to[k];
      else to[k] = v;
    });
    // Buzzer mode undone off: the room closes as the 📱 card's switch closes it (its saved copy too, or a reload would
    // bring the closed room back).
    if (!buzzerOn(game.settings)) {
      if (session.remote) closePhoneRoom();
      else closeRoom();
    }
    // Daily Doubles placed here (🎲 Place now).
    for (const r of game.rounds) {
      const e = src.rounds.find((x) => x.id === r.id);
      if (!isBoard(r) || !isBoard(e)) continue;
      for (const c of r.categories)
        for (const cl of c.clues) {
          const t = e.categories.find((x) => x.id === c.id)?.clues.find((x) => x.id === cl.id)?.type;
          if (t && t !== cl.type && (t === 'dailyDouble' || cl.type === 'dailyDouble')) cl.type = t;
        }
    }
    // The players, when it changed them.
    if (JSON.stringify($state.snapshot(src.players)) !== before.players) followPlayers();
    // 🗜 copies for phones made here.
    if (copiesOf(src) !== before.copies) followCopies();
    // The game's name (✎ Rename here).
    if (src.title !== game.title) game.title = src.title;
  }
  /**
   * The 🗜 copies for phones of the files the editor's game has: as it has them (a quick card's file is this game's
   * alone, and its copy stays).
   */
  function followCopies(): void {
    const src = app.game;
    const files = new Set(src.media.map((m) => m.id));
    const theirs = src.media.filter((m) => m.phoneCopy);
    for (let i = game.media.length - 1; i >= 0; i--) {
      const m = game.media[i];
      if (m.phoneCopy && files.has(m.phoneCopy.of) && !theirs.some((c) => c.id === m.id)) game.media.splice(i, 1);
    }
    for (const c of theirs) if (!game.media.some((m) => m.id === c.id) && game.media.some((m) => m.id === c.phoneCopy!.of)) game.media.push($state.snapshot(c));
  }
  /** The players listed: as the editor's game has them (start scores kept), and the sample players nobody renamed. */
  function followPlayers(): void {
    const src = app.game;
    const was = new Map(session.players.map((p) => [p.id, p]));
    const kept = src.players.map((t) => {
      const p = was.get(t.id);
      // (One brought back by an Undo gets the start score it had.)
      const startScore = p?.startScore ?? startScores.get(t.id) ?? 0;
      return { id: t.id, name: t.name, color: t.color, ...(t.avatar ? { avatar: t.avatar } : {}), startScore };
    });
    const list = [...kept];
    // Sample players stay where they were among the others (after the one they followed).
    session.players.forEach((p, i) => {
      if (samples.get(p.id) !== p.name || kept.some((k) => k.id === p.id)) return;
      let at = 0;
      for (let j = i - 1; j >= 0; j--) {
        const k = list.findIndex((x) => x.id === session.players[j].id);
        if (k >= 0) {
          at = k + 1;
          break;
        }
      }
      list.splice(at, 0, $state.snapshot(p));
    });
    if (JSON.stringify(list) !== JSON.stringify($state.snapshot(session.players))) session.players = list;
    const players = $state.snapshot(src.players);
    if (JSON.stringify(players) !== JSON.stringify($state.snapshot(game.players))) game.players = players;
  }

  // Before the game, what Tab reaches near the foot of the window scrolls above the sticky Start bar, not under it.
  $effect(() => {
    if (!app.pregame) return;
    const root = document.documentElement;
    root.style.scrollPaddingBottom = '96px';
    return () => void (root.style.scrollPaddingBottom = '');
  });

  // ---------- History's Go there (a pre-game part) ----------

  onMount(() => {
    const part = app.pregameAt;
    app.pregameAt = null;
    if (!part || !app.pregame) return;
    void tick().then(() => {
      const el = document.querySelector<HTMLElement>(`[data-place="play:${part}"]`);
      if (!el) return;
      if (el instanceof HTMLDetailsElement) el.open = true;
      el.scrollIntoView({ block: 'nearest' });
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 1200);
    });
  });

  return {
    get allIn() {
      return allIn;
    },
    get asksNow() {
      return asksNow;
    },
    get checks() {
      return checks;
    },
    get checksReady() {
      return checksReady;
    },
    get fixAt() {
      return fixAt;
    },
    get joined() {
      return joined;
    },
    get joinedText() {
      return joinedText;
    },
    get keptGame() {
      return keptGame;
    },
    get keptLoses() {
      return keptLoses;
    },
    get keptRoom() {
      return keptRoom;
    },
    get keptWhere() {
      return keptWhere;
    },
    get phoneUsesNow() {
      return phoneUsesNow;
    },
    get phonesIn() {
      return phonesIn;
    },
    get pregameTeams() {
      return pregameTeams;
    },
    get roomUp() {
      return roomUp;
    },
    get rowPhone() {
      return rowPhone;
    },
    get soonLeft() {
      return soonLeft;
    },
    get stream() {
      return stream;
    },
    get streamGistNow() {
      return streamGistNow;
    },
    get untitled() {
      return untitled;
    },
    get wantAudience() {
      return wantAudience;
    },
    get warnings() {
      return warnings;
    },
    get askCloseAud() {
      return askCloseAud;
    },
    set askCloseAud(v: boolean) {
      askCloseAud = v;
    },
    get renaming() {
      return renaming;
    },
    set renaming(v: boolean) {
      renaming = v;
    },
    get showSettings() {
      return showSettings;
    },
    set showSettings(v: boolean) {
      showSettings = v;
    },
    get startAsk() {
      return startAsk;
    },
    set startAsk(v: typeof startAsk) {
      startAsk = v;
    },
    get soonMinutes() {
      return soonMinutes;
    },
    set soonMinutes(v: number) {
      soonMinutes = v;
    },
    get roomLine() {
      return roomLine;
    },
    set roomLine(v: HTMLElement | undefined) {
      roomLine = v;
    },
    get roster() {
      return roster;
    },
    set roster(v: typeof roster) {
      roster = v;
    },
    addSamplePlayers,
    cardLabel,
    editorHasIt,
    fields,
    lineAnswer,
    partnerShort,
    pickDisplay,
    placeDailyDoubles,
    placePartnerTiles,
    pregameKey,
    raiseMost,
    recheckNow,
    rename,
    resumeKept,
    showAsks,
    setStream,
    startAnyway,
    startClicked,
    startRoomHere,
    streamFold,
    teamMembers,
    tipsShown,
    titleFocus,
    toChecks,
  };
}
