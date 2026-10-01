<!-- Host-only controls (scoring, reveal, navigation). Never part of the audience view. -->
<script lang="ts">
  import { announce, announceChanges } from '../lib/announce';
  import { textOn } from '../lib/colors';
  import { takeFocus } from '../lib/modal';
  import { categoryLabel, finalName, formatPoints, isBoard, type Game, type Session } from '../lib/model';
  import { answerShowing, awardOpen, clueName, clueScored, currentClueInfo, currentFinal, findClueRef, roundComplete, score, setScore, toolOnlyClue, usedTiles } from '../lib/session';
  import MediaControls from './MediaControls.svelte';
  import SoundWarnings from './host/SoundWarnings.svelte';
  import TimerControls from './host/TimerControls.svelte';
  import DDControls from './host/DDControls.svelte';
  import FinalControls from './host/FinalControls.svelte';
  import EndControls from './host/EndControls.svelte';
  import ToolsControls from './host/ToolsControls.svelte';
  import RoundNav from './host/RoundNav.svelte';
  import InlineAsk from './host/InlineAsk.svelte';
  import RpgHost from './rpg/RpgHost.svelte';
  import type { RpgAsk } from './rpg/hostops';
  import BoardHost from './boardgame/BoardHost.svelte';
  import type { LogTab } from './ScoreLog.svelte';
  import { app } from '../lib/app.svelte';
  import { buzzerOn } from '../lib/remote.svelte';
  import { scoresWindow } from '../lib/sync.svelte';
  import type { Snippet } from 'svelte';

  let {
    game,
    session,
    selected = $bindable(),
    amount = $bindable(),
    rpgObject = $bindable(null),
    rpgMap = $bindable(false),
    rpgAsk = $bindable(null),
    rpgMapSend = $bindable(null),
    bgSpace = $bindable(null),
    editingScore = $bindable(null),
    wagerLimitsOff = $bindable(false),
    timerSeconds = $bindable(null),
    bgSteps = $bindable(null),
    undoText = null,
    redoText = null,
    dual,
    side = false,
    pickerPending = false,
    finishArmed = false,
    tools,
    onaward,
    onright,
    onwrong,
    onreveal,
    onback,
    oncancelclue,
    onreopen,
    onundo,
    onredo,
    onnextround,
    onprevround,
    ongotoround,
    onbackfromfinal,
    onbackfromend,
    onrematch,
    onintronext,
    onskipintro,
    onddshow,
    onfinalstep,
    ontiebreaker,
    ontiebreakerdone,
    oncowinners,
    onjudge,
    onrolloff,
    onlog,
    onplayers,
    onrules,
    onhide,
    onexit,
    onaudience,
    onscores,
    onsound,
    oncloseoverlay,
    onopenbuzzers,
    phonesDown = '',
    buzzExtra,
    phoneChip,
  }: {
    game: Game;
    session: Session;
    selected: string[];
    amount: number | null;
    /** RPG rounds: the object whose card is open (clicked on the stage). */
    rpgObject?: string | null;
    /** RPG rounds: the full map (jump anywhere) is open. */
    rpgMap?: boolean;
    /** RPG rounds: a name or text being asked for (text right-clicked onto the stage too). */
    rpgAsk?: RpgAsk | null;
    /** RPG rounds: the full map was opened to send these players somewhere (from their menu). */
    rpgMapSend?: { players: string[]; label: string } | null;
    /** Board-game rounds: the space whose card is open (clicked on the stage). */
    bgSpace?: string | null;
    /** The player whose score is being set (clicked here, or ✎ Set the score… in their menu). */
    editingScore?: string | null;
    /** Final wagers: "Ignore the limits" is ticked. */
    wagerLimitsOff?: boolean;
    /** Seconds typed in the timer box (T uses them too). */
    timerSeconds?: number | null;
    /** Board-game rounds: the steps to move (Enter moves them too). */
    bgSteps?: number | null;
    /** What ↶ Undo would take back next (null: nothing), and ↷ Redo bring back. */
    undoText?: string | null;
    redoText?: string | null;
    dual: boolean;
    /** RPG and board-game rounds on a wide window: the panel is a column beside the stage (see Play's `side`). */
    side?: boolean;
    /** P was pressed and the next number key picks the picker. */
    pickerPending?: boolean;
    /** Everyone in the final reveal is judged; the next N finishes the game. */
    finishArmed?: boolean;
    /** Extra tool buttons (dice, wheel…) rendered in the nav row. */
    tools?: Snippet;
    onaward: (sign: 1 | -1) => void;
    /** One-click correct answer for one player (awards the clue value or Daily Double wager). */
    onright: (playerId: string) => void;
    onwrong: (playerId: string) => void;
    onreveal: () => void;
    /** Done with the clue: back to the board, tile used. */
    onback: () => void;
    /** Back to the board without using up the tile. */
    oncancelclue: () => void;
    /** Put a used tile back on the board. */
    onreopen: (clueId: string) => void;
    onundo: () => void;
    onredo: () => void;
    onnextround: () => void;
    onprevround: () => void;
    /** Jump to any round (the round picker). */
    ongotoround: (index: number) => void;
    onbackfromfinal: () => void;
    onbackfromend: () => void;
    onrematch: () => void;
    onintronext: () => void;
    onskipintro: () => void;
    onddshow: (playerId: string, wager: number) => void;
    onfinalstep: () => void;
    /** Play the tiebreaker clue (from the end screen's tie). */
    ontiebreaker: () => void;
    ontiebreakerdone: () => void;
    /** The tied leaders were declared co-winners (the winner fanfare). */
    oncowinners?: () => void;
    /** The Final reveals: a player marked right or wrong (with its sound). */
    onjudge: (playerId: string, right: boolean) => void;
    onrolloff?: (ids: string[]) => void;
    /** Open or close the 📜 Log (with a tab: open it on that tab). */
    onlog: (tab?: LogTab) => void;
    onplayers: () => void;
    /** 📋 Game rules, mid-game (a window). */
    onrules: () => void;
    onhide: () => void;
    onexit: () => void;
    /** Open the audience window, or close it (the panel has asked first). */
    onaudience: () => void;
    /** Open or close the scores-only window (a lower third for OBS). */
    onscores: () => void;
    /** Open the streaming-sound help (Test sound, output device). */
    onsound: () => void;
    oncloseoverlay: () => void;
    /** Buzzer mode: open the buzzers (U), or for everyone (`all`, 0). */
    onopenbuzzers?: (all?: boolean) => void;
    /** Buzzer mode with no buzzer room to reach: why phones can't buzz (said instead of "Buzzers open"). */
    phonesDown?: string;
    /** Buzzer mode: what phones add to the buzzer row (later buzzes, the phones' status). */
    buzzExtra?: Snippet;
    /** Phone buzzers: the "📱 3/4" chip (its list of phones). */
    phoneChip?: Snippet;
  } = $props();

  const info = $derived(currentClueInfo(session, game));
  const sym = $derived(game.settings.currencySymbol);
  const round = $derived(game.rounds[session.currentRound]);
  const finalRound = $derived(currentFinal(session, game));
  const done = $derived(session.phase === 'board' && !session.intro && roundComplete(session, game));
  const ddWager = $derived(session.phase === 'clue' && session.dd?.stage === 'splash');
  const scoring = $derived(awardOpen(session));
  // (Off in a copy with no buzzer server, see buzzerOn.)
  const buzzing = $derived(buzzerOn(game.settings) && session.phase === 'clue' && !session.dd);
  const buzz = $derived(app.live.buzz);
  const lockedNames = $derived(
    (buzz?.lockedOut ?? [])
      .map((id) => session.players.find((p) => p.id === id)?.name)
      .filter(Boolean)
      .join(', '),
  );
  // At the end the chips stay (scores can still be fixed) but there's nothing to award.
  const showPlayers = $derived((scoring || session.phase === 'end') && session.phase !== 'rpg' && session.phase !== 'boardgame');
  const introLabel = $derived(
    session.intro?.stage === 'title'
      ? isBoard(round)
        ? 'Show board ▶'
        : 'Start the round ▶'
      : session.intro?.stage === 'fill'
        ? 'Reveal categories ▶'
        : `Reveal category ${(session.intro?.revealed ?? 0) + 1} of ${isBoard(round) ? round.categories.length : 0} ▶`,
  );
  const timerDefault = $derived(info?.clue.timerSeconds || game.settings.defaultTimerSeconds || 30);
  const used = $derived(session.phase === 'board' ? usedTiles(session, game) : []);
  // Only in the round it's from: reopening a tile of another round would change a board nobody is looking at.
  const lastClosedRef = $derived.by(() => {
    const ref = session.lastClosed && session.used[session.lastClosed] ? findClueRef(game, session.lastClosed) : null;
    return ref?.round === session.currentRound ? ref : null;
  });
  /** A wheel/dice tile with nothing to ask: no answer to reveal (closing the tool goes back to the board). */
  const toolOnly = $derived(session.phase === 'clue' && !!info && toolOnlyClue(info.clue));
  const finalStepText = $derived({
    category: 'Category on screen',
    // Single window: viewers see this window, the wager boxes too.
    wagers: dual ? 'Taking wagers (only you see them)' : 'Taking wagers (viewers can see them in this window)',
    question: 'Question on screen',
    answer: 'Answer on screen',
    reveal: 'Player reveals',
  });
  /** Points were given for the open clue, so "Cancel (keep tile)" would let it be scored twice. */
  const cancelBlocked = $derived(!ddWager && !!info && clueScored(session, info.clue.id));
  const quickValue = $derived(session.dd?.stage === 'question' ? (session.dd.wager ?? 0) : (info?.value ?? 0));
  /** 0 is an amount too: a Daily Double wagered at 0 (a 0 result), the tiebreaker's winner (no points). */
  const zeroOk = $derived(amount === 0 && ((session.phase === 'clue' && session.dd?.stage === 'question') || session.phase === 'tiebreaker'));
  const canAward = $derived(!!selected.length && (!!amount || zeroOk));
  const awardLabel = $derived.by(() => {
    if (selected.length !== 1) return `＋ Award${selected.length ? ` (${selected.length})` : ''}`;
    const p = session.players.find((x) => x.id === selected[0]);
    return `＋ Award ${p?.name ?? ''}${amount ? ` +${formatPoints(Math.abs(amount), sym)}` : ''}`;
  });

  const scoreFor = $derived(session.players.find((p) => p.id === editingScore));
  /** Exit was pressed: it asks inline (a browser dialog would show on stream). */
  let askExit = $state(false);
  /** 📺 Close audience window was pressed: it asks inline too (it's usually the stream capture). */
  let askCloseAudience = $state(false);
  $effect(() => {
    if (!dual) askCloseAudience = false;
  });

  function toggle(id: string): void {
    selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
  }

  function commitScore(id: string, value: string): void {
    const n = Number(value);
    if (value.trim() !== '' && Number.isFinite(n)) {
      setScore(session, id, n);
      announce(`${session.players.find((p) => p.id === id)?.name ?? 'Player'} now ${formatPoints(n, sym)}`);
    }
    editingScore = null;
  }

  /** The quick ✔/✘ buttons: clue phase only, and during a Daily Double only for the player who found it. */
  const quickFor = (id: string) =>
    game.settings.deductOnWrong && session.phase === 'clue' && !!info && (session.dd?.stage !== 'question' || session.dd.playerId === id);
