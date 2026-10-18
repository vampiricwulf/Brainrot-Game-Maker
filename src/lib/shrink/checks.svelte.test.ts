// Whether each video and sound plays here, worked out one at a time in the editor and kept by the file's bytes
// (card-files spec §4.12.3). Reading a file and the page element are stood in for: they need a browser
// (tests/e2e/convert.mjs reads real ones).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app, toast } from '../app.svelte';
import { registerBlob } from '../media.svelte';
import type { MediaRef } from '../model';
import { jeopardyGame } from '../testgame';
import { checkAdded, checkGame, checks, checkSoon, dismissOffer, knownVerdict, markChecked, verdictOf } from './checks.svelte';
import { elementTest, readFacts, type MediaFacts } from './facts';

const at = vi.hoisted(() => ({ reading: 0, most: 0 }));
const track = { str: null, decodes: true, bps: null, cpt: true };
/** What's in a file, by its first byte: 1 a WebM of VP9 and Opus, 2 an MKV of the same, 3 an MKV whose sound is AC-3. */
const FACTS: Record<number, Partial<MediaFacts>> = {
  1: { box: 'webm', video: { ...track, codec: 'vp9', width: 160, height: 90, rotation: 0, hdr: false }, audio: { ...track, codec: 'opus', channels: 2, label: null } },
  2: { box: 'mkv', video: { ...track, codec: 'vp9', width: 160, height: 90, rotation: 0, hdr: false }, audio: { ...track, codec: 'opus', channels: 2, label: null } },
  3: { box: 'mkv', video: { ...track, codec: 'vp9', width: 160, height: 90, rotation: 0, hdr: false }, audio: { ...track, codec: 'ac3', decodes: false, cpt: false, channels: 2, label: null } },
  // 4 an MKA, its sound AC-3 alone (it won't play at all).
  4: { box: 'mkv', video: null, audio: { ...track, codec: 'ac3', decodes: false, cpt: false, channels: 2, label: null } },
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
  elementTest: vi.fn(async (blob: Blob) => ({ opens: 'yes', picture: true, sound: [3, 4].includes(new Uint8Array(await blob.arrayBuffer())[0]) ? 'no' : 'yes' })),
}));
vi.mock('../app.svelte', async (orig) => ({ ...(await orig<typeof import('../app.svelte')>()), toast: vi.fn() }));
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

/** What an element's canPlayType says (canPlay: today's warning, by type alone). */
const cpt = vi.hoisted(() => ({ says: '' }));

