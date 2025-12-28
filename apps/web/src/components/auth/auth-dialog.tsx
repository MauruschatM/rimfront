"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";
import { Button } from "@/components/ui/button";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authClient } from "@/lib/auth-client";

const authSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
  password: z
    .string()
    .min(8, { message: "Password must be at least 8 characters" }),
  name: z
    .string()
    .min(2, { message: "Name must be at least 2 characters" })
    .optional(),
});

type AuthFormValues = z.infer<typeof authSchema>;

interface AuthDialogProps {
  children?: React.ReactNode;
  defaultTab?: "login" | "signup";
}

export function AuthDialog({
  children,
  defaultTab = "login",
}: AuthDialogProps) {
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
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="pixel-border bg-card text-card-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center font-sans text-primary text-xl">
            RIMFRONT ACCESS
          </DialogTitle>
          <DialogDescription className="text-center font-mono text-xs">
            Identify yourself to proceed.
          </DialogDescription>
        </DialogHeader>
        <Tabs
          className="w-full"
          onValueChange={(v) => setActiveTab(v as "login" | "signup")}
          value={activeTab}
        >
          <TabsList className="grid w-full grid-cols-2 bg-muted/50 p-1">
            <TabsTrigger
              className="font-mono text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              value="login"
            >
              LOGIN
            </TabsTrigger>
            <TabsTrigger
              className="font-mono text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              value="signup"
            >
              SIGN UP
            </TabsTrigger>
          </TabsList>

          <TabsContent className="space-y-4 pt-4" value="login">
            <Form {...loginForm}>
              <form
                className="space-y-4"
                onSubmit={loginForm.handleSubmit(onLogin)}
              >
                <FormField
                  control={loginForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase">
                        Email
                      </FormLabel>
                      <FormControl>
                        <Input
                          className="font-mono text-sm"
                          placeholder="pilot@rimfront.net"
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
                      <FormLabel className="font-mono text-xs uppercase">
                        Password
                      </FormLabel>
                      <FormControl>
                        <Input
                          className="font-mono text-sm"
                          type="password"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage className="font-mono text-xs" />
                    </FormItem>
                  )}
                />
                <Button
                  className="pixel-corners w-full rounded-none bg-primary font-sans text-primary-foreground hover:bg-primary/90"
                  disabled={isLoading}
                  type="submit"
                >
                  {isLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  AUTHENTICATE
                </Button>
              </form>
            </Form>
          </TabsContent>

          <TabsContent className="space-y-4 pt-4" value="signup">
            <Form {...signupForm}>
              <form
                className="space-y-4"
                onSubmit={signupForm.handleSubmit(onSignup)}
              >
                <FormField
                  control={signupForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase">
                        Callsign (Name)
                      </FormLabel>
                      <FormControl>
                        <Input
                          className="font-mono text-sm"
                          placeholder="Skywalker"
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
                      <FormLabel className="font-mono text-xs uppercase">
                        Email
                      </FormLabel>
                      <FormControl>
                        <Input
                          className="font-mono text-sm"
                          placeholder="pilot@rimfront.net"
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
                      <FormLabel className="font-mono text-xs uppercase">
                        Password
                      </FormLabel>
                      <FormControl>
                        <Input
                          className="font-mono text-sm"
                          type="password"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage className="font-mono text-xs" />
                    </FormItem>
                  )}
                />
                <Button
                  className="pixel-corners w-full rounded-none bg-primary font-sans text-primary-foreground hover:bg-primary/90"
                  disabled={isLoading}
                  type="submit"
                >
                  {isLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
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
