import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Play } from "lucide-react";
import type { DeckWithStats } from "@/lib/storage";

export function DeckCard({ deck, index }: { deck: DeckWithStats; index: number }) {
  const total = deck.cardCount;
  const due = deck.dueCount;
  const progress = total === 0 ? 0 : Math.round(((total - due) / total) * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className="relative group"
    >
      <Link
        to="/deck/$deckId"
        params={{ deckId: deck.id }}
        className="block rounded-2xl border border-border bg-card p-6 shadow-soft hover:shadow-[var(--shadow-glow)] hover:-translate-y-0.5 transition-all duration-300"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <h3 className="font-display text-2xl leading-tight pr-20">{deck.name}</h3>
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
      {total > 0 && (
        <Link
          to="/deck/$deckId/study"
          params={{ deckId: deck.id }}
          onClick={(e) => e.stopPropagation()}
          className="absolute top-5 right-5 inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium shadow-soft hover:opacity-90 transition-opacity z-10"
          aria-label="Start study session"
        >
          <Play className="h-3 w-3 fill-current" /> Study
        </Link>
      )}
    </motion.div>
  );
}
