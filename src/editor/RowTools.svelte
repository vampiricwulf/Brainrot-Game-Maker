<!--
  The end of a list's row, one pattern in every list (stats, items, shops, buttons, zones, slices, deal parts, dice,
  choices): ⋯ opens the row's menu (the same as a right-click on the row, or Shift+F10 in it), then, after a gap, 🗑 in
  red. The row's ⋮⋮ grip is at its other end, and Alt+↑/↓ and Ctrl+D work from any field in it (see rowKeys).
-->
<script lang="ts">
  import { dropMenu, type MenuEntry } from '../lib/menustate.svelte';

  let {
    menu,
    name,
    remove,
    deleteLabel,
    deleteWords = '',
    off,
    size = 'small',
  }: {
    /** The row's menu. */
    menu: () => MenuEntry[];
    /** What the row is called ("Potion"), for ⋯'s name: "More for Potion". */
    name: string;
    /** 🗑 deletes the row (done at once: the note at the bottom offers Undo). No 🗑 without it. */
    remove?: () => void;
    /** 🗑's name ("Delete Potion"). */
    deleteLabel?: string;
    /** 🗑's words after its sign, where there's room ("Delete shop"). */
    deleteWords?: string;
    /** Why 🗑 is greyed now ("A wheel needs two slices"). */
    off?: string;
    size?: 'small' | 'tiny';
  } = $props();
</script>

<span class="row-tools">
  <button class="ghost {size} more" aria-haspopup="menu" aria-label="More for {name}" title="Move, duplicate and more (or right-click the row)" onclick={(e) => dropMenu(e, menu())}>⋯</button>
  {#if remove}
    <button class="ghost {size} danger del" onclick={remove} disabled={!!off} aria-label={deleteLabel} title={off ?? `${deleteLabel ?? 'Delete'} (Undo brings it back)`}>🗑{deleteWords ? ` ${deleteWords}` : ''}</button>
  {/if}
</span>

<style>
  .row-tools {
    display: inline-flex;
    align-items: center;
    flex: none;
  }
  /* Apart from ⋯, so a slip doesn't delete. */
  .del {
    margin-left: 12px;
  }
</style>
