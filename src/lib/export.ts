// Standalone player-only HTML export (spec §2, §8): this very app file plus the game pack embedded
// as base64. When opened it detects the pack and starts in player mode.
import { buildPack, CUT_OFF, type PackProgress } from './pack';
import { safeFilename, saveFile, savedWhere } from './fileio';
import { ask, tell } from './ask.svelte';
import { notWritingWhile } from './desktop.svelte';
import { formatBytes } from './media.svelte';
import type { Game } from './model';
import { onlineCount } from './usage';

export const PACK_ELEMENT_ID = 'jb-pack';

/**
 * The longest game pack (base64) an exported HTML file may carry. A browser can't read a longer one out of the page
 * (Chromium's longest text is about 537 million characters): the file would open as an empty editor.
 */
export const MAX_PACK_CHARS = 500_000_000;
/** The longest file Open… can read as text (an exported .html): a longer one can't be read at all. */
export const MAX_HTML_CHARS = 2 ** 29 - 24;

/** Said when a game is too big to go in (or come out of) one HTML file. */
export const TOO_BIG = 'Too big for one HTML file — Save a .brainrot instead (it opens in the desktop app or this page).';

/** Said to someone opening an exported game this browser can't read (it's whole, but too big for it). */
export const TOO_BIG_TO_OPEN =
  "This game is too big for this browser to open. Try it in Chrome or Edge on a computer, or ask whoever sent it for the .brainrot file instead (it opens in the Brainrot Games Maker builder or desktop app).";

/** How long a pack of `bytes` is in base64. */
export const base64Length = (bytes: number): number => Math.ceil(bytes / 3) * 4;

/** A pack of `bytes` is too big for an exported HTML file (see MAX_PACK_CHARS). */
export const tooBigForHtml = (bytes: number): boolean => base64Length(bytes) > MAX_PACK_CHARS;

/** The embedded pack (base64 zip) if this page is an exported game. */
export function embeddedPack(): string | null {
  try {
    return document.getElementById(PACK_ELEMENT_ID)?.textContent?.trim() || null;
  } catch {
    // Too long to read.
    return null;
  }
}

/**
 * This page is an exported game whose pack can't be read (too big for the browser, or not there at all): what to say
 * in place of the game. Null: it isn't one (embeddedPack has its pack, or it's the app itself).
 */
export function unreadablePack(): string | null {
  const el = document.getElementById(PACK_ELEMENT_ID);
  if (!el || embeddedPack()) return null;
  const size = Number(el.dataset.size);
  return !size || size > MAX_PACK_CHARS ? TOO_BIG_TO_OPEN : CUT_OFF;
}

/**
 * The game pack (base64) inside an exported game's HTML file, for Open… (null: it has none), and whether the file is cut
 * off (exports say how long their pack is, see packInfo).
 */
export function packInHtml(html: string): { pack: string; cut: boolean } | null {
  // The pack comes last, after the app's own code. Its tag may carry data-size and data-exported after the id.
  const tags = [...html.matchAll(new RegExp(`<script\\b[^>]*\\bid="${PACK_ELEMENT_ID}"[^>]*>`, 'g'))];
  const tag = tags[tags.length - 1];
  if (!tag) return null;
  const from = tag.index + tag[0].length;
  const end = html.indexOf('</script>', from);
  const pack = (end < 0 ? html.slice(from) : html.slice(from, end)).trim();
  if (!pack) return null;
  const size = Number(/\bdata-size="(\d+)"/.exec(tag[0])?.[1]);
  return { pack, cut: end < 0 || (!!size && pack.length < size) };
}

/**
 * About the embedded pack: when it was exported (each export keeps its own game in progress), and whether the file is
 * cut off (it says how long its pack is; files exported before that can't tell).
 */
export function packInfo(): { exported: string | null; cut: boolean } {
  const el = document.getElementById(PACK_ELEMENT_ID);
  const size = Number(el?.dataset.size);
  return { exported: el?.dataset.exported ?? null, cut: !!size && (el?.textContent?.trim().length ?? 0) < size };
}

/**
 * The buzzer server the exported file was made with (⚙ Settings › Buzzer server in the builder), so phone buzzers work
 * in it on any computer. '' when it has none (or isn't an exported game).
 */
export function embeddedBuzzerServer(): string {
  try {
    const url = document.getElementById(PACK_ELEMENT_ID)?.dataset.buzzer?.trim() ?? '';
    return /^https?:\/\//i.test(url) ? url : '';
  } catch {
    return '';
  }
}

/** Text for an HTML attribute's value (in double quotes). */
const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export async function unpackEmbedded(b64: string, cut = false): Promise<Blob> {
  if (cut) throw new Error(CUT_OFF);
  // fetch() on a data: URL decodes large base64 far more efficiently than atob().
  // The file is whole (cut off is said above): failing here is this browser running out of room for it.
  const res = await fetch(`data:application/zip;base64,${b64}`).catch(() => null);
  if (!res?.ok) throw new Error(TOO_BIG_TO_OPEN);
  return res.blob().catch(() => {
    throw new Error(TOO_BIG_TO_OPEN);
  });
}

