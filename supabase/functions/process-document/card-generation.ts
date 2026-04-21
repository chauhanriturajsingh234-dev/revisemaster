export type GeneratedDeck = {
  name: string;
  description: string;
  cards: { front: string; back: string }[];
};

type RequestChunkCards = (input: {
  chunk: string;
  filename: string;
  maxItems: number;
}) => Promise<GeneratedDeck>;

const MAX_SOURCE_TEXT = 600_000;
const MIN_DECK_CARDS = 40;
const MAX_DECK_CARDS = 200;
const CHUNK_TARGET_CHARS = 70_000;
const CHUNK_OVERLAP_CHARS = 4_000;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeSourceText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_SOURCE_TEXT);
}

function splitTextIntoChunks(text: string) {
  const normalized = normalizeSourceText(text);
  if (normalized.length <= CHUNK_TARGET_CHARS) return [normalized];

  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    const windowEnd = Math.min(start + CHUNK_TARGET_CHARS, normalized.length);
    let end = windowEnd;

    if (windowEnd < normalized.length) {
      const slice = normalized.slice(start, windowEnd);
      const breakpoints = [slice.lastIndexOf("\n\n"), slice.lastIndexOf(". "), slice.lastIndexOf("\n")];
      const bestBreakpoint = Math.max(...breakpoints);
      if (bestBreakpoint > CHUNK_TARGET_CHARS * 0.55) {
        end = start + bestBreakpoint + (slice[bestBreakpoint] === "." ? 1 : 0);
      }
    }

    const chunk = normalized.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= normalized.length) break;
    start = Math.max(end - CHUNK_OVERLAP_CHARS, start + 1);
  }

  return chunks;
}

function estimateDeckSize(textLength: number) {
  return clamp(Math.ceil(textLength / 1_500), MIN_DECK_CARDS, MAX_DECK_CARDS);
}

function distributeTargets(totalCards: number, chunks: string[]) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0) || 1;

  return chunks.map((chunk, index) => {
    const proportional = Math.round((chunk.length / totalLength) * totalCards);
    const floor = chunks.length === 1 ? totalCards : 12;
    const remainingChunks = chunks.length - index - 1;
    const assignedSoFar = chunks
      .slice(0, index)
      .reduce((sum, _, i) => sum + Math.max(12, Math.round((chunks[i].length / totalLength) * totalCards)), 0);
    const remainingBudget = Math.max(totalCards - assignedSoFar, floor * remainingChunks);

    return clamp(proportional || floor, floor, Math.min(90, remainingBudget));
  });
}

function normalizeCardKey(card: { front: string; back: string }) {
  return `${card.front.replace(/\s+/g, " ").trim().toLowerCase()}::${card.back
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()}`;
}

function sanitizeDeck(result: GeneratedDeck): GeneratedDeck {
  return {
    name: result.name.trim().slice(0, 100) || "Study Deck",
    description: result.description.trim().slice(0, 500) || "Generated from uploaded document.",
    cards: result.cards
      .map((card) => ({
        front: card.front.trim().slice(0, 1000),
        back: card.back.trim().slice(0, 2000),
      }))
      .filter((card) => card.front.length > 0 && card.back.length > 0),
  };
}

function dedupeCards(cards: { front: string; back: string }[]) {
  const seen = new Set<string>();
  const unique: { front: string; back: string }[] = [];

  for (const card of cards) {
    const key = normalizeCardKey(card);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(card);
  }

  return unique;
}

export async function generateDeckFromDocumentText(input: {
  text: string;
  filename: string;
  requestChunkCards: RequestChunkCards;
}): Promise<GeneratedDeck> {
  const chunks = splitTextIntoChunks(input.text);
  const requestedTotal = estimateDeckSize(input.text.length);
  const chunkTargets = distributeTargets(requestedTotal, chunks);

  const results: GeneratedDeck[] = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const result = await input.requestChunkCards({
      chunk: chunks[index],
      filename: input.filename,
      maxItems: chunkTargets[index],
    });
    results.push(sanitizeDeck(result));
  }

  const primary = results.find((result) => result.cards.length > 0) ?? {
    name: "Study Deck",
    description: "Generated from uploaded document.",
    cards: [],
  };

  const cards = dedupeCards(results.flatMap((result) => result.cards)).slice(0, MAX_DECK_CARDS);

  return {
    name: primary.name,
    description: primary.description,
    cards,
  };
}