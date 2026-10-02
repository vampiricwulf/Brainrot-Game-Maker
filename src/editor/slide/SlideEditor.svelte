<!-- Freeform 16:9 slide editor (spec §5.3): toolbar, canvas with handles, and an inspector. -->
<script module lang="ts">
  import { freeOffset, isMediaLink, officeTextPaste, placeNewPicture } from '../../lib/editing';

  // The Final tab shows two slide editors at once. Only the one the user last clicked or focused
  // handles keyboard shortcuts, copy and paste (and becoming active clears the other's selection),
  // so a shortcut never reaches a slide that's out of sight. None does while an image editor or the
  // drawpad is open (their keys are their own).
  // A slide opened in a dialog from an editor's inspector (an RPG character's dialogue) is an editor inside it.
  interface Instance {
    clear(): void;
    parent?: Instance;
  }
  const EDITOR = Symbol('slide editor');
  const instances = new Set<Instance>();
  let active: Instance | null = null;
  let imageEditors = 0;
  // An editor went away. The next one to mount takes over: it's the same editor remounted by a
  // Question/Answer tab switch (tabs sit outside the editor, so clicking one doesn't activate it).
  let vacated = false;
</script>

<script lang="ts">
  import Tips from '../Tips.svelte';
  import { pathShape } from '../../lib/draw';
  import { anchored } from '../../lib/anchored';
  import { getContext, onDestroy, onMount, setContext, tick, untrack, type Snippet } from 'svelte';
  import { app, toast, editedGame } from '../../lib/app.svelte';
  import type { FitResult } from '../../lib/autofit';
  import { adoptMedia, adoptUsedBy, clipboard, copyElements, copyFromMenu, elementMediaIds, holdMedia, holdUsedBy, pastingGone, pastingOurs } from '../../lib/clipboard.svelte';
  import { announce } from '../../lib/announce';
  import { dropdown } from '../../lib/menustate.svelte';
  import { addMediaFile, slideImageSize, type LinkAdded } from '../../lib/media.svelte';
  import { warnIfUnplayable } from '../../lib/mediadrop';
  import { isLinkProblem, isMediaHost, parseMediaLink, youtubeStart } from '../../lib/links';
  import { registerGameFonts, uploadedFamily } from '../../lib/fonts';
  import { clone, restyle } from '../../lib/ops';
  import { align as alignTo, centreOn, clampOnto, elementsAt, keepOnStage, restack, type Pt, type Restack } from '../../lib/layers';
  import {
    newAudioEl, newEmbedEl, newId, newImageEl, newShapeEl, newTextEl, newVideoEl, SLIDE_H, SLIDE_W,
    type EmbedKind, type ImageEl, type MediaKind, type MediaRef, type ShapeType, type Slide, type SlideElement, type TextEl,
  } from '../../lib/model';
  import Stage from '../../lib/Stage.svelte';
  import SlideView from '../../lib/slide/SlideView.svelte';
  import EditLayer from './EditLayer.svelte';
  import DrawLayer from './DrawLayer.svelte';
  import DrawPad from './DrawPad.svelte';
  import Inspector from './Inspector.svelte';
  import MediaPicker from './MediaPicker.svelte';
  import LinkField from '../LinkField.svelte';
  import ImageEditor from './ImageEditor.svelte';
  import LayersPanel from './LayersPanel.svelte';
  import LayerMenu from './LayerMenu.svelte';
  import { itemsNamed, layerLabel, lockedNote, type Align, type LayerAction } from '../../lib/layerlabel';
  import { themeStyle } from '../../lib/theme';
  import { itemsFor, placeElement, take } from '../../lib/nav.svelte';
  import { gameUndo, slideHistory } from '../../lib/slideundo.svelte';
  import { itemPlace } from '../../lib/historylabel';

  let {
    slide,
    styletargets,
    stylecategory = false,
    placeholder,
    badge,
    fill = false,
    objectsection,
    tools,
  }: {
    slide: Slide;
    /** The main text elements "Use this style elsewhere" restyles for a scope (the host knows the round). */
    styletargets?: (el: TextEl, scope: string) => TextEl[];
    /** Offer "this category" in "Use this style elsewhere" (a clue's slides, not the Final's). */
    stylecategory?: boolean;
    /** Shown in the slide's main text box while it's empty. */
    placeholder?: string;
    /** A ribbon in the canvas corner, e.g. "ANSWER". */
    badge?: string;
    /** Fill the parent's height and fit the canvas to both width and height (the clue editor). */
    fill?: boolean;
    /** Extra inspector settings for the selected item (RPG screens: class, secret, host notes). */
    objectsection?: Snippet<[SlideElement]>;
    /** Extra toolbar buttons (RPG screens: spawn point, items). `add` puts an element on the slide. */
    tools?: Snippet<[(el: SlideElement) => void]>;
  } = $props();
  let editingImage = $state<string | null>(null);
  const imageEl = $derived(slide.elements.find((e) => e.id === editingImage && e.kind === 'image') as ImageEl | undefined);

  const game = $derived(editedGame());
  let selected = $state<string[]>([]);
  let picker = $state<MediaKind | null>(null);
  let replacing = $state<string | null>(null);
  /** The Inspector button (Replace…, font ＋) its picker drops from. */
  let pickerFrom = $state<HTMLElement>();
  let shapeMenu = $state(false);
  /** The Background ▾ box: the slide's color, picture and reset. */
  let bgMenu = $state(false);
  /** ✏ Draw is on: the next drag on the canvas draws a line. */
  let drawing = $state(false);
  /** The drawpad is open: a whole drawing, inserted as one picture. */
  let drawpad = $state(false);

  async function insertDrawing(png: Blob, box: { x: number; y: number; w: number; h: number }): Promise<void> {
    drawpad = false;
    try {
      // The picture's file and the picture on the slide: one step.
      await undoApi.stepAsync('Added drawing', async () => {
        const ref = await addMediaFile(game, png, 'drawing.png');
        const el = newImageEl(ref.id, box.w, box.h);
        Object.assign(el, { x: box.x, y: box.y, name: 'Drawing' });
        add(el);
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    }
  }
  /** The 🌐 Link box: the link it started with (pasted or dropped) and where the item goes. */
  let linkBox = $state<{ initial: string; at?: { x: number; y: number }; key: number } | null>(null);
  let linkKey = 0;
  let previewKey = $state(0);
  let previewing = $state(false);
  let previewMuted = $state(false);
  let textArea = $state<HTMLTextAreaElement>();
  let canvasEl = $state<HTMLDivElement>();
  let root = $state<HTMLDivElement>();
  /** Fitted font size of each text element, as drawn on the canvas. */
  let fits = $state<Record<string, FitResult>>({});
  // Layers: items hidden while editing (editor-only, never saved or undone), the item under the
  // mouse, and the right-click menu.
  let hidden = $state<string[]>([]);
  let hovered = $state<string | null>(null);
  let menu = $state<{ x: number; y: number; at: Pt; stack: SlideElement[] } | null>(null);
  const editView = $derived(hidden.length ? { ...slide, elements: slide.elements.filter((e) => !hidden.includes(e.id)) } : slide);

  const single = $derived(selected.length === 1 ? slide.elements.find((e) => e.id === selected[0]) : undefined);
  // Items an undo took away are no longer selected (or hidden).
  $effect(() => {
    const ids = new Set(slide.elements.map((e) => e.id));
    untrack(() => {
      if (selected.some((id) => !ids.has(id))) selected = selected.filter((id) => ids.has(id));
      if (hidden.some((id) => !ids.has(id))) hidden = hidden.filter((id) => ids.has(id));
    });
  });
  // An undo or redo that changed an item on this slide selects it (and the others it changed with it).
  const handled = { seq: 0 };
  $effect(() => {
    const place = take(handled);
    const id = place && placeElement(place);
    untrack(() => {
      if (!id || previewing || !slide.elements.some((e) => e.id === id)) return;
      selected = itemsFor(id, slide.elements);
      activate();
    });
  });
  const topZ = () => Math.max(0, ...slide.elements.map((e) => e.zIndex)) + 1;

  // ---------- Which editor takes the keyboard ----------
  const me: Instance = { clear: () => (selected = []), parent: getContext<Instance | undefined>(EDITOR) };
  setContext(EDITOR, me);
  const opener = (i: Instance) => {
    for (let p = me.parent; p; p = p.parent) if (p === i) return true;
    return false;
  };
  function activate(): void {
    if (active === me) return;
    // A slide opened from this one is in charge while its dialog is open (clicks in the dialog reach both).
    if ([...instances].some((i) => i.parent === me)) return;
    active = me;
    // The editor it was opened from keeps its selection: the dialog belongs to what's selected there.
    for (const i of instances) if (i !== me && !opener(i)) i.clear();
  }
  /**
   * A dialog from outside this editor is open over it (⚙ Settings, ℹ About, the clue's 🖼 Tile image picker): the keys
   * are its. Inside a dialog (the clue editor, a screen edited live), only one open in that dialog counts: an object's
   * card beside it isn't over it.
   */
  function covered(): boolean {
    if (!root) return false;
    const within = root.parentElement?.closest('[role="dialog"]') ?? document;
    return [...within.querySelectorAll('[role="dialog"]')].some((d) => !d.contains(root!) && !root!.contains(d));
  }
  function inCharge(): boolean {
    return imageEditors === 0 && !covered() && (active === me || (!active && instances.size === 1));
  }
  onMount(() => {
    instances.add(me);
    if (!active || vacated || me.parent) activate();
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
  $effect(() => {
    if (!drawpad) return;
    imageEditors++;
    return () => imageEditors--;
  });

  // ---------- Undo ----------
  // The game's undo history (a discrete action is a step of its own, a drag is one step, and Ctrl+Z / Ctrl+Y are the
  // editor's); while a screen is edited live during play, a history of the slide's own (slideundo.svelte.ts).
  const undoApi = untrack(() => (app.editGame ? slideHistory(slide) : gameUndo));
  /**
   * ↶ ↷ of its own: in a window over the editor (the clue editor, a screen's window), which covers the header's, and
   * for a slide's own history during play. Elsewhere the header's are the ones.
   */
  let ownUndo = $state(untrack(() => !!app.editGame));
  onMount(() => {
    if (root?.closest('[aria-modal="true"]')) ownUndo = true;
  });
  /** Record a discrete edit as its own undo step (`label`: its name in the History, else named from what changed). */
  const edit = (fn: () => void, label: string | null = null) => undoApi.step(label, fn);
  /** The drag going on (one step until it ends). */
  let endDrag: (() => void) | null = null;
  onDestroy(() => endDrag?.());

  // A short note on the canvas, optionally with an Undo button ("Deleted text box · Undo"). It goes
  // away after a few seconds or as soon as something changes again, so its Undo always means that step.
  let notice = $state<{ text: string; undo?: () => void; at: unknown } | null>(null);
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  function tell(text: string, undoFn?: () => void): void {
    notice = { text, undo: undoFn, at: undoApi.top };
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => (notice = null), 6000);
  }

  const NAMES: Record<SlideElement['kind'], string> = { text: 'text box', image: 'image', video: 'video', audio: 'audio clip', shape: 'shape', embed: 'link' };
  const describe = (els: SlideElement[]) => (els.length === 1 ? NAMES[els[0].kind] : `${els.length} items`);
  /** The items as the History names a step done to them: shape “Ellipse”, 3 shapes, 3 items. */
  const named = (els: SlideElement[]) => itemsNamed(els, game);

  // ---------- Adding elements ----------
  /** `also`: more changes in the same undo step (moving the question's text out of a new picture's way). */
  function add(el: SlideElement, at?: { x: number; y: number }, also?: () => void): void {
    edit(() => {
      el.zIndex = topZ();
      if (at) {
        // Centred on the pointer, but never partly off the slide (dropped near an edge).
        el.x = Math.round(at.x - el.w / 2);
        el.y = Math.round(at.y - el.h / 2);
        clampOnto(el, SLIDE_W, SLIDE_H);
      }
      also?.();
      slide.elements.push(el);
      selected = [el.id];
    });
    // Added from a menu (which has closed) or a button that's gone: the keyboard carries on from the canvas, not the page.
    void tick().then(() => {
      const a = document.activeElement;
      if (!a || a === document.body) canvasEl?.focus({ preventScroll: true });
    });
  }

  /** 🅣 Text, or ＋ Text here from the right-click menu (`at`: where it goes). */
  function addText(at?: Pt): void {
    let t: TextEl;
    if (!slide.elements.some((e) => e.kind === 'text') && !at) {
      // No main text any more (it was deleted): bring it back full-slide and shrink-to-fit.
      t = newTextEl('');
    } else {
      t = newTextEl('New text', { x: 460, y: 390, w: 1000, h: 300 });
      t.size = 90;
      const k = freeOffset([t], slide.elements, 40);
      t.x += k * 40;
      t.y += k * 40;
    }
    add(t, at);
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

  /** Put a file on the slide. `gif`: a GIF turned into a video (GIPHY, Imgur .gifv), so it loops silently. */
  async function addMedia(kind: MediaKind, id: string, at?: { x: number; y: number }, gif = false): Promise<void> {
    if (kind === 'image') {
      const { w, h } = await slideImageSize(id);
      const el = newImageEl(id, w, h);
      // Not dropped somewhere: clear of the text (a question alone moves into a band under the picture, the same step).
      add(el, at, at ? undefined : () => placeNewPicture(slide.elements, el));
    } else if (kind === 'video') {
      const v = newVideoEl(id);
      if (gif) Object.assign(v, { loop: true, muted: true });
      add(v, at);
    }
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
            el.uneditedSize = undefined;
          }
        });
      return;
    }
    await addMedia(kind, id);
  }

  /** A finished freehand stroke (slide coordinates) becomes a 'path' shape sized to fit it. */
  function addDrawing(pts: [number, number][], closed: boolean): void {
    drawing = false;
    const el = pathShape(pts, closed);
    // The editor's lines are white (play-time drawings take the host's color).
    if (!closed) el.stroke = '#ffffff';
    add(el);
  }

  function addHotspot(): void {
    shapeMenu = false;
    const el = newShapeEl('rect');
    Object.assign(el, { hotspot: true, fill: 'transparent', strokeWidth: 0, name: 'Hotspot' });
    add(el);
  }

  function addShape(shape: ShapeType): void {
    shapeMenu = false;
    add(newShapeEl(shape));
  }

  // ---------- Links (🌐 Link, or a link pasted or dropped on the slide) ----------
  function openLink(initial = '', at?: { x: number; y: number }): void {
    linkBox = { initial, at, key: ++linkKey };
  }

  /** A site's own player (YouTube, Streamable, Google Drive's player) as a slide item. */
  function addEmbed(url: string, kind: EmbedKind, at?: { x: number; y: number }): void {
    const el = newEmbedEl(url, kind);
    if (kind === 'youtube') el.startAt = youtubeStart(url);
    add(el, at);
  }

  /** The link box turned a link into a file (downloaded, or a live link): put it on the slide. */
  async function linked(ref: MediaRef, added: LinkAdded | null): Promise<void> {
    const at = linkBox?.at;
    linkBox = null;
    await addMedia(ref.kind, ref.id, at, !!added?.link.gif);
  }

  /** A YouTube or Streamable link goes straight on; any other link opens the link box (download, progress, Cancel). */
  function addLinkEl(url: string, at?: { x: number; y: number }): void {
    const link = parseMediaLink(url);
    if (link && !isLinkProblem(link) && link.embed) addEmbed(link.source, link.embed, at);
    else openLink(url, at);
  }

  /** Pasted or dropped text: a media link becomes media; other text fills the empty main text box or a new one. */
  function addTextContent(text: string, at?: { x: number; y: number }): void {
    if (isMediaLink(text, isMediaHost)) return addLinkEl(text.trim(), at);
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

  // The files and the items they make: one step.
  function dropFiles(files: FileList, at: { x: number; y: number }): Promise<void> {
    return undoApi.stepAsync(null, async () => {
      for (const file of Array.from(files)) {
        try {
          const ref = await addMediaFile(game, file);
          warnIfUnplayable(ref);
          await addMedia(ref.kind, ref.id, at);
        } catch (e) {
          toast((e as Error).message);
        }
      }
    });
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
    undoApi.step(`${verb} ${named(gone)}`, () => {
      slide.elements = slide.elements.filter((e) => !ids.has(e.id));
      selected = selected.filter((id) => !ids.has(id));
    });
    tell(`${verb} ${describe(gone)}${locked ? ` · ${lockedNote(locked)}` : ''}`, undoApi.undo);
  }

  function duplicate(): void {
    const from = slide.elements.filter((e) => selected.includes(e.id));
    if (!from.length) return;
    undoApi.step(`Duplicated ${named(from)}`, () => {
      const copies = from.map((e) => ({ ...clone(e), id: newId(), x: e.x + 30, y: e.y + 30 }));
      for (const c of copies) {
        c.zIndex = topZ();
        // (A copy of an item at the bottom-right edge stays partly on the slide.)
        keepOnStage(c, SLIDE_W, SLIDE_H);
      }
      slide.elements.push(...copies);
      selected = copies.map((c) => c.id);
    });
  }

  /** Restack the selection (Inspector, right-click menu, Ctrl+] / Ctrl+[) as one undo step. */
  const RESTACKED: Record<Restack, [string, string]> = { front: ['Brought', 'to the front'], forward: ['Brought', 'forward'], backward: ['Sent', 'backward'], back: ['Sent', 'to the back'] };
  function restackSelected(dir: Restack): void {
    const els = slide.elements.filter((e) => selected.includes(e.id));
    if (!els.length) return;
    const [verb, where] = RESTACKED[dir];
    undoApi.step(`${verb} ${named(els)} ${where}`, () => restack(slide.elements, selected, dir));
  }

  function order(dir: 'front' | 'back' | 'up' | 'down'): void {
    restackSelected(dir === 'up' ? 'forward' : dir === 'down' ? 'backward' : dir);
  }

  /** A right-click menu choice (`at`: where on the slide the menu was opened). */
  function menuAction(a: LayerAction, at?: Pt): void {
    if (a.startsWith('align-')) align(a.slice(6) as Align);
    else if (a === 'front' || a === 'forward' || a === 'backward' || a === 'back') restackSelected(a);
    else if (a === 'duplicate') duplicate();
    else if (a === 'lock' || a === 'unlock') {
      const els = slide.elements.filter((e) => selected.includes(e.id) && !e.locked === (a === 'lock'));
      if (els.length)
        edit(() => {
          for (const e of els) e.locked = a === 'lock' || undefined;
        }, `${a === 'lock' ? 'Locked' : 'Unlocked'} ${named(els)}`);
    }
    else if (a === 'hide') {
      // Editor-only (not part of the slide), so it's never an undo step.
      hidden = [...hidden, ...selected];
      selected = [];
    } else if (a === 'delete') remove();
    else if (a === 'copy') copyFromMenu((data) => toast(`Copied ${copied(data)}`));
    else if (a === 'cut') cut(null);
    else if (a === 'paste') pasteItems(at);
    else if (a === 'paste-slide') pasteSlide();
    else if (a === 'select-all') selectAll();
    else if (a === 'add-text') addText(at);
    else if (a === 'background') {
      replacing = 'bg';
      picker = 'image';
    } else if (a === 'edit-image' && single?.kind === 'image') editingImage = single.id;
  }

  /** Ctrl+A: every item that isn't locked or hidden. */
  function selectAll(): void {
    selected = slide.elements.filter((x) => !x.locked && !hidden.includes(x.id)).map((x) => x.id);
  }

  /**
   * Tab on the canvas: the next item down the stack (Shift: up). Past the last one, Tab goes on to the next control as
   * anywhere else (false: the key isn't taken); Shift+Tab before the first leaves nothing selected, then goes back too.
   */
  function cycle(dir: 1 | -1): boolean {
    const list = slide.elements.filter((e) => !hidden.includes(e.id)).sort((a, b) => b.zIndex - a.zIndex);
    if (!list.length) return false;
    const i = selected.length ? list.findIndex((e) => e.id === selected[selected.length - 1]) : -1;
    const j = i < 0 && dir < 0 ? -1 : i + dir;
    if (j >= list.length || (j < 0 && !selected.length)) return false;
    selected = j < 0 ? [] : [list[j].id];
    // Screen readers hear which item it is: "Rectangle, 2 of 5, locked".
    if (j < 0) announce('Nothing selected');
    else announce(`${layerLabel(list[j], game)}, ${j + 1} of ${list.length}${list[j].locked ? ', locked' : ''}`);
    return true;
  }

  /**
   * Shift+F10 or the menu key on the canvas: the right-click menu for the selection (at its middle), or for the slide
   * when nothing is selected.
   */
  function keyMenu(): void {
    const stageEl = canvasEl?.querySelector('.stage');
    if (!stageEl) return;
    const r = stageEl.getBoundingClientRect();
    const last = slide.elements.find((e) => e.id === selected[selected.length - 1]);
    const at = last ? { x: last.x + last.w / 2, y: last.y + last.h / 2 } : { x: SLIDE_W / 2, y: SLIDE_H / 2 };
    const stack = last ? elementsAt(slide.elements.filter((e) => !hidden.includes(e.id)), at) : [];
    menu = { x: r.left + (at.x / SLIDE_W) * r.width, y: r.top + (at.y / SLIDE_H) * r.height, at, stack };
  }

  /** How the History names Align (# is the items): several line up with each other, one goes to the slide's edge or middle. */
  const ALIGNED: Record<Align, [several: string, one: string]> = {
    left: ['Lined up the left edges of #', "Moved # to the slide's left edge"],
    hcenter: ['Lined up the middles of # across', 'Centered # across the slide'],
    right: ['Lined up the right edges of #', "Moved # to the slide's right edge"],
    top: ['Lined up the top edges of #', "Moved # to the slide's top edge"],
    vcenter: ['Lined up the middles of # down', 'Centered # down the slide'],
    bottom: ['Lined up the bottom edges of #', "Moved # to the slide's bottom edge"],
    hdistribute: ['Spaced # evenly across', 'Spaced # evenly across'],
    vdistribute: ['Spaced # evenly down', 'Spaced # evenly down'],
  };
  function align(how: Align): void {
    const { free, locked } = selection();
    if (free.length) undoApi.step(ALIGNED[how][free.length > 1 ? 0 : 1].replace('#', named(free)), () => alignTo(free, how, SLIDE_W, SLIDE_H));
    if (locked) tell(lockedNote(locked));
  }

  // Restyling many slides is one step, so it's done at once and offers Undo (the words stay the same).
  function applyStyle(el: TextEl, scope: string): void {
    const targets = styletargets?.(el, scope) ?? [];
    if (!targets.length) return void tell('There are no other slides in that group yet.');
    const slides = `${targets.length} slide${targets.length === 1 ? '' : 's'}`;
    const top = undoApi.top;
    // It shows on this slide (the ones it changed may be anywhere).
    undoApi.step(`Restyled the main text on ${slides}`, () => restyle(el, targets), { place: itemPlace(game, el.id) ?? undefined });
    tell(`Style applied to ${slides}`, undoApi.top !== top ? undoApi.undo : undefined);
  }

  function copySlide(): void {
    clipboard.slide = clone(slide);
    holdMedia(game);
    holdUsedBy(game, clipboard.slide);
    toast('Slide copied');
  }

  // Replace everything on this slide with the copied one. It's one undo step, so the canvas offers Undo
  // instead of asking first (a browser dialog would show on stream mid-show).
  function pasteSlide(): void {
    if (!clipboard.slide) return;
    const s = clone(clipboard.slide);
    for (const e of s.elements) e.id = newId();
    adoptMedia(game, elementMediaIds(s.elements, s.background));
    adoptUsedBy(game, s);
    undoApi.step('Pasted a slide', () => {
      slide.background = s.background;
      slide.elements = s.elements;
      selected = [];
    });
    tell('Pasted the copied slide', undoApi.undo);
  }

  /**
   * Delete / Backspace remove the selected items only from the canvas, the page itself or a Layers row: on the
   * Inspector's buttons and checkboxes they're nothing (it was easy to lose an item there).
   */
  function deletesItems(): boolean {
    const a = document.activeElement;
    return !a || a === document.body || !!canvasEl?.contains(a) || !!a.closest('.layers-box [data-layer]');
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
      selected = [];
      shapeMenu = false;
      drawing = false;
      picker = null;
      linkBox = null;
      previewKey++;
    }
  }

  function onkey(e: KeyboardEvent): void {
    // The Shape menu keys itself (Esc closes just the menu).
    if (!inCharge() || menu || shapeMenu) return;
    // Esc first closes whatever is open over the slide (the link box, a file picker) or stops drawing, and
    // goes no further (in the clue editor, it would close the whole clue).
    if (e.key === 'Escape' && (linkBox || drawing || picker)) {
      e.stopImmediatePropagation();
      linkBox = null;
      drawing = false;
      picker = null;
      replacing = null;
      return;
    }
    // Esc in the slide's own fields (a text box's text…) leaves the field, the item still selected: the next Esc
    // deselects, and the one after that closes the clue. (After the field's own Esc, which may cancel a rename.)
    if (e.key === 'Escape' && typing(e) && !picker && root?.contains(e.target as Node)) {
      const field = e.target as HTMLElement;
      setTimeout(() => !e.defaultPrevented && document.activeElement === field && field.blur());
      return;
    }
    if (typing(e) || picker) return;
    // Not a key meant for something else in focus (a round's tab, the clue's Next button…): it's theirs alone.
    const at = document.activeElement;
    if (at && at !== document.body && !root?.contains(at)) return;
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
    // Only with the focus on the canvas (a Tab stop of its own): elsewhere, and past the last item, Tab moves on.
    const onCanvas = !!canvasEl?.contains(document.activeElement);
    if (k === 'tab' && !mod && !e.altKey && onCanvas && slide.elements.length) {
      if (cycle(e.shiftKey ? -1 : 1)) e.preventDefault();
    } else if (onCanvas && (k === 'contextmenu' || (k === 'f10' && e.shiftKey && !mod && !e.altKey))) {
      e.preventDefault();
      keyMenu();
    } else if (mod && (e.code === 'BracketRight' || e.code === 'BracketLeft') && selected.length) {
      e.preventDefault();
      const up = e.code === 'BracketRight';
      restackSelected(e.shiftKey ? (up ? 'front' : 'back') : up ? 'forward' : 'backward');
    } else if (undoApi.keys && mod && (k === 'z' || k === 'y')) {
      // (Only a screen edited live has keys of its own: in the editor, Ctrl+Z / Ctrl+Y go through the game's history.)
      e.preventDefault();
      if (k === 'y' || e.shiftKey) undoApi.redo();
      else undoApi.undo();
    } else if (mod && k === 'd' && selected.length) {
      e.preventDefault();
      duplicate();
    } else if (mod && k === 'a') {
      e.preventDefault();
      selectAll();
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
    } else if ((k === 'delete' || k === 'backspace') && selected.length && deletesItems()) {
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
        // Never all the way off the slide (where it could only be found in the Layers list).
        keepOnStage(el, SLIDE_W, SLIDE_H);
      }
    }
  }

  // ---------- Clipboard (shared with the board images: clipboard.svelte.ts) ----------
  /** Copy the selection (or `from`) to the clipboard: "3 items". */
  function copied(data: DataTransfer | null, from = slide.elements.filter((x) => selected.includes(x.id))): string {
    const n = copyElements(game, from, data);
    return `${n} item${n === 1 ? '' : 's'}`;
  }

  function oncopy(e: ClipboardEvent): void {
    if (!inCharge() || typing(e) || previewing || !selected.length) return;
    e.preventDefault();
    toast(`Copied ${copied(e.clipboardData)}`);
  }

  /** Copy, then delete. Locked items stay where they are, so they aren't copied either (a paste would duplicate them). */
  function cut(data: DataTransfer | null): void {
    const { free, locked } = selection();
    if (!free.length) return void tell(lockedNote(locked));
    if (data) copied(data, free);
    else copyFromMenu((d) => copied(d, free));
    remove('Cut');
  }

  function oncut(e: ClipboardEvent): void {
    if (!inCharge() || typing(e) || previewing || !selected.length) return;
    e.preventDefault();
    cut(e.clipboardData);
  }

  /** Paste the copied items (`at`: centred on that point, from the right-click menu). */
  function pasteItems(at?: Pt): void {
    if (!clipboard.elements.length) return;
    const copies = clipboard.elements.map((x) => ({ ...clone(x), id: newId() }));
    // (Copied from the board images: their board-only settings stay behind.)
    for (const c of copies) for (const key of ['behind', 'clickThrough'] as const) delete (c as Record<string, unknown>)[key];
    adoptMedia(game, elementMediaIds(copies));
    adoptUsedBy(game, copies);
    if (at) centreOn(copies, at);
    else {
      // Copies that would land exactly on an existing item (pasting onto the same slide) shift down-right.
      const k = freeOffset(copies, slide.elements);
      for (const c of copies) {
        c.x += k * 30;
        c.y += k * 30;
      }
    }
    const z = topZ();
    copies.forEach((c, i) => (c.zIndex = z + i));
    undoApi.step(`Pasted ${named(copies)}`, () => {
      slide.elements.push(...copies);
      selected = copies.map((c) => c.id);
    });
  }

  function onpaste(e: ClipboardEvent): void {
    if (!inCharge() || typing(e) || previewing) return;
    const data = e.clipboardData;
    const files = data?.files;
    const text = data?.getData('text/plain') ?? '';
    // (Word, PowerPoint and Excel put a picture of the text alongside it: the text is what was meant.)
    if (files?.length && !officeTextPaste(data?.getData('text/html') ?? '', text, files.length)) {
      e.preventDefault();
      dropFiles(files, { x: SLIDE_W / 2, y: SLIDE_H / 2 });
      return;
    }
    if (pastingOurs(data ?? null)) {
      e.preventDefault();
      pasteItems();
    } else if (pastingGone(data ?? null)) {
      // Copied in another tab or before a reload: the items themselves aren't here (only "2 slide items").
      e.preventDefault();
      toast('Those items were copied in another tab or before the page reloaded: copy them again here');
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
  {@const at = menu.at}
  <LayerMenu
    x={menu.x}
    y={menu.y}
    stack={menu.stack}
    selected={slide.elements.filter((e) => selected.includes(e.id))}
    {game}
    bind:hovered
    canPaste={clipboard.elements.length > 0}
    slideExtras={{ canPasteSlide: !!clipboard.slide }}
    onpick={(id) => (selected = [id])}
    onaction={(a) => menuAction(a, at)}
    onclose={() => (menu = null)}
  />
{/if}

<div class="se" class:fill bind:this={root} onpointerdowncapture={activate} onfocusin={activate}>
  <div class="toolbar">
    <!-- Preview is look-only: everything that edits the slide is off until it stops. -->
    <fieldset class="tools" disabled={previewing}>
      <button onclick={() => addText()} title="Add a text box">🅣 Text</button>
      <div class="pop">
        <button onclick={() => (picker = 'image')} title="Add a picture: upload one, link to one online, or reuse one from this game">🖼 Image</button>
        {#if picker === 'image' && !replacing}<MediaPicker kind="image" onpick={picked} onclose={() => (picker = null)} />{/if}
      </div>
      <div class="pop">
        <button onclick={() => (picker = 'video')} title="Add a video: upload one, link to one online, or reuse one from this game">🎬 Video</button>
        {#if picker === 'video' && !replacing}<MediaPicker kind="video" onpick={picked} onclose={() => (picker = null)} />{/if}
      </div>
      <div class="pop">
        <button onclick={() => (picker = 'audio')} title="Add a sound: upload one, link to one online, or reuse one from this game">🔊 Audio</button>
        {#if picker === 'audio' && !replacing}<MediaPicker kind="audio" onpick={picked} onclose={() => (picker = null)} />{/if}
      </div>
      <div class="pop">
        <!-- While drawing, this is the way out (the slide says how to draw). Both labels share its width, so
             the toolbar doesn't wrap differently and shrink the slide. -->
        <button
          class="swap"
          class:primary={drawing}
          onclick={() => (drawing ? (drawing = false) : (shapeMenu = !shapeMenu))}
          aria-expanded={drawing ? undefined : shapeMenu}
          title={drawing ? 'Stop drawing (Esc)' : undefined}
        >
          <span class:hide={drawing}>◼ Shape ▾</span>
          <span class:hide={!drawing}>■ Stop</span>
        </button>
        {#if shapeMenu}
          <div class="backdrop" onclick={() => (shapeMenu = false)} role="presentation"></div>
          <div class="menu" use:anchored use:dropdown={() => (shapeMenu = false)}>
            <button onclick={() => addShape('rect')}>▭ Rectangle</button>
            <button onclick={() => addShape('ellipse')}>◯ Ellipse</button>
            <button onclick={() => addShape('line')}>― Line</button>
            <button onclick={() => addShape('arrow')}>➝ Arrow</button>
            <button onclick={() => ((shapeMenu = false), (drawing = true))} title="Drag on the slide to draw one line; hold Shift when letting go to close the shape">✏ Draw a line</button>
            <!-- Nothing stays selected behind the drawpad. -->
            <button onclick={() => ((shapeMenu = false), (selected = []), (drawpad = true))} title="Draw a whole picture (as many strokes as it takes) over the slide, then insert it">🖌 Drawpad…</button>
            <button onclick={addHotspot} title="An invisible area (viewers never see it): give it a class to make part of a picture a doorway, shop…">⬚ Hotspot</button>
          </div>
        {/if}
      </div>
      <div class="pop">
        <button onclick={() => (linkBox ? (linkBox = null) : openLink())} title="YouTube, Google Drive, or a link to a picture, video or sound online">
          🌐 Link
        </button>
        {#if linkBox}
          <!-- Stays open while you click around the slide (a download keeps going); ✕ or Esc closes it. -->
          <div
            class="linkbox"
            use:anchored
            role="dialog"
            aria-label="Add from a link"
            tabindex="-1"
            onkeydown={(e) => {
              // Esc closes just this box (not the clue editor around it).
              if (e.key !== 'Escape') return;
              e.stopPropagation();
              linkBox = null;
            }}
          >
            <div class="row">
              <b class="small">🌐 Add from a link</b>
              <span class="spacer"></span>
              <button class="ghost small" onclick={() => (linkBox = null)} aria-label="Close">✕</button>
            </div>
            {#key linkBox.key}
              <LinkField
                initial={linkBox.initial}
                hint="YouTube, Google Drive, or a direct file link, e.g. https://files.catbox.moe/abc123.mp4"
                onmedia={linked}
                onembed={(url, kind) => {
                  const at = linkBox?.at;
                  linkBox = null;
                  addEmbed(url, kind, at);
                }}
              />
            {/key}
          </div>
        {/if}
      </div>
      {#if tools}{@render tools((el: SlideElement) => add(el))}{/if}
      <span class="sep"></span>
      <div class="pop">
        <button onclick={() => (bgMenu = !bgMenu)} aria-expanded={bgMenu} title="The slide's background: a color or a picture">
          <span class="swatch" aria-hidden="true" style:background={slide.background.color ?? game.theme.tile}></span> Background ▾
        </button>
        {#if bgMenu}
          <div class="backdrop" onclick={() => (bgMenu = false)} role="presentation"></div>
          <!-- (Not a menu that takes Tab: the color box in it is a field.) -->
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <div
            class="menu bg-menu"
            use:anchored
            role="group"
            aria-label="Background"
            onkeydown={(e) => {
              if (e.key !== 'Escape') return;
              e.stopPropagation();
              bgMenu = false;
            }}
          >
            <label class="check">
              <input
                type="color"
                aria-label="Slide background color"
                value={slide.background.color ?? game.theme.tile}
                oninput={(e) => (slide.background.color = e.currentTarget.value)}
              />
              Color
            </label>
            <button onclick={() => ((bgMenu = false), (picker = 'image'), (replacing = 'bg'))} title="A picture behind everything on the slide">🖼 Picture…</button>
            <!-- Always there (disabled when there's nothing to reset), so the box keeps its size while the color changes. -->
            <button
              onclick={() => ((bgMenu = false), edit(() => (slide.background = {})))}
              disabled={!slide.background.image && !slide.background.color}
              title="Back to the theme's background">↺ Reset background</button
            >
          </div>
        {/if}
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
    </fieldset>
    <!-- One group that keeps to the right and wraps as a whole, so 🔈 ↶ ↷ never end up alone on a line.
         Starting a preview doesn't change its width (which could wrap it and shrink the slide): ↻ Replay
         is always there, hidden until then, and the Preview button has room for both of its labels. -->
    <div class="right">
      <button class="ghost small" onclick={copySlide} title="Copy this whole slide, to paste over another one">📋 Copy slide</button>
      <button class="ghost small" onclick={pasteSlide} disabled={previewing || !clipboard.slide} title={clipboard.slide ? 'Replace everything on this slide with the copied one (Undo brings it back)' : 'Copy a slide first (📋 Copy slide)'}>📋 Paste slide</button>
      <button class="ghost small" class:hide={!previewing} onclick={() => previewKey++} title="Play the animations again">↻ Replay</button>
      <button class="small swap" class:primary={previewing} onclick={togglePreview} title={previewing ? 'Back to editing (Esc)' : 'Play entrance animations and media'}>
        <span class:hide={previewing}>▶ Preview</span>
        <span class:hide={!previewing}>■ Stop preview</span>
      </button>
      <button
        class="ghost small"
        onclick={() => ((previewMuted = !previewMuted), previewing && previewKey++)}
        aria-pressed={previewMuted}
        aria-label={previewMuted ? 'Preview sound is off' : 'Preview sound is on'}
        title={previewMuted ? 'Preview plays muted (click for sound)' : 'Preview plays sound (click to mute)'}
      >{previewMuted ? '🔇' : '🔈'}</button>
      {#if ownUndo}
        <button class="ghost small" onclick={undoApi.undo} disabled={previewing || !undoApi.canUndo} aria-label="Undo (Ctrl+Z)" title={undoApi.undoTitle}>↶</button>
        <button class="ghost small" onclick={undoApi.redo} disabled={previewing || !undoApi.canRedo} aria-label="Redo (Ctrl+Y)" title={undoApi.redoTitle}>↷</button>
      {/if}
    </div>
  </div>

  <div class="body">
    <div class="cell">
      <!-- The padding is a pasteboard, so handles on items at the slide's edges stay visible and grabbable.
           A click on it stops a preview (from the keyboard: Esc, or ■ Stop preview in the toolbar). -->
      <!-- A Tab stop (a click on an item puts the focus here too): Tab and Shift+Tab then go through the items. -->
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
      <div
        class="canvas"
        class:previewing
        style={themeStyle(game.theme)}
        bind:this={canvasEl}
        tabindex="0"
        data-keys-home
        ondragover={(e) => e.preventDefault()}
        {ondrop}
        onpointerdown={(e) => e.target === canvasEl && (selected = [])}
        oncontextmenu={(e) => e.target === canvasEl && e.preventDefault()}
        onclick={() => previewing && togglePreview()}
        role="region"
        aria-label="Slide canvas. Tab and Shift+Tab pick the items on it, Shift+F10 opens the menu for the selection. Drop files or links here."
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
                endDrag?.();
                endDrag = undoApi.begin();
              }}
              onchange={() => {
                endDrag?.();
                endDrag = null;
              }}
              ondblclick={(el) => (el.kind === 'text' ? focusText(false) : el.kind === 'image' && (editingImage = el.id))}
            />
            {#if drawing}<DrawLayer ondone={addDrawing} oncancel={() => (drawing = false)} />{/if}
          {/if}
        </Stage>
        {#if previewing}
          <!-- A click on the slide stops the preview. A YouTube embed keeps its own clicks (they stay
               inside its frame), so it can still be started or paused here. -->
          <div class="ribbon preview">PREVIEW · click to stop</div>
        {:else if drawing}
          <div class="ribbon drawing">✏ DRAWING · drag to draw a line · hold Shift as you let go to close it · Esc to stop</div>
        {:else if badge}
          <div class="ribbon">{badge}</div>
        {/if}
        {#if notice && notice.at === undoApi.top && !undoApi.pending && !previewing}
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
                }}>↶ Undo</button>
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <aside class="side">
      <!-- Whenever the slide has anything: the keyboard way to every item (and a lone locked one, which clicks go through). -->
      {#if !previewing && slide.elements.length}
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
          onreplace={(from) => {
            if (single && (single.kind === 'image' || single.kind === 'video' || single.kind === 'audio')) {
              replacing = single.id;
              picker = single.kind;
              pickerFrom = from;
            }
          }}
          onapplystyle={styletargets ? applyStyle : undefined}
          {stylecategory}
          onuploadfont={(from) => {
            replacing = null;
            picker = 'font';
            pickerFrom = from;
          }}
          oneditimage={single.kind === 'image' ? () => (editingImage = single!.id) : undefined}
          onedit={edit}
          {objectsection}
          aligns={lineUp}
        />
        {#if picker && replacing === single.id}
          <MediaPicker kind={picker} anchor={pickerFrom} onpick={picked} onclose={() => ((picker = null), (replacing = null))} />
        {/if}
      {:else if selected.length > 1}
        {@const els = slide.elements.filter((e) => selected.includes(e.id))}
        {@const lockedN = els.filter((e) => e.locked).length}
        <!-- The same controls, in the same places, as the Inspector's Position for one item. -->
        <section class="multi">
          <p class="muted">{selected.length} items selected.</p>
          {@render lineUp()}
          <div class="row">
            <button class="small" onclick={() => order('front')} title="Bring them to the front (Ctrl+Shift+])">⤒ Front</button>
            <button class="small" onclick={() => order('up')} aria-label="Bring forward" title="Bring forward (Ctrl+])">↑</button>
            <button class="small" onclick={() => order('down')} aria-label="Send backward" title="Send backward (Ctrl+[)">↓</button>
            <button class="small" onclick={() => order('back')} title="Send them to the back (Ctrl+Shift+[)">⤓ Back</button>
          </div>
          <div class="row">
            <label class="check" title="Locked items can't be moved, resized, nudged or deleted, and clicks on the slide go through them">
              <input
                type="checkbox"
                checked={lockedN === els.length}
                indeterminate={lockedN > 0 && lockedN < els.length}
                onchange={(e) => menuAction(e.currentTarget.checked ? 'lock' : 'unlock')}
              /> Lock
            </label>
            <span class="spacer"></span>
            <button class="small" onclick={duplicate} title="Ctrl+D">⧉ Duplicate</button>
            <button class="ghost small danger" onclick={() => remove()} title="Delete them (Del)">🗑 Delete</button>
          </div>
        </section>
      {:else}
        <Tips id="slide" hint="Click an item to edit it, or double-click it (text goes straight to its text field).">
          <ul>
            <li>Drag to move (press Shift while dragging to keep to one axis), pull the handles to resize, and use the round handle to rotate.</li>
            <li>Drop or paste images, video, audio and links. Ctrl+C / Ctrl+X / Ctrl+V copy items between slides.</li>
            <li>Shift-click or drag a box on an empty spot (or beside a text box's words; Alt+drag always draws one) to select several.</li>
            <li>
              Something hidden under a bigger item? <b>Right-click</b> to pick from everything under the pointer, <b>Alt+click</b> again
              and again to walk down the stack, <b>Tab</b> to step through items, or use the <b>Layers</b> list. Lock a background so
              clicks go through it.
            </li>
          </ul>
        </Tips>
      {/if}
      {#if picker === 'font'}
        <MediaPicker kind="font" anchor={pickerFrom} onpick={(id) => ((picker = null), addMedia('font', id))} onclose={() => (picker = null)} />
      {/if}
    </aside>
  </div>
</div>

<!-- One item goes to the slide's edges (in the Inspector's Position, under X and Y); several line up with each other
     (and can be spaced evenly). -->
{#snippet lineUp()}
  <div class="aligns">
    {#if selected.length > 1}
      <span class="muted small">Line up the selected items…</span>
      <div class="agrid">
        <button class="small" onclick={() => align('left')} aria-label="Line up their left edges">Left</button>
        <button class="small" onclick={() => align('hcenter')} aria-label="Line up their middles across">Center</button>
        <button class="small" onclick={() => align('right')} aria-label="Line up their right edges">Right</button>
        <button class="small" onclick={() => align('top')} aria-label="Line up their top edges">Top</button>
        <button class="small" onclick={() => align('vcenter')} aria-label="Line up their middles down">Middle</button>
        <button class="small" onclick={() => align('bottom')} aria-label="Line up their bottom edges">Bottom</button>
      </div>
      {#if selected.length > 2}
        <div class="agrid two">
          <button class="small" onclick={() => align('hdistribute')} title="The outermost two stay; the gaps between them all become equal">↔ Space evenly</button>
          <button class="small" onclick={() => align('vdistribute')} title="The outermost two stay; the gaps between them all become equal">↕ Space evenly</button>
        </div>
      {/if}
    {:else}
      <span class="muted small">Move to the slide's…</span>
      <div class="agrid">
        <button class="small" onclick={() => align('left')} aria-label="Move to the slide's left edge">Left</button>
        <button class="small" onclick={() => align('hcenter')} aria-label="Center across the slide">Center</button>
        <button class="small" onclick={() => align('right')} aria-label="Move to the slide's right edge">Right</button>
        <button class="small" onclick={() => align('top')} aria-label="Move to the slide's top edge">Top</button>
        <button class="small" onclick={() => align('vcenter')} aria-label="Center down the slide">Middle</button>
        <button class="small" onclick={() => align('bottom')} aria-label="Move to the slide's bottom edge">Bottom</button>
      </div>
    {/if}
  </div>
{/snippet}

{#if drawpad}
  <DrawPad oninsert={insertDrawing} oncancel={() => (drawpad = false)}>
    {#snippet backdrop()}<Stage><SlideView {slide} mode="edit" /></Stage>{/snippet}
  </DrawPad>
{/if}

<style>
  .se {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
    /* What stacks inside (items, their frames, the drawing layer, its notes and menus) stays inside: none of it goes
       over the app's notes, toasts or windows. */
    isolation: isolate;
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
  }
  /* One size all along the toolbar (a round's own tools too): small, so the slide keeps the room. */
  .toolbar :global(button:not(:is(.menu, .linkbox) button)) {
    padding: 2px 8px;
    font-size: 12px;
  }
  .pop {
    position: relative;
  }
  /* The Shape ▾ and Background ▾ menus and the 🌐 Link box: placed by anchored.ts (fixed to the window, over
     everything, scrolling inside on a short window). */
  .menu {
    overflow: auto;
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
  /* A click anywhere else closes the Shape menu. */
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 49;
  }
  .right {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-left: auto;
  }
  .hide {
    visibility: hidden;
  }
  .swap {
    display: inline-grid;
    justify-items: center;
  }
  .swap > span {
    grid-area: 1 / 1;
  }
  .linkbox {
    width: 360px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  }
  .sep {
    width: 8px;
  }
  .swatch {
    display: inline-block;
    width: 12px;
    height: 12px;
    margin-right: 4px;
    vertical-align: -1px;
    border-radius: 3px;
    border: 1px solid var(--control-border);
  }
  .bg-menu {
    min-width: 200px;
    gap: 4px;
  }
  .bg-menu .check {
    padding: 2px 4px;
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
  .canvas:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
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
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .agrid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
  }
  /* Several items: laid out as the Inspector's sections are. */
  .multi {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .multi p {
    margin: 0;
  }
  .agrid.two {
    grid-template-columns: 1fr 1fr;
  }
  .layers-box {
    margin-bottom: 12px;
  }
  .layers-box summary {
    cursor: pointer;
    margin-bottom: 6px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
  }
  .layers-box :global(.layers) {
    max-height: 190px;
    overflow-y: auto;
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
  .ribbon.preview,
  .ribbon.drawing {
    background: var(--accent-fill);
    color: #fff;
  }
  .notice {
    position: absolute;
    left: 50%;
    bottom: calc(var(--pb) + 10px);
    translate: -50% 0;
    /* The same pill as the editor's "Deleted … · Undo" note (app.css .note-pill). */
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 4px 6px 4px 16px;
    border-radius: 20px;
    background: var(--panel-2);
    border: 1px solid var(--control-border);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45);
    font-size: 13px;
    white-space: nowrap;
    z-index: 2000;
  }

  /* In the clue editor: take the remaining height and fit the slide to width AND height, so it never
     spills over the fields around it on a laptop screen. */
  .se.fill {
    flex: 1 1 0;
    min-height: 300px;
    container-type: size;
  }
  .fill .body {
    flex: 1 1 0;
    grid-template-rows: minmax(0, 1fr);
    /* The slide's column is no wider than the slide gets at this height (100cqh is the whole editor: about
       40px of it is the toolbar, and 30px the pasteboard around the slide), so the inspector takes the
       rest instead of leaving a gap beside the slide. */
    grid-template-columns: minmax(0, calc((100cqh - 70px) * 16 / 9 + 30px)) minmax(300px, 1fr);
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
      grid-template-columns: 1fr;
    }
    .se.fill,
    .fill .cell {
      container-type: normal;
    }
    .fill .canvas {
      width: calc(100% - 2 * var(--pb));
    }
  }
</style>
