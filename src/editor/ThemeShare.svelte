<!--
  🎨 Theme › the top of the settings: which theme this game uses (and its save buttons), the built-in themes, My themes
  (looks saved on this computer under a name: use one in any game, rename, save changes to it, delete), and sharing a
  theme: a .brainrot-theme file (with its pictures and uploaded fonts), a text code (without), or another game's theme.
  Every card has a menu: its ⋯ button, a right-click, or Shift+F10 / the menu key on it.
-->
<script lang="ts">
  import { app, toast } from '../lib/app.svelte';
  import { ask, tell } from '../lib/ask.svelte';
  import { safeFilename, pickFile, saveFile, savedWhere } from '../lib/fileio';
  import { step } from '../lib/history.svelte';
  import { storedBlob } from '../lib/media.svelte';
  import { dropMenu, keyMenu, showMenu, type MenuEntry } from '../lib/menustate.svelte';
  import { PRESETS, presetTheme, type Theme, type ThemePreset } from '../lib/theme';
  import { sameLook, withPreset, type ThemeOrigin } from '../lib/themesource';
  import {
    addMyTheme,
    changeMyTheme,
    deleteMyTheme,
    freshThemeName,
    missingFonts,
    themeFiles,
    themeMedia,
    usesUploadedFonts,
    withMyTheme,
    type MyTheme,
  } from '../lib/mytheme';
  import { storeThemeFiles, renameThemeFiles, withShared } from '../lib/themeapply';
  import { setTheme } from '../lib/cluetext';
  import { parseThemeFile, THEME_EXT, THEME_FILES, themeCode, themeFileText, ThemeError, type SharedTheme, type ThemeMediaFile } from '../lib/themefile';
  import { clone } from '../lib/ops';
  import { addMedia, sameContent } from '../lib/roundcopy';
  import { copyText } from '../play/standings';
  import { pickOtherGame } from './roundtools';
  import { inTauri } from '../lib/platform';
  import ThemeSwatch from './ThemeSwatch.svelte';
  import ThemeNameDialog from './ThemeNameDialog.svelte';
  import ThemeImportDialog from './ThemeImportDialog.svelte';

  let {
    incoming = $bindable(null),
    list = $bindable(),
    origin,
  }: {
    /** A theme file opened or dropped on the editor: shown first, like 📂 Import theme… (then back to null). */
    incoming?: SharedTheme | null;
    /** My themes (stored on this computer as they change). */
    list: MyTheme[];
    /** Where the game's theme came from (themesource.ts). */
    origin: ThemeOrigin | null;
  } = $props();
  $effect(() => {
    if (!incoming) return;
    importing = incoming;
    incoming = null;
  });

  const game = $derived(app.game);
  const NOT_STORED = 'This browser won’t store it (storage is blocked or full)';
  const now = () => $state.snapshot(game.theme) as Theme;

  /** A name for this game's theme when it's shared or saved: its saved theme's, an untouched preset's, else the game's. */
  const ownName = $derived(`${game.title.trim() || 'My'} theme`);
  const shareName = $derived(origin && (origin.kind === 'mine' || !origin.edited) ? origin.name : ownName);
  const PRESET_KEYS = Object.keys(PRESETS) as ThemePreset[];

  let naming = $state<{ title: string; value: string; ok: string; note?: string; done: (name: string) => void } | null>(null);
  /** A shared theme coming in: from a file, or 'code' while one is pasted. */
  let importing = $state.raw<SharedTheme | 'code' | null>(null);

  // ---------- Using a theme ----------

  // A preset replaces every color and font (not the pictures or the layout), so the note at the bottom offers Undo.
  function applyPreset(p: ThemePreset): void {
    const next: Theme = { ...withPreset(now(), p), source: { kind: 'preset', id: p } };
    if (sameContent(next, now())) return void toast(`This game already uses ${PRESETS[p].label}`);
    step(`Theme preset: ${PRESETS[p].label}`, () => (game.theme = next), { notify: true });
  }

  function use(m: MyTheme): void {
    const cur = now();
    const next: Theme = { ...withMyTheme(cur, clone(m.theme), game.media), source: { kind: 'mine', id: m.id } };
    const missing = missingFonts(m.theme, game.media).length;
    const note = missing ? ` (its uploaded font${missing === 1 ? ' isn’t' : 's aren’t'} in this game: ${missing === 1 ? 'that text keeps its' : 'those keep their'} font)` : '';
    if (sameContent(next, cur)) return void toast(`This game already looks like “${m.name}”${note}`);
    // (Its clue text restyles clues all over the game: Undo and Redo show it here, on the Theme page, not at the first
    // clue. So do the other whole themes below.)
    step(`Theme: “${m.name}”`, () => setTheme(game, next), { notify: true, place: { tab: 'theme' } });
    if (note) toast(`Used “${m.name}”${note}`);
  }

  /** The game's theme now comes from saved theme `id` (it was saved there): one step, so Undo takes the link back too. */
  function linkTo(id: string, label: string): void {
    if (game.theme.source?.kind === 'mine' && game.theme.source.id === id) return;
    step(label, () => (game.theme.source = { kind: 'mine', id }));
  }

  // ---------- Saving ----------

  /** 💾 Save as new theme…: under a name, and the game's theme is that one from then on. */
  /** Where My themes are kept: this browser's storage (or the desktop app's, on this computer). */
  const here = inTauri() ? 'on this computer' : 'in this browser';

  function saveNew(): void {
    naming = {
      title: '💾 Save as new theme',
      value: freshThemeName(list, origin?.kind === 'mine' ? origin.name : ownName),
      ok: 'Save',
      done: (name) => {
        const next = addMyTheme(list, name, now());
        if (!next) return void toast(NOT_STORED);
        list = next;
        const saved = next[next.length - 1];
        linkTo(saved.id, `Saved the theme as “${saved.name}”`);
        const fonts = usesUploadedFonts(game.theme);
        toast(
          `Saved “${saved.name}” to My themes: use it in any game ${here} (pictures${fonts ? ' and uploaded fonts' : ''} stay with this game). ` +
            `To take it to another ${inTauri() ? 'computer' : 'browser or computer'}, use ⬇ Export theme.`,
        );
      },
    };
  }

  /** Overwrite a saved theme with this game's look (it asks first: My themes aren't in the game's undo). */
  async function saveTo(m: MyTheme): Promise<void> {
    const ok = await ask(`Its colors, fonts and layout become this game’s. Games that already use it keep their own look.`, {
      title: `Overwrite “${m.name}” with this look?`,
      ok: 'Overwrite',
    });
    if (!ok) return;
    const next = changeMyTheme(list, m.id, { theme: now() });
    if (!next) return void toast(NOT_STORED);
    list = next;
    linkTo(m.id, `Saved the theme to “${m.name}”`);
    toast(`Saved the changes to “${m.name}”`);
  }

  /** A built-in theme kept as one of My themes (with this game's layout), to change from there. */
  function savePresetCopy(p: ThemePreset): void {
    naming = {
      title: `💾 Save a copy of ${PRESETS[p].label}`,
      value: freshThemeName(list, `My ${PRESETS[p].label}`),
      ok: 'Save',
      done: (name) => {
        const next = addMyTheme(list, name, withPreset(now(), p));
        if (!next) return void toast(NOT_STORED);
        list = next;
        toast(`Saved “${next[next.length - 1].name}” to My themes`);
      },
    };
  }

  function rename(m: MyTheme): void {
    naming = {
      title: '✏ Rename theme',
      value: m.name,
      ok: 'Rename',
      note: '',
      done: (name) => {
        const next = changeMyTheme(list, m.id, { name });
        if (!next) return void toast(NOT_STORED);
        list = next;
      },
    };
  }

  function duplicate(m: MyTheme): void {
    const next = addMyTheme(list, freshThemeName(list, m.name), m.theme as Theme);
    if (!next) return void toast(NOT_STORED);
    list = next;
    toast(`Saved a copy: “${next[next.length - 1].name}”`);
  }

  async function remove(m: MyTheme): Promise<void> {
    if (!(await ask(`Delete “${m.name}” from My themes? Games that use it keep their look.`, { ok: 'Delete', danger: true }))) return;
    const next = deleteMyTheme(list, m.id);
    if (!next) return void toast(NOT_STORED);
    list = next;
    toast(`Deleted “${m.name}”`);
  }

  // ---------- Sharing ----------

  /** Write a theme file: with the pictures and uploaded fonts of this game it uses (`withFiles`); `mine`: one of My themes. */
  async function exportTheme(name: string, theme: Theme, withFiles: boolean, mine = false): Promise<void> {
    try {
      const media: ThemeMediaFile[] = [];
      const notHere: string[] = [];
      for (const ref of withFiles ? themeFiles(theme, game.media) : []) {
        const blob = ref.url ? undefined : await storedBlob(ref.id);
        if (blob) media.push({ ref: clone(ref), blob });
        else notHere.push(ref.name);
      }
      // (A font it names that this game hasn't got, a saved theme's uploaded to another game, isn't here to go in the file.)
      for (const k of missingFonts(theme, game.media))
        notHere.push(`${k === 'boardFont' ? 'category' : k === 'valueFont' ? 'value' : 'clue'} font (${mine ? 'uploaded to another game' : 'not in this game'})`);
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

  // ---------- The cards' menus ----------

  function presetItems(p: ThemePreset): MenuEntry[] {
    const label = PRESETS[p].label;
    return [
      { heading: `${label} (built-in)` },
      { label: '🎨 Use in this game', onclick: () => applyPreset(p) },
      { label: '💾 Save a copy as my theme…', onclick: () => savePresetCopy(p), hint: 'Built-in themes can’t be changed: a copy in My themes can' },
      { sep: true },
      { label: '⬇ Export theme file', onclick: () => void exportTheme(label, withPreset(now(), p), false) },
      { label: '📋 Copy theme code', onclick: () => void copyCode(label, presetTheme(p)) },
    ];
  }

  function mineItems(m: MyTheme): MenuEntry[] {
    const fromIt = origin?.kind === 'mine' && origin.id === m.id;
    const same = sameLook(game.theme, withMyTheme(game.theme, m.theme, game.media));
    return [
      { heading: `★ ${m.name}` },
      { label: '🎨 Use in this game', onclick: () => use(m) },
      {
        label: fromIt ? '💾 Save changes to it…' : '💾 Overwrite with this game’s look…',
        disabled: same,
        hint: same ? 'This game already looks like it' : 'Asks first',
        onclick: () => void saveTo(m),
      },
      { label: '✏ Rename…', onclick: () => rename(m) },
      { label: '⧉ Duplicate', onclick: () => duplicate(m) },
      { sep: true },
      // (A saved theme has no pictures: the uploaded fonts it uses that this game has go in the file.)
      { label: '⬇ Export theme file', onclick: () => void exportTheme(m.name, m.theme, true, true) },
      { label: '📋 Copy theme code', onclick: () => void copyCode(m.name, m.theme) },
      { sep: true },
      { label: '🗑 Delete…', danger: true, onclick: () => void remove(m) },
    ];
  }

  // ---------- Bringing a theme in ----------

  async function importFile(): Promise<void> {
    const file = await pickFile(THEME_FILES);
    if (!file) return;
    try {
      importing = parseThemeFile(await file.text());
    } catch (e) {
      void tell(`“${file.name}” can’t be used as a theme: ${e instanceof ThemeError ? e.message : 'it can’t be read.'}`);
    }
  }

  /** A shared theme in this game: its files go in with it, in one undo step. It's a theme of its own (no source). */
  async function useShared(s: SharedTheme): Promise<void> {
    importing = null;
    const g = game;
    let stored: Awaited<ReturnType<typeof storeThemeFiles>>;
    try {
      stored = await storeThemeFiles(s);
    } catch (e) {
      return void tell(`“${s.name}” couldn’t be used: its pictures and fonts couldn’t be stored (${(e as Error).message || 'storage is full or blocked'}).`);
    }
    const { refs, ids } = stored;
    const theme = renameThemeFiles(s.theme, ids);
    const cur = $state.snapshot(g.theme) as Theme;
    // The files it brings that the theme uses (an uploaded font it doesn't use stays out).
    const add = themeFiles(theme, refs);
    const next = withShared(cur, theme, [...g.media, ...add]);
    delete next.source;
    // (A font it names that the file didn't bring: that text keeps this game's font, as with use() above.)
    const missing = missingFonts(theme, [...g.media, ...add]).length;
    const note = missing ? ` (its uploaded font${missing === 1 ? ' isn’t' : 's aren’t'} in the file: ${missing === 1 ? 'that text keeps its' : 'those keep their'} font)` : '';
    if (sameContent(next, cur) && add.every((r) => g.media.some((m) => m.id === r.id))) return void toast(`This game already looks like “${s.name}”${note}`);
    step(
      `Theme: “${s.name}”`,
      () => {
        addMedia(g, add);
        setTheme(g, next);
      },
      { notify: true, place: { tab: 'theme' } },
    );
    if (note) toast(`Used “${s.name}”${note}`);
  }

  function saveShared(s: SharedTheme): void {
    importing = null;
    const next = addMyTheme(list, freshThemeName(list, s.name), s.theme);
    if (!next) return void toast(NOT_STORED);
    list = next;
    toast(`Saved “${next[next.length - 1].name}” to My themes${s.media.length ? ' (without its pictures and fonts’ files: use it in a game to bring those in)' : ''}`);
  }

  async function fromGame(): Promise<void> {
    const other = await pickOtherGame();
    if (!other) return;
    const g = game;
    step(`Theme from “${other.title}”`, () => {
      addMedia(g, themeMedia(other));
      setTheme(g, clone(other.theme));
    }, { notify: true, place: { tab: 'theme' } });
  }
</script>

<!-- (Several top-level parts: the bar stays at the top of the settings column as it scrolls.) -->
<div class="savebar" role="group" aria-label="This game’s theme">
  <p class="now">
    <span class="muted">Now:</span>
    {#if origin?.kind === 'mine'}
      <strong><span class="tag" aria-hidden="true">★</span> {origin.name}</strong>
    {:else if origin}
      <strong>{origin.name}</strong> <span class="muted">(built-in)</span>
    {:else}
      <strong>{ownName}</strong> <span class="muted">(not in My themes)</span>
    {/if}
    {#if origin?.edited}<span class="edited">· edited</span>{/if}
  </p>
  <div class="acts">
    {#if origin?.kind === 'mine' && origin.mine}
      {@const m = origin.mine}
      <button
        class="small"
        class:primary={origin.edited}
        disabled={!origin.edited}
        onclick={() => saveTo(m)}
        title={origin.edited ? `Put this look in “${m.name}” (asks first)` : `No changes since “${m.name}” was put on`}
      >
        💾 Save changes to “{m.name}”
      </button>
    {/if}
    <button class="small" onclick={saveNew} title="Keep this look in My themes under a new name, to use in any game {here}">💾 Save as new theme…</button>
  </div>
  {#if origin?.kind === 'preset' && origin.edited}
    <p class="hint">Built-in themes stay as they are: Save as new theme… keeps this look in My themes.</p>
  {/if}
</div>

<section aria-labelledby="builtin-heading">
  <h3 id="builtin-heading">Built-in themes</h3>
  <div class="cards">
    {#each PRESET_KEYS as key}
      {@const on = origin?.kind === 'preset' && origin.id === key}
      {@const edited = on && origin!.edited}
      <div class="card" class:based={edited}>
        <button
          class="use preset"
          class:on={on && !edited}
          aria-pressed={on && !edited}
          onclick={() => applyPreset(key)}
          oncontextmenu={(e) => showMenu(e, presetItems(key))}
          onkeydown={(e) => keyMenu(e, presetItems(key))}
          title={edited ? `This game’s theme started from ${PRESETS[key].label} and was changed: a click puts ${PRESETS[key].label} back` : `Use ${PRESETS[key].label} in this game`}
        >
          <ThemeSwatch theme={presetTheme(key)} />
          <span class="nm">{PRESETS[key].label}{#if edited}&nbsp;<span class="edited">· edited</span>{/if}</span>
        </button>
        <button class="ghost tiny more" aria-label="More for {PRESETS[key].label}" title="Save a copy, export or copy its code" onclick={(e) => dropMenu(e, presetItems(key))}>⋯</button>
      </div>
    {/each}
  </div>
</section>

<section class="mine" aria-labelledby="my-themes-heading">
  <h3 id="my-themes-heading">My themes <span class="where">· {here}</span></h3>
  {#if list.length}
    <div class="cards">
      {#each list as m (m.id)}
        {@const on = origin?.kind === 'mine' && origin.id === m.id}
        <div class="card">
          <button
            class="use"
            class:on
            aria-pressed={on}
            onclick={() => use(m)}
            oncontextmenu={(e) => showMenu(e, mineItems(m))}
            onkeydown={(e) => keyMenu(e, mineItems(m))}
            title="Use “{m.name}” in this game"
          >
            <ThemeSwatch theme={m.theme} />
            <span class="nm"><span class="tag" title="Saved by you">★</span> {m.name}{#if on && origin?.edited}&nbsp;<span class="edited">· edited</span>{/if}</span>
          </button>
          <button class="ghost tiny more" aria-label="More for “{m.name}”" title="Save changes, rename, share or delete" onclick={(e) => dropMenu(e, mineItems(m))}>⋯</button>
        </div>
      {/each}
    </div>
  {:else}
    <p class="empty">
      No saved themes yet. <strong>💾 Save as new theme…</strong> keeps this game’s look here, to use in any game {here}. To bring one
      in, use <strong>📂 Import theme…</strong> (a theme file someone sent) or <strong>📂 Use a theme from another game…</strong>
      under Share below.
    </p>
  {/if}
</section>

<section class="share" aria-labelledby="share-heading">
  <h3 id="share-heading">Share</h3>
  <div class="row">
    <span class="lbl">This theme</span>
    <button class="small" onclick={() => exportTheme(shareName, now(), true)} title="A .brainrot-theme file to send: with this theme’s pictures and uploaded fonts">⬇ Export theme</button>
    <button class="small" onclick={() => copyCode(shareName, now())} title="A short code to paste in a chat: colors, fonts and layout (no pictures or uploaded fonts)">📋 Copy theme code</button>
  </div>
  <div class="row">
    <span class="lbl">Bring one in</span>
    <button class="small" onclick={importFile} title="Open a .brainrot-theme file">📂 Import theme…</button>
    <button class="small" onclick={() => (importing = 'code')} title="Paste a theme code someone sent you">⌨ Paste theme code…</button>
    <button class="small" onclick={fromGame} title="Open a .brainrot game (or its exported web page) and use its theme (with its pictures and uploaded fonts)">📂 Use a theme from another game…</button>
  </div>
  <p class="hint">A theme file carries its pictures and uploaded fonts; a code and My themes keep the colors, fonts and layout.</p>
</section>

{#if naming}
  {@const n = naming}
  <ThemeNameDialog
    title={n.title}
    value={n.value}
    ok={n.ok}
    note={n.note}
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
  /* Which theme this is, and saving it: kept in view at the top of the settings as they scroll. */
  .savebar {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    margin: 0 0 4px;
    padding: 8px 10px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  /* (Covers the settings scrolling by in the page's padding above it.) */
  .savebar::before {
    content: '';
    position: absolute;
    left: -2px;
    right: -2px;
    bottom: 100%;
    height: 17px;
    background: var(--bg);
  }
  .now {
    flex: 1 1 auto;
    min-width: 0;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .savebar .hint {
    flex-basis: 100%;
    margin: 0;
  }
  .edited {
    color: var(--warn);
    font-weight: 400;
  }
  section {
    margin-top: 14px;
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
  .use.on {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  /* The built-in theme this one started from, changed since: marked, not chosen. */
  .based .use {
    border-style: dashed;
    border-color: var(--accent);
  }
  .nm {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
    padding-right: 22px;
  }
  .tag {
    color: var(--warn);
  }
  .more {
    position: absolute;
    right: 4px;
    bottom: 6px;
  }
  .empty {
    margin: 0;
    padding: 12px;
    border: 1px dashed var(--border);
    border-radius: 8px;
    font-size: 13px;
    color: var(--muted);
  }
  .share .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
  }
  .lbl {
    width: 7.5em;
    font-size: 12px;
    color: var(--muted);
  }
  .hint {
    margin: 6px 0 0;
  }
</style>
