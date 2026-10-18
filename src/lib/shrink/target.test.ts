// Where a 🗜 copy is written (card-files spec §4.13.2): Blob parts, with the bytes written back over earlier ones laid
// over them, so the file comes out exactly as mediabunny's own in-memory target makes it.
import { BufferTarget, StreamTarget } from 'mediabunny';
import { describe, expect, it } from 'vitest';
import { BlobParts, blobTarget } from './target';
import { mux } from './testclip';

const bytes = async (b: Blob) => [...new Uint8Array(await b.arrayBuffer())];
const u8 = (...n: number[]) => new Uint8Array(n);

describe('BlobParts', () => {
  it('adds what comes at the end, and lays what comes back over earlier bytes on top, in the order it came', async () => {
    const p = new BlobParts();
    p.write(u8(1, 2, 3), 0);
    p.write(u8(4, 5), 3);
    // Over bytes 1 to 3, and past the end.
    p.write(u8(9, 9, 9, 9, 7), 1);
    p.write(u8(8), 2);
    expect(p.bytes()).toBe(6);
    const b = p.blob('video/webm');
    expect(b.type).toBe('video/webm');
    expect(await bytes(b)).toEqual([1, 9, 8, 9, 9, 7]);
  });

  it('keeps its own copy of what it was given', async () => {
    const p = new BlobParts();
    const d = u8(1, 2, 3, 4);
    p.write(d, 0);
    p.write(d.subarray(0, 2), 1);
    d.fill(0);
    expect(await bytes(p.blob(''))).toEqual([1, 1, 2, 4]);
  });

  it('turns down a write past the end', () => {
    const p = new BlobParts();
    p.write(u8(1), 0);
    expect(() => p.write(u8(2), 2)).toThrow(/gap/);
  });
});

describe('blobTarget', () => {
  for (const format of ['mp4', 'webm'] as const)
    it(`makes the very bytes of mediabunny's in-memory target (${format}), in small chunks too`, async () => {
      const mem = new BufferTarget();
      await mux(format, mem);
      const t = blobTarget({ StreamTarget }, 4096);
      await mux(format, t.target);
      const want = new Uint8Array(mem.buffer!);
      expect(t.bytes()).toBe(want.byteLength);
      expect(new Uint8Array(await t.blob('video/' + format).arrayBuffer())).toEqual(want);
    });
});
