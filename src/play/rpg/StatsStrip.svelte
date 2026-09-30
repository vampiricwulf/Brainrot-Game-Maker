<!-- The stats strip: each player's avatar, name, score and the stats marked "On the stats strip" (bars, hearts, numbers, tags). -->
<script lang="ts">
  import { textOn } from '../../lib/colors';
  import { formatPoints, type Game, type Player, type Session } from '../../lib/model';
  import { score } from '../../lib/session';
  import { formatStat, statFields, statValue } from '../../lib/toolset';
  import Avatar from '../../lib/rpg/Avatar.svelte';

  let { game, session, players, showScore = true }: { game: Game; session: Session; players: Player[]; showScore?: boolean } = $props();
  const fields = $derived(statFields(game).filter((f) => f.audience === 'hud'));
  // Smaller cards when there's a lot on them. Up to 6 players stay on one row (cards shrink to fit): a second row
  // would cover the bottom of the screen.
  const compact = $derived(players.length > 6 || players.length * (1 + fields.length) > 12);
  const oneRow = $derived(players.length <= 6);
</script>

<div class="strip" class:compact class:one-row={oneRow}>
  {#each players as p (p.id)}
    <div class="card" style:--c={p.color}>
      <Avatar player={p} size={compact ? 44 : 64} />
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
  .card {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 8px;
    padding: 6px 12px 6px 6px;
    border-radius: 40px;
    background: rgba(0, 0, 0, 0.65);
    border: 3px solid var(--c);
    color: #fff;
  }
  .info {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .name {
    font-family: 'Anton', 'Oswald', sans-serif;
    font-size: 26px;
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
    font-size: 18px;
  }
  .stats {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    font-size: 22px;
    font-weight: 700;
  }
  .compact .stats {
    font-size: 16px;
  }
  .score {
    color: #ffcc00;
  }
  .bar {
    position: relative;
    display: inline-block;
    width: 150px;
    height: 24px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.15);
    overflow: hidden;
  }
  .compact .bar {
    width: 100px;
    height: 20px;
  }
  .compact .lbl {
    font-size: 13px;
    line-height: 20px;
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
    font-size: 16px;
    line-height: 24px;
    text-shadow: 1px 1px 0 #000;
  }
  .hearts {
    letter-spacing: 1px;
  }
  .tag {
    padding: 1px 8px;
    border-radius: 10px;
    background: #4f7cff;
    font-size: 0.75em;
  }
</style>
