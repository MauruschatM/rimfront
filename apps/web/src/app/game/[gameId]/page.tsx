"use client";

import { api } from "@packages/backend/convex/_generated/api";
import type { Id } from "@packages/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  Clock,
  Coins,
  Crosshair,
  Hammer,
  Loader2,
  Shield,
  Users,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import * as React from "react";
import { GameCanvas } from "@/components/game/GameCanvas";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const BUILDINGS_INFO = [
  { id: "house", name: "House", width: 2, height: 2, baseCost: 2000 },
  { id: "workshop", name: "Workshop", width: 4, height: 4, baseCost: 4000 },
  { id: "barracks", name: "Barracks", width: 3, height: 3, baseCost: 4000 },
];

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as Id<"games">;
  const { data: session } = authClient.useSession();

  // Poll game state
  const gameState = useQuery(api.game.getGameState, { gameId });
  const staticMap = useQuery(api.game.getStaticMap, { gameId });

  const deleteGame = useMutation(api.game.deleteGame);
  const placeBuilding = useMutation(api.game.placeBuilding);
  const moveTroop = useMutation(api.game.moveTroop);

  // Modes: Build, Defense (Troop Command)
  const [mode, setMode] = React.useState<"none" | "build" | "defense">("none");
  const [selectedBuilding, setSelectedBuilding] = React.useState<string | null>(
    "house"
  );
  const [selectedTroopId, setSelectedTroopId] = React.useState<string | null>(
    null
  );

  // Timer state for countdown - updates every second
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleEndGame = async () => {
    await deleteGame({ gameId });
    router.push("/");
  };

  const handlePlaceBuilding = async (type: string, x: number, y: number) => {
    try {
      await placeBuilding({
        gameId,
        buildingType: type,
        x,
        y,
      });
    } catch (e) {
      const error = e as Error;
      console.error("Failed to place building:", error);
      alert(error.message);
    }
  };

  const handleMoveTroop = async (x: number, y: number) => {
    if (!selectedTroopId) {
      return;
    }
    try {
      await moveTroop({
        gameId,
        troupeId: selectedTroopId as Id<"troups">,
        targetX: x,
        targetY: y,
      });
    } catch (e) {
      console.error("Failed to move troop:", e);
    }
  };

  // Handle map clicks based on mode
  const handleMapClick = (x: number, y: number) => {
    if (mode === "build" && selectedBuilding) {
      handlePlaceBuilding(selectedBuilding, x, y);
    } else if (mode === "defense" && selectedTroopId) {
      handleMoveTroop(x, y);
    }
  };

  if (gameState === undefined || staticMap === undefined) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-black text-white">
        <Loader2 className="h-10 w-10 animate-spin" />
        <span className="ml-4 font-mono">LOADING BATTLEFIELD...</span>
      </div>
    );
  }

  if (gameState === null) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-black text-white">
        <h1 className="font-mono text-2xl text-red-500">GAME NOT FOUND</h1>
      </div>
    );
  }

  const { game, players, buildings, entities, troupes } = gameState;
  const myPlayer =
    players.find((p) => session?.user?.id && p.userId === session.user.id) ||
    players.find((p) => !p.isBot) ||
    players[0];
  const credits = myPlayer?.credits || 0;

  // Inflation
  const myBuildingsCount = buildings.filter(
    (b) => b.ownerId === myPlayer?._id && b.type !== "base_central"
  ).length;
  const inflationMultiplier = 2 ** myBuildingsCount;

  // Collect my troops
  const myTroops = troupes?.filter((t) => t.ownerId === myPlayer?._id) || [];

  // Phase Check - Waiting for game to start
  if (game.phase === "lobby" || game.status === "waiting") {
    // Calculate time remaining
    const now = Date.now();
    const timeElapsed = now - game.createdAt;
    const timeLeftMs = Math.max(0, 60_000 - timeElapsed);
    const timeLeftSec = Math.ceil(timeLeftMs / 1000);
    const playerCount = players.length;

    return (
      <div className="flex h-screen w-full items-center justify-center bg-black text-white">
        <div className="pixel-corners flex min-w-[350px] flex-col items-center border-2 border-primary bg-background/50 p-8">
          <h2 className="mb-6 font-sans text-2xl text-primary">
            WARTE AUF SPIELSTART
          </h2>

          {/* Timer */}
          <div className="mb-6 flex items-center gap-3">
            <Clock className="h-8 w-8 animate-pulse text-primary" />
            <span className="font-bold font-mono text-5xl">{timeLeftSec}</span>
            <span className="font-mono text-muted-foreground">SEK</span>
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
  if (!staticMap && game.phase !== "lobby") {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-black text-white">
        <Loader2 className="h-10 w-10 animate-spin" />
        <span className="ml-4 font-mono">GENERATING TERRAIN...</span>
      </div>
    );
  }

  const phaseTimeLeft = game.phaseEnd
    ? Math.max(0, Math.ceil((game.phaseEnd - now) / 1000))
    : 0;

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black">
      <GameCanvas
        buildings={buildings}
        entities={entities}
        game={game}
        isBuildMode={mode === "build"}
        onMoveTroop={handleMapClick}
        onPlaceBuilding={(type, x, y) => handleMapClick(x, y)}
        onSelectTroop={(id) => {
          setSelectedTroopId(id);
          if (id) {
            setMode("defense");
          }
        }}
        players={players}
        selectedBuilding={selectedBuilding}
        selectedTroopId={selectedTroopId}
        staticMap={staticMap}
      />

      {/* HUD */}
      <div className="pointer-events-none absolute top-0 left-0 flex w-full items-start justify-between p-4">
        <div className="pixel-corners border border-white/20 bg-black/50 p-2 text-white">
          <h1 className="font-sans text-primary text-xl uppercase">
            {staticMap?.planetType || "UNKNOWN SYSTEM"}
          </h1>
          <div className="font-mono text-muted-foreground text-xs">
            PHASE:{" "}
            <span className="text-white">{game.phase?.toUpperCase()}</span>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="pixel-corners flex min-w-[100px] flex-col items-center border border-white/20 bg-black/50 p-2 text-white">
            <div className="flex items-center gap-2 text-yellow-400">
              <Coins className="h-4 w-4" />
              <span className="font-bold font-mono text-xl">
                {credits}{" "}
                <span className="text-white/70 text-xs">
                  ({inflationMultiplier}x)
                </span>
              </span>
            </div>
            <div className="font-mono text-[10px] text-muted-foreground uppercase">
              Credits
            </div>
          </div>

          <div className="pixel-corners border border-white/20 bg-black/50 p-2 text-white">
            <div className="text-center font-bold font-mono text-4xl">
              {phaseTimeLeft > 0 ? phaseTimeLeft : "00"}
            </div>
            <div className="text-center font-mono text-muted-foreground text-xs">
              SECONDS
            </div>
          </div>
        </div>
      </div>

      {/* Defense Mode Sidebar */}
      {mode === "defense" && (
        <div className="pixel-corners pointer-events-auto absolute top-20 left-4 flex max-h-[60vh] flex-col gap-2 overflow-y-auto border border-white/20 bg-black/80 p-2">
          <div className="mb-2 font-mono text-muted-foreground text-xs">
            COMMANDERS
          </div>
          {myTroops.length === 0 ? (
            <div className="text-white text-xs">
              No Troops available.
              <br />
              Build Barracks.
            </div>
          ) : (
            myTroops.map((t) => (
              <div
                className={cn(
                  "flex cursor-pointer items-center gap-2 border p-2 hover:bg-white/10",
                  selectedTroopId === t._id
                    ? "border-primary bg-primary/20"
                    : "border-white/20"
                )}
                key={t._id}
                onClick={() => {
                  setSelectedTroopId(t._id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setSelectedTroopId(t._id);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="h-4 w-4 rounded-full bg-red-500" />
                <div className="flex flex-col">
                  <span className="font-mono text-white text-xs">
                    Cmdr {t._id.slice(0, 4)}
                  </span>
                  <span className="font-mono text-[10px] text-white/50">
                    {
                      entities.filter(
                        (e: any) => e.troupeId === t._id && e.type === "soldier"
                      ).length
                    }{" "}
                    Soldiers
                  </span>
                  <span className="font-mono text-[10px] text-green-400">
                    {t.state.toUpperCase()}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Build Menu */}
      {mode === "build" && (
        <div className="pointer-events-auto absolute bottom-20 left-1/2 flex -translate-x-1/2 gap-2">
          {BUILDINGS_INFO.map((b) => {
            const cost = b.baseCost * inflationMultiplier;
            const canAfford = credits >= cost;
            return (
              <div
                className={cn(
                  "flex min-w-[100px] cursor-pointer flex-col items-center border-2 bg-black/80 p-2 transition-all",
                  selectedBuilding === b.id
                    ? "scale-110 border-primary"
                    : "border-white/20 hover:border-white/50",
                  !canAfford && "opacity-50 grayscale"
                )}
                key={b.id}
                onClick={() => setSelectedBuilding(b.id)}
              >
                <div className="mb-1 font-mono text-white text-xs">
                  {b.name}
                </div>
                <div className="mb-1 h-8 w-8 border border-white/20 bg-blue-500" />
                <div
                  className={cn(
                    "font-mono text-[10px]",
                    canAfford ? "text-yellow-400" : "text-red-500"
                  )}
                >
                  {cost} CR
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Controls */}
      <div className="pointer-events-auto absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-4">
        {game.phase === "simulation" && (
          <>
            <Button
              className={cn(
                "pixel-corners min-w-[120px] font-mono",
                mode === "build" && "border-2 border-yellow-400"
              )}
              onClick={() => {
                setMode(mode === "build" ? "none" : "build");
                if (mode !== "build") setSelectedBuilding("house");
              }}
              variant={mode === "build" ? "default" : "secondary"}
            >
              <Hammer className="mr-2 h-4 w-4" />
              {mode === "build" ? "CLOSE" : "BUILD MODE"}
            </Button>

            <Button
              className={cn(
                "pixel-corners min-w-[120px] font-mono",
                mode === "defense" && "border-2 border-red-500"
              )}
              onClick={() => {
                setMode(mode === "defense" ? "none" : "defense");
                if (
                  mode !== "defense" &&
                  !selectedTroopId &&
                  myTroops.length > 0
                ) {
                  setSelectedTroopId(myTroops[0]._id);
                }
              }}
              variant={mode === "defense" ? "default" : "secondary"}
            >
              <Shield className="mr-2 h-4 w-4" />
              {mode === "defense" ? "CLOSE" : "DEFENSE MODE"}
            </Button>
          </>
        )}
      </div>

      <div className="pointer-events-auto absolute right-4 bottom-4">
        <Button
          className="pixel-corners font-mono"
          onClick={handleEndGame}
          variant="destructive"
        >
          END GAME
        </Button>
      </div>

      {/* Phase Specific Instructions */}
      {game.phase === "placement" && (
        <div className="pixel-corners pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 animate-pulse border-2 border-primary bg-primary/20 p-4 text-center">
          <h2 className="font-sans text-2xl text-primary">
            DEPLOY COMMAND POST
          </h2>
          <p className="font-mono text-white text-xs">
            CLICK TO PLACE BASE (5x5)
          </p>
        </div>
      )}

      {mode === "defense" && selectedTroopId && (
        <div className="pointer-events-none absolute bottom-24 left-1/2 -translate-x-1/2 text-center">
          <div className="pixel-corners flex items-center gap-2 bg-black/50 p-2 text-red-500">
            <Crosshair className="h-4 w-4 animate-pulse" />
            <span className="font-mono text-xs">SELECT TARGET TO MOVE</span>
          </div>
        </div>
      )}
    </div>
  );
}
