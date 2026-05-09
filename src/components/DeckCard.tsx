import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Play, MoreVertical, FolderInput, Check, Brain } from "lucide-react";
import type { DeckWithStats, DeckGroup } from "@/lib/storage";
import { moveDeckToGroup } from "@/lib/storage";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export function DeckCard({
  deck,
  index,
  groups = [],
  onMoved,
}: {
  deck: DeckWithStats;
  index: number;
  groups?: DeckGroup[];
  onMoved?: (deckId: string, groupId: string | null) => void;
}) {
  const total = deck.cardCount;
  const due = deck.dueCount;
  const retained = deck.retainedCount ?? Math.max(0, total - due);
  const progress = total === 0 ? 0 : Math.round((retained / total) * 100);

  const handleMove = async (groupId: string | null) => {
    try {
      await moveDeckToGroup(deck.id, groupId);
      onMoved?.(deck.id, groupId);
      toast.success(groupId ? "Moved to group" : "Removed from group");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to move");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className="relative group"
    >
      <div className="rounded-2xl border border-border bg-card p-6 shadow-soft hover:shadow-[var(--shadow-glow)] hover:-translate-y-0.5 transition-all duration-300">
        <Link to="/deck/$deckId" params={{ deckId: deck.id }} className="block">
          <div className="flex items-start justify-between gap-3 mb-4">
            <h3 className="font-display text-2xl leading-tight pr-24">{deck.name}</h3>
            {due > 0 && (
              <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-xs font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                {due} due
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2 mb-6 min-h-[2.5rem]">
            {deck.description || "No description"}
          </p>
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span>{total} cards</span>
            <span>{progress}% retained</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </Link>
      </div>

      <div className="absolute top-5 right-5 flex items-center gap-1.5 z-10">
        {total > 0 && (
          <>
            <Link
              to="/deck/$deckId/quiz"
              params={{ deckId: deck.id }}
              className="inline-flex items-center gap-1.5 rounded-full bg-muted text-foreground px-3 py-1.5 text-xs font-medium shadow-soft hover:bg-muted/70 transition-colors"
              aria-label="Start quiz"
            >
              <Brain className="h-3 w-3" /> Quiz
            </Link>
            <Link
              to="/deck/$deckId/study"
              params={{ deckId: deck.id }}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium shadow-soft hover:opacity-90 transition-opacity"
              aria-label="Start study session"
            >
              <Play className="h-3 w-3 fill-current" /> Study
            </Link>
          </>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-muted/80 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Deck options"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="flex items-center gap-2 text-xs">
              <FolderInput className="h-3.5 w-3.5" /> Move to group
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleMove(null)}>
              <span className="flex-1">No group</span>
              {!deck.group_id && <Check className="h-3.5 w-3.5" />}
            </DropdownMenuItem>
            {groups.length > 0 && <DropdownMenuSeparator />}
            {groups.map((g) => (
              <DropdownMenuItem key={g.id} onClick={() => handleMove(g.id)}>
                <span className="flex-1 truncate">{g.name}</span>
                {deck.group_id === g.id && <Check className="h-3.5 w-3.5" />}
              </DropdownMenuItem>
            ))}
            {groups.length === 0 && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                Create a group from the sidebar.
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.div>
  );
}
