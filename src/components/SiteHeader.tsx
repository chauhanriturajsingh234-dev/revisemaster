import { Link } from "@tanstack/react-router";

export function SiteHeader() {
  return (
    <header className="border-b border-border/60 backdrop-blur-md sticky top-0 z-30 bg-background/80">
      <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-display text-lg font-semibold shadow-soft">
            R
          </div>
          <span className="font-display text-xl tracking-tight">
            Revise<span className="text-primary">Master</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link
            to="/"
            className="px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            activeOptions={{ exact: true }}
            activeProps={{ className: "text-foreground bg-muted" }}
          >
            Decks
          </Link>
        </nav>
      </div>
    </header>
  );
}
