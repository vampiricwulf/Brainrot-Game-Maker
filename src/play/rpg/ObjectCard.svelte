<!--
  The host's card for an object clicked on the RPG stage: what it is, buttons for its class and its actions (nothing
  runs until pressed), who they're for, reveal/hide, and notes. Every change goes in the action log (undoable).
-->
<script lang="ts">
  import { toast } from '../../lib/app.svelte';
  import { textOn } from '../../lib/colors';
  import type { RunContext } from '../../lib/actions';
  import type { ObjectClass, Screen, SlideElement, World, WorldState } from '../../lib/model';
  import { audienceSees, classLabel, neverShown, OBJECT_CLASSES, override } from '../../lib/rpg';
  import { logged, statFields, statNumber } from '../../lib/toolset';
  import InlineAsk from '../host/InlineAsk.svelte';
  import { nameSecret, objectActs, objectName, objectSay, removeObject, setObjectShown, type ObjectAct } from './hostops';

  let {
    el,
    screen,
    world,
    st,
    ctx,
    dual = false,
    alias,
    onclose,
    onedit,
    onkeep,
  }: {
    el: SlideElement;
    screen: Screen;
    world: World;
    st: WorldState;
    ctx: RunContext;
    /** An audience window is open: viewers don't see this card. */
    dual?: boolean;
    /** One window, a secret object (see hiddenNames): what this card calls it ("🙈 Hidden object 1") until 👁 Show. */
    alias?: string;
    onclose: () => void;
    /** Open its screen in the live editor (to move, resize, restyle or fully set it up). */
    onedit?: () => void;
    /** Keep its screen (with this object) in the editor's game. */
    onkeep?: () => void;
  } = $props();

  const { game, session } = $derived(ctx);
  const o = $derived(st.objects[el.id]);
  const role = $derived(el.role);
  const seen = $derived(audienceSees(el, o));
  /** Its name is a secret in one window (a step about it says “a hidden object” there: objectSay). */
  const secretName = $derived(nameSecret(st, screen, el));
  // Who the buttons apply to: the players picked on this card, else the host's selected players, else everyone here.
  let chosen = $state<string[] | null>(null);
  const here = $derived(session.players.filter((p) => st.positions[p.id]?.screen === screen.id).map((p) => p.id));
  /** Picked by the host (on this card, or selected): null means nobody was, so it's for everyone here. */
  const picked = $derived(chosen ?? (ctx.selected.length ? ctx.selected : null));
  const who = $derived(picked ?? here);
  const title = $derived(objectName(el));
  /** 👁 Show pressed: its name and buttons here (in one window viewers see them too). */
  let unmasked = $state(false);
  /** One window (viewers see this card), a secret not revealed yet: its name and buttons wait for 👁 Show. */
  const masked = $derived(!dual && !!alias && !seen && !unmasked);
  const shownTitle = $derived(masked ? alias : title);
  const locked = $derived(o?.locked ?? role?.locked ?? false);
  const npcStats = $derived(o?.stats ?? role?.stats ?? []);

  /** Compare: a player number field against one of the NPC's stats (nothing more: no combat engine). */
  const numberFields = $derived(statFields(game).filter((f) => f.type === 'number'));
  let cmpField = $state('');
  /** The NPC stat picked (null: the one named like the player stat, else the first). */
  let cmpStat = $state<number | null>(null);
  // (A stat both have, and not HP when there's another: a fight compares Power, not health.)
  const shared = $derived(numberFields.filter((f) => npcStats.some((s) => s.name === f.name)));
  const cf = $derived(numberFields.find((f) => f.id === cmpField) ?? shared.find((f) => !/^(hp|health|life|lives)$/i.test(f.name.trim())) ?? shared[0] ?? numberFields[0]);
  const ns = $derived(cmpStat ?? Math.max(0, npcStats.findIndex((s) => s.name === cf?.name)));

  /** Its buttons, in the order (and the words) its menu lists them too. */
  const acts = $derived(objectActs(game, session, el.id, ctx, picked));

  /** A button pressed: it runs (a locked doorway asks first, here), says what it did, and the card closes when it's done with. */
  function press(a: ObjectAct, anyway = false): void {
    if (a.asks === 'locked' && !anyway) return void (lockedAsk = { act: a.id });
    const r = a.run();
    if (r.text) toast(r.text, 3000);
    if (r.close) onclose();
  }

  // Renaming or reclassing an object drawn on the screen changes the game being played: the undo puts it back. (A secret
  // one's steps never name it in one window: objectSay.)
  function rename(name: string): void {
    // (Its new name is the secret's too.)
    logged(session, `Rename ${title} to ${name}`, () => (el.name = name || undefined), game, secretName ? 'Rename a hidden object' : undefined);
  }

  /** Make it an item, a zone, a hazard…: the rest (actions, dialogue) is set up in the live editor. */
  function setClass(c: string): void {
    const [text, quiet] = objectSay(el, secretName, (n) => `${n}: ${classLabel(c as ObjectClass | '')}`);
    logged(
      session,
      text,
      () => {
        el.role = c ? { ...(el.role ?? {}), class: c as NonNullable<SlideElement['role']>['class'] } : undefined;
      },
      game,
      quiet,
    );
  }

  function toggle(id: string): void {
    const cur = picked ?? [];
    chosen = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  }

  function take(): void {
    const said = removeObject(game, session, el.id, !dual);
    if (said) toast(said, 3000);
    onclose();
  }

  /** A locked doorway's Go through asks first, inline (a browser dialog would show on stream). */
  let lockedAsk = $state<{ act: string } | null>(null);

  function npcStat(i: number, delta: number): void {
    const next = npcStats.map((s, j) => (j === i ? { ...s, value: s.value + delta } : { ...s }));
    const [text, quiet] = objectSay(el, secretName, (n) => `${n}: ${next[i].name} ${delta > 0 ? '+' : '−'}${Math.abs(delta)}`);
    logged(session, text, () => (override(st, el.id).stats = next), undefined, quiet);
  }
