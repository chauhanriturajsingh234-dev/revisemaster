import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_due_cards",
  title: "List due cards",
  description: "List the signed-in user's cards that are due for review right now, across all decks.",
  inputSchema: {
    limit: z.number().int().min(1).max(500).optional().describe("Max cards (default 50)."),
    deck_id: z.string().uuid().optional().describe("Optional deck filter."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, deck_id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let q = supabase
      .from("cards")
      .select("id, deck_id, front, back, due_at, reps")
      .lte("due_at", new Date().toISOString())
      .order("due_at", { ascending: true })
      .limit(limit ?? 50);
    if (deck_id) q = q.eq("deck_id", deck_id);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { cards: data ?? [] },
    };
  },
});
