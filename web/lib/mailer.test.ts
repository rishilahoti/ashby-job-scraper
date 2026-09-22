import test from "node:test";
import assert from "node:assert/strict";
import { buildWelcomeEmail, buildAdminSignupNotification } from "./mailer.ts";

test("buildWelcomeEmail greets by name when available", () => {
  const { subject, text, html } = buildWelcomeEmail("Rishi");
  assert.match(subject, /Welcome/);
  assert.match(text, /Hi Rishi/);
  assert.match(html, /Hi Rishi/);
});

test("buildWelcomeEmail falls back to a generic greeting without a name", () => {
  const { text, html } = buildWelcomeEmail(null);
  assert.match(text, /Hi there/);
  assert.match(html, /Hi there/);
});

test("buildAdminSignupNotification includes the signed-up email", () => {
  const { subject, text, html } = buildAdminSignupNotification("new-user@example.com");
  assert.match(subject, /new-user@example\.com/);
  assert.match(text, /new-user@example\.com/);
  assert.match(html, /new-user@example\.com/);
});
