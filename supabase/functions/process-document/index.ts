// Process an uploaded document: extract text, ask Lovable AI for flashcards,
// create a deck + cards. Authenticated via JWT (verify_jwt = true).
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import * as mammoth from "https://esm.sh/mammoth@1.8.0";
import { extractText as extractPdfText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";
import { generateDeckFromDocumentText, type GeneratedDeck } from "./card-generation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_TEXT = 600_000;
const MIN_TEXT_QUALITY = 200; // chars; below this we treat the PDF as scanned
const AI_MAX_OUTPUT_TOKENS = 32_768;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function ocrPdfWithVision(bytes: Uint8Array): Promise<string> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
  const b64 = bytesToBase64(bytes);
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Transcribe ALL readable text, formulas, and notes from this PDF. Preserve structure (headings, lists, equations). Output plain text only." },
            { type: "image_url", image_url: { url: `data:application/pdf;base64,${b64}` } },
          ],
        },
      ],
    }),
  });
  if (res.status === 429) throw new Error("AI rate limit reached. Please wait a moment.");
  if (res.status === 402) throw new Error("AI credits exhausted. Add credits in workspace settings.");
  if (!res.ok) throw new Error(`Vision OCR error: ${res.status}`);
  const data = await res.json();
  return (data.choices?.[0]?.message?.content ?? "").slice(0, MAX_TEXT);
}

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
    let nativeText = "";
    try {
      const pdf = await getDocumentProxy(bytes);
      const { text } = await extractPdfText(pdf, { mergePages: true });
      nativeText = (Array.isArray(text) ? text.join("\n\n") : text) ?? "";
    } catch (e) {
      console.warn("Native PDF extract failed:", e instanceof Error ? e.message : e);
    }
    const cleaned = nativeText.replace(/\s+/g, " ").trim();
    if (cleaned.length >= MIN_TEXT_QUALITY) {
      return nativeText.slice(0, MAX_TEXT);
    }
    console.log(`Native extraction weak (${cleaned.length} chars). Falling back to vision OCR.`);
    const ocr = await ocrPdfWithVision(bytes);
    if (ocr.trim().length < 50) throw new Error("Could not extract readable text from PDF.");
    return ocr;
  }
  throw new Error("Unsupported file type");
}

async function requestChunkCards(input: {
  chunk: string;
  filename: string;
  maxItems: number;
  minItems: number;
  chunkIndex: number;
  totalChunks: number;
  retryHint?: string;
}): Promise<GeneratedDeck> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content:
            "You generate concise, high-quality study flashcards using active-recall principles. Front = a focused question. Back = a precise, complete answer FOLLOWED BY a fun memory aid on a new line prefixed with '🧠 Mnemonic: '. \n\nMNEMONIC STYLE — IMPORTANT: Write mnemonics in playful Hinglish (a natural blend of Hindi + English, written in Roman/English script — e.g. 'Yaad rakho: Mango = Aam, aur aam aadmi sabko pasand!'). Use Bollywood references, desi pop-culture, cricket, chai/samosa analogies, funny rhymes, tapori-style wordplay, or catchy filmi dialogues when they fit. Keep them short, vivid, and genuinely memorable — not cringe or forced. Hindi words should be in Roman script (no Devanagari) so everyone can read them. If a fact is trivially memorable, skip the mnemonic line. \n\nCoverage rules: prioritise key concepts, definitions, dates, names, places, processes, formulas, schemes, tables, lists, examples, comparisons, classifications, and relationships. Sweep the entire supplied chunk from top to bottom, including later sections and dense list/table content. Do not stop early after the obvious headings. Prefer many specific cards over a short summary sample.",
        },
        {
          role: "user",
          content: `Source: ${input.filename}\nChunk ${input.chunkIndex + 1} of ${input.totalChunks}\n\nThis is one chunk from a longer document. Generate between ${input.minItems} and ${input.maxItems} high-quality flashcards from this chunk alone, covering all important facts, definitions, dates, names, places, formulas, schemes, tables, classifications, examples, and concepts present here. Avoid duplicates, filler, and vague cards. Also propose a short deck name (3-6 words) and one-sentence description that fit the overall subject.${input.retryHint ? `\n\nRetry instruction: ${input.retryHint}` : ""}\n\n---\n${input.chunk}`,
        },
      ],
      max_tokens: AI_MAX_OUTPUT_TOKENS,
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
                  minItems: 8,
                  maxItems: 120,
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
  return JSON.parse(call.function.arguments) as GeneratedDeck;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const admin = createClient(supabaseUrl, serviceKey);

  let documentId = "";
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) throw new Error("Not authenticated");

    // Validate token via admin client (handles ES256/asymmetric JWTs correctly)
    const { data: { user }, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !user) throw new Error("Not authenticated");

    const body = await req.json();
    documentId = String(body.documentId ?? "");
    if (!documentId) throw new Error("documentId required");

    // Read doc with admin client, scoped by user_id for ownership
    const { data: doc, error: docErr } = await admin
      .from("documents")
      .select("id, user_id, filename, storage_path, mime_type")
      .eq("id", documentId)
      .eq("user_id", user.id)
      .single();
    if (docErr || !doc) throw new Error("Document not found");

    await admin.from("documents").update({ status: "processing", error: null }).eq("id", documentId);

    // Download file
    const { data: file, error: dlErr } = await admin.storage.from("documents").download(doc.storage_path);
    if (dlErr || !file) throw new Error(dlErr?.message ?? "Download failed");
    const bytes = new Uint8Array(await file.arrayBuffer());

    const text = await extractText(bytes, doc.mime_type, doc.filename);
    if (text.trim().length < 50) throw new Error("Document has too little text to generate cards.");

    const generated = await generateDeckFromDocumentText({
      text,
      filename: doc.filename,
      requestChunkCards: (chunkInput) => requestChunkCards(chunkInput),
    });

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
    const rows = generated.cards.map((c) => ({
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
