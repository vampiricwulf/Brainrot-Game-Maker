/**
 * A buzzer room's card files in its Durable Object's storage, a FILE_PART_BYTES piece at a time both ways, so a big file
 * takes no more of the room's memory than a small one. No Cloudflare APIs here (index.ts passes in storage, hashing and
 * the daily counter), so it's unit-tested (filestore.test.ts).
 *
 * Uploads: room for the file is kept before a piece is written: the room's caps and today's budget for its stated
 * size (Content-Length), or for a whole file limit when it gives none (a refund gives back what it didn't use). Two at
 * once per room at most (UPLOADS_AT_ONCE), counted against the caps together. Its pieces go under a key prefix of its
 * own (p:<random>:<n>, never used again), noted in the room before the first one (RoomSaved.uploads, so a room
 * restarted mid-upload deletes them), and its id, the SHA-256, is worked out on the way. Then the room lists it under
 * that prefix, or, when it holds the same bytes already (a twin that finished first), its pieces are deleted. An upload
 * that fails deletes what it wrote and gives back today's budget. Nothing more is written once the room has ended, or
 * a new room took its code (room() is null then): the room's wipe deletes what was.
 *
 * Downloads: piece 0 is read before answering (a missing file is a clean 404), then one piece a pull, so a slow phone
 * holds one piece in memory, never the file. SENDS_AT_ONCE at once per room; the rest wait their turn. A file deleted
 * while it goes out (no card uses it any more) ends the body with an error.
 */
import type { FileLimits } from '../../src/lib/buzzproto';
import { FILES_OFF, tooBig } from './limits';
import { pieceKey, type RoomFile } from './room';

/** A card file's bytes are stored in pieces this big (a Durable Object value is at most 2 MB, its key included). */
export const FILE_PART_BYTES = 1024 * 1024;
/** Uploads at once per room (the app sends one at a time; this lets a stale second window send too). */
export const UPLOADS_AT_ONCE = 2;
/** Downloads at once per room; more wait their turn (first in, first out). */
export const SENDS_AT_ONCE = 24;

/** What an upload comes to: 200 with the file's id, or the HTTP status and why. */
export type Upload = { status: number; id?: string; error?: string };
/** The uploads on their way: how many, the bytes kept for them, and the idle files to be deleted for them. */
export interface Pending {
  files: number;
  bytes: number;
  drop: string[];
}

/** What upload() needs from the room (room.ts). */
export interface FileRoom {
  fileSpace(bytes: number, pending: Pending): 'full' | { ok: true; drop: string[] };
  dropIdle(ids: string[]): void;
  uploadStarted(prefix: string, parts: number): void;
  uploadEnded(prefix: string): void;
  fileHave(id: string): boolean;
  fileStored(prefix: string, id: string, mime: string, bytes: number, parts: number): void;
}

/** An upload's body as whole FILE_PART_BYTES pieces (the last one shorter); null at the end. next() throws if the body broke off. */
export interface PieceSource {
  next(): Promise<Uint8Array | null>;
  cancel(): void;
}

/** SHA-256, fed piece by piece. */
export interface Hasher {
  write(b: Uint8Array): Promise<void>;
  hex(): Promise<string>;
}

/** Today's budget taken (ticket: what a refund needs), or why not. */
export type Took = { ok: true; ticket: unknown } | 'off' | 'busy' | 'address';

export interface StoreDeps {
  limits(): FileLimits;
  put(key: string, piece: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | undefined>;
  /** Deletes pieces 0 to parts − 1 under prefix (not awaited). */
  drop(prefix: string, parts: number): void;
  /** A new key prefix for an upload's pieces. */
  prefix(): string;
  hasher(): Hasher;
  /** n bytes of today's budget for address key `who` (RoomCounter.takeBytes). */
  take(who: string, n: number): Promise<Took>;
  /** n bytes taken that weren't stored after all, given back. */
  refund(who: string, n: number, ticket: unknown): Promise<void>;
  /** The 429 for a budget refused. */
  busyText(took: 'address' | 'busy'): string;
}

export interface UploadJob {
  mime: string;
  /** Its Content-Length (null: it didn't say). */
  size: number | null;
  /** Its address key (addressKey), for today's budget. */
  who: string;
  body: PieceSource;
  /** The room, or null once it ended or a new room took its code. */
  room: () => FileRoom | null;
}

const WRONG = 'wrong host token';
const EMPTY = 'empty file';
const ROOM_FULL = 'This room holds all the card files it can: send fewer pictures and videos at once';
const TAKING_ANOTHER = 'The buzzer room is taking another file: try again in a moment';
const BROKE_OFF = 'The upload broke off';
const TOO_LONG = 'The upload was longer than it said';
const NOT_STORED = "The buzzer room couldn't store it";

/** An upload on its way: the bytes kept for it, the idle files to be deleted for it, and how to stop it. */
interface Job {
  bytes: number;
  drop: string[];
  cancel(): void;
}

/** Reads the rest of an upload and throws it away (stopping after `max` bytes more). */
async function drain(body: PieceSource, max: number): Promise<void> {
  try {
    for (let n = 0; n <= max; ) {
      const piece = await body.next();
      if (!piece) return;
      n += piece.byteLength;
    }
  } catch {
    // (it broke off)
  }
  body.cancel();
}

/** First in, first out, `free` at once. acquire() gives a release that does something once. */
class Gate {
  private waiting: (() => void)[] = [];
  constructor(private free: number) {}

