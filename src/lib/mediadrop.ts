// A media slot (an item's icon, a player's picture, a sound, an open picker…) that takes a file dropped on it: it
// shows the dashed outline while a file is over it, stores the file with the game and uses it there, as one undo step.
// A file of the wrong kind is refused with a toast (it isn't added to the game).
import { editedGame, toast } from './app.svelte';
import { isGameFile } from './fileio';
import { stepAsync } from './history.svelte';
import { addMediaFile, canPlay, mediaKind, mimeFor } from './media.svelte';
import type { MediaKind, MediaRef } from './model';
import { isThemeFile } from './themefile';

export interface MediaDrop {
  /** What the slot takes. */
  kind: MediaKind | readonly MediaKind[];
  /** Use the stored file (awaited, so the file and its use are one step). */
  onpick: (id: string, kind: MediaKind) => unknown;
  disabled?: boolean;
}

const WORD: Record<MediaKind, string> = { image: 'a picture', video: 'a video', audio: 'a sound', font: 'a font' };

/** After a video or sound file is added: warn when this browser (or the desktop app) may not play it. */
export function warnIfUnplayable(ref: MediaRef): void {
  if ((ref.kind === 'video' || ref.kind === 'audio') && !canPlay(ref.mime))
    toast(`⚠ This browser may not play "${ref.name}" (${ref.mime}). Try converting it to MP4 (H.264) or MP3.`);
}

/** "a picture", "a picture or a video", "a picture, a video or a sound". */
export function kindWords(kinds: readonly MediaKind[]): string {
  const w = kinds.map((k) => WORD[k]);
  return w.length > 1 ? `${w.slice(0, -1).join(', ')} or ${w[w.length - 1]}` : (w[0] ?? 'a file');
}

const kindsOf = (k: MediaDrop['kind']): readonly MediaKind[] => (typeof k === 'string' ? [k] : k);

/** What a file is, by its type or its name (null: nothing the game can use). */
export function fileKind(file: { name: string; type: string }): MediaKind | null {
  return mediaKind(file.name, mimeFor(file.name, file.type));
}

/** Why `file` can't go in a slot for `kinds`, for a toast (null: it can). */
export function refusal(file: { name: string; type: string }, kinds: MediaDrop['kind']): string | null {
  const list = kindsOf(kinds);
  const k = fileKind(file);
  if (k && list.includes(k)) return null;
  return `"${file.name}" isn't ${kindWords(list)}${k ? '' : ' the game can use'}`;
}

/** The first of `files` that fits (else the first one, whose refusal says why). */
export const fittingFile = (files: readonly File[], kinds: MediaDrop['kind']): File | undefined => files.find((f) => !refusal(f, kinds)) ?? files[0];

export const hasFiles = (e: DragEvent): boolean => !!e.dataTransfer?.types.includes('Files');

/** A game or theme file (.brainrot, an exported .html, a .zip, a .brainrot-theme…): not media, the editor opens it. */
export const notMedia = (f: { name: string }): boolean => isGameFile(f.name) || isThemeFile(f.name);
/** A drop that brings a game or theme file: left alone (not prevented), so it goes on to the editor, which opens it. */
export const isGameDrop = (e: DragEvent): boolean => Array.from(e.dataTransfer?.files ?? []).some(notMedia);

/** Store `file` and hand it to the slot, as one undo step. False when it can't go there (a toast says why). */
export async function useFile(file: File, opts: MediaDrop): Promise<boolean> {
  const why = refusal(file, opts.kind);
  if (why) {
    toast(why);
    return false;
  }
  try {
    await stepAsync(null, async () => {
      const ref = await addMediaFile(editedGame(), file);
      warnIfUnplayable(ref);
      await opts.onpick(ref.id, ref.kind);
    });
    return true;
  } catch (e) {
    toast((e as Error).message);
    return false;
  }
}

/** use:mediaDrop={{ kind, onpick }} on a slot. */
export function mediaDrop(node: HTMLElement, opts: MediaDrop) {
  let o = opts;
  const off = () => node.classList.remove('media-drop');
  const over = (e: DragEvent) => {
    if (o.disabled || !hasFiles(e)) return;
    e.preventDefault();
    // Not a drop on whatever holds the slot (a player's row, the Media page…).
    e.stopPropagation();
    node.classList.add('media-drop');
  };
  const leave = (e: DragEvent) => !node.contains(e.relatedTarget as Node | null) && off();
  const drop = (e: DragEvent) => {
    off();
    if (o.disabled || !hasFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    const file = fittingFile(Array.from(e.dataTransfer?.files ?? []), o.kind);
    if (file) void useFile(file, o);
  };
  node.addEventListener('dragover', over);
  node.addEventListener('dragleave', leave);
  node.addEventListener('drop', drop);
  return {
    update(n: MediaDrop) {
      o = n;
    },
    destroy() {
      node.removeEventListener('dragover', over);
      node.removeEventListener('dragleave', leave);
      node.removeEventListener('drop', drop);
    },
  };
}
