import { createFileRoute, Link, useNavigate, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  getDeck,
  listCards,
  createCard,
  deleteCard,
  deleteDeck,
  type Deck,
  type Card,
} from "@/lib/storage";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, Plus, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/deck/$deckId")({
  component: DeckPage,
});

function DeckPage() {
  const { deckId } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [busy, setBusy] = useState(true);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");

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

  const addCard = async () => {
    if (!front.trim() || !back.trim()) return;
    try {
      const card = await createCard(deckId, front.trim(), back.trim());
      setCards([card, ...cards]);
      setFront("");
      setBack("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add card");
    }
  };

  const removeCard = async (cardId: string) => {
    try {
      await deleteCard(cardId);
      setCards(cards.filter((c) => c.id !== cardId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const handleDeleteDeck = async () => {
    if (!deck || !confirm(`Delete "${deck.name}"? This cannot be undone.`)) return;
    try {
      await deleteDeck(deck.id);
      navigate({ to: "/" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  if (busy) {
    return (
      <div className="min-h-screen bg-paper">
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-6 py-24 text-center text-muted-foreground">
          Loading deck…
        </main>
      </div>
    );
  }

  if (!deck) {
    return (
      <div className="min-h-screen bg-paper">
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-6 py-24 text-center">
          <p>
            Deck not found.{" "}
            <Link to="/" className="text-primary underline">
              Back
            </Link>
          </p>
        </main>
      </div>
    );
  }

  const nowISO = new Date().toISOString();
  const due = cards.filter((c) => c.due_at <= nowISO).length;

  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-6 py-12">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> All decks
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-wrap items-end justify-between gap-6 mb-12"
        >
          <div>
            <h1 className="font-display text-5xl tracking-tight mb-3">{deck.name}</h1>
            <p className="text-muted-foreground max-w-xl">
              {deck.description || "No description"}
            </p>
            <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
              <span>{cards.length} cards</span>
              {due > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-2.5 py-0.5 font-medium">
                  {due} due
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDeleteDeck}
              className="text-muted-foreground hover:text-destructive"
              aria-label="Delete deck"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button
              size="lg"
              className="gap-2 rounded-full px-6"
              disabled={cards.length === 0}
              onClick={() => navigate({ to: "/deck/$deckId/study", params: { deckId: deck.id } })}
            >
              <Play className="h-4 w-4 fill-current" /> Study now
            </Button>
          </div>
        </motion.div>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-soft mb-10">
          <h2 className="font-display text-xl mb-4">Add a flashcard</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">
                Front (question)
              </label>
              <Textarea
                placeholder="What is the powerhouse of the cell?"
                value={front}
                onChange={(e) => setFront(e.target.value)}
                rows={3}
                maxLength={1000}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">
                Back (answer)
              </label>
              <Textarea
                placeholder="The mitochondrion."
                value={back}
                onChange={(e) => setBack(e.target.value)}
                rows={3}
                maxLength={2000}
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={addCard} className="gap-2">
              <Plus className="h-4 w-4" /> Add card
            </Button>
          </div>
        </section>

        <section>
          <h2 className="font-display text-xl mb-4">Cards</h2>
          {cards.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
              No cards yet. Add your first one above.
            </div>
          ) : (
            <ul className="space-y-3">
              {cards.map((c, i) => (
                <motion.li
                  key={c.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="group rounded-xl border border-border bg-card p-4 flex items-start gap-4 hover:border-primary/40 transition-colors"
                >
                  <div className="flex-1 grid md:grid-cols-2 gap-4">
                    <p className="text-sm font-medium">{c.front}</p>
                    <p className="text-sm text-muted-foreground">{c.back}</p>
                  </div>
                  <button
                    onClick={() => removeCard(c.id)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition"
                    aria-label="Delete card"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </motion.li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
