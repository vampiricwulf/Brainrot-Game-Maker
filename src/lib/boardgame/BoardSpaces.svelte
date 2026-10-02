<!--
  A board game's spaces and the links between them, drawn in 1920×1080 board coordinates over the backdrop. Viewers
  see a secret space as a plain "?" until the host reveals it, and a space's name only when its box is ticked (the host,
  editing, sees every name: the ones viewers don't see dimmed).
-->
<script lang="ts">
  import { textOn } from '../colors';
  import { mediaUrls } from '../media.svelte';
  import type { BoardGameRound, BoardSpace } from '../model';
  import { SLIDE_H, SLIDE_W } from '../model';
  import { nameShown } from '../boardgame';

  let {
    round,
    audience = false,
    revealed = [],
    selected = [],
    marked = [],
    lit = null,
    ondown,
    tabStop = null,
    allNames = false,
  }: {
    round: BoardGameRound;
    /** Viewers: secret spaces show as "?" and host notes never show. */
    audience?: boolean;
    revealed?: string[];
    /** Editor: the selected spaces. */
    selected?: readonly string[];
    /** Play, the host's copy: the spaces the host can pick to move on to (a fork's ways), outlined. */
    marked?: string[];
    /** Play, the host's copy: the space a dragged token is over. */
    lit?: string | null;
    /** Editor: a space was pressed (to select or drag it). */
    ondown?: (e: PointerEvent, space: BoardSpace) => void;
    /** Editor: the space Tab goes to (the others take the focus by the arrow keys: the board is one tab stop). */
    tabStop?: string | null;
    /** The host editing the board: every space's name shows, the ones viewers don't see dimmed. */
    allNames?: boolean;
  } = $props();

  const R = 58;
  const hidden = (s: BoardSpace) => audience && !!s.secret && !revealed.includes(s.id);
  const byId = $derived(new Map(round.spaces.map((s) => [s.id, s])));

  /** Whether a space's name shows under it here (viewers: when ticked; the host editing: always). */
  const labelled = (s: BoardSpace) => !hidden(s) && (nameShown(s) || allNames);
  /** The bottom of a space's name, below its center (board px). */
  const LABEL_BOTTOM = 112;

  /**
   * How far from a space's center a link to or from it stops: at the edge of its circle, or, coming in from below,
   * past the name under it (else the name hides the arrowhead). (ux, uy): the way from the space along the link.
   */
  function clear(s: BoardSpace, ux: number, uy: number): number {
    const edge = R + 6;
    if (!labelled(s) || uy <= 0) return edge;
    // The name's box: about 16 board px a letter (Anton at 30px), from just under the circle down to LABEL_BOTTOM.
    const half = (s.name.length * 16 + 40) / 2;
    const t = Math.min(LABEL_BOTTOM / uy, Math.abs(ux) > 1e-6 ? half / Math.abs(ux) : Infinity);
    return Math.max(edge, t + 4);
  }

  /** A link from a to b, stopping at the edge of each circle (or past a name in the way). */
  function line(a: BoardSpace, b: BoardSpace) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d;
    const uy = dy / d;
    const ka = Math.min(clear(a, ux, uy), d / 2 - 4);
    const kb = Math.min(clear(b, -ux, -uy), d / 2 - 4);
    return { x1: a.x + ux * ka, y1: a.y + uy * ka, x2: b.x - ux * kb, y2: b.y - uy * kb };
  }
</script>

