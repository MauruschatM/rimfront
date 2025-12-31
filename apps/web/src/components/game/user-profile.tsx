"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, LogOut, Settings } from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authClient } from "@/lib/auth-client";

// Schema for updating profile
const profileSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters" }),
  // Add other fields like avatar URL later if needed
});

type ProfileFormValues = z.infer<typeof profileSchema>;

interface UserProfileProps {
  user: {
    id: string;
    email: string;
    name: string;
    image?: string | null;
  };
}

export function UserProfile({ user }: UserProfileProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { setTheme, theme } = useTheme();

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user.name,
    },
  });

  async function onUpdateProfile(data: ProfileFormValues) {
    setIsLoading(true);
    try {
      await authClient.updateUser({
        name: data.name,
      });
      toast.success("Profile updated successfully");
      // No need to close dialog, user might want to do more
    } catch (error) {
      console.error(error);
      toast.error("Failed to update profile");
    } finally {
      setIsLoading(false);
    }
  }

  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function onLogout() {
    setIsLoggingOut(true);
    try {
      await authClient.signOut({
        fetchOptions: {
          onSuccess: () => {
            toast.success("Logged out successfully");
            // window.location.reload(); // better-auth usually handles session state updates reactively
          },
          onError: () => {
            setIsLoggingOut(false);
          },
        },
      });
    } catch (error) {
      console.error(error);
      setIsLoggingOut(false);
    }
  }

  return (
    <div className="pixel-border relative z-10 mx-auto flex max-w-md flex-col items-center space-y-4 border-4 border-primary bg-card/80 p-8 backdrop-blur-sm">
      <div className="relative">
        <Avatar className="h-24 w-24 border-2 border-primary">
          <AvatarImage alt={user.name} src={user.image || ""} />
          <AvatarFallback className="bg-muted font-sans text-2xl text-muted-foreground">
            {user.name.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="absolute right-0 bottom-0 h-4 w-4 animate-pulse rounded-full border border-black bg-green-500" />
      </div>

      <div className="space-y-1 text-center">
        <h2 className="font-sans text-2xl text-primary text-shadow-sm uppercase tracking-widest">
          {user.name}
        </h2>
        <p className="font-mono text-muted-foreground text-xs">{user.email}</p>
        <div className="inline-flex items-center rounded border border-primary/50 bg-primary/20 px-2 py-0.5 font-medium font-mono text-primary text-xs">
          RANK: PILOT
        </div>
      </div>

      <div className="flex w-full gap-4 pt-4">
        {/* Play Button - Placeholder for now */}
        <Button className="pixel-corners h-12 flex-1 rounded-none bg-green-600 font-sans text-lg text-white hover:bg-green-700">
          ENTER WORLD
        </Button>
      </div>

      <div className="w-full">
        <Dialog onOpenChange={setOpen} open={open}>
          <DialogTrigger asChild>
            <Button
              className="w-full border-primary/50 border-dashed font-mono text-xs hover:border-primary"
              variant="outline"
            >
              <Settings className="mr-2 h-3 w-3" /> SYSTEM SETTINGS
            </Button>
          </DialogTrigger>
          <DialogContent className="pixel-border bg-card text-card-foreground sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-sans text-lg text-primary">
                SYSTEM CONFIG
              </DialogTitle>
            </DialogHeader>

            <Tabs className="w-full" defaultValue="profile">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger className="font-mono text-xs" value="profile">
                  PROFILE
                </TabsTrigger>
                <TabsTrigger className="font-mono text-xs" value="system">
                  SYSTEM
                </TabsTrigger>
              </TabsList>

              <TabsContent className="space-y-4 pt-4" value="profile">
                <Form {...form}>
                  <form
                    className="space-y-4"
                    onSubmit={form.handleSubmit(onUpdateProfile)}
                  >
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-xs">
                            CALLSIGN
                          </FormLabel>
                          <FormControl>
                            <Input {...field} className="font-mono" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      className="w-full rounded-none font-sans"
                      disabled={isLoading}
                      type="submit"
                    >
                      {isLoading && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      UPDATE ID
                    </Button>
                  </form>
                </Form>
              </TabsContent>

              <TabsContent className="space-y-6 pt-4" value="system">
                <div className="flex items-center justify-between">
                  <Label className="font-mono text-xs">THEME MODE</Label>
                  <div className="flex gap-2">
                    <Button
                      className="h-8 font-mono text-xs"
                      onClick={() => setTheme("light")}
                      size="sm"
                      variant={theme === "light" ? "default" : "outline"}
                    >
                      LIGHT
                    </Button>
                    <Button
                      className="h-8 font-mono text-xs"
                      onClick={() => setTheme("dark")}
                      size="sm"
                      variant={theme === "dark" ? "default" : "outline"}
                    >
                      DARK
                    </Button>
                  </div>
                </div>

                <div className="border-border border-t pt-4">
                  <Button
                    className="w-full rounded-none font-sans"
                    disabled={isLoggingOut}
                    onClick={onLogout}
                    variant="destructive"
                  >
                    {isLoggingOut ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <LogOut className="mr-2 h-4 w-4" />
                    )}
                    DISENGAGE (LOGOUT)
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
