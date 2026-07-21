import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_deck",
  title: "Get deck with cards",
  description: "Fetch a single deck and its flashcards by deck id.",
  inputSchema: {
    deck_id: z.string().uuid().describe("Deck UUID."),
    cards_limit: z.number().int().min(1).max(1000).optional().describe("Max cards (default 200)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ deck_id, cards_limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data: deck, error: deckErr } = await supabase
      .from("decks")
      .select("id, name, description, created_at")
      .eq("id", deck_id)
      .maybeSingle();
    if (deckErr) return { content: [{ type: "text", text: deckErr.message }], isError: true };
    if (!deck) return { content: [{ type: "text", text: "Deck not found" }], isError: true };

    const { data: cards, error: cardsErr } = await supabase
      .from("cards")
      .select("id, front, back, due_at, reps, interval_days")
      .eq("deck_id", deck_id)
      .order("created_at", { ascending: true })
      .limit(cards_limit ?? 200);
    if (cardsErr) return { content: [{ type: "text", text: cardsErr.message }], isError: true };

    const payload = { deck, cards: cards ?? [] };
    return {
      content: [{ type: "text", text: JSON.stringify(payload) }],
      structuredContent: payload,
    };
  },
});
