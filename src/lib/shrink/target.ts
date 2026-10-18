// Where a 🗜 copy is written as it's made (card-files spec §4.13.2): mediabunny's StreamTarget hands over pieces of the
// file, which are kept as Blob parts (the browser may keep big ones on disk), never one growing buffer. A piece written
// back over earlier bytes (an MP4's box sizes, a WebM's lengths, at the end) is kept as a small patch, laid over the
// parts when the file is put together. Pure but for the StreamTarget it's given, so it's tested in Node.
import type { StreamTarget, StreamTargetChunk } from 'mediabunny';

const MiB = 1024 * 1024;

/** A file being written: pieces at the end, and patches over what's there already. */
export class BlobParts {
  private parts: Blob[] = [];
  private size = 0;
  private patches: { at: number; data: Uint8Array }[] = [];

  /** `data` at byte `at`: at the end it's added; over earlier bytes it's a patch (anything past the end is added). */
  write(data: Uint8Array, at: number): void {
    if (!Number.isSafeInteger(at) || at < 0 || at > this.size) throw new Error(`A gap in the file: a write at ${at}, with ${this.size} bytes so far`);
    if (at === this.size) return this.add(data);
    const over = Math.min(data.byteLength, this.size - at);
    // (Copied: the writer may use its buffer again.)
    this.patches.push({ at, data: data.slice(0, over) });
    if (over < data.byteLength) this.add(data.subarray(over));
  }

  private add(data: Uint8Array): void {
    if (!data.byteLength) return;
    // (A Blob copies what it's made from.)
    this.parts.push(new Blob([data as Uint8Array<ArrayBuffer>]));
    this.size += data.byteLength;
  }

  bytes(): number {
    return this.size;
  }

  /** The whole file: its parts, cut around the patches, each patch over them in the order it came. */
  blob(type: string): Blob {
    type Piece = { at: number; end: number; src: Blob | Uint8Array; off: number };
    let pieces: Piece[] = [];
    let at = 0;
    for (const p of this.parts) {
      pieces.push({ at, end: at + p.size, src: p, off: 0 });
      at += p.size;
    }
    for (const patch of this.patches) {
      const end = patch.at + patch.data.byteLength;
      const next: Piece[] = [];
      for (const x of pieces) {
        if (x.end <= patch.at || x.at >= end) {
          next.push(x);
          continue;
        }
        if (x.at < patch.at) next.push({ ...x, end: patch.at });
        if (x.end > end) next.push({ at: end, end: x.end, src: x.src, off: x.off + (end - x.at) });
      }
      next.push({ at: patch.at, end, src: patch.data, off: 0 });
      pieces = next.sort((a, b) => a.at - b.at);
    }
    const cut = (x: Piece) => (x.src instanceof Blob ? x.src.slice(x.off, x.off + x.end - x.at) : (x.src.subarray(x.off, x.off + x.end - x.at) as Uint8Array<ArrayBuffer>));
    return new Blob(pieces.map(cut), { type });
  }
}

/**
 * A StreamTarget that writes into Blob parts of `chunkSize` (mediabunny's own `mb.StreamTarget`, passed in so this file
 * never loads it): `blob(type)` is the file once the output is finalized.
 */
export function blobTarget(mb: { StreamTarget: typeof StreamTarget }, chunkSize = 16 * MiB): { target: StreamTarget; blob(type: string): Blob; bytes(): number } {
  const parts = new BlobParts();
  const writable = new WritableStream<StreamTargetChunk>({ write: (c) => parts.write(c.data, c.position) });
  return { target: new mb.StreamTarget(writable, { chunked: true, chunkSize }), blob: (type) => parts.blob(type), bytes: () => parts.bytes() };
}
