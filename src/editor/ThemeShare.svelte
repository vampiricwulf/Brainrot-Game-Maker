<!--
  🎨 Theme › My themes: looks saved on this computer under a name (use one in any game, rename, update, delete), and
  sharing a theme: a .brainrot-theme file (with its pictures and uploaded fonts), a text code (without), or another
  game's theme.
-->
<script lang="ts">
  import { app, toast } from '../lib/app.svelte';
  import { ask, tell } from '../lib/ask.svelte';
  import { safeFilename, pickFile, saveFile, savedWhere } from '../lib/fileio';
  import { step } from '../lib/history.svelte';
  import { storedBlob } from '../lib/media.svelte';
  import { dropMenu, type MenuEntry } from '../lib/menustate.svelte';
  import type { Theme } from '../lib/theme';
  import {
    addMyTheme,
    changeMyTheme,
    deleteMyTheme,
    freshThemeName,
    loadMyThemes,
    missingFonts,
    themeFiles,
    themeMedia,
    usesUploadedFonts,
    withMyTheme,
    type MyTheme,
  } from '../lib/mytheme';
  import { storeThemeFiles, renameThemeFiles, withShared } from '../lib/themeapply';
  import { parseThemeFile, THEME_EXT, THEME_FILES, themeCode, themeFileText, ThemeError, type SharedTheme, type ThemeMediaFile } from '../lib/themefile';
  import { clone } from '../lib/ops';
  import { addMedia, sameContent } from '../lib/roundcopy';
  import { copyText } from '../play/standings';
  import { pickOtherGame } from './roundtools';
  import ThemeSwatch from './ThemeSwatch.svelte';
  import ThemeNameDialog from './ThemeNameDialog.svelte';
  import ThemeImportDialog from './ThemeImportDialog.svelte';

  let list = $state.raw<MyTheme[]>(loadMyThemes());
  const game = $derived(app.game);
  const NOT_STORED = 'This browser won’t store it (storage is blocked or full)';

  /** The saved theme this game looks like now (using it would change nothing), if any. */
  const current = $derived.by(() => {
    const now = $state.snapshot(game.theme) as Theme;
    return list.find((m) => sameContent(withMyTheme(now, m.theme, game.media), now)) ?? null;
  });
  /** A name for this game's theme when it's shared. */
  const shareName = $derived(current?.name ?? `${game.title.trim() || 'My'} theme`);

  let naming = $state<{ title: string; value: string; ok: string; done: (name: string) => void } | null>(null);
  /** A shared theme coming in: from a file, or 'code' while one is pasted. */
  let importing = $state.raw<SharedTheme | 'code' | null>(null);

  function save(): void {
    naming = {
      title: '💾 Save as my theme',
      value: freshThemeName(list, current ? `${current.name}` : `${game.title.trim() || 'My'} theme`),
      ok: 'Save',
      done: (name) => {
        const next = addMyTheme(list, name, $state.snapshot(game.theme) as Theme);
        if (!next) return void toast(NOT_STORED);
        list = next;
        const fonts = usesUploadedFonts(game.theme);
        toast(`Saved “${next[next.length - 1].name}” to my themes: use it in any game on this computer (pictures${fonts ? ' and uploaded fonts' : ''} stay with this game)`);
      },
    };
  }

  function use(m: MyTheme): void {
    const now = $state.snapshot(game.theme) as Theme;
    const next = withMyTheme(now, clone(m.theme), game.media);
    const missing = missingFonts(m.theme, game.media).length;
    const note = missing ? ` (its uploaded font${missing === 1 ? ' isn’t' : 's aren’t'} in this game: ${missing === 1 ? 'that text keeps its' : 'those keep their'} font)` : '';
    if (sameContent(next, now)) return void toast(`This game already looks like “${m.name}”${note}`);
    step(`Theme: ${m.name}`, () => (game.theme = next), { notify: true });
    if (note) toast(`Used “${m.name}”${note}`);
  }

  function rename(m: MyTheme): void {
    naming = {
      title: '✏ Rename theme',
      value: m.name,
      ok: 'Rename',
      done: (name) => {
        const next = changeMyTheme(list, m.id, { name });
        if (!next) return void toast(NOT_STORED);
        list = next;
      },
    };
  }

  async function update(m: MyTheme): Promise<void> {
    if (!(await ask(`Update “${m.name}” to look like this game’s theme? Its colors, fonts and layout are replaced.`, { ok: 'Update' }))) return;
    const next = changeMyTheme(list, m.id, { theme: $state.snapshot(game.theme) as Theme });
    if (!next) return void toast(NOT_STORED);
    list = next;
    toast(`Updated “${m.name}”`);
  }

  async function remove(m: MyTheme): Promise<void> {
    if (!(await ask(`Delete “${m.name}” from my themes? Games that use it keep their look.`, { ok: 'Delete', danger: true }))) return;
    const next = deleteMyTheme(list, m.id);
    if (!next) return void toast(NOT_STORED);
    list = next;
    toast(`Deleted “${m.name}”`);
  }

  /** Write a theme file: with the pictures and uploaded fonts of this game it uses (`withFiles`). */
  async function exportTheme(name: string, theme: Theme, withFiles: boolean): Promise<void> {
    try {
      const media: ThemeMediaFile[] = [];
      const notHere: string[] = [];
      for (const ref of withFiles ? themeFiles(theme, game.media) : []) {
        const blob = ref.url ? undefined : await storedBlob(ref.id);
        if (blob) media.push({ ref: clone(ref), blob });
        else notHere.push(ref.name);
      }
      const { text, leftOut } = await themeFileText(name, theme, media);
      const filename = `${safeFilename(name)}${THEME_EXT}`;
      const saved = await saveFile(filename, new Blob([text], { type: 'application/json' }));
      const out = [...leftOut, ...notHere];
      toast(`${savedWhere(saved, filename)}${out.length ? ` (left out: ${out.join(', ')}${leftOut.length ? ', too big' : ''})` : ''}`);
    } catch (e) {
      void tell(`The theme couldn’t be saved: ${(e as Error).message}`);
    }
  }

  async function copyCode(name: string, theme: Theme): Promise<void> {
    const pics = !!(theme.boardImage || theme.banner) || usesUploadedFonts(theme);
    await copyText(await themeCode(name, theme), `Theme code copied: paste it anywhere${pics ? ' (pictures and uploaded fonts don’t go in a code: export a theme file for those)' : ''}`);
  }

  function items(m: MyTheme): MenuEntry[] {
    return [
      { label: '🎨 Use in this game', onclick: () => use(m) },
      { label: '✏ Rename…', onclick: () => rename(m) },
      { label: '🔄 Update from this game’s theme…', onclick: () => void update(m) },
      { sep: true },
      { label: '⬇ Export theme file', onclick: () => void exportTheme(m.name, m.theme, false) },
      { label: '📋 Copy theme code', onclick: () => void copyCode(m.name, m.theme) },
      { sep: true },
      { label: '🗑 Delete…', danger: true, onclick: () => void remove(m) },
    ];
  }

  async function importFile(): Promise<void> {
    const file = await pickFile(THEME_FILES);
    if (!file) return;
    try {
      importing = parseThemeFile(await file.text());
    } catch (e) {
      void tell(`“${file.name}” can’t be used as a theme: ${e instanceof ThemeError ? e.message : 'it can’t be read.'}`);
    }
  }

  /** A shared theme in this game: its files go in with it, in one undo step. */
  async function useShared(s: SharedTheme): Promise<void> {
    importing = null;
    const g = game;
    const { refs, ids } = await storeThemeFiles(s);
    const theme = renameThemeFiles(s.theme, ids);
    const now = $state.snapshot(g.theme) as Theme;
    // The files it brings that the theme uses (an uploaded font it doesn't use stays out).
    const add = themeFiles(theme, refs);
    const next = withShared(now, theme, [...g.media, ...add]);
    if (sameContent(next, now) && add.every((r) => g.media.some((m) => m.id === r.id))) return void toast(`This game already looks like “${s.name}”`);
    step(
      `Theme: ${s.name}`,
      () => {
        addMedia(g, add);
        g.theme = next;
      },
      { notify: true },
    );
  }

  function saveShared(s: SharedTheme): void {
    importing = null;
    const next = addMyTheme(list, freshThemeName(list, s.name), s.theme);
    if (!next) return void toast(NOT_STORED);
    list = next;
    toast(`Saved “${next[next.length - 1].name}” to my themes${s.media.length ? ' (without its pictures and fonts’ files: use it in a game to bring those in)' : ''}`);
  }

  async function fromGame(): Promise<void> {
    const other = await pickOtherGame();
    if (!other) return;
    const g = game;
    step(`Theme from “${other.title}”`, () => {
      addMedia(g, themeMedia(other));
      g.theme = clone(other.theme);
    }, { notify: true });
  }
