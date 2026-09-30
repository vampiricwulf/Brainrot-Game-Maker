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
  }: {
    game: Game;
    session: Session;
    onpicker?: (id: string) => void;
    /** What clicking a plate does (host only). */
    hint?: string;
  } = $props();
  const sym = $derived(game.settings.currencySymbol);
</script>

<div class="bar">
  {#each session.players as p (p.id)}
    {@const s = score(session, p.id)}
    <button
      class="plate"
      class:picker={session.currentPickerId === p.id}
      style:--c={p.color}
      disabled={!onpicker}
      onclick={() => onpicker?.(p.id)}
      title={onpicker ? hint : undefined}
      data-player-id={p.id}
    >
      <span class="name" style:background={p.color} style:color={textOn(p.color)}>{p.name}</span>
      <span class="score" class:neg={s < 0}>{formatPoints(s, sym)}</span>
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
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .score {
    flex: 1;
    display: grid;
    place-items: center;
    font-family: var(--value-font);
    font-size: 64px;
    font-weight: 800;
    color: #fff;
    text-shadow: 4px 4px 0 #000;
  }
  .score.neg {
    color: #ff6b6b;
  }
</style>
