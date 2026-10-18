// 🔄 Convert (card-files spec §4.12.6): a file that won't play here made into one that does, outside the undo history,
// then put in its place as one step of its own: every use moves to the new bytes (the ref too, its name following its
// type), its 🗜 copy for phones goes, and Ctrl+Z puts it all back. Never when the file changed meanwhile; several
// started together say how they went in one toast. Reading and making files are stood in for here: they need a
// browser (tests/e2e/convert.mjs makes real ones; run.test.ts repackages real ones in Node).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app, toast } from '../app.svelte';
import { arriving, heldMedia, history, redo, startHistory, undo } from '../history.svelte';
import { getBlob, registerBlob } from '../media.svelte';
import type { Game, MediaRef } from '../model';
import { newVideoEl } from '../model';
import { jeopardyGame } from '../testgame';
import { watchGame, type GameWatch } from '../watch.svelte';
import { applyConvert, CONVERT_CHANGED, convertNow, queueConvert } from './apply';
import { checks, markChecked, verdictOf } from './checks.svelte';
import { mediaDialog } from './dialog.svelte';
import type { MediaFacts } from './facts';
import { clearJobs, jobs } from './jobs.svelte';
import type { Verdict } from './playable';
import { convertBlob, RunError } from './run';

/** Where the test steps in: once the file is made (release). */
const at = vi.hoisted(() => ({ release: null as (() => void) | null }));
const track = { str: null, decodes: true, bps: 64_000, cpt: true };
const TS: MediaFacts = { box: 'ts', seconds: 3, size: 900, video: null, audio: { ...track, codec: 'mp3', channels: 1, label: null }, moreAudio: 0, subtitles: false };

vi.mock('../app.svelte', async (orig) => ({ ...(await orig<typeof import('../app.svelte')>()), toast: vi.fn() }));
// (🖼 Media's card for it flashes: there's no page here.)
vi.mock('../nav.svelte', async (orig) => ({ ...(await orig<typeof import('../nav.svelte')>()), flash: vi.fn() }));
vi.mock('./facts', async (orig) => ({ ...(await orig<typeof import('./facts')>()), readFacts: async () => TS }));
vi.mock('./probe', async (orig) => ({ ...(await orig<typeof import('./probe')>()), probe: async () => ({ ok: true, aac: false, opus: true }) }));
vi.mock('./run', async (orig) => ({ ...(await orig<typeof import('./run')>()), checkMade: async () => null, convertBlob: vi.fn() }));
vi.mock('../desktop.svelte', async (orig) => ({ ...(await orig<typeof import('../desktop.svelte')>()), whileWriting: async <T,>(fn: () => Promise<T>): Promise<T> => fn() }));

const PARTY: MediaRef = { id: 'party', name: 'Party.mts', mime: 'video/mp2t', size: 900, kind: 'video' };
const COPY: MediaRef = { id: 'partyc', name: 'Party (phones).webm', mime: 'video/webm', size: 300, kind: 'video', phoneCopy: { of: 'party' } };
const FAILS: Verdict = { is: 'fails', fix: { audio: 'keep', box: 'mp4' }, why: { kind: 'video', box: 'ts', fine: { sound: 'mp3' } } };

