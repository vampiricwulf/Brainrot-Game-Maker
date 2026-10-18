// ✎ Edit (card-files spec §4.11.6): an edited file made outside the undo history, then put in as one step of its own:
// in the file's place everywhere (the items playing it retimed, a box of its old shape refitted, its 🗜 copy for
// phones gone), for one slide item only, or as a new file beside it. Ctrl+Z puts it all back together. Never when the
// file or the item changed meanwhile. Making files is stood in for here: it needs a browser (tests/e2e/videoedit.mjs
// makes real ones; run.test.ts trims real ones in Node).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app, toast } from '../app.svelte';
import { arriving, heldMedia, history, redo, startHistory, undo } from '../history.svelte';
import { registerBlob } from '../media.svelte';
import { isBoard, newVideoEl, type Game, type MediaRef, type VideoEl } from '../model';
import { jeopardyGame } from '../testgame';
import { watchGame, type GameWatch } from '../watch.svelte';
import { applyFileEdit, CONVERT_CHANGED, editOffer, EDIT_WRONG, queueFileEdit } from './apply';
import { markChecked } from './checks.svelte';
import type { MediaFacts } from './facts';
import { clearJobs, jobs } from './jobs.svelte';
import { CANT_SIZE, noEdit, planEdit, type EditExtra, type EditPlan, type FileEdit } from './plan';
import { convertBlob, RunError } from './run';

const at = vi.hoisted(() => ({ release: null as (() => void) | null }));
const track = { str: null, decodes: true, bps: 200_000, cpt: true };
/** A 4 s 1280×720 WebM (VP9, Opus). */
const CLIP: MediaFacts = {
  box: 'webm',
  seconds: 4,
  size: 900,
  video: { ...track, codec: 'vp9', width: 1280, height: 720, rotation: 0, hdr: false },
  audio: { ...track, codec: 'opus', channels: 2, label: null },
  moreAudio: 0,
  subtitles: false,
};

vi.mock('../app.svelte', async (orig) => ({ ...(await orig<typeof import('../app.svelte')>()), toast: vi.fn() }));
vi.mock('../nav.svelte', async (orig) => ({ ...(await orig<typeof import('../nav.svelte')>()), flash: vi.fn() }));
vi.mock('./facts', async (orig) => ({ ...(await orig<typeof import('./facts')>()), readFacts: async () => CLIP }));
vi.mock('./probe', async (orig) => ({ ...(await orig<typeof import('./probe')>()), probe: async () => ({ ok: true, aac: false, opus: true }), encodersFor: async () => ({ avc: false, vp9: true, vp8: true }) }));
vi.mock('./run', async (orig) => ({ ...(await orig<typeof import('./run')>()), checkMade: async () => null, convertBlob: vi.fn() }));
vi.mock('../desktop.svelte', async (orig) => ({ ...(await orig<typeof import('../desktop.svelte')>()), whileWriting: async <T,>(fn: () => Promise<T>): Promise<T> => fn() }));

const REF: MediaRef = { id: 'clip', name: 'Clip.webm', mime: 'video/webm', size: 900, kind: 'video' };
const COPY: MediaRef = { id: 'clipc', name: 'Clip (phones).webm', mime: 'video/webm', size: 300, kind: 'video', phoneCopy: { of: 'clip' } };
const CAN = { ok: true, aac: false, opus: true };
const VP = { avc: false, vp9: true, vp8: true };

