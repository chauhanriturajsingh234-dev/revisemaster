import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Upload, Loader2, FileArchive, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { parseApkg, type AnkiCard } from "@/lib/anki-import";
import { parseCsv } from "@/lib/csv-import";
import { createDeck, createCard } from "@/lib/storage";

export const Route = createFileRoute("/import-anki")({
  head: () => ({
    meta: [
      { title: "Import Anki Deck — ReviseMaster" },
      { name: "description", content: "Import an Anki .apkg file into a flashcard deck." },
    ],
  }),
  component: ImportAnkiPage,
});

function ImportAnkiPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [cards, setCards] = useState<AnkiCard[] | null>(null);
  const [deckName, setDeckName] = useState("");

  if (!loading && !user) return <Navigate to="/auth" />;

  const handleFile = async (file: File) => {
    const isApkg = /\.apkg$/i.test(file.name);
    const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";
    if (!isApkg && !isCsv) {
      toast.error("Please choose a .apkg or .csv file.");
      return;
    }
    setParsing(true);
    setCards(null);
    try {
      const parsed = isApkg ? await parseApkg(file) : await parseCsv(file);
      if (!parsed.length) {
        toast.error("No flashcards found in this file.");
      } else {
        setCards(parsed);
        setDeckName(file.name.replace(/\.(apkg|csv)$/i, ""));
        toast.success(`Found ${parsed.length} cards.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to read file.");
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleImport = async () => {
    if (!cards?.length) return;
    const name = deckName.trim() || "Imported Anki Deck";
    setImporting(true);
    try {
      const deck = await createDeck({ name, description: `Imported deck (${cards.length} cards)` });
      let ok = 0;
      for (const c of cards) {
        try {
          await createCard(deck.id, c.question, c.answer);
          ok++;
        } catch {
          // skip a single failing row
        }
      }
      toast.success(`Imported ${ok} of ${cards.length} cards.`);
      navigate({ to: "/deck/$deckId", params: { deckId: deck.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  };

  const preview = cards?.slice(0, 10) ?? [];

  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8"
        >
          <h1 className="font-display text-4xl tracking-tight mb-2">Import Deck</h1>
          <p className="text-muted-foreground">
            Upload an Anki <code className="text-foreground">.apkg</code> file or a{" "}
            <code className="text-foreground">.csv</code> with question/answer columns. We'll turn it
            into a flashcard deck — no AI required.
          </p>
        </motion.div>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) handleFile(f);
          }}
          className="rounded-2xl border-2 border-dashed border-border bg-card/40 p-10 text-center mb-8"
        >
          <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-4">
            <FileArchive className="h-6 w-6" />
          </div>
          <p className="font-display text-xl mb-1">Drop your .apkg or .csv file</p>
          <p className="text-sm text-muted-foreground mb-5">
            CSV format: first column = question, second column = answer (header row optional)
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".apkg,.csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <Button
            onClick={() => fileRef.current?.click()}
            disabled={parsing || importing}
            className="gap-2 rounded-full px-6"
          >
            {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {parsing ? "Reading…" : "Choose File"}
          </Button>
        </div>

        {cards && cards.length > 0 && (
          <section className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <h2 className="font-display text-xl">Preview ({cards.length} cards)</h2>
            </div>

            <label className="block text-sm font-medium mb-1">Deck name</label>
            <input
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              className="w-full mb-5 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="My Anki Deck"
            />

            <ul className="space-y-3 mb-6">
              {preview.map((c, i) => (
                <li key={i} className="rounded-lg border border-border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Q</p>
                  <p className="text-sm whitespace-pre-wrap mb-2">{c.question}</p>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">A</p>
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">{c.answer}</p>
                </li>
              ))}
              {cards.length > preview.length && (
                <li className="text-xs text-muted-foreground text-center">
                  …and {cards.length - preview.length} more
                </li>
              )}
            </ul>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCards(null)} disabled={importing}>
                Cancel
              </Button>
              <Button onClick={handleImport} disabled={importing} className="gap-2">
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {importing ? "Importing…" : "Import Deck"}
              </Button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