let g: Game;
let w: GameWatch;
/** History's steps of 🔄 (adding files in a test is a step too). */
const labels = () => history.entries.map((e) => e.label).filter((l) => /^(Repackaged|Converted)/.test(l ?? ''));
const ended = (id: string) => vi.waitFor(() => expect(jobs.ended[id]).toBeDefined(), { timeout: 5000 });
const itemMedia = () => (g.cards![0].elements[0] as { media: string }).media;
/** A file's bytes, known to be as `v` says. */
const stored = (id: string, v: Verdict, size = 900) => {
  const b = new Blob([new Uint8Array(size)], { type: 'video/mp2t' });
  registerBlob(id, b);
  markChecked(b, v);
  return b;
};
const made = (size = 600) => vi.mocked(convertBlob).mockResolvedValue({ blob: new Blob([new Uint8Array(size)], { type: 'video/mp4' }), mime: 'video/mp4', seconds: 3 });

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.mocked(toast).mockClear();
  app.game = { ...jeopardyGame(), media: [{ ...PARTY }, { ...COPY }], cards: [{ id: 'sc1', name: 'Tip', background: {}, elements: [newVideoEl('party')] }] };
  app.screen = 'editor';
  app.editGame = null;
  g = app.game;
  w = watchGame(g);
  arriving({ kind: 'opened', label: 'Opened' });
  startHistory(g, w);
  stored('party', FAILS);
  registerBlob('partyc', new Blob([new Uint8Array(300)], { type: 'video/webm' }));
  checks.offers.splice(0, checks.offers.length, 'party');
  at.release = null;
  mediaDialog.open = null;
});
afterEach(() => {
  clearJobs();
  w.destroy();
  vi.mocked(convertBlob).mockReset();
});

