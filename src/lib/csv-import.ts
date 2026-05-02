import type { AnkiCard } from "./anki-import";

/**
 * Parse a single CSV line respecting double-quoted fields with embedded
 * commas, newlines (already handled by the line splitter via state), and
 * escaped quotes ("").
 */
function splitCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      // handle CRLF
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  // last field/row
  row.push(field);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

function detectDelimiter(sample: string): string {
  const firstLine = sample.split(/\r?\n/)[0] ?? "";
  const counts: Record<string, number> = {
    ",": (firstLine.match(/,/g) || []).length,
    "\t": (firstLine.match(/\t/g) || []).length,
    ";": (firstLine.match(/;/g) || []).length,
  };
  let best = ",";
  let max = 0;
  for (const [d, c] of Object.entries(counts)) {
    if (c > max) {
      max = c;
      best = d;
    }
  }
  return best;
}

export async function parseCsv(file: File): Promise<AnkiCard[]> {
  const text = await file.text();
  if (!text.trim()) return [];
  const delimiter = detectDelimiter(text);
  const rows = splitCsv(text, delimiter).filter((r) => r.some((c) => c.trim() !== ""));
  if (!rows.length) return [];

  // Detect header row: if first row's cells look like "question/front/term"
  // and "answer/back/definition", skip it.
  const headerLikely = (() => {
    const [a = "", b = ""] = rows[0];
    const re = /^(question|front|term|prompt|q)$|^(answer|back|definition|a)$/i;
    return re.test(a.trim()) && re.test(b.trim());
  })();

  const dataRows = headerLikely ? rows.slice(1) : rows;
  const cards: AnkiCard[] = [];
  for (const r of dataRows) {
    const q = (r[0] ?? "").trim();
    const a = (r[1] ?? "").trim();
    if (q && a) cards.push({ question: q, answer: a });
  }
  return cards;
}
