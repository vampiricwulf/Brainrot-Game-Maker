<!-- ⌨ Shortcuts: the editor's keys and mouse moves, by where they work (the host's keys are in the game: press ? there). -->
<script lang="ts">
  import { modal } from '../lib/modal';
  let { onclose }: { onclose: () => void } = $props();
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);

  const AREAS: [string, [string, string][]][] = [
    [
      'Everywhere',
      [
        ['Ctrl+Z', 'Undo (every change to the game, one step at a time; 🕘 History goes back further)'],
        ['Ctrl+Y / Ctrl+Shift+Z', 'Redo'],
        ['Ctrl+S', 'Save the game'],
        ['Ctrl+F', 'Find: clues, screens, spaces, items, wheels… anywhere in the game (↑ / ↓ and Enter go there)'],
        ['Esc', 'Close the window, picker or menu that’s open'],
        ['?', 'This list (not while typing)'],
        ['Drop a file', 'On a Choose… button, an icon, an avatar or an open picker: use it there. A .brainrot game dropped anywhere else opens'],
        ['Ctrl+V in a picker', 'Use a copied picture (or sound, video) file'],
      ],
    ],
    [
      'Rounds',
      [
        ['Drag a round, or Alt+↑ / ↓', 'Move it earlier or later'],
        ['F2 or double-click', 'Rename it'],
        ['Ctrl+D', 'Duplicate it'],
        ['Delete / Backspace', 'Delete it'],
        ['Right-click a round', 'All of these, and Copy round / Paste round (into this game or another)'],
        ['＋ Add round', 'A blank round, a template, a round from another .brainrot, or a copied round'],
      ],
    ],
    [
      'Board',
      [
        ['Arrows', 'Move around the tiles (↑ from the top row: the category’s name; ↓ at the end of the name: back down)'],
        ['Enter in a category’s name', 'Go to its top tile (Shift+Enter: a second line)'],
        ['Enter or F2', 'Edit the clue'],
        ['Delete / Backspace', 'Clear the clue'],
        ['Ctrl+C / Ctrl+V', 'Copy a whole clue / paste it over this one (between rounds and games)'],
        ['Drag a tile onto another', 'Swap the clues (with Ctrl: copy it there)'],
        ['Drag a category', 'Move it'],
        ['Right-click a tile', 'Edit, Daily Double, leave empty, copy, paste, clear; insert, move or delete its row'],
        ['Right-click a category', 'Move, insert, duplicate, clear or delete it; its image'],
        ['Drop pictures', 'On a tile: its image, shown instead of the value (several fill the tiles after it). On a category: its image'],
        ['Paste lines on a category’s name', 'Fill its column, top down (copied from a spreadsheet: question, answer; a first line alone is the name)'],
      ],
    ],
    [
      'Clue',
      [
        ['Ctrl+Enter', 'Next clue'],
        ['Ctrl+Shift+Enter', 'Previous clue'],
        ['Alt+arrows', 'The clue above, below or beside (as on the board)'],
        ['Esc', 'Done (not while typing on the slide)'],
      ],
    ],
    [
      'Slide',
      [
        ['Click / Shift+click / Ctrl+click', 'Select an item / add it or take it away'],
        ['Drag on an empty spot (or beside a text box’s words)', 'Select everything the box touches'],
        ['Alt+drag', 'Always draw a selection box, wherever it starts'],
        ['Alt+click', 'The next item down the stack under the pointer'],
        ['Tab / Shift+Tab', 'Select the next item down / up the stack'],
        ['Double-click', 'Edit a text box’s text, or an image in the image editor'],
        ['Type, Enter or F2', 'Edit the selected text box’s text'],
        ['Right-click', 'Cut, copy, paste, restack, align, lock, hide or delete; on an empty spot: paste there, select all, add text, background'],
        ['Arrows / Shift+arrows', 'Nudge the selection 1 / 10 pixels'],
        ['Shift while dragging', 'Move along one axis only (while rotating: snap to 15°)'],
        ['Alt while moving or resizing', 'No snapping to the slide and other items'],
        ['Ctrl+] / Ctrl+[', 'Bring forward / send backward'],
        ['Ctrl+Shift+] / [', 'Bring to front / send to back'],
        ['Ctrl+D', 'Duplicate'],
        ['Ctrl+A', 'Select all (not locked or hidden items)'],
        ['Ctrl+C / X / V', 'Copy, cut and paste items (between slides, clues, games and board images)'],
        ['Ctrl+B / I / U', 'Bold, italic, underline the selected text boxes'],
        ['Delete / Backspace', 'Delete the selection (locked items stay)'],
        ['Esc', 'Leave a text field, then deselect (or stop previewing, drawing, or close the link box)'],
      ],
    ],
    [
      'Layers',
      [
        ['↑ / ↓', 'Select the item above / below'],
        ['Alt+↑ / ↓', 'Move the item up / down the stack (or drag the row)'],
        ['Double-click or F2', 'Rename it (Enter saves, Esc cancels, empty goes back to the automatic name)'],
      ],
    ],
    [
      'Image editor and drawing',
      [
        ['Ctrl+Enter', 'Apply the image edits'],
        ['Ctrl+Z / Ctrl+Y', 'Undo / redo inside the image editor or the drawing'],
        ['Delete', 'Delete the selected sticker or text from the image'],
        ['B or P / F / E', 'Drawing: pen / fill / eraser'],
        ['Esc', 'Cancel (it asks first when there are changes)'],
      ],
    ],
    [
      'Board images',
      [
        ['Same as on a slide', 'Tab, Alt+click, arrows, Ctrl+[ / ], Ctrl+D, Ctrl+A, Delete, right-click'],
        ['Ctrl+C / X / V', 'Copy, cut and paste pictures between boards and slides'],
        ['Esc', 'Deselect, then close'],
      ],
    ],
    [
      'Map (RPG)',
      [
        ['Arrows', 'Move around the grid (the screen there is selected); Shift+arrows add to the selection'],
        ['Enter', 'Edit the screen, or add one on an empty cell'],
        ['Shift/Ctrl+click, or draw a box', 'Pick several screens (a box from an empty cell, or Alt+drag from anywhere)'],
        ['Drag a screen', 'Move it (onto another to swap them, onto a map’s tab to move it there)'],
        ['Alt+arrows', 'Move the selected screens (in a screen: open the screen next door)'],
        ['Ctrl+D', 'Duplicate the selected screens'],
        ['Ctrl+C / Ctrl+V', 'Copy a screen / paste it (on the cell you’re on, when it’s empty)'],
        ['F2', 'Rename the screen'],
        ['On a map’s tab', 'F2 or double-click: rename it; Alt+← / →: move it; Ctrl+D: duplicate; Delete: delete it'],
        ['Delete / Backspace', 'Delete the selected screens'],
        ['Esc', 'Deselect, cancel a drag, or go back from a screen to the map'],
      ],
    ],
    [
      'Board game',
      [
        ['Tab', 'To the board and on (the board is one stop: the arrows go between its spaces)'],
        ['Arrows', 'Go to the nearest space that way (it’s selected); Shift+arrows add it to the selection'],
        ['Enter', 'Open the selected space’s settings (while linking: link to the space you’re on)'],
        ['Ctrl+click the board', 'Add a space (after the selected one)'],
        ['Click / Shift+click, or draw a box', 'Select a space / add it to the selection'],
        ['Ctrl+A', 'Select all the spaces'],
        ['Drag a space', 'Move it (and the others selected)'],
        ['Alt+arrows / Shift+Alt+arrows', 'Move the selected spaces (further with Shift)'],
        ['Alt+drag a space, or drag its ⊕', 'Link it to the space you let go on (onto a linked one: unlink)'],
        ['Ctrl+D', 'Duplicate the selected spaces'],
        ['Ctrl+C / Ctrl+V', 'Copy the selected spaces / paste them (with their buttons, on any board, in any game)'],
        ['F2', 'Rename the space'],
        ['Right-click', 'A space’s menu (rename, Start, link, add after, duplicate, copy, delete), several spaces’ menu, a link’s menu, or add or paste spaces there'],
        ['Delete / Backspace', 'Delete the selected spaces'],
        ['Esc', 'Deselect (or stop linking)'],
        ['Drop a picture', 'On a space: its icon. On the board: its background'],
        ['Alt+↑ / ↓ or drag ⋮⋮', 'Off-board zones: reorder (the host’s Send to list follows)'],
      ],
    ],
    [
      'Lists',
      [
        ['Alt+↑ / ↓ or drag ⋮⋮', 'Move the row up / down: stats, items, shops and what they sell, buttons, wheels, dice, slices, players, zones'],
        ['Ctrl+D', 'Duplicate the row: a stat, item, shop, button, wheel, dice, slice or zone'],
        ['Right-click a row', 'Stats, items, shops, wheels and dice, slices, buttons, zones: duplicate, move up or down, delete…'],
        ['Right-click what a shop sells, or a player', 'Move it up or down, remove it from the shop / rename or delete the player (▶ Play, before the game)'],
        ['Drag an item’s 📦 icon onto a shop', 'Sell it there (a picture file dropped on the icon is its icon instead)'],
        ['F2 or double-click', 'Wheels & Dice: rename the wheel or dice in focus'],
        ['Delete', 'Wheels & Dice: delete the wheel or dice in focus'],
        ['Enter / Backspace', 'Wheel slices: add the next slice / delete an empty one'],
        ['Enter', 'Players: add the next player (as ＋ Add player does), typing in their name'],
        ['↑ / ↓, G', '🕘 History: move through the steps, show where one changed things'],
        ['Click / Ctrl+click / Shift+click', '🖼 Media: select files (Delete removes them, Esc deselects)'],
        ['Double-click or F2 a name', '🖼 Media: rename the file'],
        ['Drop a file on a card', '🖼 Media: replace it (everything that uses it follows)'],
      ],
    ],
  ];
  /** "Ctrl+" reads "⌘" on a Mac. */
  const keys = (k: string) => (mac ? k.replaceAll('Ctrl+', '⌘') : k);

  /** The filter box: rows whose keys or words have every word typed (an area's name shows all of it). */
  let filter = $state('');
  const shown = $derived.by(() => {
    const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
    const has = (t: string) => words.every((w) => t.toLowerCase().includes(w));
    if (!words.length) return AREAS;
    return AREAS.map(([area, rows]) => [area, has(area) ? rows : rows.filter(([k, d]) => has(`${keys(k)} ${k} ${d}`))] as [string, [string, string][]]).filter(([, rows]) => rows.length);
  });
