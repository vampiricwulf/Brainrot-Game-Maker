/**
 * The phone's card panel (partner-clues spec §12.3, §13.5, §14.6, §16): the private cards the host sent to this phone,
 * newest first, each behind "Tap to see" with 🙈 Hide. Built with createElement and textContent only, never innerHTML.
 *
 * - Pictures, GIFs, videos and sounds from a link load from that link (a picture with no referrer); the host's own
 *   files are fetched from the room with this phone's token in a header (never in an address), and shown from blob:
 *   addresses that are revoked once no card uses that file. A file on its way shows "🖼 Picture coming…" and fills in.
 * - A YouTube, Drive or Streamable player is framed only when its play button is tapped, and taken down on Hide.
 * - Video plays muted and inline once the card is open ("🔊 Tap for sound"); sound waits for a tap. With reduced
 *   motion, video doesn't start by itself and a GIF shows still with "▶ Play".
 * - Cards live in memory only. A card that goes is taken down: its players stopped, its frames removed.
 * - A card is drawn again only when its words changed (the lines over its cover change in place), so a playing video
 *   or an open player isn't reset. An open card sent again under a new id (↻ Send again) stays open, as it was.
 */
import { cardLink, filesUrl, isFileId, type CardMedia, type PhoneCard } from '../../src/lib/buzzproto';
import { imageFallback } from '../../src/lib/links';
import { arrivedLine, bigWords, brokenLine, cardBuild, cardHead, cardSame, comingLine, filesIn, isGif, mediaName, missingLine, playerSrc, retryAfter, roleLine } from './cards';

/** What the panel needs from the page. */
export interface PanelHost {
  /** The room's code, and this phone's seat or member token (null: it holds none). */
  code(): string;
  token(): string | null;
  /** Tells the room this card was seen; false when that can't go now (not connected): it's tried again on the next draw. */
  seen(id: string): boolean;
  /** "Tap" (a touch screen) or "Click" (a mouse). */
  tap(s: string): string;
  /** Says a short line to a screen reader, once. */
  news(s: string): void;
  /** A file came (or won't): draw the page again. */
  redraw(): void;
}

/** A card file this phone fetched (or is fetching), shared by every card that uses it. */
interface FileEntry {
  state: 'loading' | 'ok' | 'failed';
  /** Its blob: address, once here. */
  url?: string;
  tries: number;
  ctrl?: AbortController;
  timer?: number;
}

/** One picture, video, sound or embed as drawn. */
interface Slot {
  /** What it was drawn from (drawn again when that changes). */
  key: string;
  el: HTMLElement;
  /** The item itself, a "… coming" line (said once what it waits for arrives in an open card), or a line saying it won't come. */
  shows: 'media' | 'wait' | 'gone';
  kind: CardMedia['kind'];
  /** The card opened: a video starts (muted). */
  start?(): void;
  /** The card was hidden: players stop, a frame goes back to its play button. */
  stop?(): void;
  /** Taken down for good. */
  drop?(): void;
}

interface Drawn {
  /** The id it's drawn under now (↻ Send again moves an open card to its new id). */
  id: string;
  /** What its cover and words were built from (cardBuild), and all it shows (cardSame). */
  key: string;
  same: string;
  el: HTMLElement;
  /** The lines over the cover: who can see it, its part, its hint (none: not there). */
  head: HTMLElement;
  role: HTMLElement | null;
  hint: HTMLElement | null;
  cover: HTMLButtonElement | null;
  body: HTMLElement;
  items: HTMLElement;
  shownLine: HTMLElement;
  slots: Slot[];
  /** Where the keys (and a screen reader) go when it opens: its words, else the card's contents. */
  focusIn: HTMLElement;
}

let host: PanelHost | null = null;
const drawn = new Map<string, Drawn>();
/** Cards opened with Tap to see (Hide shuts them again). */
const opened = new Set<string>();
/** Cards the room was told this phone saw. */
const told = new Set<string>();
/** Every card this page has drawn: a card new to it buzzes the phone once. */
const known = new Set<string>();
const files = new Map<string, FileEntry>();
let uid = 0;

export function initCards(h: PanelHost): void {
  host = h;
}

const reduced = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** A button whose words say "Tap" on a touch screen and "Click" with a mouse (kept up to date by retapCards). */
function tapButton(cls: string, words: string): HTMLButtonElement {
  const b = el('button', cls);
  b.type = 'button';
  b.dataset.tap = words;
  b.textContent = host!.tap(words);
  return b;
}

