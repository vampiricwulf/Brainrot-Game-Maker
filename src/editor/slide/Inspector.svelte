<!-- Property panel for the selected slide element. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { FitResult } from '../../lib/autofit';
  import { fontChoices } from '../../lib/fonts';
  import type { EntranceType, Game, SlideElement, TextEl } from '../../lib/model';
  import { openMediaPopup } from '../../lib/mediactl.svelte';
  import { DRIVE_SHARE_HINT, embedName, embedOpenUrl, formatWhen, linkHost } from '../../lib/links';
  import SaveCopyButton from '../SaveCopyButton.svelte';

  let {
    el,
    game,
    fit,
    textArea = $bindable(),
    onorder,
    onduplicate,
    ondelete,
    onreplace,
    onapplystyle,
    stylecategory = false,
    onuploadfont,
    oneditimage,
    onedit,
    objectsection,
  }: {
    el: SlideElement;
    game: Game;
    /** A text element's size as drawn on the canvas (after shrink-to-fit). */
    fit?: FitResult;
    textArea?: HTMLTextAreaElement;
    onorder: (dir: 'front' | 'back' | 'up' | 'down') => void;
    onduplicate: () => void;
    ondelete: () => void;
    /** Replace the file: a picker drops from `from`, the button that asked. */
    onreplace: (from: HTMLElement) => void;
    /** "Use this style elsewhere" (not offered when missing). */
    onapplystyle?: (el: TextEl, scope: string) => void;
    /** Offer "this category" scopes for it. */
    stylecategory?: boolean;
    /** Upload a font: a picker drops from `from`, the ＋ button. */
    onuploadfont: (from: HTMLElement) => void;
    oneditimage?: () => void;
    /** Makes a discrete change (locking) by calling `change`, so an undo history can record it as one step. */
    onedit?: (change: () => void) => void;
    /** Extra settings for the item (RPG screens: its class, secret, host notes). */
    objectsection?: Snippet<[SlideElement]>;
  } = $props();
  const edit = (change: () => void) => (onedit ? onedit(change) : change());
  /** The selected image/video/audio file, when it plays from the internet (a live link). */
  const liveRef = $derived('media' in el ? game.media.find((m) => m.id === el.media && m.url) : undefined);
  /** Google Drive's or Streamable's own player: no playback options apply. */
  const sitePlayer = $derived(el.kind === 'embed' && (el.embedKind === 'drive' || el.embedKind === 'streamable'));
  const lock = (on: boolean) => edit(() => (el.locked = on || undefined));

  const ALIGN = { left: ['⇤', 'Align text left'], center: ['↔', 'Center the text'], right: ['⇥', 'Align text right'] } as const;
  const VALIGN = { top: ['⤒', 'Text at the top of the box'], middle: ['↕', 'Text in the middle of the box'], bottom: ['⤓', 'Text at the bottom of the box'] } as const;

  const fonts = $derived(fontChoices(game));
  const ENTRANCES: [EntranceType | '', string][] = [
    ['', 'None'],
    ['fade', 'Fade in'],
    ['pop', 'Pop'],
    ['slide-left', 'Slide from left'],
    ['slide-right', 'Slide from right'],
    ['slide-up', 'Slide from bottom'],
    ['slide-down', 'Slide from top'],
    ['typewriter', 'Typewriter reveal'],
    ['shake', 'Shake'],
    ['spin', 'Spin in'],
  ];

  function setEntrance(type: string): void {
    el.entrance = type ? { type: type as EntranceType, delay: el.entrance?.delay ?? 0, duration: el.entrance?.duration ?? 0.6 } : undefined;
  }

  // svelte-ignore state_referenced_locally
  let applyScope = $state(stylecategory ? 'cat-q' : 'round-q');
  const num = (v: string, fallback = 0) => (v === '' || isNaN(+v) ? fallback : +v);
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

