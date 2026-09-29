import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { buildZip, crc32 } from './zipwrite';

const bytes = (s: string) => new TextEncoder().encode(s);

describe('zip writer', () => {
  it('computes CRC-32 like everyone else, also across chunks', () => {
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926);
    expect(crc32(bytes(''))).toBe(0);
    expect(crc32(bytes('6789'), crc32(bytes('12345')))).toBe(0xcbf43926);
  });

  it('writes a pack the reader opens, checksums verified', async () => {
    const big = new Uint8Array(9 * 1024 * 1024); // spans several read chunks
    for (let i = 0; i < big.length; i += 4096) big[i] = (i / 4096) & 0xff;
    const { blob, failed } = await buildZip([
      { name: 'game.json', data: new Blob(['{"a":1}']) },
      { name: 'media/x.bin', data: new Blob([big]) },
      { name: 'media/ünïcode.png', data: new Blob([bytes('png!')]) },
      { name: 'media/empty.mp3', data: new Blob([]) },
    ]);
    expect(failed).toEqual([]);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer(), { checkCRC32: true });
    expect(await zip.file('game.json')!.async('string')).toBe('{"a":1}');
    const back = await zip.file('media/x.bin')!.async('uint8array');
    // Compare by length and checksum: a deep compare of 9 million bytes is very slow.
    expect(back.length).toBe(big.length);
    expect(crc32(back)).toBe(crc32(big));
    expect(await zip.file('media/ünïcode.png')!.async('string')).toBe('png!');
    expect((await zip.file('media/empty.mp3')!.async('uint8array')).length).toBe(0);
  }, 20_000);

  it('leaves out a file the browser can no longer read instead of failing the whole save', async () => {
    const unreadable = { size: 10, slice: () => ({ arrayBuffer: () => Promise.reject(new Error('NotReadableError')) }) } as unknown as Blob;
    const { blob, failed } = await buildZip([
      { name: 'game.json', data: new Blob(['{}']) },
      { name: 'media/lost.mp4', data: unreadable },
      { name: 'media/ok.png', data: new Blob([bytes('ok')]) },
    ]);
    expect(failed).toEqual(['media/lost.mp4']);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer(), { checkCRC32: true });
    expect(Object.keys(zip.files).sort()).toEqual(['game.json', 'media/ok.png']);
  });

  it('reports progress over the bytes it checks', async () => {
    const seen: number[] = [];
    await buildZip([{ name: 'a', data: new Blob([new Uint8Array(5 * 1024 * 1024)]) }], (done, total) => seen.push(done / total));
    expect(seen.at(-1)).toBe(1);
    expect(seen.length).toBeGreaterThan(1);
  });
});
