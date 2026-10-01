<script lang="ts">
  import type { TextEl } from '../model';
  import { autofit, type FitResult } from '../autofit';
  import { textBleed, typewriterChars, typewriterTimes } from '../textfx';

  let {
    el,
    onTile = false,
    edit = false,
    placeholder,
    onfit,
    typewriter,
  }: {
    el: TextEl;
    /** Drawn straight on the tile color: plain white text follows the theme's stage text color (dark on Pastel). */
    onTile?: boolean;
    /** In the slide editor: show the placeholder when empty and warn when the text doesn't fit. */
    edit?: boolean;
    placeholder?: string;
    onfit?: (r: FitResult) => void;
    /** Play: the typewriter entrance (the letters appear one by one; all at once with reduced motion). */
    typewriter?: { delay: number; duration: number };
  } = $props();

  let fitted = $state<FitResult>({ size: 0, overflow: false });
  const ghost = $derived(edit && !el.text && !!placeholder);

  const themed = $derived(onTile && !el.background && /^#?(fff|ffffff)$/i.test(el.color.trim()));
  const color = $derived(themed ? 'var(--stage-text, #fff)' : el.color);
  const justify = { top: 'flex-start', middle: 'center', bottom: 'flex-end' } as const;
  const shadow = $derived.by(() => {
    const parts: string[] = [];
    // The plain black drop shadow under theme-colored text follows the theme too (a light one under Pastel's dark words).
    const sc = el.shadow && themed && /^#?(000|000000)$/i.test(el.shadow.color.trim()) ? 'var(--tile-shadow, #000)' : el.shadow?.color;
    if (el.shadow) parts.push(`${el.shadow.x}px ${el.shadow.y}px ${el.shadow.blur}px ${sc}`);
    if (el.glow) parts.push(`0 0 ${el.glow.blur}px ${el.glow.color}`, `0 0 ${el.glow.blur * 2}px ${el.glow.color}`);
    return parts.join(', ') || 'none';
  });
  // Room inside the box for the outline, shadow and glow, so they're never cut off at its edge.
  const bleed = $derived(textBleed(el));
  const pad = $derived((el.background ? el.background.padding || 0 : 0) + bleed);
  const chars = $derived(typewriter && !ghost ? typewriterChars(el.text) : []);
  const times = $derived(typewriter ? typewriterTimes(chars.length, typewriter.delay, typewriter.duration) : []);
  // Everything besides the words that changes the text's layout (the words are watched directly).
  const layoutKey = $derived(
    `${el.font}|${el.w}x${el.h}|${el.lineHeight}|${el.letterSpacing}|${el.uppercase}|${el.weight}|${el.italic}|${pad}|${ghost}`,
  );
</script>

<div
  class="text"
  use:autofit={{
    size: el.size,
    enabled: el.autoFit,
    text: layoutKey,
    onfit: edit
      ? (r) => {
          fitted = r;
          onfit?.(r);
        }
      : undefined,
  }}
  style:justify-content={justify[el.vAlign]}
  style:font-family={el.font}
  style:font-weight={el.weight}
  style:font-style={el.italic ? 'italic' : 'normal'}
  style:text-decoration={el.underline ? 'underline' : 'none'}
  style:text-transform={el.uppercase ? 'uppercase' : 'none'}
  style:color={color}
  style:text-align={el.align}
  style:line-height={el.lineHeight}
  style:letter-spacing="{el.letterSpacing}px"
  style:text-shadow={shadow}
  style:-webkit-text-stroke={el.stroke && el.stroke.width > 0 ? `${el.stroke.width}px ${el.stroke.color}` : undefined}
  style:paint-order="stroke fill"
  style:background={el.background?.color}
  style:padding={pad ? `${pad}px` : undefined}
  style:border-radius={el.background ? `${el.background.radius}px` : undefined}
>
  <!-- (On one line: the text keeps its spaces and line breaks, so none may sneak in around it.) -->
  <div class="inner" class:ghost dir="auto">{#if chars.length}{#each chars as c, i}<span class="tw" style:animation-delay="{times[i]}s">{c}</span>{/each}{:else}{ghost ? placeholder : el.text}{/if}</div>
</div>
{#if edit && fitted.overflow && el.text}
  <div class="nofit" title="Make the box bigger or the text shorter">⚠ Text doesn't fit</div>
{/if}

<style>
  .text {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-sizing: border-box;
    white-space: pre-wrap;
    overflow-wrap: break-word;
  }
  /* Typewriter: each letter shows at its own moment (app.css ends the wait at once when motion is reduced). */
  .tw {
    animation: tw-in 1ms linear backwards;
  }
  @keyframes tw-in {
    from {
      opacity: 0;
    }
  }
  .ghost {
    opacity: 0.45;
    font-style: italic;
    text-transform: none;
  }
  .nofit {
    position: absolute;
    right: 0;
    bottom: 0;
    padding: 6px 16px;
    border-radius: 10px;
    background: var(--bad-fill, #d13a40);
    color: #fff;
    font: 700 30px system-ui, sans-serif;
    pointer-events: none;
  }
</style>
