<!-- One wheel's disc and pointer, turned to where its spin is at `now`. -->
<script lang="ts">
  import type { WheelSegment } from '../../lib/model';
  import { easeOut, initials, segmentAngles, uniqueLabels } from '../../lib/tools';
  import { textOn } from '../../lib/colors';

  let {
    segments,
    rotation,
    spin,
    now,
    players = false,
  }: {
    segments: WheelSegment[];
    /** The Pick a player wheel: a name too long to read at a decent size shows as initials. */
    players?: boolean;
    rotation: number;
    spin: { from: number; to: number; startedAt: number; duration: number } | null;
    now: number;
  } = $props();

  const R = 440;
  const angles = $derived(segmentAngles(segments));
  const rot = $derived.by(() => {
    if (!spin) return rotation;
    const t = Math.max(0, (now - spin.startedAt) / spin.duration);
    return spin.from + (spin.to - spin.from) * easeOut(t);
  });

  function pt(deg: number, r = R): [number, number] {
    const a = ((deg - 90) * Math.PI) / 180;
    return [r * Math.cos(a), r * Math.sin(a)];
  }
  function path(start: number, end: number): string {
    if (end - start >= 359.99) return `M 0 ${-R} A ${R} ${R} 0 1 1 0 ${R} A ${R} ${R} 0 1 1 0 ${-R} Z`;
    const [x1, y1] = pt(start);
    const [x2, y2] = pt(end);
    return `M 0 0 L ${x1} ${y1} A ${R} ${R} 0 ${end - start > 180 ? 1 : 0} 1 ${x2} ${y2} Z`;
  }
  /** A label runs along its slice's middle, from just past the hub to just inside the rim. */
  const HUB = 76;
  const RIM = R * 0.93;
  const LEN = RIM - HUB;
  const MID = (HUB + RIM) / 2;
  /** Roughly how wide the bold board font is, per character, for its size. */
  const CHAR = 0.6;
  const shown = (label: string) => (label.length > 30 ? label.slice(0, 29) + '…' : label);
  /** Smallest label that reads once the stream is scaled down (480p): a player's name gives way to initials below it. */
  const READABLE = 28;
  function labelFor(label: string, span: number): string {
    const full = shown(label);
    return players && fontFor(span, full) < READABLE ? initials(label) : full;
  }
  /** Each slice's label; players' initials that would read the same get a number ("BT", "BT 2"). */
  const labels = $derived.by(() => {
    const l = segments.map((s, i) => labelFor(s.label, angles[i].end - angles[i].start));
    return players ? uniqueLabels(l) : l;
  });
  /** As big as the slice's width allows, and small enough for the label to fit between the hub and the rim. */
  const fontFor = (span: number, label: string) => Math.max(14, Math.min(56, span * 1.6, LEN / (CHAR * Math.max(4, label.length))));
  /** On the left half (where it is right now), a label is turned the other way round so it never reads upside down. */
  const flipped = (mid: number) => ((((mid + rot) % 360) + 360) % 360) > 180;
</script>

<svg viewBox="-470 -500 940 1000" class="wheel">
  <g transform="rotate({rot})">
    {#each segments as s, i (s.id)}
      {@const a = angles[i]}
      {@const mid = (a.start + a.end) / 2}
      <path d={path(a.start, a.end)} fill={s.color} stroke="#000" stroke-width="3" data-slice={i} />
      {@const label = labels[i]}
      {@const size = fontFor(a.end - a.start, label)}
      <g transform="rotate({mid})" data-slice={i}>
        <!-- Squeezed to fit when the font's guess runs long: it never crosses the rim or the hub. -->
        <text
          x="0"
          y={-MID}
          fill={textOn(s.color)}
          font-size={size}
          text-anchor="middle"
          dominant-baseline="middle"
          textLength={CHAR * size * label.length > LEN * 0.92 ? LEN : undefined}
          lengthAdjust="spacingAndGlyphs"
          transform="rotate({flipped(mid) ? 90 : -90} 0 {-MID})"
        >{label}</text>
      </g>
    {/each}
    <circle class="rim" r="60" fill="#111" stroke-width="8" />
  </g>
  <circle class="rim" r={R} fill="none" stroke-width="10" />
  <polygon points="-34,-488 34,-488 0,-410" fill="#fff" stroke="#000" stroke-width="5" />
</svg>

<style>
  .wheel {
    width: 100%;
    height: 100%;
    font-family: var(--board-font);
    font-weight: 800;
    filter: drop-shadow(0 20px 40px rgba(0, 0, 0, 0.6));
  }
  .rim {
    stroke: var(--value);
  }
</style>
