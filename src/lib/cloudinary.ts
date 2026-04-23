// Cloudinary configuration — publishable values, safe to ship to the browser.
// The unsigned upload preset must be created in the Cloudinary dashboard:
//   Settings → Upload → Upload presets → Add → Signing Mode: Unsigned
// And it MUST allow Resource Type "auto" (or "raw") so PDF/DOCX/TXT uploads work.
export const CLOUDINARY_CLOUD_NAME = "dbqdcycdu";
export const CLOUDINARY_UPLOAD_PRESET = "Testurself";

export type CloudinaryUploadResult = {
  secure_url: string;
  public_id: string;
  bytes: number;
  format: string;
  resource_type: string;
  original_filename: string;
};

/**
 * Upload a file directly from the browser to Cloudinary using an unsigned preset.
 * Uses resource_type=auto so PDFs/DOCX/TXT are stored as "raw" and images as "image".
 */
export async function uploadToCloudinary(
  file: File,
  opts?: { folder?: string; onProgress?: (pct: number) => void },
): Promise<CloudinaryUploadResult> {
  // Use "raw" for documents (PDF/DOCX/TXT) so the delivery URL is /raw/upload/
  // which is publicly fetchable. Cloudinary blocks PDF delivery via /image/upload/
  // by default (returns 401), which is why "auto" did not work for PDFs.
  const isImage = file.type.startsWith("image/");
  const resourceType = isImage ? "image" : "raw";
  const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`;
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  if (opts?.folder) form.append("folder", opts.folder);

  return await new Promise<CloudinaryUploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && opts?.onProgress) {
        opts.onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(json as CloudinaryUploadResult);
        else reject(new Error(json?.error?.message ?? `Cloudinary upload failed (${xhr.status})`));
      } catch {
        reject(new Error("Invalid Cloudinary response"));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(form);
  });
}