/** The pointer changed (a tablet got a mouse): "Tap" and "Click" follow. */
export function retapCards(box: HTMLElement): void {
  for (const b of box.querySelectorAll<HTMLElement>('[data-tap]')) b.textContent = host!.tap(b.dataset.tap!);
}

/** Words as the player wrote them: right-to-left ones too. */
function words(e: HTMLElement): HTMLElement {
  e.dir = 'auto';
  return e;
}

/**
 * Draws `list` (as the room sends it: newest last) into `box`, newest first, and lets go of cards that went. Returns
 * the ids of cards this page hadn't drawn before (the phone buzzes; the keys may go to the newest one).
 */
export function drawCards(box: HTMLElement, list: readonly PhoneCard[]): string[] {
  const ids = new Set(list.map((c) => c.id));
  // An open card that goes as the same card comes under a new id (↻ Send again, for a phone that joined late) stays
  // here as it is, open, its players carrying on and the keys still in it, without buzzing again; the room hears it
  // was seen. Kept aside until then (and taken down after, if it doesn't come back).
  const going = new Map<string, Drawn>();
  for (const [id, d] of drawn)
    if (!ids.has(id)) {
      if (opened.has(id) && !going.has(d.same)) going.set(d.same, d);
      else dropCard(id, d);
    }
  const fresh: string[] = [];
  const order: HTMLElement[] = [];
  for (const c of [...list].reverse()) {
    let d = drawn.get(c.id);
    const key = cardBuild(c);
    const same = cardSame(c);
    const had = !!d && d.el.contains(document.activeElement);
    // (Its words changed under the same id: drawn again, staying open if it was, the keys still in it.)
    if (d && d.key !== key) {
      takeDown(d);
      d.el.remove();
      d = undefined;
    }
    if (!d) {
      const back = going.get(same);
      if (back) {
        // The same open card under its new id: only its id changes.
        going.delete(same);
        drawn.delete(back.id);
        opened.delete(back.id);
        back.id = back.el.dataset.card = c.id;
        drawn.set(c.id, back);
        opened.add(c.id);
        d = back;
      } else {
        // A file that didn't load for an earlier card is tried again for this one (↻ Send again: a new id, the same file).
        for (const m of c.media ?? []) if ('file' in m && files.get(m.file)?.state === 'failed') files.delete(m.file);
        d = build(c, key, same);
        drawn.set(c.id, d);
        if (!known.has(c.id)) fresh.push(c.id);
      }
      known.add(c.id);
    }
    // (Its lines over the cover may have changed in place.)
    d.same = same;
    update(c, d);
    if (had && !d.el.contains(document.activeElement)) (opened.has(c.id) || !d.cover ? d.focusIn : d.cover).focus({ preventScroll: true });
    order.push(d.el);
  }
  for (const d of going.values()) dropCard(d.id, d);
  // Into place without moving the cards already there (a moved frame would load again).
  order.forEach((e, i) => {
    if (box.children[i] !== e) box.insertBefore(e, box.children[i] ?? null);
  });
  keepFiles(filesIn(list));
  return fresh;
}

/** Every card goes (the phone left its seat, the game ended…). */
export function clearCards(box: HTMLElement): void {
  for (const [id, d] of drawn) dropCard(id, d);
  box.replaceChildren();
  keepFiles(new Set());
}

/** Where the keys go when card `id` arrives: its Tap to see (or its words, when it has no cover). */
export function cardFocus(id: string): HTMLElement | null {
  const d = drawn.get(id);
  return d ? (d.cover && !d.cover.hidden ? d.cover : d.focusIn) : null;
}

/** Every open card behind its cover again (its players stopped): the cards make way for the buzzer. */
export function coverCards(): void {
  for (const [id, d] of drawn) if (d.cover && opened.delete(id)) open(id, d, false);
}

function dropCard(id: string, d: Drawn): void {
  takeDown(d);
  d.el.remove();
  drawn.delete(id);
  opened.delete(id);
}

function takeDown(d: Drawn): void {
  for (const s of d.slots) s.drop?.();
  d.slots = [];
}

