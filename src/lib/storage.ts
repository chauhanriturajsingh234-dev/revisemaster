export type Card = {
  id: string;
  front: string;
  back: string;
  // SM-2 lite
  ease: number; // ~2.5
  interval: number; // days
  reps: number;
  due: number; // timestamp ms
};

export type Deck = {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  cards: Card[];
};

const KEY = "revisemaster.decks.v1";

export function loadDecks(): Deck[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seedDecks();
    return JSON.parse(raw) as Deck[];
  } catch {
    return [];
  }
}

export function saveDecks(decks: Deck[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(decks));
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function newCard(front: string, back: string): Card {
  return {
    id: uid(),
    front,
    back,
    ease: 2.5,
    interval: 0,
    reps: 0,
    due: Date.now(),
  };
}

export type Grade = "again" | "hard" | "good" | "easy";

export function scheduleCard(card: Card, grade: Grade): Card {
  let { ease, interval, reps } = card;
  const day = 86_400_000;

  if (grade === "again") {
    reps = 0;
    interval = 0;
    ease = Math.max(1.3, ease - 0.2);
    return { ...card, ease, interval, reps, due: Date.now() + 60_000 * 5 };
  }

  reps += 1;
  if (grade === "hard") {
    ease = Math.max(1.3, ease - 0.15);
    interval = reps === 1 ? 1 : Math.round(interval * 1.2);
  } else if (grade === "good") {
    interval = reps === 1 ? 1 : reps === 2 ? 3 : Math.round(interval * ease);
  } else {
    ease = ease + 0.15;
    interval = reps === 1 ? 2 : reps === 2 ? 5 : Math.round(interval * ease * 1.3);
  }

  return { ...card, ease, interval, reps, due: Date.now() + interval * day };
}

export function dueCount(deck: Deck) {
  const now = Date.now();
  return deck.cards.filter((c) => c.due <= now).length;
}

function seedDecks(): Deck[] {
  const decks: Deck[] = [
    {
      id: uid(),
      name: "Cellular Biology",
      description: "Organelles, membranes, and cell cycle essentials.",
      createdAt: Date.now(),
      cards: [
        newCard("What organelle generates most ATP?", "The mitochondrion."),
        newCard("Function of the rough ER?", "Synthesizes proteins via attached ribosomes."),
        newCard("What phase precedes mitosis?", "G2 of interphase."),
      ],
    },
    {
      id: uid(),
      name: "French Vocabulary",
      description: "Everyday phrases and tricky verbs.",
      createdAt: Date.now(),
      cards: [
        newCard("‘however’ in French", "cependant / toutefois"),
        newCard("Conjugate ‘aller’ — nous", "nous allons"),
      ],
    },
  ];
  saveDecks(decks);
  return decks;
}
