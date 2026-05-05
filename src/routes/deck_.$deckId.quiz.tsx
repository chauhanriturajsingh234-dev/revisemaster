import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { getDeck, listCards, type Card, type Deck } from "@/lib/storage";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, Check, X, Trophy, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/deck_/$deckId/quiz")({
  component: QuizPage,
});

type QuizQ = { card: Card; options: string[]; correct: number };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Condense an answer to a short, comparable snippet so options don't give
// themselves away by length or extra context. Strips parenthetical asides,
// keeps the first clause/sentence, and caps length.
function condense(text: string, maxLen = 60): string {
  let t = text.trim().replace(/\s+/g, " ");
  // remove parenthetical/bracketed asides
  t = t.replace(/\s*[\(\[][^)\]]*[\)\]]/g, "").trim();
  // first sentence or clause
  const cut = t.search(/[.;:\n]/);
  if (cut > 0) t = t.slice(0, cut);
  // first comma clause if still long
  if (t.length > maxLen) {
    const c = t.indexOf(",");
    if (c > 10 && c < maxLen) t = t.slice(0, c);
  }
  if (t.length > maxLen) {
    t = t.slice(0, maxLen).replace(/\s+\S*$/, "") + "…";
  }
  return t.replace(/[\s.,;:—-]+$/g, "").trim() || text.trim();
}

function buildQuiz(cards: Card[], count: number): QuizQ[] {
  const picked = shuffle(cards).slice(0, count);
  return picked.map((card) => {
    const correctShort = condense(card.back);
    const seen = new Set<string>([correctShort.toLowerCase()]);
    const otherAnswers: string[] = [];
    for (const c of shuffle(cards)) {
      if (c.id === card.id) continue;
      const s = condense(c.back);
      const k = s.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      otherAnswers.push(s);
      if (otherAnswers.length >= 3) break;
    }
    const options = shuffle([correctShort, ...otherAnswers]);
    return { card, options, correct: options.indexOf(correctShort) };
  });
}

