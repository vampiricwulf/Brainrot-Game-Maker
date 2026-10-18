// The editor's file jobs (card-files spec §4.13.5): a 🗜 copy for phones being made, one at a time, the rest waiting
// their turn. Each says how far it got for the header's pill and the dialog, and stops at once when asked (nothing is
// changed then). A job belongs to the game it was started in: another game, ▶ Play or ▶ Test stops it (they ask first).
import { announce } from '../announce';
import { toast } from '../app.svelte';
import type { Id } from '../model';
import { leftText } from './plan';

export interface Job {
  id: string;
  kind: 'phone' | 'edit' | 'convert';
  what: 'video' | 'sound' | 'GIF';
  /** The file it works on. */
  media: Id;
  gameId: string;
  batch?: string;
  phase: 'waiting' | 'reading' | 'working' | 'checking' | 'storing';
  /** How far it got (0 to 1). */
  progress: number;
  /** About how many seconds are left (null: not known yet). */
  left: number | null;
  /** Nothing re-encoded (a copy of the tracks as they are). */
  copying: boolean;
}

/** What a job's work is given: its stop signal, and where it says how far it got. */
export interface JobCtl {
  signal: AbortSignal;
  phase(p: Exclude<Job['phase'], 'waiting'>): void;
  progress(p: number): void;
}

/** How a job ended: done (what the toast says), failed (why), or stopped. */
export type JobEnd = { done: string; media?: Id } | { failed: string } | { stopped: true };
type Work = (ctl: JobCtl) => Promise<{ toast: string; media?: Id } | { failed: string }>;

const state = $state<{ list: Job[]; ended: Record<string, JobEnd>; watched: string[] }>({ list: [], ended: {}, watched: [] });
const work = new Map<string, Work>();
const stops = new Map<string, AbortController>();
/** Jobs stopped with nothing to say (▶ Play stopped them: the game is starting). */
const quietly = new Set<string>();
let running: string | null = null;
let seq = 0;
/** Up by one when every job is forgotten (clearJobs): a job ending after that says nothing. */
let generation = 0;

export const jobs = {
  /** Every job, the one running first. */
  get list(): readonly Job[] {
    return state.list;
  },
  /** The one running (null: none). */
  get current(): Job | null {
    return state.list.find((j) => j.id === running) ?? null;
  },
  /** How each one that ended did (by job id), for a dialog still showing it. */
  get ended(): Readonly<Record<string, JobEnd>> {
    return state.ended;
  },
};

/** A dialog shows this job: its end is said there, not in a toast (null: none). */
export function watchJob(id: string | null): void {
  state.watched = id ? [id] : [];
}

/** A dialog shows these jobs (a list of files at once): their ends are said there. */
export function watchJobs(ids: string[]): void {
  state.watched = [...ids];
}

/** The job working on file `media`, running or waiting (a file has one at a time). */
export const jobFor = (media: Id): Job | undefined => state.list.find((j) => j.media === media);

/** Start a job (or queue it behind the one running). Returns its id. */
export function addJob(j: Pick<Job, 'kind' | 'what' | 'media' | 'gameId' | 'batch' | 'copying'>, w: Work): string {
  const id = `job${++seq}`;
  state.list.push({ ...j, id, phase: 'waiting', progress: 0, left: null });
  work.set(id, w);
  void next();
  return id;
}

/** Stop a job: one waiting goes, the one running stops where it is. Nothing is changed. `quiet`: no toast says so. */
export function stopJob(id: string, quiet = false): void {
  if (quiet) quietly.add(id);
  if (id === running) return void stops.get(id)?.abort();
  quietly.delete(id);
  const i = state.list.findIndex((j) => j.id === id);
  if (i < 0) return;
  state.list.splice(i, 1);
  work.delete(id);
  state.ended[id] = { stopped: true };
}

/** Stop every job (`keepGame`: only those of other games than that one). `quiet`: no toast says so. */
export function stopAll(keepGame?: string, quiet = false): void {
  for (const j of [...state.list]) if (j.gameId !== keepGame) stopJob(j.id, quiet);
}

