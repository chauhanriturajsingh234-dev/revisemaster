// Rule-based flashcard generator. No AI required.
// Produces cards from headings, bullet lists, definitions, and Q/A patterns
// so documents always yield a usable deck even when AI is unavailable.
import type { GeneratedDeck } from "./card-generation.ts";

const STOP_WORDS = new Set([
  "the","a","an","and","or","but","of","in","on","at","to","for","with","by",
  "is","are","was","were","be","been","being","this","that","these","those",
  "it","its","as","from","into","than","then","so","such","also","which",
  "who","whom","whose","what","when","where","why","how","not","no","yes",
]);

function clean(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function isLikelyHeading(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (t.length > 120) return false;
  if (/[.!?:]$/.test(t) && !/:$/.test(t)) return false;
  // Markdown / numbered / ALL CAPS headings
  if (/^#{1,6}\s+/.test(t)) return true;
  if (/^(chapter|section|part|unit|module|lesson)\s+[\divxlcm]+/i.test(t)) return true;
  if (/^\d+(\.\d+)*\s+[A-Z]/.test(t)) return true;
  const letters = t.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 4 && letters === letters.toUpperCase()) return true;
  // Title Case short line ending with colon
  if (/:$/.test(t) && t.split(" ").length <= 12) return true;
  return false;
}

function stripHeadingMarkers(line: string): string {
  return clean(line.replace(/^#{1,6}\s+/, "").replace(/[:：]\s*$/, ""));
}

function isBullet(line: string): boolean {
  return /^\s*([-*•·●○◦]|[\dA-Za-z][.)])\s+/.test(line);
}

function stripBulletMarker(line: string): string {
  return clean(line.replace(/^\s*([-*•·●○◦]|[\dA-Za-z][.)])\s+/, ""));
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'\(])/)
    .map(clean)
    .filter((s) => s.length > 0);
}

function extractKeyword(sentence: string): string | null {
  const s = sentence.replace(/[(),;:"'`]/g, " ");
  const tokens = s.split(/\s+/).filter(Boolean);
  // Prefer a capitalized phrase (not at start) — likely a proper noun / term.
  for (let i = 1; i < tokens.length; i += 1) {
    const w = tokens[i];
    if (/^[A-Z][A-Za-z0-9-]{2,}$/.test(w)) return w;
  }
  // Otherwise the longest non-stopword token.
  const candidates = tokens
    .map((t) => t.replace(/[^A-Za-z0-9-]/g, ""))
    .filter((t) => t.length >= 4 && !STOP_WORDS.has(t.toLowerCase()));
  if (!candidates.length) return null;
  return candidates.sort((a, b) => b.length - a.length)[0];
}

type Card = { front: string; back: string };

function pushUnique(cards: Card[], seen: Set<string>, card: Card) {
  const front = clean(card.front);
  const back = clean(card.back);
  if (front.length < 4 || back.length < 4) return;
  if (front.length > 500 || back.length > 1500) return;
  const key = `${front.toLowerCase()}::${back.toLowerCase().slice(0, 80)}`;
  if (seen.has(key)) return;
  seen.add(key);
  cards.push({ front, back });
}

// Pattern 1: "Term: definition" or "Term — definition"
function definitionCard(line: string): Card | null {
  const m = line.match(/^([A-Z][^:—–\-]{1,80})\s*[:—–-]\s+(.{15,})$/);
  if (!m) return null;
  const term = clean(m[1]);
  const def = clean(m[2]);
  if (term.split(" ").length > 10) return null;
  return { front: `What is ${term}?`, back: def };
}

// Pattern 2: "X is/are/means/refers to Y"
function isStatementCard(sentence: string): Card | null {
  const m = sentence.match(/^([A-Z][\w\s\-]{2,60}?)\s+(is|are|means|refers to|consists of|denotes|describes)\s+(.+)$/);
  if (!m) return null;
  const subject = clean(m[1]);
  if (subject.split(" ").length > 8) return null;
  return { front: `What ${m[2] === "are" ? "are" : "is"} ${subject}?`, back: clean(sentence) };
}

// Pattern 3: cloze deletion using a key term
function clozeCard(sentence: string): Card | null {
  if (sentence.length < 40 || sentence.length > 280) return null;
  const keyword = extractKeyword(sentence);
  if (!keyword) return null;
  const re = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
  const blanked = sentence.replace(re, "______");
  if (blanked === sentence) return null;
  return { front: `Fill in the blank: ${blanked}`, back: keyword };
}

// Pattern 4: heading + following bullet/sentence list
function headingGroupCard(heading: string, items: string[]): Card | null {
  const term = stripHeadingMarkers(heading);
  if (!term || term.length < 3) return null;
  const cleaned = items.map(clean).filter((s) => s.length > 0).slice(0, 8);
  if (cleaned.length < 1) return null;
  const back = cleaned.map((s) => `• ${s}`).join("\n");
  return { front: `Key points about ${term}:`, back };
}

export function generateRuleBasedDeck(input: { text: string; filename: string }): GeneratedDeck {
  const text = input.text.replace(/\r\n/g, "\n");
  const lines = text.split("\n").map((l) => l.replace(/\s+$/g, ""));
  const cards: Card[] = [];
  const seen = new Set<string>();

  // --- Pass 1: heading + bullet groups
  let currentHeading: string | null = null;
  let currentItems: string[] = [];
  const flushGroup = () => {
    if (currentHeading && currentItems.length) {
      const card = headingGroupCard(currentHeading, currentItems);
      if (card) pushUnique(cards, seen, card);
      // Also create individual cards for each rich bullet
      for (const item of currentItems) {
        const trimmed = clean(item);
        if (trimmed.length >= 25 && currentHeading) {
          pushUnique(cards, seen, {
            front: `Regarding ${stripHeadingMarkers(currentHeading)}, what is meant by: "${trimmed.slice(0, 80)}${trimmed.length > 80 ? "…" : ""}"?`,
            back: trimmed,
          });
        }
      }
    }
    currentHeading = null;
    currentItems = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushGroup();
      continue;
    }
    if (isLikelyHeading(line)) {
      flushGroup();
      currentHeading = line;
      continue;
    }
    if (isBullet(line) && currentHeading) {
      currentItems.push(stripBulletMarker(line));
      continue;
    }
    // Bullet without heading → still mineable
    if (isBullet(line)) {
      const stripped = stripBulletMarker(line);
      const def = definitionCard(stripped);
      if (def) pushUnique(cards, seen, def);
    }
  }
  flushGroup();

  // --- Pass 2: line-level definitions
  for (const raw of lines) {
    const line = clean(raw);
    if (!line) continue;
    const def = definitionCard(line);
    if (def) pushUnique(cards, seen, def);
  }

  // --- Pass 3: sentence-level patterns
  const paragraph = clean(text.replace(/\n+/g, " "));
  const sentences = splitSentences(paragraph).slice(0, 600);
  for (const s of sentences) {
    if (cards.length >= 80) break;
    const isCard = isStatementCard(s);
    if (isCard) {
      pushUnique(cards, seen, isCard);
      continue;
    }
    const cz = clozeCard(s);
    if (cz) pushUnique(cards, seen, cz);
  }

  // Cap deck size
  const finalCards = cards.slice(0, 80);

  // Build deck name from filename
  const baseName = input.filename
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const niceName = (baseName || "Study Deck").slice(0, 60);

  return {
    name: `${niceName} (Quick cards)`.slice(0, 100),
    description:
      "Auto-generated without AI from headings, lists, and definitions in your document. Edit, delete, or regenerate with AI when credits are available.",
    cards: finalCards,
  };
}