<div class="insp">
  <!-- RPG screens: what the item is comes first (the rest is how it looks). -->
  {#if objectsection}{@render objectsection(el)}{/if}

  {#if el.kind === 'text'}
    <section>
      <h4>Text box</h4>
      <label class="field">
        Text
        <textarea bind:this={textArea} bind:value={el.text} rows="4" placeholder="Type here…"></textarea>
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
          <span>{el.autoFit ? 'Max size' : 'Size'}{#if el.autoFit && fit && fit.size < el.size}<span class="fitted"> · showing {fit.size}</span>{/if}</span>
          <input type="number" min="8" max="600" bind:value={el.size} />
        </label>
        <label class="field">Color<input type="color" bind:value={el.color} /></label>
      </div>
      {#if fit?.overflow && el.text}
        <p class="warn">
          ⚠ The text doesn't fit{el.autoFit ? ', even at the smallest size' : ''}. Make the box bigger or the text shorter{el.autoFit ? '' : ', or tick Shrink to fit'}.
        </p>
      {/if}
      <div class="row toggles">
        <button class:on={el.weight >= 700} aria-pressed={el.weight >= 700} onclick={() => (el.weight = el.weight >= 700 ? 400 : 700)} aria-label="Bold" title="Bold (Ctrl+B)"><b>B</b></button>
        <button class:on={el.italic} aria-pressed={el.italic} onclick={() => (el.italic = !el.italic)} aria-label="Italic" title="Italic (Ctrl+I)"><i>I</i></button>
        <button class:on={el.underline} aria-pressed={el.underline} onclick={() => (el.underline = !el.underline)} aria-label="Underline" title="Underline (Ctrl+U)"><u>U</u></button>
        <button class:on={el.uppercase} aria-pressed={el.uppercase} onclick={() => (el.uppercase = !el.uppercase)} aria-label="All caps" title="ALL CAPS">AA</button>
        <span class="sep"></span>
        {#each ['left', 'center', 'right'] as const as a}
          <button class:on={el.align === a} aria-pressed={el.align === a} onclick={() => (el.align = a)} aria-label={ALIGN[a][1]} title={ALIGN[a][1]}>{ALIGN[a][0]}</button>
        {/each}
        <span class="sep"></span>
        {#each ['top', 'middle', 'bottom'] as const as v}
          <button class:on={el.vAlign === v} aria-pressed={el.vAlign === v} onclick={() => (el.vAlign = v)} aria-label={VALIGN[v][1]} title={VALIGN[v][1]}>{VALIGN[v][0]}</button>
        {/each}
      </div>
      <label class="check"><input type="checkbox" bind:checked={el.autoFit} /> Shrink text to fit the box</label>
      <div class="grid2">
        <label class="field">Line height<input type="number" step="0.05" min="0.6" max="3" bind:value={el.lineHeight} /></label>
        <label class="field">Letter spacing<input type="number" min="-20" max="60" bind:value={el.letterSpacing} /></label>
      </div>
    </section>

    <section>
      <h4>Effects</h4>
      <label class="check">
        <input type="checkbox" checked={!!el.stroke} onchange={(e) => (el.stroke = e.currentTarget.checked ? { color: '#000000', width: 6 } : undefined)} /> Outline
      </label>
      {#if el.stroke}
        <div class="grid2 sub">
          <label class="field">Color<input type="color" bind:value={el.stroke.color} /></label>
          <label class="field">Width<input type="number" min="0" max="60" bind:value={el.stroke.width} /></label>
        </div>
      {/if}
      <label class="check">
        <input type="checkbox" checked={!!el.shadow} onchange={(e) => (el.shadow = e.currentTarget.checked ? { color: '#000000', x: 6, y: 6, blur: 0 } : undefined)} /> Drop shadow
      </label>
      {#if el.shadow}
        <div class="grid4 sub">
          <label class="field">Color<input type="color" bind:value={el.shadow.color} /></label>
          <label class="field">X<input type="number" bind:value={el.shadow.x} /></label>
          <label class="field">Y<input type="number" bind:value={el.shadow.y} /></label>
          <label class="field">Blur<input type="number" min="0" bind:value={el.shadow.blur} /></label>
        </div>
      {/if}
      <label class="check">
        <input type="checkbox" checked={!!el.glow} onchange={(e) => (el.glow = e.currentTarget.checked ? { color: '#39ff14', blur: 20 } : undefined)} /> Glow
      </label>
      {#if el.glow}
        <div class="grid2 sub">
          <label class="field">Color<input type="color" bind:value={el.glow.color} /></label>
          <label class="field">Size<input type="number" min="0" max="200" bind:value={el.glow.blur} /></label>
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
          <label class="field">Color<input type="color" bind:value={el.background.color} /></label>
          <label class="field">Padding<input type="number" min="0" bind:value={el.background.padding} /></label>
          <label class="field">Corners<input type="number" min="0" bind:value={el.background.radius} /></label>
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
            <option value="round-q">Questions in this round</option>
            <option value="round-a">Answers in this round</option>
            <option value="round-qa">Questions + answers in this round</option>
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
      <label class="field">Rounded corners<input type="number" min="0" value={el.radius ?? 0} oninput={(e) => (el.radius = num(e.currentTarget.value))} /></label>
      <div class="row">
        {#if oneditimage}<button onclick={oneditimage}>🎨 Edit image…</button>{/if}
        <button onclick={(e) => onreplace(e.currentTarget)}>Replace…</button>
      </div>
      {@render liveNote()}
    </section>
  {:else if el.kind === 'shape'}
    <section>
      <h4>{el.hotspot ? 'Hotspot' : el.shape === 'path' ? 'Drawing' : 'Shape'}</h4>
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
              <input type="color" value={el.fill === 'transparent' ? '#000000' : el.fill} oninput={(e) => (el.fill = e.currentTarget.value)} />
              <label class="check small"><input type="checkbox" checked={el.fill === 'transparent'} onchange={(e) => (el.fill = e.currentTarget.checked ? 'transparent' : '#ffcc00')} />none</label>
            </div>
          </label>
          {#if el.shape === 'rect'}<label class="field">Corners<input type="number" min="0" bind:value={el.radius} /></label>{/if}
        </div>
      {/if}
      {#if !el.hotspot}
        <div class="grid2">
          <label class="field">{el.shape === 'line' || el.shape === 'arrow' || el.shape === 'path' ? 'Color' : 'Border'}<input type="color" bind:value={el.stroke} /></label>
          <label class="field">Thickness<input type="number" min="0" max="100" bind:value={el.strokeWidth} /></label>
        </div>
      {/if}
    </section>
  {:else if el.kind === 'video' || el.kind === 'audio' || el.kind === 'embed'}
    <section>
      <h4>
        {el.kind === 'video' ? 'Video' : el.kind === 'audio' ? 'Audio' : el.embedKind === 'remoteImage' || el.embedKind === 'remoteVideo' || el.embedKind === 'remoteAudio' ? 'Online media' : embedName(el.embedKind, el.url)}
      </h4>
      {#if el.kind === 'embed'}
        <label class="field">Link<input bind:value={el.url} /></label>
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
        <button class="small" onclick={() => openMediaPopup(embedOpenUrl(el.embedKind, el.url, el.startAt))}>Test link ↗</button>
      {:else}
        <button class="small" onclick={(e) => onreplace(e.currentTarget)}>Replace file…</button>
        {@render liveNote()}
      {/if}
      {#if !sitePlayer && (el.kind !== 'embed' || el.embedKind !== 'remoteImage')}
        <label class="check"><input type="checkbox" bind:checked={el.autoplay} /> Autoplay when the slide appears</label>
        <label class="check"><input type="checkbox" bind:checked={el.loop} /> Loop</label>
        <label class="check"><input type="checkbox" bind:checked={el.muted} /> Start muted</label>
        {#if el.kind === 'audio'}<label class="check"><input type="checkbox" bind:checked={el.visible} /> Show a speaker icon on the slide</label>{/if}
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
        <div class="grid2">
          <label class="field">Start at (s)<input type="number" min="0" step="0.1" value={el.startAt ?? ''} oninput={(e) => (el.startAt = e.currentTarget.value === '' ? undefined : +e.currentTarget.value)} /></label>
          <label class="field">Stop at (s)<input type="number" min="0" step="0.1" value={el.endAt ?? ''} oninput={(e) => (el.endAt = e.currentTarget.value === '' ? undefined : +e.currentTarget.value)} /></label>
        </div>
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
        <label class="field">Delay (s)<input type="number" min="0" step="0.1" bind:value={el.entrance.delay} /></label>
        <label class="field">Duration (s)<input type="number" min="0.1" step="0.1" bind:value={el.entrance.duration} /></label>
      </div>
    {/if}
  </section>

  <section>
    <h4>Position</h4>
    <div class="grid4">
      <label class="field">X<input type="number" bind:value={el.x} /></label>
      <label class="field">Y<input type="number" bind:value={el.y} /></label>
      <label class="field">W<input type="number" min="1" bind:value={el.w} /></label>
      <label class="field">H<input type="number" min="1" bind:value={el.h} /></label>
    </div>
    <div class="grid2">
      <label class="field">Rotation°<input type="number" min="-180" max="180" bind:value={el.rotation} /></label>
      <label class="field">Opacity {Math.round(el.opacity * 100)}%<input type="range" min="0" max="1" step="0.05" bind:value={el.opacity} /></label>
    </div>
    <div class="row">
      <button class="small" onclick={() => onorder('front')} title="Bring to front">⤒ Front</button>
      <button class="small" onclick={() => onorder('up')} aria-label="Bring forward" title="Bring forward">↑</button>
      <button class="small" onclick={() => onorder('down')} aria-label="Send backward" title="Send backward">↓</button>
      <button class="small" onclick={() => onorder('back')} title="Send to back">⤓ Back</button>
    </div>
    <div class="row">
      <label class="check" title="A locked item can't be moved, resized, nudged or deleted, and clicks on the slide go through it">
        <input type="checkbox" checked={!!el.locked} onchange={(e) => lock(e.currentTarget.checked)} /> Lock
      </label>
      <span class="spacer"></span>
      <button class="small" onclick={onduplicate} title="Ctrl+D">Duplicate</button>
      {#if el.locked}
        <span class="hint">🔒 Locked — unlock to delete</span>
      {:else}
        <button class="small bad" onclick={ondelete} title="Delete (Del)">Delete</button>
      {/if}
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
    font-size: 11px;
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
  input[type='number'] {
    width: 100%;
    min-width: 0;
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
  .toggles button {
    padding: 4px 8px;
    min-width: 30px;
  }
  .toggles button.on {
    background: var(--accent-fill);
    border-color: var(--accent-fill);
    color: #fff;
  }
  .sep {
    width: 6px;
  }
  .hint {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
  }
  .fitted {
    color: var(--accent);
  }
  .warn {
    margin: 0;
    font-size: 12px;
    color: var(--warn);
  }
  .small {
    font-size: 12px;
  }
</style>
