<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { step } from '../lib/history.svelte';
  import { mediaUrls } from '../lib/media.svelte';
  import type { GameAudio } from '../lib/model';
  import PlayerList from './PlayerList.svelte';
  import MediaPicker from './slide/MediaPicker.svelte';
  import { mediaDrop } from '../lib/mediadrop';

  const s = $derived(app.game.settings);
  const audio = $derived(app.game.audio);
  let picking = $state<keyof GameAudio | null>(null);

  const SOUNDS: [keyof GameAudio, string, string][] = [
    ['roundIntro', 'Round intro', 'Plays with the round title card'],
    ['dailyDouble', 'Daily Double', 'Plays with the Daily Double splash'],
    ['timesUp', "Time's up", 'Plays when a countdown runs out'],
    ['finalThink', 'Final round think music', 'Plays when the final question appears'],
    ['winner', 'Winner', 'Plays on the winner screen'],
  ];

  const nameOf = (id?: string) => app.game.media.find((m) => m.id === id)?.name;
  let previewEl = $state<HTMLAudioElement>();
  function preview(id: string): void {
    if (!previewEl) return;
    previewEl.src = mediaUrls[id];
    previewEl.play();
  }
</script>

<section>
  <h2>Players</h2>
  <p class="muted">The default roster. You can still change players before and during a game.</p>
  <!-- Removing is done at once: the note at the bottom offers Undo. -->
  <PlayerList
    bind:players={app.game.players}
    max={s.maxPlayers}
    avatars
    record={(label, fn) => step(label, fn)}
    onremove={(id) => {
      const p = app.game.players.find((x) => x.id === id);
      if (p) step(`Removed ${p.name}`, () => (app.game.players = app.game.players.filter((x) => x.id !== id)), { notify: true });
    }}
  />
</section>

<section>
  <h2>Rules</h2>
  <div class="grid">
    <label class="check"><input type="checkbox" bind:checked={s.allowNegativeScores} /> Allow negative scores</label>
    <label class="check">
      <input type="checkbox" bind:checked={s.deductOnWrong} /> Show quick ✔/✘ buttons (one click for right or wrong)
    </label>
    <label class="check">
      <input type="checkbox" bind:checked={s.pickerFollowsAward} /> Player who gets points picks next
    </label>
    <label class="field">
      Points symbol
      <input bind:value={s.currencySymbol} placeholder="$, pts, 🧠, or blank" maxlength="6" />
    </label>
  </div>
</section>

<section>
  <h2>Timers</h2>
  <div class="grid">
    <label class="field">
      Default clue countdown (seconds, blank = none)
      <input
        type="number"
        min="0"
        value={s.defaultTimerSeconds ?? ''}
        oninput={(e) => (s.defaultTimerSeconds = e.currentTarget.value === '' || +e.currentTarget.value === 0 ? null : +e.currentTarget.value)}
      />
    </label>
    <label class="check"><input type="checkbox" bind:checked={s.timerAutoStart} /> Start the countdown automatically when a clue opens</label>
  </div>
  <p class="muted small">The host can also start a timer any time with <b>T</b>, and set any clue's own time in the clue editor.</p>
</section>

<section>
  <h2>Round intro</h2>
  <div class="grid">
    <label class="check"><input type="checkbox" bind:checked={s.roundIntro.titleCard} /> Show the round's title card</label>
    <label class="check"><input type="checkbox" bind:checked={s.roundIntro.tileFill} /> Tiles fill in with an animation</label>
    <label class="field">
      Reveal categories
      <select bind:value={s.roundIntro.categoryReveal}>
        <option value="click">One at a time when I click (N)</option>
        <option value="auto">One at a time automatically</option>
        <option value="off">All at once</option>
      </select>
    </label>
  </div>
</section>

<section>
  <h2>Sounds</h2>
  <p class="muted">Optional audio files played on stream at key moments.</p>
  <audio bind:this={previewEl}></audio>
  <div class="sounds">
    {#each SOUNDS as [key, label, hint]}
      <div class="sound">
        <div>
          <b>{label}</b>
          <div class="muted small">{hint}</div>
        </div>
        <span class="spacer"></span>
        {#if audio[key]}
          <span class="file" title={nameOf(audio[key])}>🔊 {nameOf(audio[key]) ?? 'missing file'}</span>
          <button class="small ghost" onclick={() => preview(audio[key]!)} title="Preview">▶</button>
          <button class="small ghost" onclick={() => (audio[key] = undefined)} title="Remove">✕</button>
        {/if}
        <div class="pop">
          <button class="small" onclick={() => (picking = key)} use:mediaDrop={{ kind: 'audio', onpick: (id) => (audio[key] = id) }}>{audio[key] ? 'Change…' : 'Choose…'}</button>
          {#if picking === key}
            <MediaPicker kind="audio" onpick={(id) => ((audio[key] = id), (picking = null))} onclose={() => (picking = null)} />
          {/if}
        </div>
      </div>
    {/each}
  </div>
</section>

<style>
  section {
    max-width: 860px;
    margin-bottom: 28px;
  }
  h2 {
    margin: 0 0 4px;
    font-size: 18px;
  }
  p {
    margin: 0 0 12px;
  }
  .small {
    font-size: 12px;
  }
  .grid {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    align-items: end;
  }
  .sounds {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .sound {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
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
