import { describe, expect, it } from 'vitest';
import { chimeWav, matchOutput, outputList, parseSavedOutput, playFailure } from './audio';

describe('chimeWav', () => {
  const wav = chimeWav(22050);
  const v = new DataView(wav.buffer);
  const text = (at: number, n: number) => String.fromCharCode(...wav.slice(at, at + n));
  const samples = Array.from({ length: (wav.length - 44) / 2 }, (_, i) => v.getInt16(44 + i * 2, true));

  it('is a valid 16-bit mono PCM WAV file', () => {
    expect(text(0, 4)).toBe('RIFF');
    expect(v.getUint32(4, true)).toBe(wav.length - 8);
    expect(text(8, 4)).toBe('WAVE');
    expect(text(12, 4)).toBe('fmt ');
    expect(v.getUint16(20, true)).toBe(1); // PCM
    expect(v.getUint16(22, true)).toBe(1); // mono
    expect(v.getUint32(24, true)).toBe(22050);
    expect(v.getUint32(28, true)).toBe(22050 * 2);
    expect(v.getUint16(34, true)).toBe(16);
    expect(text(36, 4)).toBe('data');
    expect(v.getUint32(40, true)).toBe(wav.length - 44);
  });

  it('is short and small (under a second, about 35 KB)', () => {
    const seconds = samples.length / 22050;
    expect(seconds).toBeGreaterThan(0.5);
    expect(seconds).toBeLessThan(1);
    expect(wav.length).toBeLessThan(50_000);
  });

  it('is clearly audible without clipping, and starts and ends silent (no clicks)', () => {
    const peak = Math.max(...samples.map(Math.abs));
    expect(peak).toBeGreaterThan(8000);
    expect(peak).toBeLessThan(32767);
    expect(Math.abs(samples[0])).toBeLessThan(200);
    expect(Math.abs(samples[samples.length - 1])).toBeLessThan(200);
  });

  it('follows the sample rate it is given', () => {
    const small = chimeWav(8000);
    expect(new DataView(small.buffer).getUint32(24, true)).toBe(8000);
    expect(small.length).toBeLessThan(wav.length);
  });
});

describe('parseSavedOutput', () => {
  it('reads a saved choice', () => {
    expect(parseSavedOutput('{"deviceId":"abc","label":"CABLE Input"}')).toEqual({ deviceId: 'abc', label: 'CABLE Input' });
  });
  it('falls back to the default device for nothing, junk or the wrong shape', () => {
    for (const raw of [null, undefined, '', 'not json', '{"label":"x"}', '42', 'null'])
      expect(parseSavedOutput(raw)).toEqual({ deviceId: '', label: '' });
  });
  it('tolerates a missing label', () => {
    expect(parseSavedOutput('{"deviceId":"abc"}')).toEqual({ deviceId: 'abc', label: '' });
  });
});

describe('outputList', () => {
  it('keeps real speakers only, and names unnamed ones', () => {
    const list = outputList([
      { kind: 'audiooutput', deviceId: 'default', label: 'Default - Speakers' },
      { kind: 'audiooutput', deviceId: 'communications', label: 'Communications - Headset' },
      { kind: 'audioinput', deviceId: 'mic', label: 'Microphone' },
      { kind: 'audiooutput', deviceId: 'spk', label: 'Speakers' },
      { kind: 'audiooutput', deviceId: 'cable', label: '' },
      { kind: 'audiooutput', deviceId: '', label: '' },
    ]);
    expect(list).toEqual([
      { deviceId: 'spk', label: 'Speakers' },
      { deviceId: 'cable', label: 'Speaker 2' },
    ]);
  });
});

describe('matchOutput', () => {
  const list = [
    { deviceId: 'a1', label: 'Speakers' },
    { deviceId: 'b2', label: 'CABLE Input' },
  ];
  it('the default device always matches', () => {
    expect(matchOutput({ deviceId: '', label: '' }, list)).toEqual({ deviceId: '', label: '' });
    expect(matchOutput({ deviceId: '', label: '' }, [])).toEqual({ deviceId: '', label: '' });
  });
  it('finds a device by id', () => {
    expect(matchOutput({ deviceId: 'b2', label: 'old name' }, list)).toEqual(list[1]);
  });
  it('finds it by name when its id changed', () => {
    expect(matchOutput({ deviceId: 'zz', label: 'CABLE Input' }, list)).toEqual(list[1]);
  });
  it('returns null when it is not connected', () => {
    expect(matchOutput({ deviceId: 'zz', label: 'USB Headset' }, list)).toBeNull();
    expect(matchOutput({ deviceId: 'zz', label: '' }, list)).toBeNull();
  });
});

describe('playFailure', () => {
  const err = (name: string) => Object.assign(new Error(name), { name });
  it('says "blocked" when the browser wants a click first', () => {
    expect(playFailure(err('NotAllowedError'))).toBe('blocked');
  });
  it('ignores a play that was interrupted on purpose', () => {
    expect(playFailure(err('AbortError'))).toBeNull();
  });
  it('reports anything else as an error', () => {
    expect(playFailure(err('NotSupportedError'))).toBe('error');
    expect(playFailure(undefined)).toBe('error');
  });
});
