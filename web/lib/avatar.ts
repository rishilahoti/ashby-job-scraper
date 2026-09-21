import crypto from "crypto";

// Fetched on demand, never stored — DiceBear renders deterministically from the
// seed, so the same email always gets the same placeholder avatar.
export function generatedAvatarUrl(email: string): string {
  const seed = crypto.createHash("sha256").update(email.toLowerCase().trim()).digest("hex");
  return `https://api.dicebear.com/9.x/glass/svg?seed=${seed}`;
}
