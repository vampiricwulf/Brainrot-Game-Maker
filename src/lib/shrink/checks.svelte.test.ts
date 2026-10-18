// Whether each video and sound plays here, worked out one at a time in the editor and kept by the file's bytes
// (card-files spec §4.12.3). Reading a file and the page element are stood in for: they need a browser
// (tests/e2e/convert.mjs reads real ones).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../app.svelte';
import { registerBlob } from '../media.svelte';
import type { MediaRef } from '../model';
import { jeopardyGame } from '../testgame';
import { checkGame, checks, checkSoon, knownVerdict, markChecked, verdictOf } from './checks.svelte';
import { elementTest, readFacts, type MediaFacts } from './facts';

const at = vi.hoisted(() => ({ reading: 0, most: 0 }));
const track = { str: null, decodes: true, bps: null, cpt: true };
/** What's in a file, by its first byte: 1 a WebM of VP9 and Opus, 2 an MKV of the same, 3 an MKV whose sound is AC-3. */
const FACTS: Record<number, Partial<MediaFacts>> = {
  1: { box: 'webm', video: { ...track, codec: 'vp9', width: 160, height: 90, rotation: 0, hdr: false }, audio: { ...track, codec: 'opus', channels: 2, label: null } },
  2: { box: 'mkv', video: { ...track, codec: 'vp9', width: 160, height: 90, rotation: 0, hdr: false }, audio: { ...track, codec: 'opus', channels: 2, label: null } },
  3: { box: 'mkv', video: { ...track, codec: 'vp9', width: 160, height: 90, rotation: 0, hdr: false }, audio: { ...track, codec: 'ac3', decodes: false, cpt: false, channels: 2, label: null } },
};
vi.mock('./facts', async (orig) => ({
  ...(await orig<typeof import('./facts')>()),
  readFacts: vi.fn(async (blob: Blob): Promise<MediaFacts> => {
    at.most = Math.max(at.most, ++at.reading);
    const first = new Uint8Array(await blob.arrayBuffer())[0];
    await new Promise((ok) => setTimeout(ok, 20));
    at.reading--;
    return { box: null, seconds: 2, size: blob.size, video: null, audio: null, moreAudio: 0, subtitles: false, ...FACTS[first] };
  }),
  // (The page element: it plays the picture, and the sound when it isn't AC-3.)
  elementTest: vi.fn(async (blob: Blob) => ({ opens: 'yes', picture: true, sound: new Uint8Array(await blob.arrayBuffer())[0] === 3 ? 'no' : 'yes' })),
}));
vi.mock('./probe', async (orig) => ({
  ...(await orig<typeof import('./probe')>()),
  probe: async () => ({ ok: true, aac: false, opus: true }),
  encodersFor: async () => ({ avc: false, vp9: true, vp8: true }),
}));

const file = (first: number) => new Blob([new Uint8Array([first, 0, 0, 0])]);
const ref = (id: string, kind: MediaRef['kind'] = 'video', more: Partial<MediaRef> = {}): MediaRef => ({ id, name: `${id}.mkv`, mime: 'video/x-matroska', size: 4, kind, ...more });
/** Once nothing is waiting to be checked. */
const settled = (ids: string[]) => vi.waitFor(() => expect(ids.map((id) => verdictOf(id)).includes('checking')).toBe(false), { timeout: 5000 });
const is = (id: string) => (v => (typeof v === 'object' ? v.is : v))(verdictOf(id));

beforeEach(() => {
  vi.stubGlobal('document', { hidden: false, addEventListener: () => {} });
  vi.mocked(readFacts).mockClear();
  vi.mocked(elementTest).mockClear();
  at.most = 0;
  app.screen = 'editor';
  app.game = jeopardyGame();
});
afterEach(() => vi.unstubAllGlobals());

describe('checking whether files play here', () => {
  it('checks each stored video and sound once, one at a time; not links, 🗜 copies for phones, pictures or missing files', async () => {
    const g = app.game;
    g.media.push(ref('webm'), ref('mkv'), ref('talk'), ref('song', 'audio'), ref('link', 'video', { url: 'https://example.com/a.mkv' }), ref('copy', 'video', { phoneCopy: { of: 'mkv' } }), ref('pic', 'image'), ref('gone'));
    for (const [id, first] of [['webm', 1], ['mkv', 2], ['talk', 3], ['song', 1], ['copy', 1], ['pic', 1]] as const) registerBlob(id, file(first));
    const before = checks.version;
    checkGame(g);
    checkGame(g);
    expect(is('mkv')).toBe('checking');
    await settled(['webm', 'mkv', 'talk', 'song']);
    expect(['webm', 'mkv', 'talk', 'song', 'link', 'copy', 'pic', 'gone'].map(is)).toEqual(['plays', 'plays', 'silent', 'plays', undefined, undefined, undefined, undefined]);
    expect([vi.mocked(readFacts).mock.calls.length, at.most]).toEqual([4, 1]);
    // (The page element only for the MKVs: a WebM's codecs tell.)
    expect(vi.mocked(elementTest).mock.calls.length).toBe(2);
    expect(checks.version).toBeGreaterThan(before);
    expect(knownVerdict(g.media.find((m) => m.id === 'talk')!)).toMatchObject({ is: 'silent', why: { sound: 'ac3' } });
    expect(knownVerdict(g.media.find((m) => m.id === 'gone')!)).toBeUndefined();
  });

  it('follows the file’s bytes: other bytes under the same id are checked again, and the old ones’ verdict comes back with them', async () => {
    app.game.media.push(ref('clip'));
    const old = file(2);
    registerBlob('clip', old);
    checkSoon('clip');
    await settled(['clip']);
    expect(is('clip')).toBe('plays');
    // (Replace…: an MKV whose sound is AC-3.)
    registerBlob('clip', file(3));
    expect(is('clip')).toBeUndefined();
    checkGame(app.game);
    await settled(['clip']);
    expect(is('clip')).toBe('silent');
    // (Its Ctrl+Z: the old bytes, already known.)
    registerBlob('clip', old);
    expect(is('clip')).toBe('plays');
    expect(vi.mocked(readFacts).mock.calls.length).toBe(2);
  });

  it('only in the editor: in play nothing is checked, and the editor checks it once back', async () => {
    app.game.media.push(ref('late'));
    registerBlob('late', file(2));
    app.screen = 'play';
    checkGame(app.game);
    await settled(['late']);
    expect([is('late'), vi.mocked(readFacts).mock.calls.length]).toEqual([undefined, 0]);
    app.screen = 'editor';
    checkGame(app.game);
    await settled(['late']);
    expect(is('late')).toBe('plays');
  });

  it('takes what’s known of bytes made here without checking them', () => {
    app.game.media.push(ref('made'));
    const b = file(3);
    registerBlob('made', b);
    markChecked(b, { is: 'plays', repack: null });
    checkGame(app.game);
    expect([is('made'), vi.mocked(readFacts).mock.calls.length]).toEqual(['plays', 0]);
  });
});
