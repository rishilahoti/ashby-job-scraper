import test from "node:test";
import assert from "node:assert/strict";
import { CHANGELOG, ANNOUNCED_ENTRY_ID, ANNOUNCED_ENTRY, shouldShowAnnouncement } from "./changelog.ts";

test("ANNOUNCED_ENTRY_ID points at a real entry", () => {
  assert.ok(ANNOUNCED_ENTRY);
  assert.equal(ANNOUNCED_ENTRY.id, ANNOUNCED_ENTRY_ID);
});

test("every entry has a non-empty title and description", () => {
  for (const entry of CHANGELOG) {
    assert.ok(entry.title.length > 0, `${entry.id} missing title`);
    assert.ok(entry.description.length > 0, `${entry.id} missing description`);
  }
});

test("shouldShowAnnouncement is false once the current announcement was seen", () => {
  assert.equal(shouldShowAnnouncement(ANNOUNCED_ENTRY_ID), false);
});

test("shouldShowAnnouncement is true for no prior value or a stale one", () => {
  assert.equal(shouldShowAnnouncement(null), true);
  assert.equal(shouldShowAnnouncement("some-old-entry"), true);
});
