// The host's controls for a slide's media: which copy they reach when the audience window opens or closes mid-clue.
import { afterEach, describe, expect, it } from 'vitest';
import { applyLocal, localMedia, registerMedia, setMediaRole, unregisterMedia, type MediaHandle, type MediaState } from './mediactl.svelte';

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
});

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
