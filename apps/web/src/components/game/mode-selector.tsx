"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Play, Users, User, Shield, Swords, Globe } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";

interface ModeSelectorProps {
  user: {
    id: string;
    name: string;
  };
}

export function ModeSelector({ user }: ModeSelectorProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"multiplayer" | "private">("multiplayer");
  const [selectedMode, setSelectedMode] = React.useState("fronts");
  const [selectedSubMode, setSelectedSubMode] = React.useState("ffa");
  const [status, setStatus] = React.useState<"idle" | "searching" | "joined">("idle");
  const [gameId, setGameId] = React.useState<string | null>(null);

  const findOrCreateLobby = useMutation(api.matchmaking.findOrCreateLobby);

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
    <div className="flex flex-col items-center z-50">
      {/* Top Play Button */}
      <div className="relative">
        <Button
          size="lg"
          onClick={handlePlay}
          className={cn(
            "h-16 px-12 text-xl font-sans rounded-none pixel-corners transition-all duration-200 pixel-border relative z-50",
             isOpen ? "bg-green-600 hover:bg-green-700 text-white border-green-800" : "bg-primary text-primary-foreground hover:bg-primary/90 border-primary"
          )}
        >
          {status === "searching" ? (
            <span className="animate-pulse">SEARCHING...</span>
          ) : status === "joined" ? (
             <span>JOINED LOBBY</span>
          ) : isOpen ? (
            <span className="flex items-center gap-2">READY <Play className="w-5 h-5 fill-current" /></span>
          ) : (
            <span className="flex items-center gap-2">PLAY <Play className="w-5 h-5 fill-current" /></span>
          )}
        </Button>
      </div>

      {/* Dropdown Menu */}
      {isOpen && status === "idle" && (
        <div className="absolute top-20 w-[800px] bg-background/95 backdrop-blur-sm border-2 border-muted p-4 pixel-corners animate-in fade-in slide-in-from-top-4 shadow-2xl flex flex-col gap-6">

          {/* Tabs */}
          <div className="flex gap-4 border-b-2 border-muted pb-2">
            <button
              onClick={() => setActiveTab("multiplayer")}
              className={cn(
                "px-4 py-2 font-mono text-sm uppercase transition-colors hover:text-primary",
                activeTab === "multiplayer" ? "text-primary border-b-2 border-primary -mb-2.5" : "text-muted-foreground"
              )}
            >
              Multiplayer
            </button>
            <button
              onClick={() => setActiveTab("private")} // Disabled for now visually or functionally
              className={cn(
                "px-4 py-2 font-mono text-sm uppercase transition-colors text-muted-foreground/50 cursor-not-allowed",
                activeTab === "private" ? "text-primary border-b-2 border-primary -mb-2.5" : ""
              )}
            >
              Private (Locked)
            </button>
          </div>

          {/* Mode Selection */}
          <div className="space-y-2">
            <h3 className="font-mono text-xs text-muted-foreground uppercase tracking-widest">Game Mode</h3>
            <div className="flex gap-4">
              <div
                className={cn(
                  "flex-1 p-4 border-2 cursor-pointer transition-all pixel-corners bg-muted/20 hover:bg-muted/40",
                  selectedMode === "fronts" ? "border-primary bg-primary/10" : "border-transparent"
                )}
                onClick={() => setSelectedMode("fronts")}
              >
                <div className="flex items-center gap-3">
                    <Globe className="w-8 h-8 text-primary" />
                    <div>
                        <div className="font-sans text-lg text-primary">FRONTS</div>
                        <div className="font-mono text-xs text-muted-foreground">Tactical Warfare</div>
                    </div>
                </div>
              </div>
              {/* Future modes can go here */}
            </div>
          </div>

          {/* Sub-Mode Selection */}
          <div className="space-y-2">
             <h3 className="font-mono text-xs text-muted-foreground uppercase tracking-widest">Team Size</h3>
             <div className="grid grid-cols-4 gap-4">
                <SubModeCard
                    icon={<User className="w-6 h-6" />}
                    label="Free For All"
                    value="ffa"
                    selected={selectedSubMode === "ffa"}
                    onClick={() => setSelectedSubMode("ffa")}
                />
                <SubModeCard
                    icon={<Users className="w-6 h-6" />}
                    label="Duos"
                    value="duos"
                    selected={selectedSubMode === "duos"}
                    onClick={() => setSelectedSubMode("duos")}
                />
                <SubModeCard
                    icon={<Shield className="w-6 h-6" />}
                    label="Squads"
                    value="squads"
                    selected={selectedSubMode === "squads"}
                    onClick={() => setSelectedSubMode("squads")}
                />
                <SubModeCard
                    icon={<Swords className="w-6 h-6" />}
                    label="2 Teams"
                    value="teams"
                    selected={selectedSubMode === "teams"}
                    onClick={() => setSelectedSubMode("teams")}
                />
             </div>
          </div>
        </div>
      )}

      {/* Lobby Status Overlay (Simple version) */}
      {status === "joined" && (
         <div className="absolute top-24 bg-background/90 p-4 border-2 border-primary pixel-corners text-center animate-in zoom-in-95">
             <h3 className="font-sans text-xl text-primary mb-2">LOBBY JOINED</h3>
             <p className="font-mono text-xs text-muted-foreground">Waiting for players...</p>
             <p className="font-mono text-xs text-muted-foreground mt-2">Game ID: {gameId?.slice(0, 8)}...</p>
         </div>
      )}
    </div>
  );
}

function SubModeCard({ icon, label, value, selected, onClick }: { icon: React.ReactNode, label: string, value: string, selected: boolean, onClick: () => void }) {
    return (
        <div
            onClick={onClick}
            className={cn(
                "flex flex-col items-center justify-center gap-2 p-4 border-2 pixel-corners cursor-pointer transition-all hover:scale-105 active:scale-95",
                selected ? "border-primary bg-primary/20 text-primary" : "border-muted bg-background text-muted-foreground hover:border-primary/50"
            )}
        >
            {icon}
            <span className="font-mono text-xs uppercase text-center">{label}</span>
        </div>
    )
}
