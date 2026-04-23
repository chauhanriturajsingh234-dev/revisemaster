import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Upload, FileText, Download, Trash2, Sparkles, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { uploadToCloudinary } from "@/lib/cloudinary";

type DocRow = {
  id: string;
  filename: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  status: "uploaded" | "processing" | "ready" | "failed";
  error: string | null;
  deck_id: string | null;
  created_at: string;
};

const ACCEPTED = ".pdf,.docx,.txt";
const MAX_BYTES = 30 * 1024 * 1024;
const ACCEPTED_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

export const Route = createFileRoute("/documents")({
  head: () => ({
    meta: [
      { title: "Documents — ReviseMaster" },
      { name: "description", content: "Upload notes (PDF, DOCX, TXT) and auto-generate flashcard decks." },
    ],
  }),
  component: DocumentsPage,
});

function DocumentsPage() {
  const { user, loading } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [uploading, setUploading] = useState(false);

  const refresh = async () => {
    const { data, error } = await supabase
      .from("documents")
      .select("id, filename, storage_path, mime_type, size_bytes, status, error, deck_id, created_at")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setDocs((data ?? []) as DocRow[]);
  };

  useEffect(() => {
    if (!user) return;
    refresh().finally(() => setBusy(false));

    // Realtime updates while processing
    const channel = supabase
      .channel("documents-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "documents", filter: `user_id=eq.${user.id}` },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  if (!loading && !user) return <Navigate to="/auth" />;

  const handleUpload = async (file: File) => {
    if (!user) return;
    if (file.size > MAX_BYTES) {
      toast.error("File is too large (30MB max).");
      return;
    }
    if (!ACCEPTED_MIMES.has(file.type) && !/\.(pdf|docx|txt)$/i.test(file.name)) {
      toast.error("Only PDF, DOCX, or TXT files are supported.");
      return;
    }
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${user.id}/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage.from("documents").upload(path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
      if (upErr) throw upErr;

      const { data: doc, error: insErr } = await supabase
        .from("documents")
        .insert({
          user_id: user.id,
          filename: file.name,
          storage_path: path,
          mime_type: file.type || "application/octet-stream",
          size_bytes: file.size,
          status: "uploaded",
        })
        .select("id")
        .single();
      if (insErr) throw insErr;

      toast.success("Uploaded — generating flashcards…");
      await refresh();

      // Kick off processing
      const { error: fnErr } = await supabase.functions.invoke("process-document", {
        body: { documentId: doc.id },
      });
      if (fnErr) {
        toast.error(`Processing failed to start: ${fnErr.message}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDownload = async (doc: DocRow) => {
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 60);
    if (error || !data) {
      toast.error(error?.message ?? "Could not get download link");
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  const handleDelete = async (doc: DocRow) => {
    if (!confirm(`Delete "${doc.filename}"? The associated deck will be kept.`)) return;
    try {
      await supabase.storage.from("documents").remove([doc.storage_path]);
      const { error } = await supabase.from("documents").delete().eq("id", doc.id);
      if (error) throw error;
      setDocs(docs.filter((d) => d.id !== doc.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const handleRetry = async (doc: DocRow) => {
    await supabase.from("documents").update({ status: "uploaded", error: null }).eq("id", doc.id);
    await supabase.functions.invoke("process-document", { body: { documentId: doc.id } });
    toast.success("Re-processing…");
  };

  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-10"
        >
          <h1 className="font-display text-5xl tracking-tight mb-3">Documents</h1>
          <p className="text-muted-foreground max-w-xl">
            Upload your notes (PDF, DOCX, or TXT) and we'll automatically extract the content and
            build a flashcard deck for you.
          </p>
        </motion.div>

        {/* Upload zone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) handleUpload(f);
          }}
          className="rounded-2xl border-2 border-dashed border-border bg-card/40 p-10 text-center mb-10"
        >
          <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-4">
            <Upload className="h-6 w-6" />
          </div>
          <p className="font-display text-xl mb-1">Drop a file here</p>
          <p className="text-sm text-muted-foreground mb-5">PDF, DOCX, or TXT — up to 30MB</p>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
            }}
          />
          <Button onClick={() => fileRef.current?.click()} disabled={uploading} className="gap-2 rounded-full px-6">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? "Uploading…" : "Choose file"}
          </Button>
        </div>

        {/* List */}
        <section>
          <h2 className="font-display text-xl mb-4">Your uploads</h2>
          {busy ? (
            <div className="text-center text-muted-foreground py-12">Loading…</div>
          ) : docs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
              No uploads yet.
            </div>
          ) : (
            <ul className="space-y-3">
              {docs.map((d) => (
                <DocItem
                  key={d.id}
                  doc={d}
                  onDownload={() => handleDownload(d)}
                  onDelete={() => handleDelete(d)}
                  onRetry={() => handleRetry(d)}
                />
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function DocItem({
  doc,
  onDownload,
  onDelete,
  onRetry,
}: {
  doc: DocRow;
  onDownload: () => void;
  onDelete: () => void;
  onRetry: () => void;
}) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border bg-card p-4 flex items-center gap-4 hover:border-primary/40 transition-colors"
    >
      <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0">
        <FileText className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{doc.filename}</p>
        <p className="text-xs text-muted-foreground">
          {(doc.size_bytes / 1024).toFixed(0)} KB · {new Date(doc.created_at).toLocaleString()}
        </p>
      </div>
      <StatusBadge status={doc.status} error={doc.error} />
      <div className="flex items-center gap-1">
        {doc.deck_id && (
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <a href={`/deck/${doc.deck_id}`}>
              <Sparkles className="h-3.5 w-3.5 text-primary" /> Deck
            </a>
          </Button>
        )}
        {doc.status === "failed" && (
          <Button variant="ghost" size="sm" onClick={onRetry}>
            Retry
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={onDownload} aria-label="Download">
          <Download className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          className="text-muted-foreground hover:text-destructive"
          aria-label="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </motion.li>
  );
}

function StatusBadge({ status, error }: { status: DocRow["status"]; error: string | null }) {
  if (status === "ready")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/15 text-success px-2 py-0.5 text-xs font-medium">
        <CheckCircle2 className="h-3 w-3" /> Ready
      </span>
    );
  if (status === "processing" || status === "uploaded")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">
        <Loader2 className="h-3 w-3 animate-spin" /> Processing
      </span>
    );
  return (
    <span
      title={error ?? "Failed"}
      className="inline-flex items-center gap-1 rounded-full bg-destructive/15 text-destructive px-2 py-0.5 text-xs font-medium"
    >
      <AlertCircle className="h-3 w-3" /> Failed
    </span>
  );
}
