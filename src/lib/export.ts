// Standalone player-only HTML export (spec §2, §8): this very app file plus the game pack embedded
// as base64. When opened it detects the pack and starts in player mode.
import { buildPack } from './pack';
import { downloadBlob, safeFilename } from './fileio';
import { formatBytes } from './media.svelte';
import type { Game } from './model';

export const PACK_ELEMENT_ID = 'jb-pack';

/** The embedded pack (base64 zip) if this page is an exported game. */
export function embeddedPack(): string | null {
  return document.getElementById(PACK_ELEMENT_ID)?.textContent?.trim() || null;
}

export async function unpackEmbedded(b64: string): Promise<Blob> {
  // fetch() on a data: URL decodes large base64 far more efficiently than atob().
  const res = await fetch(`data:application/zip;base64,${b64}`);
  return res.blob();
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** This app's own HTML (the single file), without runtime DOM or a previously embedded game. */
function selfHtml(): string {
  const root = document.documentElement.cloneNode(true) as HTMLElement;
  root.querySelector('#app')?.replaceChildren();
  root.querySelector(`#${PACK_ELEMENT_ID}`)?.remove();
  return '<!doctype html>\n' + root.outerHTML;
}

const WARN = 100 * 1024 ** 2;
const STRONG = 250 * 1024 ** 2;

export async function exportStandaloneHtml(game: Game): Promise<{ size: number; missing: string[] } | null> {
  const { blob: pack, missing } = await buildPack(game);
  // base64 grows the pack by a third.
  const estimate = Math.round(pack.size * 1.34);
  if (estimate > STRONG && !confirm(`This HTML file will be about ${formatBytes(estimate)}. Files this big can take a long time to open and may crash some browsers.\n\nFor big games, sharing the .jbr pack is better. Export anyway?`)) return null;
  if (estimate > WARN && estimate <= STRONG && !confirm(`This HTML file will be about ${formatBytes(estimate)} and may be slow to open. Export anyway?`)) return null;
  const b64 = await blobToBase64(pack);
  const html = selfHtml().replace(/<\/body>(?![\s\S]*<\/body>)/, `<script type="application/octet-stream" id="${PACK_ELEMENT_ID}">${b64}</script>\n</body>`);
  const out = new Blob([html], { type: 'text/html' });
  downloadBlob(`${safeFilename(game.title)}.html`, out);
  return { size: out.size, missing };
}
