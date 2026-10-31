<!-- Property panel for the selected slide element. -->
<script lang="ts">
  import { onDestroy, type Snippet } from 'svelte';
  import type { FitResult } from '../../lib/autofit';
  import { fontChoices } from '../../lib/fonts';
  import { playRange, playsAt, playsStep, playsText } from '../../lib/editing';
  import { mediaUrls } from '../../lib/media.svelte';
  import type { AudioEl, EmbedEl, EntranceType, Fit, Game, SlideElement, TextEl, VideoEl } from '../../lib/model';
  import { DRIVE_SHARE_HINT, embedName, formatWhen, linkHost } from '../../lib/links';
  import { stageText } from '../../lib/theme';
  import { toHex } from '../../lib/colors';
  import SaveCopyButton from '../SaveCopyButton.svelte';
  import NumField from './NumField.svelte';
  import ColorBox from '../../lib/ColorBox.svelte';
  import { app } from '../../lib/app.svelte';
  import { convertNow, editOffer } from '../../lib/shrink/apply';
  import { verdictOf } from '../../lib/shrink/checks.svelte';
  import { jobFor } from '../../lib/shrink/jobs.svelte';
  import { shortWhy } from '../../lib/shrink/words';

  let {
    el,
    game,
    onTile = false,
    fit,
    textArea = $bindable(),
    onorder,
    onreplace,
    onapplystyle,
    stylecategory = false,
    styleslides = false,
    stylescope,
    onuploadfont,
    objectsection,
    aligns,
  }: {
    el: SlideElement;
    game: Game;
    /** Nothing of the slide's own behind its text: plain white text is drawn in the theme's stage text colour. */
    onTile?: boolean;
    /** A text element's size as drawn on the canvas (after shrink-to-fit). */
    fit?: FitResult;
    textArea?: HTMLTextAreaElement;
    onorder: (dir: 'front' | 'back' | 'up' | 'down') => void;
    /** Replace the file: a picker drops from `from`, the button that asked. */
    onreplace: (from: HTMLElement) => void;
    /** "Use this style elsewhere" (not offered when missing). */
    onapplystyle?: (el: TextEl, scope: string) => void;
    /** Offer "this category" scopes for it. */
    stylecategory?: boolean;
    /** A slides round's: its round scope is its other slides (it has no answers). */
    styleslides?: boolean;
    /** The scope it starts on (else this category's questions, or this round's). */
    stylescope?: string;
    /** Upload a font: a picker drops from `from`, the ＋ button. */
    onuploadfont: (from: HTMLElement) => void;
    /** Extra settings for the item (RPG screens: its class, secret, host notes). */
    objectsection?: Snippet<[SlideElement]>;
    /** Move it to the slide's edges or middle: shown with X and Y. */
    aligns?: Snippet;
  } = $props();
  /** The selected image/video/audio file, when it plays from the internet (a live link). */
  const liveRef = $derived('media' in el ? game.media.find((m) => m.id === el.media && m.url) : undefined);
  /** Google Drive's or Streamable's own player: no playback options apply. */
  const sitePlayer = $derived(el.kind === 'embed' && (el.embedKind === 'drive' || el.embedKind === 'streamable'));
  // ---------- Plays from [ ] to [ ]: the part of its file this item plays, in clock time ----------
  type Timed = VideoEl | AudioEl | EmbedEl;
  /** A time typed (83, 1:23, 1:23.5; empty: the start or the end): kept in seconds; anything else goes back. */
  function setPlays(e: Event & { currentTarget: HTMLInputElement }, which: 'startAt' | 'endAt'): void {
    const t = playsAt(e.currentTarget.value);
    if (t !== null) (el as Timed)[which] = t;
    e.currentTarget.value = playsText((el as Timed)[which]);
    playsSet(e.currentTarget);
  }
  /** ↑ / ↓: 0.1 s (Shift: 1 s), an empty "to" from where it plays from. */
  function stepPlays(e: KeyboardEvent & { currentTarget: HTMLInputElement }, which: 'startAt' | 'endAt'): void {
    if ((e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const t = el as Timed;
    t[which] = playsStep(t[which], e.key === 'ArrowUp' ? 1 : -1, e.shiftKey, which === 'endAt' ? (t.startAt ?? 0) : 0);
    e.currentTarget.value = playsText(t[which]);
    playsSet(e.currentTarget);
  }
  /**
   * The box's text was just set from here (the time it took, or a step): as if just focused, it has no typing of its
   * own, so Ctrl+Z in it undoes the change through the history, not the browser's own undo of the typing before it
   * (which did nothing, or put that typing back in front). See createFieldTracker.
   */
  function playsSet(box: HTMLInputElement): void {
    if (document.activeElement === box) box.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  }
  /** The item's file (or a link's own address) for ▶ Try it, in the editor only (in play, the panel can be on stream). */
  const tryUrl = $derived(
    app.screen !== 'editor' || app.editGame
      ? undefined
      : el.kind === 'video' || el.kind === 'audio'
        ? mediaUrls[el.media]
        : el.kind === 'embed' && (el.embedKind === 'remoteVideo' || el.embedKind === 'remoteAudio')
          ? el.url
          : undefined,
  );
  const tryPicture = $derived(el.kind === 'video' || (el.kind === 'embed' && el.embedKind === 'remoteVideo'));
  /** ▶ Try it: the item being tried, its part playing here in the panel (pressed again, or at its end, it stops). */
  let trying = $state<string | null>(null);
  let tryEl = $state<HTMLMediaElement>();
  let raf = 0;
  function stopTry(): void {
    cancelAnimationFrame(raf);
    tryEl?.pause();
    trying = null;
  }
  /** Loaded: from where it plays from, at its volume, until where it plays to. */
  function tryFrom(): void {
    const m = tryEl;
    if (!m || !('volume' in el)) return;
    const t = el as Timed;
    const r = playRange(t.startAt, t.endAt);
    m.currentTime = r.start;
    m.volume = t.volume;
    const follow = () => {
      if (r.end !== undefined && m.currentTime >= r.end) return stopTry();
      raf = requestAnimationFrame(follow);
    };
    void m.play().then(follow, stopTry);
  }
  // Another item selected: it stops.
  $effect(() => {
    if (trying && trying !== el.id) stopTry();
  });
  onDestroy(stopTry);
  /** A video's or sound's file can be cut here (✎ Edit video… / sound… at the top of the panel). */
  const cuts = $derived((el.kind === 'video' || el.kind === 'audio') && !!editOffer(game.media.find((m) => m.id === el.media)));

  const WHITE = /^#?(fff|ffffff)$/i;
  const themeText = $derived(toHex(stageText(game.theme)) ?? '#ffffff');
  /** Drawn in the theme's stage text colour rather than its own (TextBox's `themed`): the Color box shows that one. */
  const themedText = $derived(el.kind === 'text' && onTile && !el.background && WHITE.test(el.color.trim()));
  function setTextColor(t: TextEl, v: string): void {
    // White picked where white means "the theme's colour" (a dark one, as Pastel's): kept white, as a white no eye can
    // tell apart.
    t.color = onTile && !t.background && WHITE.test(v) && !WHITE.test(themeText) ? '#fefefe' : v;
  }
  /** A colour of its own there instead: the Color box can't pick the theme's again (white is white), so ↺ does. */
  const ownOnTile = $derived(el.kind === 'text' && onTile && !el.background && !themedText && !WHITE.test(themeText));

  const ALIGN = { left: ['⇤', 'Align text left'], center: ['↔', 'Center the text'], right: ['⇥', 'Align text right'] } as const;
  const VALIGN = { top: ['⤒', 'Text at the top of the box'], middle: ['↕', 'Text in the middle of the box'], bottom: ['⤓', 'Text at the bottom of the box'] } as const;

  const fonts = $derived(fontChoices(game));
  const ENTRANCES: [EntranceType | '', string][] = $derived([
    ['', 'None'],
    ['fade', 'Fade in'],
    ['pop', 'Pop'],
    ['slide-left', 'Slide from left'],
    ['slide-right', 'Slide from right'],
    ['slide-up', 'Slide from bottom'],
    ['slide-down', 'Slide from top'],
    // A text box types its letters one by one; anything else wipes in from the left (the same saved setting).
    ['typewriter', el.kind === 'text' ? 'Typewriter (letter by letter)' : 'Wipe in'],
    ['shake', 'Shake'],
    ['spin', 'Spin in'],
  ]);

  function setEntrance(type: string): void {
    // Typing out a text takes about as long as reading it (20 letters a second, 1 to 5 seconds), unless a time was set.
    const typing = type === 'typewriter' && el.kind === 'text' && !el.entrance;
    const duration = typing ? Math.min(5, Math.max(1, Math.round((el as TextEl).text.length / 2) / 10)) : (el.entrance?.duration ?? 0.6);
    el.entrance = type ? { type: type as EntranceType, delay: el.entrance?.delay ?? 0, duration } : undefined;
  }

  // svelte-ignore state_referenced_locally
  let applyScope = $state(stylescope ?? (stylecategory ? 'cat-q' : 'round-q'));
</script>

<!-- A file that plays from its link: say so, and offer to save a copy. -->
{#snippet liveNote()}
  {#if liveRef}
    <p class="hint">
      🌐 Plays from {linkHost(liveRef.url)} during the show (needs internet).
      {#if liveRef.expiresAt}The link {liveRef.expiresAt < Date.now() ? 'expired' : 'expires'} {formatWhen(liveRef.expiresAt)}.{/if}
    </p>
    <SaveCopyButton id={liveRef.id} />
  {/if}
{/snippet}

<!-- A video or sound this browser won't play (or plays without its sound), as worked out in the editor: why, and 🔄. -->
{#snippet playsNote(id: string)}
  {@const v = app.screen === 'editor' && !app.editGame && !liveRef ? verdictOf(id) : undefined}
  {#if typeof v === 'object' && (v.is === 'fails' || v.is === 'silent')}
    <p class="warn small" data-plays-note>
      ⚠ {v.is === 'fails' ? `This browser can’t play this file (${shortWhy(v)}).` : `It plays without its sound here (${shortWhy(v)}).`}
      {#if v.fix}
        <button
          class="small"
          onclick={() => convertNow(game, id)}
          disabled={!!jobFor(id)}
          title="Put a copy that plays here in its place, everywhere it's used (Ctrl+Z puts the old one back)">{jobFor(id) ? '🔄 Converting…' : '🔄 Convert…'}</button
        >
      {/if}
    </p>
  {/if}
{/snippet}

<div class="insp">
  <!-- RPG screens: what the item is comes first (the rest is how it looks). -->
  {#if objectsection}{@render objectsection(el)}{/if}

  {#if el.kind === 'text'}
    <section>
      <h4>Text box</h4>
      <label class="field">
        Text
        <textarea bind:this={textArea} bind:value={el.text} rows="4" placeholder="Type here…" dir="auto"></textarea>
      </label>
      <label class="field">
        Font
        <div class="row">
          <select bind:value={el.font} style:font-family={el.font} aria-label="Font">
            {#each fonts as f}<option value={f.css} style:font-family={f.css}>{f.label}</option>{/each}
            {#if !fonts.some((f) => f.css === el.font)}<option value={el.font}>{el.font.split(',')[0]}</option>{/if}
          </select>
          <button class="small" onclick={(e) => onuploadfont(e.currentTarget)} aria-label="Upload a font file" title="Upload a .ttf/.otf/.woff font">＋</button>
        </div>
      </label>
      <div class="grid2">
        <label class="field">
          <span>{el.autoFit ? 'Max size' : 'Size'}{#if el.autoFit && fit && fit.size < el.size}<span class="fitted">{' '}· showing {fit.size}</span>{/if}</span>
          <NumField min={8} max={600} bind:value={el.size} fallback={110} />
        </label>
        <!-- (↺ outside the label: a click on it, gone as it's done, would open the colour picker.) -->
        <div class="color">
          <label class="field">Color<ColorBox value={themedText ? themeText : el.color} oninput={(e) => setTextColor(el as TextEl, e.currentTarget.value)} aria-label="Text color" /></label>
          {#if ownOnTile}
            <button class="small" onclick={() => ((el as TextEl).color = '#ffffff')} title="Back to the theme's text color (it follows the theme when that changes)">↺ Theme color</button>
          {/if}
        </div>
      </div>
      {#if fit?.overflow && el.text}
        <p class="warn">
          ⚠ The text doesn't fit{el.autoFit ? ', even at the smallest size' : ''}. Make the box bigger or the text shorter{el.autoFit ? '' : ', or tick Shrink to fit'}.
        </p>
      {/if}
      <!-- Three groups (style, alignment, height in the box): one that doesn't fit goes to the next line whole. -->
      <div class="row toggles">
        <span class="grp">
          <button class:on={el.weight >= 700} aria-pressed={el.weight >= 700} onclick={() => (el.weight = el.weight >= 700 ? 400 : 700)} aria-label="Bold" title="Bold (Ctrl+B)"><b>B</b></button>
          <button class:on={el.italic} aria-pressed={el.italic} onclick={() => (el.italic = !el.italic)} aria-label="Italic" title="Italic (Ctrl+I)"><i>I</i></button>
          <button class:on={el.underline} aria-pressed={el.underline} onclick={() => (el.underline = !el.underline)} aria-label="Underline" title="Underline (Ctrl+U)"><u>U</u></button>
          <button class:on={el.uppercase} aria-pressed={el.uppercase} onclick={() => (el.uppercase = !el.uppercase)} aria-label="All caps" title="ALL CAPS">AA</button>
        </span>
        <span class="grp">
          {#each ['left', 'center', 'right'] as const as a}
            <button class:on={el.align === a} aria-pressed={el.align === a} onclick={() => (el.align = a)} aria-label={ALIGN[a][1]} title={ALIGN[a][1]}>{ALIGN[a][0]}</button>
          {/each}
        </span>
        <span class="grp">
          {#each ['top', 'middle', 'bottom'] as const as v}
            <button class:on={el.vAlign === v} aria-pressed={el.vAlign === v} onclick={() => (el.vAlign = v)} aria-label={VALIGN[v][1]} title={VALIGN[v][1]}>{VALIGN[v][0]}</button>
          {/each}
        </span>
      </div>
      <label class="check"><input type="checkbox" bind:checked={el.autoFit} /> Shrink text to fit the box</label>
      <div class="grid2">
        <label class="field">Line height<NumField step={0.05} min={0.6} max={3} bind:value={el.lineHeight} fallback={1.2} /></label>
        <label class="field">Letter spacing<NumField min={-20} max={60} bind:value={el.letterSpacing} /></label>
      </div>
    </section>

    <section>
      <h4>Effects</h4>
      <label class="check">
        <input type="checkbox" checked={!!el.stroke} onchange={(e) => (el.stroke = e.currentTarget.checked ? { color: '#000000', width: 6 } : undefined)} /> Outline
      </label>
      {#if el.stroke}
        <div class="grid2 sub">
          <label class="field">Color<ColorBox bind:value={el.stroke.color} aria-label="Outline color" /></label>
          <label class="field">Width<NumField min={0} max={60} bind:value={el.stroke.width} fallback={6} /></label>
        </div>
      {/if}
      <label class="check">
        <input type="checkbox" checked={!!el.shadow} onchange={(e) => (el.shadow = e.currentTarget.checked ? { color: '#000000', x: 6, y: 6, blur: 0 } : undefined)} /> Drop shadow
      </label>
      {#if el.shadow}
        <div class="grid4 sub">
          <label class="field">Color<ColorBox bind:value={el.shadow.color} aria-label="Shadow color" /></label>
          <label class="field">X<NumField bind:value={el.shadow.x} /></label>
          <label class="field">Y<NumField bind:value={el.shadow.y} /></label>
          <label class="field">Blur<NumField min={0} bind:value={el.shadow.blur} /></label>
        </div>
      {/if}
      <label class="check">
        <input type="checkbox" checked={!!el.glow} onchange={(e) => (el.glow = e.currentTarget.checked ? { color: '#39ff14', blur: 20 } : undefined)} /> Glow
      </label>
      {#if el.glow}
        <div class="grid2 sub">
          <label class="field">Color<ColorBox bind:value={el.glow.color} aria-label="Glow color" /></label>
          <label class="field">Size<NumField min={0} max={200} bind:value={el.glow.blur} fallback={20} /></label>
        </div>
      {/if}
      <label class="check">
        <input
          type="checkbox"
          checked={!!el.background}
          onchange={(e) => (el.background = e.currentTarget.checked ? { color: '#000000', padding: 24, radius: 16 } : undefined)}
        /> Background box
      </label>
      {#if el.background}
        <div class="grid3 sub">
          <label class="field">Color<ColorBox bind:value={el.background.color} aria-label="Background box color" /></label>
          <label class="field">Padding<NumField min={0} bind:value={el.background.padding} fallback={24} /></label>
          <label class="field">Corners<NumField min={0} bind:value={el.background.radius} fallback={16} /></label>
        </div>
      {/if}
    </section>

    {#if onapplystyle}
      <section>
        <h4>Use this style elsewhere</h4>
        <div class="row">
          <select bind:value={applyScope} aria-label="Which slides get this style">
            {#if stylecategory}
              <option value="cat-q">Questions in this category</option>
              <option value="cat-a">Answers in this category</option>
              <option value="cat-qa">Questions + answers in this category</option>
            {/if}
            {#if styleslides}
              <option value="round-q">The other slides in this round</option>
            {:else}
              <option value="round-q">Questions in this round</option>
              <option value="round-a">Answers in this round</option>
              <option value="round-qa">Questions + answers in this round</option>
            {/if}
            <option value="game-q">Questions in the whole game</option>
            <option value="game-a">Answers in the whole game</option>
            <option value="game-qa">Everything in the whole game</option>
          </select>
          <button class="small" onclick={() => onapplystyle(el as TextEl, applyScope)}>Apply</button>
        </div>
        <p class="hint">Copies font, size, colors and effects to the main text of those slides (the words stay the same).</p>
      </section>
    {/if}
  {:else if el.kind === 'image'}
    <section>
      <h4>Image</h4>
      <label class="field">
        Fit
        <select bind:value={el.fit}>
          <option value="contain">Fit inside box</option>
          <option value="cover">Fill box (crop edges)</option>
          <option value="fill">Stretch</option>
        </select>
      </label>
      <label class="field">Rounded corners<NumField min={0} bind:value={() => el.radius ?? 0, (v) => (el.radius = v)} /></label>
      <!-- (✎ Edit image… is the bar's at the top of the panel.) -->
      <div class="row">
        <button onclick={(e) => onreplace(e.currentTarget)} data-replace title="Only this item: the same file elsewhere stays as it is">🔁 Use another picture…</button>
      </div>
      {@render liveNote()}
    </section>
  {:else if el.kind === 'shape'}
    <section>
      <h4>{el.hotspot ? 'Hotspot' : el.shape === 'path' ? (el.closed ? 'Freehand shape' : 'Freehand line') : 'Shape'}</h4>
      {#if el.hotspot}
        <p class="hint">Invisible to viewers (you see its outline). Give it a class below to make this part of the picture a doorway, a shop, a trap…</p>
      {:else if el.shape === 'path'}
        <label class="check"><input type="checkbox" bind:checked={el.closed} /> Closed (a filled shape)</label>
      {:else}
        <label class="field">
          Type
          <select bind:value={el.shape}>
            <option value="rect">Rectangle</option>
            <option value="ellipse">Ellipse</option>
            <option value="line">Line</option>
            <option value="arrow">Arrow</option>
          </select>
        </label>
      {/if}
      {#if !el.hotspot && (el.shape === 'rect' || el.shape === 'ellipse' || (el.shape === 'path' && el.closed))}
        <div class="grid2">
          <label class="field">
            Fill
            <div class="row">
              <!-- (data-opens: where a double-click or Enter on the item puts the keys.) -->
              <ColorBox value={el.fill === 'transparent' ? '#000000' : el.fill} oninput={(e) => (el.fill = e.currentTarget.value)} aria-label="Fill color" data-opens />
              <label class="check small"><input type="checkbox" checked={el.fill === 'transparent'} onchange={(e) => (el.fill = e.currentTarget.checked ? 'transparent' : '#ffcc00')} />none</label>
            </div>
          </label>
          {#if el.shape === 'rect'}<label class="field">Corners<NumField min={0} bind:value={el.radius} /></label>{/if}
        </div>
      {/if}
      {#if !el.hotspot}
        {@const line = el.shape === 'line' || el.shape === 'arrow' || el.shape === 'path'}
        <div class="grid2">
          <label class="field">{line ? 'Color' : 'Border'}<ColorBox bind:value={el.stroke} aria-label={line ? 'Line color' : 'Border color'} data-opens={line || undefined} /></label>
          <label class="field">Thickness<NumField min={0} max={100} bind:value={el.strokeWidth} /></label>
        </div>
      {/if}
    </section>
  {:else if el.kind === 'video' || el.kind === 'audio' || el.kind === 'embed'}
    <section>
      <h4>
        {el.kind === 'video' ? 'Video' : el.kind === 'audio' ? 'Sound' : el.embedKind === 'remoteImage' || el.embedKind === 'remoteVideo' || el.embedKind === 'remoteAudio' ? 'Online media' : embedName(el.embedKind, el.url)}
      </h4>
      {#if el.kind === 'embed'}
        <label class="field">Link<input bind:value={el.url} data-opens /></label>
        {#if sitePlayer}
          <p class="hint">
            🌐 Needs internet during the game. It plays in the audience window (or on the stage in single-window mode): click ▶
            inside it there. The host can restart or stop it and open it in its own window, but can't pause, seek or mute it.
          </p>
          {#if el.embedKind === 'drive'}<p class="hint">{DRIVE_SHARE_HINT}</p>{/if}
          <p class="hint">Try it here with ▶ Preview (sound on).</p>
        {:else}
          <p class="hint">🌐 Needs internet during the game. The host can always open the link in its own window if it won't play.</p>
        {/if}
        <!-- (Test link ↗ is the bar's at the top of the panel.) -->
        {#if el.embedKind === 'remoteImage'}
          <!-- An online picture fits and rounds like a picture of the game's own. -->
          <label class="field">
            Fit
            <select value={el.fit ?? 'contain'} onchange={(e) => (el.fit = e.currentTarget.value as Fit)}>
              <option value="contain">Fit inside box</option>
              <option value="cover">Fill box (crop edges)</option>
              <option value="fill">Stretch</option>
            </select>
          </label>
          <label class="field">Rounded corners<NumField min={0} bind:value={() => el.radius ?? 0, (v) => (el.radius = v)} /></label>
        {/if}
      {:else}
        {#if el.kind === 'video'}
          <label class="field">
            Fit
            <select bind:value={el.fit}>
              <option value="contain">Fit inside box</option>
              <option value="cover">Fill box (crop edges)</option>
              <option value="fill">Stretch</option>
            </select>
          </label>
        {/if}
        <!-- (✎ Edit video… / sound… is the bar's at the top of the panel.) -->
        <div class="row">
          <button class="small" onclick={(e) => onreplace(e.currentTarget)} data-replace title="Only this item: the same file elsewhere stays as it is"
            >🔁 Use another {el.kind === 'video' ? 'video' : 'sound'}…</button
          >
        </div>
        {#if el.kind === 'audio'}<label class="check"><input type="checkbox" bind:checked={el.visible} /> Show a speaker icon on the slide</label>{/if}
        {@render liveNote()}
        {@render playsNote(el.media)}
      {/if}
      {#if !sitePlayer && (el.kind !== 'embed' || el.embedKind !== 'remoteImage')}
        <!-- The part it plays, in clock time (83, 1:23 or 1:23.5; empty: from the start, to the end). -->
        <div class="plays" role="group" aria-label="The part it plays">
          <span>Plays from</span>
          <!-- (data-opens: where a double-click or Enter on a video or sound puts the keys; a link's is its Link box.) -->
          <input
            class="clock"
            value={playsText(el.startAt)}
            placeholder="0:00.0"
            onchange={(e) => setPlays(e, 'startAt')}
            onkeydown={(e) => stepPlays(e, 'startAt')}
            aria-label="Plays from"
            title="Seconds (83) or minutes and seconds (1:23, 1:23.5); empty: from the start. ↑ ↓ 0.1 s, Shift: 1 s"
            data-opens={el.kind !== 'embed' || undefined}
          />
          <span>to</span>
          <input
            class="clock"
            value={playsText(el.endAt)}
            placeholder="the end"
            onchange={(e) => setPlays(e, 'endAt')}
            onkeydown={(e) => stepPlays(e, 'endAt')}
            aria-label="Plays to"
            title="Seconds (83) or minutes and seconds (1:23, 1:23.5); empty: to the end. ↑ ↓ 0.1 s, Shift: 1 s"
          />
          {#if tryUrl}
            <button class="small" class:on={trying === el.id} aria-pressed={trying === el.id} onclick={() => (trying === el.id ? stopTry() : (trying = el.id))} title="Play that part here (pressed again, it stops)"
              >{trying === el.id ? '■ Stop' : '▶ Try it'}</button
            >
          {/if}
        </div>
        {#if trying === el.id && tryUrl}
          {#if tryPicture}
            <!-- svelte-ignore a11y_media_has_caption -->
            <video class="try" bind:this={tryEl} src={tryUrl} playsinline onloadedmetadata={tryFrom} onended={stopTry} aria-label="The part it plays"></video>
          {:else}
            <audio bind:this={tryEl} src={tryUrl} onloadedmetadata={tryFrom} onended={stopTry}></audio>
          {/if}
        {/if}
        {#if el.endAt !== undefined && el.endAt <= (el.startAt ?? 0)}
          <p class="warn small" role="status">“to” isn't after “from”, so it's left out: the clip plays to its end.</p>
        {/if}
        {#if el.kind !== 'embed'}
          <p class="hint">
            {#if cuts}Only this item. To cut the file itself (smaller, everywhere): <b>{el.kind === 'video' ? '✎ Edit video…' : '✎ Edit sound…'}</b> at the
              top.{:else}Only this item: the file itself stays whole.{/if}
          </p>
        {/if}
        <h5>When it plays</h5>
        <label class="check"><input type="checkbox" bind:checked={el.autoplay} /> Autoplay when the slide appears</label>
        <label class="check"><input type="checkbox" bind:checked={el.loop} /> Loop</label>
        <label class="check"><input type="checkbox" bind:checked={el.muted} /> Start muted</label>
        <label class="field">Volume {Math.round(el.volume * 100)}%<input type="range" min="0" max="1" step="0.05" bind:value={el.volume} /></label>
      {/if}
    </section>
  {/if}

  <section>
    <h4>Entrance animation</h4>
    <select value={el.entrance?.type ?? ''} onchange={(e) => setEntrance(e.currentTarget.value)} aria-label="Entrance animation">
      {#each ENTRANCES as [v, l]}<option value={v}>{l}</option>{/each}
    </select>
    {#if el.entrance}
      <div class="grid2">
        <label class="field">Delay (s)<NumField min={0} step={0.1} bind:value={el.entrance.delay} /></label>
        <label class="field">Duration (s)<NumField min={0.1} step={0.1} bind:value={el.entrance.duration} fallback={0.6} /></label>
      </div>
    {/if}
  </section>

  <section>
    <h4>Position</h4>
    <div class="grid4">
      <label class="field">X<NumField bind:value={el.x} /></label>
      <label class="field">Y<NumField bind:value={el.y} /></label>
      <label class="field">W<NumField min={1} bind:value={el.w} fallback={100} /></label>
      <label class="field">H<NumField min={1} bind:value={el.h} fallback={100} /></label>
    </div>
    {@render aligns?.()}
    <div class="grid2">
      <label class="field">Rotation°<NumField min={-180} max={180} bind:value={el.rotation} /></label>
      <label class="field">Opacity {Math.round(el.opacity * 100)}%<input type="range" min="0" max="1" step="0.05" bind:value={el.opacity} /></label>
    </div>
    <!-- (🔒 Lock, ⧉ Duplicate and 🗑 Delete are the bar's at the top of the panel.) -->
    <div class="row">
      <button class="small" onclick={() => onorder('front')} title="Bring to front">⤒ Front</button>
      <button class="small" onclick={() => onorder('up')} aria-label="Bring forward" title="Bring forward">↑</button>
      <button class="small" onclick={() => onorder('down')} aria-label="Send backward" title="Send backward">↓</button>
      <button class="small" onclick={() => onorder('back')} title="Send to back">⤓ Back</button>
    </div>
  </section>
</div>

<style>
  .insp {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  h4 {
    margin: 0;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
  }
  textarea {
    resize: vertical;
  }
  select {
    min-width: 0;
    flex: 1;
  }
  .grid2,
  .grid3,
  .grid4 {
    display: grid;
    gap: 6px;
  }
  .grid2 {
    grid-template-columns: 1fr 1fr;
  }
  .grid3 {
    grid-template-columns: 1fr 1fr 1fr;
  }
  .grid4 {
    grid-template-columns: repeat(4, 1fr);
  }
  .sub {
    padding-left: 24px;
  }
  .color {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 6px;
  }
  .toggles button {
    padding: 4px 8px;
    min-width: 30px;
  }
  /* (The space between groups is as wide as the spacers it had.) */
  .toggles {
    column-gap: 22px;
  }
  .grp {
    display: inline-flex;
    gap: 8px;
    flex-wrap: nowrap;
  }
  .hint {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
  }
  h5 {
    margin: 4px 0 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
  }
  /* Plays from [0:00.0] to [the end] ▶ Try it, on one line. */
  .plays {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    font-size: 13px;
  }
  .plays .clock {
    width: 72px;
    min-width: 0;
  }
  .try {
    width: 100%;
    max-height: 160px;
    background: #000;
    border-radius: 4px;
  }
  .fitted {
    color: var(--accent);
  }
  .warn {
    margin: 0;
    font-size: 12px;
    color: var(--warn);
  }
</style>
