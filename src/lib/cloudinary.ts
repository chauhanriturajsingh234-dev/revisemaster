// Direct browser upload to Cloudinary using an unsigned upload preset.
// Cloud + preset are public values (safe in client code).

export const CLOUDINARY_CLOUD_NAME = "dbqdcycdu";
export const CLOUDINARY_UPLOAD_PRESET = "upload_preset";

export type CloudinaryUploadResult = {
  secure_url: string;
  public_id: string;
  resource_type: string;
  bytes: number;
  original_filename: string;
  format?: string;
};

/**
 * Uploads a file to Cloudinary as `raw` so PDFs/DOCX/TXT remain publicly fetchable.
 * Returns the secure_url to be stored as `documents.storage_path`.
 */
export async function uploadToCloudinary(file: File, folder?: string): Promise<CloudinaryUploadResult> {
  const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/raw/upload`;
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  if (folder) form.append("folder", folder);

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
