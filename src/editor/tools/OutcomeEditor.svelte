<!-- Edit what a wheel slice / die face means: label, and optionally details, media, a timer and a score effect. -->
<script lang="ts">
  import { keepNum, shown } from './numbox';
  import { app } from '../../lib/app.svelte';
  import { imgFallback, mediaUrls } from '../../lib/media.svelte';
  import type { MediaKind, Outcome, ScoreAction } from '../../lib/model';
  import MediaPicker from '../slide/MediaPicker.svelte';
  import { mediaDrop } from '../../lib/mediadrop';
  import ActionListEditor from '../rpg/ActionListEditor.svelte';

  let {
    outcome,
    placeholder = 'Label',
    labelkey,
    dice = false,
  }: {
    outcome: Outcome;
    placeholder?: string;
    /** Keys in the label box (a wheel's Enter for the next slice). */
    labelkey?: (e: KeyboardEvent) => void;
    /** A die face or a dice total: "+ dice total × N" means something (a wheel has no roll). */
    dice?: boolean;
  } = $props();
  let open = $state(false);
  let picking = $state<MediaKind | null>(null);
  const media = $derived(outcome.media ? app.game.media.find((m) => m.id === outcome.media) : undefined);
  const extras = $derived(!!(outcome.details || outcome.media || outcome.timerSeconds || outcome.scoreAction || outcome.actions?.length));

  const ACTIONS: [ScoreAction['kind'], string][] = [
    ['addPoints', '+/− points'],
    ['addRollTimes', '+ dice total × N'],
    ['multiplyScore', 'Multiply score'],
    ['setScore', 'Set score (0 = bankrupt)'],
    ['steal', 'Steal points from someone'],
    ['swapScores', 'Swap scores with someone'],
  ];
  // (A wheel slice already saved with it keeps it listed, with a warning: the menu would show some other effect.)
  const actions = $derived(ACTIONS.filter(([k]) => k !== 'addRollTimes' || dice || outcome.scoreAction?.kind === 'addRollTimes'));

  function setAction(kind: string): void {
    const defaults: Record<string, ScoreAction> = {
      addPoints: { kind: 'addPoints', amount: 500 },
      addRollTimes: { kind: 'addRollTimes', multiplier: 100 },
      multiplyScore: { kind: 'multiplyScore', factor: 2 },
      setScore: { kind: 'setScore', amount: 0 },
      steal: { kind: 'steal', amount: 300 },
      swapScores: { kind: 'swapScores' },
    };
    outcome.scoreAction = defaults[kind];
  }
</script>

