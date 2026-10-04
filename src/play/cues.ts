// Playing the game's sound cues: the host starts a cue through the live state (live.sound), and the window that plays
// the game's sound finds its file here, a built-in one (made once per window) or an audio file of the game.
import { mediaUrls } from '../lib/media.svelte';
import { playSound, type Live } from '../lib/live';
import type { Game } from '../lib/model';
import { BUILTIN, cueMedia, cueVolume, cueWav, hasBuiltin, type CueKey } from '../lib/sounds';

const builtinUrls = new Map<CueKey, string>();

/** Where a sound's file is: a built-in sound (`builtin:right`) or one of the game's audio files. */
export function soundUrl(media: string | undefined): string | undefined {
  if (!media) return undefined;
  if (!media.startsWith(BUILTIN)) return mediaUrls[media];
  const key = media.slice(BUILTIN.length) as CueKey;
  if (!hasBuiltin(key)) return undefined;
  let url = builtinUrls.get(key);
  // Named after the cue (…#right), which the browser ignores: it tells them apart in the dev tools and the tests.
  if (!url) builtinUrls.set(key, (url = `${URL.createObjectURL(new Blob([cueWav(key)], { type: 'audio/wav' }))}#${key}`));
  return url;
}

/** A game's audio file is loaded here (a cue whose file isn't plays its built-in sound). */
export const loaded = (id: string): boolean => !!mediaUrls[id];

/** What a cue plays in this window: as cueMedia, with a file that isn't loaded counted as missing. */
export const cueHere = (game: Game, key: CueKey): string | undefined => cueMedia(game, key, loaded);

/**
 * Play a cue on stream (short cues overlap; `cut` stops what's playing first), at its volume. A cue switched off in
 * 🔊 Sounds does nothing.
 */
export function playCue(live: Live, game: Game, key: CueKey, cut = false): void {
  const media = cueHere(game, key);
  // The audience window plays it: should it not have the file loaded, it plays the built-in sound, as here.
  if (media) playSound(live, media, cut, cueVolume(game, key), hasBuiltin(key) ? BUILTIN + key : undefined);
  else if (cut) live.sound = null;
}
