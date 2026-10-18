/**
 * A buzzer room's card files in its Durable Object's storage, a FILE_PART_BYTES piece at a time both ways, so a big file
 * takes no more of the room's memory than a small one. No Cloudflare APIs here (index.ts passes in storage, hashing and
 * the budget's counter), so it's unit-tested (filestore.test.ts).
 *
 * Uploads: room for the file is kept before a piece is written: the room's caps and the server's budget for its stated
 * size (Content-Length), or for a whole file limit when it gives none (a refund gives back what it didn't use). Two at
 * once per room at most (UPLOADS_AT_ONCE), counted against the caps together. Its pieces go under a key prefix of its
 * own (p:<random>:<n>, never used again), noted in the room before the first one (RoomSaved.uploads, so a room
 * restarted mid-upload deletes them), and its id, the SHA-256, is worked out on the way. Then the room lists it under
 * that prefix, or, when it holds the same bytes already (a twin that finished first), its pieces are deleted. An upload
 * that fails deletes what it wrote and gives back what it took of the budget, and so does one still going UPLOAD_MAX_MS
 * after the budget was taken. A file's age counts from then too, so what the budget paid for is gone before it stops
 * counting. Nothing more is written once the room has ended, or a new room took its code (room() is null then): the
 * room's wipe deletes what was.
 *
 * Downloads: piece 0 is read before answering (a missing file is a clean 404), then one piece a pull, so a slow phone
 * holds one piece in memory, never the file. SENDS_AT_ONCE at once per room; the rest wait their turn, SENDS_PER_PHONE
 * at most for one phone, and one that stops taking pieces gives its place up after SEND_STALL_MS. A file deleted while
 * it goes out (no card uses it any more) ends the body with an error.
 */
import { UPLOADS_BUSY, type FileLimits } from '../../src/lib/buzzproto';
import { FILES_OFF, tooBig } from './limits';
import { pieceKey, type RoomFile } from './room';

/** A card file's bytes are stored in pieces this big (a Durable Object value is at most 2 MB, its key included). */
export const FILE_PART_BYTES = 1024 * 1024;
/** Uploads at once per room (the app sends one at a time; this lets a stale second window send too). */
export const UPLOADS_AT_ONCE = 2;
/**
 * An upload still going this long after its part of the budget was taken is stopped (408), its pieces deleted: what it
 * stores must be gone before that part stops counting (limits.ts FILE_MAX_AGE_MS). 90 MB in an hour is 200 kbps.
 */
export const UPLOAD_MAX_MS = 60 * 60 * 1000;
/** Downloads at once per room; more wait their turn (first in, first out). */
export const SENDS_AT_ONCE = 24;
/**
 * Downloads going or waiting at once for one phone's token; more get 429 (the phone tries again). A phone fetches 2 at
 * once, and a reload can leave 2 more half-open: one player can't hold the room's places.
 */
export const SENDS_PER_PHONE = 4;
/**
 * A download whose line hasn't taken a piece for this long (a phone asleep, or gone without letting go) is ended, and
 * its place freed. Long, so a slow line isn't cut: 1 MB in 5 minutes is under 30 kbps.
 */
export const SEND_STALL_MS = 5 * 60_000;

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
  /** at: when its part of the budget was taken (its age counts from then). */
  fileStored(prefix: string, id: string, mime: string, bytes: number, parts: number, at: number): void;
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

/** The budget taken (ticket: what a refund needs, the hour it was counted under), or why not. */
export type Took = { ok: true; ticket: unknown } | 'off' | 'busy' | 'address';