function build(c: PhoneCard, key: string, same: string): Drawn {
  const art = el('article', 'card');
  art.dataset.card = c.id;
  // (The lines over its cover get their words in update.)
  const head = el('h2', 'card-head');
  head.id = `card-${++uid}`;
  art.setAttribute('aria-labelledby', head.id);
  art.append(head);
  const shownLine = el('p', 'card-shown', 'The answer’s on screen');
  art.append(shownLine);
  const body = el('div', 'card-body');
  body.hidden = true;
  body.tabIndex = -1;
  let focusIn: HTMLElement = body;
  if (c.title) body.append(words(el('p', `card-title${bigWords(c.title) ? ' huge' : ''}`, c.title)));
  if (c.text) body.append(words(el('p', `card-words${!c.title && bigWords(c.text) ? ' huge' : ''}`, c.text)));
  const first = body.firstElementChild;
  if (first instanceof HTMLElement) {
    first.tabIndex = -1;
    focusIn = first;
  }
  const items = el('div', 'card-items');
  body.append(items);
  let cover: HTMLButtonElement | null = null;
  const d: Drawn = { id: c.id, key, same, el: art, head, role: null, hint: null, cover, body, items, shownLine, slots: [], focusIn };
  if (c.tap !== false) {
    cover = d.cover = tapButton('card-cover', 'Tap to see');
    // A tap landing just as it comes was meant for what was there a moment ago (BUZZ!, a box's Send answer): for a
    // moment it goes to the card around it, not the cover. (A Space press from before it came: the page's keyup listener.)
    cover.classList.add('just-in');
    setTimeout(() => cover!.classList.remove('just-in'), 800);
    const hide = el('button', 'card-hide', '🙈 Hide');
    hide.type = 'button';
    body.append(hide);
    // The keys (and a screen reader, which reads the words out) follow: into the card as it opens, back to its cover as
    // it hides. Not after a mouse click that left them elsewhere (on a computer, Space stays where it was).
    const follow = (e: MouseEvent, had: boolean) => had || (e as PointerEvent).pointerType !== 'mouse';
    cover.addEventListener('click', (e) => {
      const had = document.activeElement === cover;
      opened.add(d.id);
      open(d.id, d, true);
      if (follow(e, had)) d.focusIn.focus({ preventScroll: true });
      // The browser can hold what's under the card still as it opens (scroll anchoring, on a page scrolled to its end),
      // throwing its words off the top of the screen: back into view.
      requestAnimationFrame(() => {
        if (d.body.getBoundingClientRect().top < 0) d.body.scrollIntoView({ block: 'start' });
      });
    });
    hide.addEventListener('click', (e) => {
      const had = d.body.contains(document.activeElement);
      opened.delete(d.id);
      open(d.id, d, false);
      if (follow(e, had)) cover!.focus();
    });
    art.append(cover);
  }
  art.append(body);
  return d;
}

/** Shows or covers card `id`'s contents (starting or stopping its players); seen, once opened. */
function open(id: string, d: Drawn, on: boolean): void {
  const was = !d.body.hidden;
  d.body.hidden = !on;
  if (d.cover) d.cover.hidden = on;
  if (on && !was) for (const s of d.slots) s.start?.();
  if (!on) for (const s of d.slots) s.stop?.();
  if (on && !told.has(id) && host!.seen(id)) told.add(id);
}

/** One of the lines over the cover, after `after`: made, changed or taken out (no words) in place. */
function overLine(e: HTMLElement | null, cls: string, text: string, after: HTMLElement): HTMLElement | null {
  if (!text) {
    e?.remove();
    return null;
  }
  if (!e) after.after((e = words(el('p', cls))));
  if (e.textContent !== text) e.textContent = text;
  return e;
}

function update(c: PhoneCard, d: Drawn): void {
  const head = cardHead(c);
  if (d.head.textContent !== head) d.head.textContent = head;
  d.role = overLine(d.role, 'card-role', c.role ? roleLine(c.role) : '', d.head);
  d.hint = overLine(d.hint, 'card-hint', c.hint ?? '', d.role ?? d.head);
  d.shownLine.hidden = c.open;
  const isOpen = c.tap === false || opened.has(c.id);
  const media = c.media ?? [];
  if (d.slots.length !== media.length) {
    takeDown(d);
    d.items.replaceChildren();
  }
  // (Players that come while it's open start now; the rest start as it opens.)
  const showing = !d.body.hidden;
  const slots = media.map((m, i) => {
    const key = slotKey(m);
    const was = d.slots[i];
    if (was?.key === key) return was;
    const s = slotFor(m, key);
    if (was) {
      was.drop?.();
      was.el.replaceWith(s.el);
      // A file that was on its way, in a card that's open: said once it's here.
      if (was.shows === 'wait' && s.shows === 'media' && isOpen) host!.news(arrivedLine(was.kind));
    } else d.items.append(s.el);
    if (showing && isOpen) s.start?.();
    return s;
  });
  d.slots = slots;
  open(c.id, d, isOpen);
}

