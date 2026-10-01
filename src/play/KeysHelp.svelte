<!-- Host keyboard shortcuts (spec §6.8). -->
<script lang="ts">
  import { modal } from '../lib/modal';
  let { onclose }: { onclose: () => void } = $props();
  const KEYS: [string, string][] = [
    ['1 – 9', 'Select / deselect player N for scoring (in the Final reveals: spotlight the Nth player)'],
    ['0', 'Select everyone, or no one'],
    ['Enter / Shift+Enter', 'Award / deduct the amount to the selected players'],
    ['R', 'Reveal the answer (again: hide it)'],
    ['Esc / B', 'Close the log, the tool overlay or an RPG object’s / board space’s card, go back to the board (the tile is used up), or clear the selection'],
    ['Shift+Esc', 'Cancel the clue: back to the board, the tile stays playable (not once points were given for it)'],
    ['Right-click a tile', 'Open it, mark it as played without opening it, or put a used one back on the board'],
    ['N', 'Next step (round intro, final round; in the reveals: show the wager, then the next player)'],
    ['Shift+N', 'Final reveals: back to the player before'],
    ['C / X', 'Final reveals: mark the spotlit player right / wrong (or right-click their score on the stage)'],
    ['Alt+↑ / ↓ on a name', 'Final reveals: move them up / down the reveal order (or drag the row)'],
    ['T', 'Start / pause the countdown (the seconds typed in the ⏱ box, if any)'],
    ['Shift+T', '10 more seconds on the countdown'],
    ['P then 1 – 9', 'Make player N the current picker'],
    ['D', 'Roll the last dice again'],
    ['W', 'Spin the wheel (or open the first saved wheel)'],
    ['O', 'Roll-off: who goes first'],
    ['S', 'Scoreboard overlay'],
    ['K', 'Cover: viewers see only a “Be right back” card (again: uncover)'],
    ['Space', 'Play / pause the slide’s video or audio'],
    ['← / →', 'Seek the media back / forward 5 s'],
    ['M', 'Mute / unmute the media'],
    ['Y', 'Open YouTube / online media in its own window'],
    [
      'Ctrl+Z / Ctrl+Shift+Z or Ctrl+Y',
      'Undo / redo the last change: a score (a whole multi-player award at once), an RPG or board-game move, stat, item or reveal, a tile marked played or put back, the picker, the turn order, a change in 👥 Players or in the Final’s players, order and wagers',
    ],
    ['RPG: Numpad 1–9 (not 5)', 'Move the party one screen that way (numpad 5 regroups)'],
    ['RPG: Alt+Q W E A D Z X C / Alt+arrows', 'Move the party (laptop keys)'],
    ['RPG: J', 'The full map: pick any screen and jump the party (or some players) there'],
    ['RPG: G', 'Regroup everyone here'],
    ['RPG: M', 'Map on screen'],
    ['RPG: Delete / Backspace', 'Take the object whose card is open off the screen (Ctrl+Z brings it back)'],
    ['RPG / board game: I', 'Show the selected player’s sheet (again: the next selected, then close)'],
    ['RPG / board game: B', 'Cover, like K'],
    ['Board game: D', 'Roll the round’s dice (or spin its wheel): the result fills in the steps'],
    ['Board game: Enter', 'With nobody selected: move the steps (on a one-space board, the only way on)'],
    ['Board game: N / Shift+N', 'Next / previous player’s turn'],
    ['Board game: Alt+← / → on a name', 'Move them earlier / later in the turn order (or drag the chip)'],
    ['Right-click a player', 'Their menu: on the stage (avatar, token, stats strip, score plate) or in the host panel'],
    ['L', 'Log: the history (go back to any point), scores and rolls'],
    ['A', 'Open / focus the audience window (never closes it)'],
    ['H', 'Hide / show the host controls'],
    ['F', 'Full-screen'],
    ['?', 'This list'],
  ];
</script>

<svelte:window
  onkeydown={(e) => {
    // '?' typed into a text field is just a question mark.
    const typing = (e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable]');
    if (e.key === 'Escape' || (e.key === '?' && !typing)) {
      e.stopImmediatePropagation();
      onclose();
    }
  }}
/>

<div class="backdrop" onclick={onclose} role="presentation">
  <div class="modal" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" use:modal>
    <div class="row">
      <h2 class="modal-title">⌨ Keyboard shortcuts</h2>
      <span class="spacer"></span>
      <button class="ghost modal-x" onclick={onclose} aria-label="Close" title="Close (Esc)">✕</button>
    </div>
    <table>
      <tbody>
        {#each KEYS as [k, d]}
          <tr><td><kbd>{k}</kbd></td><td>{d}</td></tr>
        {/each}
      </tbody>
    </table>
    <p class="muted">The keys work in the audience window too (F there makes it full-screen).</p>
    <div class="modal-foot"><button class="primary" onclick={onclose}>Done</button></div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(0, 0, 0, 0.6);
    display: grid;
    /* A viewport-sized track so the modal's max-height/height: 100% resolves against the window. */
    grid-template-rows: minmax(0, 1fr);
    grid-template-columns: minmax(0, 1fr);
    place-items: center;
    padding: 16px;
  }
  .modal {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 18px 22px;
    max-height: 100%;
    overflow: auto;
  }
  h2 {
    margin: 0;
  }
  .row {
    margin-bottom: 10px;
  }
  p {
    margin: 10px 0 0;
  }
  td {
    padding: 3px 10px 3px 0;
    vertical-align: top;
  }
  kbd {
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1px 6px;
    font-family: inherit;
    font-size: 12px;
    white-space: nowrap;
  }
</style>
