<!-- One player's full sheet for the audience: avatar, score, every stat that isn't host-only, and their inventory. -->
<script lang="ts">
  import { textOn } from '../../lib/colors';
  import { mediaUrls } from '../../lib/media.svelte';
  import { formatPoints, type Game, type Session } from '../../lib/model';
  import { score } from '../../lib/session';
  import { entryName, formatStat, inventory, itemDef, statFields, statValue, wornItems } from '../../lib/toolset';
  import AvatarToken from '../../lib/rpg/AvatarToken.svelte';

  let { game, session, playerId }: { game: Game; session: Session; playerId: string } = $props();
  const p = $derived(session.players.find((x) => x.id === playerId));
  const fields = $derived(statFields(game).filter((f) => f.audience !== 'hidden'));
  const items = $derived(inventory(session, playerId).filter((e) => !itemDef(game, e.item)?.secret));
</script>

{#if p}
  <div class="sheet" style:--c={p.color}>
    <div class="head">
      <AvatarToken player={p} size={220} worn={wornItems(game, session, p.id)} name={false} />
      <div>
        <div class="name" style:background={p.color} style:color={textOn(p.color)}>{p.name}</div>
        <div class="score">{formatPoints(score(session, p.id), game.settings.currencySymbol)}</div>
      </div>
    </div>
    <div class="cols">
      <div class="stats">
        {#each fields as f (f.id)}
          {@const v = statValue(game, session, p.id, f)}
          <div class="stat"><span class="k">{f.name}</span><span class="v" style:color={f.color}>{formatStat(f, v) || '—'}</span></div>
        {/each}
      </div>
      <div class="inv">
        <div class="k">Inventory</div>
        {#each items as e (e.id)}
          {@const def = itemDef(game, e.item)}
          <div class="it">
            {#if def?.icon && mediaUrls[def.icon]}<img src={mediaUrls[def.icon]} alt="" />{:else}<span class="ic">📦</span>{/if}
            <span>{entryName(game, e)}{e.qty > 1 ? ` ×${e.qty}` : ''}{e.equipped ? ' (equipped)' : ''}</span>
          </div>
        {:else}
          <div class="muted">Empty pockets.</div>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .sheet {
    position: absolute;
    inset: 80px 160px;
    display: flex;
    flex-direction: column;
    gap: 30px;
    padding: 40px 50px;
    border-radius: 30px;
    background: rgba(0, 0, 20, 0.92);
    border: 8px solid var(--c);
    color: #fff;
  }
  .head {
    display: flex;
    gap: 40px;
    align-items: center;
  }
  .name {
    font: 90px 'Anton', 'Oswald', sans-serif;
    padding: 4px 30px;
    border-radius: 14px;
    line-height: 1.1;
  }
  .score {
    margin-top: 10px;
    font: 60px 'Anton', 'Oswald', sans-serif;
    color: #ffcc00;
  }
  .cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 40px;
    min-height: 0;
  }
  .stat {
    display: flex;
    justify-content: space-between;
    gap: 20px;
    font-size: 40px;
    padding: 6px 0;
    border-bottom: 2px solid rgba(255, 255, 255, 0.15);
  }
  .k {
    opacity: 0.75;
    font-size: 36px;
  }
  .v {
    font-weight: 800;
  }
  .inv {
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow: hidden;
  }
  .it {
    display: flex;
    align-items: center;
    gap: 16px;
    font-size: 38px;
  }
  .it img,
  .ic {
    width: 64px;
    height: 64px;
    object-fit: contain;
    font-size: 48px;
    text-align: center;
  }
  .muted {
    opacity: 0.6;
    font-size: 34px;
  }
</style>