/** What an item is drawn from: its own fields, and for a file, how its download stands. */
function slotKey(m: CardMedia): string {
  if (!('file' in m) || !isFileId(m.file)) return JSON.stringify(m);
  const f = fetchFile(m.file);
  return JSON.stringify([m, f.state, f.url ?? '']);
}

/** A line in an item's place: on its way ('wait'), or not coming ('gone'). */
function line(shows: 'wait' | 'gone', kind: CardMedia['kind'], text: string): Slot {
  return { key: '', el: el('p', shows === 'wait' ? 'card-wait' : 'card-gone', text), shows, kind };
}

function slotFor(m: CardMedia, key: string): Slot {
  let s: Slot;
  if ('missing' in m) s = line('gone', m.kind, missingLine(m.kind));
  else if ('pending' in m) s = line('wait', m.kind, comingLine(m.kind));
  else if (m.kind === 'embed') s = embedSlot(m);
  else if ('file' in m) {
    // (The room checked these; the phone checks them again before loading anything: a file's id goes in an address.)
    const f = isFileId(m.file) ? files.get(m.file) : undefined;
    s = !isFileId(m.file)
      ? line('gone', m.kind, brokenLine(m.kind))
      : f?.state === 'ok' && f.url
        ? mediaSlot(m, f.url, false)
        : f?.state === 'failed'
          ? line('gone', m.kind, brokenLine(m.kind))
          : line('wait', m.kind, comingLine(m.kind));
  } else {
    const url = cardLink(m.url);
    s = url ? mediaSlot(m, url, true) : line('gone', m.kind, brokenLine(m.kind));
  }
  s.key = key;
  return s;
}

/** A picture, GIF, video or sound, from a link (`online`) or a file's blob: address. */
function mediaSlot(m: Extract<CardMedia, { kind: 'image' | 'video' | 'audio' }>, src: string, online: boolean): Slot {
  const box = el('div', 'card-item');
  let gone = false;
  const broken = () => {
    if (!gone) box.replaceChildren(el('p', 'card-gone', brokenLine(m.kind)));
  };
  if (m.kind === 'image') {
    const img = el('img', '');
    img.alt = mediaName(m);
    img.referrerPolicy = 'no-referrer';
    img.decoding = 'async';
    let fellBack = false;
    img.addEventListener('error', () => {
      // A Drive picture tries its thumbnail before giving up.
      const next = online && !fellBack ? imageFallback(img.src) : null;
      if (next) {
        fellBack = true;
        img.src = next;
      } else broken();
    });
    img.src = src;
    if (isGif(m) && reduced()) stillGif(box, img);
    else box.append(img);
    return { key: '', el: box, shows: 'media', kind: m.kind, drop: () => void (gone = true) };
  }
  const player = el(m.kind, '');
  player.controls = true;
  player.preload = 'metadata';
  player.setAttribute('aria-label', mediaName(m));
  playRange(player, 'start' in m ? m.start : undefined, 'end' in m ? m.end : undefined);
  player.addEventListener('error', broken);
  box.append(player);
  const stop = () => player.pause();
  const drop = () => {
    gone = true;
    player.pause();
    player.removeAttribute('src');
    player.load();
  };
  if (player instanceof HTMLVideoElement) {
    // Muted and inline, so it may start by itself; a tap brings the sound.
    player.muted = player.defaultMuted = true;
    player.playsInline = true;
    player.setAttribute('playsinline', '');
    const sound = tapButton('card-sound', '🔊 Tap for sound');
    sound.addEventListener('click', () => {
      player.muted = false;
      void player.play().catch(() => {});
    });
    player.addEventListener('volumechange', () => (sound.hidden = !player.muted));
    box.append(sound);
    player.src = src;
    return { key: '', el: box, shows: 'media', kind: m.kind, start: () => void (reduced() || player.play().catch(() => {})), stop, drop };
  }
  // A sound waits for a tap on its own play button.
  player.src = src;
  return { key: '', el: box, shows: 'media', kind: m.kind, stop, drop };
}

