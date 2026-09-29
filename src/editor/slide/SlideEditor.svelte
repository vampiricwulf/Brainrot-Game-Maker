<!-- Freeform 16:9 slide editor (spec §5.3): toolbar, canvas with handles, and an inspector. -->
<script module lang="ts">
  import { freeOffset, isMediaLink, SnapshotHistory } from '../../lib/editing';
  import type { Slide } from '../../lib/model';

  // The Final tab shows two slide editors at once. Only the one the user last clicked or focused
  // handles keyboard shortcuts, copy and paste (and becoming active clears the other's selection),
  // so a shortcut never reaches a slide that's out of sight. None does while an image editor is open.
  interface Instance {
    clear(): void;
  }
  const instances = new Set<Instance>();
  let active: Instance | null = null;
  let imageEditors = 0;
  // An editor went away. The next one to mount takes over: it's the same editor remounted by a
  // Question/Answer tab switch (tabs sit outside the editor, so clicking one doesn't activate it).
  let vacated = false;

  // Undo history per slide, so it survives Question/Answer switches, Prev/Next and reopening a clue.
  // Keyed by the slide itself: opening another game starts fresh histories.
  const histories = new WeakMap<Slide, SnapshotHistory>();
  function historyFor(slide: Slide): SnapshotHistory {
    const now = JSON.stringify(slide);
    const h = histories.get(slide);
    if (!h) {
      const fresh = new SnapshotHistory(now);
      histories.set(slide, fresh);
      return fresh;
    }
    // Changed while no editor showed it (e.g. the clue's quick text fields): that's one undo step.
    h.commit(now);
    return h;
  }

  /**
   * Start a slide's undo history before any editor shows it (the clue editor calls this for both
   * slides when a clue opens), so a quick-field edit to the hidden slide can be undone there later.
   */
  export function trackSlide(slide: Slide): void {
    historyFor(slide);
  }

  /** Custom clipboard type marking our own copies (the text/plain part is readable anywhere). */
  const CLIP_TYPE = 'application/x-jeopardy-slide-items';
</script>

