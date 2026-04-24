import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type UploadSignatureRequest = {
  folder?: string;
  publicId?: string;
  resourceType: "image" | "raw" | "auto";
};

type UploadSignatureResponse = {
  apiKey: string;
  cloudName: string;
  folder?: string;
  publicId?: string;
  resourceType: "image" | "raw" | "auto";
  signature: string;
  timestamp: number;
};

function signParams(params: Record<string, string>, apiSecret: string) {
  const payload = Object.entries(params)
    .filter(([, value]) => value !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return crypto.subtle.digest("SHA-1", new TextEncoder().encode(`${payload}${apiSecret}`)).then((buffer) =>
    Array.from(new Uint8Array(buffer))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join(""),
  );
}

export const createCloudinaryUploadSignature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: UploadSignatureRequest) => input)
  .handler(async ({ data }) => {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME ?? "dbqdcycdu";
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!apiKey || !apiSecret) {
      throw new Error("Cloudinary server credentials are not configured.");
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const paramsToSign: Record<string, string> = {
      timestamp: String(timestamp),
      resource_type: data.resourceType,
    };

    if (data.folder) paramsToSign.folder = data.folder;
    if (data.publicId) paramsToSign.public_id = data.publicId;

    const signature = await signParams(paramsToSign, apiSecret);

    return {
      apiKey,
      cloudName,
      folder: data.folder,
      publicId: data.publicId,
      resourceType: data.resourceType,
      signature,
      timestamp,
    } satisfies UploadSignatureResponse;
  });