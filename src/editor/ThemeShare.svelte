<!-- 🎨 Theme: keep this look as "my theme" on this computer, use it in any game, or take another game's theme. -->
<script lang="ts">
  import { app, toast } from '../lib/app.svelte';
  import { step } from '../lib/history.svelte';
  import { loadMyTheme, missingFonts, saveMyTheme, themeMedia, usesUploadedFonts, withMyTheme } from '../lib/mytheme';
  import type { Theme } from '../lib/theme';
  import { clone } from '../lib/ops';
  import { addMedia, sameContent } from '../lib/roundcopy';
  import { pickOtherGame } from './roundtools';

  let mine = $state(loadMyTheme());

  function save(): void {
    if (!saveMyTheme($state.snapshot(app.game.theme))) return void toast('This browser won’t store it (storage is blocked or full)');
    mine = loadMyTheme();
    const fonts = usesUploadedFonts(app.game.theme);
    toast(`Saved as my theme: “Use my theme” in any game on this computer (pictures${fonts ? ' and uploaded fonts' : ''} stay with this game)`);
  }

  function useMine(): void {
    const m = mine;
    if (!m) return;
    const game = app.game;
    const now = $state.snapshot(game.theme) as Theme;
    const next = withMyTheme(now, clone(m), game.media);
    const missing = missingFonts(m, game.media).length;
    const note = missing ? ` (its uploaded font${missing === 1 ? ' isn’t' : 's aren’t'} in this game: ${missing === 1 ? 'that text keeps its' : 'those keep their'} font)` : '';
    if (sameContent(next, now)) return void toast(`This game already looks like my theme${note}`);
    step('Theme: my theme', () => (game.theme = next), { notify: true });
    if (note) toast(`Used my theme${note}`);
  }

  async function fromGame(): Promise<void> {
    const other = await pickOtherGame();
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
    🎨 Use my theme
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
</style>
