// 🗜 A sound's copy for phones when the app's reader can't decode it (card-files spec §4.7): the browser's own player
// decodes it instead (decodeAudioData, 15 minutes at most: it's all held in memory), and the sound is encoded from there
// a few seconds at a time. Anything else goes through convertBlob (run.ts).
import type { Span } from './plan';
import { RunError, type Made } from './run';
import { blobTarget } from './target';

/** The longest sound made this way (seconds). */
export const HERE_MAX_SECONDS = 15 * 60;
/** Encoded this many seconds at a time (it says how far it got, and stops, between them). */
const PIECE_SECONDS = 5;
const RATE = 48_000;

const stopped = () => new DOMException('Stopped', 'AbortError');

/**
 * `src` decoded by the browser, the part `range` holds (none: all of it) encoded as `codec` at `bitrate` into an M4A or
 * an OGG, at most 2 channels. `ctl.signal` stops it (an AbortError). Throws a RunError when the browser can't decode it
 * ('undecodable') or it's too long ('too-long').
 */
export async function soundHere(
  src: Blob,
  p: { codec: 'aac' | 'opus'; bitrate: number; mime: string; range: Span | null },
  ctl: { signal: AbortSignal; progress(p: number): void },
): Promise<Made> {
  if (ctl.signal.aborted) throw stopped();
  let buf: AudioBuffer;
  try {
    buf = await new OfflineAudioContext(1, 1, RATE).decodeAudioData(await src.arrayBuffer());
  } catch (e) {
    throw new RunError('undecodable', (e as Error)?.message);
  }
  if (buf.duration > HERE_MAX_SECONDS) throw new RunError('too-long');
  if (ctl.signal.aborted) throw stopped();
  const sr = buf.sampleRate;
  const start = Math.min(buf.length, Math.max(0, Math.round((p.range?.from ?? 0) * sr)));
  const end = Math.max(start, Math.min(buf.length, p.range?.to != null ? Math.round(p.range.to * sr) : buf.length));
  const channels = Math.min(2, buf.numberOfChannels);
  const mb = await import('./mb');
  const t = blobTarget(mb);
  const output = new mb.Output({ format: p.mime === 'audio/mp4' ? new mb.Mp4OutputFormat({ fastStart: false }) : new mb.OggOutputFormat(), target: t.target });
  const source = new mb.AudioBufferSource({ codec: p.codec, quality: new mb.Quality({ bitrate: p.bitrate }) });
  output.addAudioTrack(source);
  try {
    await output.start();
    for (let at = start; at < end; ) {
      if (ctl.signal.aborted) throw stopped();
      const n = Math.min(PIECE_SECONDS * sr, end - at);
      const piece = new AudioBuffer({ length: n, numberOfChannels: channels, sampleRate: sr });
      for (let c = 0; c < channels; c++) piece.copyToChannel(buf.getChannelData(c).subarray(at, at + n), c);
      await source.add(piece);
      at += n;
      ctl.progress((at - start) / Math.max(1, end - start));
    }
    if (ctl.signal.aborted) throw stopped();
    await output.finalize();
  } catch (e) {
    void output.cancel().catch(() => {});
    throw ctl.signal.aborted ? stopped() : e;
  }
  return { blob: t.blob(p.mime), mime: p.mime, seconds: (end - start) / sr };
}