/** "🗜 A smaller copy for phones is still being made (43%).": the job running, in a sentence (null: none). */
export function jobLine(): string | null {
  const j = jobs.current;
  if (!j) return null;
  const pct = `(${Math.floor(j.progress * 100)}%)`;
  if (j.kind === 'convert') return `🔄 A ${j.what} is still being converted ${pct}.`;
  if (j.kind === 'edit') return `✂ A ${j.what}’s edit is still being saved ${pct}.`;
  return `🗜 A smaller copy for phones is still being made ${pct}.`;
}

/** What ▶ Play and ▶ Test ask while a job runs (null: none runs). */
export function jobAsk(): string | null {
  const line = jobLine();
  if (!line) return null;
  const more = state.list.length - 1;
  return `${line} Stop it and start the game? Nothing is changed by stopping, and it can be done again afterwards.${more ? ` (${more} more ${more === 1 ? 'is' : 'are'} waiting.)` : ''}`;
}

/** The header's pill: "🗜 Making a smaller copy for phones…", with how far it got. */
export function pillText(j: Job): string {
  if (j.kind === 'convert') return `🔄 Converting a ${j.what}…`;
  if (j.kind === 'edit') return `✂ Saving a ${j.what}’s edit…`;
  return '🗜 Making a smaller copy for phones…';
}

/** How far a job got, in words, while it makes the file: "43% (about 40 s left)" ('' before it says, and after). */
export function progressText(j: Pick<Job, 'phase' | 'progress' | 'left'>): string {
  if (j.phase !== 'working' || !j.progress) return '';
  return `${Math.floor(j.progress * 100)}%${j.left !== null && j.progress < 1 ? ` (${leftText(j.left)})` : ''}`;
}

/** The next job waiting, run; then the one after. */
async function next(): Promise<void> {
  if (running) return;
  const j = state.list.find((x) => x.phase === 'waiting');
  const w = j && work.get(j.id);
  if (!j || !w) return;
  running = j.id;
  const gen = generation;
  const stop = new AbortController();
  stops.set(j.id, stop);
  const job = state.list.find((x) => x.id === j.id)!;
  job.phase = 'reading';
  // (The pill and the dialog show how far it got; a screen reader hears it start and end.)
  announce(pillText(job));
  const began = performance.now();
  let end: JobEnd;
  const ctl: JobCtl = {
    signal: stop.signal,
    phase: (p) => {
      if (!stop.signal.aborted) job.phase = p;
    },
    progress: (p) => {
      if (stop.signal.aborted) return;
      // (Whole percents: the pill shows no more, and each change draws it again.)
      if (Math.floor(p * 100) === Math.floor(job.progress * 100)) return;
      job.progress = p;
      // About how long is left: once it's 3% done and 2 s along, smoothed.
      const took = (performance.now() - began) / 1000;
      if (p >= 0.03 && took >= 2) {
        const left = (took / p) * (1 - p);
        job.left = job.left === null ? left : 0.7 * job.left + 0.3 * left;
      }
    },
  };
  try {
    const r = await w(ctl);
    end = stop.signal.aborted ? { stopped: true } : 'failed' in r ? { failed: r.failed } : { done: r.toast, ...(r.media ? { media: r.media } : {}) };
  } catch (e) {
    end = stop.signal.aborted || (e as Error)?.name === 'AbortError' ? { stopped: true } : { failed: 'The copy didn’t come out right: nothing was changed.' };
    if (!('stopped' in end)) console.warn('A file job failed', e);
  }
  if (gen !== generation) return;
  state.list.splice(
    state.list.findIndex((x) => x.id === j.id),
    1,
  );
  work.delete(j.id);
  stops.delete(j.id);
  running = null;
  state.ended[j.id] = end;
  // (A dialog showing it says how it ended: no toast then, but a screen reader still hears it.)
  const quiet = quietly.delete(j.id);
  const said = 'done' in end ? end.done : 'failed' in end ? `🗜 ${end.failed}` : 'Stopped: nothing was changed.';
  if (!quiet) {
    if (state.watched.includes(j.id)) announce(said);
    else toast(said);
  }
  void next();
}

/** For tests: forget every job. */
export function clearJobs(): void {
  generation++;
  for (const s of stops.values()) s.abort();
  state.list.splice(0);
  state.ended = {};
  state.watched = [];
  work.clear();
  stops.clear();
  quietly.clear();
  running = null;
}
