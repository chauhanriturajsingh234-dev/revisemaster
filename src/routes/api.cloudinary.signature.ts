import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

type SignaturePayload = {
  folder?: string;
  publicId?: string;
  resourceType?: "image" | "raw" | "auto";
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function sha1Hex(input: string) {
  const buffer = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export const Route = createFileRoute("/api/cloudinary/signature")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authHeader = request.headers.get("authorization") ?? "";
          const token = authHeader.replace(/^Bearer\s+/i, "");
          if (!token) return json({ error: "Not authenticated." }, 401);

          const supabaseUrl = process.env.SUPABASE_URL;
          const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
          const apiKey = process.env.CLOUDINARY_API_KEY;
          const apiSecret = process.env.CLOUDINARY_API_SECRET;
          const cloudName = process.env.CLOUDINARY_CLOUD_NAME ?? "dbqdcycdu";

          if (!supabaseUrl || !publishableKey) return json({ error: "Auth service is not configured." }, 500);
          if (!apiKey || !apiSecret) return json({ error: "Cloudinary credentials are missing." }, 500);

          const supabase = createClient(supabaseUrl, publishableKey, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
          });

          const { data: userData, error: userError } = await supabase.auth.getUser(token);
          if (userError || !userData.user) return json({ error: "Invalid session." }, 401);

          const payload = (await request.json()) as SignaturePayload;
          const resourceType = payload.resourceType === "image" || payload.resourceType === "auto" ? payload.resourceType : "raw";
          const folder = typeof payload.folder === "string" ? payload.folder.slice(0, 200) : "";
          const publicId = typeof payload.publicId === "string" ? payload.publicId.slice(0, 255) : "";
          const timestamp = Math.floor(Date.now() / 1000);

          const params = [
            folder ? `folder=${folder}` : "",
            publicId ? `public_id=${publicId}` : "",
            `timestamp=${timestamp}`,
          ]
            .filter(Boolean)
            .sort()
            .join("&");

          const signature = await sha1Hex(`${params}${apiSecret}`);

          return json({
            apiKey,
            cloudName,
            folder: folder || undefined,
            publicId: publicId || undefined,
            resourceType,
            signature,
            timestamp,
          });
        } catch (error) {
          return json({ error: error instanceof Error ? error.message : "Failed to sign upload." }, 500);
        }
      },
    },
  },
});