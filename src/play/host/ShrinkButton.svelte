<!--
  🗜 Make smaller (card-files spec §4.9): on a host-panel line about a card's files that are big for phones, or too big
  for the buzzer server, and on an item in the two-window host column. It opens 🗜 for those files (the ones it can
  make copies of here), and while one is being made says how far it got. In one window the panel is on stream: it names
  no file, in any attribute.
-->
<script lang="ts">
  import type { Game } from '../../lib/model';
  import type { PhoneItem } from '../../lib/phonecard';
  import { shrinkHere, smallerLeft } from '../../lib/shrink/apply';
  import { openShrinkDialog } from '../../lib/shrink/dialog.svelte';
  import { jobFor, progressText } from '../../lib/shrink/jobs.svelte';
  import { shrinkIds } from './cardrow';

  let {
    game,
    items,
    which,
    title = 'Make smaller copies of these files for phones',
  }: {
    game: Game;
    /** The card's items (or one item) as phones get them. */
    items: PhoneItem[];
    /** Those that go but are big ('slow'), or those too big for the buzzer server ('big'). */
    which: 'slow' | 'big';
    title?: string;
  } = $props();

  const ids = $derived(
    shrinkIds(
      items,
      which,
      (id) => shrinkHere(game, id),
      (id) => smallerLeft(game, game.media.find((m) => m.id === id)),
    ),
  );
  /** One of them being made (or waiting its turn). */
  const job = $derived(ids.map((id) => jobFor(id)).find((j) => !!j));
  const pct = $derived(job ? progressText(job) : '');
</script>

{#if ids.length}
  {' '}<button class="small" data-card-shrink onclick={() => openShrinkDialog(ids)} {title}
    >{#if job}🗜 Making smaller…{#if pct}{' '}<span aria-hidden="true">{pct}</span>{/if}{:else}🗜 Make smaller{/if}</button
  >
{/if}
