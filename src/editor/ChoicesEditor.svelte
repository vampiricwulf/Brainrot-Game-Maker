<!--
  A ✍ clue's (or a Final's) multiple choices in its editor: ＋ Multiple choice starts A to D, then each choice's words,
  ✔ Right (at most one, and it can be taken off), ▲ / ▼ and ✕, ＋ Choice up to CHOICES_MAX, and Take the choices off.
  Each change is a step named by the letters as they were ("Deleted choice C of Memes $400"); typing goes to the history
  watcher ("Edited choice B of Memes $400"). Lettered by place, as the host types them (in play, those with no words are
  left out: the checklist warns about them).
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { step as record, type StepOptions } from '../lib/history.svelte';
  import { moveTo } from '../lib/listedit';
  import { newId, type Choice } from '../lib/model';
  import { CHOICE_MAX, CHOICES_MAX } from '../lib/buzzproto';
  import { letter } from '../lib/choices';

  let {
    owner,
    where,
    place,
    final = false,
  }: {
    /** The clue (or the Final) whose choices they are. */
    owner: { choices?: Choice[] };
    /** It as the history names it: "Memes $400", "Final Jeopardy!". */
    where: () => string;
    /** Where its steps show (left out: where the change is). */
    place?: StepOptions['place'];
    /** A Final's: no ✔ Judge all there, the reveals say whether each pick is the right one. */
    final?: boolean;
  } = $props();
  const rightTitle = $derived(
    final ? 'The right answer: it lights up on stream with the answer, and the reveals say whether each pick is it' : 'The right answer: it lights up on stream with the answer, and ✔ Judge all marks everyone by it',
  );

  const list = $derived(owner.choices ?? []);
  let box = $state<HTMLElement>();
  /** The keys into choice `i`'s box (once it's drawn). */
  const focusBox = (i: number) => tick().then(() => box?.querySelector<HTMLInputElement>(`[data-field="choice-${i}"]`)?.focus());
  /** A step; `notify`: with "… · Undo" shown (typed words went, as deleting a card says). */
  const change = <T,>(label: string, fn: () => T, notify = false): T => record(label, fn, { ...(place ? { place } : {}), ...(notify ? { notify: true } : {}) });

  function start(): void {
    change(`Added multiple choice to ${where()}`, () => (owner.choices = Array.from({ length: 4 }, () => ({ id: newId(), text: '' }))));
    void focusBox(0);
  }
  function add(): void {
    if (list.length >= CHOICES_MAX) return;
    change(`Added choice ${letter(list.length)} to ${where()}`, () => (owner.choices ??= []).push({ id: newId(), text: '' }));
    void focusBox(list.length - 1);
  }
  function remove(i: number): void {
    change(
      `Deleted choice ${letter(i)} of ${where()}`,
      () => {
        owner.choices!.splice(i, 1);
        if (!owner.choices!.length) delete owner.choices;
      },
      !!list[i].text.trim(),
    );
    if (list.length) void focusBox(Math.min(i, list.length - 1));
  }
  function move(i: number, d: 1 | -1): void {
    change(`Moved choice ${letter(i)} of ${where()} ${d < 0 ? 'up' : 'down'}`, () => moveTo(owner.choices!, i, i + d));
    // (The keys stay on the same button of the row it moved to, or the other one at an end.)
    void tick().then(() => {
      const row = box?.querySelectorAll<HTMLElement>('[data-choice-row]')[i + d];
      const btn = row?.querySelector<HTMLButtonElement>(d < 0 ? '[data-up]' : '[data-down]');
      (btn && !btn.disabled ? btn : row?.querySelector<HTMLButtonElement>(d < 0 ? '[data-down]' : '[data-up]'))?.focus();
    });
  }
  function markRight(i: number): void {
    const c = list[i];
    change(c.right ? `Took the ✔ off ${letter(i)} on ${where()}` : `Marked ${letter(i)} right on ${where()}`, () => {
      const on = !c.right;
      for (const x of owner.choices!) delete x.right;
      if (on) owner.choices![i].right = true;
    });
  }
  function takeOff(): void {
    change(`Took the choices off ${where()}`, () => delete owner.choices, list.some((c) => c.text.trim()));
  }
  /** Enter: the next choice's box. */
  function key(e: KeyboardEvent, i: number): void {
    if (e.key !== 'Enter' || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.isComposing) return;
    e.preventDefault();
    if (i + 1 < list.length) void focusBox(i + 1);
  }
</script>

{#if !list.length}
  <div class="choice-opts start">
    <button class="ghost small" onclick={start} title="Players pick A, B, C or D on their phone instead of typing">＋ Multiple choice</button>
  </div>
{:else}
  <fieldset class="choice-opts" bind:this={box}>
    <legend>Multiple choice <span class="muted">(players pick one on their phone)</span></legend>
    <div class="rows">
      {#each list as c, i (c.id)}
        <div class="row" data-choice-row>
          <span class="letter" aria-hidden="true">{letter(i)}</span>
          <input
            dir="auto"
            maxlength={CHOICE_MAX}
            placeholder="Choice {letter(i)}"
            aria-label="Choice {letter(i)}"
            data-field="choice-{i}"
            value={c.text}
            oninput={(e) => (c.text = e.currentTarget.value)}
            onkeydown={(e) => key(e, i)}
          />
          <button
            class="small"
            class:good={!!c.right}
            aria-pressed={!!c.right}
            aria-label="✔ Right: choice {letter(i)}"
            onclick={() => markRight(i)}
            title={rightTitle}>✔ Right</button
          >
          <button class="ghost tiny" data-up onclick={() => move(i, -1)} disabled={i === 0} aria-label="Move choice {letter(i)} up">▲</button>
          <button class="ghost tiny" data-down onclick={() => move(i, 1)} disabled={i === list.length - 1} aria-label="Move choice {letter(i)} down">▼</button>
          <button class="ghost tiny" onclick={() => remove(i)} aria-label="Delete choice {letter(i)}">✕</button>
        </div>
      {/each}
    </div>
    <div class="foot">
      <button class="ghost small" onclick={add} disabled={list.length >= CHOICES_MAX} title={list.length >= CHOICES_MAX ? `${CHOICES_MAX} choices at most` : undefined}>＋ Choice</button>
      <button class="ghost small" onclick={takeOff}>Take the choices off</button>
      <span class="hint"
        >Players tap one on their phone (no typing) until you show the answer. On stream they show under the question (the slide is drawn a
        little smaller to make room), and the one marked ✔ Right lights up with the answer. Without phone buzzers, players say the letter.</span
      >
    </div>
  </fieldset>
{/if}

<style>
  .choice-opts {
    margin: 0;
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  .choice-opts.start {
    padding: 0;
    border: 0;
  }
  legend {
    padding: 0 4px;
    font-size: 13px;
  }
  legend .muted {
    font-size: 12px;
  }
  /* Two a line where there's room (A B / C D, as a quiz shows them), never three: six take three lines. */
  .rows {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(max(min(100%, 420px), 34%), 1fr));
    gap: 4px 16px;
  }
  .row {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .letter {
    flex: none;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--accent-fill);
    color: #fff;
    font-size: 12px;
    font-weight: 800;
  }
  .row input {
    flex: 1;
    min-width: 0;
  }
  .foot {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 10px;
    align-items: center;
    margin-top: 6px;
  }
</style>
