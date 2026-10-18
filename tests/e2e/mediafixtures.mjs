// Videos, sounds and GIFs for the e2e tests, made here, a few MB at most: videos with mediabunny in a blank page of
// their own (Node has no video encoder; never the app's page, where mediabunny would be loaded twice), WAV sounds and
// GIFs (omggif) in Node.
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { GifWriter } = createRequire(import.meta.url)('omggif');

/** A blank page in `ctx` with mediabunny in it, as `window.Mediabunny`. */
export async function fixturePage(ctx) {
  const html = join(tmpdir(), 'brainrot-fixtures.html');
  writeFileSync(html, '<!doctype html><meta charset="utf-8"><title>Fixtures</title>');
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(html).href);
  await page.addScriptTag({ path: resolve('node_modules/mediabunny/dist/bundles/mediabunny.min.cjs') });
  return page;
}

// One second of silence in AC-3 (Dolby Digital) is 31.25 of this frame (48 kHz, mono, 64 kbps, 1,536 samples): the
// test Chromium doesn't play AC-3, so it stands in for a camcorder's or a film's sound. Made with
// `ffmpeg -f lavfi -i anullsrc=r=48000:cl=mono -t 0.032 -c:a ac3 -b:a 64k -f ac3 silence.ac3`.
const AC3_FRAME =
  'C3eQMQhAL4QpQ/51fPnz58+fPnz58+fPnz58+fPnz58+fPnz58+fPnz58+fPjL/BEAAAAA2vnz58222228ePHjx48ePHjx48btttvnzWtSgAAAAAbXz58+bbbbbePHjx48ePHjx48eN2223z5rWpQAAAAANr58+fNttttvHjx48ePHjx48ePG7bbb581rUoAAAAAG18+fPm22223jx48ePHjx48ePHjdttt8+a1qUAAAAADa+fPnzbbbbbx48ePHjx48ePHjxu222+fNa1KAAAAABtfPnz5ttttt48ePHjx48ePHjx43bbbfPmtakAAAAAAAAAAAAAAAAAAAAABLCg==';

/**
 * A clip made in `page` (fixturePage): `seconds` long at `fps`, `w`×`h`, its picture `codec` ('vp8' or 'vp9'; null:
 * none) at about `bitrate` bits a second (big blocks of noise, new each frame, so it comes out as big as asked; or with
 * `hue`, one colour all over whose hue goes round from red (0°) at the start to 300° at the end, which hueAt reads
 * back), a key frame every `keyEvery` seconds, with a sound when `audio`: an Opus tone (true or 'opus'), or AC-3
 * silence ('ac3'). In a WebM, an MKV (`box: 'mkv'`, which holds AC-3) or an MP4 (`box: 'mp4'`). Returns its bytes.
 */
export async function clip(page, { w = 320, h = 240, seconds = 2, fps = 30, codec = 'vp8', bitrate = 1_000_000, keyEvery = 1, audio = true, box = 'webm', hue = false } = {}) {
  const b64 = await page.evaluate(
    async (o) => {
      const M = window.Mediabunny;
      const target = new M.BufferTarget();
      const format = o.box === 'mkv' ? new M.MkvOutputFormat() : o.box === 'mp4' ? new M.Mp4OutputFormat() : new M.WebMOutputFormat();
      const out = new M.Output({ format, target });
      const canvas = Object.assign(document.createElement('canvas'), { width: o.w, height: o.h });
      const g = canvas.getContext('2d');
      const small = Object.assign(document.createElement('canvas'), { width: Math.ceil(o.w / 8), height: Math.ceil(o.h / 8) });
      const sg = small.getContext('2d');
      const video = o.codec ? new M.CanvasSource(canvas, { codec: o.codec, quality: new M.Quality({ bitrate: o.bitrate }), keyFrameInterval: o.keyEvery }) : null;
      if (video) out.addVideoTrack(video, { frameRate: o.fps });
      const opus = o.audio === true || o.audio === 'opus';
      const sound = opus ? new M.AudioSampleSource({ codec: 'opus', quality: new M.Quality({ bitrate: 64_000 }) }) : null;
      if (sound) out.addAudioTrack(sound);
      const ac3 = o.audio === 'ac3' ? new M.EncodedAudioPacketSource('ac3') : null;
      if (ac3) out.addAudioTrack(ac3);
      await out.start();
      if (ac3) {
        const frame = Uint8Array.from(atob(o.ac3Frame), (c) => c.charCodeAt(0));
        const d = 1536 / 48_000;
        for (let k = 0; k * d < o.seconds; k++)
          await ac3.add(new M.EncodedPacket(frame, 'key', k * d, d), k ? undefined : { decoderConfig: { codec: 'ac-3', numberOfChannels: 1, sampleRate: 48_000 } });
      }
      // (A sound alone: no frames, and the Opus tone below is a second at a time all the same.)
      const step = video ? 1 / o.fps : 1;
      let seed = 2463534242;
      const rnd = () => {
        seed ^= seed << 13;
        seed >>>= 0;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        seed >>>= 0;
        return seed & 255;
      };
      const rate = 48_000;
      const frames = Math.round(o.seconds / step);
      for (let i = 0; i < frames; i++) {
        const t = i * step;
        if (video && o.hue) {
          g.fillStyle = `hsl(${(300 * t) / o.seconds}, 100%, 50%)`;
          g.fillRect(0, 0, o.w, o.h);
          await video.add(t, step);
        } else if (video) {
          const img = sg.createImageData(small.width, small.height);
          for (let p = 0; p < img.data.length; p += 4) [img.data[p], img.data[p + 1], img.data[p + 2], img.data[p + 3]] = [rnd(), rnd(), rnd(), 255];
          sg.putImageData(img, 0, 0);
          g.imageSmoothingEnabled = false;
          g.drawImage(small, 0, 0, o.w, o.h);
          await video.add(t, step);
        }
        // A second of sound with each second of picture.
        if (sound && Math.abs(t - Math.round(t)) < step / 2) {
          const n = Math.min(rate, Math.round((o.seconds - t) * rate));
          const data = Float32Array.from({ length: n }, (_, k) => 0.2 * Math.sin((2 * Math.PI * 440 * (t * rate + k)) / rate));
          const s = new M.AudioSample({ data, format: 'f32-planar', numberOfChannels: 1, sampleRate: rate, timestamp: t });
          await sound.add(s);
          s.close();
        }
      }
      await out.finalize();
      const bytes = new Uint8Array(target.buffer);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    },
    { w, h, seconds, fps, codec, bitrate, keyEvery, audio, box, hue, ac3Frame: AC3_FRAME },
  );
  return Buffer.from(b64, 'base64');
}

