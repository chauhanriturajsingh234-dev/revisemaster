import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listDecks from "./tools/list-decks";
import getDeck from "./tools/get-deck";
import createDeck from "./tools/create-deck";
import addCards from "./tools/add-cards";
import listDue from "./tools/list-due";

// Use the direct Supabase host as OAuth issuer. The .lovable.cloud proxy
// publishes the direct supabase.co form in its discovery doc, so tokens
// wouldn't verify otherwise.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "revisemaster-mcp",
  title: "ReviseMaster",
  version: "0.1.0",
  instructions:
    "Tools for ReviseMaster flashcards. Each caller acts as their signed-in ReviseMaster user; tools read and write only that user's decks and cards. Use `list_decks` to browse, `get_deck` to inspect one, `create_deck` and `add_cards` to build new content, and `list_due_cards` to find what needs reviewing.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listDecks, getDeck, createDeck, addCards, listDue],
});