</script>

<svelte:window
  onkeydown={(e) => {
    // '?' typed into a text field is just a question mark.
    const typing = (e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable]');
    if ((e.key === 'Escape' && !e.defaultPrevented) || (e.key === '?' && !typing)) {
      e.stopImmediatePropagation();
      e.preventDefault();
      onclose();
    }
  }}
/>

<div class="modal-backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="modal lg" role="dialog" aria-modal="true" aria-label="Editor keyboard shortcuts" use:modal data-undo="off">
    <div class="modal-head">
      <h2 class="modal-title">⌨ Keyboard shortcuts</h2>
      <button class="ghost modal-x" onclick={onclose} aria-label="Close" title="Close (Esc)">✕</button>
    </div>
    <div class="row">
      <p class="hint">Keys and mouse moves in the editor. The host’s keys during a game are listed there (press ? while playing).</p>
      <span class="spacer"></span>
      <input
        class="filter"
        type="search"
        bind:value={filter}
        placeholder="🔍 Filter: a key or a word"
        aria-label="Filter shortcuts"
        onkeydown={(e) => e.key === 'Escape' && filter && (e.preventDefault(), (filter = ''))}
      />
    </div>
    {#if !shown.length}<p class="muted">Nothing matches “{filter}”.</p>{/if}
    <div class="areas">
      {#each shown as [area, rows] (area)}
        <section>
          <h3>{area}</h3>
          <table>
            <tbody>
              {#each rows as [k, d] (k)}
                <tr><td><kbd>{keys(k)}</kbd></td><td>{d}</td></tr>
              {/each}
            </tbody>
          </table>
        </section>
      {/each}
    </div>
    <div class="modal-foot"><button class="primary" onclick={onclose}>Done</button></div>
  </div>
</div>

<style>
  h3 {
    margin: 4px 0;
    font-size: 14px;
  }
  .row {
    flex-wrap: nowrap;
  }
  .areas {
    columns: 2 460px;
    column-gap: 24px;
  }
  section {
    break-inside: avoid;
    margin-bottom: 12px;
  }
  table {
    border-collapse: collapse;
    width: 100%;
  }
  td {
    padding: 3px 10px 3px 0;
    vertical-align: top;
    font-size: 13px;
  }
  td:first-child {
    width: 38%;
  }
  kbd {
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1px 6px;
    font-family: inherit;
    font-size: 12px;
  }
  .filter {
    width: 220px;
  }
</style>
