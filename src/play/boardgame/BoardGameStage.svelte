<!--
  What a board-game round shows (games-maker spec §7.13): the board with its spaces, the players' tokens stepping
  along them, whose turn it is, who is stuck in an off-board zone, and the stats strip. Or a zone's own screen.
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { fade } from 'svelte/transition';
  import { textOn } from '../../lib/colors';
  import { currentPlayer, fanOut, HOP_MS, shownSpace, spaceById } from '../../lib/boardgame';
  import BoardSpaces from '../../lib/boardgame/BoardSpaces.svelte';
  import type { MediaRole } from '../../lib/mediactl.svelte';
  import type { Game, Session } from '../../lib/model';
  import Avatar from '../../lib/rpg/Avatar.svelte';
  import SlideView from '../../lib/slide/SlideView.svelte';
  import StatsStrip from '../rpg/StatsStrip.svelte';
  import { boardNow } from './bgops';

  let { game, session, role }: { game: Game; session: Session; role: MediaRole } = $props();
  const now_ = $derived(boardNow(game, session));
  const round = $derived(now_.round);
  const bs = $derived(now_.bs);
  const audience = $derived(role !== 'mirror');
  const turnId = $derived(bs ? currentPlayer(bs) : undefined);
  const turn = $derived(session.players.find((p) => p.id === turnId));
  const zone = $derived(round?.zones.find((z) => z.id === bs?.zoneShown));
  const bar = $derived(game.theme?.scoreBar ?? 'bottom');

  // Ticks while a move animates, so tokens step space by space.
  let now = $state(Date.now());
  let raf = 0;
  $effect(() => {
    const h = bs?.hop;
    if (!h) return;
    const end = h.at + h.path.length * HOP_MS;
    const tick = () => {
      now = Date.now();
      if (now < end) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  });
  onDestroy(() => cancelAnimationFrame(raf));

  /** Each token on the board and where it's drawn (keyed by player, so a move slides from space to space). */
  const tokens = $derived.by(() => {
    if (!bs || !round) return [];
    const groups = new Map<string, string[]>();
    for (const p of session.players) {
      const s = shownSpace(bs, p.id, now);
      if (s) groups.set(s, [...(groups.get(s) ?? []), p.id]);
    }
    const out: { id: string; x: number; y: number; small: boolean }[] = [];
    for (const [spaceId, ids] of groups) {
      const sp = spaceById(round, spaceId);
      if (!sp) continue;
      const spots = fanOut(ids.length);
      ids.forEach((id, i) => out.push({ id, x: sp.x + spots[i].dx, y: sp.y + spots[i].dy - 40, small: ids.length > 3 }));
    }
    return out;
  });
  const inZone = (id: string) => session.players.filter((p) => bs?.positions[p.id]?.zone === id);
</script>

<div class="bg">
  {#if round && bs}
    {#if zone}
      {#key zone.id}
        <div class="layer" in:fade={{ duration: 300 }}>
          <SlideView slide={zone.slide} mode="play" {role} fallbackBg="#2a0845" />
          <div class="zone-players">
            {#each inZone(zone.id) as p (p.id)}
              <div class="tok"><Avatar player={p} size={130} /><div class="plate" style:background={p.color} style:color={textOn(p.color)}>{p.name}</div></div>
            {/each}
          </div>
        </div>
      {/key}
    {:else}
      <div class="layer">
        <SlideView slide={round.slide} mode="play" {role} fallbackBg="#1d5e3a" />
        <BoardSpaces {round} {audience} revealed={bs.revealed ?? []} />
        {#each tokens as t (t.id)}
          {@const p = session.players.find((x) => x.id === t.id)}
          {#if p}
            <div class="tok on-board" class:current={t.id === turnId} style:left="{t.x}px" style:top="{t.y}px" data-player={p.name} data-player-id={p.id}>
              <Avatar player={p} size={t.small ? 64 : 84} />
            </div>
          {/if}
        {/each}
      </div>
    {/if}
    {#if turn}
      <div class="turn-banner" style:background={turn.color} style:color={textOn(turn.color)}>🎲 {turn.name}’s turn</div>
    {/if}
    {#if round.zones.some((z) => inZone(z.id).length) && !zone}
      <div class="zones">
        {#each round.zones as z (z.id)}
          {#if inZone(z.id).length}<div class="zone">🌀 {z.name}: {inZone(z.id).map((p) => p.name).join(', ')}</div>{/if}
        {/each}
      </div>
    {/if}
    {#if round.winPublic && round.winNotes}<div class="win">🏆 {round.winNotes}</div>{/if}
    {#if bar !== 'hidden'}
      <div class="strip bar-{bar}"><StatsStrip {game} {session} players={session.players} /></div>
    {/if}
  {:else}
    <div class="empty">Starting…</div>
  {/if}
</div>

<style>
  .bg,
  .layer {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }
  .bg {
    /* Its own layers: avatars and the strip stay under tool overlays (wheels, pop-ups) and the cover. */
    isolation: isolate;
    background: #000;
  }
  .tok {
    display: flex;
    flex-direction: column;
    align-items: center;
    filter: drop-shadow(0 6px 8px rgba(0, 0, 0, 0.6));
  }
  .on-board {
    position: absolute;
    transform: translate(-50%, -50%);
    transition:
      left 0.3s ease,
      top 0.3s ease;
    z-index: 10;
  }
  .on-board.current {
    z-index: 11;
    filter: drop-shadow(0 0 12px #ffcc00);
  }
  .plate {
    margin-top: -8px;
    padding: 2px 12px;
    border-radius: 8px;
    border: 3px solid #000;
    font: 28px 'Anton', 'Oswald', sans-serif;
  }
  .zone-players {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 200px;
    display: flex;
    justify-content: center;
    gap: 40px;
  }
  /* Labels over the board never catch clicks meant for the tokens and spaces under them. */
  .turn-banner,
  .zones,
  .win {
    pointer-events: none;
  }
  .turn-banner {
    position: absolute;
    left: 30px;
    top: 24px;
    padding: 8px 24px;
    border-radius: 14px;
    border: 4px solid #000;
    font: 48px 'Anton', 'Oswald', sans-serif;
    z-index: 20;
  }
  .zones {
    position: absolute;
    right: 30px;
    top: 24px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 20;
  }
  .zone,
  .win {
    padding: 6px 18px;
    border-radius: 12px;
    background: rgba(42, 8, 69, 0.9);
    border: 3px solid #b388ff;
    color: #fff;
    font: 32px 'Anton', 'Oswald', sans-serif;
  }
  .win {
    position: absolute;
    left: 30px;
    top: 110px;
    background: rgba(0, 0, 0, 0.75);
    border-color: #ffcc00;
    z-index: 20;
  }
  .strip {
    position: absolute;
    left: 0;
    right: 0;
    z-index: 30;
  }
  .strip.bar-bottom {
    bottom: 0;
  }
  .strip.bar-top {
    top: 0;
  }
  .empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: #fff;
    font-size: 60px;
  }
</style>
