import { createFileRoute, Link, useNavigate, Navigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { getDeck, listCards, gradeCard, type Card, type Deck, type Grade } from "@/lib/storage";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, Check, ChevronLeft, SkipForward } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/deck_/$deckId/study")({
  component: StudyPage,
});

const GRADES: { key: Grade; label: string; hint: string; className: string; shortcut: string }[] = [
  { key: "again", label: "Again", hint: "< 5 min", className: "bg-destructive text-destructive-foreground hover:bg-destructive/90", shortcut: "1" },
  { key: "hard", label: "Hard", hint: "Sooner", className: "bg-warning text-warning-foreground hover:bg-warning/90", shortcut: "2" },
  { key: "good", label: "Good", hint: "On track", className: "bg-success text-success-foreground hover:bg-success/90", shortcut: "3" },
  { key: "easy", label: "Easy", hint: "Later", className: "bg-primary text-primary-foreground hover:bg-primary/90", shortcut: "4" },
];

function StudyPage() {
  const { deckId } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [queue, setQueue] = useState<Card[]>([]);
  const [history, setHistory] = useState<Card[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);

  useEffect(() => {
    if (!user) return;
    Promise.all([getDeck(deckId), listCards(deckId)])
      .then(([d, cs]) => {
        setDeck(d);
        const nowISO = new Date().toISOString();
        const due = cs.filter((c) => c.due_at <= nowISO);
        setQueue(due.length > 0 ? due : cs);
      })
      .catch((e) => toast.error(e.message));
  }, [deckId, user]);

  const current = queue[0];
  const remaining = queue.length;

  const grade = useCallback(
    async (g: Grade) => {
      if (!current) return;
      try {
        await gradeCard(current, g);
        setHistory((h) => [...h, current]);
        setQueue((q) => q.slice(1));
        setReviewed((n) => n + 1);
        setFlipped(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      }
    },
    [current],
  );

  const skip = useCallback(() => {
    setQueue((q) => (q.length < 2 ? q : [...q.slice(1), q[0]]));
    setFlipped(false);
  }, []);

  const goPrevious = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setQueue((q) => [prev, ...q]);
      setReviewed((n) => Math.max(0, n - 1));
      setFlipped(false);
      return h.slice(0, -1);
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (!flipped) setFlipped(true);
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrevious();
        return;
      }
      if (e.key === "ArrowRight" || e.key === "s" || e.key === "S") {
        e.preventDefault();
        skip();
        return;
      }
      if (!flipped) return;
      const map: Record<string, Grade> = { "1": "again", "2": "hard", "3": "good", "4": "easy" };
      if (map[e.key]) {
        e.preventDefault();
        grade(map[e.key]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flipped, grade, goPrevious, skip]);

  const progress = useMemo(() => {
    const total = reviewed + remaining;
    return total === 0 ? 0 : (reviewed / total) * 100;
  }, [reviewed, remaining]);

  if (!loading && !user) return <Navigate to="/auth" />;

  if (!deck) {
    return (
      <div className="min-h-screen bg-paper">
        <SiteHeader />
        <main className="mx-auto max-w-2xl px-6 py-24 text-center text-muted-foreground">
          Loading…
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      <SiteHeader />
      <main className="flex-1 mx-auto w-full max-w-3xl px-6 py-10 flex flex-col">
        <div className="flex items-center justify-between mb-8">
          <Link
            to="/deck/$deckId"
            params={{ deckId }}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Exit session
          </Link>
          <div className="text-sm text-muted-foreground">
            <span className="text-foreground font-medium">{reviewed}</span> done ·{" "}
            <span className="text-foreground font-medium">{remaining}</span> left
          </div>
        </div>

        <div className="h-1 rounded-full bg-muted overflow-hidden mb-12">
          <motion.div
            className="h-full bg-primary"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>

        {!current ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex-1 flex flex-col items-center justify-center text-center"
          >
            <div className="h-20 w-20 rounded-full bg-success/15 text-success flex items-center justify-center mb-6">
              <Check className="h-10 w-10" />
            </div>
            <h2 className="font-display text-4xl mb-3">Session complete</h2>
            <p className="text-muted-foreground mb-8 max-w-sm">
              You reviewed {reviewed} card{reviewed === 1 ? "" : "s"}. Memory consolidation
              works best with rest — come back tomorrow.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => navigate({ to: "/deck/$deckId", params: { deckId } })}>
                Back to deck
              </Button>
              <Button onClick={() => navigate({ to: "/" })}>All decks</Button>
            </div>
          </motion.div>
        ) : (
          <>
            <div className="relative z-0 flex-1 flex items-center justify-center mb-10">
              <AnimatePresence mode="wait">
                <motion.div
                  key={current.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                  className="w-full flashcard-perspective"
                >
                  <button
                    type="button"
                    onPointerUp={() => setFlipped((f) => !f)}
                    className="block w-full text-left touch-manipulation"
                    aria-label="Flip card"
                  >
                    <div
                      className={`flashcard-inner relative w-full min-h-[340px] ${flipped ? "is-flipped" : ""}`}
                    >
                      <div className="flashcard-face absolute inset-0 rounded-3xl border border-border bg-card shadow-soft p-10 flex flex-col">
                        <span className="text-xs uppercase tracking-widest text-muted-foreground mb-6">
                          Question
                        </span>
                        <div className="flex-1 flex items-center">
                          <p className="font-display text-3xl md:text-4xl leading-snug">
                            {current.front}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground mt-6">
                          Press <kbd className="px-1.5 py-0.5 rounded bg-muted">Space</kbd> to reveal
                        </span>
                      </div>
                      <div className="flashcard-face flashcard-back absolute inset-0 rounded-3xl border border-primary/30 bg-card shadow-[var(--shadow-glow)] p-10 flex flex-col">
                        <span className="text-xs uppercase tracking-widest text-primary mb-6">
                          Answer
                        </span>
                        <div className="flex-1 flex items-center">
                          <p className="text-2xl md:text-3xl leading-snug">{current.back}</p>
                        </div>
                        <span className="text-xs text-muted-foreground mt-6">
                          How well did you recall?
                        </span>
                      </div>
                    </div>
                  </button>
                </motion.div>
              </AnimatePresence>
            </div>

            <motion.div
              initial={false}
              animate={{ opacity: flipped ? 1 : 0.35, y: flipped ? 0 : 8 }}
              transition={{ duration: 0.25 }}
              className="relative isolate z-20 grid grid-cols-2 gap-3 md:grid-cols-4"
            >
              {GRADES.map((g) => (
                <button
                  key={g.key}
                  type="button"
                  onPointerUp={() => flipped && grade(g.key)}
                  disabled={!flipped}
                  className={`touch-manipulation rounded-xl px-4 py-4 font-medium transition-all disabled:cursor-not-allowed ${g.className} disabled:opacity-50`}
                >
                  <div className="flex items-center justify-between">
                    <span>{g.label}</span>
                    <kbd className="text-xs opacity-70 px-1.5 py-0.5 rounded bg-black/10">
                      {g.shortcut}
                    </kbd>
                  </div>
                  <div className="text-xs opacity-80 mt-0.5 text-left">{g.hint}</div>
                </button>
              ))}
            </motion.div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={goPrevious}
                disabled={history.length === 0}
                className="gap-1.5"
              >
                <ChevronLeft className="h-4 w-4" /> Previous
                <kbd className="ml-1 text-[10px] opacity-60 px-1 py-0.5 rounded bg-muted">←</kbd>
              </Button>
              <span className="text-xs text-muted-foreground hidden sm:block">
                {flipped ? "Grade your recall, or use Previous / Skip" : "Press Space to reveal"}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={skip}
                disabled={queue.length < 2}
                className="gap-1.5"
              >
                Skip <SkipForward className="h-4 w-4" />
                <kbd className="ml-1 text-[10px] opacity-60 px-1 py-0.5 rounded bg-muted">→</kbd>
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
