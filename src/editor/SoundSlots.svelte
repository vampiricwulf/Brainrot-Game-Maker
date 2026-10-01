<!-- 🔊 Sounds' cues: each plays the built-in sound, an audio file chosen for it, or nothing (switched off). -->
<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { mediaDrop } from '../lib/mediadrop';
  import { CUES, cueMedia, hasBuiltin, type CueKey } from '../lib/sounds';
  import { soundUrl } from '../play/cues';
  import MediaPicker from './slide/MediaPicker.svelte';

  const audio = $derived(app.game.audio);
  let picking = $state<CueKey | null>(null);

  const nameOf = (id?: string) => app.game.media.find((m) => m.id === id)?.name;
  /** Switched off ('' in older games): it keeps its file, for when it's switched back on. */
  const isOff = (key: CueKey) => !!app.game.soundsOff?.[key] || audio[key] === '';
  function setOn(key: CueKey, on: boolean): void {
    const game = app.game;
    if (audio[key] === '') audio[key] = undefined;
    if (!on) return void (game.soundsOff = { ...game.soundsOff, [key]: true });
    if (!game.soundsOff?.[key]) return;
    const { [key]: _, ...rest } = game.soundsOff;
    game.soundsOff = Object.keys(rest).length ? rest : undefined;
  }
  /** A file chosen for it: it plays (switched on). */
  function choose(key: CueKey, id: string): void {
    audio[key] = id;
    setOn(key, true);
  }
  let previewEl = $state<HTMLAudioElement>();
  function preview(key: CueKey): void {
    const url = soundUrl(cueMedia(app.game, key));
    if (!previewEl || !url) return;
    previewEl.src = url;
    previewEl.play().catch(() => {});
  }
</script>

<audio bind:this={previewEl}></audio>
<div class="sounds">
  {#each CUES as [key, label, hint] (key)}
    {@const v = audio[key]}
    {@const off = isOff(key)}
    {@const builtin = hasBuiltin(key)}
    <div class="sound" class:off>
      {#if builtin}
        <input type="checkbox" checked={!off} onchange={(e) => setOn(key, e.currentTarget.checked)} aria-label="Play the {label} sound" />
      {:else}
        <!-- Nothing to switch off (it has no built-in sound): lined up with the others. -->
        <span class="nobox"></span>
      {/if}
      <div class="what">
        <b>{label}</b>
        <div class="muted small">{hint}</div>
      </div>
      <span class="spacer"></span>
      {#if off}
        <span class="muted small">Off{#if v} <span title={nameOf(v)}>(keeps {nameOf(v) ?? 'a missing file'})</span>{/if}</span>
      {:else if v}
        <span class="file" title={nameOf(v)}>🔊 {nameOf(v) ?? 'missing file'}</span>
      {:else if builtin}
        <span class="muted small">Built-in</span>
      {/if}
      {#if cueMedia(app.game, key)}
        <button class="small ghost" onclick={() => preview(key)} title="Preview" aria-label="Preview {label}">▶</button>
      {/if}
      {#if v && !off}
        <button class="small ghost" onclick={() => (audio[key] = undefined)} title={builtin ? 'Back to the built-in sound' : 'Remove'}
          aria-label={builtin ? `Back to the built-in ${label} sound` : `Remove the ${label} sound`}
        >
          {builtin ? '↺' : '−'}
        </button>
      {/if}
      <div class="pop">
        <button class="small" onclick={() => (picking = key)} use:mediaDrop={{ kind: 'audio', onpick: (id) => choose(key, id) }}>
          {v ? 'Change…' : 'Choose file…'}
        </button>
        {#if picking === key}
          <MediaPicker kind="audio" onpick={(id) => (choose(key, id), (picking = null))} onclose={() => (picking = null)} />
        {/if}
      </div>
    </div>
  {/each}
</div>

<style>
  .sounds {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .sound {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  .nobox {
    width: 16px;
    margin: 3px 3px 3px 4px;
    flex-shrink: 0;
  }
  .sound.off .what {
    opacity: 0.55;
  }
  .small {
    font-size: 12px;
  }
  .file {
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
  }
  .pop {
    position: relative;
  }
</style>
