<!-- ⌨ Shortcuts: the editor's keys and mouse moves, by where they work (the host's keys are in the game: press ? there). -->
<script lang="ts">
  let { onclose }: { onclose: () => void } = $props();
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);

  const AREAS: [string, [string, string][]][] = [
    [
      'Everywhere',
      [
        ['Ctrl+Z', 'Undo (every change to the game, one step at a time; 🕘 History goes back further)'],
        ['Ctrl+Y / Ctrl+Shift+Z', 'Redo'],
        ['Ctrl+S', 'Save the game'],
        ['Esc', 'Close the window, picker or menu that’s open'],
        ['?', 'This list (not while typing)'],
        ['Drop a file', 'On a Choose… button, an icon, an avatar or an open picker: use it there. A .brainrot game dropped anywhere else opens'],
        ['Ctrl+V in a picker', 'Use a copied picture (or sound, video) file'],
      ],
    ],
    ['Rounds', [['Right-click a round', 'Move it earlier or later, duplicate or delete it']]],
    [
      'Board',
      [
        ['Right-click a tile', 'Edit the clue, make it a Daily Double, or leave the tile empty'],
        ['Drop pictures', 'On a tile: its image, shown instead of the value (several fill the tiles after it). On a category: its image'],
      ],
    ],
    [
      'Clue',
      [
        ['Ctrl+Enter', 'Next clue'],
        ['Ctrl+Shift+Enter', 'Previous clue'],
        ['Alt+← / →', 'Previous / next clue'],
        ['Esc', 'Done (not while typing on the slide)'],
      ],
    ],
    [
      'Slide',
      [
        ['Click / Shift+click / Ctrl+click', 'Select an item / add it or take it away'],
        ['Drag on an empty spot', 'Select everything the box touches'],
        ['Alt+click', 'The next item down the stack under the pointer'],
        ['Tab / Shift+Tab', 'Select the next item down / up the stack'],
        ['Double-click', 'Edit a text box’s text, or an image in the image editor'],
        ['Type, Enter or F2', 'Edit the selected text box’s text'],
        ['Right-click', 'Cut, copy, paste, restack, align, lock, hide or delete; on an empty spot: paste there, select all, add text, background'],
        ['Arrows / Shift+arrows', 'Nudge the selection 1 / 10 pixels'],
        ['Shift while dragging', 'Move along one axis only (while rotating: snap to 15°)'],
        ['Ctrl+] / Ctrl+[', 'Bring forward / send backward'],
        ['Ctrl+Shift+] / [', 'Bring to front / send to back'],
        ['Ctrl+D', 'Duplicate'],
        ['Ctrl+A', 'Select all (not locked or hidden items)'],
        ['Ctrl+C / X / V', 'Copy, cut and paste items (between slides, clues, games and board images)'],
        ['Ctrl+B / I / U', 'Bold, italic, underline the selected text boxes'],
        ['Delete / Backspace', 'Delete the selection (locked items stay)'],
        ['Esc', 'Deselect (or stop previewing, drawing, or close the link box)'],
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
        ['Delete', 'Remove the selected sticker or text from the image'],
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
        ['Shift/Ctrl+click, or draw a box', 'Pick several screens'],
        ['Drag a screen', 'Move it (onto another to swap them, onto a map’s tab to move it there)'],
        ['Alt+arrows', 'Move the selected screens (in a screen: open the screen next door)'],
        ['Ctrl+D', 'Duplicate the selected screens'],
        ['Ctrl+C / Ctrl+V', 'Copy a screen / paste it (on the cell you’re on, when it’s empty)'],
        ['F2', 'Rename the screen (on a map’s tab, or double-click it: rename the map)'],
        ['Delete / Backspace', 'Delete the selected screens'],
        ['Esc', 'Deselect, cancel a drag, or go back from a screen to the map'],
      ],
    ],
    [
      'Board game',
      [
        ['Ctrl+click the board', 'Add a space (after the selected one)'],
        ['Click / Shift+click, or draw a box', 'Select a space / add it to the selection'],
        ['Tab / Shift+Tab', 'Select the next / previous space'],
        ['Ctrl+A', 'Select all the spaces'],
        ['Drag a space', 'Move it (and the others selected)'],
        ['Arrows / Shift+arrows', 'Nudge the selected spaces (further with Shift)'],
        ['Alt+drag a space, or drag its ⊕', 'Link it to the space you let go on (onto a linked one: unlink)'],
        ['Ctrl+D', 'Duplicate the selected space'],
        ['Right-click', 'A space’s menu (Start, link, add after, duplicate, delete), a link’s menu, or add a space there'],
        ['Delete / Backspace', 'Delete the selected spaces'],
        ['Esc', 'Deselect (or stop linking)'],
        ['Drop a picture', 'On a space: its icon. On the board: its background'],
        ['Alt+↑ / ↓ or drag ⋮⋮', 'Off-board zones: reorder (the host’s Send to list follows)'],
      ],
    ],
    [
      'Lists',
      [
        ['Alt+↑ / ↓ or drag ⋮⋮', 'Move the row up / down: stats, items, shops and what they sell, buttons, wheels, dice, slices, players'],
        ['Ctrl+D', 'Duplicate the row: a stat, item, shop, button, wheel, dice or slice'],
        ['Right-click a row', 'Stats, items, shops, wheels and dice: duplicate, move up or down, delete…'],
        ['Drag an item’s 📦 icon onto a shop', 'Sell it there (a picture file dropped on the icon is its icon instead)'],
        ['F2 or double-click', 'Wheels & Dice: rename the wheel or dice in focus'],
        ['Delete', 'Wheels & Dice: delete the wheel or dice in focus'],
        ['Enter / Backspace', 'Wheel slices: add the next slice / delete an empty one'],
        ['Enter', 'Players: add the next player'],
        ['↑ / ↓, G', '🕘 History: move through the steps, show where one changed things'],
        ['Click / Ctrl+click / Shift+click', '🖼 Media: select files (Delete removes them, Esc deselects)'],
        ['Double-click or F2 a name', '🖼 Media: rename the file'],
        ['Drop a file on a card', '🖼 Media: replace it (everything that uses it follows)'],
      ],
    ],
  ];
  /** "Ctrl+" reads "⌘" on a Mac. */
  const keys = (k: string) => (mac ? k.replaceAll('Ctrl+', '⌘') : k);
