// ════════════════════════════════════════════════════════════════════════════
//  Zero-asset audio: WebAudio chime for incoming orders. No MP3 files =
//  no Storage bucket usage. Browsers require a user gesture before audio —
//  call armAudio() from any click/tap (staff login button is the natural one).
// ════════════════════════════════════════════════════════════════════════════

let ctx: AudioContext | null = null;

export function armAudio(): void {
  try {
    const AudioCtor: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    if (!ctx) ctx = new AudioCtor();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    /* audio unsupported — stay silent, don't crash KDS */
  }
}

export function audioReady(): boolean {
  return !!ctx && ctx.state === 'running';
}

/** Two-note "ding" for new tickets. volume: 0..1 */
export function playOrderChime(volume = 0.3): void {
  try {
    if (!ctx) armAudio();
    if (!ctx || ctx.state !== 'running') return;

    const now = ctx.currentTime;
    const notes: Array<[number, number]> = [
      [880.0, 0.0],
      [1318.5, 0.16], // P5 up — bright, kitchen-friendly
    ];
    for (const [freq, delay] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + delay);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.5);
    }
  } catch {
    /* never let a sound crash service */
  }
}
