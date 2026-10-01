<!-- Theme presets + full override (spec §5.7), with a live board preview. -->
<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { step } from '../lib/history.svelte';
  import { fontChoices } from '../lib/fonts';
  import { imgFallback, mediaUrls } from '../lib/media.svelte';
  import { newLive } from '../lib/live';
  import { isBoard, newId, newRound } from '../lib/model';
  import { newSession } from '../lib/session';
  import { BANNER_DEFAULT, BANNER_MAX, BANNER_MIN, PRESETS, presetEdited, presetTheme, stageText, type ThemePreset } from '../lib/theme';
  import Stage from '../lib/Stage.svelte';
  import AudienceView from '../play/AudienceView.svelte';
  import MediaPicker from './slide/MediaPicker.svelte';
  import { mediaDrop } from '../lib/mediadrop';

  const game = $derived(app.game);
  const t = $derived(game.theme);
  const fonts = $derived(fontChoices(game));
  let picking = $state<'bg' | 'banner' | null>(null);

  // The preview shows the first Jeopardy board, or a sample board while the game has none (not added to the game).
  const sample = newRound('Jeopardy!', 6);
  const shown = $derived(game.rounds.some(isBoard) ? game : { ...game, rounds: [sample] });

  // A pretend game in progress for the preview.
  const demo = $derived.by(() => {
    const s = newSession(shown);
    if (!s.players.length)
      s.players = ['Alex', 'Sam', 'Jordan'].map((name, i) => ({ id: newId(), name, color: ['#e6194b', '#3cb44b', '#4363d8'][i], startScore: [1200, 400, -200][i] }));
    s.currentRound = Math.max(0, shown.rounds.findIndex(isBoard));
    const r = shown.rounds[s.currentRound];
    if (isBoard(r)) r.categories.forEach((c, ci) => ci % 2 === 0 && c.clues[0] && (s.used[c.clues[0].id] = true));
    s.currentPickerId = s.players[0]?.id;
    return s;
  });
  const live = newLive();

  // A preset replaces every color and font, so the note at the bottom offers Undo.
  function applyPreset(p: ThemePreset): void {
    // A preset changes colors and fonts, not the images or layout.
    const { boardImage, banner, bannerHeight, bannerFit, scoreBar } = t;
    step(`Theme preset: ${PRESETS[p].label}`, () => (game.theme = { ...presetTheme(p), boardImage, banner, bannerHeight, bannerFit, scoreBar }), { notify: true });
  }

  const COLORS: [keyof typeof t, string][] = [
    ['tile', 'Tiles & slide background'],
    ['tileUsed', 'Used tiles'],
    ['boardGap', 'Lines around tiles'],
    ['value', 'Values'],
    ['boardText', 'Category names'],
    ['stageText', 'Text on slides & scores'],
    ['scoreBarBg', 'Score bar'],
  ];
</script>

