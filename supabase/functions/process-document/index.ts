// Process an uploaded document: extract text, ask Lovable AI for flashcards,
// create a deck + cards. Authenticated via JWT (verify_jwt = true).
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import * as mammoth from "https://esm.sh/mammoth@1.8.0";
import { extractText as extractPdfText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";
import { generateDeckFromDocumentText, type GeneratedDeck } from "./card-generation.ts";
import { generateRuleBasedDeck } from "./rule-based-cards.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_TEXT = 600_000;
const MIN_TEXT_QUALITY = 400; // chars across whole doc; below this trigger full OCR
const MIN_PAGE_CHARS = 120; // per-page threshold; sparse pages get OCR'd individually
const AI_MAX_OUTPUT_TOKENS = 32_768;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function ocrPdfWithVision(bytes: Uint8Array, hint?: string): Promise<string> {
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
            {
              type: "text",
              text:
                (hint ? `${hint}\n\n` : "") +
                "Transcribe ALL readable text, formulas, equations, tables, captions, headers, footers, and handwritten notes from this PDF. Preserve the original reading order and structure (headings, bullet lists, numbered lists, table rows). For tables, output rows as pipe-separated values. Do NOT summarize, paraphrase, or skip any content — output the full verbatim text only, in plain text.",
            },
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
    const docxBuffer = new Uint8Array(bytes).slice().buffer as ArrayBuffer;
    const result = await mammoth.extractRawText({ arrayBuffer: docxBuffer });
    return result.value || "";
  }
  if (mime === "application/pdf" || lower.endsWith(".pdf")) {
    // Try native per-page extraction first so we can detect sparse/scanned pages.
    let pageTexts: string[] = [];
    let totalPages = 0;
    try {
      const pdf = await getDocumentProxy(bytes);
      totalPages = pdf.numPages ?? 0;
      const { text } = await extractPdfText(pdf, { mergePages: false });
      pageTexts = Array.isArray(text) ? text : (text ? [text] : []);
    } catch (e) {
      console.warn("Native PDF extract failed:", e instanceof Error ? e.message : e);
    }

    const cleanedJoined = pageTexts.join("\n\n").replace(/\s+/g, " ").trim();
    const sparsePageCount = pageTexts.filter((p) => (p ?? "").replace(/\s+/g, " ").trim().length < MIN_PAGE_CHARS).length;
    const sparseRatio = pageTexts.length ? sparsePageCount / pageTexts.length : 1;

    // Whole document is too thin OR most pages are sparse → full vision OCR.
    if (cleanedJoined.length < MIN_TEXT_QUALITY || sparseRatio > 0.6) {
      console.log(`Native extraction weak (${cleanedJoined.length} chars, ${sparsePageCount}/${pageTexts.length} sparse pages). Running full vision OCR.`);
      const ocr = await ocrPdfWithVision(bytes, `This PDF has ${totalPages || "multiple"} pages. Process every page.`);
      if (ocr.trim().length < 50) throw new Error("Could not extract readable text from PDF.");
      return ocr;
    }

    // Mixed PDF: keep native pages, OCR only the sparse ones (whole doc, then merge as supplement).
    if (sparsePageCount > 0) {
      console.log(`Mixed PDF: ${sparsePageCount}/${pageTexts.length} pages look sparse. Augmenting with vision OCR.`);
      try {
        const ocrSupplement = await ocrPdfWithVision(
          bytes,
          `Some pages of this PDF are scanned images or have very little embedded text. Pay extra attention to those pages and transcribe their content fully.`,
        );
        const merged = `${pageTexts.join("\n\n")}\n\n--- SUPPLEMENTAL OCR ---\n\n${ocrSupplement}`;
        return merged.slice(0, MAX_TEXT);
      } catch (e) {
        console.warn("OCR supplement failed, falling back to native text:", e instanceof Error ? e.message : e);
      }
    }

    return pageTexts.join("\n\n").slice(0, MAX_TEXT);
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

function getCloudinaryFetchCandidates(storagePath: string, mimeType: string, filename: string): string[] {
  if (!/^https?:\/\//i.test(storagePath)) return [storagePath];

  try {
    const url = new URL(storagePath);
    const isCloudinary = /(^|\.)res\.cloudinary\.com$/i.test(url.hostname);
    if (!isCloudinary) return [storagePath];

    const lowerName = filename.toLowerCase();
    const isDocument =
      mimeType === "application/pdf" ||
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      mimeType === "text/plain" ||
      /\.(pdf|docx|txt)$/i.test(lowerName);

    if (!isDocument) return [storagePath];

    const rawUrl = new URL(storagePath);
    rawUrl.pathname = rawUrl.pathname.replace("/image/upload/", "/raw/upload/");

    return Array.from(new Set([storagePath, rawUrl.toString()]));
  } catch {
    return [storagePath];
  }
}

// Build a signed Cloudinary delivery URL when the asset is private/authenticated.
// Cloudinary delivery signatures are based on the URL path segments that come
// after the signature component: version/public_id(+ext), then SHA'd with the API secret,
// URL-safe base64 encoded, and truncated to 8 chars in `s--<sig>--` form.
async function signCloudinaryUrl(rawUrl: string): Promise<string | null> {
  const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET");
  if (!apiSecret) return null;

  try {
    const url = new URL(rawUrl);
    // Path looks like: /<cloud>/<resource_type>/<type>/[v123/]<public_id>
    // e.g. /dbqdcycdu/raw/upload/v1776923827/revisemaster/userId/abc.pdf
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 4) return null;
    const [, resourceType, deliveryType, ...rest] = parts;
    if (!resourceType || !deliveryType || rest.length === 0) return null;

    const toSign = `${rest.join("/")}${apiSecret}`;
    const sigBytes = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(toSign));
    const rawDigest = String.fromCharCode(...new Uint8Array(sigBytes));
    const signed = `s--${btoa(rawDigest).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "").slice(0, 8)}--`;

    // Insert the signature segment right after the delivery type.
    const newPath = `/${[parts[0], resourceType, deliveryType, signed, ...rest].join("/")}`;
    url.pathname = newPath;
    return url.toString();
  } catch {
    return null;
  }
}

async function getCloudinaryAssetMetadata(storagePath: string): Promise<{ exists: boolean } | null> {
  const apiKey = Deno.env.get("CLOUDINARY_API_KEY");
  const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET");
  if (!apiKey || !apiSecret || !/^https?:\/\//i.test(storagePath)) return null;

  try {
    const url = new URL(storagePath);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 4) return null;

    const [, resourceType, deliveryType, ...rest] = parts;
    const publicIdParts = rest[0]?.match(/^v\d+$/) ? rest.slice(1) : rest;
    if (!resourceType || !deliveryType || publicIdParts.length === 0) return null;

    const publicIdPath = publicIdParts.map((part) => encodeURIComponent(part)).join("/");
    const metaUrl = `https://api.cloudinary.com/v1_1/${parts[0]}/resources/${resourceType}/${deliveryType}/${publicIdPath}`;
    const resp = await fetch(metaUrl, {
      headers: { Authorization: `Basic ${btoa(`${apiKey}:${apiSecret}`)}` },
    });

    if (resp.ok) return { exists: true };
    if (resp.status === 404) return { exists: false };
    return null;
  } catch {
    return null;
  }
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

    // Download file. storage_path may be a legacy Cloudinary /image/upload/ PDF URL,
    // so we retry a normalized /raw/upload/ variant before failing.
    let bytes: Uint8Array;
    if (/^https?:\/\//i.test(doc.storage_path)) {
      const candidateUrls = getCloudinaryFetchCandidates(doc.storage_path, doc.mime_type, doc.filename);
      let response: Response | null = null;
      let resolvedUrl = doc.storage_path;
      let lastStatus: number | null = null;

      for (const candidateUrl of candidateUrls) {
        const resp = await fetch(candidateUrl);
        if (resp.ok) {
          response = resp;
          resolvedUrl = candidateUrl;
          break;
        }
        lastStatus = resp.status;
        console.warn(`Document fetch failed (${resp.status}) for ${candidateUrl}`);
      }

      // If Cloudinary returned 401/403, the asset is private/authenticated —
      // sign a delivery URL with the API secret and retry.
      if (!response && (lastStatus === 401 || lastStatus === 403)) {
        for (const candidateUrl of candidateUrls) {
          const signed = await signCloudinaryUrl(candidateUrl);
          if (!signed) continue;
          const resp = await fetch(signed);
          if (resp.ok) {
            response = resp;
            resolvedUrl = candidateUrl; // keep stored URL stable; signature is short-lived
            break;
          }
          lastStatus = resp.status;
          console.warn(`Signed Cloudinary fetch failed (${resp.status}) for ${candidateUrl}`);
        }
      }

      if (!response && (lastStatus === 401 || lastStatus === 403)) {
        const metadata = await getCloudinaryAssetMetadata(doc.storage_path);
        if (metadata?.exists) {
          const isPdf = doc.mime_type === "application/pdf" || /\.pdf$/i.test(doc.filename);
          if (isPdf) {
            throw new Error(
              "Cloudinary PDF delivery is disabled for this account. Enable PDF and ZIP file delivery in Cloudinary Settings → Security, then retry.",
            );
          }

          throw new Error(
            "Cloudinary is blocking delivery for this document type. Check Cloudinary Settings → Security, then retry.",
          );
        }
      }

      if (!response) throw new Error(`Failed to fetch file from URL: ${lastStatus ?? "unknown"}`);
      if (resolvedUrl !== doc.storage_path) {
        await admin.from("documents").update({ storage_path: resolvedUrl }).eq("id", documentId);
      }
      bytes = new Uint8Array(await response.arrayBuffer());
    } else {
      const { data: file, error: dlErr } = await admin.storage.from("documents").download(doc.storage_path);
      if (dlErr || !file) throw new Error(dlErr?.message ?? "Download failed");
      bytes = new Uint8Array(await file.arrayBuffer());
    }

    const text = await extractText(bytes, doc.mime_type, doc.filename);
    if (text.trim().length < 50) throw new Error("Document has too little text to generate cards.");

    let generated: GeneratedDeck;
    let usedFallback = false;
    let fallbackReason: string | null = null;
    try {
      generated = await generateDeckFromDocumentText({
        text,
        filename: doc.filename,
        requestChunkCards: (chunkInput) => requestChunkCards(chunkInput),
      });
      if (!generated.cards.length) throw new Error("AI returned no cards");
    } catch (aiErr) {
      const aiMsg = aiErr instanceof Error ? aiErr.message : String(aiErr);
      const isCreditOrRate =
        aiMsg.includes("AI credits exhausted") ||
        aiMsg.includes("AI rate limit") ||
        aiMsg.includes("AI gateway error") ||
        aiMsg.includes("AI did not return") ||
        aiMsg.includes("AI returned no cards") ||
        aiMsg.includes("LOVABLE_API_KEY");
      if (!isCreditOrRate) throw aiErr;

      console.warn("AI unavailable, falling back to rule-based generator:", aiMsg);
      generated = generateRuleBasedDeck({ text, filename: doc.filename });
      if (!generated.cards.length) {
        throw new Error(
          "AI is currently unavailable and the document didn't contain enough structured content to auto-generate cards. Try uploading clearer notes or create cards manually.",
        );
      }
      usedFallback = true;
      fallbackReason = aiMsg.includes("AI credits exhausted")
        ? "AI credits exhausted — generated rule-based cards instead."
        : "AI unavailable — generated rule-based cards instead.";
    }

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

    await admin
      .from("documents")
      .update({
        status: "ready",
        deck_id: deck.id,
        error: usedFallback ? fallbackReason : null,
      })
      .eq("id", documentId);

    return new Response(
      JSON.stringify({ ok: true, deckId: deck.id, cards: rows.length, usedFallback, fallbackReason }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    const code = msg.includes("AI credits exhausted")
      ? "AI_CREDITS_EXHAUSTED"
      : msg.includes("AI rate limit reached")
        ? "AI_RATE_LIMITED"
        : "PROCESSING_FAILED";
    const fallback = code === "PROCESSING_FAILED";

    console.error("process-document error:", msg);
    if (documentId) {
      await admin.from("documents").update({ status: "failed", error: msg }).eq("id", documentId);
    }
    return new Response(JSON.stringify({ ok: false, error: msg, code, fallback }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
