// Vercel capped request bodies at 4.5 MB; on our own server nothing does, and request.json() buffers
// whatever arrives. Every JSON body this app accepts is a few short fields.
const MAX_BODY_BYTES = 16 * 1024;

// jobs.whatrunsindia.com shares a site with the other *.whatrunsindia.com apps, so SameSite=Lax
// cookies ride along on requests those pages make. Browsers always send Sec-Fetch-Site; a client
// that doesn't has no session cookie to abuse.
const REFUSED_SITES = ["same-site", "cross-site"];

const fail = (status: number, error: string): [null, Response] => [null, Response.json({ error }, { status })];

// Reads a small JSON body sent by this site's own pages, or gives the error response to send instead.
export async function readJson<T>(request: Request, maxBytes = MAX_BODY_BYTES): Promise<[T, null] | [null, Response]> {
  if (REFUSED_SITES.includes(request.headers.get("sec-fetch-site") ?? "")) {
    return fail(403, "Cross-site request refused.");
  }
  if (Number(request.headers.get("content-length")) > maxBytes) return fail(413, "Request body too large.");

  // A chunked upload has no Content-Length, so count while reading too.
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body?.getReader();
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return fail(413, "Request body too large.");
    }
    chunks.push(value);
  }

  try {
    return [JSON.parse(Buffer.concat(chunks).toString("utf8")) as T, null];
  } catch {
    return fail(400, "Invalid JSON.");
  }
}
