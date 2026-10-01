// Standalone player-only HTML export (spec §2, §8): this very app file plus the game pack embedded
// as base64. When opened it detects the pack and starts in player mode.
import { buildPack, CUT_OFF, type PackProgress } from './pack';
import { safeFilename, saveFile, savedWhere } from './fileio';
import { formatBytes } from './media.svelte';
import type { Game } from './model';
import { onlineCount } from './usage';

export const PACK_ELEMENT_ID = 'jb-pack';

/** The embedded pack (base64 zip) if this page is an exported game. */
export function embeddedPack(): string | null {
  return document.getElementById(PACK_ELEMENT_ID)?.textContent?.trim() || null;
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

export async function unpackEmbedded(b64: string, cut = false): Promise<Blob> {
  if (cut) throw new Error(CUT_OFF);
  // fetch() on a data: URL decodes large base64 far more efficiently than atob().
  const res = await fetch(`data:application/zip;base64,${b64}`).catch(() => null);
  if (!res?.ok) throw new Error(CUT_OFF);
  return res.blob();
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
const LOADING_HTML =
  '<div style="display:grid;place-items:center;height:100%;padding:16px;text-align:center;color:#9aa3b5;font:16px system-ui,sans-serif">' +
  '<div>Loading the game…<br><small>Big games can take a minute to open.</small></div></div>';

/** This app's own HTML (the single file), without runtime DOM or a previously embedded game. */
function selfHtml(): string {
  const root = document.documentElement.cloneNode(true) as HTMLElement;
  const app = root.querySelector('#app');
  if (app) app.innerHTML = LOADING_HTML;
  root.querySelector(`#${PACK_ELEMENT_ID}`)?.remove();
  return '<!doctype html>\n' + root.outerHTML;
}

const WARN = 100 * 1024 ** 2;
const STRONG = 250 * 1024 ** 2;

export async function exportStandaloneHtml(
  game: Game,
  onProgress?: PackProgress,
): Promise<{ size: number; missing: string[]; online: number; where: string } | null> {
  const { blob: pack, missing } = await buildPack(game, onProgress);
  // base64 grows the pack by a third.
  const estimate = Math.round(pack.size * 1.34);
  if (estimate > STRONG && !confirm(`This HTML file will be about ${formatBytes(estimate)}. Files this big can take a long time to open and may crash some browsers.\n\nFor big games, sharing the .brainrot pack is better. Export anyway?`)) return null;
  if (estimate > WARN && estimate <= STRONG && !confirm(`This HTML file will be about ${formatBytes(estimate)} and may be slow to open. Export anyway?`)) return null;
  const html = selfHtml();
  const cut = html.lastIndexOf('</body>');
  const [head, tail] = cut < 0 ? [html, ''] : [html.slice(0, cut), html.slice(cut)];
  // Built from pieces: one giant string could exceed the browser's string limit and freeze the page. It says how long
  // the pack is (so a cut-off copy can tell) and when it was exported.
  const pieces = await base64Pieces(pack);
  const size = pieces.reduce((n, p) => n + p.length, 0);
  const open = `<script type="application/octet-stream" id="${PACK_ELEMENT_ID}" data-size="${size}" data-exported="${Date.now()}">`;
  const out = new Blob([head, open, ...pieces, '</script>\n', tail], { type: 'text/html' });
  const name = `${safeFilename(game.title)}.html`;
  const where = savedWhere(await saveFile(name, out), name);
  return { size: out.size, missing, online: onlineCount(game), where };
}
