<!--
  Dice / wheel / roll-off / scoreboard buttons, usable any time (spec §6.6), 🤫 Send a card…, 🎭 Deal…, the cards out
  and the 🪟 card window (partner-clues spec §11, §12.2, §13.6), and 🔇 Stop sounds while a round intro may play.
-->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { anchored } from '../../lib/anchored';
  import { app, toast } from '../../lib/app.svelte';
  import type { Game, SentCard, Session } from '../../lib/model';
  import { openCategories, openCategoryWheel, openPlayerWheel, openQuickWheel, openTemplateWheel, openWheel, quickDice, rollDice, toggleScoreboard } from '../../lib/overlay';
  import { WHEEL_TEMPLATES } from '../../lib/wheeltemplates';
  import { parseDice, parseQuickWheel, QUICK_DICE } from '../../lib/tools';
  import { audience } from '../../lib/sync.svelte';
  import { cardsLeftOff } from '../../lib/buzz';
  import { buzzerOn, remote, roomHasCards, roomHasFiles } from '../../lib/remote.svelte';
  import { listedCards, sentCardId } from '../../lib/sentcards';
  import { cardWindow, closeCardWindow, openCardWindow } from '../../lib/cardwindow.svelte';
  import CardSend from './CardSend.svelte';
  import CardsOut from './CardsOut.svelte';
  import DealDialog from './DealDialog.svelte';
  import { sentLine } from './cardrow';

  let {
    game,
    session,
    dual = false,
    onrolloff,
    onstopsounds,
    oncardtakeback,
    ondealgone,
  }: {
    game: Game;
    session: Session;
    /** An audience window is open: viewers don't see this window. */
    dual?: boolean;
    onrolloff: (ids: string[], sides: number) => void;
    /** 🔇 Stop sounds: shown while the round intro's music may still be playing (it goes on until a tile opens). */
    onstopsounds?: () => void;
    /** ✖ Take back a card sent with 🤫 Send a card… or from a tile's panel. */
    oncardtakeback: (id: string) => void;
    /** A 🎭 deal's cards were taken back (✖ Take back, or a new deal). */
    ondealgone: (cards: SentCard[]) => void;
  } = $props();
  let menu = $state<'dice' | 'wheel' | 'rolloff' | 'card' | 'deal' | 'out' | 'win' | null>(null);
  /** Whose cards the 🪟 card window shows (names only). */
  const winName = $derived(cardWindow.open ? session.players.find((p) => p.id === cardWindow.seat)?.name : undefined);
  /**
   * The 🤫 cards out now (sent with Send a card… or from a tile's panel): the tools row says how many, never what. A 🎭
   * deal's are under 🎭 Deal….
   */
  const listed = $derived(listedCards(game, session));
  const out = $derived(listed.length);
  /**
   * A card out isn't all on the phones (a picture that didn't go up, a phone late for it…): its row in the list is
   * orange and says what, and so is this button, as nothing else in sight would say so once the send dialog is closed.
   */
  const outWarn = $derived.by(() => {
    if (!out) return false;
    const cardsOn = buzzerOn(game.settings) && !!remote.code && remote.status !== 'off' && remote.status !== 'error' && roomHasCards();
    const off = new Set(cardsOn ? cardsLeftOff(game, session) : []);
    return listed.some((c) => sentLine(game, session, c, cardsOn && roomHasFiles(), off.has(sentCardId(c)), cardsOn).warn);
  });
  let custom = $state('');
  let quickList = $state('');
  // Players left out of the roll-off; everyone else rolls (so players added or removed mid-game just work).
  let skipped = $state<string[]>([]);
  const who = $derived(session.players.filter((p) => !skipped.includes(p.id)).map((p) => p.id));
  let sides = $state<number | null>(untrack(() => game.settings.rollOffDie || 20));
  /** A die from d2 to d1000 (a blank box, or a d1 that would tie every round, can't be rolled). */
  const sidesOk = $derived(!!sides && sides >= 2 && sides <= 1000);

  /** On a board: how many of its categories have clues left (null: not on a board). */
  const cats = $derived(game.rounds[session.currentRound]?.mode === 'board' ? openCategories(game, session).length : null);

  /** The button that opened the menu: Esc gives it the focus back. */
  let opener: HTMLElement | null = null;

  /** Open (or close) a menu from its button. */
  function toggle(m: 'dice' | 'wheel' | 'rolloff' | 'card' | 'deal' | 'out' | 'win', e: MouseEvent): void {
    menu = menu === m ? null : m;
    opener = e.currentTarget as HTMLElement;
  }
  /**
   * Where a menu goes (see anchored.ts): up from its button, whole in the window and over everything else; in a single
   * window inside the host panel (it grows for it), so it doesn't cover the stage viewers see.
   */
  const at = $derived({ side: 'above' as const, gap: 6, within: audience.open ? null : '.panel' });

  /**
   * Close the menu after picking from it: the focus goes back to its button (else it would drop to the page, and the
   * keyboard would have to start over), or to the tool's own Roll! / Spin! (the panel's main button) when it's on screen.
   */
  function done(): void {
    menu = null;
    void tick().then(() => (document.querySelector<HTMLElement>('.panel [data-next]:not(:disabled)') ?? opener)?.focus());
  }

  function dice(sides: number, count: number, name?: string): void {
    rollDice(app.live, session, quickDice(sides, count, name));
    done();
  }

  /** Open a wheel, with its edit box open when `edit` (to change this spin's slices or chances first). */
  function wheel(open: () => void, edit = false): void {
    open();
    const o = app.live.overlay;
    if (o?.kind === 'wheel') o.editing = edit;
    done();
  }

  function quickWheel(edit: boolean): void {
    const options = parseQuickWheel(quickList);
    if (options.length < 2) return toast('Add at least two options');
    wheel(() => openQuickWheel(app.live, options), edit);
  }

  /**
   * 🪟 The card window for a player (from this click: a popup needs one). From 🤫 Send a card… the dialog stays open, so
   * the card can go to the window next; from the 🪟 button's own menu, it closes.
   */
  function cardWindowFor(id: string): void {
    if (!openCardWindow(id)) return void toast('The browser blocked the popup. Allow popups for this file and try again.', 5000);
    if (menu === 'win') done();
  }

  function rollCustom(): void {
    const d = parseDice(custom);
    if (d) dice(d.sides, d.count, custom.trim());
    else toast('Use dice notation like d20 or 2d6: 1–20 dice of 2–1000 sides');
  }
