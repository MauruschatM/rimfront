"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Loader2 } from "lucide-react";
import { GameCanvas } from "@/components/game/GameCanvas";
import type { Id } from "@packages/backend/convex/_generated/dataModel";

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as Id<"games">;

  // Poll game state (Dynamic: buildings, players, phase)
  const gameState = useQuery(api.game.getGameState, { gameId });

  // Load Static Map (Tiles, Structures) - Only loads once ideally or when null
  const staticMap = useQuery(api.game.getStaticMap, { gameId });

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

  const { game, players, buildings } = gameState;

  // Logic to handle Lobby -> Game transition if user refreshed or linked directly
  if (game.phase === "lobby" || game.status === "waiting") {
      return (
          <div className="flex h-screen w-full items-center justify-center bg-black text-white">
               <span className="font-mono animate-pulse">WAITING FOR DEPLOYMENT...</span>
          </div>
      );
  }

  // Wait for map if game is active
  if (!staticMap && game.phase !== "lobby") {
       return (
          <div className="flex h-screen w-full items-center justify-center bg-black text-white">
              <Loader2 className="w-10 h-10 animate-spin" />
              <span className="ml-4 font-mono">GENERATING TERRAIN...</span>
          </div>
      );
  }

  // Calculate Time Left in Phase
  const now = Date.now();
  const phaseTimeLeft = game.phaseEnd ? Math.max(0, Math.ceil((game.phaseEnd - now) / 1000)) : 0;

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black">
      {/* 3D Game Canvas */}
      <GameCanvas
        game={game}
        staticMap={staticMap}
        buildings={buildings}
        players={players}
      />

      {/* HUD Overlay */}
      <div className="absolute top-0 left-0 w-full p-4 pointer-events-none flex justify-between items-start">
         <div className="bg-black/50 p-2 border border-white/20 pixel-corners text-white">
            <h1 className="font-sans text-xl text-primary uppercase">{staticMap?.planetType || "UNKNOWN SYSTEM"}</h1>
            <div className="font-mono text-xs text-muted-foreground">
                PHASE: <span className="text-white">{game.phase?.toUpperCase()}</span>
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

      {/* Phase Specific Instructions */}
      {game.phase === "placement" && (
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-primary/20 p-4 border-2 border-primary pixel-corners text-center animate-pulse pointer-events-none">
              <h2 className="font-sans text-2xl text-primary">DEPLOY COMMAND POST</h2>
              <p className="font-mono text-xs text-white">CLICK TO PLACE BASE (5x5)</p>
          </div>
      )}
    </div>
  );
}
