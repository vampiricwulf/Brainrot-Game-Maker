<script lang="ts">
  import type { TextEl } from '../model';
  import { autofit, type FitResult } from '../autofit';

  let {
    el,
    edit = false,
    placeholder,
    onfit,
  }: {
    el: TextEl;
    /** In the slide editor: show the placeholder when empty and warn when the text doesn't fit. */
    edit?: boolean;
    placeholder?: string;
    onfit?: (r: FitResult) => void;
  } = $props();

  let fitted = $state<FitResult>({ size: 0, overflow: false });
  const ghost = $derived(edit && !el.text && !!placeholder);

  const justify = { top: 'flex-start', middle: 'center', bottom: 'flex-end' } as const;
  const shadow = $derived.by(() => {
    const parts: string[] = [];
    if (el.shadow) parts.push(`${el.shadow.x}px ${el.shadow.y}px ${el.shadow.blur}px ${el.shadow.color}`);
    if (el.glow) parts.push(`0 0 ${el.glow.blur}px ${el.glow.color}`, `0 0 ${el.glow.blur * 2}px ${el.glow.color}`);
    return parts.join(', ') || 'none';
  });
  // Everything besides the words that changes the text's layout (the words are watched directly).
  const layoutKey = $derived(
    `${el.font}|${el.w}x${el.h}|${el.lineHeight}|${el.letterSpacing}|${el.uppercase}|${el.weight}|${el.italic}|${el.stroke?.width}|${el.background?.padding}|${ghost}`,
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
  style:color={el.color}
  style:text-align={el.align}
  style:line-height={el.lineHeight}
  style:letter-spacing="{el.letterSpacing}px"
  style:text-shadow={shadow}
  style:-webkit-text-stroke={el.stroke && el.stroke.width > 0 ? `${el.stroke.width}px ${el.stroke.color}` : undefined}
  style:paint-order="stroke fill"
  style:background={el.background?.color}
  style:padding={el.background ? `${el.background.padding}px` : undefined}
  style:border-radius={el.background ? `${el.background.radius}px` : undefined}
>
  <div class="inner" class:ghost>{ghost ? placeholder : el.text}</div>
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
    background: #e5484d;
    color: #fff;
    font: 700 30px system-ui, sans-serif;
    pointer-events: none;
  }
</style>
