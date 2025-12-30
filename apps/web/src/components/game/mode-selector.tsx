"use client";

import { api } from "@packages/backend/convex/_generated/api";
import type { Id } from "@packages/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Clock, Globe, Play, Shield, Swords, User, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ModeSelectorProps {
  user: {
    id: string;
    name: string;
  };
}

export function ModeSelector({ user }: ModeSelectorProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"multiplayer" | "private">(
    "multiplayer"
  );
  const [selectedMode, setSelectedMode] = React.useState("fronts");
  const [selectedSubMode, setSelectedSubMode] = React.useState("ffa");
  const [status, setStatus] = React.useState<"idle" | "searching" | "joined">(
    "idle"
  );
  const [gameId, setGameId] = React.useState<Id<"games"> | null>(null);
  const [playerId, setPlayerId] = React.useState<Id<"players"> | null>(null);
  const [displayTimeLeft, setDisplayTimeLeft] = React.useState(60);

  const findOrCreateLobby = useMutation(api.matchmaking.findOrCreateLobby);
  const leaveLobby = useMutation(api.matchmaking.leaveLobby);
  const forceStartLobby = useMutation(api.matchmaking.forceStartLobby);

  // Query lobby status when joined
  const lobbyStatus = useQuery(
    api.matchmaking.getLobbyStatus,
    gameId ? { gameId } : "skip"
  );

  // Update local timer for smooth countdown
  React.useEffect(() => {
    if (lobbyStatus?.status === "waiting") {
      setDisplayTimeLeft(Math.ceil(lobbyStatus.timeLeft / 1000));

      const interval = setInterval(() => {
        setDisplayTimeLeft((t) => Math.max(0, t - 1));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [lobbyStatus]);

  // Navigate to game when it starts
  React.useEffect(() => {
    if (lobbyStatus?.status === "started" && gameId) {
      router.push(`/game/${gameId}`);
    }
  }, [lobbyStatus, gameId, router]);

  const handlePlay = async () => {
    if (!isOpen) {
      setIsOpen(true);
      return;
    }

    // If open, this acts as "READY"
    setStatus("searching");
    try {
      const result = await findOrCreateLobby({
        type: selectedMode,
        subMode: selectedSubMode,
        playerName: user.name,
        userId: user.id,
      });
      setGameId(result.gameId);
      setPlayerId(result.playerId);
      setStatus("joined");
      setIsOpen(false);
    } catch (error) {
      console.error("Failed to join game:", error);
      setStatus("idle");
    }
  };

  const handleLeave = async () => {
    if (!(gameId && playerId)) return;

    try {
      await leaveLobby({ gameId, playerId });
      setGameId(null);
      setPlayerId(null);
      setStatus("idle");
    } catch (error) {
      console.error("Failed to leave lobby:", error);
    }
  };

  const handleForceStart = async () => {
    if (!(gameId && playerId)) return;

    try {
      await forceStartLobby({ gameId, playerId });
    } catch (error) {
      console.error("Failed to start lobby:", error);
    }
  };

  // Format time: show minutes if >= 100 seconds, otherwise show seconds
  const formatTime = (seconds: number) => {
    if (seconds >= 100) {
      const minutes = Math.ceil(seconds / 60);
      return { value: minutes, unit: "MIN" };
    }
    return { value: seconds, unit: "SEK" };
  };

  const timeDisplay = formatTime(displayTimeLeft);

  return (
    <div className="z-50 flex flex-col items-center">
      {/* Top Play Button */}
      <div className="relative">
        <Button
          className={cn(
            "pixel-corners pixel-border relative z-50 h-16 rounded-none px-12 font-sans text-xl transition-all duration-200",
            isOpen
              ? "border-green-800 bg-green-600 text-white hover:bg-green-700"
              : "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
          )}
          onClick={handlePlay}
          size="lg"
        >
          {status === "searching" ? (
            <span className="animate-pulse">SEARCHING...</span>
          ) : status === "joined" ? (
            <span>JOINED LOBBY</span>
          ) : isOpen ? (
            <span className="flex items-center gap-2">
              READY <Play className="h-5 w-5 fill-current" />
            </span>
          ) : (
            <span className="flex items-center gap-2">
              PLAY <Play className="h-5 w-5 fill-current" />
            </span>
          )}
        </Button>
      </div>

      {/* Dropdown Menu */}
      {isOpen && status === "idle" && (
        <div className="pixel-corners fade-in slide-in-from-top-4 absolute top-20 flex w-[800px] animate-in flex-col gap-6 border-2 border-muted bg-background/95 p-4 shadow-2xl backdrop-blur-sm">
          {/* Tabs */}
          <div className="flex gap-4 border-muted border-b-2 pb-2">
            <button
              type="button"
              className={cn(
                "px-4 py-2 font-mono text-sm uppercase transition-colors hover:text-primary",
                activeTab === "multiplayer"
                  ? "-mb-2.5 border-primary border-b-2 text-primary"
                  : "text-muted-foreground"
              )}
              onClick={() => setActiveTab("multiplayer")}
            >
              Multiplayer
            </button>
            <button
              type="button"
              className={cn(
                "cursor-not-allowed px-4 py-2 font-mono text-muted-foreground/50 text-sm uppercase transition-colors",
                activeTab === "private"
                  ? "-mb-2.5 border-primary border-b-2 text-primary"
                  : ""
              )} // Disabled for now visually or functionally
              onClick={() => setActiveTab("private")}
            >
              Private (Locked)
            </button>
          </div>

          {/* Mode Selection */}
          <div className="space-y-2">
            <h3 className="font-mono text-muted-foreground text-xs uppercase tracking-widest">
              Game Mode
            </h3>
            <div className="flex gap-4">
              <button
                aria-pressed={selectedMode === "fronts"}
                className={cn(
                  "pixel-corners w-full flex-1 cursor-pointer border-2 bg-muted/20 p-4 text-left transition-all hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  selectedMode === "fronts"
                    ? "border-primary bg-primary/10"
                    : "border-transparent"
                )}
                onClick={() => setSelectedMode("fronts")}
                type="button"
              >
                <div className="flex items-center gap-3">
                  <Globe className="h-8 w-8 text-primary" />
                  <div>
                    <div className="font-sans text-lg text-primary">FRONTS</div>
                    <div className="font-mono text-muted-foreground text-xs">
                      Tactical Warfare
                    </div>
                  </div>
                </div>
              </button>
              {/* Future modes can go here */}
            </div>
          </div>

          {/* Sub-Mode Selection */}
          <div className="space-y-2">
            <h3 className="font-mono text-muted-foreground text-xs uppercase tracking-widest">
              Team Size
            </h3>
            <div className="grid grid-cols-4 gap-4">
              <SubModeCard
                icon={<User className="h-6 w-6" />}
                label="Free For All"
                onClick={() => setSelectedSubMode("ffa")}
                selected={selectedSubMode === "ffa"}
                value="ffa"
              />
              <SubModeCard
                icon={<Users className="h-6 w-6" />}
                label="Duos"
                onClick={() => setSelectedSubMode("duos")}
                selected={selectedSubMode === "duos"}
                value="duos"
              />
              <SubModeCard
                icon={<Shield className="h-6 w-6" />}
                label="Squads"
                onClick={() => setSelectedSubMode("squads")}
                selected={selectedSubMode === "squads"}
                value="squads"
              />
              <SubModeCard
                icon={<Swords className="h-6 w-6" />}
                label="2 Teams"
                onClick={() => setSelectedSubMode("teams")}
                selected={selectedSubMode === "teams"}
                value="teams"
              />
            </div>
          </div>
        </div>
      )}

      {/* Lobby Status Overlay with Timer */}
      {status === "joined" && (
        <div className="pixel-corners zoom-in-95 absolute top-24 min-w-[300px] animate-in border-2 border-primary bg-background/90 p-6 text-center">
          <h3 className="mb-4 font-sans text-primary text-xl">LOBBY JOINED</h3>

          {/* Timer Display */}
          <div className="mb-4 flex items-center justify-center gap-2">
            <Clock className="h-6 w-6 animate-pulse text-primary" />
            <span className="font-bold font-mono text-4xl text-white">
              {timeDisplay.value}
            </span>
            <span className="font-mono text-muted-foreground text-sm">
              {timeDisplay.unit}
            </span>
          </div>

          {/* Player Count */}
          <div className="mb-2">
            <div className="mb-1 flex items-center justify-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="font-mono text-lg text-white">
                {lobbyStatus?.status === "waiting"
                  ? lobbyStatus.playerCount
                  : 1}
                <span className="text-muted-foreground">/16</span>
              </span>
            </div>
            {/* Progress bar */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{
                  width: `${((lobbyStatus?.status === "waiting" ? lobbyStatus.playerCount : 1) / 16) * 100}%`,
                }}
              />
            </div>
          </div>

          <p className="mb-4 font-mono text-muted-foreground text-xs">
            {displayTimeLeft > 0
              ? "Spiel startet wenn voll oder Timer abläuft"
              : "Spiel startet..."}
          </p>

          <div className="flex gap-2">
            <Button
              className="pixel-corners flex-1 border-green-600 bg-green-600 font-mono text-sm text-white uppercase hover:bg-green-700"
              onClick={handleForceStart}
            >
              Lobby starten
            </Button>
            <Button
              className="pixel-corners font-mono text-muted-foreground text-xs uppercase hover:text-destructive"
              onClick={handleLeave}
              variant="ghost"
            >
              Verlassen
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SubModeCard({
  icon,
  label,
  selected,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={selected}
      className={cn(
        "pixel-corners flex w-full cursor-pointer flex-col items-center justify-center gap-2 border-2 p-4 transition-all hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-95",
        selected
          ? "border-primary bg-primary/20 text-primary"
          : "border-muted bg-background text-muted-foreground hover:border-primary/50"
      )}
      onClick={onClick}
      type="button"
    >
      {icon}
      <span className="text-center font-mono text-xs uppercase">{label}</span>
    </button>
  );
}
