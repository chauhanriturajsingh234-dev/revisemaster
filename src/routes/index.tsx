import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
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
import { listDecks, createDeck, type DeckWithStats } from "@/lib/storage";
import { useAuth } from "@/hooks/useAuth";
import { Plus, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ReviseMaster — Smart Spaced Repetition for Students" },
      {
        name: "description",
        content:
          "Master any subject with active recall flashcards and spaced repetition. Upload notes, auto-generate quizzes, retain forever.",
      },
      { property: "og:title", content: "ReviseMaster — Study smarter, remember longer" },
      {
        property: "og:description",
        content: "Upload your study notes and let AI generate flashcards. Spaced repetition does the rest.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [decks, setDecks] = useState<DeckWithStats[]>([]);
  const [loadingDecks, setLoadingDecks] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!user) return;
    listDecks()
      .then(setDecks)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoadingDecks(false));
  }, [user]);

  if (!loading && !user) return <Navigate to="/auth" />;

  const totalCards = decks.reduce((s, d) => s + d.cardCount, 0);
  const totalDue = decks.reduce((s, d) => s + d.dueCount, 0);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const deck = await createDeck({ name: name.trim(), description: desc.trim() });
      setName("");
      setDesc("");
      setOpen(false);
      navigate({ to: "/deck/$deckId", params: { deckId: deck.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create deck");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 py-16">
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
            Upload your notes, let AI build the flashcards, and study with spaced repetition that
            knows exactly when you'll forget.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              variant="outline"
              className="gap-2 rounded-full px-6"
              onClick={() => navigate({ to: "/documents" })}
            >
              <Upload className="h-4 w-4" />
              Upload notes
            </Button>
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
                      maxLength={100}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Description</label>
                    <Textarea
                      placeholder="What's this deck about?"
                      value={desc}
                      onChange={(e) => setDesc(e.target.value)}
                      rows={3}
                      maxLength={500}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreate} disabled={creating}>
                    {creating ? "Creating…" : "Create deck"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <div className="ml-2 flex items-center gap-6 text-sm">
              <Stat value={decks.length} label="decks" />
              <div className="h-6 w-px bg-border" />
              <Stat value={totalCards} label="cards" />
              <div className="h-6 w-px bg-border" />
              <Stat value={totalDue} label="due now" highlight />
            </div>
          </div>
        </motion.section>

        <section>
          <div className="flex items-baseline justify-between mb-6">
            <h2 className="font-display text-2xl">Your decks</h2>
            <span className="text-sm text-muted-foreground">
              {totalDue > 0 ? `${totalDue} cards waiting` : "All caught up ✨"}
            </span>
          </div>

          {loadingDecks ? (
            <div className="text-center text-muted-foreground py-12">Loading…</div>
          ) : decks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/40 p-16 text-center">
              <p className="font-display text-xl mb-2">No decks yet</p>
              <p className="text-muted-foreground text-sm mb-6">
                Upload a document to auto-generate one, or create a deck manually.
              </p>
              <div className="flex justify-center gap-3">
                <Button variant="outline" onClick={() => navigate({ to: "/documents" })} className="gap-2">
                  <Upload className="h-4 w-4" /> Upload notes
                </Button>
                <Button onClick={() => setOpen(true)} className="gap-2">
                  <Plus className="h-4 w-4" /> New deck
                </Button>
              </div>
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

function Stat({ value, label, highlight }: { value: number; label: string; highlight?: boolean }) {
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
