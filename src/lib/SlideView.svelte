<!-- Renders a Slide's elements in 1920×1080 logical coordinates (place inside a Stage). -->
<script lang="ts">
  import type { Slide, TextEl } from './model';
  import { autofit } from './autofit';

  let { slide, fallbackBg = 'var(--tile)' }: { slide: Slide; fallbackBg?: string } = $props();

  function textShadow(el: TextEl): string {
    const parts: string[] = [];
    if (el.shadow) parts.push(`${el.shadow.x}px ${el.shadow.y}px ${el.shadow.blur}px ${el.shadow.color}`);
    if (el.glow) parts.push(`0 0 ${el.glow.blur}px ${el.glow.color}`, `0 0 ${el.glow.blur * 2}px ${el.glow.color}`);
    return parts.join(', ') || 'none';
  }
  const justify = { top: 'flex-start', middle: 'center', bottom: 'flex-end' } as const;
</script>

<div class="slide" style:background={slide.background.gradient ?? slide.background.color ?? fallbackBg}>
  {#each [...slide.elements].sort((a, b) => a.zIndex - b.zIndex) as el (el.id)}
    {#if el.kind === 'text'}
      <div
        class="text"
        use:autofit={{ size: el.size, enabled: el.autoFit, text: el.text }}
        style:left="{el.x}px"
        style:top="{el.y}px"
        style:width="{el.w}px"
        style:height="{el.h}px"
        style:transform="rotate({el.rotation}deg)"
        style:opacity={el.opacity}
        style:z-index={el.zIndex}
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
        style:text-shadow={textShadow(el)}
        style:-webkit-text-stroke={el.stroke ? `${el.stroke.width}px ${el.stroke.color}` : undefined}
        style:background={el.background?.color}
        style:padding={el.background ? `${el.background.padding}px` : undefined}
        style:border-radius={el.background ? `${el.background.radius}px` : undefined}
      >
        <div class="inner">{el.text}</div>
      </div>
    {/if}
  {/each}
</div>

<style>
  .slide {
    position: absolute;
    inset: 0;
  }
  .text {
    position: absolute;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-sizing: border-box;
    white-space: pre-wrap;
    overflow-wrap: break-word;
  }
</style>