let g: Game;
let w: GameWatch;
let items: VideoEl[];
const plan = (e: Partial<FileEdit>, key: number | null = 1): EditPlan & EditExtra => {
  const p = planEdit(CLIP, { ...noEdit(CLIP), ...e }, CAN, VP, key, 'video');
  if ('refuse' in p) throw new Error(p.refuse);
  return p;
};
const labels = () => history.entries.map((e) => e.label).filter((l) => /^(Trimmed|Edited|Saved an edited)/.test(l ?? ''));
const ended = (id: string) => vi.waitFor(() => expect(jobs.ended[id]).toBeDefined(), { timeout: 5000 });
const made = (size = 600, mime = 'video/webm') => vi.mocked(convertBlob).mockResolvedValue({ blob: new Blob([new Uint8Array(size)], { type: mime }), mime, seconds: 1.5, width: 720, height: 720 });
const times = (el: VideoEl) => [el.media, el.startAt, el.endAt];

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.mocked(toast).mockClear();
  // Three items on the clip: 1.5–2.0 (a 16:9 box), 0.2–0.6 (a 4:3 box), and one on a 🤫 card with no times.
  items = [
    { ...newVideoEl('clip'), id: 'a', startAt: 1.5, endAt: 2, w: 1280, h: 720 },
    { ...newVideoEl('clip'), id: 'b', startAt: 0.2, endAt: 0.6, w: 800, h: 600 },
    { ...newVideoEl('clip'), id: 'c' },
  ];
  const game = jeopardyGame();
  const board = game.rounds[0];
  if (!isBoard(board)) throw new Error('not a board');
  board.categories[0].clues[0].questionSlide.elements.push(items[0], items[1]);
  app.game = { ...game, media: [{ ...REF }, { ...COPY }], cards: [{ id: 'sc1', name: 'Tip', background: {}, elements: [items[2]] }] };
  app.screen = 'editor';
  app.editGame = null;
  g = app.game;
  w = watchGame(g);
  arriving({ kind: 'opened', label: 'Opened' });
  startHistory(g, w);
  const b = new Blob([new Uint8Array(900)], { type: 'video/webm' });
  registerBlob('clip', b);
  markChecked(b, { is: 'plays', repack: null });
  registerBlob('clipc', new Blob([new Uint8Array(300)], { type: 'video/webm' }));
  at.release = null;
});
afterEach(() => {
  clearJobs();
  w.destroy();
  vi.mocked(convertBlob).mockReset();
});
/** The game's items now (the step may have put new objects in their places). */
const now = () => {
  const board = g.rounds[0];
  if (!isBoard(board)) throw new Error('not a board');
  const [a, b] = board.categories[0].clues[0].questionSlide.elements.filter((e) => e.kind === 'video') as VideoEl[];
  return [a, b, g.cards![0].elements[0] as VideoEl];
};

describe('✎ an edit put in the file’s place', () => {
  it('goes in as one step: every use on the new bytes, times moved with the trim, a box of its old shape refitted, its copy for phones gone', async () => {
    made();
    // Kept 1.0–3.0, cropped to a square.
    const p = plan({ start: 1, end: 3, crop: { x: 0.21875, y: 0, w: 0.5625, h: 1 } });
    const job = queueFileEdit(g, 'clip', p, 'all')!;
    await ended(job);
    const to = (jobs.ended[job] as { media: string }).media;
    expect(jobs.ended[job]).toEqual({
      done: '✂ Video edited: 1.5 s, 720×720, 600 B (was 900 B). Ctrl+Z puts the old one back. 1 slide item played a part you cut out: it plays the whole clip now.',
      media: to,
    });
    expect(g.media).toEqual([{ id: to, name: 'Clip.webm', mime: 'video/webm', size: 600, kind: 'video' }]);
    const [a, b, c] = now();
    expect([times(a), times(b), times(c)]).toEqual([
      [to, 0.5, 1],
      [to, undefined, undefined],
      [to, undefined, undefined],
    ]);
    expect([a.w === a.h, b.w, b.h]).toEqual([true, 800, 600]);
    expect(labels()).toEqual(['Edited a video (trimmed to 0:01–0:03, cropped)']);
  });

  it('Ctrl+Z puts back the file, the items’ times and boxes and its copy for phones, together; Ctrl+Y the edit; both files held', async () => {
    made();
    const job = queueFileEdit(g, 'clip', plan({ start: 1, end: 3, crop: { x: 0.21875, y: 0, w: 0.5625, h: 1 } }), 'all')!;
    await ended(job);
    const to = (jobs.ended[job] as { media: string }).media;
    expect(history.entries).toHaveLength(1);
    expect([...heldMedia()].filter((id) => id === to || id === 'clip').sort()).toEqual([to, 'clip'].sort());
    undo();
    const [a, b, c] = now();
    expect([times(a), times(b), times(c), [a.w, a.h]]).toEqual([['clip', 1.5, 2], ['clip', 0.2, 0.6], ['clip', undefined, undefined], [1280, 720]]);
    expect(g.media.map((m) => m.id)).toEqual(['clip', 'clipc']);
    redo();
    expect([now()[0].media, now()[0].startAt, g.media.map((m) => m.id)]).toEqual([to, 0.5, [to]]);
  });

  it('a sound trimmed says so', async () => {
    g.media[0] = { id: 'clip', name: 'Tone.wav', mime: 'audio/wav', size: 900, kind: 'audio' };
    made(500, 'audio/wav');
    const p = planEdit({ ...CLIP, box: 'wav', video: null, audio: { ...track, codec: 'pcm-s16', channels: 1, label: null } }, { ...noEdit(CLIP), start: 1, end: 2.5 }, CAN, VP, null, 'audio');
    if ('refuse' in p) throw new Error(p.refuse);
    const job = queueFileEdit(g, 'clip', p, 'all')!;
    await ended(job);
    expect((jobs.ended[job] as { done: string }).done).toBe('✂ Sound trimmed: 1.5 s, 500 B (was 900 B). Ctrl+Z puts the old one back. 1 slide item played a part you cut out: it plays the whole clip now.');
    expect(labels()).toEqual(['Trimmed a sound to 0:01–0:03']);
  });
});

