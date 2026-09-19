"use client";

// A short, joyful success fanfare, synthesized with the Web Audio API
// rather than shipping an audio file — no asset or licensing to manage.
//
// Reuses one AudioContext across calls instead of creating/closing a fresh
// one each time: browsers create a new AudioContext in a *suspended* state
// under autoplay policy, and merely scheduling oscillators on a suspended
// context produces no audible sound at all (no error either — it just
// silently does nothing). Explicitly resuming it is required, and once a
// context has been resumed following any user gesture, browsers keep it
// usable for later programmatic calls without needing a fresh gesture each
// time — far more reliable than re-unlocking a brand-new context per call.
let sharedContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (sharedContext) return sharedContext;
  const AudioContextClass =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextClass) return null;
  sharedContext = new AudioContextClass();
  return sharedContext;
}

function playNote(
  context: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  peakGain: number,
  type: OscillatorType = "sine",
  detuneCents = 0,
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  oscillator.detune.value = detuneCents;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peakGain, start + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

// A rising major arpeggio (C5 → E5 → G5 → C6) that resolves into a longer,
// shimmering final note — a little "ta-da" rather than a plain beep. The
// final note is doubled with a second, slightly detuned oscillator (a few
// cents sharp) for a warm chorus-y shimmer instead of a flat single tone.
function scheduleChime(context: AudioContext) {
  const now = context.currentTime;
  const arpeggio: readonly [frequency: number, startOffset: number][] = [
    [523.25, 0], // C5
    [659.25, 0.1], // E5
    [783.99, 0.2], // G5
    [1046.5, 0.3], // C6
  ];
  for (const [frequency, startOffset] of arpeggio) {
    playNote(context, frequency, now + startOffset, 0.35, 0.22);
  }
  const finaleStart = now + 0.42;
  playNote(context, 1567.98, finaleStart, 0.9, 0.24, "triangle"); // G6
  playNote(context, 1567.98, finaleStart, 0.9, 0.16, "triangle", 8);
}

// Best-effort: a locked/unsupported AudioContext should never interrupt the
// actual submit flow, so every failure here is swallowed silently.
export function playSuccessSound() {
  try {
    const context = getAudioContext();
    if (!context) return;
    if (context.state === "suspended") {
      context
        .resume()
        .then(() => scheduleChime(context))
        .catch(() => undefined);
    } else {
      scheduleChime(context);
    }
  } catch {
    // Ignored — see comment above.
  }
}
