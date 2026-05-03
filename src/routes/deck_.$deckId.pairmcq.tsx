import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { getDeck, listCards, type Card, type Deck } from "@/lib/storage";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, Check, X, Trophy, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/deck_/$deckId/pairmcq")({
  component: PairMcqPage,
});

type Statement = { topic: string; answer: string; correct: boolean };
type Option = { label: string; set: number[] };
type Question = {
  statements: Statement[];
  correctSet: number[]; // 1-based indices
  options: Option[];
  correctOption: number;
};

const LETTERS = ["a", "b", "c", "d", "e"];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function keyOf(s: number[]): string {
  return [...s].sort((a, b) => a - b).join(",");
}

function labelOf(s: number[]): string {
  if (s.length === 0) return "None of the above";
  if (s.length === 1) return `${s[0]} only`;
  return [...s].sort((a, b) => a - b).join(" & ");
}

function buildQuestion(pool: Card[]): Question | null {
  if (pool.length < 4) return null;
  const picked = shuffle(pool).slice(0, 4);

  // Pick 2 indices to keep correct, 2 to make wrong
  const indices = shuffle([0, 1, 2, 3]);
  const correctIdx = new Set(indices.slice(0, 2));

  const statements: Statement[] = picked.map((card, i) => {
    if (correctIdx.has(i)) {
      return { topic: card.front, answer: card.back, correct: true };
    }
    const others = pool.filter(
      (c) => c.id !== card.id && c.back.trim() !== card.back.trim(),
    );
    if (others.length === 0) {
      return { topic: card.front, answer: card.back, correct: true };
    }
    const wrong = others[Math.floor(Math.random() * others.length)].back;
    return { topic: card.front, answer: wrong, correct: false };
  });

  // Shuffle the statements (and remap correctness positions)
  const order = shuffle([0, 1, 2, 3]);
  const reordered = order.map((i) => statements[i]);
  const correctSet: number[] = [];
  reordered.forEach((s, i) => {
    if (s.correct) correctSet.push(i + 1);
  });

  // Build option set: must include the correct pair, plus distractors
  const used = new Set<string>([keyOf(correctSet)]);
  const candidatePairs: number[][] = [];
  for (let i = 1; i <= 4; i++) {
    for (let j = i + 1; j <= 4; j++) candidatePairs.push([i, j]);
  }
  const candidateSingles: number[][] = [[1], [2], [3], [4]];

  const distractors: number[][] = [];
  for (const p of shuffle(candidatePairs)) {
    if (distractors.length >= 2) break;
    if (!used.has(keyOf(p))) {
      used.add(keyOf(p));
      distractors.push(p);
    }
  }
  for (const s of shuffle(candidateSingles)) {
    if (distractors.length >= 4) break;
    if (!used.has(keyOf(s))) {
      used.add(keyOf(s));
      distractors.push(s);
    }
  }

  const allSets = shuffle([correctSet, ...distractors]).slice(0, 5);
  const options: Option[] = allSets.map((s) => ({ label: labelOf(s), set: s }));
  const correctOption = options.findIndex((o) => keyOf(o.set) === keyOf(correctSet));

  return { statements: reordered, correctSet, options, correctOption };
}

function buildQuiz(cards: Card[], count: number): Question[] {
  const out: Question[] = [];
  for (let i = 0; i < count; i++) {
    const q = buildQuestion(cards);
    if (q) out.push(q);
  }
  return out;
}