</script>

<!-- Esc closes an open menu (even from its text boxes) and does nothing else: no overlay closed, no clue left. -->
<svelte:window
  onkeydowncapture={(e) => {
    if (menu && e.key === 'Escape') {
      e.stopImmediatePropagation();
      menu = null;
      opener?.focus();
    }
  }}
/>

<!-- 🪟 The card window: open it for a player (or switch it to another), or close it. -->
{#snippet winPick()}
  <div class="muted small">
    <b>🪟 Card window</b>: a window with only one player’s 🤫 cards (pictures and videos too), for a player with no phone. Share just it with them (a Discord DM call), turn the laptop round, or put it on a second screen. Never share it with viewers.
  </div>
  <div class="row wins">
    {#each session.players as p (p.id)}
      <button class="small" aria-pressed={cardWindow.seat === p.id} aria-label="Card window for {p.name}" onclick={() => cardWindowFor(p.id)}>🪟 <span style:color={p.color}>●</span> {p.name}{cardWindow.seat === p.id ? ' ✓' : ''}</button>
    {/each}
    {#if cardWindow.open}
      <button class="small ghost" onclick={() => (closeCardWindow(), done())}>✖ Close the card window</button>
    {/if}
  </div>
{/snippet}

<div class="tl" class:open={!!menu}>
  <div class="pop">
    <button onclick={(e) => toggle('dice', e)} title={session.phase === 'boardgame' ? 'D rolls the round’s own dice (or spins its wheel)' : 'D rolls the last dice again'} aria-haspopup="dialog" aria-expanded={menu === 'dice'}>🎲 Dice</button>
    {#if menu === 'dice'}
      <div class="menu" role="dialog" aria-label="Dice" use:anchored={at}>
        <div class="grid">
          {#each QUICK_DICE as q}<button class="small" onclick={() => dice(q.sides, q.count, q.label)}>{q.label}</button>{/each}
        </div>
        <div class="row custom">
          <input placeholder="e.g. 3d37" bind:value={custom} onkeydown={(e) => e.key === 'Enter' && rollCustom()} />
          <button onclick={rollCustom}>Roll</button>
        </div>
        {#if game.dice.length}
          <div class="muted small">Saved dice</div>
          {#each game.dice as p (p.id)}
            <button class="small item" onclick={() => (rollDice(app.live, session, p), done())}>{p.name}</button>
          {/each}
        {/if}
      </div>
    {/if}
  </div>
  <div class="pop">
    <button onclick={(e) => toggle('wheel', e)} aria-haspopup="dialog" aria-expanded={menu === 'wheel'}>🎡 Wheel</button>
    {#if menu === 'wheel'}
      <div class="menu" role="dialog" aria-label="Wheels" use:anchored={at}>
        <div class="wl">
          <button
            class="small item"
            disabled={session.players.length < 2}
            title={session.players.length < 2 ? 'Needs at least two players' : 'A wheel of the players, in their colors'}
            onclick={() => wheel(() => openPlayerWheel(app.live, session))}>🎯 Pick a player</button>
          <button
            class="small ghost"
            disabled={session.players.length < 2}
            aria-label="Edit Pick a player, then spin"
            title="Leave players out or change their chances for this spin"
            onclick={() => wheel(() => openPlayerWheel(app.live, session), true)}>✎</button>
        </div>
        {#if cats !== null}
          <div class="wl">
            <button
              class="small item"
              disabled={cats < 2}
              title={cats < 2 ? 'Needs at least two categories with clues left' : 'A wheel of the categories with clues left'}
              onclick={() => wheel(() => openCategoryWheel(app.live, game, session))}>🗂 Pick a category</button>
            <button
              class="small ghost"
              disabled={cats < 2}
              aria-label="Edit Pick a category, then spin"
              title="Leave categories out or change their chances for this spin"
              onclick={() => wheel(() => openCategoryWheel(app.live, game, session), true)}>✎</button>
          </div>
        {/if}
        {#each game.wheels as w (w.id)}
          <div class="wl">
            <button class="small item" onclick={() => wheel(() => openWheel(app.live, session, w))}>{w.name}</button>
            <button
              class="small ghost"
              aria-label={`Edit ${w.name}, then spin`}
              title="Change slices or chances for this spin (the saved wheel stays as it is)"
              onclick={() => wheel(() => openWheel(app.live, session, w), true)}>✎</button>
          </div>
        {:else}
          <!-- (A play-only page has no editor to make them in.) -->
          <div class="muted small">
            {app.playerOnly ? 'No saved wheels in this game: use a ready-made or quick one.' : "No saved wheels yet: make them in the editor's 🎡 tab, or use a ready-made or quick one."}
          </div>
        {/each}
        <!-- Ready-made ones, spun as they are (✎ Edit wheel's Save as keeps one in the game). -->
        <select
          class="small"
          aria-label="Spin a ready-made wheel"
          value=""
          onchange={(e) => {
            const t = WHEEL_TEMPLATES.find((x) => x.key === e.currentTarget.value);
            e.currentTarget.value = '';
            if (t) wheel(() => openTemplateWheel(app.live, t, game.settings.currencySymbol));
          }}
        >
          <option value="">📋 Spin a ready-made wheel…</option>
          {#each WHEEL_TEMPLATES as t (t.key)}<option value={t.key}>{t.icon} {t.name}</option>{/each}
        </select>
        <div class="muted small">Quick wheel (one option per line)</div>
        <textarea rows="4" bind:value={quickList} placeholder={'Sing a song\nDo 10 push-ups x2\nSkip'} aria-label="Quick wheel options"></textarea>
        <div class="muted small">End a line with x2, x3… to make it that many times as likely.</div>
        <div class="row">
          <button class="small" onclick={() => quickWheel(false)}>Open quick wheel</button>
          <button class="small" onclick={() => quickWheel(true)} title="Open it with the edit box: colors, chances, and Save as">✎ Open & edit</button>
        </div>
      </div>
    {/if}
  </div>
  <div class="pop">
    <button onclick={(e) => toggle('rolloff', e)} title="O rolls for everyone" aria-haspopup="dialog" aria-expanded={menu === 'rolloff'}>🏁 Who goes first</button>
    {#if menu === 'rolloff'}
      <div class="menu" role="dialog" aria-label="Who goes first" use:anchored={at}>
        <div class="muted small">Everyone included rolls; tied leaders re-roll.</div>
        {#each session.players as p (p.id)}
          <label class="check small">
            <input
              type="checkbox"
              checked={who.includes(p.id)}
              onchange={(e) => (skipped = e.currentTarget.checked ? skipped.filter((x) => x !== p.id) : [...skipped, p.id])}
            />
            <span style:color={p.color}>●</span> {p.name}
          </label>
        {/each}
        <label class="check small">Die: d<input type="number" min="2" max="1000" bind:value={sides} class="n" /></label>
        <button
          class="primary small"
          disabled={who.length < 1 || !sidesOk}
          title={sidesOk ? '' : 'Pick a die from d2 to d1000'}
          onclick={() => {
            onrolloff(who, Math.round(sides!));
            done();
          }}>Roll for {who.length}</button>
      </div>
    {/if}
  </div>
  <div class="pop">
    <button onclick={(e) => toggle('card', e)} aria-haspopup="dialog" aria-expanded={menu === 'card'} title="🤫 Send a card…: a private card on some players’ phones, any time (one of your 🤫 Cards, a tile’s, or a quick one), or a 🪟 card window for one with no phone: only they see it, never on stream">🤫 <span class="word">Send a card…</span></button>
    {#if menu === 'card'}
      <div class="menu wide" role="dialog" aria-label="Send a card" use:anchored={at}>
        <CardSend {game} {session} {dual} />
        <div class="winpick">{@render winPick()}</div>
      </div>
    {/if}
  </div>
  <div class="pop">
    <button
      onclick={(e) => toggle('deal', e)}
      aria-haspopup="dialog"
      aria-expanded={menu === 'deal'}
      class:on={!!session.deal}
      title={session.deal?.shown
        ? '🎭 Who was who is on screen: click it on the stage, or 🙈 Hide it here'
        : session.deal
          ? `🎭 ${session.deal.name}: send it, take it back, or show Who was who`
          : '🎭 Deal…: secret parts for everyone (a spy, a wolf, a captain…), each on their own phone: nothing goes until you send it'}>🎭 <span class="word">Deal…</span></button
    >
    {#if menu === 'deal'}
      <div class="menu wide" role="dialog" aria-label="Deal" use:anchored={at}>
        <DealDialog {game} {session} {dual} ongone={ondealgone} />
      </div>
    {/if}
  </div>
  {#if out || menu === 'out'}
    <div class="pop">
      <button
        class="cardsout"
        class:warn={outWarn}
        onclick={(e) => toggle('out', e)}
        aria-haspopup="dialog"
        aria-expanded={menu === 'out'}
        data-cards-out-count={out}
        title={`🤫 ${out} card${out === 1 ? '' : 's'} out: ${outWarn ? '⚠ one isn’t all on the phones: open the list to see which, and what to do' : 'send one again, take it back'}`}>🤫 {out} <span class="word">card{out === 1 ? '' : 's'} out</span></button
      >
      {#if menu === 'out'}
        <div class="menu wide" role="dialog" aria-label="Cards out" use:anchored={at}>
          <CardsOut {game} {session} {dual} ontakeback={oncardtakeback} />
        </div>
      {/if}
    </div>
  {/if}
  <!-- (Its own button only while it's open, saying whose cards it shows: it's opened from 🤫 Send a card….) -->
  {#if winName || menu === 'win'}
    <div class="pop">
      <button onclick={(e) => toggle('win', e)} aria-haspopup="dialog" aria-expanded={menu === 'win'} class="on" title="The card window: show another player’s cards, or close it">🪟 {winName ? `Cards: ${winName}` : 'Card window'}</button>
      {#if menu === 'win'}
        <div class="menu" role="dialog" aria-label="Card window" use:anchored={at}>
          {@render winPick()}
        </div>
      {/if}
    </div>
  {/if}
  <button onclick={() => ((menu = null), toggleScoreboard(app.live))} title="Scores (S)">📊 <span class="name">Scores</span></button>
  {#if onstopsounds}
    <button class="stop" onclick={() => ((menu = null), onstopsounds())} title="🔇 Stop sounds (Shift+M): the game's sounds on stream, like the round intro's music">🔇 <span class="word">Stop sounds</span></button>
  {/if}
  {#if winName}
    <span class="warn small winwarn" role="status" data-card-window-warn>⚠ The 🪟 card window shows {winName}’s cards: share only the game window with viewers.</span>
  {/if}
</div>

{#if menu}<div class="backdrop" onclick={() => (menu = null)} role="presentation"></div>{/if}

<style>
  .tl {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  /* Up to 1240px wide: 🤫 and 🎭 alone (their tooltips say what they do, and they're still read out by name), so on the
     board the tools and the round's ◀ / picker / ▶ stay on one line, and the single-window stage keeps one size from
     the board to a clue. */
  @media (max-width: 1240px) {
    .tl .word {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
  /* (And up to 1280px wide 🔇 Stop sounds as 🔇 and the cards out as 🤫 2: they come and go beside 🤫 Send a card… and
     🎭 Deal… in full.) */
  @media (max-width: 1280px) {
    .tl :is(.stop, .cardsout) .word {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
  /* (Both at once, the round intro's music still on and cards out: 🔇 and 🤫 2 up to 1520px wide.) */
  @media (max-width: 1520px) {
    .tl:has(.stop):has(.cardsout) :is(.stop, .cardsout) .word {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
  /* (And up to 1000px wide 📊 Scores as 📊: room for 🔇 and 🤫 2 beside a Go to round with a long round name in it.) */
  @media (max-width: 1000px) {
    .tl .name {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
  .pop {
    position: relative;
  }
  /* Above the backdrop while a menu is open, so another tool's button switches menus in one click. (Only then: the
     📜 Log open over the panel stays over them.) */
  .open > .pop > button,
  .open > button {
    position: relative;
    z-index: 61;
  }
  /* Placed by anchored.ts (fixed to the window, over everything). */
  .menu {
    width: 260px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    overflow: auto;
  }
  .menu.wide {
    width: 380px;
    max-width: calc(100vw - 24px);
  }
  /* A short menu scrolls (its parts keep their size). */
  .menu > * {
    flex-shrink: 0;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
  }
  .item {
    text-align: left;
  }
  .wl {
    display: flex;
    gap: 4px;
  }
  .wl .item {
    flex: 1;
  }
  .small {
    font-size: 12px;
  }
  .n {
    width: 70px;
  }
  input:not([type]) {
    flex: 1;
    min-width: 0;
  }
  /* Roll as tall as its field, whatever its text size (beside the stage the column's buttons are smaller). */
  .custom > button {
    align-self: stretch;
  }
  .winpick {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
  }
  .wins {
    flex-wrap: wrap;
  }
  .winwarn {
    flex-basis: 100%;
    color: var(--warn);
  }
  .on {
    outline: 1px solid var(--accent);
  }
  .cardsout.warn {
    border-color: var(--warn);
    color: var(--warn);
  }
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 55;
  }
</style>
