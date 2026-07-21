import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "add_cards",
  title: "Add cards to deck",
  description: "Append flashcards to an existing deck owned by the signed-in user.",
  inputSchema: {
    deck_id: z.string().uuid().describe("Target deck UUID."),
    cards: z
      .array(
        z.object({
          front: z.string().trim().min(1).max(1000),
          back: z.string().trim().min(1).max(2000),
        }),
      )
      .min(1)
      .max(500),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ deck_id, cards }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const userId = ctx.getUserId();
    if (!userId) return { content: [{ type: "text", text: "Missing user" }], isError: true };
    const supabase = supabaseForUser(ctx);

    // Ensure deck belongs to user (RLS enforces this too).
    const { data: deck, error: deckErr } = await supabase
      .from("decks")
      .select("id")
      .eq("id", deck_id)
      .maybeSingle();
    if (deckErr) return { content: [{ type: "text", text: deckErr.message }], isError: true };
    if (!deck) return { content: [{ type: "text", text: "Deck not found" }], isError: true };

    const rows = cards.map((c) => ({ deck_id, user_id: userId, front: c.front, back: c.back }));
    const { error } = await supabase.from("cards").insert(rows);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const payload = { deck_id, cards_added: rows.length };
    return {
      content: [{ type: "text", text: JSON.stringify(payload) }],
      structuredContent: payload,
    };
  },
});
