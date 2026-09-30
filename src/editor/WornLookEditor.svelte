<!--
  How a wearable item looks on the avatar: its picture (uploaded, or drawn right on an avatar) and where it sits.
  The preview shows it on a player's avatar; drag it there, or use the sliders.
-->
<script lang="ts">
  import { editedGame } from '../lib/app.svelte';
  import { mediaUrls } from '../lib/media.svelte';
  import { addMediaFile } from '../lib/media.svelte';
  import { SLIDE_H, SLIDE_W, type ItemDef, type Wearable } from '../lib/model';
  import { SLOT_PLACE, wornPlace } from '../lib/toolset';
  import AvatarToken from '../lib/rpg/AvatarToken.svelte';
  import Stage from '../lib/Stage.svelte';
  import DrawPad from './slide/DrawPad.svelte';
  import MediaPicker from './slide/MediaPicker.svelte';

  let { item }: { item: ItemDef & { wearable: Wearable } } = $props();
  const game = $derived(editedGame());
  const w = $derived(item.wearable);
  const place = $derived(wornPlace(w));
  /** Whose avatar the preview uses. */
  let who = $state(0);
  const sample = $derived(game.players[who] ?? game.players[0] ?? { name: 'Player', color: '#4363d8' });
  let picking = $state(false);
  let drawing = $state(false);

  // The avatar is small in its box, so items placed well above or beside it (up to 1.2 avatars away) still show.
  const PREVIEW = 150;
  /** The drawpad draws on an avatar this big, in the middle of the pad. */
  const PAD_AVATAR = 480;

  let drag: { sx: number; sy: number; x: number; y: number } | null = null;
  function down(e: PointerEvent): void {
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Synthetic pointers can't be captured.
    }
    drag = { sx: e.clientX, sy: e.clientY, x: place.x, y: place.y };
  }
  function move(e: PointerEvent): void {
    if (!drag) return;
    w.x = round(drag.x + (e.clientX - drag.sx) / PREVIEW);
    w.y = round(drag.y + (e.clientY - drag.sy) / PREVIEW);
  }
  const round = (n: number) => Math.round(n * 100) / 100;

  function reset(): void {
    w.x = w.y = w.w = w.rotate = undefined;
    w.behind = undefined;
  }

  /** A drawing made on the big avatar: its picture, placed where it was drawn. */
  async function insertDrawing(png: Blob, box: { x: number; y: number; w: number; h: number }): Promise<void> {
    drawing = false;
    const ref = await addMediaFile(game, png, `${item.name || 'item'}.png`);
    w.image = ref.id;
    w.x = round((box.x + box.w / 2 - SLIDE_W / 2) / PAD_AVATAR);
    w.y = round((box.y + box.h / 2 - SLIDE_H / 2) / PAD_AVATAR);
    w.w = round(box.w / PAD_AVATAR);
    w.rotate = undefined;
    item.icon ??= ref.id;
  }
</script>

<div class="worn">
  <div
    class="preview"
    role="application"
    aria-label="Preview: drag to move the item on the avatar"
    onpointerdown={down}
    onpointermove={move}
    onpointerup={() => (drag = null)}
  >
    <AvatarToken player={sample} size={PREVIEW} worn={[item]} name={false} />
  </div>
  <div class="controls">
    <div class="row">
      <div class="pop">
        <button class="small" onclick={() => (picking = !picking)}>
          {#if w.image && mediaUrls[w.image]}<img class="thumb" src={mediaUrls[w.image]} alt="" />{/if} 🖼 Picture…
        </button>
        {#if picking}<MediaPicker kind="image" onpick={(id) => ((w.image = id), (picking = false))} onclose={() => (picking = false)} />{/if}
      </div>
      <button class="small" onclick={() => (drawing = true)} title="Draw it right on an avatar: it goes where you draw it">🖌 Draw it…</button>
      {#if w.image}<button class="ghost small" onclick={() => (w.image = undefined)} title="Use the item's icon instead">Use the icon</button>{/if}
      {#if game.players.length > 1}
        <label class="small">
          On
          <select bind:value={who} aria-label="Preview on">
            {#each game.players as p, i (p.id)}<option value={i}>{p.name}</option>{/each}
          </select>
        </label>
      {/if}
    </div>
    <label class="slider">Left ↔ right<input type="range" min="-1.2" max="1.2" step="0.01" value={place.x} oninput={(e) => (w.x = +e.currentTarget.value)} aria-label="Left or right" /></label>
    <label class="slider">Up ↕ down<input type="range" min="-1.2" max="1.2" step="0.01" value={place.y} oninput={(e) => (w.y = +e.currentTarget.value)} aria-label="Up or down" /></label>
    <label class="slider">Size<input type="range" min="0.1" max="2.5" step="0.01" value={place.w} oninput={(e) => (w.w = +e.currentTarget.value)} aria-label="Size" /></label>
    <label class="slider">Turn<input type="range" min="-180" max="180" step="1" value={place.rotate} oninput={(e) => (w.rotate = +e.currentTarget.value)} aria-label="Turn" /></label>
    <div class="row">
      <label class="check small"><input type="checkbox" checked={place.behind} onchange={(e) => (w.behind = e.currentTarget.checked || undefined)} /> Behind the avatar (a cape, wings)</label>
      <button class="ghost small" onclick={reset} title="Back to where {w.slot} items go">Reset position</button>
    </div>
  </div>
</div>

{#if drawing}
  <DrawPad title="Draw {item.name || 'the item'} on the avatar" oninsert={insertDrawing} oncancel={() => (drawing = false)}>
    {#snippet backdrop()}
      <Stage background="transparent">
        <div class="pad-avatar" style:left="{SLIDE_W / 2}px" style:top="{SLIDE_H / 2}px">
          <AvatarToken player={sample} size={PAD_AVATAR} worn={[]} name={false} />
        </div>
        <div class="pad-hint" style:left="{SLIDE_W / 2 + SLOT_PLACE[w.slot].x * PAD_AVATAR}px" style:top="{SLIDE_H / 2 + SLOT_PLACE[w.slot].y * PAD_AVATAR}px"></div>
      </Stage>
    {/snippet}
  </DrawPad>
{/if}

<style>
  .worn {
    display: flex;
    gap: 16px;
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .preview {
    width: 380px;
    height: 380px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    background: repeating-conic-gradient(#3a3a3a 0% 25%, #2c2c2c 0% 50%) 0 0 / 20px 20px;
    cursor: move;
    touch-action: none;
    overflow: hidden;
  }
  .controls {
    flex: 1;
    min-width: 240px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .row {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }
  .slider {
    display: grid;
    grid-template-columns: 110px 1fr;
    align-items: center;
    font-size: 12px;
  }
  .pop {
    position: relative;
  }
  .thumb {
    width: 18px;
    height: 18px;
    object-fit: contain;
    vertical-align: middle;
  }
  .pad-avatar {
    position: absolute;
    transform: translate(-50%, -50%);
  }
  /* Where items of this slot usually go. */
  .pad-hint {
    position: absolute;
    width: 60px;
    height: 60px;
    margin: -30px 0 0 -30px;
    border: 4px dashed #ffcc00;
    border-radius: 50%;
  }
  .small {
    font-size: 12px;
  }
</style>
