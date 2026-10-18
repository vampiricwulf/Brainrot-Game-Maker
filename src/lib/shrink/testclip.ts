// For tests: a short video made of packets, as mediabunny writes it (no encoder needed, so it's made in Node too).
import { EncodedPacket, EncodedVideoPacketSource, Mp4OutputFormat, Output, WebMOutputFormat, type BufferTarget, type StreamTarget } from 'mediabunny';

/** 3 s of a 64×36 VP9 video with no sound (30 packets, a key frame every second), into `target`. */
export async function mux(format: 'mp4' | 'webm', target: BufferTarget | StreamTarget): Promise<void> {
  const out = new Output({ format: format === 'mp4' ? new Mp4OutputFormat({ fastStart: false }) : new WebMOutputFormat(), target });
  const src = new EncodedVideoPacketSource('vp9');
  out.addVideoTrack(src);
  await out.start();
  for (let i = 0; i < 30; i++) {
    const data = new Uint8Array(500 + ((i * 37) % 300)).fill(i);
    const meta = i ? undefined : { decoderConfig: { codec: 'vp09.00.10.08', codedWidth: 64, codedHeight: 36 } };
    await src.add(new EncodedPacket(data, i % 10 ? 'delta' : 'key', i / 10, 0.1), meta);
  }
  await out.finalize();
}
