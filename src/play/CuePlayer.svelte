<!--
  The sounds that go with what's on screen, in the window that plays the game's sound: dice rattling, a wheel ticking
  as its slices pass the pointer and its landing, and a board game's token stepping from space to space. They're timed
  from the same timestamps as the animations, so they match the picture in every window. Also the short cues for what
  the host does (an RPG step, a pick-up, coins: live.blip), over any other sound. Draws nothing.
-->
<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { applySink, playAndReport } from '../lib/audioout.svelte';
  import { HOP_MS } from '../lib/boardgame';
  import type { Live } from '../lib/live';
  import type { Game, Session } from '../lib/model';
  import { cueVolume, tickTimes, type CueKey } from '../lib/sounds';
  import { cueHere, soundUrl } from './cues';

  let { game, session, live }: { game: Game; session: Session; live: Live } = $props();

  /** Sounds waiting for their moment, by what they belong to (a spin, a roll, a move). */
  const waiting = new Map<string, ReturnType<typeof setTimeout>[]>();

  /** A few players per sound, reused: wheel ticks come fast. */
  const pools = new Map<string, { els: HTMLAudioElement[]; next: number }>();
  function play(key: CueKey, report = false): void {
    const url = soundUrl(cueHere(game, key));
    if (!url) return;
    let pool = pools.get(url);
    if (!pool) pools.set(url, (pool = { els: [], next: 0 }));
    if (pool.els.length < 4) pool.els.push(new Audio(url));
    const el = pool.els[pool.next++ % pool.els.length];
    el.currentTime = 0;
    el.volume = cueVolume(game, key);
    // Only the first of a run says whether it played (the host learns a blocked window from it).
    if (report) void playAndReport(el);
    else void applySink(el).then(() => el.play().catch(() => {}));
  }

  /** Play `key` at each of these times (ms timestamps), for `id`; times already gone are skipped. */
  function schedule(id: string, key: CueKey, times: number[]): void {
    const now = Date.now();
    const list = waiting.get(id) ?? [];
    let first = true;
    for (const at of times) {
      if (at < now - 40) continue;
      const report = first;
      first = false;
      list.push(setTimeout(() => play(key, report), Math.max(0, at - now)));
    }
    waiting.set(id, list);
  }

  // Tools on screen: each spin, roll or roll-off is scheduled once; one that's gone (closed, or a new one) goes quiet.
  $effect(() => {
    const o = live.overlay;
    const ids = new Set<string>();
    const add = (id: string, fn: () => void) => {
      ids.add(id);
      if (!waiting.has(id)) fn();
    };
    if (o?.kind === 'wheel') {
      for (const [i, w] of [o, ...(o.extra ?? [])].entries()) {
        const spin = w.spin;
        if (!spin) continue;
        add(`${o.nonce}:${i}:${spin.startedAt}`, () => {
          // The ticks for the main wheel only: two wheels ticking at once is just noise.
          const end = spin.startedAt + spin.duration;
          if (i === 0) schedule(`${o.nonce}:${i}:${spin.startedAt}`, 'wheelTick', tickTimes(w.segments, spin).map((t) => spin.startedAt + t));
          schedule(`${o.nonce}:${i}:${spin.startedAt}`, 'wheelLand', [end]);
        });
      }
    } else if (o?.kind === 'dice' && o.roll) {
      add(o.nonce, () => schedule(o.nonce, 'dice', Date.now() < o.startedAt + o.duration ? [Math.max(o.startedAt, Date.now())] : []));
    } else if (o?.kind === 'rolloff') {
      add(o.nonce, () => schedule(o.nonce, 'dice', o.rounds.map((_, i) => o.startedAt + i * o.roundMs)));
    }
    // A board game's move: a step sound for each space the token hops to.
    const round = game.rounds[session.currentRound];
    const hop = session.phase === 'boardgame' && round ? session.boardgames?.[round.id]?.hop : undefined;
    if (hop) {
      const id = `hop:${hop.playerId}:${hop.at}`;
      add(id, () => schedule(id, 'move', hop.path.slice(1).map((_, i) => hop.at + (i + 1) * HOP_MS)));
    }
    for (const [id, list] of waiting)
      if (!ids.has(id)) {
        list.forEach(clearTimeout);
        waiting.delete(id);
      }
  });

  // A short cue for something the host did. One already there when this window opened (or long gone) isn't played.
  let lastBlip = untrack(() => live.blip?.nonce);
  $effect(() => {
    const b = live.blip;
    if (!b || b.nonce === lastBlip) return;
    lastBlip = b.nonce;
    if (Date.now() - b.at < 1500) untrack(() => play(b.key));
  });

  onDestroy(() => {
    for (const list of waiting.values()) list.forEach(clearTimeout);
    for (const p of pools.values()) p.els.forEach((el) => el.pause());
  });
</script>
