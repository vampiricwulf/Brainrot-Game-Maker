<script lang="ts">
  import type { TextEl } from '../model';
  import { autofit } from '../autofit';

  let { el }: { el: TextEl } = $props();

  const justify = { top: 'flex-start', middle: 'center', bottom: 'flex-end' } as const;
  const shadow = $derived.by(() => {
    const parts: string[] = [];
    if (el.shadow) parts.push(`${el.shadow.x}px ${el.shadow.y}px ${el.shadow.blur}px ${el.shadow.color}`);
    if (el.glow) parts.push(`0 0 ${el.glow.blur}px ${el.glow.color}`, `0 0 ${el.glow.blur * 2}px ${el.glow.color}`);
    return parts.join(', ') || 'none';
  });
</script>

<div
  class="text"
  use:autofit={{ size: el.size, enabled: el.autoFit, text: `${el.text}|${el.font}|${el.w}x${el.h}|${el.lineHeight}|${el.letterSpacing}|${el.uppercase}|${el.background?.padding}` }}
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
  <div class="inner">{el.text}</div>
</div>

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
</style>