<svg class="links" viewBox="0 0 {SLIDE_W} {SLIDE_H}" aria-hidden="true">
  <defs>
    <marker id="bg-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="#fff" />
    </marker>
  </defs>
  {#each round.spaces as a (a.id)}
    {#each a.next as n (n)}
      {@const b = byId.get(n)}
      <!-- A link both ways is one line with an arrow at each end (drawn once, from the space listed first). -->
      {@const both = !!b?.next.includes(a.id)}
      {#if b && (!both || round.spaces.indexOf(a) < round.spaces.indexOf(b))}
        {@const l = line(a, b)}
        <line {...l} class="shadow" />
        <line {...l} class="link" marker-end="url(#bg-arrow)" marker-start={both ? 'url(#bg-arrow)' : undefined} />
        <!-- Editor: a wide line to right-click (the link's menu). -->
        {#if ondown}<line {...l} class="hit" data-link="{a.id}>{b.id}" />{/if}
      {/if}
    {/each}
  {/each}
</svg>
{#each round.spaces as s (s.id)}
  {@const h = hidden(s)}
  {@const bg = h ? '#555' : s.color}
  <!-- (In the editor it's a button: role and tabindex are only set there.) -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="space"
    class:sel={selected.includes(s.id)}
    class:marked={marked.includes(s.id)}
    class:lit={lit === s.id}
    class:start={(round.start ?? round.spaces[0]?.id) === s.id}
    class:secret={!audience && s.secret}
    class:grab={!!ondown}
    style:left="{s.x}px"
    style:top="{s.y}px"
    style:background={bg}
    style:color={textOn(bg)}
    onpointerdown={ondown ? (e) => ondown(e, s) : undefined}
    role={ondown ? 'button' : undefined}
    aria-roledescription={ondown ? 'space' : undefined}
    aria-label={ondown ? s.name : undefined}
    aria-pressed={ondown ? selected.includes(s.id) : undefined}
    tabindex={ondown ? (s.id === tabStop ? 0 : -1) : undefined}
    data-space={s.id}
    data-place="space:{s.id}"
  >
    {#if h}
      <span class="q">?</span>
    {:else if s.icon && mediaUrls[s.icon]}
      <img src={mediaUrls[s.icon]} alt="" />
    {:else if s.mark}
      <span class="mark">{s.mark}</span>
    {/if}
    <!-- (No numbers in the circles: a board's spaces aren't counted out loud; their names show when ticked.) -->
    {#if labelled(s)}
      <!-- (Absolutely placed under the circle: a hidden name leaves the board as it is.) -->
      <span class="label" class:off={!nameShown(s)} data-name-hidden={nameShown(s) ? undefined : ''}>{#if !nameShown(s)}<span class="eye" aria-hidden="true">⊘</span>{/if}{s.name}</span>
    {/if}
  </div>
{/each}

<style>
  .links {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  .link {
    stroke: #fff;
    stroke-width: 8;
  }
  .hit {
    stroke: transparent;
    stroke-width: 40;
    pointer-events: stroke;
  }
  .shadow {
    stroke: rgba(0, 0, 0, 0.6);
    stroke-width: 14;
  }
  .space {
    position: absolute;
    width: 116px;
    height: 116px;
    margin: -58px 0 0 -58px;
    border-radius: 50%;
    border: 6px solid #000;
    box-shadow: 0 6px 12px rgba(0, 0, 0, 0.5);
    display: grid;
    place-items: center;
    font-family: 'Anton', 'Oswald', sans-serif;
  }
  .space.grab {
    cursor: grab;
    touch-action: none;
  }
  /* (Board px: the board is scaled down in the editor.) */
  .space.grab:focus {
    outline: none;
  }
  .space.grab:focus-visible {
    box-shadow: 0 0 0 10px #fff, 0 0 0 18px #000, 0 6px 12px rgba(0, 0, 0, 0.5);
  }
  .space.start {
    border-color: #fff;
    box-shadow: 0 0 0 6px #000, 0 6px 12px rgba(0, 0, 0, 0.5);
  }
  .space.sel {
    outline: 6px dashed #ffcc00;
    outline-offset: 6px;
  }
  .space.secret {
    border-style: dashed;
  }
  .space.marked {
    outline: 6px solid #ffcc00;
    outline-offset: 6px;
    animation: pulse 1s ease-in-out infinite alternate;
  }
  @keyframes pulse {
    to {
      outline-color: rgba(255, 204, 0, 0.35);
    }
  }
  .space.lit {
    outline: 8px dashed #fff;
    outline-offset: 6px;
    animation: none;
  }
  .q {
    font-size: 48px;
  }
  .mark {
    font-size: 60px;
    line-height: 1;
    font-family: system-ui, sans-serif;
  }
  img {
    width: 84px;
    height: 84px;
    object-fit: contain;
  }
  .label {
    position: absolute;
    top: 100%;
    margin-top: 6px;
    padding: 2px 10px;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    font-size: 30px;
    white-space: nowrap;
  }
  /* The host's view of a name viewers don't see. */
  .label.off {
    opacity: 0.55;
    font-style: italic;
    background: rgba(0, 0, 0, 0.45);
    outline: 2px dashed rgba(255, 255, 255, 0.6);
  }
  .eye {
    margin-right: 6px;
    font-style: normal;
  }
</style>
