<!-- Host keyboard shortcuts (spec §6.8). -->
<script lang="ts">
  let { onclose }: { onclose: () => void } = $props();
  const KEYS: [string, string][] = [
    ['1 – 9', 'Select / deselect player N for scoring'],
    ['Enter / Shift+Enter', 'Award / deduct the amount to the selected players'],
    ['R', 'Reveal the answer'],
    ['Esc / B', 'Close the tool overlay, or go back to the board (the tile is used up)'],
    ['Shift+Esc', 'Cancel the clue: back to the board, the tile stays playable (not once points were given for it)'],
    ['Right-click a used tile', 'Put it back on the board (or use ↶ Reopen in the host panel)'],
    ['N', 'Next step (round intro, final round; in the reveals: show the wager, then the next player)'],
    ['C / X', 'Final reveals: mark the spotlit player right / wrong'],
    ['T', 'Start / pause the countdown'],
    ['P then 1 – 9', 'Make player N the current picker'],
    ['D', 'Roll the last dice again'],
    ['W', 'Spin the wheel (or open the first saved wheel)'],
    ['O', 'Roll-off: who goes first'],
    ['S', 'Scoreboard overlay'],
    ['Space', 'Play / pause the slide’s video or audio'],
    ['← / →', 'Seek the media back / forward 5 s'],
    ['M', 'Mute / unmute the media'],
    ['Y', 'Open YouTube / online media in its own window'],
    ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo the last change: a score change (a whole multi-player award at once) or a tile closed or reopened'],
    ['L', 'Score & roll log'],
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
  <div class="modal" role="dialog" aria-label="Keyboard shortcuts">
    <h2>Keyboard shortcuts</h2>
    <table>
      <tbody>
        {#each KEYS as [k, d]}
          <tr><td><kbd>{k}</kbd></td><td>{d}</td></tr>
        {/each}
      </tbody>
    </table>
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
    margin: 0 0 10px;
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