</script>

<div class="card" role="dialog" aria-label="Object: {shownTitle}">
  <div class="row head">
    <b>{shownTitle}</b>
    {#if role && !masked}<span class="cls">{classLabel(role.class)}</span>{/if}
    <span class="vis" class:off={!seen}>{seen ? '👁 Viewers see it' : dual ? '🙈 Hidden from viewers' : '🙈 Not on the stage (viewers can see this card)'}</span>
    <span class="spacer"></span>
    <button class="ghost small" onclick={onclose} aria-label="Close">✕</button>
  </div>
  {#if masked}
    <div class="row">
      <span class="muted small">Its name and buttons wait here: viewers see this panel.</span>
      <button class="small" onclick={() => (unmasked = true)} title="Shows them here (viewers see them too)">👁 Show</button>
    </div>
  {:else}
    {#if el.hostNotes}<div class="notes">📝 {el.hostNotes}</div>{/if}
    <div class="row setup">
      <input
        class="nm"
        value={el.name ?? ''}
        placeholder="Name"
        aria-label="Object name"
        onchange={(e) => rename(e.currentTarget.value.trim())}
        onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <!-- Let go of the keys after a pick: shortcuts ignore a focused select, and arrow keys would change the class again. -->
      <select
        value={role?.class ?? ''}
        onchange={(e) => {
          const v = e.currentTarget.value;
          e.currentTarget.blur();
          setClass(v);
        }}
        aria-label="Object class"
        title="What it is"
      >
        {#each OBJECT_CLASSES as [v, l, hint] (v)}<option value={v} title={hint}>{l}</option>{/each}
      </select>
      {#if onedit}<button class="small" onclick={onedit} title="Move, resize, restyle, or give it actions and dialogue">✎ Edit</button>{/if}
      {#if onkeep}<button class="small" onclick={onkeep} title="Save its screen, with this, in the game in the editor, so it's there next time">💾 Keep</button>{/if}
    </div>
    <div class="row who">
      <span class="muted small">For{picked ? '' : ' everyone here'}:</span>
      {#each session.players as p (p.id)}
        {@const on = !!picked?.includes(p.id)}
        <!-- Everyone here (nobody picked) is outlined, not filled: clicking one picks just them. -->
        <button
          class="chip"
          class:auto={!picked && here.includes(p.id)}
          style:border-color={p.color}
          style:background={on ? p.color : undefined}
          style:color={on ? textOn(p.color) : undefined}
          aria-pressed={on}
          onclick={() => toggle(p.id)}
        >
          {p.name}
        </button>
      {/each}
    </div>
    <div class="row btns">
      {#each acts as a (a.id)}
        <button class:small={a.small} disabled={a.disabled} title={a.title} onclick={() => press(a)}>{a.label}</button>
      {/each}
    </div>
    {#if lockedAsk && locked}
      {@const a = acts.find((x) => x.id === lockedAsk?.act)}
      {#if a}
        <!-- (The button is read before the ask is put away: `a` is looked up from lockedAsk, so after it's gone it's undefined.) -->
        <InlineAsk
          text="{title} is locked. Go through anyway?"
          ok="🚪 Go through"
          onok={() => {
            const act = a;
            lockedAsk = null;
            press(act, true);
          }}
          oncancel={() => (lockedAsk = null)}
        />
      {/if}
    {/if}
    {#if npcStats.length}
      <div class="row">
        {#each npcStats as s, i (i)}
          <span class="stat">
            {s.name} <b>{s.value}</b>
            <button class="tiny" onclick={() => npcStat(i, -1)} aria-label="{s.name} minus 1">−</button>
            <button class="tiny" onclick={() => npcStat(i, 1)} aria-label="{s.name} plus 1">+</button>
          </span>
        {/each}
      </div>
    {/if}
    {#if npcStats.length && numberFields.length}
      <div class="row cmp">
        <span class="muted small">Compare</span>
        <select class="tiny" value={cf?.id} onchange={(e) => ((cmpField = e.currentTarget.value), (cmpStat = null))} aria-label="Player stat">
          {#each numberFields as f (f.id)}<option value={f.id}>{f.name}</option>{/each}
        </select>
        <span class="muted small">vs</span>
        <select class="tiny" value={ns} onchange={(e) => (cmpStat = +e.currentTarget.value)} aria-label="{title} stat">
          {#each npcStats as s, i (i)}<option value={i}>{s.name}</option>{/each}
        </select>
        {#if cf}
          {#each who as id (id)}
            {@const pv = statNumber(game, session, id, cf)}
            {@const nv = npcStats[ns]?.value ?? 0}
            <span class="vs" class:win={pv > nv} class:lose={pv < nv}>
              {session.players.find((p) => p.id === id)?.name} {pv} vs {nv}
            </span>
          {/each}
        {/if}
      </div>
    {/if}
  {/if}
  <div class="row">
    <!-- (Hotspots, arrival points and no-go areas are the host's alone: a Reveal would do nothing.) -->
    {#if neverShown(el)}
      <span class="muted small">Never shown to viewers</span>
    {:else}
      <button class="small" onclick={() => setObjectShown(game, session, el.id, !seen)}>{seen ? '🙈 Hide from viewers' : '👁 Reveal to viewers'}</button>
    {/if}
    <button class="small ghost danger" onclick={take} title="Take it off the screen (Delete; Undo brings it back)">🗑 Remove</button>
    <span class="muted small">Drag avatars on the stage to move them{role?.class === 'item' || role?.class === 'currency' ? ', or this onto one to pick it up' : ''}.</span>
  </div>
</div>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    border: 1px solid var(--accent);
    border-radius: 8px;
    background: rgba(79, 124, 255, 0.08);
  }
  .row {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }
  .cls {
    font-size: 12px;
    padding: 1px 6px;
    border-radius: 6px;
    background: var(--panel-2);
  }
  .vis {
    font-size: 12px;
    color: var(--good);
  }
  .vis.off {
    color: var(--warn);
  }
  .setup .nm {
    flex: 1;
    min-width: 100px;
    padding: 2px 6px;
  }
  .setup select {
    padding: 2px 6px;
  }
  .notes {
    font-size: 12px;
    background: var(--panel-2);
    padding: 2px 8px;
    border-radius: 6px;
  }
  .chip {
    border-width: 2px;
    padding: 1px 8px;
    font-size: 12px;
  }
  .chip.auto {
    border-style: dashed;
  }
  .stat {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    border-radius: 6px;
    background: var(--panel-2);
    font-size: 12px;
  }
  .vs {
    font-size: 12px;
    padding: 1px 6px;
    border-radius: 6px;
    background: var(--panel-2);
  }
  .vs.win {
    color: var(--good);
  }
  .vs.lose {
    color: var(--bad);
  }
  .tiny {
    font-size: 12px;
    padding: 0 6px;
  }
  .small {
    font-size: 12px;
  }
</style>
