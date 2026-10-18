// The one module that imports mediabunny (MPL-2.0, github.com/Vanilagy/mediabunny), naming only what 🗜 uses. Everything
// else loads it with `await import('./mb')` (and imports its types with `import type`), so it's read only when a file
// is first read or a copy first made.
import { ADTS, FLAC, MATROSKA, MP3, MP4, MPEG_TS, OGG, QTFF, WAVE, WEBM } from 'mediabunny';

export {
  ADTS,
  AudioBufferSource,
  BlobSource,
  CanvasSource,
  canEncodeAudio,
  canEncodeVideo,
  Conversion,
  ConversionCanceledError,
  FLAC,
  Input,
  MATROSKA,
  MP3,
  MP4,
  Mp4OutputFormat,
  MPEG_TS,
  OGG,
  OggOutputFormat,
  Output,
  QTFF,
  Quality,
  StreamTarget,
  WAVE,
  WEBM,
  WebMOutputFormat,
} from 'mediabunny';

/** The file types the app reads (not ALL_FORMATS, which brings HLS along). */
export const INPUTS = [MP4, QTFF, WEBM, MATROSKA, OGG, MP3, WAVE, FLAC, ADTS, MPEG_TS];
