// Process an uploaded document: extract text, ask Lovable AI for flashcards,
// create a deck + cards. Authenticated via JWT (verify_jwt = true).
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import * as mammoth from "https://esm.sh/mammoth@1.8.0";
import { getDocument, GlobalWorkerOptions } from "https://esm.sh/pdfjs-dist@4.0.379/legacy/build/pdf.mjs";

// pdfjs in Deno: disable worker
(GlobalWorkerOptions as any).workerSrc = "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_TEXT = 60_000;

async function extractText(bytes: Uint8Array, mime: string, name: string): Promise<string> {
  const lower = name.toLowerCase();
  if (mime === "text/plain" || lower.endsWith(".txt")) {
    return new TextDecoder().decode(bytes);
  }
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || lower.endsWith(".docx")) {
    const result = await mammoth.extractRawText({ arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
    return result.value || "";
  }
  if (mime === "application/pdf" || lower.endsWith(".pdf")) {
    const pdf = await getDocument({ data: bytes, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;
    let out = "";
    const pages = Math.min(pdf.numPages, 50);
    for (let i = 1; i <= pages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      out += content.items.map((it: any) => it.str).join(" ") + "\n\n";
      if (out.length > MAX_TEXT) break;
    }
    return out;
  }
  throw new Error("Unsupported file type");
}

async function generateCards(text: string, filename: string) {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const trimmed = text.slice(0, MAX_TEXT);

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content:
            "You generate concise, high-quality study flashcards using active-recall principles. Front = a focused question. Back = a precise, complete answer. Avoid trivia; prioritise key concepts, definitions, and relationships.",
        },
        {
          role: "user",
          content: `Source: ${filename}\n\nGenerate 10-15 flashcards covering the most important ideas in the following notes. Also propose a short deck name (3-6 words) and one-sentence description.\n\n---\n${trimmed}`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "create_deck",
            description: "Create a flashcard deck",
            parameters: {
              type: "object",
              properties: {
                name: { type: "string" },
                description: { type: "string" },
                cards: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { front: { type: "string" }, back: { type: "string" } },
                    required: ["front", "back"],
                    additionalProperties: false,
                  },
                  minItems: 5,
                  maxItems: 20,
                },
              },
              required: ["name", "description", "cards"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "create_deck" } },
    }),
  });

  if (res.status === 429) throw new Error("AI rate limit reached. Please wait a moment.");
  if (res.status === 402) throw new Error("AI credits exhausted. Add credits in workspace settings.");
  if (!res.ok) throw new Error(`AI gateway error: ${res.status}`);

  const data = await res.json();
  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error("AI did not return flashcards");
  return JSON.parse(call.function.arguments) as {
    name: string;
    description: string;
    cards: { front: string; back: string }[];
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Authed client (RLS as user) for permission check
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const admin = createClient(supabaseUrl, serviceKey);

  let documentId = "";
  try {
    const body = await req.json();
    documentId = String(body.documentId ?? "");
    if (!documentId) throw new Error("documentId required");

    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) throw new Error("Not authenticated");

    // Read doc as user (RLS enforces ownership)
    const { data: doc, error: docErr } = await userClient
      .from("documents")
      .select("id, user_id, filename, storage_path, mime_type")
      .eq("id", documentId)
      .single();
    if (docErr || !doc) throw new Error("Document not found");

    await admin.from("documents").update({ status: "processing", error: null }).eq("id", documentId);

    // Download file
    const { data: file, error: dlErr } = await admin.storage.from("documents").download(doc.storage_path);
    if (dlErr || !file) throw new Error(dlErr?.message ?? "Download failed");
    const bytes = new Uint8Array(await file.arrayBuffer());

    const text = await extractText(bytes, doc.mime_type, doc.filename);
    if (text.trim().length < 50) throw new Error("Document has too little text to generate cards.");

    const generated = await generateCards(text, doc.filename);

    // Create deck
    const { data: deck, error: deckErr } = await admin
      .from("decks")
      .insert({
        user_id: user.id,
        name: generated.name.slice(0, 100),
        description: generated.description.slice(0, 500),
        source_document_id: documentId,
      })
      .select("id")
      .single();
    if (deckErr || !deck) throw new Error(deckErr?.message ?? "Failed to create deck");

    // Insert cards
    const rows = generated.cards.slice(0, 20).map((c) => ({
      deck_id: deck.id,
      user_id: user.id,
      front: c.front.slice(0, 1000),
      back: c.back.slice(0, 2000),
    }));
    if (rows.length) {
      const { error: cardErr } = await admin.from("cards").insert(rows);
      if (cardErr) throw new Error(cardErr.message);
    }

    await admin.from("documents").update({ status: "ready", deck_id: deck.id }).eq("id", documentId);

    return new Response(JSON.stringify({ ok: true, deckId: deck.id, cards: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("process-document error:", msg);
    if (documentId) {
      await admin.from("documents").update({ status: "failed", error: msg }).eq("id", documentId);
    }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
