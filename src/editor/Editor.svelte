<script lang="ts">
  import { app, toast } from '../lib/app.svelte';
  import { newGame, newRound, playableClues, slideText } from '../lib/model';
  import { pickFile, saveGameJson } from '../lib/fileio';
  import { openGameFile, savePack } from '../lib/pack';
  import { pruneMedia } from '../lib/media.svelte';
  import SetupPanel from './SetupPanel.svelte';
  import RoundEditor from './RoundEditor.svelte';
  import FinalEditor from './FinalEditor.svelte';

  let { onplay }: { onplay: () => void } = $props();

  // 'setup' | 'final' | round index
  let tab = $state<'setup' | 'final' | number>(0);
  const game = $derived(app.game);

  function addRound(): void {
    const n = game.rounds.length;
    const prev = game.rounds[n - 1];
    const name = n === 1 ? 'Double Jeopardy!' : `Round ${n + 1}`;
    game.rounds.push(newRound(name, prev?.categories.length ?? 6, (prev?.values ?? [200, 400, 600, 800, 1000]).map((v) => v * 2)));
    tab = n;
  }

  function removeRound(i: number): void {
    if (game.rounds.length <= 1) return;
    if (!confirm(`Delete "${game.rounds[i].name}" and all its clues?`)) return;
    game.rounds.splice(i, 1);
    tab = Math.min(i, game.rounds.length - 1);
  }

  function newFile(): void {
    if (!confirm('Start a new game? Save this one first if you want to keep it.')) return;
    app.game = newGame();
    tab = 'setup';
    pruneMedia([app.game, app.playGame]);
  }

  async function open(): Promise<void> {
    const file = await pickFile('.jbr,.zip,.json,application/json,application/zip');
    if (!file) return;
    try {
      app.game = await openGameFile(file);
      tab = 0;
      toast(`Opened "${app.game.title}"`);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  let saving = $state(false);
  async function save(): Promise<void> {
    saving = true;
    try {
      const missing = await savePack($state.snapshot(game));
      if (missing.length) alert(`Saved, but these media files were missing and weren't included:\n${missing.join('\n')}`);
      else toast('Saved game pack (.jbr)');
    } catch (e) {
      alert('Save failed: ' + (e as Error).message);
    } finally {
      saving = false;
    }
  }

  const problems = $derived.by(() => {
    const out: string[] = [];
    if (game.players.length === 0) out.push('No players yet (you can also add them before starting).');
    game.rounds.forEach((r) => {
      const missingQ = playableClues(r).filter((c) => !slideText(c.questionSlide).trim()).length;
      const missingA = playableClues(r).filter((c) => !slideText(c.answerSlide).trim()).length;
      if (missingQ) out.push(`${r.name}: ${missingQ} clue(s) with no question`);
      if (missingA) out.push(`${r.name}: ${missingA} clue(s) with no answer`);
    });
    if (game.final.enabled && !slideText(game.final.questionSlide).trim()) out.push('Final Jeopardy has no question');
    return out;
  });
</script>

<div class="editor">
  <header>
    <input class="title" bind:value={game.title} aria-label="Game title" />
    <button onclick={newFile}>New</button>
    <button onclick={open}>Open…</button>
    <button onclick={save} disabled={saving} title="Download a .jbr game pack (game + all media)">{saving ? 'Saving…' : 'Save'}</button>
    <button class="ghost" onclick={() => saveGameJson($state.snapshot(game))} title="Text only, no media. Handy for hand-editing.">
      Export JSON
    </button>
    <span class="spacer"></span>
    {#if app.storageOk}
      <span class="muted autosave">Autosaved in this browser</span>
    {:else}
      <span class="autosave warn" title="This browser won't let a file opened from disk store data. Use Save often.">
        ⚠ Autosave unavailable here: use Save
      </span>
    {/if}
    <button class="primary" onclick={onplay}>▶ Play</button>
  </header>

  <div class="body">
    <nav>
      <button class:active={tab === 'setup'} onclick={() => (tab = 'setup')}>⚙ Setup & Players</button>
      <div class="navlabel muted">Rounds</div>
      {#each game.rounds as round, i (round.id)}
        <button class:active={tab === i} onclick={() => (tab = i)}>{round.name || `Round ${i + 1}`}</button>
      {/each}
      <button class="ghost" onclick={addRound}>＋ Add round</button>
      <div class="navlabel muted">End</div>
      <button class:active={tab === 'final'} onclick={() => (tab = 'final')}>
        Final Jeopardy {game.final.enabled ? '' : '(off)'}
      </button>

      {#if problems.length}
        <div class="problems">
          <div class="navlabel">Checklist</div>
          {#each problems as p}
            <div class="problem">• {p}</div>
          {/each}
        </div>
      {/if}
    </nav>

    <main>
      {#if tab === 'setup'}
        <SetupPanel />
      {:else if tab === 'final'}
        <FinalEditor />
      {:else if game.rounds[tab]}
        {#key game.rounds[tab].id}
          <RoundEditor round={game.rounds[tab]} canDelete={game.rounds.length > 1} ondelete={() => removeRound(tab as number)} />
        {/key}
      {/if}
    </main>
  </div>
</div>

<style>
  .editor {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  header {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 10px 16px;
    background: var(--panel);
    border-bottom: 1px solid var(--border);
  }
  .title {
    font-size: 18px;
    font-weight: 600;
    width: min(420px, 40vw);
  }
  .autosave {
    font-size: 12px;
  }
  .warn {
    color: var(--warn);
  }
  .body {
    flex: 1;
    display: flex;
    min-height: 0;
  }
  nav {
    width: 220px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px;
    border-right: 1px solid var(--border);
    background: var(--panel);
    overflow-y: auto;
  }
  nav > button {
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  nav > button.active {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .navlabel {
    margin-top: 12px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .problems {
    margin-top: 8px;
    font-size: 12px;
    color: var(--warn);
  }
  .problem {
    margin-top: 4px;
  }
  main {
    flex: 1;
    overflow: auto;
    padding: 16px 20px;
    min-width: 0;
  }
  @media (max-width: 700px) {
    .body {
      flex-direction: column;
    }
    nav {
      width: auto;
      flex-direction: row;
      flex-wrap: wrap;
      border-right: none;
      border-bottom: 1px solid var(--border);
    }
    .navlabel,
    .problems,
    .autosave {
      display: none;
    }
  }
</style>
