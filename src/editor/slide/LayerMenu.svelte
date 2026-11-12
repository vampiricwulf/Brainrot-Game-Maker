<!--
  Right-click menu on the slide canvas (and the board images), in the editors' one order: the selection's name, the
  items stacked under the pointer to pick from (even one hidden under a bigger one or locked), its ✎ Edit and 🔁 Use
  another file…, ✎ Rename · ⧉ Duplicate · ✂ Cut · 📋 Copy · 📋 Paste, the restacks, then Align ▸, Lock, Hide while
  editing and its own extras, and 🗑 Delete last. On an empty spot it's the slide's own menu: ＋ Text here, 📋 Paste
  here, 📋 Copy slide, 📋 Paste over this slide, 🎨 Background… and Select all (the board's: Paste here, Select all).
-->
<script lang="ts">
  import { mediaUrls } from '../../lib/media.svelte';
  import type { Game, SlideElement } from '../../lib/model';
  import { LAYER_ICON, editWords, layerLabel, type Align, type LayerAction } from '../../lib/layerlabel';
  import { dropdown, menuKeys } from '../../lib/menustate.svelte';
  import { editOffer } from '../../lib/shrink/apply';

  let {
    x,
    y,
    stack,
    selected,
    game,
    hovered = $bindable(null),
    canPaste,
    canReplace = false,
    slideExtras,
    extras = [],
    where = 'This slide',
    onpick,
    onaction,
    onclose,
  }: {
    /** Where the menu opens (viewport px). */
    x: number;
    y: number;
    /** Items under the pointer, top-most first. */
    stack: SlideElement[];
    selected: SlideElement[];
    game: Game;
    hovered?: string | null;
    /** There are copied items to paste. */
    canPaste: boolean;
    /** 🔁 Use another picture… (video…, sound…) for one picture, video or sound. */
    canReplace?: boolean;
    /**
     * The slide editor's: ✎ Edit for every kind, ＋ Text here, the whole slide's 📋 Copy slide and 📋 Paste over this
     * slide (`canPasteSlide`: one is copied), and 🎨 Background…. `only`: the slide's one item (a new clue's text box),
     * whose ✎ Edit and Align ▸ lead the slide's menu.
     */
    slideExtras?: { canPasteSlide: boolean; only?: SlideElement };
    /** The selected item's own extras (an RPG object's 🤫 Secret and ＋ Add button…), before 🗑 Delete. */
    extras?: { label: string; title?: string; onclick: () => void }[];
    /** The empty spot's menu heading. */
    where?: string;
    onpick: (id: string) => void;
    onaction: (a: LayerAction) => void;
    onclose: () => void;
  } = $props();

  let w = $state(0);
  let h = $state(0);
  // Keep the whole menu on screen.
  const left = $derived(Math.max(4, Math.min(x, window.innerWidth - w - 4)));
  const top = $derived(Math.max(4, Math.min(y, window.innerHeight - h - 4)));
  const anyLocked = $derived(selected.some((e) => e.locked));
  const anyUnlocked = $derived(selected.some((e) => !e.locked));
  const unlocked = $derived(selected.filter((e) => !e.locked).length);
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  const key = (k: string) => menuKeys(k, mac);
  /** The one item it's for (the selection, or on an empty spot the slide's only item). */
  const one = $derived(selected.length === 1 ? selected[0] : !selected.length ? slideExtras?.only : undefined);
  /** A video's or sound's file ✎ edits here ('busy': not now). */
  const offer = $derived(one && (one.kind === 'video' || one.kind === 'audio') ? editOffer(game.media.find((m) => m.id === one.media)) : null);
  /**
   * What opens the one item's editor (as a double-click or Enter does): ✎ Edit image… and ✎ Edit video… / sound… in
   * both editors, the other kinds' (a text box's text, a link, a shape's fill…) in the slide editor.
   */
  const editing = $derived.by((): { words: string; action: LayerAction } | null => {
    const words = one ? editWords(one, offer) : null;
    if (!one || !words) return null;
    if (one.kind === 'image') return { words, action: 'edit-image' };
    if (offer) return { words, action: 'edit-media' };
    return slideExtras ? { words, action: 'edit' } : null;
  });
  /** One picture, video or sound: 🔁 Use another picture… (video…, sound…), as its panel says. */
  const replaces = $derived(canReplace && selected.length === 1 && (one?.kind === 'image' || one?.kind === 'video' || one?.kind === 'audio'));
  /** The items here to pick from: when stacked, or on an empty spot beside a text box's words (it's under there). */
  const picks = $derived(stack.length > 1 || (!selected.length && stack.length > 0));
  const ALIGNS: [Align, string][] = [['left', 'Left'], ['hcenter', 'Center'], ['right', 'Right'], ['top', 'Top'], ['vcenter', 'Middle'], ['bottom', 'Bottom']];
  /** Align ▸ is open. */
  let aligning = $state(false);

  function act(a: LayerAction): void {
    onaction(a);
    onclose();
  }
  /** The slide's one item's ✎ Edit or Align, from the slide's menu: it's selected first. */
  function actOnOnly(a: LayerAction): void {
    if (!selected.length && one) onpick(one.id);
    act(a);
  }
</script>

<!-- (The keys are dropdown's: the first item takes focus, arrows, Home/End, and Esc or Tab closes it.) -->
<svelte:window onblur={onclose} />

<div
  class="backdrop"
  onpointerdown={onclose}
  oncontextmenu={(e) => {
    e.preventDefault();
    onclose();
  }}
  role="presentation"
></div>
<div class="menu" style:left="{left}px" style:top="{top}px" bind:clientWidth={w} bind:clientHeight={h} role="menu" aria-label="Slide item menu" use:dropdown={onclose}>
  <div class="head">{selected.length > 1 ? `${selected.length} items` : selected.length ? layerLabel(selected[0], game) : where}</div>
  {#if picks}
    <div class="sub">Select an item here</div>
    {#each stack as el (el.id)}
      {@const thumb = el.kind === 'image' ? mediaUrls[el.editedMedia ?? el.media] : undefined}
      <button
        class="pick"
        class:on={selected.some((s) => s.id === el.id)}
        role="menuitemradio"
        aria-checked={selected.some((s) => s.id === el.id)}
        onclick={() => (onpick(el.id), onclose())}
        onpointerenter={() => (hovered = el.id)}
        onpointerleave={() => hovered === el.id && (hovered = null)}
      >
        {#if thumb}<img src={thumb} alt="" draggable="false" />{:else}<span class="ic">{LAYER_ICON[el.kind]}</span>{/if}
        <span class="txt">{layerLabel(el, game)}</span>
        {#if el.locked}<span class="muted">🔒</span>{/if}
      </button>
    {/each}
    <hr />
  {/if}
  {#snippet editItem(run: (a: LayerAction) => void)}
    {#if editing}
      <button
        role="menuitem"
        onclick={() => run(editing.action)}
        disabled={offer === 'busy'}
        title={offer === 'busy' ? 'Wait for it to finish (the header shows how far it got)' : undefined}>{editing.words}<kbd>Double-click / Enter</kbd></button
      >
    {/if}
  {/snippet}
  {#snippet alignItem(run: (a: LayerAction) => void, off: boolean, several: boolean)}
    <button role="menuitem" aria-haspopup="true" aria-expanded={aligning} onclick={() => (aligning = !aligning)} disabled={off}>
      Align<kbd>{aligning ? '▾' : '▸'}</kbd>
    </button>
    {#if aligning}
      <!-- One item lines up with the slide; several with each other. -->
      <div class="aligns" role="group" aria-label={several ? 'Line up the selected items' : 'Align to the slide'}>
        {#each ALIGNS as [how, label] (how)}<button role="menuitem" onclick={() => run(`align-${how}`)}>{label}</button>{/each}
        {#if unlocked > 2}
          <button role="menuitem" class="wide" onclick={() => run('align-hdistribute')}>Space evenly across</button>
          <button role="menuitem" class="wide" onclick={() => run('align-vdistribute')}>Space evenly down</button>
        {/if}
      </div>
    {/if}
  {/snippet}
  {#if selected.length}
    {#if editing || replaces}
      {@render editItem(act)}
      {#if replaces}<button role="menuitem" onclick={() => act('replace')} title="Only this item: the same file elsewhere stays as it is"
          >🔁 Use another {one?.kind === 'image' ? 'picture' : one?.kind === 'video' ? 'video' : 'sound'}…</button
        >{/if}
      <hr />
    {/if}
    <!-- (F2 renames in the Layers list; on a text box it edits its words, so it's not this item's key there.) -->
    <button role="menuitem" onclick={() => act('rename')} disabled={selected.length > 1}>✎ Rename{#if one && one.kind !== 'text'}<kbd>F2</kbd>{/if}</button>
    <button role="menuitem" onclick={() => act('duplicate')}>⧉ Duplicate<kbd>{key('Ctrl+D')}</kbd></button>
    <button role="menuitem" onclick={() => act('cut')} disabled={!anyUnlocked}>✂ Cut<kbd>{key('Ctrl+X')}</kbd></button>
    <button role="menuitem" onclick={() => act('copy')}>📋 Copy<kbd>{key('Ctrl+C')}</kbd></button>
    <button role="menuitem" onclick={() => act('paste')} disabled={!canPaste}>📋 Paste<kbd>{key('Ctrl+V')}</kbd></button>
    <hr />
    <button role="menuitem" onclick={() => act('front')}>⤒ Bring to front<kbd>{key('Ctrl+Shift+]')}</kbd></button>
    <button role="menuitem" onclick={() => act('forward')}>↑ Bring forward<kbd>{key('Ctrl+]')}</kbd></button>
    <button role="menuitem" onclick={() => act('backward')}>↓ Send backward<kbd>{key('Ctrl+[')}</kbd></button>
    <button role="menuitem" onclick={() => act('back')}>⤓ Send to back<kbd>{key('Ctrl+Shift+[')}</kbd></button>
    <hr />
    {@render alignItem(act, !anyUnlocked, selected.length > 1)}
    {#if anyUnlocked}<button role="menuitem" onclick={() => act('lock')}>🔒 Lock</button>{/if}
    {#if anyLocked}<button role="menuitem" onclick={() => act('unlock')}>🔓 Unlock</button>{/if}
    <button role="menuitem" onclick={() => act('hide')} title="Only here, while you edit: it still shows in the game">👁 Hide while editing</button>
    {#each extras as x (x.label)}<button role="menuitem" onclick={() => (x.onclick(), onclose())} title={x.title}>{x.label}</button>{/each}
    <hr />
    <button role="menuitem" class="danger" onclick={() => act('delete')} disabled={!anyUnlocked} title={anyUnlocked ? undefined : 'Locked: unlock it first'}>🗑 Delete<kbd>Delete</kbd></button>
  {:else}
    {#if slideExtras?.only}
      <!-- (The slide's one item, a new clue's text box: what it's most often right-clicked for costs nothing.) -->
      {@render editItem(actOnOnly)}
      {@render alignItem(actOnOnly, !!slideExtras.only.locked, false)}
      <hr />
    {/if}
    {#if slideExtras}
      <button role="menuitem" onclick={() => act('add-text')}>＋ Text here</button>
      <hr />
    {/if}
    <button role="menuitem" onclick={() => act('paste')} disabled={!canPaste}>📋 Paste here<kbd>{key('Ctrl+V')}</kbd></button>
    {#if slideExtras}
      <button role="menuitem" onclick={() => act('copy-slide')} title="The whole slide, to paste over another one or as a new slide by the slide tabs">📋 Copy slide</button>
      <button
        role="menuitem"
        onclick={() => act('paste-over')}
        disabled={!slideExtras.canPasteSlide}
        title={slideExtras.canPasteSlide ? 'Everything on this slide is replaced by the copied one (Undo brings it back)' : 'Copy a slide first (📋 Copy slide)'}>📋 Paste over this slide</button
      >
      <hr />
      <button role="menuitem" onclick={() => act('background')}>🎨 Background…</button>
    {/if}
    <button role="menuitem" onclick={() => act('select-all')}>Select all<kbd>{key('Ctrl+A')}</kbd></button>
  {/if}
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: calc(var(--z-menu) - 1);
  }
  .menu {
    position: fixed;
    z-index: var(--z-menu);
    min-width: 220px;
    max-width: 320px;
    max-height: calc(100vh - 8px);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    padding: 4px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  }
  /* The heading names what it's for, as the app's other menus do. */
  .head {
    padding: 4px 8px 2px;
    font-size: 12px;
    font-weight: 700;
    opacity: 0.7;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sub {
    padding: 4px 8px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
  }
  button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 8px;
    background: none;
    border: none;
    border-radius: 5px;
    text-align: left;
    font-size: 13px;
  }
  button:hover:not(:disabled) {
    background: var(--panel-2);
  }
  button.on {
    color: var(--accent);
    font-weight: 600;
  }
  button.danger {
    color: var(--bad);
  }
  kbd {
    margin-left: auto;
    padding-left: 16px;
    font-family: inherit;
    font-size: 12px;
    color: var(--muted);
  }
  .aligns {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2px;
    padding: 0 0 2px 16px;
  }
  .aligns button {
    justify-content: center;
    font-size: 12px;
  }
  .aligns .wide {
    grid-column: 1 / -1;
  }
  .pick img {
    width: 28px;
    height: 18px;
    object-fit: cover;
    border-radius: 3px;
    flex: none;
  }
  .ic {
    width: 28px;
    text-align: center;
    flex: none;
  }
  .txt {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  hr {
    width: 100%;
    border: none;
    border-top: 1px solid var(--border);
    margin: 4px 0;
  }
</style>