beforeEach(() => {
  vi.stubGlobal('document', { hidden: false, addEventListener: () => {}, createElement: () => ({ canPlayType: () => cpt.says }) });
  cpt.says = '';
  checks.offers.length = 0;
  app.editGame = null;
  app.playerOnly = false;
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

describe('a file just added: 🔄 offered when it won’t play here', () => {
  /** Toasts said (the app's own toast(), in order). */
  const toasts = () => vi.mocked(toast).mock.calls.map((c) => c[0]);
  beforeEach(() => vi.mocked(toast).mockClear());

  it('in the editor, a stored video or sound is checked soon; one that won’t play (or plays silent) is offered, and a toast says so once', async () => {
    app.game.media.push(ref('talk'), ref('song', 'audio'), ref('fine'));
    registerBlob('talk', file(3));
    registerBlob('song', file(9));
    registerBlob('fine', file(1));
    checkAdded(app.game.media.find((m) => m.id === 'talk')!);
    checkAdded(app.game.media.find((m) => m.id === 'fine')!);
    expect([is('talk'), is('fine'), toasts()]).toEqual(['checking', 'checking', []]);
    await settled(['talk', 'fine']);
    expect(checks.offers).toEqual(['talk']);
    await vi.waitFor(() => expect(toasts()).toEqual(['⚠ A video you just added plays without its sound in this browser: see the note at the top.']));
    dismissOffer('talk');
    expect(checks.offers).toEqual([]);
  });

  it('several added together: one toast for them all, saying whether they play without their sound or not at all', async () => {
    app.game.media.push(ref('t1'), ref('t2'));
    registerBlob('t1', new Blob([new Uint8Array([3, 1])]));
    registerBlob('t2', new Blob([new Uint8Array([3, 2])]));
    for (const id of ['t1', 't2']) checkAdded(app.game.media.find((m) => m.id === id)!);
    await settled(['t1', 't2']);
    // (Both play, silent.)
    await vi.waitFor(() => expect(toasts()).toEqual(['⚠ 2 files you just added play without their sound in this browser: see the note at the top.']));
    expect(checks.offers).toEqual(['t1', 't2']);
    // One that won't play at all with one that plays silent.
    vi.mocked(toast).mockClear();
    app.game.media.push(ref('t3'), ref('t4', 'audio'));
    registerBlob('t3', new Blob([new Uint8Array([3, 3])]));
    registerBlob('t4', new Blob([new Uint8Array([4, 4])]));
    for (const id of ['t3', 't4']) checkAdded(app.game.media.find((m) => m.id === id)!);
    await settled(['t3', 't4']);
    await vi.waitFor(() => expect(toasts()).toEqual(['⚠ 2 files you just added won’t play in this browser, or play without their sound: see the note at the top.']));
    // Two that won't play at all.
    vi.mocked(toast).mockClear();
    app.game.media.push(ref('t5', 'audio'), ref('t6', 'audio'));
    registerBlob('t5', new Blob([new Uint8Array([4, 5])]));
    registerBlob('t6', new Blob([new Uint8Array([4, 6])]));
    for (const id of ['t5', 't6']) checkAdded(app.game.media.find((m) => m.id === id)!);
    await settled(['t5', 't6']);
    await vi.waitFor(() => expect(toasts()).toEqual(['⚠ 2 files you just added won’t play in this browser: see the note at the top.']));
  });

  it('one dismissed before its toast isn’t counted; one added after it landed isn’t waited for', async () => {
    app.game.media.push(ref('d1'), ref('d2'), ref('late'));
    registerBlob('d1', new Blob([new Uint8Array([3, 4])]));
    registerBlob('d2', new Blob([new Uint8Array([3, 5])]));
    registerBlob('late', new Blob([new Uint8Array([3, 6])]));
    checkAdded(app.game.media.find((m) => m.id === 'd1')!);
    await settled(['d1']);
    // (Dismissed at once, and another file added while its toast waits: it says nothing of the first.)
    dismissOffer('d1');
    checkAdded(app.game.media.find((m) => m.id === 'd2')!);
    await settled(['d2']);
    await vi.waitFor(() => expect(toasts()).toEqual(['⚠ A video you just added plays without its sound in this browser: see the note at the top.']));
    expect(checks.offers).toEqual(['d2']);
    // A file added after an offer landed: the offer's toast goes without it.
    vi.mocked(toast).mockClear();
    checkAdded(app.game.media.find((m) => m.id === 'late')!);
    await settled(['late']);
    await vi.waitFor(() => expect(toasts()).toHaveLength(1));
  });

  it('the same bytes as a file checked already: offered at once', async () => {
    app.game.media.push(ref('again'));
    const b = file(3);
    registerBlob('again', b);
    markChecked(b, { is: 'silent', fix: null, why: { kind: 'video', sound: 'ac3' } });
    checkAdded(app.game.media[app.game.media.length - 1]);
    expect(checks.offers).toEqual(['again']);
    expect(vi.mocked(readFacts)).not.toHaveBeenCalled();
  });

  it('one the app can’t read: today’s toast, only when its type alone says it may not play', async () => {
    app.game.media.push(ref('fake'), ref('fake2', 'video', { mime: 'video/webm', name: 'fake2.webm' }));
    registerBlob('fake', file(7));
    registerBlob('fake2', file(8));
    checkAdded(app.game.media.find((m) => m.id === 'fake')!);
    await settled(['fake']);
    expect(toasts()).toEqual(['⚠ This browser may not play "fake.mkv" (video/x-matroska). Try converting it to MP4 (H.264) or MP3.']);
    cpt.says = 'maybe';
    checkAdded(app.game.media.find((m) => m.id === 'fake2')!);
    await settled(['fake2']);
    expect([toasts().length, checks.offers]).toEqual([1, []]);
  });

  it('never with a game opened from play, in play, or in a player-only file: today’s toast at once, nothing checked', () => {
    const m = ref('x');
    app.game.media.push(m);
    registerBlob('x', file(3));
    app.editGame = app.game;
    checkAdded(m);
    app.editGame = null;
    app.screen = 'play';
    checkAdded(m);
    app.screen = 'editor';
    app.playerOnly = true;
    checkAdded(m);
    // (A link, in the editor, too.)
    app.playerOnly = false;
    checkAdded(ref('web', 'video', { url: 'https://example.com/a.mkv' }));
    expect(toasts()).toHaveLength(4);
    expect([is('x'), checks.offers]).toEqual([undefined, []]);
    // (Pictures say nothing.)
    checkAdded(ref('pic', 'image', { mime: 'image/png' }));
    expect(toasts()).toHaveLength(4);
  });
});
