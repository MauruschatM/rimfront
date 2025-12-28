"use client";

import { Loader2 } from "lucide-react";
import { AuthDialog } from "@/components/auth/auth-dialog";
import { ModeSelector } from "@/components/game/mode-selector";
import { UserProfile } from "@/components/game/user-profile";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export default function Home() {
  const { data: session, isPending, error } = authClient.useSession();

  if (isPending) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="animate-pulse font-mono text-primary text-sm">
            INITIALIZING SYSTEMS...
          </p>
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
            className="star"
            key={i}
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
        <div className="space-y-2 text-center">
          <h1 className="select-none font-sans text-6xl text-primary drop-shadow-[4px_4px_0_var(--color-primary-foreground)] md:text-8xl">
            RIMFRONT
          </h1>
          <p className="font-mono text-muted-foreground text-xs uppercase tracking-[0.5em] md:text-sm">
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
          <div className="fade-in slide-in-from-bottom-8 flex animate-in flex-col gap-4 duration-1000">
            <AuthDialog defaultTab="login">
              <Button
                className="pixel-corners pixel-border h-16 rounded-none border-2 border-primary bg-background px-12 font-sans text-primary text-xl transition-all hover:bg-primary hover:text-primary-foreground"
                size="lg"
              >
                START GAME
              </Button>
            </AuthDialog>

            <div className="flex justify-center gap-4">
              <Button
                className="font-mono text-muted-foreground text-xs"
                variant="link"
              >
                SERVER STATUS: ONLINE
              </Button>
              <Button
                className="font-mono text-muted-foreground text-xs"
                variant="link"
              >
                V 0.1.0 ALPHA
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Scanline effect overlay */}
      <div className="pointer-events-none absolute inset-0 z-[50] bg-[length:100%_2px,3px_100%] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] opacity-20" />
    </main>
  );
}
