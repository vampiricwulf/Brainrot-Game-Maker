// Playing the game's sound cues: the host starts a cue through the live state (live.sound), and the window that plays
// the game's sound finds its file here, a built-in one (made once per window) or an audio file of the game.
import { mediaUrls } from '../lib/media.svelte';
import { playSound, type Live } from '../lib/live';
import type { Game } from '../lib/model';
import { BUILTIN, cueMedia, cueWav, hasBuiltin, type CueKey } from '../lib/sounds';

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

/** Play a cue on stream (a sound already playing stops). A cue switched off in 🔊 Sounds does nothing. */
export function playCue(live: Live, game: Game, key: CueKey): void {
  const media = cueMedia(game, key);
  if (media) playSound(live, media);
}
