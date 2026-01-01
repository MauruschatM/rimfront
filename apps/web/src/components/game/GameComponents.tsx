import type { Doc } from "@packages/backend/convex/_generated/dataModel";
import { Clock, Coins, Trophy, Users } from "lucide-react";

interface LobbyScreenProps {
  game: Doc<"games">;
  players: Doc<"players">[];
}

export function LobbyScreen({ game, players }: LobbyScreenProps) {
  // Calculate time remaining
  const now = Date.now();
  const timeElapsed = now - game.createdAt;
  const timeLeftMs = Math.max(0, 60_000 - timeElapsed);
  const timeLeftSec = Math.ceil(timeLeftMs / 1000);
  const playerCount = players.length;

  const formatGameTime = (seconds: number) => {
    if (seconds >= 100) {
      const minutes = Math.ceil(seconds / 60);
      return { value: minutes, unit: "MIN" };
    }
    return { value: seconds, unit: "SEK" };
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-black text-white">
      <div className="pixel-corners flex min-w-[350px] flex-col items-center border-2 border-primary bg-background/50 p-8">
        <h2 className="mb-6 font-sans text-2xl text-primary">
          WARTE AUF SPIELSTART
        </h2>

        {/* Timer */}
        <div className="mb-6 flex items-center gap-3">
          <Clock className="h-8 w-8 animate-pulse text-primary" />
          <span className="font-bold font-mono text-5xl">
            {formatGameTime(timeLeftSec).value}
          </span>
          <span className="font-mono text-muted-foreground">
            {formatGameTime(timeLeftSec).unit}
          </span>
        </div>

        {/* Player count */}
        <div className="mb-4 w-full">
          <div className="mb-2 flex items-center justify-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            <span className="font-mono text-xl">
              {playerCount}
              <span className="text-muted-foreground">/16 Spieler</span>
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${(playerCount / 16) * 100}%` }}
            />
          </div>
        </div>

        <p className="text-center font-mono text-muted-foreground text-xs">
          Spiel startet automatisch wenn voll
          <br />
          oder nach Ablauf des Timers
        </p>
      </div>
    </div>
  );
}

interface GameHUDProps {
  planetType: string;
  phase: string;
  score: number;
  credits: number;
  inflation: number;
  timeLeft: number;
}

export function GameHUD({
  planetType,
  phase,
  score,
  credits,
  inflation,
  timeLeft,
}: GameHUDProps) {
  const formatGameTime = (seconds: number) => {
    if (seconds >= 100) {
      const minutes = Math.ceil(seconds / 60);
      return { value: minutes, unit: "MIN" };
    }
    return { value: seconds, unit: "SEK" };
  };

  return (
    <div className="pointer-events-none absolute top-0 left-0 flex w-full items-start justify-between p-4">
      <div className="pixel-corners border border-white/20 bg-black/50 p-2 text-white">
        <h1 className="font-sans text-primary text-xl uppercase">
          {planetType || "UNKNOWN SYSTEM"}
        </h1>
        <div className="font-mono text-muted-foreground text-xs">
          PHASE: <span className="text-white">{phase?.toUpperCase()}</span>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Score Display */}
        <div className="pixel-corners flex min-w-[100px] flex-col items-center border border-white/20 bg-black/50 p-2 text-white">
          <div className="flex items-center gap-2 text-green-400">
            <Trophy className="h-4 w-4" />
            <span className="font-bold font-mono text-xl">
              {score.toLocaleString()}
            </span>
          </div>
          <div className="font-mono text-[10px] text-muted-foreground uppercase">
            Score
          </div>
        </div>

        {/* Inflation Display */}
        <div className="pixel-corners flex min-w-[100px] flex-col items-center border border-white/20 bg-black/50 p-2 text-white">
          <div className="flex items-center gap-2 text-orange-400">
            <span className="text-lg">📈</span>
            <span className="font-bold font-mono text-xl">
              {inflation.toFixed(1)}x
            </span>
          </div>
          <div className="font-mono text-[10px] text-muted-foreground uppercase">
            Inflation
          </div>
        </div>

        <div className="pixel-corners flex min-w-[100px] flex-col items-center border border-white/20 bg-black/50 p-2 text-white">
          <div className="flex items-center gap-2 text-yellow-400">
            <Coins className="h-4 w-4" />
            <span className="font-bold font-mono text-xl">{credits}</span>
          </div>
          <div className="font-mono text-[10px] text-muted-foreground uppercase">
            Credits
          </div>
        </div>

        <div className="pixel-corners border border-white/20 bg-black/50 p-2 text-white">
          <div className="text-center font-bold font-mono text-4xl">
            {timeLeft > 0 ? formatGameTime(timeLeft).value : "00"}
          </div>
          <div className="text-center font-mono text-muted-foreground text-xs">
            {timeLeft > 0 ? formatGameTime(timeLeft).unit : "SEK"}
          </div>
        </div>
      </div>
    </div>
  );
}
