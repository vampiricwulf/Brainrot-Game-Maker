<!-- Host countdown controls (spec §6.6): in the status line where a countdown fits, and while one is up (T starts one any time). -->
<script lang="ts">
  import { tick } from 'svelte';
  import { app } from '../../lib/app.svelte';
  import { clockNow } from '../../lib/clocknow.svelte';
  import { announce } from '../../lib/announce';
  import { addTime, clockWords, startTimer, timerRemaining, toggleTimer } from '../../lib/live';

  /**
   * custom: the seconds typed in the box (bound, so T uses them too). onstart: a countdown was started or went on from
   * here (Start, ▶, ↺, Enter in the box), as T does: a 🤝 partner clue handing out its cards goes on with it. onhidden:
   * ✕ put the countdown away and these controls went with it (no countdown fits the moment), so the focus is the panel's.
   */
  let {
    defaultSeconds,
    custom = $bindable(null),
    onstart = () => {},
    onhidden = () => {},
  }: { defaultSeconds: number; custom?: number | null; onstart?: () => void; onhidden?: () => void } = $props();
  /** The countdown it starts: the seconds typed when they make one (1 to 3600), else the default. */
  const secs = $derived(custom != null && custom >= 1 ? Math.min(3600, Math.round(custom)) : defaultSeconds);
  // (The stage's clock and the go-on check read the same moment: see clockNow.)
  const now = $derived(clockNow());
  const t = $derived(app.live.timer);
  const left = $derived(t ? Math.ceil(timerRemaining(t, now)) : 0);

  /** Screen readers hear the time once, as with T and Shift+T (the running seconds are quiet). */
  function say(how: 'start' | 'more' | 'less'): void {
    if (app.live.timer) announce(clockWords(app.live.timer, how), 'clock');
  }
  /** Start (or restart) the countdown here, as T does. */
  function start(seconds: number): void {
    startTimer(app.live, seconds);
    onstart();
    say('start');
  }
  /** ▶ / ⏸: a countdown going on again counts as started. */
  function toggle(): void {
    toggleTimer(app.live);
    if (app.live.timer && app.live.timer.startedAt !== null) onstart();
    say('start');
  }
  /** −10 / +10: change the time left without starting over. */
  function more(seconds: number): void {
    addTime(app.live, seconds);
    say(seconds > 0 ? 'more' : 'less');
  }

  let box = $state<HTMLElement>();
  /** Hide it: the keys go on from its Start button (the ✕ that had them is gone), or, gone too, from the panel. */
  function hide(): void {
    app.live.timer = null;
    void tick().then(() => {
      const start = box?.querySelector<HTMLButtonElement>('button');
      if (start?.isConnected) start.focus();
      else onhidden();
    });
  }
</script>

<div class="tc row" bind:this={box}>
  <span class="muted" aria-hidden="true">⏱️</span>
  {#if t}
    <!-- A running countdown isn't read out every second by the status line; "Time's up" is, once, after a "·" as the
         status line's other parts are (not run on from the words before it). -->
    {#if t.expired}<span class="sr-only">{'· '}</span>{/if}
    <b class="left" class:done={t.expired} data-quiet={t.expired ? undefined : ''}>{t.expired ? "Time's up" : `${left}s`}</b>
    <button
      class="small"
      onclick={toggle}
      disabled={t.expired}
      title={t.startedAt === null ? 'Go on with the countdown (T)' : 'Pause the countdown (T)'}
      aria-label={t.startedAt === null ? 'Start countdown' : 'Pause countdown'}
      >{#if t.startedAt === null}▶{:else}<span class="bars" aria-hidden="true"></span>{/if}</button
    >
    <!-- Change the time left without starting over. -->
    <button class="small ghost" onclick={() => more(-10)} disabled={t.expired} title="10 seconds less" aria-label="10 seconds less">−10</button>
    <button class="small ghost" onclick={() => more(10)} title="10 seconds more (Shift+T)" aria-label="10 seconds more">+10</button>
    <button class="small ghost" onclick={() => start(t.start ?? t.total)} title="Restart the countdown" aria-label="Restart countdown">↺</button>
    <!-- (The countdown box's corner ✕, as a notice's: no word, so the status line never wraps and shrinks the stage.) -->
    <button class="small ghost" onclick={hide} title="Hide the countdown" aria-label="Hide countdown">✕</button>
  {:else}
    <button class="small" onclick={() => start(secs)} title="T">Start {secs}s</button>
  {/if}
  <!-- Enter starts that countdown; Enter and Esc give the keys back to the shortcuts, as the Amount box does. -->
  <input
    type="number"
    min="1"
    max="3600"
    placeholder="secs"
    bind:value={custom}
    aria-label="Countdown seconds"
    onkeydown={(e) => {
      if (e.key === 'Enter') start(secs);
      if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
    }}
  />
</div>

<style>
  .tc {
    gap: 4px;
  }
  .left {
    font-variant-numeric: tabular-nums;
    min-width: 44px;
  }
  .done {
    color: var(--bad);
  }
  /* Pause: two bars, drawn, as the cover card's are (the ⏸ character is thin or missing in many fonts). The ▶'s size. */
  .bars {
    display: inline-block;
    width: 0.6em;
    height: 0.8em;
    vertical-align: -0.05em;
    background: linear-gradient(to right, currentColor 0 34%, transparent 34% 66%, currentColor 66%);
  }
  .small {
    font-size: 12px;
    padding: 3px 8px;
  }
  input {
    width: 64px;
    padding: 3px 6px;
  }
  /* A touch screen (no mouse): ▶ / ⏸, −10, +10, ↺, ✕, Start and the seconds box at least 32px to tap. They grow into
     the status line's gaps (about half the 8px between its lines, above and below), not the line, so it keeps its
     height and the moment's box under it its room (and HostPanel's .clockroom, the clock's room while it's away, stays
     as it was). */
  @media (hover: none) {
    .small {
      min-width: 32px;
      min-height: 32px;
      margin-block: -5px;
    }
    input {
      min-height: 32px;
      margin-block: -4px;
    }
  }
</style>
