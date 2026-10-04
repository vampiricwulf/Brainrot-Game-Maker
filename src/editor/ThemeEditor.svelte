<!--
  Theme presets + full override (spec §5.7), with a live board preview. The top of the settings (which theme this is,
  saving it, the built-in themes, My themes, sharing) is ThemeShare. A right-click (or Shift+F10) on a setting or a
  section offers to reset it to the theme it came from, and to copy and paste colors.
-->
<script lang="ts">
  import PageHeader from './PageHeader.svelte';
  import { app } from '../lib/app.svelte';
  import { contrast, mixHex, toHex } from '../lib/colors';
  import { step } from '../lib/history.svelte';
  import { isMenuKey, keyMenu, showMenu, type MenuEntry } from '../lib/menustate.svelte';
  import { loadMyThemes, type MyTheme } from '../lib/mytheme';
  import { referenceLook, themeOrigin } from '../lib/themesource';
  import { copyText } from '../play/standings';
  import { untrack } from 'svelte';
  import { fontChoices } from '../lib/fonts';
  import { imgFallback, mediaUrls } from '../lib/media.svelte';
  import { newLive } from '../lib/live';
  import { isBoard, newRound, roundName } from '../lib/model';
  import { ROUND_MODES } from '../lib/modes';
  import { FACTORY_COLOR, FACTORY_FONT, setClueText } from '../lib/cluetext';
  import {
    BANNER_DEFAULT,
    BANNER_MAX,
    BANNER_MIN,
    LOOK_RANGES,
    lookNumber,
    stageText,
    themeReadability,
    type Ranged,
    type Theme,
  } from '../lib/theme';
  import Stage from '../lib/Stage.svelte';
  import AudienceView from '../play/AudienceView.svelte';
  import MediaPicker from './slide/MediaPicker.svelte';
  import { mediaDrop } from '../lib/mediadrop';
  import ThemeShare from './ThemeShare.svelte';
  import type { SharedTheme } from '../lib/themefile';
  import { themeDemo } from './themedemo';

  /**
   * `round`: the round last open in the editor, which the preview starts on. `incoming`: a theme file opened or dropped
   * on the editor, to show first (taken, it goes back to null).
   */
  let { round: lastRound, incoming = $bindable(null) }: { round?: number; incoming?: SharedTheme | null } = $props();
  const game = $derived(app.game);
  const t = $derived(game.theme);
  const fonts = $derived(fontChoices(game));
  let picking = $state<'bg' | 'banner' | null>(null);

  // The preview shows one of the game's rounds as it plays (the one last open, else the first), or a clue; a sample
  // board while the game has no rounds (not added to the game).
  const sample = newRound('Jeopardy!', 6);
  const shown = $derived(game.rounds.length ? game : { ...game, rounds: [sample] });
  /** A round's index, or 'clue': the first board's first clue, open. */
  let previewing = $state<number | 'clue'>(untrack(() => (lastRound !== undefined && lastRound < app.game.rounds.length ? lastRound : 0)));
  const firstBoard = $derived(shown.rounds.findIndex(isBoard));
  const view = $derived(previewing === 'clue' ? (firstBoard >= 0 ? 'clue' : 0) : Math.min(previewing, shown.rounds.length - 1));

  // A pretend game in progress for the preview.
  const demo = $derived(themeDemo(shown, view === 'clue' ? firstBoard : view, view === 'clue'));

  /** The game's clue text: a font or color for the main text of every question and answer (the note offers Undo). */
  function clueText(key: 'font' | 'color', to: string | undefined): void {
    const what = key === 'font' ? 'font' : 'color';
    step(`Clue text ${what}: ${to ? (key === 'font' ? to.split(',')[0].replace(/'/g, '') : to) : 'each clue’s own'}`, () => setClueText(game, key, to), { notify: true });
  }
  const live = newLive();

  /** My themes (ThemeShare changes them), and where this game's theme came from: one card is marked by it. */
  let list = $state.raw<MyTheme[]>(loadMyThemes());
  const origin = $derived(themeOrigin(t, list, game.media));

  /** How well the values and the category names read on their colors (a note under 3:1). */
  const readable = $derived(themeReadability(t));
  const hard = (r: number | null): r is number => r !== null && r < 3;

  const COLORS: [keyof typeof t, string][] = [
    ['tile', 'Tiles & slide background'],
    ['tileUsed', 'Used tiles'],
    ['boardGap', 'Lines around tiles'],
    ['value', 'Values'],
    ['boardText', 'Category names'],
    ['stageText', 'Text on slides & scores'],
    ['scoreBarBg', 'Score bar'],
  ];

  /** Set a theme field (undefined: back to its default). */
  function set<K extends keyof Theme>(k: K, v: Theme[K]): void {
    t[k] = v;
  }
  /** A slider's number, or its default (unset) at the default. */
  function setNumber(k: Ranged, v: number): void {
    set(k, v === LOOK_RANGES[k].def ? undefined : v);
  }
  /** A color for a color box, which only takes #rrggbb (a theme's rgb() or named color shows as itself; none: the fallback). */
  const hex = (c: string | undefined, fallback: string) => toHex(c) ?? fallback;
  /** A second color to start from: the first one, a little lighter (or darker on a light one). */
  const near = (c: string) => mixHex(hex(c, '#000000'), contrast(hex(c, '#000000'), '#000') > 10 ? '#000000' : '#ffffff', 0.22);
  const set2 = (keys: (keyof Theme)[]) => keys.some((k) => t[k] !== undefined);
  /** Take a section's looks back to the plain ones. */
  function plain(keys: (keyof Theme)[]): void {
    for (const k of keys) if (t[k] !== undefined) set(k, undefined);
  }
  const TILE_LOOKS: (keyof Theme)[] = ['tilePattern', 'tile2', 'tileGradient', 'tileAngle', 'tileBorder', 'tileBorderWidth', 'tileRadius', 'glowSize', 'tileShadow', 'valueShadow', 'usedLook'];
  const HEADER_LOOKS: (keyof Theme)[] = ['headerBg', 'header2', 'headerGradient', 'headerLine'];
  const PLATE_LOOKS: (keyof Theme)[] = ['plateShape', 'leaderGlow'];
  /** Sections with looks of their own start open (then they open and close as the host likes). */
  const opened = $state(untrack(() => ({ tiles: set2(TILE_LOOKS), headers: set2(HEADER_LOOKS), plates: set2(PLATE_LOOKS) })));

  // ---------- The settings' right-click menu ----------

  /** Each section's settings (what "Reset section" puts back), by its data-sec. */
  const SECTIONS: Record<string, { name: string; keys: (keyof Theme)[]; plain?: string }> = {
    colors: { name: 'Colors', keys: ['tile', 'tileUsed', 'boardGap', 'value', 'boardText', 'stageText', 'scoreBarBg', 'glow'] },
    fonts: { name: 'Fonts', keys: ['boardFont', 'valueFont'] },
    clue: { name: 'Clue text', keys: ['clueFont', 'clueColor'] },
    board: { name: 'Board', keys: ['bannerHeight', 'bannerFit', 'scoreBar', 'stageBg', 'bgGradient', 'bgAngle', 'tileGap'] },
    tiles: { name: 'Tiles', keys: TILE_LOOKS, plain: 'Plain tiles' },
    headers: { name: 'Categories', keys: HEADER_LOOKS, plain: 'Plain categories' },
    plates: { name: 'Score plates', keys: PLATE_LOOKS, plain: 'Plain score plates' },
  };
  /** A setting as it shows (the slide text's worked out for an older game), to compare. */
  const shownValue = (th: Theme, k: keyof Theme) => String((k === 'stageText' ? stageText(th) : th[k]) ?? '').toLowerCase();
  /** A color copied from a setting's menu, to paste in another. */
  let copiedColor = $state<string | null>(null);

  /** Put settings back as in the theme this one came from (one step; the clue text restyles the clues, as its own box does). */
  function resetTo(keys: (keyof Theme)[], label: string): void {
    const { look } = referenceLook(t, origin);
    const differ = keys.filter((k) => shownValue(t, k) !== shownValue(look, k));
    if (!differ.length) return;
    step(label, () => {
      for (const k of differ) {
        if (k === 'clueFont' || k === 'clueColor') setClueText(game, k === 'clueFont' ? 'font' : 'color', look[k]);
        else set(k, $state.snapshot(look[k]) as never);
      }
    }, { notify: true });
  }

  function pasteColor(k: keyof Theme, c: string): void {
    if (k === 'clueColor') return clueText('color', c);
    step(null, () => set(k, c as never));
  }

  /** The menu for a setting (`field`, a [data-k] element) or a section (`sec`). */
  function settingItems(field: HTMLElement | null, sec: HTMLElement | null): MenuEntry[] {
    const { look, name } = referenceLook(t, origin);
    const items: MenuEntry[] = [];
    if (field) {
      const k = field.dataset.k as keyof Theme;
      const title = field.dataset.name ?? field.innerText.split('\n')[0].replace(/\s*\(.*\)\s*$/, '').trim();
      const box = field.querySelector<HTMLInputElement>('input[type=color]');
      const changed = shownValue(t, k) !== shownValue(look, k);
      items.push(
        { heading: title },
        { label: `↺ Reset to ${name}`, disabled: !changed, hint: changed ? `Back to this setting in ${name}` : `The same as in ${name}`, onclick: () => resetTo([k], `Theme: ${title.toLowerCase()} as in ${name}`) },
      );
      if (field.dataset.color !== undefined) {
        items.push(
          { label: '📋 Copy color', disabled: !box, hint: box ? box.value : 'Turn it on first', onclick: () => box && ((copiedColor = box.value), void copyText(box.value, `Copied ${box.value}`)) },
          { label: `📋 Paste color${copiedColor ? ` ${copiedColor}` : ''}`, disabled: !copiedColor || copiedColor === box?.value, onclick: () => copiedColor && pasteColor(k, copiedColor) },
        );
      }
    }
    const s = sec ? SECTIONS[sec.dataset.sec ?? ''] : undefined;
    if (s) {
      const changed = s.keys.some((k) => shownValue(t, k) !== shownValue(look, k));
      items.push(
        field ? { sep: true } : { heading: s.name },
        { label: `↺ Reset ${s.name} to ${name}`, disabled: !changed, hint: `Every setting in ${s.name} as in ${name}`, onclick: () => resetTo(s.keys, `Theme: ${s.name.toLowerCase()} as in ${name}`) },
      );
      if (s.plain) items.push({ label: `↺ ${s.plain}`, disabled: !set2(s.keys), onclick: () => step(`Theme: ${s.plain!.toLowerCase()}`, () => plain(s.keys), { notify: true }) });
    }
    return items;
  }

  /** A right-click (or Shift+F10) on the settings: the menu of the setting or section under it. The cards have their own. */
  function settingsMenu(e: MouseEvent | KeyboardEvent): void {
    if (e.defaultPrevented) return;
    const el = e.target as HTMLElement;
    // (Text boxes keep the browser's menu: cut, copy, paste.)
    if (el.closest('.card, .savebar, .share, textarea, input[type=text], input:not([type])')) return;
    const field = el.closest<HTMLElement>('[data-k]');
    const sec = el.closest<HTMLElement>('details.sec[data-sec]');
    if (!field && !sec) return;
    const items = settingItems(field, sec);
    if (e instanceof KeyboardEvent) keyMenu(e, items, el);
    else showMenu(e, items);
  }
