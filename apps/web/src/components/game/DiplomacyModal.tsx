import { api } from "@packages/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Shield } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

interface DiplomacyModalProps {
  gameId: string;
  isOpen: boolean;
  onClose: () => void;
  targetPlayerId: string;
  myPlayerId: string;
}

export function DiplomacyModal({
  gameId,
  isOpen,
  onClose,
  targetPlayerId,
  myPlayerId,
}: DiplomacyModalProps) {
  const alliances = useQuery(api.diplomacy.getAlliances, { gameId });
  const gameState = useQuery(api.game.getGameState, { gameId });
  const players = gameState?.players;
  const subMode = gameState?.game?.subMode || "ffa";

  const requestAlliance = useMutation(api.diplomacy.requestAlliance);
  const acceptAlliance = useMutation(api.diplomacy.acceptAlliance);
  const rejectAlliance = useMutation(api.diplomacy.rejectAlliance);
  const breakAlliance = useMutation(api.diplomacy.breakAlliance);
  const renewAlliance = useMutation(api.diplomacy.renewAlliance);

  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!(players && alliances)) return null;

  const targetPlayer = players.find((p) => p._id === targetPlayerId);
  const myPlayer = players.find((p) => p._id === myPlayerId);

  if (!(targetPlayer && myPlayer)) return null;

  // Find existing relationship
  const relationship = alliances.find(
    (a) =>
      (a.player1Id === myPlayerId && a.player2Id === targetPlayerId) ||
      (a.player1Id === targetPlayerId && a.player2Id === myPlayerId)
  );

  // Check if teammate (Fixed Alliance)
  const isTeammate =
    myPlayer.teamId &&
    targetPlayer.teamId &&
    myPlayer.teamId === targetPlayer.teamId;

  const status = relationship?.status || "none";
  const isSender = relationship?.player1Id === myPlayerId;
  const expiresAt = relationship?.expiresAt || 0;
  const timeLeft = Math.max(0, expiresAt - now);

  const handleRequest = async () => {
    try {
      await requestAlliance({
        gameId: gameId as any,
        targetPlayerId: targetPlayerId as any,
      });
      toast.success("Alliance request sent");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleRenew = async () => {
    if (!relationship) return;
    try {
      await renewAlliance({ diplomacyId: relationship._id });
      toast.success("Alliance renewed!");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleAccept = async () => {
    if (!relationship) return;
    try {
      await acceptAlliance({ diplomacyId: relationship._id });
      toast.success("Alliance accepted");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleReject = async () => {
    if (!relationship) return;
    try {
      await rejectAlliance({ diplomacyId: relationship._id });
      toast.info("Alliance request rejected/cancelled");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleBreak = async () => {
    if (!relationship) return;
    try {
      await breakAlliance({ diplomacyId: relationship._id });
      toast.warning("Alliance broken! Troops are confused.");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={isOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Diplomacy: {targetPlayer.name}</DialogTitle>
          <DialogDescription>
            Manage your relationship with this player.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <Card>
            <CardHeader>
              <CardTitle>{targetPlayer.name}</CardTitle>
              <CardDescription>
                Status:{" "}
                {targetPlayer.status === "active" ? "Active" : "Eliminated"}
                <br />
                Credits: {Math.floor(targetPlayer.credits)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                {isTeammate ? (
                  <div className="text-center">
                    <Shield className="mx-auto mb-2 h-12 w-12 text-blue-500" />
                    <p className="mb-4 font-bold text-blue-500">TEAMMATE</p>
                    <p className="text-muted-foreground text-xs">
                      You are on the same team. Friendly fire is disabled and
                      you share vision.
                    </p>
                  </div>
                ) : subMode !== "ffa" ? (
                  <div className="text-center">
                    <p className="mb-4 text-muted-foreground">
                      Diplomacy disabled in Team modes
                    </p>
                  </div>
                ) : status === "none" ? (
                  <Button onClick={handleRequest}>Request Alliance</Button>
                ) : status === "pending" && isSender ? (
                  <Button onClick={handleReject} variant="outline">
                    Cancel Request
                  </Button>
                ) : null}
                {status === "pending" && !isSender && (
                  <div className="flex gap-2">
                    <Button onClick={handleAccept} variant="default">
                      Accept Alliance
                    </Button>
                    <Button onClick={handleReject} variant="destructive">
                      Reject
                    </Button>
                  </div>
                )}
                {status === "allied" && (
                  <div className="flex flex-col gap-2">
                    <div className="text-center font-bold text-green-500">
                      Allied
                    </div>
                    <div className="text-center font-mono text-muted-foreground text-sm">
                      {Math.floor(timeLeft / 1000 / 60)}:
                      {(Math.floor(timeLeft / 1000) % 60)
                        .toString()
                        .padStart(2, "0")}
                    </div>

                    {timeLeft <= 30_000 && (
                      <Button
                        className="w-full"
                        onClick={handleRenew}
                        variant="default"
                      >
                        Renew Alliance
                      </Button>
                    )}

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive">Break Alliance</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Are you absolutely sure?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            Breaking an alliance is a treacherous act. Your
                            troops will be confused and ineffective for 1
                            minute.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={handleBreak}
                          >
                            Yes, Break Alliance
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
