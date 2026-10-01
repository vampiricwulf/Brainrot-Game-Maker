<!-- Host keyboard shortcuts (spec §6.8). -->
<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { modal } from '../lib/modal';

  let {
    onclose,
    area = null,
  }: {
    onclose: () => void;
    /** Single window: the host panel's box, where the list stays (viewers see this window: the stage stays clear). */
    area?: { top: number; left: number; width: number; height: number } | null;
  } = $props();
  /** The keys by where they apply (a key can mean another thing in another round, like N or D). */
  const GROUPS: { title: string; keys: [string, string][] }[] = [
    {
      title: 'Everywhere',
      keys: [
        ['1 – 9', 'Select / deselect player N (for scoring)'],
        ['0', 'Select everyone, or no one (buzzer mode, during a clue: reset the buzzers)'],
        ['Enter / Shift+Enter', 'Award / deduct the amount to the selected players'],
        ['P then 1 – 9', 'Make player N the current picker'],
        ['Esc', 'Close the log, a tool or a card; on a clue: back to the board (the tile is used up); else clear the selection'],
        ['K or B', 'Cover: viewers see only a “Be right back” card (again: uncover)'],
        ['T', 'Start / pause the countdown (the seconds typed in the ⏱ box, if any)'],
        ['Shift+T', '10 more seconds on the countdown'],
        ['Ctrl+Z', 'Undo the last change: a score, a move, a stat or item, a tile, the picker, the turn order, Players or the Final'],
        ['Ctrl+Shift+Z / Ctrl+Y', 'Redo'],
        ['Right-click a player', 'Their menu: on the stage (avatar, token, strip, score plate) or in the host panel'],
        ['L', 'Log: the history (go back to any point), scores and rolls'],
        ['A', 'Open / focus the audience window (never closes it)'],
        ['Shift+A', 'Open / focus the scores window: only the score plates and the countdown, for a lower third in OBS'],
        ['H', 'Hide / show the host controls'],
        ['F', 'Full-screen'],
        ['?', 'This list'],
      ],
    },
    {
      title: 'Tools and media',
      keys: [
        ['D', 'Roll the last dice again (board games: the round’s own dice)'],
        ['W', 'Spin the wheel (or open the first saved wheel)'],
        ['O', 'Roll-off: who goes first'],
        ['S', 'Scoreboard on screen'],
        ['Space', 'Play / pause the slide’s video or audio'],
        ['← / →', 'Seek the media back / forward 5 s'],
        ['M', 'Mute / unmute the media'],
        ['Y', 'Open YouTube / online media in its own window'],
      ],
    },
    {
      title: 'Jeopardy board',
      keys: [
        ['N', 'Round intro: the next step (the title card, then the tiles and categories)'],
        ['R', 'Reveal the answer (again: hide it)'],
        ['Shift+Esc', 'Cancel the clue: back to the board, the tile stays playable (not once points were given)'],
        ['Right-click a tile', 'Open it, mark it as played without opening it, or put a used one back'],
      ],
    },
    {
      // A player-only file has no editor: no Setup to point to.
      title: 'Buzzer mode (phone buzzers, set on the pre-game screen)',
      keys: [
        ['1 – 9', 'During a clue: player N answers, picked by hand (over a phone’s buzz)'],
        ['0', 'During a clue: reset the buzzers (↺): nobody is locked out any more, and they open for everyone'],
        ['U', 'Open the buzzers (when they open on your key, after reading the clue; after a right answer, for the rest)'],
        ['Shift+Enter on the one answering', 'Wrong: they’re locked out of this clue and the buzzers open for the others'],
      ],
    },
    {
      title: 'Final',
      keys: [
        ['N', 'Title card: start the round; then the next step; in the reveals: show the wager, then the next player'],
        ['Shift+N', 'Reveals: back to the player before'],
        ['1 – 9', 'Reveals: spotlight the Nth player'],
        ['C / X', 'Reveals: the spotlit player is right / wrong (or right-click their score plate)'],
        ['Alt+↑ / ↓ on a name', 'Reveals: move them up / down the order (or drag the row)'],
      ],
    },
    {
      title: 'RPG',
      keys: [
        ['N', 'Title card: start the round'],
        ['Numpad 1–9 (not 5)', 'Move the party one screen that way (numpad 5 regroups)'],
        ['Alt+Q W E A D Z X C / Alt+arrows', 'Move the party (laptop keys)'],
        ['J', 'The full map: jump the party (or some players) to any screen'],
        ['G', 'Regroup everyone here'],
        ['V', 'Show / hide the map on screen'],
        ['I', 'The selected player’s sheet on screen (again: the next selected, then close)'],
        ['Delete / Backspace', 'Take the object whose card is open off the screen (Ctrl+Z brings it back)'],
      ],
    },
    {
      title: 'Board game',
      keys: [
        ['D', 'Roll the round’s dice (or spin its wheel): the result fills in the steps'],
        ['Enter', 'With nobody selected: move the steps (on a one-space board, the only way on)'],
        ['N / Shift+N', 'Title card: start the round (N); then the next / previous player’s turn'],
        ['I', 'The selected player’s sheet on screen'],
        ['Alt+← / → on a name', 'Move them earlier / later in the turn order (or drag the chip)'],
      ],
    },
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

<div
  class="backdrop"
  class:in-panel={!!area}
  style:top={area ? `${area.top}px` : undefined}
  style:left={area ? `${area.left}px` : undefined}
  style:width={area ? `${area.width}px` : undefined}
  style:height={area ? `${area.height}px` : undefined}
  onclick={(e) => e.target === e.currentTarget && onclose()}
  role="presentation"
>
  <div class="modal" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" use:modal>
    <div class="row">
      <h2 class="modal-title">⌨ Keyboard shortcuts</h2>
      <span class="spacer"></span>
      <button class="ghost modal-x" onclick={onclose} aria-label="Close" title="Close (Esc)">✕</button>
    </div>
    <div class="groups">
      {#each GROUPS as g (g.title)}
        <section>
          <h3>{g.title}</h3>
          <table>
            <tbody>
              {#each g.keys as [k, d] (k)}
                <tr><td><kbd>{k}</kbd></td><td>{d}</td></tr>
              {/each}
            </tbody>
          </table>
        </section>
      {/each}
    </div>
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
  /* Single window: over the host panel only, never the stage viewers see. */
  .backdrop.in-panel {
    inset: auto;
    padding: 8px;
  }
  .modal {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 18px 22px;
    width: min(1180px, 100%);
    max-height: 100%;
    overflow: auto;
    box-sizing: border-box;
  }
  .in-panel .modal {
    height: 100%;
  }
  .groups {
    columns: 2 440px;
    column-gap: 28px;
  }
  section {
    break-inside: avoid;
    margin-bottom: 12px;
  }
  h3 {
    margin: 0 0 4px;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
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
