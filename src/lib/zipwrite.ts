// A small ZIP writer for .jbr packs (stored, no compression: media is already compressed).
// The archive is a Blob made of the headers plus the original media Blobs, so saving never copies
// the media into memory, and checksums are computed in chunks that give the page time to breathe.
// (A zip library copied every file into memory first, which froze big games for seconds and could
// run out of memory.)

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** Continue a CRC-32 over more bytes. Start with 0; the result is the finished CRC so far. */
export function crc32(bytes: Uint8Array, crc = 0): number {
  let c = ~crc;
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

const CHUNK = 4 * 1024 * 1024;
const breathe = () => new Promise<void>((r) => setTimeout(r, 0));

/** CRC-32 of a Blob, read in chunks. Throws if the Blob can't be read (e.g. storage lost the file). */
async function crcOf(blob: Blob, onBytes: (n: number) => void): Promise<number> {
  let crc = 0;
  for (let at = 0; at < blob.size; at += CHUNK) {
    const part = new Uint8Array(await blob.slice(at, at + CHUNK).arrayBuffer());
    crc = crc32(part, crc);
    onBytes(part.length);
    await breathe();
  }
  return crc;
}

export interface ZipEntry {
  name: string;
  data: Blob;
}

const LIMIT = 0xffffffff; // no zip64: every size and offset must fit in 32 bits (4 GB)

function dosTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/**
 * Build a stored zip. Entries whose data can't be read are left out and reported in `failed`.
 * `onProgress(done, total)` reports bytes checksummed.
 */
export async function buildZip(
  entries: ZipEntry[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ blob: Blob; failed: string[] }> {
  const enc = new TextEncoder();
  const { time, date } = dosTime(new Date());
  const total = entries.reduce((n, e) => n + e.data.size, 0);
  let done = 0;
  const parts: BlobPart[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  const failed: string[] = [];
  let offset = 0;
  let count = 0;
  for (const e of entries) {
    let crc: number;
    try {
      crc = await crcOf(e.data, (n) => onProgress?.((done += n), total));
    } catch {
      failed.push(e.name);
      continue;
    }
    const name = enc.encode(e.name);
    const size = e.data.size;
    if (size > LIMIT || offset + 30 + name.length + size > LIMIT) throw new Error('This game is too big to save as one pack (over 4 GB).');
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // names are UTF-8
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(local.buffer, name as Uint8Array<ArrayBuffer>, e.data);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true); // made by
    cd.setUint16(6, 20, true); // needed
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, time, true);
    cd.setUint16(14, date, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, size, true);
    cd.setUint32(24, size, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true); // disk, attributes and comment stay 0
    const rec = new Uint8Array(46 + name.length);
    rec.set(new Uint8Array(cd.buffer), 0);
    rec.set(name, 46);
    central.push(rec);

    offset += 30 + name.length + size;
    count++;
  }
  const cdSize = central.reduce((n, r) => n + r.length, 0);
  if (offset + cdSize > LIMIT) throw new Error('This game is too big to save as one pack (over 4 GB).');
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, count, true);
  end.setUint16(10, count, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  parts.push(...central, end.buffer);
  return { blob: new Blob(parts, { type: 'application/zip' }), failed };
}