describe('✎ Only this item, and Save as a new file', () => {
  it('Only this item: a new file for that item alone, its times moved; the others and the copy for phones stay', async () => {
    made();
    const job = queueFileEdit(g, 'clip', plan({ start: 1, end: 3 }), 'item', items[0])!;
    await ended(job);
    const to = (jobs.ended[job] as { media: string }).media;
    expect(jobs.ended[job]).toEqual({ done: '✂ This item plays its own edited copy now: the other 2 places keep the original.', media: to });
    expect(g.media.map((m) => [m.id, m.name])).toEqual([
      ['clip', 'Clip.webm'],
      ['clipc', 'Clip (phones).webm'],
      [to, 'Clip (edited).webm'],
    ]);
    const [a, b, c] = now();
    expect([times(a), times(b), times(c)]).toEqual([
      [to, 0.5, 1],
      ['clip', 0.2, 0.6],
      ['clip', undefined, undefined],
    ]);
    expect(labels()).toEqual(['Edited a video for one slide item (trimmed to 0:01–0:03)']);
    undo();
    expect([now()[0].media, now()[0].startAt, g.media.length]).toEqual(['clip', 1.5, 2]);
  });

  it('Save as a new file: the edited file beside it, nothing else changed', async () => {
    made();
    const job = queueFileEdit(g, 'clip', plan({ end: 2 }), 'new')!;
    await ended(job);
    expect((jobs.ended[job] as { done: string }).done).toBe('✂ Saved as a new file in 🖼 Media: the original is unchanged.');
    expect(g.media.map((m) => m.name)).toEqual(['Clip.webm', 'Clip (phones).webm', 'Clip (edited).webm']);
    expect(now().map((el) => times(el))).toEqual([
      ['clip', 1.5, 2],
      ['clip', 0.2, 0.6],
      ['clip', undefined, undefined],
    ]);
    expect(labels()).toEqual(['Saved an edited copy of a video (trimmed to 0:00–0:02)']);
  });

  it('applyFileEdit by itself: the ref keeps its place in 🖼 Media, its name following its type', () => {
    g.media.unshift({ id: 'm1', name: 'Party.mkv', mime: 'video/x-matroska', size: 9, kind: 'video' });
    const { ref } = applyFileEdit(g, 'm1', 'm2', { mime: 'video/mp4', size: 5 }, { cut: null }, 'all');
    expect([g.media[0], ref.name]).toEqual([{ id: 'm2', name: 'Party.mp4', mime: 'video/mp4', size: 5, kind: 'video' }, 'Party.mp4']);
  });
});

