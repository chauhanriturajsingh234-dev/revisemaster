import { supabase } from "@/integrations/supabase/client";

export const CLOUDINARY_CLOUD_NAME = "dbqdcycdu";

export type CloudinaryUploadResult = {
  secure_url: string;
  public_id: string;
  resource_type: string;
  bytes: number;
  original_filename: string;
  version?: number | string;
  format?: string;
  type?: string;
};

export type CloudinaryUploadKind = "image" | "document";

type CloudinarySignatureResponse = {
  apiKey: string;
  cloudName: string;
  folder?: string;
  publicId?: string;
  resourceType: "image" | "raw" | "auto";
  signature: string;
  timestamp: number;
};

function getUploadConfig(kind: CloudinaryUploadKind) {
  if (kind === "image") {
    return { endpointType: "image", resourceType: "image" as const };
  }

  return { endpointType: "raw", resourceType: "raw" as const };
}

async function fetchUploadSignature(input: {
  folder?: string;
  publicId?: string;
  resourceType: "image" | "raw" | "auto";
}): Promise<CloudinarySignatureResponse> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Please sign in before uploading files.");

  const res = await fetch("/api/cloudinary/signature", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    let detail = "";
    try {
      const json = await res.json();
      detail = json?.error ?? "";
    } catch {
      /* ignore */
    }
    throw new Error(detail || `Could not prepare upload (${res.status}).`);
  }

  return (await res.json()) as CloudinarySignatureResponse;
}

export async function uploadToCloudinary(
  file: File,
  options?: {
    folder?: string;
    publicId?: string;
    kind?: CloudinaryUploadKind;
  },
): Promise<CloudinaryUploadResult> {
  const kind = options?.kind ?? "document";
  const config = getUploadConfig(kind);
  const signed = await fetchUploadSignature({
    folder: options?.folder,
    publicId: options?.publicId,
    resourceType: config.resourceType,
  });

  const url = `https://api.cloudinary.com/v1_1/${signed.cloudName}/${config.endpointType}/upload`;
  const form = new FormData();
  form.append("file", file);
  form.append("api_key", signed.apiKey);
  form.append("timestamp", String(signed.timestamp));
  form.append("signature", signed.signature);
  if (signed.folder) form.append("folder", signed.folder);
  if (signed.publicId) form.append("public_id", signed.publicId);

  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = j?.error?.message ?? "";
    } catch {
      /* ignore */
    }
    throw new Error(`Cloudinary upload failed (${res.status})${detail ? `: ${detail}` : ""}`);
  }

  return (await res.json()) as CloudinaryUploadResult;
}