</script>

<svelte:window
  onkeydown={(e) => {
    // '?' typed into a text field is just a question mark.
    const typing = (e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable]');
    if (e.key === 'Escape' || (e.key === '?' && !typing)) {
      e.stopImmediatePropagation();
      e.preventDefault();
      onclose();
    }
  }}
/>

<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="modal" role="dialog" aria-modal="true" aria-label="Editor keyboard shortcuts" data-undo="off">
    <div class="row">
      <h2>⌨ Shortcuts</h2>
      <span class="spacer"></span>
      <button class="ghost" onclick={onclose} aria-label="Close">✕</button>
    </div>
    <p class="muted small">Keys and mouse moves in the editor. The host’s keys during a game are listed there (press ? while playing).</p>
    <div class="areas">
      {#each AREAS as [area, rows] (area)}
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
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 150;
    background: rgba(0, 0, 0, 0.6);
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    grid-template-columns: minmax(0, 1fr);
    place-items: center;
    padding: 16px;
  }
  .modal {
    width: min(1100px, 100%);
    max-height: 100%;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  h2,
  h3,
  p {
    margin: 0;
  }
  h3 {
    margin: 4px 0;
    font-size: 14px;
  }
  .row {
    display: flex;
    gap: 6px;
    align-items: center;
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
  .small {
    font-size: 12px;
  }
</style>
