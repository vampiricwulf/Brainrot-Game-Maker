<!-- Host-only controls (scoring, reveal, navigation). Never part of the audience view. -->
<script lang="ts">
  import { showMenu } from '../lib/menustate.svelte';
  import { textOn } from '../lib/colors';
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
  import { setPicker } from '../lib/toolset';
  import type { Snippet } from 'svelte';

  let {
    game,
    session,
    selected = $bindable(),
    amount = $bindable(),
    rpgObject = $bindable(null),
    rpgMap = $bindable(false),
    rpgAsk = $bindable(null),
    wagerLimitsOff = $bindable(false),
    timerSeconds = $bindable(null),
    bgSteps = $bindable(null),
    undoText = null,
    redoText = null,
    dual,
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
    onrolloff,
    onlog,
    onplayers,
    onhide,
    onexit,
    onaudience,
    onsound,
    oncloseoverlay,
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
    onrolloff?: (ids: string[]) => void;
    /** Open or close the 📜 Log (with a tab: open it on that tab). */
    onlog: (tab?: LogTab) => void;
    onplayers: () => void;
    onhide: () => void;
    onexit: () => void;
    onaudience: () => void;
    /** Open the streaming-sound help (Test sound, output device). */
    onsound: () => void;
    oncloseoverlay: () => void;
  } = $props();

  const info = $derived(currentClueInfo(session, game));
  const sym = $derived(game.settings.currencySymbol);
  const round = $derived(game.rounds[session.currentRound]);
  const finalRound = $derived(currentFinal(session, game));
  const done = $derived(session.phase === 'board' && !session.intro && roundComplete(session, game));
  const ddWager = $derived(session.phase === 'clue' && session.dd?.stage === 'splash');
  const scoring = $derived(awardOpen(session));
  // At the end the chips stay (scores can still be fixed) but there's nothing to award.
  const showPlayers = $derived((scoring || session.phase === 'end') && session.phase !== 'rpg' && session.phase !== 'boardgame');
  const introLabel = $derived(
    session.intro?.stage === 'title'
      ? 'Show board ▶'
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
  const finalStepText = {
    category: 'Category on screen',
    wagers: 'Taking wagers (only you see them)',
    question: 'Question on screen',
    answer: 'Answer on screen',
    reveal: 'Player reveals',
  } as const;
  /** Points were given for the open clue, so "Cancel (keep tile)" would let it be scored twice. */
  const cancelBlocked = $derived(!ddWager && !!info && clueScored(session, info.clue.id));
  const quickValue = $derived(session.dd?.stage === 'question' ? (session.dd.wager ?? 0) : (info?.value ?? 0));
  const awardLabel = $derived.by(() => {
    if (selected.length !== 1) return `＋ Award${selected.length ? ` (${selected.length})` : ''}`;
    const p = session.players.find((x) => x.id === selected[0]);
    return `＋ Award ${p?.name ?? ''}${amount ? ` +${formatPoints(Math.abs(amount), sym)}` : ''}`;
  });

  let editingScore = $state<string | null>(null);
  /** Exit was pressed: it asks inline (a browser dialog would show on stream). */
  let askExit = $state(false);

  function toggle(id: string): void {
    selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
  }

  function commitScore(id: string, value: string): void {
    const n = Number(value);
    if (value.trim() !== '' && Number.isFinite(n)) setScore(session, id, n);
    editingScore = null;
  }

  /** The quick ✔/✘ buttons: clue phase only, and during a Daily Double only for the player who found it. */
  const quickFor = (id: string) =>
    game.settings.deductOnWrong && session.phase === 'clue' && !!info && (session.dd?.stage !== 'question' || session.dd.playerId === id);
</script>

<div class="panel" class:dual>
  <div class="status row">
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
      {#if session.dd?.stage === 'question'}<span class="ddtag">DD {formatPoints(session.dd.wager ?? 0, sym)}</span>{/if}
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
      {#if info.clue.hostNotes && !dual}<span class="notes" title="Host notes">📝 {info.clue.hostNotes}</span>{/if}
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
      <span class="muted">{finalStepText[session.finalStep ?? 'category']}</span>
    {:else if session.phase === 'rpg'}
      <b>{round?.name}</b>
      <span class="muted hint">Move with the pad (numpad / Alt+arrows) · click objects on the stage · drag avatars</span>
    {:else if session.phase === 'boardgame'}
      <b>{round?.name}</b>
      <span class="muted hint">
        {round?.mode === 'boardgame' && round.mover.kind === 'step' ? 'Pick the way (→ buttons, or Enter when there’s one)' : 'D rolls or spins, then ▶ Move (Enter)'} · N
        next turn (Shift+N back) · click a player's name to select them
      </span>
    {:else if session.phase === 'tiebreaker'}
      <b>Tiebreaker</b>
      <span class="muted">Select the winner and press ＋ Award, then go back to the results.</span>
    {:else}
      <b>Game over</b>
      <span class="muted hint">Click a score to fix it.</span>
    {/if}
    {#if pickerPending}<span class="pending">Picker: press 1–{Math.min(9, session.players.length)}</span>{/if}
    <span class="spacer"></span>
    <TimerControls defaultSeconds={timerDefault} bind:custom={timerSeconds} />
  </div>

  {#if app.live.overlay}
    <div class="mode-host tools"><ToolsControls {game} {session} {selected} onclose={oncloseoverlay} /></div>
  {/if}

  <SoundWarnings {dual} onhelp={onsound} />
  <MediaControls {dual} />

  {#if session.phase === 'board' && session.intro}
    <div class="row">
      <button class="primary" onclick={onintronext} title="N">{introLabel}</button>
      <button class="ghost" onclick={onskipintro}>Skip intro</button>
    </div>
  {/if}

  {#if ddWager}
    {#key info?.clue.id}
      <DDControls {game} {session} onshow={onddshow} oncancel={oncancelclue} />
    {/key}
  {/if}

  {#if session.phase === 'final'}
    <div class="mode-host">
      <FinalControls {game} {session} armed={finishArmed} bind:override={wagerLimitsOff} onstep={onfinalstep} {onreveal} onback={onbackfromfinal} />
    </div>
  {/if}

  {#if session.phase === 'boardgame'}
    <div class="mode-host"><BoardHost {game} {session} bind:selected bind:steps={bgSteps} {dual} onhistory={() => onlog('history')} /></div>
  {/if}

  {#if session.phase === 'rpg'}
    <div class="mode-host">
      <RpgHost {game} {session} bind:selected bind:object={rpgObject} bind:mapOpen={rpgMap} bind:ask={rpgAsk} {dual} onhistory={() => onlog('history')} />
    </div>
  {/if}

  {#if session.phase === 'end'}
    <div class="mode-host"><EndControls {game} {session} {onrolloff} {ontiebreaker} onback={onbackfromend} {onrematch} /></div>
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
          oncontextmenu={(e) =>
            showMenu(e, [
              { heading: p.name },
              { label: on ? 'Deselect' : 'Select', onclick: () => toggle(p.id), disabled: !scoring },
              {
                label: session.currentPickerId === p.id ? '★ No picker' : '★ Make the picker',
                onclick: () => setPicker(session, session.currentPickerId === p.id ? undefined : p.id),
              },
              { label: '✎ Set the score…', onclick: () => (editingScore = p.id) },
            ])}
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
          {#if quickFor(p.id)}
            <button class="small right" onclick={() => onright(p.id)} title="Correct: award the value to {p.name} only">
              ✔ +{formatPoints(quickValue, sym)}
            </button>
            <button class="small wrong" onclick={() => onwrong(p.id)} title="Wrong: deduct the value from {p.name}">
              ✘ −{formatPoints(quickValue, sym)}
            </button>
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
      <button class="good" disabled={!selected.length || !amount} onclick={() => onaward(1)} title="Enter">
        {awardLabel}
      </button>
      <button class="bad" disabled={!selected.length || !amount} onclick={() => onaward(-1)} title="Shift+Enter">
        − Deduct
      </button>
      {#if selected.length}
        <button class="ghost" onclick={() => (selected = [])} title="Esc">Clear selection</button>
      {:else}
        <span class="muted hint">Pick who answered (1–{Math.min(9, session.players.length) || 9}, 0 for everyone), then Award ⏎ / Deduct ⇧⏎</span>
      {/if}
    </div>
  {/if}

  <div class="row nav">
    {#if session.phase === 'clue' && !ddWager}
      {#if !toolOnly}
        <button class:primary={!session.revealed} onclick={onreveal} title="R (press again to hide)">
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
    <button onclick={onaudience} class:on={dual} title="A opens or focuses it">{dual ? '📺 Close audience window' : '📺 Audience window'}</button>
    <button onclick={onsound} title="Test sound, sound output, and how to stream the sound (Discord, OBS)">🔊 Sound</button>
    <!-- Right-click either one for the whole history. -->
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
    <button onclick={() => onlog()} title="L: the history, scores and rolls">📜 Log</button>
    <button onclick={onplayers}>👥 Players</button>
    <button class:on={app.live.cover} onclick={() => (app.live.cover = !app.live.cover)} title="K: viewers see only a 'Be right back' card">⏸ Cover</button>
    <button onclick={onhide} title="H">Hide controls</button>
    {#if askExit}
      <InlineAsk
        text={session.phase === 'end' ? 'Leave the results screen? (Copy the results first if you want to keep them.)' : 'Leave this game? You can resume it from the editor.'}
        ok="Leave"
        cancel="Stay"
        danger
        onok={onexit}
        oncancel={() => (askExit = false)}
      />
    {:else}
      <button class="ghost" onclick={() => (askExit = true)}>Exit</button>
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
    font-size: 10px;
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
  .on {
    border-color: var(--accent);
    background: rgba(79, 124, 255, 0.25);
  }
  .divider {
    width: 1px;
    align-self: stretch;
    background: var(--border);
    margin: 0 4px;
  }
</style>
