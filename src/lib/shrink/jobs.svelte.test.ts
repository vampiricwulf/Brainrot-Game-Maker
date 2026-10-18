// The editor's file jobs (card-files spec §4.13.5): one at a time, the rest waiting; Stop changes nothing; ▶ Play's
// question and the header's pill never name the file.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from '../app.svelte';
import { addJob, clearJobs, jobAsk, jobFor, jobLine, jobs, pillText, progressText, stopAll, stopJob, watchJob, type JobCtl } from './jobs.svelte';

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
    vi.advanceTimersByTime(1000);
    a.ctl().progress(0.1);
    expect(jobs.current!.left).toBeNull();
    vi.advanceTimersByTime(3000);
    a.ctl().progress(0.2);
    expect(jobs.current!.left).toBeCloseTo(16, 0);
    expect(progressText(jobs.current!)).toBe('20% (about 15 s left)');
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
