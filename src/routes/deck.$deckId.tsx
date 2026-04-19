import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  loadDecks,
  saveDecks,
  newCard,
  dueCount,
  type Deck,
} from "@/lib/storage";
import { ArrowLeft, Plus, Play, Trash2 } from "lucide-react";

export const Route = createFileRoute("/deck/$deckId")({
  component: DeckPage,
  notFoundComponent: () => (
    <div className="min-h-screen flex items-center justify-center">
      <p>Deck not found. <Link to="/" className="text-primary underline">Back</Link></p>
    </div>
  ),
});

function DeckPage() {
  const { deckId } = Route.useParams();
  const navigate = useNavigate();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");

  useEffect(() => {
    setDecks(loadDecks());
  }, []);

  const deck = decks.find((d) => d.id === deckId);

  const persist = (next: Deck[]) => {
    setDecks(next);
    saveDecks(next);
  };

  if (!deck) {
    return (
      <div className="min-h-screen bg-paper">
        <SiteHeader />
        <main className="mx-auto max-w-3xl px-6 py-24 text-center">
          <p className="text-muted-foreground">Loading deck…</p>
        </main>
      </div>
    );
  }

  const addCard = () => {
    if (!front.trim() || !back.trim()) return;
    const updated: Deck = {
      ...deck,
      cards: [newCard(front.trim(), back.trim()), ...deck.cards],
    };
    persist(decks.map((d) => (d.id === deck.id ? updated : d)));
    setFront("");
    setBack("");
  };

  const deleteCard = (cardId: string) => {
    const updated: Deck = { ...deck, cards: deck.cards.filter((c) => c.id !== cardId) };
    persist(decks.map((d) => (d.id === deck.id ? updated : d)));
  };

  const deleteDeck = () => {
    if (!confirm(`Delete "${deck.name}"? This cannot be undone.`)) return;
    persist(decks.filter((d) => d.id !== deck.id));
    navigate({ to: "/" });
  };

  const due = dueCount(deck);

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
              <span>{deck.cards.length} cards</span>
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
              onClick={deleteDeck}
              className="text-muted-foreground hover:text-destructive"
              aria-label="Delete deck"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button
              size="lg"
              className="gap-2 rounded-full px-6"
              disabled={deck.cards.length === 0}
              onClick={() => navigate({ to: "/deck/$deckId/study", params: { deckId: deck.id } })}
            >
              <Play className="h-4 w-4 fill-current" /> Study now
            </Button>
          </div>
        </motion.div>

        {/* Add card */}
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
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={addCard} className="gap-2">
              <Plus className="h-4 w-4" /> Add card
            </Button>
          </div>
        </section>

        {/* Card list */}
        <section>
          <h2 className="font-display text-xl mb-4">Cards</h2>
          {deck.cards.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
              No cards yet. Add your first one above.
            </div>
          ) : (
            <ul className="space-y-3">
              {deck.cards.map((c, i) => (
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
                    onClick={() => deleteCard(c.id)}
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
