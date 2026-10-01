<!-- The stats strip: each player's avatar, name, score and the stats marked "On the stats strip" (bars, hearts, numbers, tags). -->
<script lang="ts">
  import { textOn } from '../../lib/colors';
  import { formatPoints, type Game, type Player, type Session } from '../../lib/model';
  import { score } from '../../lib/session';
  import { formatStat, statFields, statValue } from '../../lib/toolset';
  import Avatar from '../../lib/rpg/Avatar.svelte';
  import { dropHover } from '../dragdrop.svelte';

  let {
    game,
    session,
    players,
    showScore = true,
    host = false,
    draggable = false,
  }: {
    game: Game;
    session: Session;
    players: Player[];
    showScore?: boolean;
    /** The host's copy: right-clicking a card gives that player's menu, and a dragged item or object lights it up. */
    host?: boolean;
    /** The host's copy of an RPG round: a card can be dragged onto a party (they join it). */
    draggable?: boolean;
  } = $props();
  const fields = $derived(statFields(game).filter((f) => f.audience === 'hud'));
  // Smaller cards when there's a lot on them. Up to 6 players stay on one row (cards shrink to fit): a second row
  // would cover the bottom of the screen.
  const compact = $derived(players.length > 6 || players.length * (1 + fields.length) > 12);
  const oneRow = $derived(players.length <= 6);
  /**
   * More hearts than this (a few players: 10, more: 5) show as "♥ 7/10": a long row of hearts would push what comes
   * after it (the gold) under the next card.
   */
  const heartsUpTo = $derived(players.length <= 3 ? 10 : 5);
</script>

<div class="strip" class:compact class:one-row={oneRow} role="list">
  {#each players as p (p.id)}
    <div
      class="card"
      class:drop-on={host && dropHover.at === `player:${p.id}`}
      style:--c={p.color}
      data-player-id={host ? p.id : undefined}
      role="listitem"
      draggable={draggable ? 'true' : undefined}
      ondragstart={draggable ? (e) => e.dataTransfer?.setData('text/x-player', p.id) : undefined}
      title={draggable ? 'Right-click for their menu · drag onto a party to join it' : undefined}
    >
      <Avatar player={p} size={compact ? 64 : 92} />
      <div class="info">
        <div class="name" style:background={p.color} style:color={textOn(p.color)}>{p.name}</div>
        <div class="stats">
          {#if showScore}<span class="score">{formatPoints(score(session, p.id), game.settings.currencySymbol)}</span>{/if}
          {#each fields as f (f.id)}
            {@const v = statValue(game, session, p.id, f)}
            {#if f.type === 'number' && f.display === 'bar' && f.max}
              <span class="bar" title="{f.name} {v}" style:--fc={f.color ?? '#e6194b'}>
                <span class="fill" style:width="{Math.max(0, Math.min(100, (Number(v) / f.max) * 100))}%"></span>
                <span class="lbl">{f.name} {v}</span>
              </span>
            {:else if f.type === 'number' && f.display === 'hearts' && Math.max(f.max ?? 0, Number(v)) > heartsUpTo}
              <span class="hearts count" title="{f.name} {v}" style:color={f.color ?? '#e6194b'}>♥ {v}{f.max ? `/${f.max}` : ''}</span>
            {:else if f.type === 'number' && f.display === 'hearts'}
              <span class="hearts" title="{f.name} {v}" style:color={f.color ?? '#e6194b'}>
                {'♥'.repeat(Math.max(0, Math.min(20, Number(v))))}{f.max ? '♡'.repeat(Math.max(0, Math.min(20, f.max) - Math.max(0, Number(v)))) : ''}
              </span>
            {:else if f.type === 'tags'}
              {#each Array.isArray(v) ? v : [] as tag (tag)}<span class="tag">{tag}</span>{/each}
            {:else if f.type === 'checkbox'}
              {#if v}<span class="tag">{f.name}</span>{/if}
            {:else if v !== '' && v !== undefined}
              <span class="num" style:color={f.color}>{f.symbol ? '' : `${f.name} `}{formatStat(f, v)}</span>
            {/if}
          {/each}
        </div>
      </div>
    </div>
  {/each}
</div>

<style>
  .strip {
    display: flex;
    gap: 12px;
    justify-content: center;
    flex-wrap: wrap;
    padding: 10px 16px;
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.75) 30%);
  }
  .strip.one-row {
    flex-wrap: nowrap;
  }
  /* Big enough to read once the stream is scaled down (720p, a phone): about 1.5× the old size. */
  .card {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 12px;
    padding: 8px 18px 8px 8px;
    border-radius: 60px;
    background: rgba(0, 0, 0, 0.65);
    border: 3px solid var(--c);
    color: #fff;
  }
  .card[draggable='true'] {
    cursor: grab;
  }
  .card.drop-on {
    outline: 6px dashed #fff;
    outline-offset: 4px;
  }
  .info {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .name {
    font-family: 'Anton', 'Oswald', sans-serif;
    font-size: 38px;
    line-height: 1;
    padding: 3px 10px;
    border-radius: 6px;
    align-self: flex-start;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .compact .name {
    font-size: 26px;
  }
  .stats {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    font-size: 32px;
    font-weight: 700;
  }
  /* One row of cards: the bars give way before anything goes onto a second line. */
  .one-row .stats {
    flex-wrap: nowrap;
  }
  .stats > * {
    flex: none;
  }
  .compact .stats {
    font-size: 24px;
  }
  .score {
    color: #ffcc00;
  }
  .bar {
    position: relative;
    display: inline-block;
    width: 190px;
    min-width: 70px;
    flex: 0 1 190px;
    height: 34px;
    border-radius: 17px;
    background: rgba(255, 255, 255, 0.15);
    overflow: hidden;
  }
  .compact .bar {
    width: 140px;
    height: 28px;
  }
  .compact .lbl {
    font-size: 19px;
    line-height: 28px;
  }
  .fill {
    position: absolute;
    inset: 0 auto 0 0;
    background: var(--fc);
    transition: width 0.4s ease;
  }
  .lbl {
    position: relative;
    display: block;
    text-align: center;
    font-size: 23px;
    line-height: 34px;
    text-shadow: 1px 1px 0 #000;
  }
  .hearts {
    letter-spacing: 1px;
  }
  .hearts.count {
    letter-spacing: 0;
    white-space: nowrap;
  }
  .tag {
    padding: 1px 8px;
    border-radius: 10px;
    background: #4f7cff;
    font-size: 0.75em;
  }
</style>
