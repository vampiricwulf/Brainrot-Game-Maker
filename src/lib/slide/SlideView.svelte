<!--
  Renders a Slide in 1920×1080 logical coordinates (place inside a Stage).
  mode 'edit': static, no autoplay (the slide editor draws its own interaction layer on top).
  mode 'play': entrance animations run and media registers with the host's playback controls.
-->
<script lang="ts">
  import type { FitResult } from '../autofit';
  import { mediaUrls } from '../media.svelte';
  import type { MediaRole } from '../mediactl.svelte';
  import type { Slide, SlideElement } from '../model';
  import TextBox from './TextBox.svelte';
  import ShapeView from './ShapeView.svelte';
  import MediaPlayer from './MediaPlayer.svelte';
  import YouTubeEmbed from './YouTubeEmbed.svelte';

  let {
    slide,
    mode = 'play',
    role = 'single',
    fallbackBg = 'var(--tile)',
    placeholder,
    onfit,
  }: {
    slide: Slide;
    mode?: 'edit' | 'play';
    role?: MediaRole;
    fallbackBg?: string;
    /** Edit mode: shown in the slide's main text box while it's empty ("Click to type the question"). */
    placeholder?: string;
    /** Edit mode: told each text element's fitted font size. */
    onfit?: (id: string, r: FitResult) => void;
  } = $props();

  const sorted = $derived([...slide.elements].sort((a, b) => a.zIndex - b.zIndex));
  const mainText = $derived(slide.elements.find((e) => e.kind === 'text')?.id);
  const bgImage = $derived(slide.background.image ? mediaUrls[slide.background.image] : undefined);

  function label(el: SlideElement): string {
    if (el.kind === 'embed') return el.url;
    if (el.kind === 'video' || el.kind === 'audio') return `${el.kind === 'video' ? 'Video' : 'Audio'}`;
    return el.kind;
  }
</script>

<div
  class="slide"
  style:background-color={slide.background.color ?? (slide.background.gradient ? undefined : fallbackBg)}
  style:background-image={[bgImage ? `url("${bgImage}")` : '', slide.background.gradient ?? ''].filter(Boolean).join(', ') ||
    undefined}
  style:background-size={slide.background.fit ?? 'cover'}
>
  {#each sorted as el (el.id)}
    {@const anim = mode === 'play' ? el.entrance : undefined}
    <div
      class="el {anim ? `anim anim-${anim.type}` : ''}"
      style:left="{el.x}px"
      style:top="{el.y}px"
      style:width="{el.w}px"
      style:height="{el.h}px"
      style:transform="rotate({el.rotation}deg)"
      style:opacity={el.opacity}
      style:z-index={el.zIndex}
      style:animation-delay={anim ? `${anim.delay}s` : undefined}
      style:animation-duration={anim ? `${anim.duration}s` : undefined}
    >
      {#if el.kind === 'text'}
        <TextBox
          {el}
          edit={mode === 'edit'}
          placeholder={el.id === mainText ? placeholder : undefined}
          onfit={mode === 'edit' && onfit ? (r) => onfit(el.id, r) : undefined}
        />
      {:else if el.kind === 'image'}
        {@const src = mediaUrls[el.editedMedia ?? el.media] ?? mediaUrls[el.media]}
        {#if src}
          <img {src} alt="" style:object-fit={el.fit} style:border-radius="{el.radius ?? 0}px" draggable="false" />
        {:else}
          <div class="missing">Missing image</div>
        {/if}
      {:else if el.kind === 'shape'}
        <ShapeView {el} />
      {:else if el.kind === 'video' || el.kind === 'audio'}
        {@const src = mediaUrls[el.media]}
        {#if src || mode === 'edit'}
          <MediaPlayer {el} {src} {mode} {role} label={label(el)} />
        {:else}
          <div class="missing">Missing {el.kind}</div>
        {/if}
      {:else if el.kind === 'embed'}
        {#if el.embedKind === 'youtube'}
          <YouTubeEmbed {el} {mode} {role} label={label(el)} />
        {:else if el.embedKind === 'remoteImage'}
          <img src={el.url} alt="" style:object-fit="contain" draggable="false" />
        {:else}
          <MediaPlayer {el} src={el.url} {mode} {role} label={label(el)} />
        {/if}
      {/if}
    </div>
  {/each}
</div>

<style>
  .slide {
    position: absolute;
    inset: 0;
    background-position: center;
    background-repeat: no-repeat;
    overflow: hidden;
  }
  .el {
    position: absolute;
    box-sizing: border-box;
  }
  img {
    width: 100%;
    height: 100%;
    display: block;
    user-select: none;
  }
  .missing {
    width: 100%;
    height: 100%;
    display: grid;
    place-items: center;
    font-size: 36px;
    color: #fff;
    background: repeating-linear-gradient(45deg, #333, #333 20px, #444 20px, #444 40px);
  }

  /* Entrance animations (spec §5.3) */
  .anim {
    animation-fill-mode: both;
    animation-timing-function: cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .anim-fade {
    animation-name: fade;
  }
  .anim-pop {
    animation-name: pop;
    animation-timing-function: cubic-bezier(0.3, 1.6, 0.5, 1);
  }
  .anim-slide-left {
    animation-name: slide-left;
  }
  .anim-slide-right {
    animation-name: slide-right;
  }
  .anim-slide-up {
    animation-name: slide-up;
  }
  .anim-slide-down {
    animation-name: slide-down;
  }
  .anim-typewriter {
    animation-name: typewriter;
    animation-timing-function: steps(24, end);
  }
  .anim-shake {
    animation-name: shake;
    animation-timing-function: linear;
  }
  .anim-spin {
    animation-name: spin;
  }
  @keyframes fade {
    from { opacity: 0; }
  }
  @keyframes pop {
    from { scale: 0; opacity: 0; }
  }
  @keyframes slide-left {
    from { translate: -2200px 0; }
  }
  @keyframes slide-right {
    from { translate: 2200px 0; }
  }
  @keyframes slide-up {
    from { translate: 0 1300px; }
  }
  @keyframes slide-down {
    from { translate: 0 -1300px; }
  }
  @keyframes typewriter {
    from { clip-path: inset(0 100% 0 0); }
    to { clip-path: inset(0 0 0 0); }
  }
  @keyframes shake {
    0%, 100% { translate: 0 0; }
    10%, 30%, 50%, 70%, 90% { translate: -24px 0; }
    20%, 40%, 60%, 80% { translate: 24px 0; }
  }
  @keyframes spin {
    from { rotate: -360deg; scale: 0; }
  }
</style>