describe('✎ when it can’t go in', () => {
  it('isn’t put in when the file changed while it was made, or the item went', async () => {
    vi.mocked(convertBlob).mockImplementation(async () => {
      await new Promise<void>((ok) => (at.release = ok));
      return { blob: new Blob([new Uint8Array(600)], { type: 'video/webm' }), mime: 'video/webm', seconds: 2 };
    });
    const job = queueFileEdit(g, 'clip', plan({ start: 1, end: 3 }), 'all')!;
    await vi.waitFor(() => expect(at.release).not.toBeNull());
    registerBlob('clip', new Blob([new Uint8Array(950)]));
    at.release!();
    await ended(job);
    expect(jobs.ended[job]).toEqual({ failed: CONVERT_CHANGED });
    expect([g.media.map((m) => m.id), labels()]).toEqual([['clip', 'clipc'], []]);
    // One item's: the item taken off its slide meanwhile.
    at.release = null;
    const job2 = queueFileEdit(g, 'clip', plan({ start: 1, end: 3 }), 'item', items[1])!;
    await vi.waitFor(() => expect(at.release).not.toBeNull());
    const board = g.rounds[0];
    if (isBoard(board)) board.categories[0].clues[0].questionSlide.elements = board.categories[0].clues[0].questionSlide.elements.filter((e) => e.id !== 'b');
    at.release!();
    await ended(job2);
    expect(jobs.ended[job2]).toEqual({ failed: CONVERT_CHANGED });
  });

  it('says why it couldn’t be made: a size this browser can’t make, or it came out wrong', async () => {
    vi.mocked(convertBlob).mockRejectedValueOnce(new RunError('no-encoder')).mockRejectedValueOnce(new RunError('check'));
    const a = queueFileEdit(g, 'clip', plan({ short: 360 }), 'all')!;
    await ended(a);
    const b = queueFileEdit(g, 'clip', plan({ short: 360 }), 'all')!;
    await ended(b);
    expect([jobs.ended[a], jobs.ended[b]]).toEqual([{ failed: CANT_SIZE }, { failed: EDIT_WRONG }]);
    expect(vi.mocked(toast).mock.calls.map((c) => c[0])).toEqual([CANT_SIZE, EDIT_WRONG]);
  });

  it('its copy for phones is made again after, when asked', async () => {
    made();
    const job = queueFileEdit(g, 'clip', plan({ end: 3 }), 'all', undefined, true)!;
    await ended(job);
    // (This one would hardly be smaller: 🗜 says so, naming nothing.)
    await vi.waitFor(() => expect(vi.mocked(toast).mock.calls.map((c) => c[0])).toContain('🗜 Its copy for phones wasn’t made again: a copy of it wouldn’t be much smaller: nothing was changed.'));
  });

  it('✎ is offered in the editor for a stored video or sound that plays here (not now while a job works on it)', async () => {
    g.media.push({ ...REF, id: 'web', url: 'https://example.com/a.webm' }, { ...REF, id: 'gone' }, { ...REF, id: 'bad' });
    const bad = new Blob([new Uint8Array(5)]);
    registerBlob('bad', bad);
    markChecked(bad, { is: 'fails', fix: null, why: { kind: 'video', video: 'hevc', cant: 'undecodable' } });
    expect(['clip', 'clipc', 'web', 'gone', 'bad'].map((id) => editOffer(g.media.find((m) => m.id === id)))).toEqual(['on', null, null, null, null]);
    app.editGame = g;
    expect(editOffer(g.media[0])).toBeNull();
    app.editGame = null;
    vi.mocked(convertBlob).mockImplementation(() => new Promise(() => {}));
    queueFileEdit(g, 'clip', plan({ end: 3 }), 'all');
    expect(editOffer(g.media[0])).toBe('busy');
  });
});
