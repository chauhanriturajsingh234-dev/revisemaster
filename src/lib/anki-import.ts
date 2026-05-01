import JSZip from "jszip";
import initSqlJs from "sql.js";
// Load wasm from CDN (matches installed sql.js version) to avoid bundler asset wiring
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";

export type AnkiCard = { question: string; answer: string };

function stripPageRefs(s: string): string {
  return s
    // (page 12), (pg. 12), (p. 12), [page 12-14], etc.
    .replace(/[\(\[\{]\s*(?:pages?|pgs?|pp?)\.?\s*\d+(?:\s*[-–—]\s*\d+)?\s*[\)\]\}]/gi, "")
    // standalone "page 12", "pg 12", "p. 12", "pp. 12-14"
    .replace(/\b(?:pages?|pgs?|pp?)\.?\s*\d+(?:\s*[-–—]\s*\d+)?\b/gi, "")
    // "Page No. 12", "Page No: 12"
    .replace(/\bpage\s*(?:no\.?|number|#)\s*[:.]?\s*\d+\b/gi, "")
    // tidy leftover punctuation/whitespace
    .replace(/[ \t]*([,;:.\-–—])\s*([,;:.\-–—])/g, "$1")
    .replace(/\(\s*\)|\[\s*\]|\{\s*\}/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/^\s*[,.;:\-–—]\s*/g, "")
    .replace(/\s*[,;:\-–—]\s*$/g, "")
    .trim();
}

function stripHtml(s: string): string {
  const cleaned = s
    .replace(/<br\s*\/?>(\n)?/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned
    .split("\n")
    .map((line) => stripPageRefs(line))
    .filter((line) => line.length > 0)
    .join("\n");
}

let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;
async function getSql() {
  if (SQL) return SQL;
  SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });
  return SQL;
}

export async function parseApkg(file: File): Promise<AnkiCard[]> {
  const zip = await JSZip.loadAsync(file);
  // Anki packages may use collection.anki2 or (newer) collection.anki21
  const dbEntry =
    zip.file("collection.anki21") ?? zip.file("collection.anki2");
  if (!dbEntry) {
    throw new Error("Invalid .apkg: no collection.anki2 found inside.");
  }
  const dbBytes = await dbEntry.async("uint8array");

  const sql = await getSql();
  const db = new sql.Database(dbBytes);
  try {
    const res = db.exec("SELECT flds FROM notes");
    if (!res.length) return [];
    const rows = res[0].values as Array<[string]>;
    const cards: AnkiCard[] = [];
    for (const [flds] of rows) {
      if (typeof flds !== "string") continue;
      const parts = flds.split("\x1f");
      const q = stripHtml(parts[0] ?? "");
      const a = stripHtml(parts[1] ?? "");
      if (q && a) cards.push({ question: q, answer: a });
    }
    return cards;
  } finally {
    db.close();
  }
}
