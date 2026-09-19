"use client";

import { PartyPopper } from "lucide-react";
import { useEffect, useState } from "react";

import { playSuccessSound } from "@/lib/play-success-sound";

const CONFETTI_COLORS = [
  "#5e6bff",
  "#86efac",
  "#ffb689",
  "#50d8e9",
  "#ffb4ab",
  "#bec2ff",
];
const CONFETTI_PIECE_COUNT = 40;
const AUTO_DISMISS_MS = 2800;

interface ConfettiPiece {
  left: number;
  delay: number;
  duration: number;
  color: string;
  rotate: number;
}

// A brief, dependency-free celebration shown when a student passes an
// activity on submit — pure CSS confetti (no canvas/animation library) so
// it stays lightweight, and respects prefers-reduced-motion via the global
// animation-duration override in globals.css.
export function SuccessCelebration({
  message,
  onDone,
}: Readonly<{ message: string; onDone: () => void }>) {
  // Randomized per piece — a useState lazy initializer is the sanctioned
  // one-time escape hatch for this (it runs exactly once, on mount), unlike
  // computing it inline during render or pushing it into an effect.
  const [pieces] = useState<readonly ConfettiPiece[]>(() =>
    Array.from({ length: CONFETTI_PIECE_COUNT }, () => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.35,
      duration: 1.6 + Math.random() * 1.2,
      color:
        CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]!,
      rotate: Math.random() * 360,
    })),
  );

  // Intentionally a separate, dependency-free effect from the auto-dismiss
  // timer below — `onDone` is a fresh function reference on every parent
  // render, so tying the sound to that effect would risk it re-firing.
  useEffect(() => {
    playSuccessSound();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(onDone, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [onDone]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-0 z-[90] overflow-hidden"
    >
      {pieces.map((piece, index) => (
        <span
          key={index}
          aria-hidden="true"
          className="absolute -top-3 size-2 rounded-sm"
          style={{
            left: `${piece.left}%`,
            backgroundColor: piece.color,
            animation: `confetti-fall ${piece.duration}s ease-in ${piece.delay}s forwards`,
            transform: `rotate(${piece.rotate}deg)`,
          }}
        />
      ))}
      <div className="absolute inset-0 grid place-items-center px-4">
        <div
          className="border-success/40 bg-elevated rounded-panel flex flex-col items-center gap-2 border px-8 py-6 text-center shadow-2xl"
          style={{ animation: "celebration-pop 380ms ease-out forwards" }}
        >
          <span className="text-success">
            <PartyPopper aria-hidden="true" size={32} />
          </span>
          <p className="text-ink-primary font-heading text-lg font-semibold">
            {message}
          </p>
        </div>
      </div>
    </div>
  );
}
