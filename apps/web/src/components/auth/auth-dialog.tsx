"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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
import { authClient } from "@/lib/auth-client";

const authSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
  password: z.string().min(8, { message: "Password must be at least 8 characters" }),
  name: z.string().min(2, { message: "Name must be at least 2 characters" }).optional(),
});

type AuthFormValues = z.infer<typeof authSchema>;

interface AuthDialogProps {
  children?: React.ReactNode;
  defaultTab?: "login" | "signup";
}

export function AuthDialog({ children, defaultTab = "login" }: AuthDialogProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"login" | "signup">(defaultTab);
  const [isLoading, setIsLoading] = useState(false);

  // Login Form
  const loginForm = useForm<AuthFormValues>({
    resolver: zodResolver(authSchema.omit({ name: true })),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  // Signup Form
  const signupForm = useForm<AuthFormValues>({
    resolver: zodResolver(authSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
  });

  async function onLogin(data: AuthFormValues) {
    setIsLoading(true);
    try {
      await authClient.signIn.email({
        email: data.email,
        password: data.password,
        fetchOptions: {
          onSuccess: () => {
            setOpen(false);
            toast.success("Welcome back, Commander!");
          },
          onError: (ctx) => {
            toast.error(ctx.error.message);
          },
        },
      });
    } catch (error) {
      console.error(error);
      toast.error("An error occurred during login");
    } finally {
      setIsLoading(false);
    }
  }

  async function onSignup(data: AuthFormValues) {
    setIsLoading(true);
    try {
      await authClient.signUp.email({
        email: data.email,
        password: data.password,
        name: data.name || "",
        fetchOptions: {
          onSuccess: () => {
            setOpen(false);
            toast.success("Welcome to the Rimfront, Cadet!");
          },
          onError: (ctx) => {
            toast.error(ctx.error.message);
          },
        },
      });
    } catch (error) {
      console.error(error);
      toast.error("An error occurred during sign up");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md pixel-border bg-card text-card-foreground">
        <DialogHeader>
          <DialogTitle className="text-center font-sans text-xl text-primary">
            RIMFRONT ACCESS
          </DialogTitle>
          <DialogDescription className="text-center font-mono text-xs">
            Identify yourself to proceed.
          </DialogDescription>
        </DialogHeader>
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "login" | "signup")}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2 bg-muted/50 p-1">
            <TabsTrigger
              value="login"
              className="font-mono text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              LOGIN
            </TabsTrigger>
            <TabsTrigger
              value="signup"
              className="font-mono text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              SIGN UP
            </TabsTrigger>
          </TabsList>

          <TabsContent value="login" className="space-y-4 pt-4">
            <Form {...loginForm}>
              <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
                <FormField
                  control={loginForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase">Email</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="pilot@rimfront.net"
                          className="font-mono text-sm"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage className="font-mono text-xs" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={loginForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase">Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          className="font-mono text-sm"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage className="font-mono text-xs" />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full font-sans bg-primary hover:bg-primary/90 text-primary-foreground rounded-none pixel-corners"
                  disabled={isLoading}
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  AUTHENTICATE
                </Button>
              </form>
            </Form>
          </TabsContent>

          <TabsContent value="signup" className="space-y-4 pt-4">
            <Form {...signupForm}>
              <form onSubmit={signupForm.handleSubmit(onSignup)} className="space-y-4">
                <FormField
                  control={signupForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase">Callsign (Name)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Skywalker"
                          className="font-mono text-sm"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage className="font-mono text-xs" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={signupForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase">Email</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="pilot@rimfront.net"
                          className="font-mono text-sm"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage className="font-mono text-xs" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={signupForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase">Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          className="font-mono text-sm"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage className="font-mono text-xs" />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full font-sans bg-primary hover:bg-primary/90 text-primary-foreground rounded-none pixel-corners"
                  disabled={isLoading}
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  ENLIST
                </Button>
              </form>
            </Form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