<div class="oe">
  <div class="row">
    <input class="label" bind:value={outcome.label} {placeholder} aria-label={placeholder} onkeydown={labelkey} />
    <button class="ghost small" class:has={extras} onclick={() => (open = !open)} title="Details, media, timer, score effect">
      {open ? '▾' : '▸'} More{extras ? ' •' : ''}
    </button>
  </div>
  {#if open}
    <div class="more">
      <label class="field">
        Details shown on reveal
        <textarea rows="2" value={outcome.details ?? ''} oninput={(e) => (outcome.details = e.currentTarget.value || undefined)}
          placeholder="e.g. Talk in an accent until your next correct answer"></textarea>
      </label>
      <div class="row">
        <span class="muted small">Media:</span>
        {#if media}
          {#if media.kind === 'image' && mediaUrls[media.id]}<img src={mediaUrls[media.id]} alt="" onerror={imgFallback} />{/if}
          <span class="small">{media.name}</span>
          <button class="ghost small" onclick={() => (outcome.media = undefined)} aria-label="Remove {media.name}" title="Remove">−</button>
        {/if}
        {#each ['image', 'video', 'audio'] as const as k}
          {@const what = k === 'image' ? 'a picture' : k === 'video' ? 'a video' : 'a sound'}
          <div class="pop">
            <button
              class="small"
              onclick={() => (picking = k)}
              use:mediaDrop={{ kind: ['image', 'video', 'audio'], onpick: (id) => (outcome.media = id) }}
              title="Add {what} (or drop one here)"
              aria-label="Add {what}"
            >{k === 'image' ? '🖼' : k === 'video' ? '🎬' : '🔊'}</button>
            {#if picking === k}
              <MediaPicker kind={k} onpick={(id) => ((outcome.media = id), (picking = null))} onclose={() => (picking = null)} />
            {/if}
          </div>
        {/each}
        <label class="check small">
          ⏱ Timer
          <input
            type="number"
            min="0"
            class="n"
            value={outcome.timerSeconds ?? ''}
            oninput={(e) => {
              // Blank or 0: no timer. (Not below 0: "Start -5s" would mean nothing.)
              const v = Math.round(+e.currentTarget.value);
              outcome.timerSeconds = v > 0 ? v : undefined;
            }}
          />s
        </label>
      </div>
      <label class="check small">
        <input type="checkbox" checked={!!outcome.scoreAction} onchange={(e) => (e.currentTarget.checked ? setAction('addPoints') : (outcome.scoreAction = undefined))} />
        Affects score (the host confirms before it applies)
      </label>
      {#if outcome.scoreAction}
        {@const a = outcome.scoreAction}
        <div class="row sub">
          <select value={a.kind} onchange={(e) => setAction(e.currentTarget.value)} aria-label="What it does to the score">
            {#each actions as [k, l]}<option value={k}>{l}</option>{/each}
          </select>
          {#if a.kind === 'addPoints' || a.kind === 'setScore'}
            <input type="number" class="n2" aria-label="Points" bind:value={() => a.amount, (v) => keepNum(v, (n) => (a.amount = n))} onchange={(e) => shown(e, a.amount)} />
          {:else if a.kind === 'addRollTimes'}
            × <input type="number" class="n2" aria-label="Times the roll" bind:value={() => a.multiplier, (v) => keepNum(v, (n) => (a.multiplier = n))} onchange={(e) => shown(e, a.multiplier)} />
            {#if !dice}<span class="warn small" role="status">A wheel has no dice roll: this never gives points. Pick another effect.</span>{/if}
          {:else if a.kind === 'multiplyScore'}
            × <input type="number" step="0.5" class="n2" aria-label="Times the score" bind:value={() => a.factor, (v) => keepNum(v, (n) => (a.factor = n))} onchange={(e) => shown(e, a.factor)} />
          {:else if a.kind === 'steal'}
            <input
              type="number"
              class="n2"
              min="0"
              aria-label="Points to steal"
              value={a.amount === 'all' ? '' : a.amount}
              disabled={a.amount === 'all'}
              oninput={(e) => keepNum(e.currentTarget.valueAsNumber, (n) => (a.amount = Math.abs(n)))}
              onchange={(e) => a.amount !== 'all' && shown(e, a.amount)}
            />
            <label class="check small"><input type="checkbox" checked={a.amount === 'all'} onchange={(e) => (a.amount = e.currentTarget.checked ? 'all' : 300)} /> all</label>
          {/if}
        </div>
      {/if}
      <div class="muted small">Buttons when it lands (the host presses them): move, stats, items, pop-ups…</div>
      <ActionListEditor bind:actions={outcome.actions} world={app.game.worlds?.[0]} />
    </div>
  {/if}
</div>

<style>
  /* Its label row sits in the row around it (a wheel slice, a die face), and "More" goes on a line of its own under
     that row, full width, when the row wraps. */
  .oe {
    display: contents;
  }
  .oe > .row {
    flex: 1;
    min-width: 0;
  }
  .label {
    flex: 1;
    min-width: 80px;
  }
  .has {
    color: var(--accent);
  }
  .more {
    order: 1;
    flex-basis: 100%;
    margin: 0 0 4px;
    padding: 8px;
    border-left: 2px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .pop {
    position: relative;
  }
  img {
    height: 26px;
    border-radius: 3px;
  }
  .n {
    width: 60px;
  }
  .n2 {
    width: 90px;
  }
  .sub {
    padding-left: 24px;
  }
</style>
