<!-- Players' name plates + scores along the bottom of the stage (name + color only, spec §14). -->
<script lang="ts">
  import { textOn } from '../lib/colors';
  import { formatPoints, type Game, type Session } from '../lib/model';
  import { score } from '../lib/session';

  let {
    game,
    session,
    onpicker,
    hint = 'Click to make this player the current picker',
    host = false,
    lit,
    ticks = [],
  }: {
    game: Game;
    session: Session;
    onpicker?: (id: string) => void;
    /** What clicking a plate does (host only). */
    hint?: string;
    /** The host's copy: right-clicking a plate gives that player's menu. */
    host?: boolean;
    /** The player lit up instead of the picker (the Final's spotlight; null: nobody). */
    lit?: string | null;
    /** Players with a ✔ on their plate (their Final wager is in). */
    ticks?: string[];
  } = $props();
  const sym = $derived(game.settings.currencySymbol);
  const litId = $derived(lit === undefined ? session.currentPickerId : lit);
  // Few players: wider plates, so long names fit. Long names take a smaller font, then a second line, before "…".
  const wide = $derived(session.players.length <= 4);
  const nameSize = (name: string) => (name.length > 16 ? 28 : name.length > 11 ? 32 : 36);
</script>

<div class="bar">
  {#each session.players as p (p.id)}
    {@const s = score(session, p.id)}
    <button
      class="plate"
      class:picker={litId === p.id}
      class:wide
      style:--c={p.color}
      data-player-id={host ? p.id : undefined}
      disabled={!onpicker}
      onclick={() => onpicker?.(p.id)}
      title={onpicker ? hint : undefined}
    >
      <span class="name" style:background={p.color} style:color={textOn(p.color)} style:font-size="{nameSize(p.name)}px">{p.name}</span>
      <span class="score" class:neg={s < 0}>{formatPoints(s, sym)}</span>
      {#if ticks.includes(p.id)}<span class="tick" title="Wager in">✔</span>{/if}
    </button>
  {/each}
</div>

<style>
  .bar {
    position: absolute;
    inset: 0;
    display: flex;
    gap: 18px;
    padding: 18px 24px;
    justify-content: center;
    background: linear-gradient(var(--scorebar-bg, #050835), #000);
  }
  .plate {
    position: relative;
    flex: 1 1 0;
    max-width: 320px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    padding: 0;
    border: 4px solid var(--c);
    border-radius: 14px;
    overflow: hidden;
    background: var(--tile);
    cursor: pointer;
    transition: box-shadow 0.2s, transform 0.2s;
  }
  .plate.wide {
    max-width: 420px;
  }
  .plate:disabled {
    opacity: 1;
    cursor: default;
  }
  .plate.picker {
    box-shadow: 0 0 0 6px #fff, 0 0 40px 12px var(--c);
    transform: translateY(-6px);
  }
  .name {
    font-family: var(--board-font);
    font-size: 36px;
    font-weight: 800;
    padding: 6px 10px;
    line-height: 1.1;
    overflow: hidden;
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }
  .tick {
    position: absolute;
    right: 8px;
    bottom: 8px;
    display: grid;
    place-items: center;
    width: 46px;
    height: 46px;
    border-radius: 50%;
    background: #1f9d55;
    border: 3px solid #fff;
    color: #fff;
    font-size: 26px;
    font-weight: 900;
  }
  .score {
    flex: 1;
    display: grid;
    place-items: center;
    font-family: var(--value-font);
    font-size: 64px;
    font-weight: 800;
    color: var(--stage-text, #fff);
    text-shadow: 4px 4px 0 #000;
  }
  .score.neg {
    color: var(--stage-bad, #ff6b6b);
  }
</style>
