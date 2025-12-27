"use client";

import { Loader2 } from "lucide-react";
import { AuthDialog } from "@/components/auth/auth-dialog";
import { UserProfile } from "@/components/game/user-profile";
import { ModeSelector } from "@/components/game/mode-selector";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export default function Home() {
  const { data: session, isPending, error } = authClient.useSession();

  if (isPending) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="font-mono text-sm text-primary animate-pulse">INITIALIZING SYSTEMS...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden">
      {/* Background Stars (CSS based) */}
      <div className="stars">
        {/* We can generate stars with JS or just have static CSS.
            For now, let's assume the CSS in global.css handles a basic field
            or we add a few manually if needed.
            Actually, let's add some div stars here for effect if the CSS class expects them.
        */}
        {Array.from({ length: 50 }).map((_, i) => (
          <div
            key={i}
            className="star"
            style={{
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 5}s`,
            }}
          />
        ))}
      </div>

      <div className="z-10 flex flex-col items-center gap-8">
        {/* Logo / Title */}
        <div className="text-center space-y-2">
          <h1 className="font-sans text-6xl md:text-8xl text-primary drop-shadow-[4px_4px_0_var(--color-primary-foreground)] select-none">
            RIMFRONT
          </h1>
          <p className="font-mono text-xs md:text-sm text-muted-foreground tracking-[0.5em] uppercase">
            Tactical Pixel Warfare
          </p>
        </div>

        {session ? (
          <div className="flex flex-col items-center gap-8">
            {/* Top Center Play Button */}
            <ModeSelector user={session.user} />
            <UserProfile user={session.user} />
          </div>
        ) : (
          <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-8 duration-1000">
            <AuthDialog defaultTab="login">
              <Button size="lg" className="font-sans text-xl h-16 px-12 rounded-none pixel-corners border-2 border-primary bg-background text-primary hover:bg-primary hover:text-primary-foreground transition-all pixel-border">
                START GAME
              </Button>
            </AuthDialog>

            <div className="flex gap-4 justify-center">
                <Button variant="link" className="text-muted-foreground font-mono text-xs">
                    SERVER STATUS: ONLINE
                </Button>
                <Button variant="link" className="text-muted-foreground font-mono text-xs">
                    V 0.1.0 ALPHA
                </Button>
            </div>
          </div>
        )}
      </div>

      {/* Scanline effect overlay */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-[50] bg-[length:100%_2px,3px_100%] opacity-20" />
    </main>
  );
}