// A silent MP3 frame (MPEG-1 Layer III, 44.1 kHz, mono, 32 kbps, 1,152 samples): the first 104 bytes of
// `ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 0.1 -c:a libmp3lame -b:a 32k -write_xing 0 -id3v2_version 0 -f mp3 s.mp3`.
const MP3_FRAME =
  '//sQxAADwAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=';

/**
 * An MPEG-TS holding only an MP3 sound (silence), `seconds` long, made in `page` (fixturePage): a camcorder's .mts
 * stands in, as the test Chromium doesn't open one, though its sound plays. Returns its bytes.
 */
export async function ts(page, { seconds = 3 } = {}) {
  const b64 = await page.evaluate(
    async (o) => {
      const M = window.Mediabunny;
      const target = new M.BufferTarget();
      const out = new M.Output({ format: new M.MpegTsOutputFormat(), target });
      const src = new M.EncodedAudioPacketSource('mp3');
      out.addAudioTrack(src);
      await out.start();
      const frame = Uint8Array.from(atob(o.frame), (c) => c.charCodeAt(0));
      const d = 1152 / 44_100;
      for (let k = 0; k * d < o.seconds; k++) await src.add(new M.EncodedPacket(frame, 'key', k * d, d), k ? undefined : { decoderConfig: { codec: 'mp3', numberOfChannels: 1, sampleRate: 44_100 } });
      await out.finalize();
      const bytes = new Uint8Array(target.buffer);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    },
    { seconds, frame: MP3_FRAME },
  );
  return Buffer.from(b64, 'base64');
}

/**
 * What's in a file (its bytes, `buf`), read in `page` (fixturePage): its type, length, and picture and sound codecs
 * (null: none).
 */
export async function readBack(page, buf) {
  return page.evaluate(async (b64) => {
    const M = window.Mediabunny;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const input = new M.Input({ source: new M.BufferSource(bytes), formats: M.ALL_FORMATS });
    const [format, seconds, v, a] = await Promise.all([input.getFormat(), input.computeDuration(), input.getPrimaryVideoTrack(), input.getPrimaryAudioTrack()]);
    return { format: format.name, seconds, video: v ? await v.getCodec() : null, audio: a ? await a.getCodec() : null };
  }, Buffer.from(buf).toString('base64'));
}

/**
 * The hue (degrees, 0 to 360) in the middle of a video's picture at `t` seconds (its bytes, `buf`), as `page`
 * (fixturePage) shows it, and how long it lasts: for clip({ hue: true }) a hue says when in the clip a frame was.
 */
export async function hueAt(page, buf, t) {
  return page.evaluate(
    async ({ b64, t }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const v = document.createElement('video');
      v.muted = true;
      v.src = URL.createObjectURL(new Blob([bytes]));
      await new Promise((ok, no) => ((v.onloadeddata = ok), (v.onerror = () => no(new Error('the video didn’t load')))));
      // (Seeked to, even at 0: the frame shown there is drawn by then.)
      v.currentTime = Math.max(t, 0.001);
      await new Promise((ok) => (v.onseeked = ok));
      const c = Object.assign(document.createElement('canvas'), { width: v.videoWidth, height: v.videoHeight });
      const g = c.getContext('2d');
      g.drawImage(v, 0, 0);
      const [r, gr, b] = g.getImageData(c.width >> 1, c.height >> 1, 1, 1).data;
      const max = Math.max(r, gr, b);
      const min = Math.min(r, gr, b);
      const d = max - min || 1;
      const hue = max === r ? ((gr - b) / d) % 6 : max === gr ? (b - r) / d + 2 : (r - gr) / d + 4;
      URL.revokeObjectURL(v.src);
      return { hue: (hue * 60 + 360) % 360, seconds: v.duration, width: v.videoWidth, height: v.videoHeight };
    },
    { b64: Buffer.from(buf).toString('base64'), t },
  );
}