</script>

<section class="mine" aria-labelledby="my-themes-heading">
  <h3 id="my-themes-heading">My themes <span class="where">· on this computer</span></h3>
  {#if list.length}
    <div class="cards">
      {#each list as m (m.id)}
        <div class="card" class:on={current?.id === m.id}>
          <button class="use" aria-pressed={current?.id === m.id} onclick={() => use(m)} title="Use “{m.name}” in this game">
            <ThemeSwatch theme={m.theme} />
            <span class="nm"><span class="tag" title="Saved by you">★</span> {m.name}</span>
          </button>
          <button class="ghost tiny more" aria-label="More for “{m.name}”" title="Rename, update, share or delete" onclick={(e) => dropMenu(e, items(m))}>⋯</button>
        </div>
      {/each}
    </div>
  {:else}
    <p class="hint">Themes you save show here, to use in any game on this computer.</p>
  {/if}
  <div class="share">
    <button class="small" onclick={save} title="Keep these colors, fonts and layout on this computer under a name, to use in other games">💾 Save as my theme…</button>
    <button class="small" onclick={() => exportTheme(shareName, $state.snapshot(game.theme) as Theme, true)} title="A .brainrot-theme file to send: with this theme’s pictures and uploaded fonts">
      ⬇ Export theme
    </button>
    <button class="small" onclick={() => copyCode(shareName, $state.snapshot(game.theme) as Theme)} title="A short code to paste in a chat: colors, fonts and layout (no pictures or uploaded fonts)">
      📋 Copy theme code
    </button>
    <button class="small" onclick={importFile} title="Open a .brainrot-theme file">📂 Import theme…</button>
    <button class="small" onclick={() => (importing = 'code')} title="Paste a theme code someone sent you">⌨ Paste theme code…</button>
    <button class="small" onclick={fromGame} title="Open a .brainrot game and use its theme (with its pictures and uploaded fonts)">📂 Use a theme from another game…</button>
  </div>
  <p class="hint">A theme file carries its pictures and uploaded fonts. A theme code, and themes saved here, keep the colors, fonts and layout only.</p>
</section>

{#if naming}
  {@const n = naming}
  <ThemeNameDialog
    title={n.title}
    value={n.value}
    ok={n.ok}
    onname={(name) => {
      // (Read before the window goes: `n` goes with it.)
      const done = n.done;
      naming = null;
      if (name) done(name);
    }}
  />
{/if}
{#if importing}
  <ThemeImportDialog shared={importing === 'code' ? null : importing} onuse={useShared} onsave={saveShared} onclose={() => (importing = null)} />
{/if}

<style>
  .mine {
    margin-top: 12px;
  }
  h3 {
    margin: 0 0 6px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
  }
  .where {
    text-transform: none;
    letter-spacing: 0;
    font-weight: 400;
  }
  .cards {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .card {
    position: relative;
    display: flex;
    min-width: 0;
  }
  .use {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
    padding: 8px;
  }
  .card.on .use {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .nm {
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: left;
    padding-right: 18px;
  }
  .tag {
    color: var(--warn);
  }
  .more {
    position: absolute;
    right: 4px;
    bottom: 6px;
  }
  .share {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }
  .hint {
    margin: 6px 0 0;
  }
</style>