function PairMcqPage() {
  const { deckId } = Route.useParams();
  const { user, loading } = useAuth();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [busy, setBusy] = useState(true);

  const [count, setCount] = useState<number>(5);
  const [quiz, setQuiz] = useState<Question[] | null>(null);
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

  if (!loading && !user) return <Navigate to="/auth" />;

  const start = () => {
    setQuiz(buildQuiz(cards, count));
    setIdx(0);
    setPicked(null);
    setScore(0);
  };

  const pick = (i: number) => {
    if (picked !== null || !quiz) return;
    setPicked(i);
    if (i === quiz[idx].correctOption) setScore((s) => s + 1);
  };

  const next = () => {
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
        <main className="mx-auto max-w-3xl px-6 py-24 text-center text-muted-foreground">Loading…</main>
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

  if (!quiz) {
    return (
      <div className="min-h-screen bg-paper">
        <SiteHeader />
        <main className="mx-auto max-w-2xl px-6 py-12">
          <Link to="/deck/$deckId" params={{ deckId }} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8">
            <ArrowLeft className="h-4 w-4" /> Back to deck
          </Link>
          <h1 className="font-display text-4xl mb-2">Correct Pair MCQ: {deck.name}</h1>
          <p className="text-muted-foreground mb-8">
            Four pairings shown — pick the option listing the correctly matched ones.
          </p>

          {cards.length < 4 ? (
            <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">
              You need at least 4 cards to generate this quiz.
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card p-6 shadow-soft space-y-6">
              <div>
                <div className="mb-3 text-sm font-medium">Number of questions</div>
                <div className="flex flex-wrap gap-2">
                  {[5, 10, 20].map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setCount(opt)}
                      className={cn(
                        "px-4 py-2 rounded-full border text-sm transition-colors",
                        count === opt ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted",
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
              <Button size="lg" className="w-full rounded-full" onClick={start}>Start Quiz</Button>
            </div>
          )}
        </main>
      </div>
    );
  }

  if (idx >= quiz.length) {
    const pct = Math.round((score / quiz.length) * 100);
    return (
      <div className="min-h-screen bg-paper">
        <SiteHeader />
        <main className="mx-auto max-w-xl px-6 py-12">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-border bg-card p-10 shadow-soft text-center">
            <Trophy className="h-12 w-12 mx-auto text-primary mb-4" />
            <h1 className="font-display text-4xl mb-2">Quiz complete</h1>
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

  const q = quiz[idx];
  const answered = picked !== null;
  const isCorrect = picked === q.correctOption;

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

        <motion.div key={idx} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-border bg-card p-6 shadow-soft mb-6">
          <p className="text-sm text-muted-foreground mb-4">Which of the following pairs are correctly matched?</p>
          <ol className="space-y-2">
            {q.statements.map((s, i) => {
              const showState = answered;
              return (
                <li key={i} className={cn(
                  "flex gap-3 rounded-lg px-3 py-2 border",
                  !showState && "border-transparent",
                  showState && s.correct && "border-success/40 bg-success/5",
                  showState && !s.correct && "border-destructive/40 bg-destructive/5",
                )}>
                  <span className="font-medium text-muted-foreground">{i + 1}.</span>
                  <span className="flex-1">
                    <span className="font-medium">{s.topic}</span>
                    <span className="text-muted-foreground"> : </span>
                    <span>{s.answer}</span>
                  </span>
                  {showState && s.correct && <Check className="h-4 w-4 text-success shrink-0 mt-1" />}
                  {showState && !s.correct && <X className="h-4 w-4 text-destructive shrink-0 mt-1" />}
                </li>
              );
            })}
          </ol>
        </motion.div>

        <div className="space-y-2 mb-6">
          {q.options.map((opt, i) => {
            const isPicked = picked === i;
            const isRight = i === q.correctOption;
            const showRight = answered && isRight;
            const showWrong = answered && isPicked && !isRight;
            const letter = LETTERS[i] ?? String(i + 1);
            return (
              <button
                key={i}
                disabled={answered}
                onClick={() => pick(i)}
                className={cn(
                  "w-full text-left p-3 rounded-xl border-2 transition-all flex items-center gap-3",
                  !answered && "border-border hover:border-primary/50 hover:bg-muted/50",
                  showRight && "border-success bg-success/10",
                  showWrong && "border-destructive bg-destructive/10",
                  answered && !isPicked && !isRight && "border-border opacity-60",
                )}
              >
                <span className="font-medium text-muted-foreground">({letter})</span>
                <span className="flex-1">{opt.label}</span>
                {showRight && <Check className="h-5 w-5 text-success" />}
                {showWrong && <X className="h-5 w-5 text-destructive" />}
              </button>
            );
          })}
        </div>

        {answered && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-between gap-4">
            <p className={cn("text-sm font-medium", isCorrect ? "text-success" : "text-destructive")}>
              {isCorrect ? "Correct!" : `Correct answer: ${q.options[q.correctOption].label}`}
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
