import { Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function SiteHeader() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

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
          {user ? (
            <>
              <Link
                to="/"
                className="px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                activeOptions={{ exact: true }}
                activeProps={{ className: "text-foreground bg-muted" }}
              >
                Decks
              </Link>
              <Link
                to="/documents"
                className="px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                activeProps={{ className: "text-foreground bg-muted" }}
              >
                Documents
              </Link>
              <Link
                to="/import-anki"
                className="px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                activeProps={{ className: "text-foreground bg-muted" }}
              >
                Import Anki
              </Link>
              <Button
                variant="ghost"
                size="sm"
                className="ml-2 gap-1.5 text-muted-foreground"
                onClick={async () => {
                  await signOut();
                  navigate({ to: "/auth" });
                }}
              >
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </Button>
            </>
          ) : (
            <Link
              to="/auth"
              className="px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