</script>

{#snippet valuesNote()}
  {#if hard(readable.values)}
    <p class="warn small" role="status">⚠ The values are hard to read on the tiles ({readable.values.toFixed(1)}:1): pick colors further apart.</p>
  {/if}
{/snippet}
{#snippet namesNote()}
  {#if hard(readable.names)}
    <p class="warn small" role="status">⚠ The category names are hard to read on their color ({readable.names.toFixed(1)}:1): pick colors further apart.</p>
  {/if}
{/snippet}

<PageHeader title="Theme" sub="How the board, the slides and the scores look on stream, in every round." />
<div class="layout">
  <!-- svelte-ignore a11y_no_static_element_interactions (the settings' menu key: each control in it takes the focus) -->
  <div class="controls" oncontextmenu={settingsMenu} onkeydown={(e) => isMenuKey(e) && settingsMenu(e)}>
    <ThemeShare bind:incoming bind:list {origin} />

    <details class="sec" open data-sec="colors">
    <summary>Colors</summary>
    <div class="grid">
      {#each COLORS as [key, label]}
        <label class="check" data-k={key} data-color>
          <input type="color" value={hex(key === 'stageText' ? stageText(t) : (t[key] as string), '#000000')} oninput={(e) => ((t as unknown as Record<string, string>)[key] = e.currentTarget.value)} />
          {label}
        </label>
      {/each}
      <label class="check" data-k="glow" data-color>
        <input type="checkbox" checked={t.glow !== 'none'} onchange={(e) => (t.glow = e.currentTarget.checked ? '#ff00e6' : 'none')} />
        Tile glow
        {#if t.glow !== 'none'}<input type="color" value={hex(t.glow, '#ff00e6')} oninput={(e) => (t.glow = e.currentTarget.value)} aria-label="Tile glow color" />{/if}
      </label>
    </div>
    {@render valuesNote()}
    {@render namesNote()}
    {#if hard(readable.text)}
      <p class="warn small" role="status">⚠ Clues, answers and scores are hard to read on the tile color ({readable.text.toFixed(1)}:1): pick a “Text on slides & scores” further from it.</p>
    {/if}
    </details>

    <details class="sec" open data-sec="fonts">
    <summary>Fonts</summary>
    <div class="grid">
      <label class="field" data-k="boardFont">
        Category names
        <select bind:value={t.boardFont}>
          {#each fonts as f}<option value={f.css} style:font-family={f.css}>{f.label}</option>{/each}
          {#if !fonts.some((f) => f.css === t.boardFont)}<option value={t.boardFont}>{t.boardFont.split(',')[0]}</option>{/if}
        </select>
      </label>
      <label class="field" data-k="valueFont">
        Values & scores
        <select bind:value={t.valueFont}>
          {#each fonts as f}<option value={f.css} style:font-family={f.css}>{f.label}</option>{/each}
          {#if !fonts.some((f) => f.css === t.valueFont)}<option value={t.valueFont}>{t.valueFont.split(',')[0]}</option>{/if}
        </select>
      </label>
    </div>
    </details>

    <details class="sec" open data-sec="clue">
    <summary>Clue text</summary>
    <div class="grid">
      <label class="field" data-k="clueFont" data-name="Clue text font">
        Font
        <select value={t.clueFont ?? ''} onchange={(e) => clueText('font', e.currentTarget.value || undefined)} aria-label="Clue text font">
          <option value="">Each clue's own</option>
          {#each fonts as f}<option value={f.css} style:font-family={f.css}>{f.label}</option>{/each}
          {#if t.clueFont && !fonts.some((f) => f.css === t.clueFont)}<option value={t.clueFont}>{t.clueFont.split(',')[0]}</option>{/if}
        </select>
      </label>
      <label class="check clue-color" data-k="clueColor" data-name="Clue text color" data-color>
        <input
          type="color"
          value={t.clueColor ?? hex(stageText(t), FACTORY_COLOR)}
          onchange={(e) => clueText('color', e.currentTarget.value)}
          aria-label="Clue text color"
        />
        Color
        {#if t.clueColor}<button class="small ghost" onclick={() => clueText('color', undefined)} title="Back to each clue's own color" aria-label="Back to each clue's own color">↺</button>{/if}
      </label>
    </div>
    <p class="muted small">
      The main text of every question and answer, and of new ones (text you styled yourself keeps its look). With no font
      here, new text uses {FACTORY_FONT.split(',')[0].replace(/'/g, '')}.
    </p>
    </details>

    <details class="sec" open data-sec="board">
    <summary>Board</summary>
    <div class="pics">
      <div class="row pop">
        <span>Background image</span>
        {#if t.boardImage && mediaUrls[t.boardImage]}<img src={mediaUrls[t.boardImage]} alt="" onerror={imgFallback} />{/if}
        <button class="small" onclick={() => (picking = 'bg')} use:mediaDrop={{ kind: 'image', onpick: (id) => (t.boardImage = id) }}>{t.boardImage ? 'Change…' : 'Choose…'}</button>
        {#if t.boardImage}<button class="ghost tiny" onclick={() => (t.boardImage = undefined)} title="Remove the background image" aria-label="Remove background image">✕</button>{/if}
        {#if picking === 'bg'}<MediaPicker kind="image" onpick={(id) => ((t.boardImage = id), (picking = null))} onclose={() => (picking = null)} />{/if}
      </div>
      <div class="row pop">
        <span title="A logo or show title across the top of the board">Banner above the board</span>
        {#if t.banner && mediaUrls[t.banner]}<img src={mediaUrls[t.banner]} alt="" onerror={imgFallback} />{/if}
        <button class="small" onclick={() => (picking = 'banner')} use:mediaDrop={{ kind: 'image', onpick: (id) => (t.banner = id) }}>{t.banner ? 'Change…' : 'Choose…'}</button>
        {#if t.banner}<button class="ghost tiny" onclick={() => (t.banner = undefined)} title="Remove the banner" aria-label="Remove banner">✕</button>{/if}
        {#if picking === 'banner'}<MediaPicker kind="image" onpick={(id) => ((t.banner = id), (picking = null))} onclose={() => (picking = null)} />{/if}
      </div>
    </div>
    <div class="grid">
      {#if t.banner}
        <label class="field" data-k="bannerHeight">
          Banner height ({t.bannerHeight ?? BANNER_DEFAULT})
          <input
            type="range"
            min={BANNER_MIN}
            max={BANNER_MAX}
            step="10"
            value={t.bannerHeight ?? BANNER_DEFAULT}
            oninput={(e) => (t.bannerHeight = +e.currentTarget.value)}
          />
        </label>
        <label class="field" data-k="bannerFit">
          Banner fit
          <select value={t.bannerFit ?? 'contain'} onchange={(e) => (t.bannerFit = e.currentTarget.value === 'cover' ? 'cover' : undefined)}>
            <option value="contain">Fit (whole image)</option>
            <option value="cover">Fill (crop edges)</option>
          </select>
        </label>
      {/if}
      <label class="field" data-k="scoreBar">
        Score bar
        <select bind:value={t.scoreBar}>
          <option value="bottom">Bottom</option>
          <option value="top">Top</option>
          <option value="hidden">Hidden (use the 📊 Scores overlay)</option>
        </select>
      </label>
      <label class="field" data-k="stageBg" title="Fills the space around the stage, behind the board and around the scores window's plates, for OBS's Chroma Key filter">
        Stage background (OBS)
        <select value={t.stageBg ?? ''} onchange={(e) => (t.stageBg = (e.currentTarget.value || undefined) as typeof t.stageBg)}>
          <option value="">Theme colors</option>
          <option value="green">Chroma green</option>
          <option value="magenta">Chroma magenta</option>
        </select>
      </label>
      <label class="field" data-k="tileGap">
        Space between tiles ({lookNumber(t, 'tileGap')})
        <input type="range" min={LOOK_RANGES.tileGap.min} max={LOOK_RANGES.tileGap.max} step="1" value={lookNumber(t, 'tileGap')} oninput={(e) => setNumber('tileGap', +e.currentTarget.value)} />
      </label>
      <label class="check" data-k="bgGradient" data-color title="The board's background fades from the line color (in Colors) to this one">
        <input type="checkbox" checked={!!t.bgGradient} onchange={(e) => set('bgGradient', e.currentTarget.checked ? near(t.boardGap) : undefined)} />
        Background gradient
        {#if t.bgGradient}<input type="color" value={hex(t.bgGradient, '#000000')} oninput={(e) => set('bgGradient', e.currentTarget.value)} aria-label="Background gradient color" />{/if}
      </label>
      {#if t.bgGradient}
        <label class="field" data-k="bgAngle">
          Background direction ({lookNumber(t, 'bgAngle')}°)
          <input type="range" min="0" max="360" step="15" value={lookNumber(t, 'bgAngle')} oninput={(e) => setNumber('bgAngle', +e.currentTarget.value)} />
        </label>
      {/if}
    </div>
    <p class="muted small">
      Slides use the tile color as their background unless they set their own. Text styles are set in the slide editor;
      category images and board images in each round's tab.
    </p>
    </details>

    <details class="sec" bind:open={opened.tiles} data-sec="tiles">
    <summary>Tiles{#if set2(TILE_LOOKS)}<span class="changed">· changed</span>{/if}</summary>
    <div class="grid">
      <label class="field" data-k="tilePattern">
        Alternating tiles
        <select
          value={t.tilePattern ?? ''}
          onchange={(e) => {
            const v = (e.currentTarget.value || undefined) as Theme['tilePattern'];
            step(`Theme: alternating tiles ${v ? { checker: 'checkerboard', rows: 'by row', columns: 'by column' }[v] : 'off'}`, () => {
              set('tilePattern', v);
              if (v && !t.tile2) set('tile2', near(t.tile));
            });
          }}
        >
          <option value="">Off</option>
          <option value="checker">Checkerboard</option>
          <option value="rows">By row</option>
          <option value="columns">By column</option>
        </select>
      </label>
      {#if t.tilePattern}
        <label class="check" data-k="tile2" data-color>
          <input type="color" value={hex(t.tile2, near(t.tile))} oninput={(e) => set('tile2', e.currentTarget.value)} />
          Second tile color
        </label>
      {:else}<span></span>{/if}
      <label class="check" data-k="tileGradient" data-name="Tile gradient" data-color>
        <input type="checkbox" checked={!!t.tileGradient} onchange={(e) => set('tileGradient', e.currentTarget.checked ? near(t.tile) : undefined)} />
        Gradient
        {#if t.tileGradient}<input type="color" value={hex(t.tileGradient, '#000000')} oninput={(e) => set('tileGradient', e.currentTarget.value)} aria-label="Tile gradient color" />{/if}
      </label>
      {#if t.tileGradient || t.headerGradient}
        <label class="field" data-k="tileAngle">
          Gradient direction ({lookNumber(t, 'tileAngle')}°)
          <input type="range" min="0" max="360" step="15" value={lookNumber(t, 'tileAngle')} oninput={(e) => setNumber('tileAngle', +e.currentTarget.value)} />
        </label>
      {:else}<span></span>{/if}
      <label class="check" data-k="tileBorder" data-color>
        <input type="color" value={hex(t.tileBorder, '#000000')} oninput={(e) => set('tileBorder', e.currentTarget.value)} />
        Border color
        {#if t.tileBorder}<button class="small ghost" onclick={() => set('tileBorder', undefined)} title="Back to the plain dark edge" aria-label="Border color back to the plain one">↺</button>{/if}
      </label>
      <label class="field" data-k="tileBorderWidth">
        Border width ({lookNumber(t, 'tileBorderWidth')})
        <input type="range" min="0" max={LOOK_RANGES.tileBorderWidth.max} step="1" value={lookNumber(t, 'tileBorderWidth')} oninput={(e) => setNumber('tileBorderWidth', +e.currentTarget.value)} />
      </label>
      <label class="field" data-k="tileRadius">
        Rounded corners ({lookNumber(t, 'tileRadius')})
        <input type="range" min="0" max={LOOK_RANGES.tileRadius.max} step="2" value={lookNumber(t, 'tileRadius')} oninput={(e) => setNumber('tileRadius', +e.currentTarget.value)} />
      </label>
      {#if t.glow !== 'none'}
        <label class="field" data-k="glowSize">
          Glow size ({lookNumber(t, 'glowSize')})
          <input type="range" min="0" max={LOOK_RANGES.glowSize.max} step="2" value={lookNumber(t, 'glowSize')} oninput={(e) => setNumber('glowSize', +e.currentTarget.value)} />
        </label>
      {:else}
        <span class="hint glow-hint">Glow size: turn on Tile glow (in Colors) first</span>
      {/if}
      <label class="check" data-k="tileShadow">
        <input type="checkbox" checked={!!t.tileShadow} onchange={(e) => set('tileShadow', e.currentTarget.checked || undefined)} />
        Drop shadow
      </label>
      <label class="field" data-k="valueShadow">
        Value shadow
        <select value={t.valueShadow ?? ''} onchange={(e) => set('valueShadow', (e.currentTarget.value || undefined) as Theme['valueShadow'])}>
          <option value="">Hard</option>
          <option value="soft">Soft</option>
          <option value="none">None</option>
        </select>
      </label>
      <label class="field" data-k="usedLook">
        Played tiles
        <select value={t.usedLook ?? ''} onchange={(e) => set('usedLook', (e.currentTarget.value || undefined) as Theme['usedLook'])}>
          <option value="">Used-tile color</option>
          <option value="dim">Dimmed</option>
          <option value="hidden">Hidden</option>
        </select>
      </label>
    </div>
    {#if opened.tiles}{@render valuesNote()}{/if}
    <button class="small ghost reset" disabled={!set2(TILE_LOOKS)} onclick={() => step('Theme: plain tiles', () => plain(TILE_LOOKS), { notify: true })}>↺ Plain tiles</button>
    </details>

    <details class="sec" bind:open={opened.headers} data-sec="headers">
    <summary>Categories{#if set2(HEADER_LOOKS)}<span class="changed">· changed</span>{/if}</summary>
    <div class="grid">
      <label class="check" data-k="headerBg" data-color>
        <input type="color" value={hex(t.headerBg, hex(t.tile, '#000000'))} oninput={(e) => set('headerBg', e.currentTarget.value)} />
        Category color
        {#if t.headerBg}<button class="small ghost" onclick={() => set('headerBg', undefined)} title="Back to the tile color" aria-label="Category color back to the tile color">↺</button>{/if}
      </label>
      <label class="check" data-k="header2" data-name="Second category color" data-color>
        <input type="checkbox" checked={!!t.header2} onchange={(e) => set('header2', e.currentTarget.checked ? near(t.headerBg ?? t.tile) : undefined)} />
        Alternate colors
        {#if t.header2}<input type="color" value={hex(t.header2, '#000000')} oninput={(e) => set('header2', e.currentTarget.value)} aria-label="Second category color" />{/if}
      </label>
      <label class="check" data-k="headerGradient" data-name="Category gradient" data-color>
        <input type="checkbox" checked={!!t.headerGradient} onchange={(e) => set('headerGradient', e.currentTarget.checked ? near(t.headerBg ?? t.tile) : undefined)} />
        Gradient
        {#if t.headerGradient}<input type="color" value={hex(t.headerGradient, '#000000')} oninput={(e) => set('headerGradient', e.currentTarget.value)} aria-label="Category gradient color" />{/if}
      </label>
      <label class="check" data-k="headerLine" data-color>
        <input type="checkbox" checked={t.headerLine !== 'none'} onchange={(e) => set('headerLine', e.currentTarget.checked ? undefined : 'none')} />
        Line under them
        {#if t.headerLine !== 'none'}<input type="color" value={hex(t.headerLine, '#000000')} oninput={(e) => set('headerLine', e.currentTarget.value)} aria-label="Line under the categories color" />{/if}
      </label>
    </div>
    {#if opened.headers}{@render namesNote()}{/if}
    <p class="muted small">The names' color and font are in Colors and Fonts; a gradient goes the tiles' direction.</p>
    <button class="small ghost reset" disabled={!set2(HEADER_LOOKS)} onclick={() => step('Theme: plain categories', () => plain(HEADER_LOOKS), { notify: true })}>↺ Plain categories</button>
    </details>

    <details class="sec" bind:open={opened.plates} data-sec="plates">
    <summary>Score plates{#if set2(PLATE_LOOKS)}<span class="changed">· changed</span>{/if}</summary>
    <div class="grid">
      <label class="field" data-k="plateShape">
        Plate corners
        <select value={t.plateShape ?? ''} onchange={(e) => set('plateShape', (e.currentTarget.value || undefined) as Theme['plateShape'])}>
          <option value="">Rounded</option>
          <option value="square">Square</option>
          <option value="pill">Pill</option>
        </select>
      </label>
      <label class="check" data-k="leaderGlow" title="The plate of the player with the most points glows in the value color">
        <input type="checkbox" checked={!!t.leaderGlow} onchange={(e) => set('leaderGlow', e.currentTarget.checked || undefined)} />
        Glow on the leader
      </label>
    </div>
    <button class="small ghost reset" disabled={!set2(PLATE_LOOKS)} onclick={() => step('Theme: plain score plates', () => plain(PLATE_LOOKS), { notify: true })}>↺ Plain score plates</button>
    </details>
    <p class="hint tip">Right-click a setting or a section (or press Shift+F10 on it) to reset it to the theme it came from, or to copy and paste a color.</p>
  </div>

  <div class="side">
    <label class="check preview-pick">
      Preview
      <select bind:value={previewing} aria-label="Preview">
        {#each shown.rounds as r, i (r.id)}<option value={i}>{ROUND_MODES[r.mode].icon} {roundName(r, i)}</option>{/each}
        {#if firstBoard >= 0}<option value="clue">❓ A clue</option>{/if}
      </select>
    </label>
    <div class="preview">
      <Stage>
        <AudienceView game={shown} session={demo} {live} role="mirror" />
      </Stage>
    </div>
  </div>
</div>

<style>
  /* Folding sections: the summary reads like a heading. */
  .sec {
    margin-top: 14px;
  }
  .sec > summary {
    cursor: pointer;
    width: fit-content;
    margin-bottom: 6px;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
  }
  .changed {
    margin-left: 0.4em;
    text-transform: none;
    letter-spacing: 0;
    font-weight: 400;
    color: var(--accent);
  }
  .reset {
    margin-top: 6px;
  }
  .layout {
    display: grid;
    grid-template-columns: minmax(300px, 460px) minmax(0, 1fr);
    gap: 20px;
    align-items: start;
  }
  /* Two columns that never grow past the controls' width (a long option in a select would push them out). */
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px 12px;
    /* A tick or a color box lines up with the box or slider beside it, under that one's label. */
    align-items: end;
  }
  .grid > .check {
    min-height: 32px;
  }
  .grid select {
    max-width: 100%;
  }
  .warn {
    margin: 8px 0 0;
  }
  /* The pictures: their Choose… buttons in one column. */
  .pics {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 8px;
  }
  .pop {
    position: relative;
    flex-wrap: nowrap;
    min-height: 30px;
  }
  .pop > span {
    flex: 0 0 13em;
    white-space: nowrap;
  }
  .tip {
    margin: 16px 0 0;
  }
  img {
    height: 30px;
    border-radius: 4px;
  }
  .side {
    position: sticky;
    top: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .preview-pick {
    align-self: flex-end;
    font-size: 13px;
  }
  .preview {
    aspect-ratio: 16 / 9;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid var(--border);
  }
  .glow-hint {
    align-self: center;
  }
  .clue-color {
    align-self: end;
  }
  @media (max-width: 900px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }
</style>