export interface StoreDeps {
  limits(): FileLimits;
  now(): number;
  put(key: string, piece: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | undefined>;
  /** Deletes pieces 0 to parts − 1 under prefix (not awaited). */
  drop(prefix: string, parts: number): void;
  /** A new key prefix for an upload's pieces. */
  prefix(): string;
  hasher(): Hasher;
  /** n bytes of the budget for address key `who` (RoomCounter.takeBytes). */
  take(who: string, n: number): Promise<Took>;
  /** n bytes taken that weren't stored after all, given back (with take's ticket). */
  refund(who: string, n: number, ticket: unknown): Promise<void>;
  /** The 429's words for n bytes from `who` refused (they say when to try again). */
  busyText(took: 'address' | 'busy', who: string, n: number): Promise<string>;
}

export interface UploadJob {
  mime: string;
  /** Its Content-Length (null: it didn't say). */
  size: number | null;
  /** Its address key (addressKey), for the budget. */
  who: string;
  body: PieceSource;
  /** The room, or null once it ended or a new room took its code. */
  room: () => FileRoom | null;
}

const WRONG = 'wrong host token';
const EMPTY = 'empty file';
const ROOM_FULL = 'This room holds all the card files it can: send fewer pictures and videos at once';
const BROKE_OFF = 'The upload broke off';
const TOO_LONG = 'The upload was longer than it said';
const NOT_STORED = "The buzzer room couldn't store it";
const TOO_SLOW = 'The upload took too long';

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
  /** Downloads going or waiting, by phone token. */
  private sending = new Map<string, number>();

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
    if (this.jobs.size >= UPLOADS_AT_ONCE) return refuse(429, UPLOADS_BUSY);
    const reserve = size ?? lim.fileBytes;
    // In one go: room for it, kept from here (before the budget, which costs a call).
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
    /** When the budget was asked for: the file's age counts from then, as the budget does. */
    let takenAt = 0;
    let late = false;
    let deadline: ReturnType<typeof setTimeout> | null = null;
    /** Done: no longer on its way, and what it took of the budget and didn't use is given back. */
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
      takenAt = this.deps.now();
      try {
        took = await this.deps.take(who, reserve);
      } catch {
        return no(500, NOT_STORED);
      }
      if (typeof took === 'string') {
        this.jobs.delete(prefix);
        return await refuse(took === 'off' ? 503 : 429, took === 'off' ? FILES_OFF : await this.deps.busyText(took, who, reserve));
      }
      taken = true;
      ticket = took.ticket;
      // (Stopped reading: next() throws, and it fails as one that broke off, with its own words.)
      deadline = setTimeout(() => {
        late = true;
        body.cancel();
      }, UPLOAD_MAX_MS);
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
          return await (late ? fail(408, TOO_SLOW) : fail(400, BROKE_OFF));
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
      r.fileStored(prefix, id, mime, n, parts, takenAt);
      return await end({ status: 200, id }, reserve - n);
    } finally {
      if (deadline !== null) clearTimeout(deadline);
      this.jobs.delete(prefix);
    }
  }

  /** The room ended (wipe): every upload on its way stops reading. */
  abortAll(): void {
    for (const j of this.jobs.values()) j.cancel();
    this.jobs.clear();
  }

  /**
   * Card file `id` as a response, its pieces read one a pull: file() is the room's say (room.ts fileFor), asked before it
   * waits and again once its turn comes; live() is false once the room ended. 404 when it may not have it or it's gone;
   * 429 when `who` (the phone's token) has SENDS_PER_PHONE going or waiting already. The answer carries its size in
   * X-File-Bytes, for its Content-Length (index.ts download).
   */
  async send(id: string, who: string, file: () => RoomFile | null, live: () => boolean): Promise<Response> {
    // (One it may not have never waits behind a full room.)
    if (!(live() ? file() : null)) return new Response(null, { status: 404 });
    const mine = this.sending.get(who) ?? 0;
    if (mine >= SENDS_PER_PHONE) return new Response(null, { status: 429 });
    this.sending.set(who, mine + 1);
    const place = await this.gate.acquire();
    let held = true;
    let stall: ReturnType<typeof setTimeout> | null = null;
    const unwait = () => {
      if (stall !== null) clearTimeout(stall);
      stall = null;
    };
    const release = () => {
      unwait();
      if (!held) return;
      held = false;
      const n = (this.sending.get(who) ?? 1) - 1;
      if (n > 0) this.sending.set(who, n);
      else this.sending.delete(who);
      place();
    };
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
    let line: ReadableByteStreamController | undefined;
    const end = (why: string) => {
      release();
      try {
        line?.error(new Error(why));
      } catch {
        // cancelled meanwhile
      }
    };
    // (Started again each time a piece goes into the line, stopped while the next is read from storage.)
    const wait = () => {
      unwait();
      stall = setTimeout(() => end('card file stalled'), SEND_STALL_MS);
    };
    const body = new ReadableStream({
      type: 'bytes',
      start: (c) => {
        line = c;
        wait();
      },
      pull: async (c) => {
        unwait();
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
          } else wait();
        } catch {
          end('card file gone');
        }
      },
      cancel: () => release(),
    });
    return new Response(body, { headers: { 'Content-Type': f.mime, 'X-File-Bytes': String(f.bytes) } });
  }
}
