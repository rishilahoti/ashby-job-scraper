import test from "node:test";
import assert from "node:assert/strict";
import { loadJobsByIds } from "./useJobsByIds.ts";

test("loadJobsByIds chunks by 200, fetches each id once, and retries a failed batch", async () => {
  const requests: string[][] = [];
  let failNext = true;
  globalThis.fetch = (async (url: string) => {
    const ids = new URL(url, "http://x").searchParams.getAll("ids");
    requests.push(ids);
    if (failNext) {
      failNext = false;
      return new Response("", { status: 500 });
    }
    return Response.json({ data: ids.filter((id) => id !== "gone").map((jobId) => ({ jobId })) });
  }) as typeof fetch;

  assert.deepEqual(await loadJobsByIds(["a"]), { jobs: [], incomplete: true }); // 500: nothing cached
  const ids = ["a", "gone", ...Array.from({ length: 248 }, (_, i) => `j${i}`)];
  const all = await loadJobsByIds(ids);
  assert.equal(all.jobs.length, 249); // "a" retried, "gone" doesn't exist
  assert.equal(all.incomplete, false); // a job that doesn't exist isn't a failure
  assert.deepEqual(requests.slice(1).map((r) => r.length), [200, 50]);

  // Unmarking/reordering needs no network at all, and keeps the ids' order.
  assert.deepEqual((await loadJobsByIds(["j1", "gone", "a"])).jobs.map((j) => j.jobId), ["j1", "a"]);
  assert.equal(requests.length, 3);
});