<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { app, toast } from '../../lib/app.svelte';
  import type { FitResult } from '../../lib/autofit';
  import { clipboard } from '../../lib/clipboard.svelte';
  import { addMediaFile, canPlay, mediaUrls } from '../../lib/media.svelte';
  import { classifyUrl, youtubeId, youtubeStart } from '../../lib/mediactl.svelte';
  import { registerGameFonts, uploadedFamily } from '../../lib/fonts';
  import { clone, restyle } from '../../lib/ops';
  import { restack, type Restack } from '../../lib/layers';
  import {
    newAudioEl, newEmbedEl, newId, newImageEl, newShapeEl, newTextEl, newVideoEl, SLIDE_H, SLIDE_W,
    type ImageEl, type MediaKind, type ShapeType, type SlideElement, type TextEl,
  } from '../../lib/model';
  import Stage from '../../lib/Stage.svelte';
  import SlideView from '../../lib/slide/SlideView.svelte';
  import EditLayer from './EditLayer.svelte';
  import Inspector from './Inspector.svelte';
  import MediaPicker from './MediaPicker.svelte';
  import ImageEditor from './ImageEditor.svelte';
  import LayersPanel from './LayersPanel.svelte';
  import LayerMenu from './LayerMenu.svelte';
  import { lockedNote, type LayerAction } from './layerlabel';
  import { themeStyle } from '../../lib/theme';

  let {
    slide,
    styletargets,
    placeholder,
    badge,
    fill = false,
  }: {
    slide: Slide;
    /** The main text elements "Use this style elsewhere" restyles for a scope (the host knows the round). */
    styletargets?: (el: TextEl, scope: string) => TextEl[];
    /** Shown in the slide's main text box while it's empty. */
    placeholder?: string;
    /** A ribbon in the canvas corner, e.g. "ANSWER". */
    badge?: string;
    /** Fill the parent's height and fit the canvas to both width and height (the clue editor). */
    fill?: boolean;
  } = $props();
  let editingImage = $state<string | null>(null);
  const imageEl = $derived(slide.elements.find((e) => e.id === editingImage && e.kind === 'image') as ImageEl | undefined);

  const game = $derived(app.game);
  let selected = $state<string[]>([]);
  let picker = $state<MediaKind | null>(null);
  let replacing = $state<string | null>(null);
  let shapeMenu = $state(false);
  let previewKey = $state(0);
  let previewing = $state(false);
  let previewMuted = $state(false);
  let textArea = $state<HTMLTextAreaElement>();
  let canvasEl = $state<HTMLDivElement>();
  /** Fitted font size of each text element, as drawn on the canvas. */
  let fits = $state<Record<string, FitResult>>({});
  // Layers: items hidden while editing (editor-only, never saved or undone), the item under the
  // mouse, and the right-click menu.
  let hidden = $state<string[]>([]);
  let hovered = $state<string | null>(null);
  let menu = $state<{ x: number; y: number; stack: SlideElement[] } | null>(null);
  const editView = $derived(hidden.length ? { ...slide, elements: slide.elements.filter((e) => !hidden.includes(e.id)) } : slide);

  const single = $derived(selected.length === 1 ? slide.elements.find((e) => e.id === selected[0]) : undefined);
  const topZ = () => Math.max(0, ...slide.elements.map((e) => e.zIndex)) + 1;

  // ---------- Which editor takes the keyboard ----------
  const me: Instance = { clear: () => (selected = []) };
  function activate(): void {
    if (active === me) return;
    active = me;
    for (const i of instances) if (i !== me) i.clear();
  }
  function inCharge(): boolean {
    return imageEditors === 0 && (active === me || (!active && instances.size === 1));
  }
  onMount(() => {
    instances.add(me);
    if (!active || vacated) activate();
    vacated = false;
    registerGameFonts(game);
    return () => {
      instances.delete(me);
      if (active === me) active = null;
      vacated = true;
    };
  });
  $effect(() => {
    if (!imageEl) return;
    imageEditors++;
    return () => imageEditors--;
  });

  // ---------- Undo history (Ctrl+Z / Ctrl+Y inside the slide editor) ----------
  // Typing and sliders are grouped into one step after a pause; discrete actions (add, delete,
  // paste, a finished drag…) are recorded at once, and undo/redo record anything pending first.
  const hist = untrack(() => historyFor(slide));
  let hv = $state(0);
  let pending = $state(false);
  let dragging = false;
  $effect(() => {
    const now = JSON.stringify(slide);
    pending = now !== hist.last;
    if (!pending) return;
    const t = setTimeout(() => !dragging && commit(), 400);
    return () => clearTimeout(t);
  });
  const canUndo = $derived(hv >= 0 && (pending || hist.undoStack.length > 0));
  const canRedo = $derived(hv >= 0 && !pending && hist.redoStack.length > 0);

  function commit(): void {
    if (hist.commit(JSON.stringify(slide))) hv++;
    pending = false;
  }
  /** Record a discrete edit as its own undo step. */
  function edit(fn: () => void): void {
    commit();
    fn();
    commit();
  }
  function restore(s: string | null): void {
    hv++;
    if (s === null) return;
    const d = JSON.parse(s) as Slide;
    slide.background = d.background;
    slide.elements = d.elements;
    pending = false;
    selected = selected.filter((id) => d.elements.some((e) => e.id === id));
  }
  const undo = () => restore(hist.undo(JSON.stringify(slide)));
  const redo = () => restore(hist.redo(JSON.stringify(slide)));

  // A short note on the canvas, optionally with an Undo button ("Deleted text box · Undo"). It goes
  // away after a few seconds or as soon as the slide changes again, so its Undo always means that step.
  let notice = $state<{ text: string; undo?: () => void; at: number } | null>(null);
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  function tell(text: string, undoFn?: () => void): void {
    notice = { text, undo: undoFn, at: hv };
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => (notice = null), 6000);
  }

  const NAMES: Record<SlideElement['kind'], string> = { text: 'text box', image: 'image', video: 'video', audio: 'audio clip', shape: 'shape', embed: 'link' };
  const describe = (els: SlideElement[]) => (els.length === 1 ? NAMES[els[0].kind] : `${els.length} items`);

  // ---------- Adding elements ----------
  function add(el: SlideElement, at?: { x: number; y: number }): void {
    edit(() => {
      el.zIndex = topZ();
      if (at) {
        el.x = Math.round(at.x - el.w / 2);
        el.y = Math.round(at.y - el.h / 2);
      }
      slide.elements.push(el);
      selected = [el.id];
    });
  }

  function addText(): void {
    let t: TextEl;
    if (!slide.elements.some((e) => e.kind === 'text')) {
      // No main text any more (it was deleted): bring it back full-slide and shrink-to-fit.
      t = newTextEl('');
    } else {
      t = newTextEl('New text', { x: 460, y: 390, w: 1000, h: 300 });
      t.size = 90;
      const k = freeOffset([t], slide.elements, 40);
      t.x += k * 40;
      t.y += k * 40;
    }
    add(t);
    focusText(true);
  }

  /** Put the cursor in the Inspector's text field (after the canvas selection has rendered it). */
  function focusText(selectAll: boolean): void {
    tick().then(() => {
      if (!textArea) return;
      textArea.focus();
      if (selectAll) textArea.select();
      else textArea.setSelectionRange(textArea.value.length, textArea.value.length);
    });
  }

  function imageSize(id: string): Promise<{ w: number; h: number }> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1100 / img.naturalWidth, 700 / img.naturalHeight, 1.5);
        resolve({ w: Math.round(img.naturalWidth * s) || 960, h: Math.round(img.naturalHeight * s) || 540 });
      };
      img.onerror = () => resolve({ w: 960, h: 540 });
      img.src = mediaUrls[id];
    });
  }

  async function addMedia(kind: MediaKind, id: string, at?: { x: number; y: number }): Promise<void> {
    if (kind === 'image') {
      const { w, h } = await imageSize(id);
      add(newImageEl(id, w, h), at);
    } else if (kind === 'video') add(newVideoEl(id), at);
    else if (kind === 'audio') add(newAudioEl(id), at);
    else if (kind === 'font') {
      await registerGameFonts(game);
      if (single?.kind === 'text') single.font = `'${uploadedFamily(id)}', sans-serif`;
      toast('Font added: pick it from the Font list');
    }
  }

  async function picked(id: string): Promise<void> {
    const kind = picker!;
    picker = null;
    if (replacing) {
      const el = slide.elements.find((e) => e.id === replacing);
      replacing = null;
      if (el && (el.kind === 'image' || el.kind === 'video' || el.kind === 'audio'))
        edit(() => {
          el.media = id;
          if (el.kind === 'image') {
            el.editedMedia = undefined;
            el.edits = undefined;
          }
        });
      return;
    }
    await addMedia(kind, id);
  }

  function addShape(shape: ShapeType): void {
    shapeMenu = false;
    add(newShapeEl(shape));
  }

  /** Add a YouTube or direct media link as an online media element. */
  function addLinkEl(url: string, at?: { x: number; y: number }): boolean {
    const kind = classifyUrl(url);
    if (!kind) return false;
    const el = newEmbedEl(url.trim(), kind);
    if (kind === 'youtube') el.startAt = youtubeStart(url);
    add(el, at);
    return true;
  }

  function addLink(): void {
    const url = prompt('Paste a YouTube link or a direct link to an image, video or audio file.\n\nThis will need internet during the game.');
    if (!url?.trim()) return;
    if (!addLinkEl(url)) toast("That doesn't look like a link");
  }

  /** Pasted or dropped text: a media link becomes online media; other text fills the empty main text box or a new one. */
  function addTextContent(text: string, at?: { x: number; y: number }): void {
    if (isMediaLink(text, (u) => !!youtubeId(u)) && addLinkEl(text, at)) return;
    const main = slide.elements.find((e): e is TextEl => e.kind === 'text');
    if (main && !main.text.trim()) {
      edit(() => (main.text = text));
      selected = [main.id];
      return;
    }
    const t = newTextEl(text, { x: 460, y: 390, w: 1000, h: 300 });
    t.size = 90;
    const k = freeOffset([t], slide.elements, 40);
    t.x += k * 40;
    t.y += k * 40;
    add(t, at);
  }

  async function dropFiles(files: FileList, at: { x: number; y: number }): Promise<void> {
    for (const file of Array.from(files)) {
      try {
        const ref = await addMediaFile(game, file);
        if ((ref.kind === 'video' || ref.kind === 'audio') && !canPlay(ref.mime))
          toast(`⚠ This browser may not play "${ref.name}". MP4 (H.264) / MP3 are safest.`, 7000);
        await addMedia(ref.kind, ref.id, at);
      } catch (e) {
        toast((e as Error).message, 5000);
      }
    }
  }

  function ondrop(e: DragEvent): void {
    e.preventDefault();
    const dt = e.dataTransfer;
    if (!dt || !canvasEl || previewing) return;
    activate();
    const stageEl = canvasEl.querySelector('.stage') as HTMLElement;
    const r = stageEl.getBoundingClientRect();
    const at = { x: ((e.clientX - r.left) / r.width) * SLIDE_W, y: ((e.clientY - r.top) / r.height) * SLIDE_H };
    if (dt.files.length) return void dropFiles(dt.files, at);
    // A link or an image dragged from another browser tab, or some selected text.
    const uri = dt.getData('text/uri-list').split(/\r?\n/).find((l) => l.trim() && !l.startsWith('#'));
    const text = (uri ?? dt.getData('text/plain')).trim();
    if (text) addTextContent(text, at);
  }

  // ---------- Selection actions ----------
  /** The selected items that can change, and how many selected ones are locked (left alone). */
  function selection(): { free: SlideElement[]; locked: number } {
    const all = slide.elements.filter((e) => selected.includes(e.id));
    const free = all.filter((e) => !e.locked);
    return { free, locked: all.length - free.length };
  }

  /** Delete the selected items, keeping locked ones. `verb` names it in the notice ("Cut image · Undo"). */
  function remove(verb = 'Deleted'): void {
    const { free: gone, locked } = selection();
    if (!gone.length) {
      if (locked) tell(lockedNote(locked));
      return;
    }
    const ids = new Set(gone.map((e) => e.id));
    edit(() => {
      slide.elements = slide.elements.filter((e) => !ids.has(e.id));
      selected = selected.filter((id) => !ids.has(id));
    });
    tell(`${verb} ${describe(gone)}${locked ? ` · ${lockedNote(locked)}` : ''}`, undo);
  }

  function duplicate(): void {
    edit(() => {
      const copies = slide.elements.filter((e) => selected.includes(e.id)).map((e) => ({ ...clone(e), id: newId(), x: e.x + 30, y: e.y + 30 }));
      for (const c of copies) c.zIndex = topZ();
      slide.elements.push(...copies);
      selected = copies.map((c) => c.id);
    });
  }

  /** Restack the selection (Inspector, right-click menu, Ctrl+] / Ctrl+[) as one undo step. */
  function restackSelected(dir: Restack): void {
    edit(() => restack(slide.elements, selected, dir));
  }

  function order(dir: 'front' | 'back' | 'up' | 'down'): void {
    restackSelected(dir === 'up' ? 'forward' : dir === 'down' ? 'backward' : dir);
  }

  function menuAction(a: LayerAction): void {
    if (a === 'front' || a === 'forward' || a === 'backward' || a === 'back') restackSelected(a);
    else if (a === 'duplicate') duplicate();
    else if (a === 'lock' || a === 'unlock')
      edit(() => {
        for (const e of slide.elements) if (selected.includes(e.id)) e.locked = a === 'lock' || undefined;
      });
    else if (a === 'hide') {
      // Editor-only (not part of the slide), so it's never an undo step.
      hidden = [...hidden, ...selected];
      selected = [];
    } else if (a === 'delete') remove();
  }

  /** Tab / Shift+Tab: select the next item down (or up) the stack. */
  function cycle(dir: 1 | -1): void {
    const list = slide.elements.filter((e) => !hidden.includes(e.id)).sort((a, b) => b.zIndex - a.zIndex);
    if (!list.length) return;
    const i = selected.length ? list.findIndex((e) => e.id === selected[selected.length - 1]) : -1;
    selected = [list[(i + dir + list.length) % list.length].id];
  }

  function align(how: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'): void {
    const { free, locked } = selection();
    edit(() => {
      for (const e of free) {
        if (how === 'left') e.x = 0;
        if (how === 'hcenter') e.x = Math.round((SLIDE_W - e.w) / 2);
        if (how === 'right') e.x = SLIDE_W - e.w;
        if (how === 'top') e.y = 0;
        if (how === 'vcenter') e.y = Math.round((SLIDE_H - e.h) / 2);
        if (how === 'bottom') e.y = SLIDE_H - e.h;
      }
    });
    if (locked) tell(lockedNote(locked));
  }

  function applyStyle(el: TextEl, scope: string): void {
    const targets = styletargets?.(el, scope) ?? [];
    if (!targets.length) return void tell('There are no other slides in that group yet.');
    if (!confirm(`Restyle the main text on ${targets.length} slide${targets.length === 1 ? '' : 's'}? The words stay the same.`)) return;
    const undoStyle = restyle(el, targets);
    commit(); // this slide's main text may be one of the targets
    tell(`Style applied to ${targets.length} slide${targets.length === 1 ? '' : 's'}`, () => {
      undoStyle();
      tell('Style change undone');
    });
  }

  function copySlide(): void {
    clipboard.slide = clone(slide);
    toast('Slide copied');
  }

  function pasteSlide(): void {
    if (!clipboard.slide || !confirm('Replace everything on this slide with the copied slide?')) return;
    const s = clone(clipboard.slide);
    for (const e of s.elements) e.id = newId();
    edit(() => {
      slide.background = s.background;
      slide.elements = s.elements;
      selected = [];
    });
  }

  function typing(e: Event): boolean {
    return !!(e.target as HTMLElement)?.closest?.('input, textarea, select, [contenteditable]');
  }
  /** Focus is on a button or link, where Enter and Space belong to that control. */
  function onControl(e: Event): boolean {
    return !!(e.target as HTMLElement)?.closest?.('button, a[href], summary');
  }

  function togglePreview(): void {
    previewing = !previewing;
    if (previewing) {
      commit();
      selected = [];
      shapeMenu = false;
      picker = null;
      previewKey++;
    }
  }

  function onkey(e: KeyboardEvent): void {
    if (!inCharge() || typing(e) || picker || menu) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (previewing) {
      // Preview is look-only: Esc goes back to editing, nothing else edits the (hidden) selection.
      if (k === 'escape') {
        e.stopImmediatePropagation();
        togglePreview();
      }
      return;
    }
    const texts = slide.elements.filter((x): x is TextEl => x.kind === 'text' && selected.includes(x.id));
    const onCanvas = document.activeElement === document.body || !!canvasEl?.contains(document.activeElement);
    if (k === 'tab' && !mod && !e.altKey && onCanvas && slide.elements.length) {
      e.preventDefault();
      cycle(e.shiftKey ? -1 : 1);
    } else if (mod && (e.code === 'BracketRight' || e.code === 'BracketLeft') && selected.length) {
      e.preventDefault();
      const up = e.code === 'BracketRight';
      restackSelected(e.shiftKey ? (up ? 'front' : 'back') : up ? 'forward' : 'backward');
    } else if (mod && k === 'z') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.shiftKey) redo();
      else undo();
    } else if (mod && k === 'y') {
      e.preventDefault();
      redo();
    } else if (mod && k === 'd' && selected.length) {
      e.preventDefault();
      duplicate();
    } else if (mod && k === 'a') {
      e.preventDefault();
      selected = slide.elements.filter((x) => !x.locked && !hidden.includes(x.id)).map((x) => x.id);
    } else if (mod && !e.shiftKey && !e.altKey && (k === 'b' || k === 'i' || k === 'u') && texts.length) {
      // Bold / italic / underline for the selected text boxes (all on unless all already are).
      e.preventDefault();
      edit(() => {
        if (k === 'b') {
          const on = !texts.every((t) => t.weight >= 700);
          for (const t of texts) t.weight = on ? 700 : 400;
        } else {
          const key = k === 'i' ? 'italic' : 'underline';
          const on = !texts.every((t) => t[key]);
          for (const t of texts) t[key] = on;
        }
      });
    } else if (single?.kind === 'text' && !mod && !e.altKey && !onControl(e) && (e.key.length === 1 || k === 'enter' || k === 'f2')) {
      // Type to edit: the keystroke goes into the text box's text field (Enter/F2 just open it).
      e.preventDefault();
      if (e.key.length === 1) single.text += e.key;
      focusText(false);
    } else if ((k === 'delete' || k === 'backspace') && selected.length) {
      e.preventDefault();
      remove();
    } else if (k === 'escape' && selected.length) {
      e.stopImmediatePropagation();
      selected = [];
    } else if (k.startsWith('arrow') && selected.length && !e.altKey && !(e.target as HTMLElement)?.closest?.('[role="list"]')) {
      // Nudge (arrows in the Layers list move through the list instead). Locked items stay put; the
      // notice shows only when nothing can move, as a nudge is recorded after a pause, which hides it.
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const { free, locked } = selection();
      if (!free.length) tell(lockedNote(locked));
      for (const el of free) {
        if (k === 'arrowleft') el.x -= step;
        if (k === 'arrowright') el.x += step;
        if (k === 'arrowup') el.y -= step;
        if (k === 'arrowdown') el.y += step;
      }
    }
  }

  // ---------- Clipboard ----------
  /** Copy items (the selection by default) to the in-app clipboard, and mark the system clipboard as ours. */
  function copyItems(data: DataTransfer | null, from = slide.elements.filter((x) => selected.includes(x.id))): number {
    const items = clone(from);
    const words = items.flatMap((x) => (x.kind === 'text' && x.text.trim() ? [x.text] : [])).join('\n');
    clipboard.elements = items;
    clipboard.token = newId();
    clipboard.text = words || `${items.length} slide item${items.length === 1 ? '' : 's'}`;
    data?.setData('text/plain', clipboard.text);
    data?.setData(CLIP_TYPE, clipboard.token);
    return items.length;
  }

  function oncopy(e: ClipboardEvent): void {
    if (!inCharge() || typing(e) || previewing || !selected.length) return;
    e.preventDefault();
    toast(`Copied ${copyItems(e.clipboardData)} item(s)`);
  }

  function oncut(e: ClipboardEvent): void {
    if (!inCharge() || typing(e) || previewing || !selected.length) return;
    e.preventDefault();
    // Locked items stay where they are, so they aren't copied either (a paste would duplicate them).
    const { free, locked } = selection();
    if (!free.length) return void tell(lockedNote(locked));
    copyItems(e.clipboardData, free);
    remove('Cut');
  }

  function pasteItems(): void {
    const copies = clipboard.elements.map((x) => ({ ...clone(x), id: newId() }));
    // Copies that would land exactly on an existing item (pasting onto the same slide) shift down-right.
    const k = freeOffset(copies, slide.elements);
    const z = topZ();
    copies.forEach((c, i) => {
      c.x += k * 30;
      c.y += k * 30;
      c.zIndex = z + i;
    });
    edit(() => {
      slide.elements.push(...copies);
      selected = copies.map((c) => c.id);
    });
  }

  function onpaste(e: ClipboardEvent): void {
    if (!inCharge() || typing(e) || previewing) return;
    const data = e.clipboardData;
    const files = data?.files;
    if (files?.length) {
      e.preventDefault();
      dropFiles(files, { x: SLIDE_W / 2, y: SLIDE_H / 2 });
      return;
    }
    const text = data?.getData('text/plain') ?? '';
    const token = data?.getData(CLIP_TYPE) ?? '';
    // Our own items, unless something newer (a link, some text) was copied since.
    if (clipboard.elements.length && (token ? token === clipboard.token : text === clipboard.text)) {
      e.preventDefault();
      pasteItems();
    } else if (text.trim()) {
      e.preventDefault();
      addTextContent(text.trim());
    }
  }
