<!--
  🔊 Sounds' cues: each plays the built-in sound, an audio file chosen for it, or nothing (switched off), at its volume.
  One whose file is missing plays the built-in sound (as in the game), and says so.
-->
<script lang="ts">
  import { app, toast } from '../lib/app.svelte';
  import { pickFile } from '../lib/fileio';
  import { attachBlobSwap, stepAsync } from '../lib/history.svelte';
  import { linkLifetime } from '../lib/links';
  import { ACCEPT, replaceMediaFile, stashMedia } from '../lib/media.svelte';
  import { mediaDrop } from '../lib/mediadrop';
  import { CUES, cueFileMissing, cueVolume, hasBuiltin, type CueKey } from '../lib/sounds';
  import { cueHere, loaded, soundUrl } from '../play/cues';
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
  /**
   * A missing file picked again (or the file of a link that expired, stored in the game in its place): every place that
   * uses it gets it back, as 🖼 Media's 🔗 Replace file…. Undo takes it out.
   */
  async function findFile(id: string): Promise<void> {
    const f = await pickFile(ACCEPT.audio);
    if (!f) return;
    try {
      await stepAsync(`Reconnected “${nameOf(id)}”`, async () => {
        const before = await stashMedia(id);
        await replaceMediaFile(app.game, id, f);
        attachBlobSwap({ id, before, after: await stashMedia(id) });
      });
    } catch (e) {
      toast((e as Error).message);
    }
  }
  /** How loud it plays: full volume is left out of the game (older games play everything at full volume). */
  function setVolume(key: CueKey, v: number): void {
    const game = app.game;
    if (v < 1 && game.soundVolume) return void (game.soundVolume[key] = v);
    if (v < 1) return void (game.soundVolume = { [key]: v });
    if (game.soundVolume?.[key] === undefined) return;
    const { [key]: _, ...rest } = game.soundVolume;
    game.soundVolume = Object.keys(rest).length ? rest : undefined;
  }

  // ▶ plays what the game would play (a missing file: the built-in sound), at its volume; ■ stops it.
  let previewEl = $state<HTMLAudioElement>();
  let previewing = $state<CueKey | null>(null);
  /** The file it's playing (el.src can come back spelled differently). */
  let previewUrl = '';
  function preview(key: CueKey): void {
    const el = previewEl;
    if (!el) return;
    el.pause();
    if (previewing === key) return void (previewing = null);
    const url = soundUrl(cueHere(app.game, key));
    if (!url) return;
    el.src = previewUrl = url;
    el.volume = cueVolume(app.game, key);
    previewing = key;
    // A ▶ on another sound before this one started aborts this one: that doesn't stop the other's ■. Any other failure
    // is a file that doesn't load (most often an online link that stopped working): it says so.
    el.play().catch((e: unknown) => {
      if (previewing === key && previewUrl === url) previewing = null;
      if ((e as { name?: string } | null)?.name === 'AbortError') return;
      const name = nameOf(audio[key]);
      toast(
        `${name ? `“${name}”` : 'This sound'} didn't play: its file or link may no longer work (🖼 Media › Check link).${hasBuiltin(key) ? ' In the game the built-in sound plays instead.' : ''}`,
      );
    });
  }
  // Changing its volume while it plays is heard at once; switching it off or taking its file away stops it.
  $effect(() => {
    if (!previewing || !previewEl) return;
    const url = soundUrl(cueHere(app.game, previewing));
    if (url && url === previewUrl) previewEl.volume = cueVolume(app.game, previewing);
    else {
      previewEl.pause();
      previewing = null;
    }
  });
</script>

<audio bind:this={previewEl} onended={() => (previewing = null)}></audio>
<div class="sounds">
  {#each CUES as [key, label, hint] (key)}
    {@const v = audio[key]}
    {@const off = isOff(key)}
    {@const builtin = hasBuiltin(key)}
    {@const missing = cueFileMissing(app.game, key, loaded)}
    {@const ref = v ? app.game.media.find((m) => m.id === v) : undefined}
    {@const vol = cueVolume(app.game, key)}
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
      {:else if v && missing}
        <!-- Its file isn't here, or (an online link) the site says its link has expired, as 🖼 Media shows it. -->
        {#if ref?.url && linkLifetime(ref) === 'expired'}
          <span class="missing small" title={ref.url}>⚠ {ref.name}’s link expired: {builtin ? 'plays the built-in sound' : 'plays nothing'} (add the file again)</span>
        {:else}
          <span class="missing small" title={nameOf(v)}>⚠ {nameOf(v) ?? 'Its file'} is missing: {builtin ? 'plays the built-in sound' : 'plays nothing'}</span>
        {/if}
        <!-- (Not for a file deleted from the game: there's nothing left to put it back in.) -->
        {#if ref}
          <button class="small primary" onclick={() => findFile(v)}
            title={ref.url ? 'Pick the file on this computer: the game keeps it in place of the link, everywhere it’s used' : "Pick the file again: every place it's used gets it back"}
            >🔗 Find file…</button>
        {/if}
      {:else if v}
        <span class="file" title={nameOf(v)}>🔊 {nameOf(v)}</span>
      {:else if builtin}
        <span class="muted small">Built-in</span>
      {/if}
      {#if cueHere(app.game, key)}
        <label class="vol small" title="Volume">
          <input type="range" min="0" max="1" step="0.05" value={vol} oninput={(e) => setVolume(key, +e.currentTarget.value)} aria-label="{label} volume" />
          <span class="pct">{Math.round(vol * 100)}%</span>
        </label>
        <button class="small ghost" onclick={() => preview(key)} title={previewing === key ? 'Stop' : 'Preview'} aria-label="Preview {label}"
          aria-pressed={previewing === key}>{previewing === key ? '■' : '▶'}</button>
      {/if}
      {#if v && !off}
        <button class="small ghost" onclick={() => (audio[key] = undefined)} title={builtin ? 'Back to the built-in sound' : 'Remove'}
          aria-label={builtin ? `Back to the built-in ${label} sound` : `Remove the ${label} sound`}
        >
          {builtin ? '↺' : '−'}
        </button>
      {/if}
      <div class="pop">
        <button class="small" onclick={() => (picking = key)} use:mediaDrop={{ kind: 'audio', onpick: (id) => choose(key, id) }}
          aria-label="{v ? 'Change' : 'Choose'} file for {label}">
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
  /* Switched off: its name in the muted color (still 4.5:1). */
  .sound.off .what b {
    color: var(--muted);
  }
  .missing {
    color: var(--warn);
    max-width: 260px;
  }
  .vol {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .vol input {
    width: 70px;
  }
  .pct {
    min-width: 3.2em;
    text-align: right;
    color: var(--muted);
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
