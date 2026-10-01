<!-- 🎨 Theme: keep this look as "my theme" on this computer, use it in any game, or take another game's theme. -->
<script lang="ts">
  import { app, toast } from '../lib/app.svelte';
  import { step } from '../lib/history.svelte';
  import { loadMyTheme, saveMyTheme, themeMedia, withMyTheme } from '../lib/mytheme';
  import { clone } from '../lib/ops';
  import { addMedia } from '../lib/roundcopy';
  import { pickOtherGame } from './roundtools';

  let mine = $state(loadMyTheme());

  function save(): void {
    if (!saveMyTheme($state.snapshot(app.game.theme))) return void toast('This browser won’t store it (storage is blocked or full)', 4000);
    mine = loadMyTheme();
    toast('Saved as my theme: “Use my theme” in any game on this computer (pictures stay with this game)', 5000);
  }

  function useMine(): void {
    const m = mine;
    if (!m) return;
    const game = app.game;
    step('Theme: my theme', () => (game.theme = withMyTheme(game.theme, clone(m))), { notify: true });
  }

  async function fromGame(): Promise<void> {
    const other = await pickOtherGame(app.game);
    if (!other) return;
    const game = app.game;
    step(`Theme from “${other.title}”`, () => {
      addMedia(game, themeMedia(other));
      game.theme = clone(other.theme);
    }, { notify: true });
  }
</script>

<div class="share">
  <button class="small" onclick={save} title="Keep these colors, fonts and layout on this computer, to use in other games">💾 Save as my theme</button>
  <button class="small" onclick={useMine} disabled={!mine} title={mine ? 'Use the theme saved on this computer (this game’s pictures stay)' : 'Save a theme first'}>
    ⭐ Use my theme
  </button>
  <button class="small" onclick={fromGame} title="Open a .brainrot game and use its theme (with its pictures and uploaded fonts)">📂 Use a theme from another game…</button>
</div>

<style>
  .share {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }
  .small {
    font-size: 12px;
  }
</style>
