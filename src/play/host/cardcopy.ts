// 📋 Copy picture (partner-clues spec §13.6): a 🤫 card's first picture as PNG, which pastes straight into a Discord DM,
// for a player with no phone here (or a buzzer server that puts no cards on phones). Nothing of it shows on screen: the
// toasts say who it's for, never what. Used by the partner clue's Distribute list, a tile's cards and 🤫 Send a card….
import { toast } from '../../lib/app.svelte';
import { mediaUrls } from '../../lib/media.svelte';
import type { Game, Slide } from '../../lib/model';
import { cardItems } from '../../lib/phonecard';

/** The browser can put a picture on the clipboard (to paste into a DM). */
export const canCopyPicture = typeof ClipboardItem !== 'undefined' && typeof navigator !== 'undefined' && !!navigator.clipboard?.write;

/** A picture as PNG (what pastes into a DM); a picture from a site that doesn't allow it can't be read back. */
function pngOf(src: string): Promise<Blob> {
  return new Promise((ok, fail) => {
    const img = new Image();
    if (!/^(blob|data):/.test(src)) img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      try {
        c.getContext('2d')?.drawImage(img, 0, 0);
        c.toBlob((b) => (b ? ok(b) : fail(new Error('no picture'))), 'image/png');
      } catch (e) {
        fail(e);
      }
    };
    img.onerror = () => fail(new Error('not loaded'));
    img.src = src;
  });
}

/** The card has a picture (or a GIF) to copy. */
export const hasPicture = (game: Pick<Game, 'media'>, card: Slide): boolean => cardItems(game, card).some((i) => i.kind === 'picture' || i.kind === 'gif');

/**
 * 📋 Copy picture: the card's first picture (or GIF, as a still). `what`: its name in the toasts ("Card 1"), `to`: who
 * it's for ("Bob").
 */
export async function copyCardPicture(game: Pick<Game, 'media'>, card: Slide, what: string, to: string): Promise<void> {
  const item = cardItems(game, card).find((i) => i.kind === 'picture' || i.kind === 'gif');
  const src = item && ((item.media && mediaUrls[item.media]) || item.url);
  if (!src) return toast(`${what}’s picture isn’t loaded here: open the game’s 🖼 Media to find it`, 4000);
  try {
    const png = await pngOf(src);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    toast(`${what}’s picture copied: paste it to ${to}`);
  } catch {
    toast(`Couldn’t copy ${what.charAt(0).toLowerCase()}${what.slice(1)}’s picture (its site doesn’t allow it): 📋 Copy words adds its link`, 5000);
  }
}
