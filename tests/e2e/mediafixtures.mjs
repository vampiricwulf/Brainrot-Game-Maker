// Videos and sounds for the e2e tests, made here, a few MB at most: videos with mediabunny in a blank page of their own
// (Node has no video encoder; never the app's page, where mediabunny would be loaded twice), WAV sounds in Node.
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** A blank page in `ctx` with mediabunny in it, as `window.Mediabunny`. */
export async function fixturePage(ctx) {
  const html = join(tmpdir(), 'brainrot-fixtures.html');
  writeFileSync(html, '<!doctype html><meta charset="utf-8"><title>Fixtures</title>');
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(html).href);
  await page.addScriptTag({ path: resolve('node_modules/mediabunny/dist/bundles/mediabunny.min.cjs') });
  return page;
}

/**
 * A WebM clip made in `page` (fixturePage): `seconds` long at `fps`, `w`×`h`, its picture `codec` ('vp8' or 'vp9') at
 * about `bitrate` bits a second (big blocks of noise, new each frame, so it comes out as big as asked), a key frame
 * every `keyEvery` seconds, with an Opus tone when `audio`. Returns its bytes.
 */
export async function clip(page, { w = 320, h = 240, seconds = 2, fps = 30, codec = 'vp8', bitrate = 1_000_000, keyEvery = 1, audio = true } = {}) {
  const b64 = await page.evaluate(
    async (o) => {
      const M = window.Mediabunny;
      const target = new M.BufferTarget();
      const out = new M.Output({ format: new M.WebMOutputFormat(), target });
      const canvas = Object.assign(document.createElement('canvas'), { width: o.w, height: o.h });
      const g = canvas.getContext('2d');
      const small = Object.assign(document.createElement('canvas'), { width: Math.ceil(o.w / 8), height: Math.ceil(o.h / 8) });
      const sg = small.getContext('2d');
      const video = new M.CanvasSource(canvas, { codec: o.codec, quality: new M.Quality({ bitrate: o.bitrate }), keyFrameInterval: o.keyEvery });
      out.addVideoTrack(video, { frameRate: o.fps });
      const sound = o.audio ? new M.AudioSampleSource({ codec: 'opus', quality: new M.Quality({ bitrate: 64_000 }) }) : null;
      if (sound) out.addAudioTrack(sound);
      await out.start();
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
      const frames = Math.round(o.seconds * o.fps);
      for (let i = 0; i < frames; i++) {
        const img = sg.createImageData(small.width, small.height);
        for (let p = 0; p < img.data.length; p += 4) [img.data[p], img.data[p + 1], img.data[p + 2], img.data[p + 3]] = [rnd(), rnd(), rnd(), 255];
        sg.putImageData(img, 0, 0);
        g.imageSmoothingEnabled = false;
        g.drawImage(small, 0, 0, o.w, o.h);
        await video.add(i / o.fps, 1 / o.fps);
        // A second of sound with each second of picture.
        if (sound && i % o.fps === 0) {
          const n = Math.min(rate, Math.round((o.seconds - i / o.fps) * rate));
          const data = Float32Array.from({ length: n }, (_, k) => 0.2 * Math.sin((2 * Math.PI * 440 * (i / o.fps * rate + k)) / rate));
          const s = new M.AudioSample({ data, format: 'f32-planar', numberOfChannels: 1, sampleRate: rate, timestamp: i / o.fps });
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
    { w, h, seconds, fps, codec, bitrate, keyEvery, audio },
  );
  return Buffer.from(b64, 'base64');
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