describe('🔄 a converted file put in its place', () => {
  it('goes in as one step: every use on the new bytes, its name following its type, its copy for phones gone, its note too', async () => {
    made();
    const job = queueConvert(g, 'party')!;
    await ended(job);
    expect(jobs.ended[job]).toEqual({ done: '🔄 It plays here now: MP4, 600 B (was 900 B). Ctrl+Z puts the old one back.', media: expect.any(String) });
    const to = (jobs.ended[job] as { media: string }).media;
    expect(g.media).toEqual([{ id: to, name: 'Party.mp4', mime: 'video/mp4', size: 600, kind: 'video' }]);
    expect([itemMedia(), labels(), checks.offers]).toEqual([to, ['Repackaged a video as MP4 (nothing lost)'], []]);
    // (Its plan: the sound copied as it is, forced, into an MP4.)
    expect(vi.mocked(convertBlob).mock.calls[0].slice(1, 3)).toEqual([{ box: 'mp4', copy: { mode: 'forced', shiftTolerance: 0.1 } }, 'video/mp4']);
    // What was made is known to play: it isn't checked again.
    expect(verdictOf(to)).toEqual({ is: 'plays', repack: null });
  });

  it('Ctrl+Z puts the old file back, its uses and its copy for phones; Ctrl+Y the new one; both stay held while History can', async () => {
    made();
    const job = queueConvert(g, 'party')!;
    await ended(job);
    const to = (jobs.ended[job] as { media: string }).media;
    expect(history.entries).toHaveLength(1);
    expect([...heldMedia()].filter((id) => id === to || id === 'party').sort()).toEqual([to, 'party'].sort());
    undo();
    expect(g.media.map((m) => [m.id, m.name, m.mime])).toEqual([
      ['party', 'Party.mts', 'video/mp2t'],
      ['partyc', 'Party (phones).webm', 'video/webm'],
    ]);
    expect([itemMedia(), getBlob('party')?.size]).toEqual(['party', 900]);
    redo();
    expect([g.media.map((m) => m.id), itemMedia()]).toEqual([[to], to]);
  });

  it('can’t be made as it is: says why, nothing changed', async () => {
    vi.mocked(convertBlob).mockRejectedValue(new RunError('cannot-copy'));
    const job = queueConvert(g, 'party')!;
    await ended(job);
    expect(jobs.ended[job]).toEqual({ failed: 'It couldn’t be repackaged as it is: nothing was changed.', toast: '🔄 A video couldn’t be converted: it couldn’t be repackaged as it is. Nothing was changed.' });
    expect(vi.mocked(toast).mock.calls.at(-1)?.[0]).toBe('🔄 A video couldn’t be converted: it couldn’t be repackaged as it is. Nothing was changed.');
    expect([g.media.map((m) => m.id), labels(), checks.offers]).toEqual([['party', 'partyc'], [], ['party']]);
  });

  it('isn’t put in when the file changed while it was made (Replace…, or its Ctrl+Z)', async () => {
    vi.mocked(convertBlob).mockImplementation(async () => {
      await new Promise<void>((ok) => (at.release = ok));
      return { blob: new Blob([new Uint8Array(600)], { type: 'video/mp4' }), mime: 'video/mp4', seconds: 3 };
    });
    const job = queueConvert(g, 'party')!;
    await vi.waitFor(() => expect(at.release).not.toBeNull());
    registerBlob('party', new Blob([new Uint8Array(950)]));
    at.release!();
    await ended(job);
    expect(jobs.ended[job]).toEqual({ failed: CONVERT_CHANGED, toast: CONVERT_CHANGED });
    expect([g.media.map((m) => m.id), labels()]).toEqual([['party', 'partyc'], []]);
  });

  it('nothing to do for a file that plays, can’t be fixed, isn’t stored, or is a link or a copy for phones', () => {
    g.media.push({ ...PARTY, id: 'ok' }, { ...PARTY, id: 'nofix' }, { ...PARTY, id: 'web', url: 'https://example.com/a.mts' });
    stored('ok', { is: 'plays', repack: null });
    stored('nofix', { is: 'fails', fix: null, why: { kind: 'video', sound: 'ac3', cant: 'undecodable' } });
    expect(['ok', 'nofix', 'web', 'partyc', 'gone'].map((id) => queueConvert(g, id))).toEqual([null, null, null, null, null]);
  });

  it('several started together: one toast says how they all went', async () => {
    g.media.push({ ...PARTY, id: 'b', name: 'Beach.mts' }, { ...PARTY, id: 'c', name: 'Cake.mts' });
    stored('b', FAILS);
    stored('c', FAILS);
    vi.mocked(convertBlob)
      .mockResolvedValueOnce({ blob: new Blob([new Uint8Array(600)], { type: 'video/mp4' }), mime: 'video/mp4', seconds: 3 })
      .mockRejectedValueOnce(new RunError('cannot-copy'))
      .mockResolvedValueOnce({ blob: new Blob([new Uint8Array(500)], { type: 'video/mp4' }), mime: 'video/mp4', seconds: 3 });
    const ids = ['party', 'b', 'c'].map((id) => queueConvert(g, id, 'batch1')!);
    await Promise.all(ids.map(ended));
    expect(vi.mocked(toast).mock.calls.map((c) => c[0])).toEqual(['🔄 2 files converted (1 couldn’t be: 🖼 Media says why). Ctrl+Z puts the old ones back, one at a time.']);
    expect(labels()).toEqual(['Repackaged a video as MP4 (nothing lost)', 'Repackaged a video as MP4 (nothing lost)']);
  });

  it('🔄 on a file: a quick one runs at once; one made again opens its window first', async () => {
    made();
    convertNow(g, 'party');
    expect([jobs.list.length, mediaDialog.open]).toEqual([1, null]);
    g.media.push({ ...PARTY, id: 'hevc', name: 'Clip.mp4', mime: 'video/mp4' });
    stored('hevc', { is: 'fails', fix: { video: 'encode', audio: 'keep', box: 'webm', to: { video: 'vp9' } }, why: { kind: 'video', video: 'hevc' } });
    convertNow(g, 'hevc');
    expect([jobs.list.length, mediaDialog.open]).toEqual([1, { mode: 'convert', ids: ['hevc'] }]);
  });

  it('applyConvert by itself: the ref keeps its place, a sound file’s extension follows its type', () => {
    g.media.unshift({ id: 's1', name: 'talk.mka', mime: 'audio/x-matroska', size: 9, kind: 'audio' });
    const ref = applyConvert(g, 's1', 's2', { mime: 'audio/ogg', size: 5 });
    expect([g.media[0], ref]).toEqual([
      { id: 's2', name: 'talk.ogg', mime: 'audio/ogg', size: 5, kind: 'audio' },
      { id: 's2', name: 'talk.ogg', mime: 'audio/ogg', size: 5, kind: 'audio' },
    ]);
  });
});
