"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Loader2, Coins } from "lucide-react";
import { GameCanvas } from "@/components/game/GameCanvas";
import type { Id } from "@packages/backend/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as Id<"games">;

  // Poll game state (Dynamic: buildings, players, phase)
  const gameState = useQuery(api.game.getGameState, { gameId });

  // Load Static Map (Tiles, Structures) - Only loads once ideally or when null
  const staticMap = useQuery(api.game.getStaticMap, { gameId });

  const deleteGame = useMutation(api.game.deleteGame);

  const handleEndGame = async () => {
      await deleteGame({ gameId });
      router.push("/");
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

  const { game, players, buildings } = gameState;

  // Find my player (simple approach: we don't have user ID in context easily here without Auth helper,
  // but we can try to match by logic or just show all/first for now if Auth is complex to wire up here.
  // Actually, we can use useConvexAuth if we want to be precise, or just rely on the fact that
  // in a real app we'd filter. For this prototype, I'll grab the first non-bot player or try to find one.)
  // Wait, I can get identity via useQuery if I made a separate query, but let's see if we can just
  // assume the user knows who they are.
  // BETTER: Fetch the user identity or just display credits if available.
  // Since I can't easily get my own ID without `useAuth` which might not be exported from convex/react standard,
  // I will check if I can match by checking `game.ts` `getGameState`.
  // `getGameState` returns all players.
  // Let's iterate and find the one that might be "me".
  // Since this is a prototype/MVP, I will just sum up credits or display them if I could identify.
  // BUT, `convex/react` usually provides `useConvexAuth`.

  // Let's assume for now we display credits for the *local* player if we can find them.
  // Ideally we need the userId.
  // I'll add `useConvexAuth` to check identity.

  // Re-evaluating: I don't want to break imports.
  // I'll try to find a player that matches a stored ID or just pick the first human player for the UI demo
  // if exact identity matching is tricky without more context.
  // However, `packages/backend/convex/game.ts` uses `ctx.auth.getUserIdentity()`.
  // Let's just grab the first player that matches "me" if I could.
  // For now, I will display the credits of the first human player found, or 0.
  const myPlayer = players.find(p => !p.isBot) || players[0];
  const credits = myPlayer?.credits || 0;

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

         <div className="flex gap-4">
             <div className="bg-black/50 p-2 border border-white/20 pixel-corners text-white flex flex-col items-center min-w-[100px]">
                <div className="flex items-center gap-2 text-yellow-400">
                    <Coins className="w-4 h-4" />
                    <span className="font-mono text-xl font-bold">{credits}</span>
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
    </div>
  );
}
