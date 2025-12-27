"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Loader2, Coins, Hammer, Shield, Crosshair } from "lucide-react";
import { GameCanvas } from "@/components/game/GameCanvas";
import type { Id } from "@packages/backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";

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
  const [selectedBuilding, setSelectedBuilding] = React.useState<string | null>("house");
  const [selectedTroopId, setSelectedTroopId] = React.useState<string | null>(null);

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
              y
          });
      } catch (e: any) {
          console.error("Failed to place building:", e);
          alert(e.message);
      }
  };

  const handleMoveTroop = async (x: number, y: number) => {
      if (!selectedTroopId) return;
      try {
          await moveTroop({
              gameId,
              troopId: selectedTroopId,
              targetX: x,
              targetY: y
          });
      } catch (e: any) {
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
              <Loader2 className="w-10 h-10 animate-spin" />
              <span className="ml-4 font-mono">LOADING BATTLEFIELD...</span>
          </div>
      );
  }

  if (gameState === null) {
      return (
          <div className="flex h-screen w-full items-center justify-center bg-black text-white">
              <h1 className="text-2xl font-mono text-red-500">GAME NOT FOUND</h1>
          </div>
      );
  }

  const { game, players, buildings, unitChunks } = gameState;
  const myPlayer = players.find(p => session?.user?.id && p.userId === session.user.id) || players.find(p => !p.isBot) || players[0];
  const credits = myPlayer?.credits || 0;

  // Inflation
  const myBuildingsCount = buildings.filter(b => b.ownerId === myPlayer?._id && b.type !== "base_central").length;
  const inflationMultiplier = Math.pow(2, myBuildingsCount);

  // Collect my troops
  const myTroops: any[] = [];
  if (unitChunks) {
      for (const chunk of unitChunks) {
          for (const t of chunk.troops) {
               if (t.commander.ownerId === myPlayer?._id) {
                   myTroops.push(t);
               }
          }
      }
  }

  // Phase Check
  if (game.phase === "lobby" || game.status === "waiting") {
      return (
          <div className="flex h-screen w-full items-center justify-center bg-black text-white">
               <span className="font-mono animate-pulse">WAITING FOR DEPLOYMENT...</span>
          </div>
      );
  }
  if (!staticMap && game.phase !== "lobby") {
       return (
          <div className="flex h-screen w-full items-center justify-center bg-black text-white">
              <Loader2 className="w-10 h-10 animate-spin" />
              <span className="ml-4 font-mono">GENERATING TERRAIN...</span>
          </div>
      );
  }

  const now = Date.now();
  const phaseTimeLeft = game.phaseEnd ? Math.max(0, Math.ceil((game.phaseEnd - now) / 1000)) : 0;

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black">
      <GameCanvas
        game={game}
        staticMap={staticMap}
        buildings={buildings}
        players={players}
        unitChunks={unitChunks}
        isBuildMode={mode === "build"}
        selectedBuilding={selectedBuilding}
        onPlaceBuilding={(type, x, y) => handleMapClick(x, y)}
        // Additional props for selection
        selectedTroopId={selectedTroopId}
        onSelectTroop={(id) => {
            setSelectedTroopId(id);
            if (id) setMode("defense");
        }}
        onMoveTroop={handleMapClick} // Reuse handler logic
      />

      {/* HUD */}
      <div className="absolute top-0 left-0 w-full p-4 pointer-events-none flex justify-between items-start">
         <div className="bg-black/50 p-2 border border-white/20 pixel-corners text-white">
            <h1 className="font-sans text-xl text-primary uppercase">{staticMap?.planetType || "UNKNOWN SYSTEM"}</h1>
            <div className="font-mono text-xs text-muted-foreground">
                PHASE: <span className="text-white">{game.phase?.toUpperCase()}</span>
            </div>
         </div>

         <div className="flex gap-4">
             <div className="bg-black/50 p-2 border border-white/20 pixel-corners text-white flex flex-col items-center min-w-[100px]">
                <div className="flex items-center gap-2 text-yellow-400">
                    <Coins className="w-4 h-4" />
                    <span className="font-mono text-xl font-bold">{credits} <span className="text-xs text-white/70">({inflationMultiplier}x)</span></span>
                </div>
                <div className="font-mono text-[10px] text-muted-foreground uppercase">
                    Credits
                </div>
             </div>

             <div className="bg-black/50 p-2 border border-white/20 pixel-corners text-white">
                 <div className="font-mono text-4xl font-bold text-center">
                     {phaseTimeLeft > 0 ? phaseTimeLeft : "00"}
                 </div>
                 <div className="font-mono text-xs text-muted-foreground text-center">
                     SECONDS
                 </div>
             </div>
         </div>
      </div>

      {/* Defense Mode Sidebar */}
      {mode === "defense" && (
          <div className="absolute top-20 left-4 pointer-events-auto flex flex-col gap-2 bg-black/80 border border-white/20 p-2 pixel-corners max-h-[60vh] overflow-y-auto">
              <div className="font-mono text-xs text-muted-foreground mb-2">COMMANDERS</div>
              {myTroops.length === 0 ? (
                  <div className="text-white text-xs">No Troops available.<br/>Build Barracks.</div>
              ) : (
                  myTroops.map(t => (
                      <div
                        key={t.id}
                        className={cn(
                            "flex items-center gap-2 p-2 border cursor-pointer hover:bg-white/10",
                            selectedTroopId === t.id ? "border-primary bg-primary/20" : "border-white/20"
                        )}
                        onClick={() => setSelectedTroopId(t.id)}
                      >
                          <div className="w-4 h-4 bg-red-500 rounded-full" /> {/* Icon */}
                          <div className="flex flex-col">
                              <span className="font-mono text-xs text-white">Cmdr {t.id.slice(0, 4)}</span>
                              <span className="font-mono text-[10px] text-white/50">{t.soldiers.length} Soldiers</span>
                              <span className="font-mono text-[10px] text-green-400">{t.state.toUpperCase()}</span>
                          </div>
                      </div>
                  ))
              )}
          </div>
      )}

      {/* Build Menu */}
      {mode === "build" && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 pointer-events-auto flex gap-2">
              {BUILDINGS_INFO.map((b) => {
                  const cost = b.baseCost * inflationMultiplier;
                  const canAfford = credits >= cost;
                  return (
                      <div
                        key={b.id}
                        className={cn(
                            "flex flex-col items-center p-2 bg-black/80 border-2 cursor-pointer transition-all min-w-[100px]",
                            selectedBuilding === b.id ? "border-primary scale-110" : "border-white/20 hover:border-white/50",
                            !canAfford && "opacity-50 grayscale"
                        )}
                        onClick={() => setSelectedBuilding(b.id)}
                      >
                          <div className="font-mono text-xs text-white mb-1">{b.name}</div>
                          <div className="w-8 h-8 bg-blue-500 mb-1 border border-white/20" />
                          <div className={cn("font-mono text-[10px]", canAfford ? "text-yellow-400" : "text-red-500")}>
                              {cost} CR
                          </div>
                      </div>
                  )
              })}
          </div>
      )}

      {/* Controls */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-auto flex gap-4">
          {game.phase === "simulation" && (
            <>
                <Button
                    variant={mode === "build" ? "default" : "secondary"}
                    className={cn("font-mono pixel-corners min-w-[120px]", mode === "build" && "border-2 border-yellow-400")}
                    onClick={() => {
                        setMode(mode === "build" ? "none" : "build");
                        if (mode !== "build") setSelectedBuilding("house");
                    }}
                >
                    <Hammer className="w-4 h-4 mr-2" />
                    {mode === "build" ? "CLOSE" : "BUILD MODE"}
                </Button>

                <Button
                    variant={mode === "defense" ? "default" : "secondary"}
                    className={cn("font-mono pixel-corners min-w-[120px]", mode === "defense" && "border-2 border-red-500")}
                    onClick={() => {
                        setMode(mode === "defense" ? "none" : "defense");
                        // Auto select first troop if none
                        if (mode !== "defense" && !selectedTroopId && myTroops.length > 0) {
                            setSelectedTroopId(myTroops[0].id);
                        }
                    }}
                >
                    <Shield className="w-4 h-4 mr-2" />
                    {mode === "defense" ? "CLOSE" : "DEFENSE MODE"}
                </Button>
            </>
          )}
      </div>

      <div className="absolute bottom-4 right-4 pointer-events-auto">
          <Button
            variant="destructive"
            className="font-mono pixel-corners"
            onClick={handleEndGame}
          >
              END GAME
          </Button>
      </div>

      {/* Phase Specific Instructions */}
      {game.phase === "placement" && (
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-primary/20 p-4 border-2 border-primary pixel-corners text-center animate-pulse pointer-events-none">
              <h2 className="font-sans text-2xl text-primary">DEPLOY COMMAND POST</h2>
              <p className="font-mono text-xs text-white">CLICK TO PLACE BASE (5x5)</p>
          </div>
      )}

      {mode === "defense" && selectedTroopId && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 text-center pointer-events-none">
              <div className="flex items-center gap-2 text-red-500 bg-black/50 p-2 pixel-corners">
                  <Crosshair className="w-4 h-4 animate-pulse" />
                  <span className="font-mono text-xs">SELECT TARGET TO MOVE</span>
              </div>
          </div>
      )}
    </div>
  );
}
