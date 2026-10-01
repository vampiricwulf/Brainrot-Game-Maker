// A soft two-note chime for the host's ears only (someone asks to join from their phone). Played in this window, so
// only used when the stream is the audience window, never in single-window mode (this window is on stream then).
let ctx: AudioContext | null = null;

export function chime(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime;
    [660, 880].forEach((hz, i) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.type = 'sine';
      o.frequency.value = hz;
      const at = t0 + i * 0.14;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.08, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
      o.connect(g).connect(ctx!.destination);
      o.start(at);
      o.stop(at + 0.3);
    });
  } catch {
    // No sound here: the toast still says it.
  }
}
