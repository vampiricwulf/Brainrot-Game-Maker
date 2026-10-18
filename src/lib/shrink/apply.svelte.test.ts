// 🗜 A copy put in the game (card-files spec §4.4, §4.13.6): only when the file is still the very one it was made from,
// never one hardly smaller than a file phones can play as it is, and always as a step of its own, after any step being
// made by hand meanwhile (a drag, a file being stored), never joining it. The making itself is stood in for here: it
// needs a browser (tests/e2e/phonecopies.mjs makes real ones).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../app.svelte';
import { arriving, begin, history, startHistory } from '../history.svelte';
import { mediaUrls, registerBlob } from '../media.svelte';
import type { Game, MediaRef } from '../model';
import { jeopardyGame } from '../testgame';
import { watchGame, type GameWatch } from '../watch.svelte';
import { CHANGED, queuePhoneCopy } from './apply';
import { clearJobs, jobs } from './jobs.svelte';
import type { CopyPlan } from './plan';
import { convertBlob } from './run';

/** Where the test steps in: when the copy is made (release), and once its bytes are stored. */
const at = vi.hoisted(() => ({ release: null as (() => void) | null, stored: null as (() => void) | null }));

vi.mock('./gif', () => ({
  gifInfo: () => ({ width: 64, height: 36, frames: 10, seconds: 1 }),
  gifToVideo: async () => {
    await new Promise<void>((ok) => (at.release = ok));
    return { blob: new Blob([new Uint8Array(100)], { type: 'video/webm' }), mime: 'video/webm', seconds: 2, width: 64, height: 36 };
  },
}));
vi.mock('./probe', async (orig) => ({
  ...(await orig<typeof import('./probe')>()),
  probe: async () => ({ ok: true, aac: false, opus: true }),
  encodersFor: async () => ({ avc: false, vp9: true, vp8: true }),
}));
vi.mock('./run', async (orig) => ({ ...(await orig<typeof import('./run')>()), checkMade: async () => null, convertBlob: vi.fn() }));
vi.mock('../desktop.svelte', async (orig) => ({
  ...(await orig<typeof import('../desktop.svelte')>()),
  whileWriting: async <T,>(fn: () => Promise<T>): Promise<T> => {
    const r = await fn();
    at.stored?.();
    return r;
  },
}));

const GIF: MediaRef = { id: 'gif', name: 'dance.gif', mime: 'image/gif', size: 5000, kind: 'image' };
const MOV: MediaRef = { id: 'mov', name: 'clip.mov', mime: 'video/quicktime', size: 4000, kind: 'video' };
/** A video's copy, as 🗜's window plans it (`playable`: phones play the file as it is). */
const plan = (playable: boolean): CopyPlan => ({
  run: { box: 'webm' },
  mime: 'video/webm',
  ext: 'webm',
  out: { seconds: 2, width: 64, height: 36, sound: false },
  estimate: 0,
  range: null,
  format: '',
  playable,
});

let g: Game;
let w: GameWatch;
const copies = () => g.media.filter((m) => m.phoneCopy).map((m) => m.phoneCopy!.of);
const labels = () => history.entries.map((e) => e.label);
const ended = (id: string) => vi.waitFor(() => expect(jobs.ended[id]).toBeDefined(), { timeout: 5000 });
const made = () => vi.waitFor(() => expect(at.release).not.toBeNull());

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  app.game = { ...jeopardyGame(), media: [{ ...GIF }, { ...MOV }] };
  app.screen = 'editor';
  g = app.game;
  w = watchGame(g);
  arriving({ kind: 'opened', label: 'Opened' });
  startHistory(g, w);
  registerBlob('gif', new Blob([new Uint8Array(5000)], { type: 'image/gif' }));
  registerBlob('mov', new Blob([new Uint8Array(4000)], { type: 'video/quicktime' }));
  at.release = at.stored = null;
});
afterEach(() => {
  clearJobs();
  w.destroy();
  vi.mocked(convertBlob).mockReset();
});