</script>

<svelte:window onkeydowncapture={(e) => !editingImage && onkey(e)} {oncopy} {oncut} {onpaste} />

{#if imageEl}
  <ImageEditor el={imageEl} onclose={() => (editingImage = null)} />
{/if}
{#if menu}
  <LayerMenu
    {...menu}
    selected={slide.elements.filter((e) => selected.includes(e.id))}
    {game}
    bind:hovered
    onpick={(id) => (selected = [id])}
    onaction={menuAction}
    onclose={() => (menu = null)}
  />
{/if}

<div class="se" class:fill onpointerdowncapture={activate} onfocusin={activate}>
  <div class="toolbar">
    <!-- Preview is look-only: everything that edits the slide is off until it stops. -->
    <fieldset class="tools" disabled={previewing}>
      <button onclick={addText} title="Add a text box">🅣 Text</button>
      <div class="pop">
        <button onclick={() => (picker = 'image')}>🖼 Image</button>
        {#if picker === 'image' && !replacing}<MediaPicker kind="image" onpick={picked} onclose={() => (picker = null)} />{/if}
      </div>
      <div class="pop">
        <button onclick={() => (picker = 'video')}>🎬 Video</button>
        {#if picker === 'video' && !replacing}<MediaPicker kind="video" onpick={picked} onclose={() => (picker = null)} />{/if}
      </div>
      <div class="pop">
        <button onclick={() => (picker = 'audio')}>🔊 Audio</button>
        {#if picker === 'audio' && !replacing}<MediaPicker kind="audio" onpick={picked} onclose={() => (picker = null)} />{/if}
      </div>
      <div class="pop">
        <button onclick={() => (shapeMenu = !shapeMenu)}>◼ Shape ▾</button>
        {#if shapeMenu}
          <div class="menu">
            <button onclick={() => addShape('rect')}>▭ Rectangle</button>
            <button onclick={() => addShape('ellipse')}>◯ Ellipse</button>
            <button onclick={() => addShape('line')}>― Line</button>
            <button onclick={() => addShape('arrow')}>➝ Arrow</button>
          </div>
        {/if}
      </div>
      <button onclick={addLink} title="YouTube or a link to online media (needs internet)">🌐 Link</button>
      <span class="sep"></span>
      <label class="bg" title="Slide background color">
        BG
        <input
          type="color"
          aria-label="Slide background color"
          value={slide.background.color ?? '#060ce9'}
          oninput={(e) => (slide.background.color = e.currentTarget.value)}
        />
      </label>
      <div class="pop">
        <button onclick={() => (picker = 'image', (replacing = 'bg'))} title="Background image">🖼 BG</button>
        {#if picker === 'image' && replacing === 'bg'}
          <MediaPicker
            kind="image"
            onpick={(id) => {
              edit(() => (slide.background.image = id));
              picker = null;
              replacing = null;
            }}
            onclose={() => ((picker = null), (replacing = null))}
          />
        {/if}
      </div>
      {#if slide.background.image || slide.background.color}
        <button class="ghost small" onclick={() => edit(() => (slide.background = {}))} title="Reset background">✕ BG</button>
      {/if}
    </fieldset>
    <span class="spacer"></span>
    <button class="ghost small" onclick={copySlide}>Copy slide</button>
    <button class="ghost small" onclick={pasteSlide} disabled={previewing || !clipboard.slide}>Paste slide</button>
    <button class="small" class:primary={previewing} onclick={togglePreview} title={previewing ? 'Back to editing (Esc)' : 'Play entrance animations and media'}>
      {previewing ? '■ Stop preview' : '▶ Preview'}
    </button>
    {#if previewing}
      <button class="ghost small" onclick={() => previewKey++} title="Play the animations again">↻ Replay</button>
    {/if}
    <button
      class="ghost small"
      onclick={() => ((previewMuted = !previewMuted), previewing && previewKey++)}
      aria-pressed={previewMuted}
      aria-label={previewMuted ? 'Preview sound is off' : 'Preview sound is on'}
      title={previewMuted ? 'Preview plays muted (click for sound)' : 'Preview plays sound (click to mute)'}
    >{previewMuted ? '🔇' : '🔈'}</button>
    <button class="ghost small" onclick={undo} disabled={previewing || !canUndo} aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)">↶</button>
    <button class="ghost small" onclick={redo} disabled={previewing || !canRedo} aria-label="Redo (Ctrl+Y)" title="Redo (Ctrl+Y)">↷</button>
  </div>

  <div class="body">
    <div class="cell">
      <!-- The padding is a pasteboard, so handles on items at the slide's edges stay visible and grabbable.
           A click on it stops a preview (from the keyboard: Esc, or ■ Stop preview in the toolbar). -->
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
      <div
        class="canvas"
        class:previewing
        style={themeStyle(game.theme)}
        bind:this={canvasEl}
        ondragover={(e) => e.preventDefault()}
        {ondrop}
        onpointerdown={(e) => e.target === canvasEl && (selected = [])}
        onclick={() => previewing && togglePreview()}
        role="region"
        aria-label="Slide canvas. Drop files or links here."
      >
        <Stage>
          {#if previewing}
            {#key previewKey}
              <!-- 'single' is the audible role Play uses in a single window; 'mirror' is muted. -->
              <SlideView {slide} mode="play" role={previewMuted ? 'mirror' : 'single'} />
            {/key}
          {:else}
            <SlideView slide={editView} mode="edit" {placeholder} onfit={(id, r) => (fits[id] = r)} />
            <EditLayer
              {slide}
              bind:selected
              {hidden}
              bind:hovered
              onmenu={(m) => (menu = m)}
              onstart={() => {
                commit();
                dragging = true;
              }}
              onchange={() => {
                dragging = false;
                commit();
              }}
              ondblclick={(el) => (el.kind === 'text' ? focusText(false) : el.kind === 'image' && (editingImage = el.id))}
            />
          {/if}
        </Stage>
        {#if previewing}
          <!-- A click on the slide stops the preview. A YouTube embed keeps its own clicks (they stay
               inside its frame), so it can still be started or paused here. -->
          <div class="ribbon preview">PREVIEW · click to stop</div>
        {:else if badge}
          <div class="ribbon">{badge}</div>
        {/if}
        {#if notice && notice.at === hv && !pending && !previewing}
          <div class="notice" role="status">
            <span>{notice.text}</span>
            {#if notice.undo}
              <button
                class="small"
                onclick={(e) => {
                  e.stopPropagation();
                  const fn = notice?.undo;
                  notice = null;
                  fn?.();
                }}>Undo</button>
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <aside class="side">
      <!-- Also for a lone locked item: clicks go through it, so the list is the easy way to reach it. -->
      {#if !previewing && (slide.elements.length > 1 || hidden.length || slide.elements.some((e) => e.locked))}
        <details class="layers-box" open>
          <summary>Layers <span class="muted">({slide.elements.length}, top first)</span></summary>
          <LayersPanel elements={slide.elements} {game} bind:selected bind:hidden bind:hovered onedit={edit} />
        </details>
      {/if}
      {#if previewing}
        <p class="muted">Previewing the slide as players will see it. Press <b>Esc</b>, click the slide or <b>■ Stop preview</b> to edit again.</p>
      {:else if single}
        <Inspector
          el={single}
          {game}
          fit={fits[single.id]}
          bind:textArea
          onorder={order}
          onduplicate={duplicate}
          ondelete={() => remove()}
          onreplace={() => {
            if (single && (single.kind === 'image' || single.kind === 'video' || single.kind === 'audio')) {
              replacing = single.id;
              picker = single.kind;
            }
          }}
          onapplystyle={styletargets ? applyStyle : undefined}
          onuploadfont={() => {
            replacing = null;
            picker = 'font';
          }}
          oneditimage={single.kind === 'image' ? () => (editingImage = single!.id) : undefined}
          onedit={edit}
        />
        {#if picker && replacing === single.id}
          <div class="pop-anchor"><MediaPicker kind={picker} onpick={picked} onclose={() => ((picker = null), (replacing = null))} /></div>
        {/if}
      {:else if selected.length > 1}
        <p class="muted">{selected.length} items selected.</p>
        <div class="row">
          <button class="small" onclick={duplicate}>Duplicate</button>
          <button class="small bad" onclick={() => remove()}>Delete</button>
        </div>
      {:else}
        <p class="muted">
          Click an item to edit it, or double-click it (text goes straight to its text field). Drag to move (press Shift while
          dragging to keep to one axis), pull the handles to resize, and use the round handle to rotate. Drop or paste images,
          video, audio and links. Shift-click or drag a box on an empty spot to select several. Ctrl+C / Ctrl+X / Ctrl+V copy
          items between slides.
        </p>
        <p class="muted small">
          Something hidden under a bigger item? <b>Right-click</b> to pick from everything under the pointer, <b>Alt+click</b>
          again and again to walk down the stack, <b>Tab</b> to step through items, or use the <b>Layers</b> list. Lock a
          background so clicks go through it.
        </p>
      {/if}
      {#if selected.length && !previewing}
        <div class="aligns">
          <span class="muted small">Move to the slide's…</span>
          <div class="agrid">
            <button class="small" onclick={() => align('left')} aria-label="Move to the slide's left edge">Left</button>
            <button class="small" onclick={() => align('hcenter')} aria-label="Center across the slide">Center</button>
            <button class="small" onclick={() => align('right')} aria-label="Move to the slide's right edge">Right</button>
            <button class="small" onclick={() => align('top')} aria-label="Move to the slide's top edge">Top</button>
            <button class="small" onclick={() => align('vcenter')} aria-label="Center down the slide">Middle</button>
            <button class="small" onclick={() => align('bottom')} aria-label="Move to the slide's bottom edge">Bottom</button>
          </div>
        </div>
      {/if}
      {#if picker === 'font'}
        <div class="pop-anchor"><MediaPicker kind="font" onpick={(id) => ((picker = null), addMedia('font', id))} onclose={() => (picker = null)} /></div>
      {/if}
    </aside>
  </div>
</div>

<style>
  .se {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .pop {
    position: relative;
  }
  .menu {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 50;
    margin-top: 4px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 6px;
  }
  .menu button {
    text-align: left;
  }
  .sep {
    width: 8px;
  }
  .bg {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--muted);
    font-size: 12px;
  }
  .small {
    font-size: 12px;
  }
  .body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    gap: 12px;
    min-height: 0;
  }
  .cell {
    min-width: 0;
    min-height: 0;
  }
  .canvas {
    /* Pasteboard around the slide. The canvas box itself is 16:9 (content-box sizing). */
    --pb: 14px;
    box-sizing: content-box;
    width: calc(100% - 2 * var(--pb));
    padding: var(--pb);
    aspect-ratio: 16 / 9;
    position: relative;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }
  /* Let selection frames and handles spill from the slide onto the pasteboard (the slide's own
     content is still clipped by SlideView). */
  .canvas > :global(.frame),
  .canvas > :global(.frame > .stage) {
    overflow: visible;
  }
  .tools {
    display: contents;
  }
  .canvas.previewing {
    cursor: pointer;
  }
  .side {
    position: relative;
    overflow-y: auto;
    max-height: 70vh;
    padding-right: 4px;
  }
  .side p {
    margin: 0 0 8px;
  }
  .aligns {
    margin-top: 12px;
  }
  .agrid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    margin-top: 4px;
  }
  .layers-box {
    margin-bottom: 12px;
  }
  .layers-box summary {
    cursor: pointer;
    margin-bottom: 6px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
  }
  .layers-box :global(.layers) {
    max-height: 190px;
    overflow-y: auto;
  }
  .pop-anchor {
    position: relative;
  }
  .ribbon {
    position: absolute;
    top: calc(var(--pb) + 8px);
    left: calc(var(--pb) + 8px);
    padding: 2px 10px;
    border-radius: 4px;
    background: var(--warn);
    color: #000;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.1em;
    pointer-events: none;
  }
  .ribbon.preview {
    background: var(--accent);
    color: #fff;
  }
  .notice {
    position: absolute;
    left: 50%;
    bottom: calc(var(--pb) + 10px);
    translate: -50% 0;
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 6px 8px 6px 14px;
    border-radius: 8px;
    background: var(--panel-2);
    border: 1px solid var(--border);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45);
    white-space: nowrap;
    z-index: 2000;
  }

  /* In the clue editor: take the remaining height and fit the slide to width AND height, so it never
     spills over the fields around it on a laptop screen. */
  .se.fill {
    flex: 1 1 0;
    min-height: 300px;
  }
  .fill .body {
    flex: 1 1 0;
    grid-template-rows: minmax(0, 1fr);
  }
  .fill .cell {
    container-type: size;
  }
  .fill .canvas {
    width: min(calc(100cqw - 2 * var(--pb) - 2px), calc((100cqh - 2 * var(--pb) - 2px) * 16 / 9));
  }
  .fill .side {
    max-height: none;
  }
  @media (max-width: 900px) {
    .body {
      grid-template-columns: 1fr;
    }
    .side {
      max-height: none;
    }
    .se.fill,
    .fill .body {
      flex: none;
    }
    .fill .body {
      grid-template-rows: none;
    }
    .fill .cell {
      container-type: normal;
    }
    .fill .canvas {
      width: calc(100% - 2 * var(--pb));
    }
  }
</style>