/**
 * Base64 of a Blob as byte pieces (3 MB of input each): no single huge string is ever built, and each
 * piece is turned into bytes as it's made, so the final Blob doesn't have to encode it all at once.
 */
async function base64Pieces(blob: Blob): Promise<Uint8Array<ArrayBuffer>[]> {
  const STEP = 3 * 1024 * 1024; // a multiple of 3, so the pieces join without padding in between
  const enc = new TextEncoder();
  const out: Uint8Array<ArrayBuffer>[] = [];
  for (let at = 0; at < blob.size; at += STEP) {
    out.push(enc.encode(await blobToBase64(blob.slice(at, at + STEP))) as Uint8Array<ArrayBuffer>);
    await new Promise((r) => setTimeout(r, 0));
  }
  return out;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * Shown while a big exported file is still being read, before the app starts (the app only runs once the whole page,
 * pack and all, is read).
 */
// After a while, a line for a viewer that never runs the app (an email or phone preview): no script needed to show it.
const LOADING_HTML =
  '<style>@keyframes jb-late{to{opacity:1}}</style>' +
  '<div style="display:grid;place-items:center;height:100%;padding:16px;text-align:center;color:#9aa3b5;font:16px system-ui,sans-serif">' +
  '<div>Loading the game…<br><small>Big games can take a minute to open.</small>' +
  '<br><small style="opacity:0;animation:jb-late 0s 20s forwards">Still loading? Save this file and open it in Chrome, Edge or Firefox on a computer (a preview can’t play it).</small>' +
  '</div></div>';

/** This app's own HTML (the single file), without runtime DOM or a previously embedded game. */
function selfHtml(): string {
  const root = document.documentElement.cloneNode(true) as HTMLElement;
  const app = root.querySelector('#app');
  if (app) app.innerHTML = LOADING_HTML;
  root.querySelector(`#${PACK_ELEMENT_ID}`)?.remove();
  // Not this page's own leftovers: its screen-reader line (it would say the last toast again) and its classes.
  root.querySelector('#live-region')?.remove();
  root.removeAttribute('class');
  return '<!doctype html>\n' + root.outerHTML;
}

const WARN = 100 * 1024 ** 2;
const STRONG = 250 * 1024 ** 2;

/** `buzzer`: the buzzer server the exported file uses for phone buzzers ('' for none). */
export async function exportStandaloneHtml(
  game: Game,
  onProgress?: PackProgress,
  buzzer = '',
): Promise<{ size: number; missing: string[]; online: number; where: string } | null> {
  const { blob: pack, missing } = await buildPack(game, onProgress);
  if (tooBigForHtml(pack.size)) {
    await notWritingWhile(() => tell(`${TOO_BIG}\n\nThis game's HTML file would be about ${formatBytes(base64Length(pack.size))}.`));
    return null;
  }
  // base64 grows the pack by a third.
  const estimate = Math.round(pack.size * 1.34);
  const anyway = { ok: 'Export anyway', cancel: 'Cancel' };
  // Nothing is written while it asks (closing the app meanwhile doesn't wait for an answer).
  const sure = (q: string) => notWritingWhile(() => ask(q, anyway));
  if (estimate > STRONG && !(await sure(`This HTML file will be about ${formatBytes(estimate)}. Files this big can take a long time to open and may crash some browsers.\n\nFor big games, sharing the .brainrot pack is better. Export anyway?`))) return null;
  if (estimate > WARN && estimate <= STRONG && !(await sure(`This HTML file will be about ${formatBytes(estimate)} and may be slow to open. Export anyway?`))) return null;
  const html = selfHtml();
  const cut = html.lastIndexOf('</body>');
  const [head, tail] = cut < 0 ? [html, ''] : [html.slice(0, cut), html.slice(cut)];
  // Built from pieces: one giant string could exceed the browser's string limit and freeze the page. It says how long
  // the pack is (so a cut-off copy can tell) and when it was exported.
  const pieces = await base64Pieces(pack);
  const size = pieces.reduce((n, p) => n + p.length, 0);
  const server = buzzer ? ` data-buzzer="${attr(buzzer)}"` : '';
  const open = `<script type="application/octet-stream" id="${PACK_ELEMENT_ID}" data-size="${size}" data-exported="${Date.now()}"${server}>`;
  const out = new Blob([head, open, ...pieces, '</script>\n', tail], { type: 'text/html' });
  const name = `${safeFilename(game.title)}.html`;
  const where = savedWhere(await saveFile(name, out, game.id), name);
  return { size: out.size, missing, online: onlineCount(game), where };
}
