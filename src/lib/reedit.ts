// 🖼 Media › Replace on a file some pictures show an edited copy of (🎨 Edit image): their edits are done again on the
// new file, so the slides show it (with the same crop, captions and stickers), not the old file's edited copy.
import { addMediaFile, mediaUrls } from './media.svelte';
import { canvasToBlob, loadImage, renderEdited } from './imageedit';
import { boardRounds, type Game, type ImageEl } from './model';
import { allSlides } from './usage';

/** Pictures (on slides, and the board's images) that show an edited copy of file `id`. */
export function editedUsers(game: Game, id: string): ImageEl[] {
  const els = [...allSlides(game).flatMap(({ slide }) => slide.elements), ...boardRounds(game).flatMap((r) => r.decor ?? [])];
  return els.filter((e): e is ImageEl => e.kind === 'image' && e.media === id && !!e.editedMedia);
}

/**
 * Redo the edits of every picture showing an edited copy of file `id` (just replaced) on its new bytes. Pictures with
 * the same edits share one new copy. One whose edits can't be redone shows the new file as it is.
 */
export async function redoEdits(game: Game, id: string): Promise<{ redone: number; plain: number }> {
  const users = editedUsers(game, id);
  if (!users.length) return { redone: 0, plain: 0 };
  const ref = game.media.find((m) => m.id === id);
  const plain = (e: ImageEl) => {
    e.editedMedia = undefined;
    e.edits = undefined;
  };
  let img: HTMLImageElement | null = null;
  try {
    img = await loadImage(mediaUrls[id]);
  } catch {
    img = null;
  }
  const made = new Map<string, string>();
  let redone = 0;
  let dropped = 0;
  for (const e of users) {
    if (!img || !e.edits || !ref) {
      plain(e);
      dropped++;
      continue;
    }
    const key = JSON.stringify(e.edits);
    try {
      let copy = made.get(key);
      if (!copy) {
        const canvas = renderEdited(img, JSON.parse(key), 1);
        const alpha = /png|gif|webp|svg/.test(ref.mime) || e.edits.rotate % 90 !== 0;
        const blob = await canvasToBlob(canvas, alpha ? 'image/png' : 'image/jpeg', 0.92);
        copy = (await addMediaFile(game, blob, `${ref.name.replace(/\.\w+$/, '')}-edited.${alpha ? 'png' : 'jpg'}`)).id;
        made.set(key, copy);
      }
      e.editedMedia = copy;
      redone++;
    } catch {
      plain(e);
      dropped++;
    }
  }
  return { redone, plain: dropped };
}
