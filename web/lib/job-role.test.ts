import test from "node:test";
import assert from "node:assert/strict";
import { buildJobRoleSql, classifyJobRole } from "./job-role.ts";

test("classifyJobRole maps common role titles to categories", () => {
  assert.equal(classifyJobRole("Frontend Engineer"), "frontend");
  assert.equal(classifyJobRole("Platform Engineer"), "platform");
  assert.equal(classifyJobRole("Machine Learning Engineer"), "ml");
  assert.equal(classifyJobRole("Data Engineer"), "data");
  assert.equal(classifyJobRole("Full Stack Software Engineer"), "fullstack");
  assert.equal(classifyJobRole("Site Reliability Engineer"), "sre");
  assert.equal(classifyJobRole("Software Engineer, DevOps"), "devops");
});

test("classifyJobRole can use description text when the title is generic", () => {
  assert.equal(
    classifyJobRole("Software Engineer", "You will build React and Vue interfaces for the product"),
    "frontend"
  );
  assert.equal(
    classifyJobRole("Software Engineer", "Own Kubernetes, Terraform, and release engineering workflows"),
    "devops"
  );
  assert.equal(
    classifyJobRole("Software Engineer", "Join the site reliability engineering group and improve SRE automation"),
    "sre"
  );
});

test("buildJobRoleSql builds a role-specific SQL predicate", () => {
  const params: (string | number | boolean | string[])[] = [];
  const sql = buildJobRoleSql(params, "sre");

  assert.match(sql, /COALESCE\(title/);
  assert.match(sql, /~\*/);
  assert.equal(params.some((value) => String(value).includes("site reliability")), true);
  assert.equal(params.some((value) => String(value).includes("sre")), true);
  assert.equal(params.length > 0, true);
});

test("buildJobRoleSql includes description patterns", () => {
  const params: (string | number | boolean | string[])[] = [];
  const sql = buildJobRoleSql(params, "frontend");

  assert.match(sql, /COALESCE\(description/);
  assert.equal(params.some((value) => String(value).includes("react")), true);
  assert.equal(params.some((value) => String(value).includes("frontend")), true);
});