describe('a 🗜 copy put in the game', () => {
  it('goes in as one step, named for what it is', async () => {
    const job = queuePhoneCopy('gif')!;
    await made();
    at.release!();
    await ended(job);
    expect(jobs.ended[job]).toMatchObject({ done: expect.stringMatching(/^🗜 Phones get the smaller copy now: /) });
    expect([copies(), labels()]).toEqual([['gif'], ['Made a smaller copy of a GIF for phones']]);
  });

  it('isn’t put in when the file changed while it was made (Replace…, or its Ctrl+Z): nothing is changed', async () => {
    const job = queuePhoneCopy('gif')!;
    await made();
    registerBlob('gif', new Blob([new Uint8Array(6000)], { type: 'image/gif' }));
    at.release!();
    await ended(job);
    expect(jobs.ended[job]).toEqual({ failed: CHANGED });
    expect([copies(), labels()]).toEqual([[], []]);
  });

  it('isn’t put in when the file changed while it was stored: its bytes go too', async () => {
    const files = Object.keys(mediaUrls).length;
    const job = queuePhoneCopy('gif')!;
    await made();
    at.stored = () => registerBlob('gif', new Blob([new Uint8Array(6000)], { type: 'image/gif' }));
    at.release!();
    await ended(job);
    expect(jobs.ended[job]).toEqual({ failed: CHANGED });
    expect([copies(), labels(), Object.keys(mediaUrls).length]).toEqual([[], [], files]);
  });

  it('isn’t put in when it came out hardly smaller than a file phones play as it is (one they can’t play goes in)', async () => {
    vi.mocked(convertBlob).mockResolvedValue({ blob: new Blob([new Uint8Array(3800)], { type: 'video/webm' }), mime: 'video/webm', seconds: 2, width: 64, height: 36 });
    const job = queuePhoneCopy('mov', plan(true))!;
    await ended(job);
    expect(jobs.ended[job]).toEqual({ failed: 'It came out hardly smaller (4 KB of 4 KB): nothing was changed.' });
    expect(copies()).toEqual([]);
    const fix = queuePhoneCopy('mov', plan(false))!;
    await ended(fix);
    expect(jobs.ended[fix]).toMatchObject({ done: '🗜 Phones get a copy they can play now: 4 KB (Ctrl+Z takes it back)' });
    expect([copies(), labels()]).toEqual([['mov'], ['Made a copy of a video that phones can play']]);
  });

  it('done while a step is being made by hand (a drag, a file being stored): a step of its own after that one', async () => {
    const job = queuePhoneCopy('gif')!;
    await made();
    // (A drag on a slide: a group with no name of its own, named from what it changed.)
    const end = begin();
    g.title = 'Dragged';
    at.release!();
    await new Promise((ok) => setTimeout(ok, 400));
    expect([jobs.list.map((j) => j.id), copies()]).toEqual([[job], []]);
    end();
    await ended(job);
    expect(copies()).toEqual(['gif']);
    expect(labels()).toEqual(['Renamed the game “Dragged”', 'Made a smaller copy of a GIF for phones']);
  });

  it('done while that very file is being replaced (Replace…): nothing is stored, nothing is changed', async () => {
    let stored = 0;
    const job = queuePhoneCopy('gif')!;
    await made();
    at.stored = () => stored++;
    const end = begin('Replaced file “dance.gif” with “other.gif”');
    at.release!();
    await new Promise((ok) => setTimeout(ok, 400));
    registerBlob('gif', new Blob([new Uint8Array(6000)], { type: 'image/gif' }));
    end();
    await ended(job);
    expect([jobs.ended[job], stored, copies()]).toEqual([{ failed: CHANGED }, 0, []]);
  });

  it('a step begun while its bytes were stored: waited for too', async () => {
    let end = () => {};
    const job = queuePhoneCopy('gif')!;
    await made();
    at.stored = () => {
      end = begin('Replaced file “other.png” with “new.png”');
      g.title = 'Replaced meanwhile';
    };
    at.release!();
    await vi.waitFor(() => expect(jobs.list[0]?.phase).toBe('storing'));
    await new Promise((ok) => setTimeout(ok, 400));
    expect([jobs.list.map((j) => j.id), copies()]).toEqual([[job], []]);
    end();
    await ended(job);
    expect(labels()).toEqual(['Replaced file “other.png” with “new.png”', 'Made a smaller copy of a GIF for phones']);
  });
});
