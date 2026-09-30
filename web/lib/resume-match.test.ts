import test from "node:test";
import assert from "node:assert/strict";
import { summarizeResume } from "./resume-match.ts";

test("summarizeResume extracts strong keywords and roles from resume text", () => {
  const summary = summarizeResume(
    "Senior software engineer with React, TypeScript, Node.js, Kubernetes, Terraform, and DevOps platform experience.",
    "Full Stack Engineer"
  );

  assert.equal(summary.roles.some((role) => role.role === "devops"), true);
  assert.equal(summary.roles.some((role) => role.role === "fullstack"), true);
  assert.equal(summary.keywords.includes("react"), true);
  assert.equal(summary.keywords.includes("typescript"), true);
});