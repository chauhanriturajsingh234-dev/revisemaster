import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";

const passwordSchema = z.string().min(8, "At least 8 characters").max(72);

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — ReviseMaster" },
      { name: "description", content: "Choose a new password for your ReviseMaster account." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Supabase recovery link sets a session via the URL hash; wait for it.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid password");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: parsed.data });
      if (error) throw error;
      toast.success("Password updated. You're signed in.");
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update password");
    } finally {
      setBusy(false);
    }
  };

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

        <h1 className="font-display text-4xl mb-2 tracking-tight">Choose a new password</h1>
        <p className="text-muted-foreground mb-8">
          {ready
            ? "Pick something memorable but secure."
            : "Verifying your reset link…"}
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">New password</label>
            <Input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
              minLength={8}
              disabled={!ready}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Confirm password</label>
            <Input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter password"
              required
              minLength={8}
              disabled={!ready}
            />
          </div>
          <Button type="submit" size="lg" className="w-full rounded-full" disabled={busy || !ready}>
            {busy ? "Updating…" : "Update password"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link to="/auth" className="text-primary hover:underline font-medium">
            Back to sign in
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
