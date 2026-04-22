import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import {
  listDecks,
  createDeck,
  listGroups,
  createGroup,
  renameGroup,
  deleteGroup,
  type DeckWithStats,
  type DeckGroup,
} from "@/lib/storage";
import { useAuth } from "@/hooks/useAuth";
import { Plus, Sparkles, Upload, Folder, FolderPlus, Pencil, Trash2, Layers } from "lucide-react";
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

type Filter = "all" | "ungrouped" | string; // string = group id

function Index() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [decks, setDecks] = useState<DeckWithStats[]>([]);
  const [groups, setGroups] = useState<DeckGroup[]>([]);
  const [loadingDecks, setLoadingDecks] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  // group dialogs
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [renameTarget, setRenameTarget] = useState<DeckGroup | null>(null);
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => {
    if (!user) return;
    Promise.all([listDecks(), listGroups()])
      .then(([d, g]) => {
        setDecks(d);
        setGroups(g);
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoadingDecks(false));
  }, [user]);

  const visibleDecks = useMemo(() => {
    if (filter === "all") return decks;
    if (filter === "ungrouped") return decks.filter((d) => !d.group_id);
    return decks.filter((d) => d.group_id === filter);
  }, [decks, filter]);

  if (!loading && !user) return <Navigate to="/auth" />;

  const totalCards = decks.reduce((s, d) => s + d.cardCount, 0);
  const totalDue = decks.reduce((s, d) => s + d.dueCount, 0);

  const ungroupedCount = decks.filter((d) => !d.group_id).length;
  const countForGroup = (gid: string) => decks.filter((d) => d.group_id === gid).length;

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const groupId = filter !== "all" && filter !== "ungrouped" ? filter : null;
      const deck = await createDeck({ name: name.trim(), description: desc.trim(), group_id: groupId });
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

  const handleCreateGroup = async () => {
    if (!groupName.trim()) return;
    try {
      const g = await createGroup({ name: groupName.trim() });
      setGroups((gs) => [...gs, g]);
      setGroupName("");
      setGroupOpen(false);
      setFilter(g.id);
      toast.success("Group created");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create group");
    }
  };

  const handleRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    try {
      await renameGroup(renameTarget.id, renameValue.trim());
      setGroups((gs) => gs.map((g) => (g.id === renameTarget.id ? { ...g, name: renameValue.trim() } : g)));
      setRenameTarget(null);
      toast.success("Group renamed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to rename");
    }
  };

  const handleDeleteGroup = async (g: DeckGroup) => {
    if (!confirm(`Delete group "${g.name}"? Decks inside will become ungrouped.`)) return;
    try {
      await deleteGroup(g.id);
      setGroups((gs) => gs.filter((x) => x.id !== g.id));
      setDecks((ds) => ds.map((d) => (d.group_id === g.id ? { ...d, group_id: null } : d)));
      if (filter === g.id) setFilter("all");
      toast.success("Group deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const onDeckMoved = (deckId: string, groupId: string | null) => {
    setDecks((ds) => ds.map((d) => (d.id === deckId ? { ...d, group_id: groupId } : d)));
  };

  const filterLabel =
    filter === "all"
      ? "All decks"
      : filter === "ungrouped"
        ? "Ungrouped"
        : groups.find((g) => g.id === filter)?.name ?? "Group";

  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 py-16">
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mb-14"
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
                  {filter !== "all" && filter !== "ungrouped" && (
                    <p className="text-xs text-muted-foreground">
                      Will be added to <span className="text-foreground font-medium">{filterLabel}</span>.
                    </p>
                  )}
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

        <section className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-8">
          {/* Groups sidebar */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs uppercase tracking-widest text-muted-foreground">Groups</h3>
              <Dialog open={groupOpen} onOpenChange={setGroupOpen}>
                <DialogTrigger asChild>
                  <button
                    className="inline-flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    aria-label="New group"
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                  </button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="font-display text-2xl">New group</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-2 py-2">
                    <label className="text-sm font-medium">Group name</label>
                    <Input
                      placeholder="e.g. Semester 1"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      autoFocus
                      maxLength={60}
                      onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()}
                    />
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setGroupOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleCreateGroup}>Create group</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <div className="space-y-1">
              <FilterButton
                active={filter === "all"}
                onClick={() => setFilter("all")}
                icon={<Layers className="h-3.5 w-3.5" />}
                label="All decks"
                count={decks.length}
              />
              <FilterButton
                active={filter === "ungrouped"}
                onClick={() => setFilter("ungrouped")}
                icon={<Folder className="h-3.5 w-3.5" />}
                label="Ungrouped"
                count={ungroupedCount}
              />

              {groups.length > 0 && (
                <div className="pt-2 mt-2 border-t border-border/60 space-y-1">
                  {groups.map((g) => (
                    <div key={g.id} className="group/item flex items-center gap-1">
                      <FilterButton
                        active={filter === g.id}
                        onClick={() => setFilter(g.id)}
                        icon={<Folder className="h-3.5 w-3.5 text-primary" />}
                        label={g.name}
                        count={countForGroup(g.id)}
                      />
                      <div className="opacity-0 group-hover/item:opacity-100 transition-opacity flex">
                        <button
                          onClick={() => {
                            setRenameTarget(g);
                            setRenameValue(g.name);
                          }}
                          className="h-6 w-6 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                          aria-label="Rename group"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => handleDeleteGroup(g)}
                          className="h-6 w-6 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-muted"
                          aria-label="Delete group"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="font-display text-2xl">Rename group</DialogTitle>
                </DialogHeader>
                <div className="space-y-2 py-2">
                  <Input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    autoFocus
                    maxLength={60}
                    onKeyDown={(e) => e.key === "Enter" && handleRename()}
                  />
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setRenameTarget(null)}>
                    Cancel
                  </Button>
                  <Button onClick={handleRename}>Save</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </aside>

          {/* Decks grid */}
          <div>
            <div className="flex items-baseline justify-between mb-6">
              <h2 className="font-display text-2xl">{filterLabel}</h2>
              <span className="text-sm text-muted-foreground">
                {totalDue > 0 ? `${totalDue} cards waiting` : "All caught up ✨"}
              </span>
            </div>

            {loadingDecks ? (
              <div className="text-center text-muted-foreground py-12">Loading…</div>
            ) : visibleDecks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card/40 p-16 text-center">
                <p className="font-display text-xl mb-2">
                  {decks.length === 0 ? "No decks yet" : "Nothing here"}
                </p>
                <p className="text-muted-foreground text-sm mb-6">
                  {decks.length === 0
                    ? "Upload a document to auto-generate one, or create a deck manually."
                    : "Move decks into this group from the deck menu."}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {visibleDecks.map((deck, i) => (
                  <DeckCard
                    key={deck.id}
                    deck={deck}
                    index={i}
                    groups={groups}
                    onMoved={onDeckMoved}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm transition-colors ${
        active
          ? "bg-muted text-foreground font-medium"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
      }`}
    >
      {icon}
      <span className="flex-1 text-left truncate">{label}</span>
      <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
    </button>
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