/** A WAV of a 440 Hz tone: `seconds` long, 16-bit, `rate` samples a second, `channels` of them. */
export function wav(seconds, { rate = 44_100, channels = 2 } = {}) {
  const n = Math.round(rate * seconds);
  const bytes = n * channels * 2;
  const b = Buffer.alloc(44 + bytes);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + bytes, 4);
  b.write('WAVE', 8);
  b.write('fmt ', 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(channels, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * channels * 2, 28);
  b.writeUInt16LE(channels * 2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(bytes, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.round(8000 * Math.sin((i / rate) * 2 * Math.PI * 440));
    for (let c = 0; c < channels; c++) b.writeInt16LE(v, 44 + (i * channels + c) * 2);
  }
  return b;
}

let seed = 2463534242;
/** `n` bytes of noise: the same ones each run, in the order they're asked for. */
export const noise = (n) =>
  Uint8Array.from({ length: n }, () => {
    seed ^= seed << 13;
    seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    seed >>>= 0;
    return seed & 255;
  });
const palette = Array.from({ length: 256 }, (_, i) => (((i * 37) & 255) << 16) | (((i * 91) & 255) << 8) | ((i * 53) & 255));

/**
 * A looping GIF, `w`×`h`: each of `frames` is `px` (a palette index a pixel) over all of it, or over its own rectangle
 * (x, y, w, h), drawn over the frame before, for `delay` hundredths of a second. Noise makes a big GIF of a little.
 */
export function gif(w, h, frames) {
  // (Room for each frame's own pixels, twice over: noise doesn't compress.)
  const buf = new Uint8Array(100_000 + frames.reduce((n, f) => n + (f.w ?? w) * (f.h ?? h) * 2, 0));
  const g = new GifWriter(buf, w, h, { palette, loop: 0 });
  for (const f of frames) g.addFrame(f.x ?? 0, f.y ?? 0, f.w ?? w, f.h ?? h, f.px, { delay: f.delay, disposal: 1 });
  return Buffer.from(buf.slice(0, g.end()));
}

/**
 * A FLAC of a 440 Hz tone: 16-bit, one channel at 8 kHz, in frames of 4,096 samples stored as they are (FLAC's
 * "verbatim" kind, so nothing has to encode it), `frames` of them (about half a second each). Phones' 🤫 cards take no
 * FLAC, and nothing repackages one: it stands in for a file only 🗜's copy helps.
 */
export function flac(frames = 4) {
  const block = 4096;
  const rate = 8000;
  const crc8 = (b) => {
    let c = 0;
    for (const x of b) {
      c ^= x;
      for (let i = 0; i < 8; i++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff;
    }
    return c;
  };
  const crc16 = (b) => {
    let c = 0;
    for (const x of b) {
      c ^= x << 8;
      for (let i = 0; i < 8; i++) c = c & 0x8000 ? ((c << 1) ^ 0x8005) & 0xffff : (c << 1) & 0xffff;
    }
    return c;
  };
  // "fLaC", then its one block of facts (the last), STREAMINFO: block sizes, frame sizes not given, then 8 kHz, one
  // channel and 16 bits, how many samples in all, and no MD5.
  const info = Buffer.alloc(4 + 34);
  info.writeUInt8(0x80, 0);
  info.writeUIntBE(34, 1, 3);
  info.writeUInt16BE(block, 4);
  info.writeUInt16BE(block, 6);
  info.writeBigUInt64BE((BigInt(rate) << 44n) | (15n << 36n) | BigInt(block * frames), 14);
  const parts = [Buffer.from('fLaC'), info];
  for (let f = 0; f < frames; f++) {
    // Sync, fixed blocks; 4,096 samples (code 12) at 8 kHz (code 4); one channel, 16 bits; frame number f; CRC-8.
    const head = Buffer.from([0xff, 0xf8, 0xc4, 0x08, f]);
    const frame = Buffer.alloc(head.length + 1 + 1 + block * 2 + 2);
    head.copy(frame);
    frame[5] = crc8(head);
    // The one subframe: verbatim (type 1), then its samples.
    frame[6] = 0x02;
    for (let i = 0; i < block; i++) frame.writeInt16BE(Math.round(8000 * Math.sin(((f * block + i) / rate) * 2 * Math.PI * 440)), 7 + i * 2);
    frame.writeUInt16BE(crc16(frame.subarray(0, frame.length - 2)), frame.length - 2);
    parts.push(frame);
  }
  return Buffer.concat(parts);
}