/** Reduced motion: a GIF shows its first frame, still, until "▶ Play". */
function stillGif(box: HTMLElement, img: HTMLImageElement): void {
  const still = el('canvas', 'card-still');
  still.setAttribute('role', 'img');
  still.setAttribute('aria-label', img.alt);
  img.hidden = true;
  img.addEventListener(
    'load',
    () => {
      still.width = img.naturalWidth;
      still.height = img.naturalHeight;
      still.getContext('2d')?.drawImage(img, 0, 0);
    },
    { once: true },
  );
  const play = el('button', 'card-sound', '▶ Play');
  play.type = 'button';
  play.setAttribute('aria-label', `▶ Play ${img.alt}`);
  play.addEventListener('click', () => {
    const had = document.activeElement === play;
    img.hidden = false;
    still.remove();
    play.remove();
    if (had) {
      img.tabIndex = -1;
      img.focus();
    }
  });
  box.append(still, img, play);
}

/** A video or sound plays from `start` and stops at `end` (seconds), then waits at the start again. */
function playRange(p: HTMLMediaElement, start?: number, end?: number): void {
  const from = start && start > 0 ? start : 0;
  if (from) p.addEventListener('loadedmetadata', () => void (p.currentTime < from && (p.currentTime = from)), { once: true });
  if (end && end > from)
    p.addEventListener('timeupdate', () => {
      if (p.currentTime < end) return;
      p.pause();
      p.currentTime = from;
    });
}

/** A YouTube, Drive or Streamable player: framed when its button is tapped, and back to the button when the card hides. */
function embedSlot(m: Extract<CardMedia, { kind: 'embed' }>): Slot {
  const p = playerSrc(m);
  if (!p) return line('gone', 'embed', brokenLine('embed'));
  const box = el('div', 'card-item card-embed');
  const play = el('button', 'card-play');
  play.type = 'button';
  const big = el('span', 'card-play-big', `▶ ${p.title}`);
  const small = el('span', 'card-play-small');
  small.dataset.tap = 'Tap to play';
  small.textContent = host!.tap('Tap to play');
  play.append(big, small);
  play.addEventListener('click', () => {
    const had = document.activeElement === play;
    const f = el('iframe', '');
    f.title = p.title;
    // As the app frames these players: YouTube won't play with no referrer at all (error 153), and this one sends only
    // the buzzer site's origin, never the page's address (it holds the room code).
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    f.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
    f.allowFullscreen = true;
    // The players need their scripts and their own site's storage; no way to move this page away.
    f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
    f.src = p.src;
    box.replaceChildren(f);
    if (had) f.focus();
  });
  box.append(play);
  const reset = () => {
    if (box.firstChild !== play) box.replaceChildren(play);
  };
  return { key: '', el: box, shows: 'media', kind: 'embed', stop: reset, drop: () => box.replaceChildren() };
}

// ---- card files ----

/** Card file `id`, fetched once (shared by every card that uses it). */
function fetchFile(id: string): FileEntry {
  let f = files.get(id);
  if (!f) {
    f = { state: 'loading', tries: 0 };
    files.set(id, f);
    void load(id, f);
  }
  return f;
}

/** Fetches a card file with this phone's token in a header (never in the address); tries again a few times if it can. */
async function load(id: string, f: FileEntry): Promise<void> {
  f.tries++;
  let status: number | null = null;
  const token = host!.token();
  if (token) {
    const ctrl = (f.ctrl = new AbortController());
    try {
      const r = await fetch(filesUrl(location.origin, host!.code(), id), {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
        credentials: 'omit',
        signal: ctrl.signal,
      });
      status = r.status;
      if (r.ok) {
        const blob = await r.blob();
        if (files.get(id) !== f) return;
        f.url = URL.createObjectURL(blob);
        f.state = 'ok';
        return host!.redraw();
      }
    } catch {
      if (ctrl.signal.aborted) return;
    }
  }
  if (files.get(id) !== f) return;
  const wait = retryAfter(status, f.tries);
  if (wait === null) {
    f.state = 'failed';
    return host!.redraw();
  }
  f.timer = window.setTimeout(() => void load(id, f), wait);
}

/** Back online: files that wouldn't come are tried again on the next draw. */
export function retryCardFiles(): void {
  for (const [id, f] of files) if (f.state === 'failed') files.delete(id);
}

/** Lets go of the files no card here uses any more: downloads stopped, blob: addresses revoked. */
function keepFiles(used: Set<string>): void {
  for (const [id, f] of files) {
    if (used.has(id)) continue;
    files.delete(id);
    f.ctrl?.abort();
    clearTimeout(f.timer);
    if (f.url) URL.revokeObjectURL(f.url);
  }
}
