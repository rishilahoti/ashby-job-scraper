import test from "node:test";
import assert from "node:assert/strict";
import { CHANGELOG, NOTIFICATIONS, SPONSOR_ID, parseDismissed, visibleNotifications } from "./changelog.ts";

test("every entry has a non-empty title and description", () => {
  for (const entry of CHANGELOG) {
    assert.ok(entry.title.length > 0, `${entry.id} missing title`);
    assert.ok(entry.description.length > 0, `${entry.id} missing description`);
  }
});

test("notifications: announced changelog entries first, sponsor last, ids unique", () => {
  assert.equal(NOTIFICATIONS.at(-1)!.id, SPONSOR_ID);
  for (const n of NOTIFICATIONS.slice(0, -1)) {
    assert.ok(CHANGELOG.some((e) => e.id === n.id), `${n.id} is not a changelog entry`);
    assert.ok(n.title.length > 0);
  }
  assert.equal(new Set(NOTIFICATIONS.map((n) => n.id)).size, NOTIFICATIONS.length);
});

test("parseDismissed: stored ids plus the old single-toast value; corrupt storage dismisses nothing", () => {
  assert.deepEqual([...parseDismissed('["a","b"]', null)], ["a", "b"]);
  assert.deepEqual([...parseDismissed(null, "auth")], ["auth"]);
  assert.deepEqual([...parseDismissed("{oops", null)], []);
  assert.deepEqual([...parseDismissed('{"a":1}', null)], []);
  assert.deepEqual([...parseDismissed('["a",2]', null)], ["a"]);
});

test("visibleNotifications: dismissing the top card brings the next forward; all dismissed shows none", () => {
  const all = visibleNotifications(new Set());
  assert.equal(all.length, NOTIFICATIONS.length);
  assert.equal(visibleNotifications(new Set([all[0].id]))[0].id, all[1].id);
  assert.deepEqual(visibleNotifications(new Set(NOTIFICATIONS.map((n) => n.id))), []);
});
