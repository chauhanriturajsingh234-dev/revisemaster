import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { SiteHeader } from "@/components/SiteHeader";
import { DeckCard } from "@/components/DeckCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { loadDecks, saveDecks, uid, type Deck } from "@/lib/storage";
import { Plus, Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ReviseMaster — Smart Spaced Repetition for Students" },
      {
        name: "description",
        content:
          "Master any subject with active recall flashcards and spaced repetition. Build decks, study daily, retain forever.",
      },
      { property: "og:title", content: "ReviseMaster — Study smarter, remember longer" },
      {
        property: "og:description",
        content: "Active recall flashcards with spaced repetition that adapts to you.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  useEffect(() => {
    setDecks(loadDecks());
  }, []);

  const totalCards = decks.reduce((s, d) => s + d.cards.length, 0);
  const totalDue = decks.reduce(
    (s, d) => s + d.cards.filter((c) => c.due <= Date.now()).length,
    0,
  );

  const createDeck = () => {
    if (!name.trim()) return;
    const deck: Deck = {
      id: uid(),
      name: name.trim(),
      description: desc.trim(),
      createdAt: Date.now(),
      cards: [],
    };
    const next = [deck, ...decks];
    setDecks(next);
    saveDecks(next);
    setName("");
    setDesc("");
    setOpen(false);
    navigate({ to: "/deck/$deckId", params: { deckId: deck.id } });
  };

  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 py-16">
        {/* Hero */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mb-16"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground mb-6">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Built on the science of active recall
          </div>
          <h1 className="font-display text-5xl md:text-7xl leading-[0.95] tracking-tight max-w-3xl">
            Study less.
            <br />
            <span className="text-primary italic">Remember more.</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-xl">
            ReviseMaster uses spaced repetition to surface the right card at the right moment —
            so knowledge sticks the first time, and stays.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="lg" className="gap-2 rounded-full px-6">
                  <Plus className="h-4 w-4" />
                  New deck
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="font-display text-2xl">Create a new deck</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Topic name</label>
                    <Input
                      placeholder="e.g. Organic Chemistry"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Description</label>
                    <Textarea
                      placeholder="What's this deck about?"
                      value={desc}
                      onChange={(e) => setDesc(e.target.value)}
                      rows={3}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={createDeck}>Create deck</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <div className="flex items-center gap-6 text-sm">
              <Stat value={decks.length} label="decks" />
              <div className="h-6 w-px bg-border" />
              <Stat value={totalCards} label="cards" />
              <div className="h-6 w-px bg-border" />
              <Stat value={totalDue} label="due now" highlight />
            </div>
          </div>
        </motion.section>

        {/* Decks grid */}
        <section>
          <div className="flex items-baseline justify-between mb-6">
            <h2 className="font-display text-2xl">Your decks</h2>
            <span className="text-sm text-muted-foreground">
              {totalDue > 0 ? `${totalDue} cards waiting` : "All caught up ✨"}
            </span>
          </div>

          {decks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/40 p-16 text-center">
              <p className="font-display text-xl mb-2">No decks yet</p>
              <p className="text-muted-foreground text-sm mb-6">
                Create your first deck to start revising.
              </p>
              <Button onClick={() => setOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" /> New deck
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {decks.map((deck, i) => (
                <DeckCard key={deck.id} deck={deck} index={i} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function Stat({
  value,
  label,
  highlight,
}: {
  value: number;
  label: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span
        className={`font-display text-xl ${highlight && value > 0 ? "text-primary" : "text-foreground"}`}
      >
        {value}
      </span>
      <span className="text-muted-foreground text-xs uppercase tracking-wider">{label}</span>
    </div>
  );
}
