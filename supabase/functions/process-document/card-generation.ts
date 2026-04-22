export type GeneratedDeck = {
  name: string;
  description: string;
  cards: { front: string; back: string }[];
};

type RequestChunkCards = (input: {
  chunk: string;
  filename: string;
  maxItems: number;
  minItems: number;
  chunkIndex: number;
  totalChunks: number;
  retryHint?: string;
}) => Promise<GeneratedDeck>;

const MAX_SOURCE_TEXT = 600_000;
const MIN_DECK_CARDS = 60;
const MAX_DECK_CARDS = 400;
const CHUNK_TARGET_CHARS = 45_000;
const CHUNK_OVERLAP_CHARS = 3_000;
const MAX_CHUNK_CARDS = 80;

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
      if (bestBreakpoint > CHUNK_TARGET_CHARS * 0.5) {
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
  return clamp(Math.ceil(textLength / 900), MIN_DECK_CARDS, MAX_DECK_CARDS);
}

function distributeTargets(totalCards: number, chunks: string[]) {
  if (chunks.length === 0) return [];
  if (chunks.length === 1) return [totalCards];

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0) || 1;
  const minimumPerChunk = clamp(Math.floor(totalCards / chunks.length), 6, 16);
  const targets = chunks.map(() => minimumPerChunk);
  let remaining = Math.max(totalCards - minimumPerChunk * chunks.length, 0);

  const weightedExtras = chunks.map((chunk) => (chunk.length / totalLength) * remaining);
  for (let index = 0; index < weightedExtras.length; index += 1) {
    const whole = Math.min(MAX_CHUNK_CARDS - targets[index], Math.floor(weightedExtras[index]));
    targets[index] += whole;
    remaining -= whole;
  }

  if (remaining > 0) {
    const order = weightedExtras
      .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
      .sort((a, b) => b.fraction - a.fraction);

    for (const item of order) {
      if (remaining <= 0) break;
      if (targets[item.index] >= MAX_CHUNK_CARDS) continue;
      targets[item.index] += 1;
      remaining -= 1;
    }
  }

  return targets;
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

function minimumAcceptableCards(target: number) {
  return clamp(Math.ceil(target * 0.65), 8, target);
}

function mergeDeckResults(primary: GeneratedDeck, secondary: GeneratedDeck): GeneratedDeck {
  const cards = dedupeCards([...primary.cards, ...secondary.cards]);
  const preferred = secondary.cards.length > primary.cards.length ? secondary : primary;

  return {
    name: primary.name || secondary.name || preferred.name,
    description: primary.description || secondary.description || preferred.description,
    cards,
  };
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
    const maxItems = chunkTargets[index];
    const minItems = minimumAcceptableCards(maxItems);

    const firstPass = sanitizeDeck(
      await input.requestChunkCards({
        chunk: chunks[index],
        filename: input.filename,
        maxItems,
        minItems,
        chunkIndex: index,
        totalChunks: chunks.length,
      }),
    );

    if (firstPass.cards.length >= minItems || chunks[index].length < 1_200) {
      results.push(firstPass);
      continue;
    }

    const retryPass = sanitizeDeck(
      await input.requestChunkCards({
        chunk: chunks[index],
        filename: input.filename,
        maxItems,
        minItems,
        chunkIndex: index,
        totalChunks: chunks.length,
        retryHint: `Previous pass returned only ${firstPass.cards.length} cards out of the requested ${maxItems}. Add overlooked facts, formulas, tables, examples, section-end details, and list items from this chunk.`,
      }),
    );

    results.push(mergeDeckResults(firstPass, retryPass));
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