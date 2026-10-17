// The host's controls for a slide's media: which copy they reach when the audience window opens or closes mid-clue. And
// where a clue's media was, when its slide comes back: not for the editor's preview, nor one that hadn't started yet.
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyLocal, localMedia, mediaScope, previewMediaScope, registerMedia, setMediaRole, unregisterMedia, updateMedia, type MediaHandle,
  type MediaState,
} from './mediactl.svelte';

/** A stand-in element: its handle records what it was told. */
function fake(): MediaHandle & { muted: boolean; calls: string[] } {
  const f = {
    muted: false,
    calls: [] as string[],
    play: () => f.calls.push('play'),
    pause: () => f.calls.push('pause'),
    seek: (t: number) => f.calls.push(`seek ${t}`),
    setVolume: () => {},
    setMuted: (m: boolean) => {
      f.muted = m;
      f.calls.push(m ? 'mute' : 'unmute');
    },
    setLoop: () => {},
  };
  return f;
}
const state = (s: Partial<MediaState> = {}): MediaState => ({
  label: 'Sound',
  kind: 'audio',
  paused: false,
  time: 0,
  duration: 0,
  volume: 1,
  muted: false,
  loop: false,
  ...s,
});

afterEach(() => {
  for (const id of Object.keys(localMedia)) unregisterMedia(id);
  mediaScope('');
});

/** A clue's sound coming up (its length known once it loads): what its handle was told. */
function comesUp(id: string, s: Partial<MediaState> = {}): string[] {
  const h = fake();
  registerMedia(id, 'single', h, state(s));
  updateMedia(id, { duration: 8 });
  return h.calls;
}

describe('a media element changing role', () => {
  it('goes silent and ignores unmuting once the audience window opens (its copy has the sound)', () => {
    const h = fake();
    registerMedia('a', 'single', h, state());
    setMediaRole('a', 'mirror');
    expect(localMedia.a.role).toBe('mirror');
    expect(h.muted).toBe(true);
    applyLocal({ el: 'a', op: 'muted', value: false });
    expect(h.muted).toBe(true);
  });

  it('is the host’s to mute again once the audience window closes', () => {
    const h = fake();
    registerMedia('a', 'mirror', h, state({ muted: true }));
    applyLocal({ el: 'a', op: 'muted', value: false });
    expect(h.calls).not.toContain('unmute');
    setMediaRole('a', 'single');
    expect(localMedia.a.role).toBe('single');
    applyLocal({ el: 'a', op: 'muted', value: false });
    expect(h.calls).toContain('unmute');
  });

  it('does nothing for media that isn’t there, or keeps its role', () => {
    const h = fake();
    setMediaRole('none', 'mirror');
    expect(localMedia.none).toBeUndefined();
    registerMedia('a', 'single', h, state());
    setMediaRole('a', 'single');
    expect(h.calls).toEqual([]);
  });
});

describe('the editor’s ▶ Preview after a game left mid-clue', () => {
  it('plays from the start and keeps nothing, and the game’s clip is still where it was for Resume', () => {
    mediaScope('clue:0.0.0');
    comesUp('a');
    updateMedia('a', { time: 2.5, paused: true });
    unregisterMedia('a');
    // ▶ Preview of that clue, or any other slide: from the start.
    const end = previewMediaScope();
    expect(comesUp('a')).toEqual([]);
    updateMedia('a', { time: 5 });
    // ■ Stop preview: its own media goes after the scope is back.
    end();
    unregisterMedia('a');
    // Resume: the game's clip paused where the host left it, not where the preview was.
    mediaScope('clue:0.0.0');
    expect(comesUp('a').filter((c) => !c.endsWith('mute'))).toEqual(['seek 2.5', 'pause']);
  });
});

describe('a clip that plays by itself, still waiting for its entrance', () => {
  it('starts afresh when its slide comes back (it isn’t kept as paused at 0:00)', () => {
    mediaScope('clue:0.0.0');
    comesUp('a', { paused: true, waiting: true });
    unregisterMedia('a');
    expect(comesUp('a', { paused: true, waiting: true })).toEqual([]);
    // Once it has started (or the host paused it), it comes back where it was.
    updateMedia('a', { waiting: false, time: 1, paused: true });
    unregisterMedia('a');
    expect(comesUp('a').filter((c) => !c.endsWith('mute'))).toEqual(['seek 1', 'pause']);
  });
});