function QuizPage() {
  const { deckId } = Route.useParams();
  const { user, loading } = useAuth();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [busy, setBusy] = useState(true);

  const [size, setSize] = useState<number | "all">(10);
  const [quiz, setQuiz] = useState<QuizQ[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);

  useEffect(() => {
    if (!user) return;
    setBusy(true);
    Promise.all([getDeck(deckId), listCards(deckId)])
      .then(([d, c]) => {
        setDeck(d);
        setCards(c);
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setBusy(false));
  }, [deckId, user]);

  const sizeOptions = useMemo(() => {
    const opts: (number | "all")[] = [];
    for (const n of [5, 10, 20]) if (cards.length >= n) opts.push(n);
    opts.push("all");
    return opts;
  }, [cards.length]);

  if (!loading && !user) return <Navigate to="/auth" />;

  const start = () => {
    const n = size === "all" ? cards.length : Math.min(size, cards.length);
    setQuiz(buildQuiz(cards, n));
    setIdx(0);
    setPicked(null);
    setScore(0);
  };

  const pick = (i: number) => {
    if (picked !== null || !quiz) return;
    setPicked(i);
    if (i === quiz[idx].correct) setScore((s) => s + 1);
  };

  const next = () => {
    if (!quiz) return;
    setPicked(null);
    setIdx((i) => i + 1);
  };

  const restart = () => {
    setQuiz(null);
    setIdx(0);
    setPicked(null);
    setScore(0);
  };

  if (busy) {
    return (
      <div className="min-h-screen bg-paper">
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-6 py-24 text-center text-muted-foreground">
          Loading…
        </main>
      </div>
    );
  }

  if (!deck) {
    return (
      <div className="min-h-screen bg-paper">
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-6 py-24 text-center">
          <p>Deck not found. <Link to="/" className="text-primary underline">Back</Link></p>
        </main>
      </div>
    );
  }

  // Setup screen
  if (!quiz) {
    return (
      <div className="min-h-screen bg-paper">
        <SiteHeader />
        <main className="mx-auto max-w-2xl px-6 py-12">
          <Link to="/deck/$deckId" params={{ deckId }} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8">
            <ArrowLeft className="h-4 w-4" /> Back to deck
          </Link>
          <h1 className="font-display text-4xl mb-2">Quiz: {deck.name}</h1>
          <p className="text-muted-foreground mb-8">Multiple choice quiz from your flashcards.</p>

          {cards.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">
              This deck has no cards yet.
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
              <div className="mb-4 text-sm font-medium">Number of questions</div>
              <div className="flex flex-wrap gap-2 mb-6">
                {sizeOptions.map((opt) => (
                  <button
                    key={String(opt)}
                    onClick={() => setSize(opt)}
                    className={cn(
                      "px-4 py-2 rounded-full border text-sm transition-colors",
                      size === opt ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted",
                    )}
                  >
                    {opt === "all" ? `All (${cards.length})` : opt}
                  </button>
                ))}
              </div>
              <Button size="lg" className="w-full rounded-full" onClick={start}>
                Start Quiz
              </Button>
            </div>
          )}
        </main>
      </div>
    );
  }

  // Results screen
  if (idx >= quiz.length) {
    const pct = Math.round((score / quiz.length) * 100);
    return (
      <div className="min-h-screen bg-paper">
        <SiteHeader />
        <main className="mx-auto max-w-xl px-6 py-12">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-border bg-card p-10 shadow-soft text-center"
          >
            <Trophy className="h-12 w-12 mx-auto text-primary mb-4" />
            <h1 className="font-display text-4xl mb-2">Quiz complete</h1>
            <p className="text-muted-foreground mb-8">Great work!</p>
            <div className="text-6xl font-display mb-2">{score} / {quiz.length}</div>
            <div className="text-muted-foreground mb-8">{pct}% correct</div>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={restart} className="gap-2 rounded-full">
                <RotateCcw className="h-4 w-4" /> New quiz
              </Button>
              <Button asChild className="rounded-full">
                <Link to="/deck/$deckId" params={{ deckId }}>Back to deck</Link>
              </Button>
            </div>
          </motion.div>
        </main>
      </div>
    );
  }

  // Question screen
  const q = quiz[idx];
  const answered = picked !== null;
  const isCorrect = picked === q.correct;

  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-6 py-12">
        <div className="flex items-center justify-between mb-6 text-sm text-muted-foreground">
          <span>Question {idx + 1} of {quiz.length}</span>
          <span>Score: {score}</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-8">
          <div className="h-full bg-primary transition-all" style={{ width: `${(idx / quiz.length) * 100}%` }} />
        </div>

        <motion.div
          key={idx}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-border bg-card p-8 shadow-soft mb-6"
        >
          <p className="text-xl font-medium leading-relaxed">{q.card.front}</p>
        </motion.div>

        <div className="space-y-3 mb-6">
          {q.options.map((opt, i) => {
            const isPicked = picked === i;
            const isRight = i === q.correct;
            const showRight = answered && isRight;
            const showWrong = answered && isPicked && !isRight;
            return (
              <button
                key={i}
                disabled={answered}
                onClick={() => pick(i)}
                className={cn(
                  "w-full text-left p-4 rounded-xl border-2 transition-all flex items-center gap-3",
                  !answered && "border-border hover:border-primary/50 hover:bg-muted/50",
                  showRight && "border-success bg-success/10",
                  showWrong && "border-destructive bg-destructive/10",
                  answered && !isPicked && !isRight && "border-border opacity-60",
                )}
              >
                <span className="flex-1">{opt}</span>
                {showRight && <Check className="h-5 w-5 text-success" />}
                {showWrong && <X className="h-5 w-5 text-destructive" />}
              </button>
            );
          })}
        </div>

        {answered && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-between gap-4">
            <p className={cn("text-sm font-medium", isCorrect ? "text-success" : "text-destructive")}>
              {isCorrect ? "Correct!" : `Correct answer: ${q.options[q.correct]} — ${q.card.back}`}
            </p>
            <Button onClick={next} className="rounded-full">
              {idx + 1 === quiz.length ? "See results" : "Next"}
            </Button>
          </motion.div>
        )}
      </main>
    </div>
  );
}
