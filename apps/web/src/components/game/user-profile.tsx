"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, LogOut, Settings, User } from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "next-themes";

import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { authClient } from "@/lib/auth-client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";

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
            name: data.name
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

  async function onLogout() {
    await authClient.signOut({
        fetchOptions: {
            onSuccess: () => {
                toast.success("Logged out successfully");
                // window.location.reload(); // better-auth usually handles session state updates reactively
            }
        }
    });
  }

  return (
    <div className="flex flex-col items-center space-y-4 p-8 border-4 border-primary bg-card/80 backdrop-blur-sm max-w-md mx-auto pixel-border relative z-10">
      <div className="relative">
        <Avatar className="h-24 w-24 border-2 border-primary">
          <AvatarImage src={user.image || ""} alt={user.name} />
          <AvatarFallback className="font-sans text-2xl bg-muted text-muted-foreground">
            {user.name.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="absolute bottom-0 right-0 h-4 w-4 bg-green-500 border border-black rounded-full animate-pulse" />
      </div>

      <div className="text-center space-y-1">
        <h2 className="text-2xl font-sans text-primary uppercase tracking-widest text-shadow-sm">
          {user.name}
        </h2>
        <p className="font-mono text-xs text-muted-foreground">{user.email}</p>
        <div className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/20 text-primary border border-primary/50 font-mono">
          RANK: PILOT
        </div>
      </div>

      <div className="flex gap-4 w-full pt-4">
        {/* Play Button - Placeholder for now */}
        <Button className="flex-1 font-sans bg-green-600 hover:bg-green-700 text-white rounded-none pixel-corners h-12 text-lg">
          ENTER WORLD
        </Button>
      </div>

      <div className="w-full">
         <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="w-full font-mono text-xs border-dashed border-primary/50 hover:border-primary">
                    <Settings className="mr-2 h-3 w-3" /> SYSTEM SETTINGS
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md pixel-border bg-card text-card-foreground">
                <DialogHeader>
                    <DialogTitle className="font-sans text-lg text-primary">SYSTEM CONFIG</DialogTitle>
                </DialogHeader>

                <Tabs defaultValue="profile" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="profile" className="font-mono text-xs">PROFILE</TabsTrigger>
                        <TabsTrigger value="system" className="font-mono text-xs">SYSTEM</TabsTrigger>
                    </TabsList>

                    <TabsContent value="profile" className="space-y-4 pt-4">
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onUpdateProfile)} className="space-y-4">
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="font-mono text-xs">CALLSIGN</FormLabel>
                                            <FormControl>
                                                <Input {...field} className="font-mono" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <Button type="submit" disabled={isLoading} className="w-full font-sans rounded-none">
                                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    UPDATE ID
                                </Button>
                            </form>
                        </Form>
                    </TabsContent>

                    <TabsContent value="system" className="space-y-6 pt-4">
                        <div className="flex items-center justify-between">
                            <Label className="font-mono text-xs">THEME MODE</Label>
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    variant={theme === "light" ? "default" : "outline"}
                                    onClick={() => setTheme("light")}
                                    className="font-mono text-xs h-8"
                                >
                                    LIGHT
                                </Button>
                                <Button
                                    size="sm"
                                    variant={theme === "dark" ? "default" : "outline"}
                                    onClick={() => setTheme("dark")}
                                    className="font-mono text-xs h-8"
                                >
                                    DARK
                                </Button>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-border">
                            <Button variant="destructive" onClick={onLogout} className="w-full font-sans rounded-none">
                                <LogOut className="mr-2 h-4 w-4" />
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
