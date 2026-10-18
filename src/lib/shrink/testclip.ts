// For tests: short files made of packets, as mediabunny writes them (no encoder needed, so they're made in Node too).
import {
  EncodedAudioPacketSource,
  EncodedPacket,
  EncodedVideoPacketSource,
  MkvOutputFormat,
  Mp4OutputFormat,
  MpegTsOutputFormat,
  Output,
  WebMOutputFormat,
  type BufferTarget,
  type StreamTarget,
} from 'mediabunny';

/**
 * 3 s of a 64×36 VP9 video (30 packets, a key frame every second), into `target`: in an MP4, a WebM or an MKV, with an
 * Opus sound when `opus` (silence-sized packets; nothing here decodes them).
 */
export async function mux(format: 'mp4' | 'webm' | 'mkv', target: BufferTarget | StreamTarget, opus = false): Promise<void> {
  const out = new Output({ format: format === 'mp4' ? new Mp4OutputFormat({ fastStart: false }) : format === 'mkv' ? new MkvOutputFormat() : new WebMOutputFormat(), target });
  const src = new EncodedVideoPacketSource('vp9');
  out.addVideoTrack(src);
  const sound = opus ? new EncodedAudioPacketSource('opus') : null;
  if (sound) out.addAudioTrack(sound);
  await out.start();
  for (let i = 0; i < 30; i++) {
    const data = new Uint8Array(500 + ((i * 37) % 300)).fill(i);
    const meta = i ? undefined : { decoderConfig: { codec: 'vp09.00.10.08', codedWidth: 64, codedHeight: 36 } };
    await src.add(new EncodedPacket(data, i % 10 ? 'delta' : 'key', i / 10, 0.1), meta);
    // (Five 20 ms Opus packets with each picture.)
    if (sound)
      for (let k = 0; k < 5; k++) {
        const at = i / 10 + k * 0.02;
        await sound.add(new EncodedPacket(new Uint8Array([0xf8, 0xff, 0xfe]), 'key', at, 0.02), i || k ? undefined : { decoderConfig: { codec: 'opus', numberOfChannels: 2, sampleRate: 48_000 } });
      }
  }
  await out.finalize();
}

// A silent MP3 frame (MPEG-1 Layer III, 44.1 kHz, mono, 32 kbps): see tests/e2e/mediafixtures.mjs.
const MP3_FRAME =
  '//sQxAADwAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=';

/** `seconds` of silence as MP3 in an MPEG-TS (a camcorder's .mts stands in), into `target`. */
export async function muxTs(target: BufferTarget | StreamTarget, seconds = 2): Promise<void> {
  const out = new Output({ format: new MpegTsOutputFormat(), target });
  const src = new EncodedAudioPacketSource('mp3');
  out.addAudioTrack(src);
  await out.start();
  const frame = Uint8Array.from(atob(MP3_FRAME), (c) => c.charCodeAt(0));
  const d = 1152 / 44_100;
  for (let k = 0; k * d < seconds; k++) await src.add(new EncodedPacket(frame, 'key', k * d, d), k ? undefined : { decoderConfig: { codec: 'mp3', numberOfChannels: 1, sampleRate: 44_100 } });
  await out.finalize();
}
