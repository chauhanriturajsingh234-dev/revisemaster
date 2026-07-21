import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { z } from "zod";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "At least 8 characters").max(72),
});

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" ? s.next : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in — ReviseMaster" },
      { name: "description", content: "Sign in or create your ReviseMaster account." },
    ],
  }),
  component: AuthPage,
});

// Only follow same-origin relative redirects.
function safeNext(next: string | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const search = Route.useSearch();
  const next = safeNext(search.next);
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      if (next) window.location.replace(next);
      else navigate({ to: "/" });
    }
  }, [user, loading, navigate, next]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === "forgot") {
      const emailParsed = z.string().trim().email("Enter a valid email").max(255).safeParse(email);
      if (!emailParsed.success) {
        toast.error(emailParsed.error.issues[0]?.message ?? "Invalid email");
        return;
      }
      setBusy(true);
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(emailParsed.data, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Check your email for a reset link.");
        setMode("signin");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not send reset email");
      } finally {
        setBusy(false);
      }
      return;
    }

    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setBusy(true);
    try {
      const returnTo = next ? `${window.location.origin}${next}` : `${window.location.origin}/`;
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: { emailRedirectTo: returnTo },
        });
        if (error) throw error;
        toast.success("Account created. Welcome!");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (error) throw error;
        toast.success("Welcome back!");
      }
      if (next) window.location.replace(next);
      else navigate({ to: "/" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast.error(msg.includes("already registered") ? "Email already in use — try signing in." : msg);
    } finally {
      setBusy(false);
    }
  };

  const heading =
    mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your account" : "Reset your password";
  const sub =
    mode === "signin"
      ? "Sign in to continue your study streak."
      : mode === "signup"
        ? "Start building decks that sync across your devices."
        : "Enter your email and we'll send you a reset link.";

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Link to="/" className="inline-flex items-center gap-2 mb-10">
          <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-display text-lg font-semibold shadow-soft">
            R
          </div>
          <span className="font-display text-2xl tracking-tight">
            Revise<span className="text-primary">Master</span>
          </span>
        </Link>

        <h1 className="font-display text-4xl mb-2 tracking-tight">{heading}</h1>
        <p className="text-muted-foreground mb-8">{sub}</p>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Email</label>
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          {mode !== "forgot" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Password</label>
                {mode === "signin" && (
                  <button
                    type="button"
                    onClick={() => setMode("forgot")}
                    className="text-xs text-primary hover:underline font-medium"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <Input
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
                minLength={8}
              />
            </div>
          )}
          <Button type="submit" size="lg" className="w-full rounded-full" disabled={busy}>
            {busy
              ? "Please wait…"
              : mode === "signin"
                ? "Sign in"
                : mode === "signup"
                  ? "Create account"
                  : "Send reset link"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {mode === "forgot" ? (
            <>
              Remembered it?{" "}
              <button
                onClick={() => setMode("signin")}
                className="text-primary hover:underline font-medium"
              >
                Back to sign in
              </button>
            </>
          ) : (
            <>
              {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
              <button
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                className="text-primary hover:underline font-medium"
              >
                {mode === "signin" ? "Create an account" : "Sign in"}
              </button>
            </>
          )}
        </p>
      </motion.div>
    </div>
  );
}
