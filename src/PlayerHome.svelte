<!-- Start screen of an exported, player-only game file. -->
<script lang="ts">
  import { app, toast } from './lib/app.svelte';
  import { savePack } from './lib/pack';
  import type { SavedPlay } from './lib/persist';
  import { finalName, playableClues } from './lib/model';
  import { mediaUrls } from './lib/media.svelte';
  import { themeStyle } from './lib/theme';
  import { onlineCount } from './lib/usage';

  let {
    onplay,
    resumable,
    onresume,
    ondiscard,
  }: { onplay: () => void; resumable: SavedPlay | null; onresume: () => void; ondiscard: () => void } = $props();

  const game = $derived(app.game);
  const clues = $derived(game.rounds.reduce((n, r) => n + playableClues(r).length, 0));
  const style = $derived(themeStyle(game.theme, game.theme?.boardImage ? mediaUrls[game.theme.boardImage] : undefined));
  const online = $derived(onlineCount(game));
</script>

<div class="home" {style}>
  <div class="card">
    <div class="logo">BRAINROT GAMES</div>
    <h1>{game.title}</h1>
    <p class="muted">
      {game.rounds.length} round{game.rounds.length === 1 ? '' : 's'} · {clues} clues{game.final.enabled ? ` · ${finalName(game)}` : ''}
    </p>
    {#if resumable}
      {@const ended = resumable.session.phase === 'end'}
      <div class="resume">
        <span>{ended ? 'A finished game' : 'A game in progress'} was saved {new Date(resumable.savedAt).toLocaleString()}.</span>
        <div class="row">
          <button class="primary" onclick={onresume}>{ended ? 'View results' : 'Resume game'}</button>
          <!-- App asks before deleting a game in progress. -->
          <button class="ghost" onclick={ondiscard}>{ended ? 'New game' : 'Start over'}</button>
        </div>
      </div>
    {:else}
      <button class="primary big" onclick={onplay}>▶ Play</button>
    {/if}
    {#if online}
      <p class="muted small">🌐 {online} item{online === 1 ? '' : 's'} in this game play{online === 1 ? 's' : ''} from the internet, so stay online while you play.</p>
    {/if}
    {#if !app.storageOk}
      <p class="warn small">This browser won't save progress for files opened from disk, so a refresh restarts the game.</p>
    {/if}
    <button
      class="ghost small"
      onclick={async () => {
        await savePack($state.snapshot(game));
        toast('Downloaded the .brainrot game pack: open it in the Brainrot Games Maker to edit');
      }}>⬇ Download as .brainrot (to edit in the builder)</button>
  </div>
</div>

<style>
  .home {
    height: 100%;
    display: grid;
    place-items: center;
    padding: 16px;
    background: var(--board-image, none) center / cover no-repeat, radial-gradient(circle at 50% 30%, var(--tile), #000 80%);
  }
  .card {
    width: min(560px, 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    padding: 32px 24px;
    text-align: center;
    background: rgba(10, 12, 20, 0.85);
    border: 1px solid var(--border);
    border-radius: 16px;
  }
  .logo {
    font-family: var(--value-font);
    font-size: 44px;
    color: var(--value);
    text-shadow: 3px 3px 0 #000;
  }
  h1 {
    margin: 0;
    font-size: 28px;
  }
  p {
    margin: 0;
  }
  .big {
    font-size: 20px;
    padding: 12px 36px;
  }
  .resume {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
  }
  .small {
    font-size: 12px;
  }
  .warn {
    color: var(--warn);
  }
</style>
