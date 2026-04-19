import { supabase } from "@/integrations/supabase/client";

export type Card = {
  id: string;
  deck_id: string;
  front: string;
  back: string;
  ease: number;
  interval_days: number;
  reps: number;
  due_at: string; // ISO
};

export type Deck = {
  id: string;
  name: string;
  description: string;
  created_at: string;
  source_document_id: string | null;
};

export type DeckWithStats = Deck & { cardCount: number; dueCount: number };

export type Grade = "again" | "hard" | "good" | "easy";

// ---------- Decks ----------
export async function listDecks(): Promise<DeckWithStats[]> {
  const { data: decks, error } = await supabase
    .from("decks")
    .select("id, name, description, created_at, source_document_id")
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!decks?.length) return [];

  const { data: cards } = await supabase
    .from("cards")
    .select("deck_id, due_at")
    .in("deck_id", decks.map((d) => d.id));

  const nowISO = new Date().toISOString();
  return decks.map((d) => {
    const cs = (cards ?? []).filter((c) => c.deck_id === d.id);
    return {
      ...d,
      cardCount: cs.length,
      dueCount: cs.filter((c) => c.due_at <= nowISO).length,
    };
  });
}

export async function getDeck(deckId: string): Promise<Deck | null> {
  const { data, error } = await supabase
    .from("decks")
    .select("id, name, description, created_at, source_document_id")
    .eq("id", deckId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createDeck(input: { name: string; description?: string }): Promise<Deck> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("decks")
    .insert({ user_id: u.user.id, name: input.name, description: input.description ?? "" })
    .select("id, name, description, created_at, source_document_id")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteDeck(deckId: string) {
  const { error } = await supabase.from("decks").delete().eq("id", deckId);
  if (error) throw error;
}

// ---------- Cards ----------
export async function listCards(deckId: string): Promise<Card[]> {
  const { data, error } = await supabase
    .from("cards")
    .select("id, deck_id, front, back, ease, interval_days, reps, due_at")
    .eq("deck_id", deckId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createCard(deckId: string, front: string, back: string): Promise<Card> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("cards")
    .insert({ deck_id: deckId, user_id: u.user.id, front, back })
    .select("id, deck_id, front, back, ease, interval_days, reps, due_at")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCard(cardId: string) {
  const { error } = await supabase.from("cards").delete().eq("id", cardId);
  if (error) throw error;
}

// ---------- SM-2 lite ----------
export function nextSchedule(card: Card, grade: Grade): Pick<Card, "ease" | "interval_days" | "reps" | "due_at"> {
  let { ease, interval_days, reps } = card;
  const day = 86_400_000;

  if (grade === "again") {
    return {
      ease: Math.max(1.3, ease - 0.2),
      interval_days: 0,
      reps: 0,
      due_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    };
  }

  reps += 1;
  if (grade === "hard") {
    ease = Math.max(1.3, ease - 0.15);
    interval_days = reps === 1 ? 1 : Math.round(interval_days * 1.2);
  } else if (grade === "good") {
    interval_days = reps === 1 ? 1 : reps === 2 ? 3 : Math.round(interval_days * ease);
  } else {
    ease = ease + 0.15;
    interval_days = reps === 1 ? 2 : reps === 2 ? 5 : Math.round(interval_days * ease * 1.3);
  }

  return {
    ease,
    interval_days,
    reps,
    due_at: new Date(Date.now() + interval_days * day).toISOString(),
  };
}

export async function gradeCard(card: Card, grade: Grade): Promise<Card> {
  const next = nextSchedule(card, grade);
  const { data, error } = await supabase
    .from("cards")
    .update(next)
    .eq("id", card.id)
    .select("id, deck_id, front, back, ease, interval_days, reps, due_at")
    .single();
  if (error) throw error;
  return data;
}
