<!--
  A shared theme coming in: a pasted code (Paste theme code…) or a file (📂 Import theme…). It shows the theme on this
  game's board first, then "Use in this game" or "Save to my themes".
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { uploadedFamily } from '../lib/fonts';
  import { newLive } from '../lib/live';
  import { mediaUrls, registerBlob } from '../lib/media.svelte';
  import { modal } from '../lib/modal';
  import { isBoard, newId, newRound, type Game } from '../lib/model';
  import { renameThemeFiles } from '../lib/themeapply';
  import { parseThemeCode, ThemeError, type SharedTheme } from '../lib/themefile';
  import type { Theme } from '../lib/theme';
  import Stage from '../lib/Stage.svelte';
  import AudienceView from '../play/AudienceView.svelte';
  import { themeDemo } from './themedemo';

  let {
    shared: given = null,
    onuse,
    onsave,
    onclose,
  }: {
    /** A theme read from a file; none: a code is pasted first. */
    shared?: SharedTheme | null;
    onuse: (s: SharedTheme) => void;
    onsave: (s: SharedTheme) => void;
    onclose: () => void;
  } = $props();

  let shared = $state.raw<SharedTheme | null>(null);
  /** The theme as previewed (its files under ids of their own). */
  let preview = $state.raw<Theme | null>(null);
  /** Came from a code (it carries no pictures or fonts' files). */
  // svelte-ignore state_referenced_locally
  const fromCode = !given;
  let code = $state('');
  let problem = $state('');
  let reading = $state(false);

  async function read(): Promise<void> {
    problem = '';
    reading = true;
    try {
      show(await parseThemeCode(code));
    } catch (e) {
      problem = e instanceof ThemeError ? e.message : 'That theme code can’t be read.';
    } finally {
      reading = false;
    }
  }

  // The preview shows the theme's own pictures and fonts under ids of their own (never in place of this game's files).
  const previewIds: string[] = [];
  function show(s: SharedTheme): void {
    const ids = new Map(s.media.map((m) => [m.ref.id, `pv${newId().replace(/-/g, '')}`]));
    for (const m of s.media) {
      const id = ids.get(m.ref.id)!;
      if (m.ref.kind === 'image') registerBlob(id, m.blob);
      else
        void m.blob
          .arrayBuffer()
          .then((buf) => new FontFace(uploadedFamily(id), buf).load())
          .then((face) => document.fonts.add(face))
          .catch(() => {});
      previewIds.push(id);
    }
    preview = renameThemeFiles(s.theme, ids);
    shared = s;
  }
  // svelte-ignore state_referenced_locally
  if (given) show(given);
  onDestroy(() => {
    for (const id of previewIds) {
      if (mediaUrls[id]?.startsWith('blob:')) URL.revokeObjectURL(mediaUrls[id]);
      delete mediaUrls[id];
    }
  });

  // This game's first board (or a sample one), with the theme on it.
  const sample = newRound('Jeopardy!', 5);
  const shown = $derived.by((): Game | null => {
    if (!preview) return null;
    const board = app.game.rounds.find(isBoard) ?? sample;
    return { ...app.game, rounds: [board], theme: preview };
  });
  const demo = $derived(shown ? themeDemo(shown, 0) : null);
  const live = newLive();
  const carries = $derived(shared?.media.length ?? 0);
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key !== 'Escape') return;
    e.stopImmediatePropagation();
    onclose();
  }}
/>

<div class="modal-backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="modal" class:lg={!!shared} role="dialog" aria-modal="true" aria-labelledby="theme-import-heading" use:modal data-undo="off">
    <div class="modal-head">
      <h2 class="modal-title" id="theme-import-heading">{shared ? `🎨 Theme “${shared.name}”` : '⌨ Paste a theme code'}</h2>
      <button type="button" class="ghost modal-x" onclick={onclose} aria-label="Close" title="Close (Esc)">✕</button>
    </div>
    {#if !shared}
      <form
        class="paste"
        onsubmit={(e) => {
          e.preventDefault();
          void read();
        }}
      >
        <label class="field">
          Theme code (it starts with BRT1:)
          <textarea bind:value={code} rows="4" placeholder="BRT1:…" spellcheck="false" data-autofocus></textarea>
        </label>
        {#if problem}<p class="warn small" role="alert">⚠ {problem}</p>{/if}
        <p class="hint">A theme code has the colors, fonts and layout, not pictures or uploaded fonts (a theme file carries those).</p>
        <div class="modal-foot">
          <button class="ghost" type="button" onclick={onclose}>Cancel</button>
          <button class="primary" type="submit" disabled={!code.trim() || reading}>Preview</button>
        </div>
      </form>
    {:else}
      <div class="preview">
        {#if shown && demo}
          <Stage>
            <AudienceView game={shown} session={demo} {live} role="mirror" />
          </Stage>
        {/if}
      </div>
      <p class="hint">
        {#if fromCode}
          From a theme code: colors, fonts and layout. This game keeps its own pictures.
        {:else if carries}
          It brings {carries} file{carries === 1 ? '' : 's'} (pictures and uploaded fonts) into this game when you use it. Saved to my themes, it keeps its look without them.
        {:else}
          Colors, fonts and layout. This game keeps its own pictures.
        {/if}
        {#if shared.leftOut.length}
          Left out of the file (too big): {shared.leftOut.join(', ')}.
        {/if}
      </p>
      <div class="modal-foot">
        <button class="ghost" type="button" onclick={onclose}>Cancel</button>
        <button type="button" onclick={() => shared && onsave(shared)}>💾 Save to my themes</button>
        <button class="primary" type="button" onclick={() => shared && onuse(shared)}>🎨 Use in this game</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .paste {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  textarea {
    font-family: ui-monospace, monospace;
    font-size: 12px;
    resize: vertical;
    word-break: break-all;
  }
  .preview {
    aspect-ratio: 16 / 9;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid var(--border);
    max-height: 60vh;
  }
</style>