  acquire(): Promise<() => void> {
    return new Promise((ok) => {
      const go = () => {
        let held = true;
        ok(() => {
          if (!held) return;
          held = false;
          const next = this.waiting.shift();
          if (next) next();
          else this.free++;
        });
      };
      if (this.free > 0) {
        this.free--;
        go();
      } else this.waiting.push(go);
    });
  }
}

export class FileStore {
  /** The uploads on their way, by their pieces' prefix. */
  private jobs = new Map<string, Job>();
  private gate = new Gate(SENDS_AT_ONCE);

  constructor(private deps: StoreDeps) {}

  /** The uploads on their way (but `except`), counted against the room's caps. */
  private pending(except?: string): Pending {
    const ahead = [...this.jobs].filter(([k]) => k !== except).map(([, j]) => j);
    return { files: ahead.length, bytes: ahead.reduce((n, j) => n + j.bytes, 0), drop: ahead.flatMap((j) => j.drop) };
  }

  /**
   * A card file from the host (index.ts checked its token and type). Each part marked "in one go" runs with no await
   * inside, so nothing else in the room happens in the middle of it.
   */
  async upload({ mime, size, who, body, room }: UploadJob): Promise<Upload> {
    const lim = this.deps.limits();
    const no = (status: number, error: string): Upload => {
      body.cancel();
      return { status, error };
    };
    /**
     * Turned away before a piece of it was stored, for a reason the app tells the host: the rest of it is read and
     * thrown away first, so the answer gets there (cut off mid-upload, the app may get only a broken connection).
     */
    const refuse = async (status: number, error: string): Promise<Upload> => {
      await drain(body, lim.fileBytes);
      return { status, error };
    };
    if (size !== null && size > lim.fileBytes) return no(413, tooBig(lim));
    if (size === 0) return no(400, EMPTY);
    if (this.jobs.size >= UPLOADS_AT_ONCE) return refuse(429, TAKING_ANOTHER);
    const reserve = size ?? lim.fileBytes;
    // In one go: room for it, kept from here (before today's budget, which costs a call).
    let r = room();
    if (!r) return no(401, WRONG);
    const fit = r.fileSpace(reserve, this.pending());
    if (fit === 'full') return refuse(409, ROOM_FULL);
    const prefix = this.deps.prefix();
    const job: Job = { bytes: reserve, drop: fit.drop, cancel: () => body.cancel() };
    this.jobs.set(prefix, job);
    let ticket: unknown = null;
    let taken = false;
    let parts = 0;
    /** Done: no longer on its way, and what it took of today's budget and didn't use is given back. */
    const end = async (answer: Upload, unused: number): Promise<Upload> => {
      this.jobs.delete(prefix);
      if (taken && unused > 0) await this.deps.refund(who, unused, ticket).catch(() => {});
      return answer;
    };
    /** Failed after its pieces began: what it wrote is deleted, unless the room ended (its wipe took them; that's why). */
    const fail = (status: number, error: string): Promise<Upload> => {
      body.cancel();
      const live = room();
      if (!live) return end({ status: 401, error: WRONG }, reserve);
      if (parts) this.deps.drop(prefix, parts);
      live.uploadEnded(prefix);
      return end({ status, error }, reserve);
    };
    try {
      let took: Took;
      try {
        took = await this.deps.take(who, reserve);
      } catch {
        return no(500, NOT_STORED);
      }
      if (typeof took === 'string') {
        this.jobs.delete(prefix);
        return await refuse(took === 'off' ? 503 : 429, took === 'off' ? FILES_OFF : this.deps.busyText(took));
      }
      taken = true;
      ticket = took.ticket;
      // In one go: the room again (a file chosen to make room may be on a card again by now), then the idle files that
      // make room go, and the upload is noted before its first piece.
      r = room();
      if (!r) {
        body.cancel();
        return await end({ status: 401, error: WRONG }, reserve);
      }
      const fit2 = r.fileSpace(reserve, this.pending(prefix));
      if (fit2 === 'full') {
        await end({ status: 409, error: ROOM_FULL }, reserve);
        return await refuse(409, ROOM_FULL);
      }
      r.dropIdle(fit2.drop);
      job.drop = [];
      r.uploadStarted(prefix, Math.ceil(reserve / FILE_PART_BYTES));

      const hash = this.deps.hasher();
      let n = 0;
      for (;;) {
        let piece: Uint8Array | null;
        try {
          piece = await body.next();
        } catch {
          return await fail(400, BROKE_OFF);
        }
        if (!piece) break;
        n += piece.byteLength;
        // (Without a size, it kept room for a whole file limit.)
        if (n > reserve) return await fail(size === null ? 413 : 400, size === null ? tooBig(lim) : TOO_LONG);
        try {
          await hash.write(piece);
        } catch {
          return await fail(500, NOT_STORED);
        }
        // In one go: never into a room that ended meanwhile (its wipe deletes what came before).
        if (!room()) return await fail(401, WRONG);
        const key = `${prefix}:${parts++}`;
        try {
          await this.deps.put(key, piece);
        } catch {
          return await fail(500, NOT_STORED);
        }
      }
      if (!n) return await fail(400, EMPTY);
      if (size !== null && n !== size) return await fail(400, BROKE_OFF);
      let id: string;
      try {
        id = await hash.hex();
      } catch {
        return await fail(500, NOT_STORED);
      }
      // In one go: listed, or a twin of one listed meanwhile (or before) is deleted.
      r = room();
      if (!r) return await end({ status: 401, error: WRONG }, reserve);
      if (r.fileHave(id)) {
        this.deps.drop(prefix, parts);
        r.uploadEnded(prefix);
        return await end({ status: 200, id }, reserve);
      }
      r.fileStored(prefix, id, mime, n, parts);
      return await end({ status: 200, id }, reserve - n);
    } finally {
      this.jobs.delete(prefix);
    }
  }

