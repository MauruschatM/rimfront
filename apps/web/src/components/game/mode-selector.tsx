"use client";

import { api } from "@packages/backend/convex/_generated/api";
import type { Id } from "@packages/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Globe, Play, Shield, Swords, User, Users } from "lucide-react";
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
  const [gameId, setGameId] = React.useState<string | null>(null);

  const findOrCreateLobby = useMutation(api.matchmaking.findOrCreateLobby);
  const lobbyStatus = useQuery(
    api.matchmaking.getLobbyStatus,
    gameId ? { gameId: gameId as Id<"games"> } : "skip"
  );

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
      setStatus("joined");
      setIsOpen(false);
    } catch (error) {
      console.error("Failed to join game:", error);
      setStatus("idle");
    }
  };

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
              <div
                className={cn(
                  "pixel-corners flex-1 cursor-pointer border-2 bg-muted/20 p-4 transition-all hover:bg-muted/40",
                  selectedMode === "fronts"
                    ? "border-primary bg-primary/10"
                    : "border-transparent"
                )}
                onClick={() => setSelectedMode("fronts")}
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
              </div>
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

      {/* Lobby Status Overlay (Simple version) */}
      {status === "joined" && (
        <div className="pixel-corners zoom-in-95 absolute top-24 animate-in border-2 border-primary bg-background/90 p-4 text-center">
          <h3 className="mb-2 font-sans text-primary text-xl">LOBBY JOINED</h3>
          <p className="font-mono text-muted-foreground text-xs">
            Waiting for players...
          </p>
          <p className="mt-2 font-mono text-muted-foreground text-xs">
            Game ID: {gameId?.slice(0, 8)}...
          </p>
        </div>
      )}
    </div>
  );
}

function SubModeCard({
  icon,
  label,
  value,
  selected,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className={cn(
        "pixel-corners flex cursor-pointer flex-col items-center justify-center gap-2 border-2 p-4 transition-all hover:scale-105 active:scale-95",
        selected
          ? "border-primary bg-primary/20 text-primary"
          : "border-muted bg-background text-muted-foreground hover:border-primary/50"
      )}
      onClick={onClick}
    >
      {icon}
      <span className="text-center font-mono text-xs uppercase">{label}</span>
    </div>
  );
}