</script>

<div class="panel" class:dual class:side class:slim={side && session.phase === 'final'}>
  <!-- What's going on, read out to screen readers as it changes (buttons and hints left out). -->
  <div class="status row" use:announceChanges>
    {#if session.phase === 'board'}
      <b>{round?.name}</b>
      {#if session.intro}
        <span class="muted">Round intro… <span class="hint">click the screen or press N to continue</span></span>
      {:else}
        <span class="muted">Pick a tile on the board.</span>
      {/if}
      {#if done}<span class="done">Round complete!</span>{/if}
      {#if lastClosedRef && session.lastClosed}
        {@const id = session.lastClosed}
        <button class="small ghost" onclick={() => onreopen(id)} title="Put the last tile you closed back on the board">
          ↶ Reopen {clueName(game, lastClosedRef)}
        </button>
      {/if}
      {#if used.length}
        <select
          class="small"
          aria-label="Reopen a used tile"
          title="Put a used tile back on the board (or right-click it on the board)"
          onchange={(e) => {
            const id = e.currentTarget.value;
            e.currentTarget.value = '';
            // Let go of the keys: shortcuts ignore a focused select, and arrow keys would reopen another tile.
            e.currentTarget.blur();
            if (id) onreopen(id);
          }}
        >
          <option value="">↶ Reopen a tile…</option>
          {#each used as t (t.id)}
            <option value={t.id}>{clueName(game, t.ref)}</option>
          {/each}
        </select>
      {/if}
    {:else if session.phase === 'clue' && info}
      <b>{categoryLabel(info.category)}</b>
      <span class="val">{formatPoints(info.value, sym)}</span>
      {#if session.dd?.stage === 'question'}
        {@const dd = session.dd}
        <span class="ddtag">DD {formatPoints(dd.wager ?? 0, sym)}</span>
        <button
          class="ghost small"
          onclick={() => (dd.shown = !dd.shown)}
          title={dual ? "Viewers don't see the wager until you show it" : 'Puts the wager on the slide (viewers can see this window anyway)'}
        >
          {dd.shown ? 'Hide wager' : 'Show wager'}
        </button>
      {/if}
      <span class="muted">·</span>
      {#if session.revealed}
        <span class="revealed">Answer is showing</span>
        <span class="muted hint">· click the slide to go back to the board</span>
      {:else if toolOnly}
        <span class="muted">No question on this tile</span>
      {:else if !ddWager}
        <span class="muted">Answer hidden</span>
        <span class="muted hint">· click the slide or press R to reveal</span>
      {/if}
      {#if info.clue.hostNotes && !dual}<span class="notes" title="Host notes: viewers can see them in this window">📝 {info.clue.hostNotes}</span>{/if}
      <!-- Up here, away from the nav row, so it's never hit by a double-click meant for something else. -->
      <button
        class="small ghost"
        onclick={oncancelclue}
        disabled={cancelBlocked}
        title={cancelBlocked
          ? 'Points were given for this clue: undo them first, or use Done ▶ board'
          : ddWager
            ? 'Esc: the question never showed, so the tile stays on the board'
            : 'Shift+Esc: back to the board without using up this tile'}
      >↩ Cancel (keep tile)</button>
    {:else if session.phase === 'final'}
      <b>{finalRound ? finalName(finalRound) : 'Final'}</b>
      {#if session.intro?.stage === 'title'}
        <!-- Its title card is up: viewers don't see the category yet. -->
        <span class="muted">Title card <span class="hint">· click the screen or press N to start the round</span></span>
      {:else}
        <span class="muted">{finalStepText[session.finalStep ?? 'category']}</span>
      {/if}
    {:else if (session.phase === 'rpg' || session.phase === 'boardgame') && session.intro?.stage === 'title'}
      <b>{round?.name}</b>
      <span class="muted">Title card <span class="hint">· click the screen or press N to start the round</span></span>
    {:else if session.phase === 'rpg'}
      <b>{round?.name}</b>
      <span class="muted hint">Move with the pad (numpad / Alt+arrows) · click objects on the stage · drag avatars</span>
    {:else if session.phase === 'boardgame'}
      <b>{round?.name}</b>
      <span class="muted hint">
        {round?.mode === 'boardgame' && round.mover.kind === 'step'
          ? 'Pick the way (→ buttons, the space, or Enter when there’s one)'
          : 'D rolls or spins, then ▶ Move (Enter)'} · N next turn (Shift+N back) · click a token to select them, drag it to send them
      </span>
    {:else if session.phase === 'tiebreaker'}
      <b>Tiebreaker</b>
      <span class="muted">Select the winner and press ＋ Award (Amount 0 settles the tie without points), then go back to the results.</span>
    {:else}
      <b>Game over</b>
      <span class="muted hint">Click a score to fix it.</span>
    {/if}
    {#if pickerPending}<span class="pending">Picker: press 1–{Math.min(9, session.players.length)}</span>{/if}
    <span class="spacer"></span>
    {@render phoneChip?.()}
    <TimerControls defaultSeconds={timerDefault} bind:custom={timerSeconds} />
  </div>

  <!-- A score asked for from the player's menu, where there are no score chips to type it into (RPG and board games). -->
  {#if scoreFor && !showPlayers}
    {#key scoreFor.id}
      <InlineAsk
        text="{scoreFor.name}’s score:"
        field="Score"
        value={String(score(session, scoreFor.id))}
        ok="✎ Set"
        onok={(v) => commitScore(scoreFor.id, v)}
        oncancel={() => (editingScore = null)}
      />
    {/key}
  {/if}

  {#if app.live.overlay}
    <div class="mode-host tools"><ToolsControls {game} {session} {selected} onclose={oncloseoverlay} /></div>
  {/if}

  <SoundWarnings {dual} onhelp={onsound} />
  <MediaControls {dual} />

  {#if session.intro}
    <div class="row">
      <button class="primary" onclick={onintronext} title="N">{introLabel}</button>
      <button class="ghost" onclick={onskipintro}>Skip intro</button>
    </div>
  {/if}

  {#if ddWager}
    {#key info?.clue.id}
      <DDControls {game} {session} {dual} onshow={onddshow} oncancel={oncancelclue} />
    {/key}
  {/if}

  <!-- (Not while its title card is up: the category isn't on screen yet.) -->
  {#if session.phase === 'final' && session.intro?.stage !== 'title'}
    <div class="mode-host">
      <FinalControls {game} {session} {dual} armed={finishArmed} bind:override={wagerLimitsOff} onstep={onfinalstep} {onreveal} {onjudge} onback={onbackfromfinal} />
    </div>
  {/if}

  {#if session.phase === 'boardgame'}
    <div class="mode-host">
      <BoardHost {game} {session} bind:selected bind:steps={bgSteps} bind:space={bgSpace} {dual} onhistory={() => onlog('history')} />
    </div>
  {/if}

  {#if session.phase === 'rpg'}
    <div class="mode-host">
      <RpgHost
        {game}
        {session}
        bind:selected
        bind:object={rpgObject}
        bind:mapOpen={rpgMap}
        bind:mapSend={rpgMapSend}
        bind:ask={rpgAsk}
        {dual}
        onhistory={() => onlog('history')}
      />
    </div>
  {/if}

  {#if session.phase === 'end'}
    <div class="mode-host"><EndControls {game} {session} {onrolloff} {ontiebreaker} {oncowinners} onback={onbackfromend} {onrematch} /></div>
  {/if}

  {#if showPlayers}
    <div class="players">
      {#each session.players as p, i (p.id)}
        {@const on = selected.includes(p.id)}
        <div
          class="p"
          class:on
          class:picker={session.currentPickerId === p.id}
          style:--c={p.color}
          role="group"
          aria-label={p.name}
          data-player-id={p.id}
        >
          {#if scoring}
            <button
              class="sel"
              onclick={() => toggle(p.id)}
              style:background={on ? p.color : undefined}
              style:color={on ? textOn(p.color) : undefined}
              aria-pressed={on}
              title="Toggle (key {i + 1})"
            >
              <span class="key">{i + 1}</span>
              {p.name}
            </button>
          {:else}
            <span class="sel name">{p.name}</span>
          {/if}
          {#if editingScore === p.id}
            <!-- svelte-ignore a11y_autofocus -->
            <input
              class="score-edit"
              type="number"
              autofocus
              value={score(session, p.id)}
              onfocus={(e) => e.currentTarget.select()}
              onkeydown={(e) => {
                if (e.key === 'Enter') commitScore(p.id, e.currentTarget.value);
                // Cancel: stop editing first, so the blur that follows doesn't commit the typed value.
                if (e.key === 'Escape') editingScore = null;
              }}
              onblur={(e) => editingScore === p.id && commitScore(p.id, e.currentTarget.value)}
            />
          {:else}
            <button class="score ghost" onclick={() => (editingScore = p.id)} title="Click to set this score">
              {formatPoints(score(session, p.id), sym)}
            </button>
          {/if}
          <!-- Just the marks (the value is in their names): the chips keep their width, so opening a clue doesn't wrap the
               row and shrink the stage. -->
          {#if quickFor(p.id)}
            <button
              class="small quick right"
              onclick={() => onright(p.id)}
              aria-label="Right: {p.name} +{formatPoints(quickValue, sym)}"
              title="Correct: award {formatPoints(quickValue, sym)} to {p.name} only">✔</button
            >
            <button
              class="small quick wrong"
              onclick={() => onwrong(p.id)}
              aria-label="Wrong: {p.name} −{formatPoints(quickValue, sym)}"
              title="Wrong: deduct {formatPoints(quickValue, sym)} from {p.name}">✘</button
            >
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  {#if scoring}
    <div class="row award">
      <label class="check">
        Amount
        <input
          type="number"
          bind:value={amount}
          onkeydown={(e) => {
            // Give the keys back to the shortcuts afterwards, so the next "2" selects a player instead of typing.
            if (e.key === 'Enter') {
              onaward(e.shiftKey ? -1 : 1);
              e.currentTarget.blur();
            } else if (e.key === 'Escape') e.currentTarget.blur();
          }}
        />
      </label>
      <button class="good" disabled={!canAward} onclick={() => onaward(1)} title="Enter">
        {awardLabel}
      </button>
      <button class="bad" disabled={!canAward || (session.phase === 'tiebreaker' && !amount)} onclick={() => onaward(-1)} title="Shift+Enter">
        − Deduct
      </button>
      {#if buzzing}
        <!-- Buzzer mode: the first one in answers, the others are locked out until the buzzers open again. -->
        {#if phonesDown && !selected.length && buzz?.phase !== 'answering'}
          <span class="phones-down" role="status">{phonesDown}</span>
        {/if}
        {#if buzz?.phase === 'armed' && !selected.length}
          {#if !phonesDown}
            <span class="muted hint">🔔 Buzzers open: the fastest phone answers (1–{Math.min(9, session.players.length) || 9} picks by hand)</span>
          {/if}
        {:else if !(buzz?.phase === 'answering' || selected.length)}
          <button class="primary" onclick={() => onopenbuzzers?.()} title="U: buzzers open for everyone who hasn't missed this clue">🔔 Open the buzzers</button>
          <span class="muted hint">Buzzers closed (number keys still pick)</span>
        {/if}
        <button class="ghost" onclick={() => onopenbuzzers?.(true)} title="0: nobody is locked out any more, and the buzzers open for everyone">↺ Reset buzzers</button>
        {#if lockedNames}<span class="muted hint">Missed: {lockedNames}</span>{/if}
        {@render buzzExtra?.()}
      {:else if selected.length}
        <button class="ghost" onclick={() => (selected = [])} title="Esc">Clear selection</button>
      {:else}
        <span class="muted hint">Pick who answered (1–{Math.min(9, session.players.length) || 9}, 0 for everyone), then Award ⏎ / Deduct ⇧⏎</span>
      {/if}
    </div>
  {/if}

  <div class="row nav">
    {#if session.phase === 'clue' && !ddWager}
      {#if !toolOnly}
        <!-- A clue just opened: the focus is here (not lost on the tile that went away). -->
        <button class:primary={!session.revealed} onclick={onreveal} title="R (press again to hide)" use:takeFocus>
          {session.revealed ? '🙈 Hide answer' : '👁 Reveal answer'}
        </button>
      {/if}
      <button class:primary={session.revealed} onclick={onback} title="Esc: back to the board (marks the tile used)">▦ Done ▶ board</button>
    {:else if session.phase === 'tiebreaker'}
      <button class:primary={!session.tiebreakerRevealed} onclick={onreveal} title="R (press again to hide)">
        {answerShowing(session) ? '🙈 Hide answer' : '👁 Reveal answer'}
      </button>
      <button onclick={ontiebreakerdone}>🏁 Back to results</button>
    {/if}
    {@render tools?.()}
    <span class="spacer"></span>
    {#if session.phase === 'board' || session.phase === 'rpg' || session.phase === 'boardgame'}
      <!-- Round navigation lives on the right, away from the clue buttons, so a double-click can't reach it. -->
      <!-- Fresh per round, so its click guard also covers the second half of a double-click on "Yes". -->
      {#key session.currentRound}
        <RoundNav {game} {session} onprev={onprevround} onnext={onnextround} ongoto={ongotoround} />
      {/key}
      <span class="divider" aria-hidden="true"></span>
    {/if}
    <button onclick={onsound} title="Test sound, sound output, and how to stream the sound (Discord, OBS)">🔊 Sound</button>
    <!-- Right-click either one for the whole history. Kept together when the row wraps. -->
    <span class="pair">
      <button
        onclick={onundo}
        oncontextmenu={(e) => (e.preventDefault(), onlog('history'))}
        disabled={!undoText}
        title={undoText ? `Undo: ${undoText} (Ctrl+Z · right-click: history)` : 'Nothing to undo'}>↶ Undo</button
      >
      <button
        onclick={onredo}
        oncontextmenu={(e) => (e.preventDefault(), onlog('history'))}
        disabled={!redoText}
        title={redoText ? `Redo: ${redoText} (Ctrl+Shift+Z · right-click: history)` : 'Nothing to redo'}>↷ Redo</button
      >
    </span>
    <button onclick={() => onlog()} title="L: the history, scores and rolls">📜 Log</button>
    <!-- The game's rules go with its players (Most players): a small button, so the row doesn't grow. -->
    <span class="pair">
      <button onclick={onplayers}>👥 Players</button>
      <button onclick={onrules} aria-label="📋 Game rules" title="📋 Game rules: scoring, most players, timers, the round intro">📋</button>
    </span>
    <button class="cover-toggle" class:on={app.live.cover} aria-pressed={!!app.live.cover} onclick={() => (app.live.cover = !app.live.cover)} title="K: viewers see only a 'Be right back' card">
      ⏸ Cover
    </button>
    <button onclick={onhide} title="H">🙈 Hide controls</button>
    <!-- Out here with Exit, away from the everyday buttons: closing it blacks out the stream capture, so it asks first. -->
    {#if askCloseAudience}
      <InlineAsk
        text="Close the audience window? Your stream capture goes black."
        ok="Close it"
        cancel="Keep it"
        danger
        onok={() => ((askCloseAudience = false), onaudience())}
        oncancel={() => (askCloseAudience = false)}
      />
    {:else}
      <!-- The scores-only window (a lower third for OBS) goes with it, as a small button so the row doesn't grow. -->
      <span class="pair">
        <button
          onclick={() => (dual ? (askCloseAudience = true) : onaudience())}
          class:on={dual}
          title={dual ? 'Close the audience window (A brings it to the front)' : 'A opens or focuses it'}
        >{dual ? '📺 Close audience window' : '📺 Audience window'}</button>
        <button
          onclick={onscores}
          class:on={scoresWindow.open}
          aria-label={scoresWindow.open ? 'Close the scores window' : 'Scores window'}
          title={scoresWindow.open
            ? 'Close the scores window'
            : 'Scores window: only the score plates and the countdown, for a lower-third capture in OBS (Shift+A)'}>▭</button
        >
      </span>
    {/if}
    {#if askExit}
      <InlineAsk
        text={session.phase === 'end' ? 'Leave the results screen? (Copy the results first if you want to keep them.)' : `Leave this game? You can resume it from the ${app.playerOnly ? 'start screen' : 'editor'}.`}
        ok="Leave"
        cancel="Stay"
        danger
        onok={onexit}
        oncancel={() => (askExit = false)}
      />
    {:else}
      <button class="ghost" onclick={() => (askExit = true)}>🚪 Exit</button>
    {/if}
  </div>
</div>

<style>
  .panel {
    background: var(--panel);
    border-top: 1px solid var(--border);
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    /* No overflow clipping: tool menus pop upward out of the panel (over the stage only with an audience window). The
       stage above shrinks instead, down to its floor, and the panel's tall parts scroll. */
    min-height: 0;
  }
  /* Single window: an open 🎲 / 🎡 / 🏁 menu may not cover the stage, so the panel grows to make room for it (the stage
     shrinks, down to its floor) and the buttons move to its foot. */
  .panel:not(.dual):has(:global(.tl .menu)) {
    min-height: min(62vh, 420px);
  }
  .panel:not(.dual):has(:global(.tl .menu)) > .nav {
    margin-top: auto;
  }
  .mode-host {
    min-height: 0;
    overflow: auto;
  }
  /*
    Beside the stage (RPG and board-game rounds on a wide window): a column the window's height, the round's controls
    scrolling in the middle and smaller nav buttons at its foot. An open 🎲 / 🎡 / 🏁 menu pops up over the column, never
    the stage.
  */
  .panel.side {
    width: clamp(420px, 28vw, 540px);
    flex-shrink: 0;
    border-top: none;
    border-left: 1px solid var(--border);
  }
  /* With an audience window the stage here is only a preview: the controls get more of the width (two player cards a
     row in RPG and board-game rounds, so less scrolling). */
  .panel.side.dual {
    width: clamp(420px, 36vw, 720px);
  }
  /* The Final's controls are narrow: the stage keeps more of the width. */
  .panel.side.slim {
    width: 420px;
  }
  /* The Final's steps keep their buttons in sight: the score chips under them give up their room (and scroll) first. */
  .slim > .players {
    flex-shrink: 1000;
    min-height: 0;
    overflow: auto;
  }
  .side > .nav,
  .side > .nav :global(.tl) {
    gap: 4px;
  }
  .side > .nav {
    margin-top: auto;
  }
  .side > .nav :global(:is(button, select)) {
    padding: 4px 8px;
    font-size: 12px;
  }
  .side .award .hint,
  .side .divider {
    display: none;
  }
  /* The player cards (RPG and board games) take the column's width and height: the round's box scrolls instead. */
  .side > .mode-host :global(.cards) {
    max-height: none;
  }
  .side > .mode-host :global(.cards > *) {
    flex-grow: 1;
  }
  /* Above a round's own box (RPG, board game, Final), the tools keep their height (a shop's "Short by…" answers) and
     that box scrolls instead. A tall wheel editor still scrolls in here. */
  .tools:has(~ .mode-host) {
    flex-shrink: 0;
    max-height: 45vh;
  }
  .val {
    color: var(--value);
    font-weight: 800;
  }
  .ddtag {
    background: #7a00ff;
    color: #fff;
    border-radius: 6px;
    padding: 1px 8px;
    font-weight: 700;
    font-size: 12px;
  }
  .done,
  .revealed {
    color: var(--good);
    font-weight: 600;
  }
  .hint {
    font-size: 12px;
  }
  .phones-down {
    font-size: 12px;
    color: var(--warn);
  }
  .notes {
    background: var(--panel-2);
    padding: 2px 8px;
    border-radius: 6px;
  }
  .pending {
    background: var(--warn);
    color: #000;
    border-radius: 6px;
    padding: 1px 8px;
    font-weight: 700;
    font-size: 12px;
  }
  .players {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .p {
    display: flex;
    align-items: center;
    gap: 4px;
    border: 2px solid var(--c);
    border-radius: 8px;
    padding: 3px;
  }
  .p.on {
    box-shadow: 0 0 0 2px var(--c);
  }
  .p.picker .sel::after {
    content: ' ★';
  }
  .sel {
    font-weight: 700;
    border: none;
  }
  .sel.name {
    padding: 6px 12px;
  }
  .key {
    font-size: 12px;
    opacity: 0.7;
    margin-right: 4px;
  }
  .score {
    font-weight: 700;
    min-width: 70px;
    border: none;
  }
  .score-edit {
    width: 100px;
  }
  .quick {
    padding: 4px 8px;
  }
  .right {
    color: var(--good);
  }
  .wrong {
    color: var(--bad);
  }
  .small {
    font-size: 12px;
  }
  select.small {
    padding: 2px 6px;
  }
  .award input {
    width: 110px;
  }
  /* ⏸ Cover while viewers see the card (not every .on: a selected player's chip is one too). */
  .cover-toggle.on {
    border-color: var(--accent);
    background: rgba(79, 124, 255, 0.25);
  }
  .pair {
    display: flex;
    gap: inherit;
  }
  .divider {
    width: 1px;
    align-self: stretch;
    background: var(--border);
    margin: 0 4px;
  }
</style>