  /** The room ended (wipe): every upload on its way stops reading. */
  abortAll(): void {
    for (const j of this.jobs.values()) j.cancel();
    this.jobs.clear();
  }

  /**
   * Card file `id` as a response, its pieces read one a pull: file() is the room's say (room.ts fileFor), asked once
   * its turn comes; live() is false once the room ended. 404 when it may not have it or it's gone. The answer carries
   * its size in X-File-Bytes, for its Content-Length (index.ts download).
   */
  async send(id: string, file: () => RoomFile | null, live: () => boolean): Promise<Response> {
    const release = await this.gate.acquire();
    const missing = () => {
      release();
      return new Response(null, { status: 404 });
    };
    const f = live() ? file() : null;
    if (!f) return missing();
    let first: Uint8Array | undefined;
    try {
      first = await this.deps.get(pieceKey(id, f, 0));
    } catch {
      first = undefined;
    }
    if (!first?.byteLength || !live()) return missing();
    let i = 0;
    let sent = 0;
    const body = new ReadableStream({
      type: 'bytes',
      pull: async (c) => {
        try {
          let piece: Uint8Array | undefined;
          if (i === 0) {
            piece = first;
            first = undefined;
          } else piece = live() ? await this.deps.get(pieceKey(id, f, i)) : undefined;
          i++;
          sent += piece?.byteLength ?? 0;
          if (!piece?.byteLength || sent > f.bytes || (i >= f.parts && sent !== f.bytes)) throw new Error('card file gone');
          c.enqueue(piece);
          if (i >= f.parts) {
            c.close();
            release();
          }
        } catch {
          release();
          try {
            c.error(new Error('card file gone'));
          } catch {
            // cancelled meanwhile
          }
        }
      },
      cancel: () => release(),
    });
    return new Response(body, { headers: { 'Content-Type': f.mime, 'X-File-Bytes': String(f.bytes) } });
  }
}
