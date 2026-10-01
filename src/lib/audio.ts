// Pure helpers for the game's sound: the "Test sound" chime and picking an audio output device.
// The browser side (playing, routing, device lists) is in audioout.svelte.ts.

/** A speaker (or virtual cable) the game's sound can play on. deviceId '' is the system default. */
export interface AudioOutput {
  deviceId: string;
  label: string;
}

/** localStorage key for the chosen output, per computer (both app windows share it). */
export const AUDIO_OUT_KEY = 'jb.audioOutput';

export const DEFAULT_OUTPUT: AudioOutput = { deviceId: '', label: '' };

const CHIME_NOTES = [
  { freq: 1318.5, at: 0, len: 0.45 }, // E6
  { freq: 1046.5, at: 0.16, len: 0.64 }, // C6
];

/** Mono samples (-1…1) as a WAV file (16-bit PCM). The app's sounds are made in code, so no sound file ships with it. */
export function wavFile(samples: ArrayLike<number>, rate: number): Uint8Array<ArrayBuffer> {
  const count = samples.length;
  const buf = new ArrayBuffer(44 + count * 2);
  const v = new DataView(buf);
  const text = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  v.setUint32(4, 36 + count * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  v.setUint32(16, 16, true); // fmt chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); // bytes per second
  v.setUint16(32, 2, true); // bytes per frame
  v.setUint16(34, 16, true); // bits per sample
  text(36, 'data');
  v.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), true);
  return new Uint8Array(buf);
}

/**
 * A short two-note chime as a WAV file (16-bit mono PCM).
 * Each note fades in over 5 ms and out over 30 ms, so there are no clicks.
 */
export function chimeWav(rate = 22050): Uint8Array<ArrayBuffer> {
  const seconds = Math.max(...CHIME_NOTES.map((n) => n.at + n.len));
  const out = new Float32Array(Math.round(rate * seconds));
  for (let i = 0; i < out.length; i++) {
    const t = i / rate;
    let s = 0;
    for (const n of CHIME_NOTES) {
      const dt = t - n.at;
      if (dt < 0 || dt > n.len) continue;
      const env = Math.min(1, dt / 0.005, (n.len - dt) / 0.03) * Math.exp(-dt * 6);
      // A bell-ish tone: the note plus a quieter octave.
      s += env * (Math.sin(2 * Math.PI * n.freq * dt) + 0.3 * Math.sin(4 * Math.PI * n.freq * dt));
    }
    out[i] = s * 0.35;
  }
  return wavFile(out, rate);
}

/** The saved output choice (JSON in localStorage). Anything unreadable means the default device. */
export function parseSavedOutput(raw: string | null | undefined): AudioOutput {
  try {
    const v = raw ? JSON.parse(raw) : null;
    if (v && typeof v.deviceId === 'string') return { deviceId: v.deviceId, label: typeof v.label === 'string' ? v.label : '' };
  } catch {
    /* corrupt: fall through to the default */
  }
  return { ...DEFAULT_OUTPUT };
}

/**
 * The speakers in an enumerateDevices() list. Chromium adds "default" and "communications" entries that
 * only point at other devices; the picker has its own "Default" choice, so those are left out.
 */
export function outputList(devices: readonly { kind: string; deviceId: string; label: string }[]): AudioOutput[] {
  return devices
    .filter((d) => d.kind === 'audiooutput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications')
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Speaker ${i + 1}` }));
}

/**
 * Find the saved choice in the current device list. Device ids can change (they're per site, and reset
 * when site data is cleared), so the same name also counts. null: that device isn't connected now.
 */
export function matchOutput(saved: AudioOutput, list: readonly AudioOutput[]): AudioOutput | null {
  if (!saved.deviceId) return { ...DEFAULT_OUTPUT };
  return list.find((d) => d.deviceId === saved.deviceId) ?? (saved.label ? list.find((d) => d.label === saved.label) : undefined) ?? null;
}

/**
 * Why play() failed, for the host: 'blocked' when the browser wants a click in that window first.
 * null when it isn't a failure (the element was removed or given a new file before it started).
 */
export function playFailure(err: unknown): 'blocked' | 'error' | null {
  const name = (err as { name?: string } | null)?.name;
  if (name === 'AbortError') return null;
  return name === 'NotAllowedError' ? 'blocked' : 'error';
}
