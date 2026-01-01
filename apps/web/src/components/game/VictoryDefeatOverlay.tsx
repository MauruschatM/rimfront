"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface Player {
  _id: string;
  name?: string;
  credits?: number;
  status?: string;
}

interface VictoryDefeatOverlayProps {
  isWinner: boolean;
  players: Player[];
  myPlayerId: string;
  calculateScore: (player: Player) => number;
  onComplete: () => void;
}

export function VictoryDefeatOverlay({
  isWinner,
  players,
  myPlayerId,
  calculateScore,
  onComplete,
}: VictoryDefeatOverlayProps) {
  const [countdown, setCountdown] = useState(10);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  useEffect(() => {
    // Show leaderboard after 2 seconds
    const leaderboardTimer = setTimeout(() => {
      setShowLeaderboard(true);
    }, 2000);

    // Countdown timer
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          onComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearTimeout(leaderboardTimer);
      clearInterval(interval);
    };
  }, [onComplete]);

  const sortedPlayers = [...players]
    .map((p) => ({ ...p, score: calculateScore(p) }))
    .sort((a, b) => b.score - a.score);

  return (
    <div
      className={cn(
        "absolute inset-0 z-50 flex flex-col items-center justify-center overflow-hidden",
        isWinner
          ? "bg-gradient-to-b from-yellow-900/80 to-black"
          : "bg-gradient-to-b from-red-900/80 to-black"
      )}
    >
      {/* Animated stars background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: 50 }).map(() => (
          <div
            className="absolute animate-pulse rounded-full bg-white"
            key={`star-${Math.random().toString(36).slice(2)}`}
            style={{
              width: `${Math.random() * 3 + 1}px`,
              height: `${Math.random() * 3 + 1}px`,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              opacity: Math.random() * 0.5 + 0.3,
              animationDelay: `${Math.random() * 2}s`,
              animationDuration: `${Math.random() * 1 + 0.5}s`,
            }}
          />
        ))}
      </div>

      {/* Main title with glow effect */}
      <div className="relative mb-8">
        <h1
          className={cn(
            "font-bold font-mono text-8xl",
            isWinner ? "text-yellow-400" : "text-red-500",
            "animate-pulse"
          )}
          style={{
            textShadow: isWinner
              ? "0 0 40px rgba(250, 204, 21, 0.8), 0 0 80px rgba(250, 204, 21, 0.4)"
              : "0 0 40px rgba(239, 68, 68, 0.8), 0 0 80px rgba(239, 68, 68, 0.4)",
          }}
        >
          {isWinner ? "VICTORY" : "DEFEAT"}
        </h1>

        {/* Subtitle */}
        <p className="mt-2 text-center font-mono text-white/70 text-xl">
          {isWinner
            ? "The galaxy bends to your will"
            : "Your forces have been vanquished"}
        </p>
      </div>

      {/* Leaderboard with slide-in animation */}
      <div
        className={cn(
          "pixel-corners w-full max-w-lg border-2 bg-black/80 p-6 transition-all duration-700",
          isWinner ? "border-yellow-400/50" : "border-red-500/50",
          showLeaderboard
            ? "translate-y-0 opacity-100"
            : "translate-y-10 opacity-0"
        )}
      >
        <h3 className="mb-4 border-white/20 border-b pb-2 font-mono text-white text-xl">
          FINAL STANDINGS
        </h3>
        <div className="flex flex-col gap-2">
          {sortedPlayers.map((p, i) => (
            <div
              className={cn(
                "flex items-center justify-between p-2 font-mono transition-all",
                p._id === myPlayerId
                  ? isWinner
                    ? "bg-yellow-500/20 text-yellow-400"
                    : "bg-red-500/20 text-red-400"
                  : "text-white"
              )}
              key={p._id}
              style={{
                animationDelay: `${i * 0.1}s`,
              }}
            >
              <div className="flex items-center gap-4">
                <span className="w-6 text-muted-foreground">#{i + 1}</span>
                <span>{p.name || "Unknown"}</span>
                {p.status === "eliminated" && (
                  <span className="text-red-500 text-xs">(ELIMINATED)</span>
                )}
                {i === 0 && <span className="text-lg">👑</span>}
              </div>
              <span className="font-bold">{p.score.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Countdown */}
      <div className="mt-8 text-center">
        <p className="font-mono text-muted-foreground text-sm">
          Returning to lobby in
        </p>
        <p
          className={cn(
            "font-bold font-mono text-4xl",
            isWinner ? "text-yellow-400" : "text-red-400"
          )}
        >
          {countdown}
        </p>
      </div>

      {/* Decorative lines */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-yellow-500/50 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-yellow-500/50 to-transparent" />
    </div>
  );
}
