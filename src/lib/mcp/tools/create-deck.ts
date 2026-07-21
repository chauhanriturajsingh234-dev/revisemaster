import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_deck",
  title: "Create deck",
  description:
    "Create a new flashcard deck for the signed-in user, optionally with initial cards (front/back pairs).",
  inputSchema: {
    name: z.string().trim().min(1).max(100).describe("Deck name."),
    description: z.string().trim().max(500).optional().describe("Optional deck description."),
    cards: z
      .array(
        z.object({
          front: z.string().trim().min(1).max(1000),
          back: z.string().trim().min(1).max(2000),
        }),
      )
      .max(500)
      .optional()
      .describe("Optional initial cards."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ name, description, cards }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const userId = ctx.getUserId();
    if (!userId) return { content: [{ type: "text", text: "Missing user" }], isError: true };
    const supabase = supabaseForUser(ctx);

    const { data: deck, error: deckErr } = await supabase
      .from("decks")
      .insert({ user_id: userId, name, description: description ?? "" })
      .select("id, name, description")
      .single();
    if (deckErr || !deck) {
      return { content: [{ type: "text", text: deckErr?.message ?? "Create failed" }], isError: true };
    }

    let inserted = 0;
    if (cards && cards.length) {
      const rows = cards.map((c) => ({
        deck_id: deck.id,
        user_id: userId,
        front: c.front,
        back: c.back,
      }));
      const { error: cardErr } = await supabase.from("cards").insert(rows);
      if (cardErr) return { content: [{ type: "text", text: cardErr.message }], isError: true };
      inserted = rows.length;
    }

    const payload = { deck, cards_added: inserted };
    return {
      content: [{ type: "text", text: JSON.stringify(payload) }],
      structuredContent: payload,
    };
  },
});
