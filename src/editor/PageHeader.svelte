<!-- The top of every editor page: its title (a round's name, with its mode as a chip), one muted line saying what the
     page is for, and the page's actions on the right. -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    title,
    icon,
    chip,
    chipTitle,
    sub,
    actions,
  }: {
    title: string;
    /** Shown before the title (the nav's icon for the page). */
    icon?: string;
    /** Beside the title: a round's mode ("🟦 Jeopardy board"). */
    chip?: string;
    chipTitle?: string;
    /** One line under the title. */
    sub?: string | Snippet;
    actions?: Snippet;
  } = $props();
</script>

<div class="page-header">
  <div class="titles">
    <h2>
      {#if icon}<span aria-hidden="true">{icon}</span>{/if}
      <span>{title}</span>
      {#if chip}<span class="mode-chip" title={chipTitle}>{chip}</span>{/if}
    </h2>
    {#if typeof sub === 'string'}<p class="sub">{sub}</p>{:else if sub}<p class="sub">{@render sub()}</p>{/if}
  </div>
  {#if actions}<div class="actions">{@render actions()}</div>{/if}
</div>
