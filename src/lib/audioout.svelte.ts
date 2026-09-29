// Playing the game's sound where the stream can pick it up.
//
// - Game sounds (cues, wheel/dice outcomes, the test chime) are started with play() and the result is
//   reported, so the host learns when the browser blocked them ("click the audience window once").
// - "Game audio output": the host can send the game's sound to another device (e.g. a virtual cable
//   for OBS) with HTMLMediaElement.setSinkId. The choice is saved per computer and applied in the window
//   that plays the sound: the audience window in dual mode, the host window otherwise. YouTube (a frame
//   from another site) and "Open link" pop-ups can't be rerouted: they always use the default device.
import { AUDIO_OUT_KEY, DEFAULT_OUTPUT, chimeWav, outputList, parseSavedOutput, playFailure, type AudioOutput } from './audio';

/** What the window that plays the sound tells the host (the audience window forwards these). */
export type SoundReport =
  | { kind: 'sound'; ok: boolean; reason?: 'blocked' | 'error'; test?: string }
  | { kind: 'audio-out'; missing: boolean; label: string };

type Listener = (r: SoundReport) => void;
const listeners = new Set<Listener>();
export function onSoundReport(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function report(r: SoundReport): void {
  listeners.forEach((l) => l(r));
}

function loadSaved(): AudioOutput {
  try {
    return parseSavedOutput(localStorage.getItem(AUDIO_OUT_KEY));
  } catch {
    // No storage (private window, blocked site data): the default device.
    return { ...DEFAULT_OUTPUT };
  }
}

/** The chosen output in this window. missing: it wasn't found here, so the default device is used. */
export const audioOut = $state<AudioOutput & { missing: boolean }>({ ...loadSaved(), missing: false });

/** This browser can send a page's sound to a chosen device. */
export function sinkSupported(): boolean {
  return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
}

/** Use this output in this window; `save` also remembers it on this computer. */
export function setAudioOut(out: AudioOutput, save: boolean): void {
  audioOut.deviceId = out.deviceId;
  audioOut.label = out.label;
  audioOut.missing = false;
  if (save) {
    try {
      localStorage.setItem(AUDIO_OUT_KEY, JSON.stringify({ deviceId: out.deviceId, label: out.label }));
    } catch {
      /* not remembered, but still used until the app is closed */
    }
  }
  if (typeof document !== 'undefined') document.querySelectorAll('audio, video').forEach((el) => void applySink(el as HTMLMediaElement));
}

/** Point one media element at the chosen output. If that device is gone, it plays on the default one. */
export async function applySink(el: HTMLMediaElement): Promise<void> {
  if (!('setSinkId' in el)) return;
  const want = audioOut.missing ? '' : audioOut.deviceId;
  if (el.sinkId === want) return;
  try {
    await el.setSinkId(want);
  } catch {
    // NotFoundError (unplugged, or its id changed) or NotAllowedError: better the default device than silence.
    if (!want) return;
    if (!audioOut.missing) {
      audioOut.missing = true;
      report({ kind: 'audio-out', missing: true, label: audioOut.label });
    }
    await el.setSinkId('').catch(() => {});
  }
}

/**
 * Safety net for the window that plays the sound: every <audio>/<video> added to the page goes to the
 * chosen output, including ones no component routes itself. Returns a function that stops watching.
 */
export function watchSinks(): () => void {
  if (!sinkSupported()) return () => {};
  const route = (n: Node) => {
    if (n instanceof HTMLMediaElement) void applySink(n);
    else if (n instanceof Element) n.querySelectorAll('audio, video').forEach((m) => void applySink(m as HTMLMediaElement));
  };
  const obs = new MutationObserver((records) => records.forEach((r) => r.addedNodes.forEach(route)));
  obs.observe(document.body, { childList: true, subtree: true });
  route(document.body);
  return () => obs.disconnect();
}

/**
 * Play a game sound on the chosen output and report whether the browser allowed it. A video that may
 * not play with sound still plays muted, so the picture shows.
 */
export async function playAndReport(el: HTMLMediaElement, test?: string): Promise<void> {
  const attached = el.isConnected;
  await applySink(el);
  // Removed while it was being routed (the next cue already replaced it): don't play it off-screen.
  if (attached && !el.isConnected) return;
  try {
    await el.play();
    report({ kind: 'sound', ok: true, test });
  } catch (err) {
    const why = playFailure(err);
    if (!why) return;
    report({ kind: 'sound', ok: false, reason: why, test });
    if (why === 'blocked' && el instanceof HTMLVideoElement) {
      el.muted = true;
      el.play().catch(() => {});
    }
  }
}

/**
 * Svelte action for a game sound or a wheel/dice outcome video: `<audio use:autoPlay={url}>`. Plays once
 * when it appears (and again only if the file changes), instead of the plain `autoplay` attribute, which
 * fails silently when the browser blocks it.
 */
export function autoPlay(node: HTMLMediaElement, src: string) {
  const start = (url: string) => {
    node.src = url;
    void playAndReport(node);
  };
  start(src);
  return {
    update(url: string) {
      if (url !== src) start((src = url));
    },
  };
}

let chimeUrl: string | undefined;
/** Play the "Test sound" chime in this window and report the result (tagged with the host's `test` id). */
export function playChime(test: string): void {
  chimeUrl ??= URL.createObjectURL(new Blob([chimeWav()], { type: 'audio/wav' }));
  void playAndReport(new Audio(chimeUrl), test);
}

/**
 * The computer's speakers. Chrome, Edge and the desktop app only name them once the page may use a
 * microphone, so `ask` requests that first (the microphone is released at once; nothing is recorded).
 */
export async function listOutputs(ask: boolean): Promise<AudioOutput[]> {
  const md = navigator.mediaDevices;
  if (!md?.enumerateDevices) return [];
  if (ask) {
    try {
      const stream = await md.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      /* no microphone, or not allowed: the list may come back empty */
    }
  }
  try {
    return outputList(await md.enumerateDevices());
  } catch {
    return [];
  }
}

type WithSelect = MediaDevices & { selectAudioOutput?: () => Promise<MediaDeviceInfo> };

/** Firefox lists speakers through its own picker instead. */
export function hasOutputPicker(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator.mediaDevices as WithSelect | undefined)?.selectAudioOutput;
}

/** Firefox's speaker picker (needs a click). null when cancelled. */
export async function pickOutput(): Promise<AudioOutput | null> {
  try {
    const d = await (navigator.mediaDevices as WithSelect).selectAudioOutput!();
    return { deviceId: d.deviceId, label: d.label };
  } catch {
    return null;
  }
}