<h2>Theme</h2>
<div class="layout">
  <div class="controls">
    <div class="presets">
      {#each Object.entries(PRESETS) as [key, p]}
        <button class="preset" class:on={t.preset === key} aria-pressed={t.preset === key} onclick={() => applyPreset(key as ThemePreset)}>
          <span class="sw" aria-hidden="true" style:background={p.theme.tile} style:color={p.theme.value} style:font-family={p.theme.valueFont}>$400</span>
          {p.label}{t.preset === key && presetEdited(t) ? ' (edited)' : ''}
        </button>
      {/each}
    </div>

    <h4>Colors</h4>
    <div class="grid">
      {#each COLORS as [key, label]}
        <label class="check">
          <input type="color" value={key === 'stageText' ? stageText(t) : (t[key] as string)} oninput={(e) => ((t as unknown as Record<string, string>)[key] = e.currentTarget.value)} />
          {label}
        </label>
      {/each}
      <label class="check">
        <input type="checkbox" checked={t.glow !== 'none'} onchange={(e) => (t.glow = e.currentTarget.checked ? '#ff00e6' : 'none')} />
        Tile glow
        {#if t.glow !== 'none'}<input type="color" bind:value={t.glow} />{/if}
      </label>
    </div>

    <h4>Fonts</h4>
    <div class="grid">
      <label class="field">
        Category names
        <select bind:value={t.boardFont}>
          {#each fonts as f}<option value={f.css} style:font-family={f.css}>{f.label}</option>{/each}
          {#if !fonts.some((f) => f.css === t.boardFont)}<option value={t.boardFont}>{t.boardFont.split(',')[0]}</option>{/if}
        </select>
      </label>
      <label class="field">
        Values & scores
        <select bind:value={t.valueFont}>
          {#each fonts as f}<option value={f.css} style:font-family={f.css}>{f.label}</option>{/each}
          {#if !fonts.some((f) => f.css === t.valueFont)}<option value={t.valueFont}>{t.valueFont.split(',')[0]}</option>{/if}
        </select>
      </label>
    </div>

    <h4>Board</h4>
    <div class="grid">
      <div class="row pop">
        <span>Background image</span>
        {#if t.boardImage && mediaUrls[t.boardImage]}<img src={mediaUrls[t.boardImage]} alt="" onerror={imgFallback} />{/if}
        <button class="small" onclick={() => (picking = 'bg')} use:mediaDrop={{ kind: 'image', onpick: (id) => (t.boardImage = id) }}>{t.boardImage ? 'Change…' : 'Choose…'}</button>
        {#if t.boardImage}<button class="small ghost" onclick={() => (t.boardImage = undefined)} title="Remove" aria-label="Remove background image">−</button>{/if}
        {#if picking === 'bg'}<MediaPicker kind="image" onpick={(id) => ((t.boardImage = id), (picking = null))} onclose={() => (picking = null)} />{/if}
      </div>
      <div class="row pop">
        <span title="A logo or show title across the top of the board">Banner above the board</span>
        {#if t.banner && mediaUrls[t.banner]}<img src={mediaUrls[t.banner]} alt="" onerror={imgFallback} />{/if}
        <button class="small" onclick={() => (picking = 'banner')} use:mediaDrop={{ kind: 'image', onpick: (id) => (t.banner = id) }}>{t.banner ? 'Change…' : 'Choose…'}</button>
        {#if t.banner}<button class="small ghost" onclick={() => (t.banner = undefined)} title="Remove" aria-label="Remove banner">−</button>{/if}
        {#if picking === 'banner'}<MediaPicker kind="image" onpick={(id) => ((t.banner = id), (picking = null))} onclose={() => (picking = null)} />{/if}
      </div>
      {#if t.banner}
        <label class="field">
          Banner height
          <input
            type="range"
            min={BANNER_MIN}
            max={BANNER_MAX}
            step="10"
            value={t.bannerHeight ?? BANNER_DEFAULT}
            oninput={(e) => (t.bannerHeight = +e.currentTarget.value)}
          />
        </label>
        <label class="field">
          Banner fit
          <select value={t.bannerFit ?? 'contain'} onchange={(e) => (t.bannerFit = e.currentTarget.value === 'cover' ? 'cover' : undefined)}>
            <option value="contain">Fit (whole image)</option>
            <option value="cover">Fill (crop edges)</option>
          </select>
        </label>
      {/if}
      <label class="field">
        Score bar
        <select bind:value={t.scoreBar}>
          <option value="bottom">Bottom</option>
          <option value="top">Top</option>
          <option value="hidden">Hidden (use the 📊 Scores overlay)</option>
        </select>
      </label>
    </div>
    <p class="muted small">
      Question and answer slides use the tile color as their background unless a slide sets its own. Each text box's font and
      effects are set in the slide editor (use "Use this style elsewhere" to copy a look to every clue). Category images and
      free-placed board images are set per round in each round's tab.
    </p>
  </div>

  <div class="preview">
    <Stage>
      <AudienceView game={shown} session={demo} {live} role="mirror" />
    </Stage>
  </div>
</div>

<style>
  h2 {
    margin: 0 0 10px;
  }
  h4 {
    margin: 16px 0 6px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
  }
  .layout {
    display: grid;
    grid-template-columns: minmax(300px, 420px) minmax(0, 1fr);
    gap: 20px;
    align-items: start;
  }
  .presets {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .preset {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
    padding: 8px;
  }
  .preset.on {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .sw {
    display: grid;
    place-items: center;
    height: 50px;
    border-radius: 4px;
    font-size: 26px;
    text-shadow: 2px 2px 0 #000;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .pop {
    position: relative;
    grid-column: 1 / -1;
  }
  img {
    height: 30px;
    border-radius: 4px;
  }
  .small {
    font-size: 12px;
  }
  .preview {
    aspect-ratio: 16 / 9;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid var(--border);
    position: sticky;
    top: 0;
  }
  @media (max-width: 900px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }
</style>
