<!-- Start screen of an exported, player-only game file. -->
<script lang="ts">
  import { app, toast } from './lib/app.svelte';
  import { savePack } from './lib/pack';
  import type { SavedPlay } from './lib/persist';
  import { finalName, isBoard, isBoardGame, isFinal, isRpg, playableClues } from './lib/model';
  import { mediaUrls } from './lib/media.svelte';
  import { themeStyle } from './lib/theme';
  import { onlineCount } from './lib/usage';
  import type { Snippet } from 'svelte';

  let {
    onplay,
    resumable,
    onresume,
    ondiscard,
    ask,
  }: {
    onplay: () => void;
    resumable: SavedPlay | null;
    onresume: () => void;
    ondiscard: () => void;
    /** Resume game was pressed: how the game is shown (asked in place of the buttons). */
    ask?: Snippet;
  } = $props();

  const game = $derived(app.game);
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  /** "2 boards · 50 clues · 1 RPG adventure · Final Jeopardy!" */
  const summary = $derived.by(() => {
    const boards = game.rounds.filter(isBoard);
    const rpgs = game.rounds.filter(isRpg).length;
    const boardGames = game.rounds.filter(isBoardGame).length;
    const clues = boards.reduce((n, r) => n + playableClues(r).length, 0);
    return [
      boards.length && `${plural(boards.length, 'board')} · ${plural(clues, 'clue')}`,
      rpgs && plural(rpgs, 'RPG adventure'),
      boardGames && plural(boardGames, 'board game'),
      ...game.rounds.filter(isFinal).map((f) => finalName(f)),
    ]
      .filter(Boolean)
      .join(' · ');
  });

  async function download(): Promise<void> {
    try {
      await savePack($state.snapshot(game));
      toast('Downloaded the .brainrot game pack: open it in the Brainrot Games Maker to edit', 5000);
    } catch (e) {
      toast(`Couldn't download the game pack: ${(e as Error).message}`, 6000);
    }
  }
  const style = $derived(themeStyle(game.theme, game.theme?.boardImage ? mediaUrls[game.theme.boardImage] : undefined));
  const online = $derived(onlineCount(game));
</script>

<div class="home" {style}>
  <div class="card">
    <div class="logo">BRAINROT GAMES</div>
    <h1>{game.title}</h1>
    <p class="muted">{summary}</p>
    {#if resumable}
      {@const ended = resumable.session.phase === 'end'}
      <div class="resume">
        <span>{ended ? 'A finished game' : 'A game in progress'} was saved {new Date(resumable.savedAt).toLocaleString()}.</span>
        {#if ask}
          {@render ask()}
        {:else}
          <div class="row">
            <button class="primary" onclick={onresume}>{ended ? 'View results' : 'Resume game'}</button>
            <!-- App asks before deleting a game in progress. -->
            <button class="ghost" onclick={ondiscard}>{ended ? 'New game' : 'Start over'}</button>
          </div>
        {/if}
      </div>
    {:else}
      <button class="primary big" onclick={onplay}>▶ Play</button>
    {/if}
    <ul class="notes small">
      <li class="warn">This is the host's copy: it shows every answer and note. Don't share it with players.</li>
      <li>On stream, use <b>📺 Separate audience window</b> (picked before the game starts) and capture that window.</li>
      <li>Press <b>?</b> during the game for the keys.</li>
    </ul>
    {#if online}
      <p class="muted small">🌐 {online} item{online === 1 ? '' : 's'} in this game play{online === 1 ? 's' : ''} from the internet, so stay online while you play.</p>
    {/if}
    {#if !app.storageOk}
      <p class="warn small">This browser isn't saving progress here (its storage is blocked or full), so a refresh restarts the game.</p>
    {/if}
    <button class="ghost small" onclick={download}>⬇ Download as .brainrot (to edit in the builder)</button>
    <!-- Someone who made it, testing their export: their games are where they left them. -->
    <p class="muted small">This file plays this one game. It can't change it, and your own games in the builder aren't touched.</p>
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
  .notes {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
</style>
