<!--
  A saved 🎭 deal (partner-clues spec §11): its parts (a name, how many get it, its 🤫 card, and whether the card shows a
  slice of the deal's wheel too), the wheel, and for teams whether it's dealt within each team. The host deals it in
  play from 🎭 Deal… in the tools row; nothing of it goes to anyone until they send it there.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { app } from '../../lib/app.svelte';
  import { step } from '../../lib/history.svelte';
  import { announce } from '../../lib/announce';
  import { countText, dealSetupProblems, newDealPart, partName } from '../../lib/deals';
  import { DEAL_PART_MAX, DEAL_PARTS_MAX, MAX_PLAYERS, setSlideText, slideText, type DealPart, type DealPreset } from '../../lib/model';
  import { cardSummary } from '../../lib/partner';
  import { moveTo } from '../../lib/listedit';
  import SlideModal from '../rpg/SlideModal.svelte';

  let { deal }: { deal: DealPreset } = $props();
  const game = $derived(app.game);
  const problems = $derived(dealSetupProblems(game, deal));
  const draws = $derived(deal.parts.some((p) => p.draw));
  let editing = $state<DealPart | null>(null);
  const COUNTS = Array.from({ length: MAX_PLAYERS + 1 }, (_, i) => i);

  let partsEl = $state<HTMLElement>();
  function focusName(id: string): void {
    void tick().then(() => partsEl?.querySelector<HTMLInputElement>(`[data-part="${id}"] input.pname`)?.focus());
  }
  function add(): void {
    if (deal.parts.length >= DEAL_PARTS_MAX) return;
    const p = newDealPart(deal.parts.length + 1);
    step(`Added part “${p.name}”`, () => deal.parts.push(p));
    focusName(p.id);
  }
  // Deleting is done at once: the note at the bottom offers Undo.
  function remove(i: number): void {
    const p = deal.parts[i];
    if (!p || deal.parts.length < 2) return;
    step(`Deleted part “${partName(p, i)}”`, () => deal.parts.splice(i, 1), { notify: true });
  }
  function move(i: number, j: number): void {
    const p = deal.parts[i];
    if (!p || j < 0 || j >= deal.parts.length) return;
    step(`Moved part “${partName(p, i)}” ${j < i ? 'up' : 'down'}`, () => moveTo(deal.parts, i, j));
    announce(`Part “${partName(p, i)}” moved to ${j + 1} of ${deal.parts.length}`);
  }
  // Each choice is one named step ("How many get Wolf in “Secret roles”: ×2"), as adding and moving a part are.
  function setCount(p: DealPart, i: number, to: string): void {
    const n = to === 'rest' ? 'rest' : Number(to);
    step(`How many get ${partName(p, i)} in “${deal.name}”: ${countText(n)}`, () => (p.count = n));
  }
  const DRAWS: Record<string, string> = { '': 'no wheel', shared: '+ the slice they all share', own: '+ a slice each' };
  function setDraw(p: DealPart, i: number, to: string): void {
    step(`${partName(p, i)}’s card in “${deal.name}”: ${DRAWS[to] ?? DRAWS['']}`, () => {
      if (to === 'own' || to === 'shared') p.draw = to;
      else delete p.draw;
    });
  }
  function setWheel(id: string): void {
    step(`“${deal.name}” draws from ${game.wheels.find((w) => w.id === id)?.name ?? 'no wheel'}`, () => (deal.wheel = id || undefined));
  }
  function setPerTeam(on: boolean): void {
    step(on ? `“${deal.name}” is dealt within each team` : `“${deal.name}” is dealt to everyone together`, () => (on ? (deal.perTeam = true) : delete deal.perTeam));
  }
</script>

<div class="de" data-deal-editor>
  <label class="field">Deal name<input bind:value={deal.name} /></label>
  <p class="muted small">
    Secret parts for everyone: in play, <b>🎭 Deal…</b> in the tools row gives each player one part, at random (or as you
    choose, with the audience window open), and each part's 🤫 card goes to its players' phones only when you send it.
    Afterwards <b>🎭 Who was who</b> shows everyone's part on screen.
  </p>

  <div class="parts" role="list" aria-label="Parts" bind:this={partsEl}>
    {#each deal.parts as part, i (part.id)}
      <div class="part" role="listitem" data-part={part.id}>
        <div class="row">
          <input class="pname" value={part.name} maxlength={DEAL_PART_MAX} placeholder="Part {i + 1}" aria-label="Part {i + 1}’s name" title="On their phone: “You’re the {partName(part, i)}”, and on screen in Who was who" oninput={(e) => (part.name = e.currentTarget.value)} />
          <select aria-label="How many get {partName(part, i)}" value={String(part.count)} onchange={(e) => setCount(part, i, e.currentTarget.value)}>
            {#each COUNTS as n (n)}<option value={String(n)}>{countText(n)}</option>{/each}
            <option value="rest">{countText('rest')}</option>
          </select>
          <button class="ghost small" onclick={() => move(i, i - 1)} disabled={i === 0} aria-label="Move {partName(part, i)} up">▲</button>
          <button class="ghost small" onclick={() => move(i, i + 1)} disabled={i === deal.parts.length - 1} aria-label="Move {partName(part, i)} down">▼</button>
          <button class="ghost small" onclick={() => remove(i)} disabled={deal.parts.length < 2} aria-label="Delete {partName(part, i)}" title={deal.parts.length < 2 ? 'A deal needs a part' : 'Delete part'}>🗑</button>
        </div>
        <div class="row">
          <input class="grow" value={slideText(part.card)} placeholder="What its card says (only its players see it)" aria-label="{partName(part, i)}’s card words" oninput={(e) => setSlideText(part.card, e.currentTarget.value)} />
          <button class="small" onclick={() => (editing = part)} title="Pictures, videos, sounds, links: on their phones under the words">Edit card…</button>
          <select aria-label="{partName(part, i)}’s card draws from the wheel" value={part.draw ?? ''} onchange={(e) => setDraw(part, i, e.currentTarget.value)}>
            <option value="">no wheel</option>
            <option value="shared">+ the slice they all share</option>
            <option value="own">+ a slice each</option>
          </select>
        </div>
        <div class="muted small">Card: {cardSummary(game, part.card)}{part.draw === 'shared' ? ', then the slice drawn for everyone who shares it' : part.draw === 'own' ? ', then their own slice of the wheel' : ''}</div>
      </div>
    {/each}
  </div>
  {#if deal.parts.length < DEAL_PARTS_MAX}<div class="row"><button onclick={add}>＋ Add part</button></div>{/if}

  {#if draws}
    <label class="field">🎡 Wheel its cards draw from
      <select value={deal.wheel ?? ''} onchange={(e) => setWheel(e.currentTarget.value)}>
        <option value="">Choose a saved wheel…</option>
        {#each game.wheels as w (w.id)}<option value={w.id}>{w.name}</option>{/each}
      </select>
    </label>
    <p class="muted small">“The slice they all share” is drawn once for the deal (🕵 the location everyone but the spy knows); “a slice each” gives each player their own (🧠 a prompt each), none twice while there are enough.</p>
  {/if}
  <label class="check"><input type="checkbox" checked={!!deal.perTeam} onchange={(e) => setPerTeam(e.currentTarget.checked)} /> Teams: deal within each team, to the people on it (a captain for each team)</label>

  {#each problems as p (p)}<p class="warn small" role="status">⚠ This deal: {p}</p>{/each}
</div>

{#if editing}
  <SlideModal slide={editing.card} title="🎭 {partName(editing, deal.parts.indexOf(editing))}’s card (on its players’ phones)" onclose={() => (editing = null)} />
{/if}

<style>
  .de {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 820px;
  }
  .parts {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .part {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px;
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  .pname,
  .grow {
    flex: 1;
    min-width: 0;
  }
  p {
    margin: 0;
  }
  .small {
    font-size: 12px;
  }
  .warn {
    color: var(--warn);
  }
</style>
