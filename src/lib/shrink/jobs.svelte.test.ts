// The editor's file jobs (card-files spec §4.13.5): one at a time, the rest waiting; Stop changes nothing; ▶ Play's
// question and the header's pill never name the file.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { announce } from '../announce';
import { app } from '../app.svelte';
import { addJob, clearJobs, jobAsk, jobFor, jobLine, jobs, pillText, progressText, stopAll, stopJob, watchJob, watchJobs, type JobCtl } from './jobs.svelte';

// (What screen readers are told, as said: the page's live region isn't here.)
vi.mock('../announce', async (orig) => ({ ...(await orig<typeof import('../announce')>()), announce: vi.fn() }));
const said = () => vi.mocked(announce).mock.calls.map(([m]) => m);

/** A job that waits to be told how to end, and lets the test move it on. */
function held() {
  let ctl!: JobCtl;
  let end!: (r: { toast: string } | { failed: string }) => void;
  const work = (c: JobCtl) =>
    new Promise<{ toast: string } | { failed: string }>((resolve, reject) => {
      ctl = c;
      end = resolve;
      c.signal.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')));
    });
  return { work, ctl: () => ctl, end: (r: { toast: string } | { failed: string }) => end(r) };
}
const settle = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
const job = (media: string) => ({ kind: 'phone' as const, what: 'GIF' as const, media, gameId: 'g', copying: false });

afterEach(() => {
  clearJobs();
  app.toast = '';
  vi.useRealTimers();
  vi.mocked(announce).mockClear();
});

describe('file jobs', () => {
  it('run one at a time, the next once the one before ends; its end is a toast that names no file', async () => {
    const a = held();
    const b = held();
    const ja = addJob(job('m1'), a.work);
    const jb = addJob(job('m2'), b.work);
    await settle();
    expect(jobs.current?.id).toBe(ja);
    expect(jobFor('m2')?.phase).toBe('waiting');
    expect(pillText(jobs.current!)).toBe('🗜 Making a smaller copy for phones…');
    a.ctl().phase('working');
    a.ctl().progress(0.43);
    expect(progressText(jobs.current!)).toBe('43%');
    expect(jobLine()).toBe('🗜 A smaller copy for phones is still being made (43%).');
    expect(jobAsk()).toBe(
      '🗜 A smaller copy for phones is still being made (43%). Stop it and start the game? Nothing is changed by stopping, and it can be done again afterwards. (1 more is waiting.)',
    );
    a.end({ toast: '🗜 Phones get the smaller copy now' });
    await settle();
    expect(app.toast).toBe('🗜 Phones get the smaller copy now');
    expect(jobs.ended[ja]).toEqual({ done: '🗜 Phones get the smaller copy now' });
    expect(jobs.current?.id).toBe(jb);
    expect(jobAsk()).toMatch(/\(0%\)\. Stop it and start the game\? Nothing is changed by stopping, and it can be done again afterwards\.$/);
    // (New and Open… ask it too.)
    expect(jobAsk('leave this game')).toMatch(/\(0%\)\. Stop it and leave this game\? Nothing is changed by stopping/);
    b.end({ failed: 'A video of it wouldn’t be much smaller: nothing was changed' });
    await settle();
    expect(app.toast).toBe('🗜 A video of it wouldn’t be much smaller: nothing was changed');
    expect([jobs.current, jobAsk()]).toEqual([null, null]);
  });

  it('says about how long is left once 3% is done and 2 s have passed', async () => {
    vi.useFakeTimers();
    const a = held();
    addJob(job('m1'), a.work);
    await settle();
    a.ctl().phase('working');
    vi.advanceTimersByTime(1000);
    a.ctl().progress(0.1);
    expect(jobs.current!.left).toBeNull();
    vi.advanceTimersByTime(3000);
    a.ctl().progress(0.2);
    expect(jobs.current!.left).toBeCloseTo(16, 0);
    expect(progressText(jobs.current!)).toBe('20% (about 15 s left)');
    // Once it's made: no time left to say, and nothing at all while it's checked and stored.
    a.ctl().progress(1);
    expect(progressText(jobs.current!)).toBe('100%');
    a.ctl().phase('checking');
    expect(progressText(jobs.current!)).toBe('');
    a.ctl().phase('storing');
    expect(progressText(jobs.current!)).toBe('');
  });

  it('tells a screen reader when one starts and how it ended, a dialog showing it or not', async () => {
    const a = held();
    const b = held();
    const c = held();
    const ja = addJob(job('m1'), a.work);
    await settle();
    expect(said()).toEqual(['🗜 Making a smaller copy for phones…']);
    // (Its dialog shows how it ended: no toast, but it's still said.)
    watchJob(ja);
    a.end({ toast: '🗜 Phones get the smaller copy now' });
    await settle();
    expect([app.toast, said().at(-1)]).toEqual(['', '🗜 Phones get the smaller copy now']);
    const jb = addJob(job('m2'), b.work);
    watchJob(jb);
    await settle();
    b.end({ failed: 'it broke' });
    await settle();
    expect([app.toast, said().at(-1)]).toEqual(['', '🗜 it broke']);
    const jc = addJob(job('m3'), c.work);
    watchJob(jc);
    await settle();
    stopJob(jc);
    await settle();
    expect([app.toast, said().at(-1)]).toEqual(['', 'Stopped: nothing was changed.']);
    expect(said().filter((m) => m === '🗜 Making a smaller copy for phones…')).toHaveLength(3);
  });

  it('Stop: one waiting goes, the one running stops; a dialog showing it says so instead of a toast', async () => {
    const a = held();
    const b = held();
    const ja = addJob(job('m1'), a.work);
    const jb = addJob(job('m2'), b.work);
    await settle();
    stopJob(jb);
    expect(jobs.ended[jb]).toEqual({ stopped: true });
    watchJob(ja);
    stopJob(ja);
    await settle();
    expect(jobs.ended[ja]).toEqual({ stopped: true });
    expect(app.toast).toBe('');
    expect(jobs.list).toEqual([]);
  });

  it('a dialog showing several (a list of files) says how each ended; one it doesn’t show ends in a toast', async () => {
    const a = held();
    const b = held();
    const c = held();
    const ja = addJob(job('m1'), a.work);
    const jb = addJob(job('m2'), b.work);
    const jc = addJob(job('m3'), c.work);
    watchJobs([ja, jb]);
    await settle();
    a.end({ toast: 'one' });
    await settle();
    b.end({ failed: 'it broke' });
    await settle();
    expect([jobs.ended[ja], jobs.ended[jb], app.toast]).toEqual([{ done: 'one' }, { failed: 'it broke' }, '']);
    c.end({ toast: 'three' });
    await settle();
    expect([jobs.ended[jc], app.toast]).toEqual([{ done: 'three' }, 'three']);
  });

  it('another game stops the jobs of the one before; ▶ Play stops them all', async () => {
    const a = held();
    const b = held();
    addJob({ ...job('m1'), gameId: 'old' }, a.work);
    addJob({ ...job('m2'), gameId: 'new' }, b.work);
    await settle();
    stopAll('new');
    await settle();
    expect(jobs.list.map((j) => j.media)).toEqual(['m2']);
    expect(app.toast).toBe('Stopped: nothing was changed.');
    stopAll();
    await settle();
    expect(jobs.list).toEqual([]);
  });
});
